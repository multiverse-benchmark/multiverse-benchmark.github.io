import { useState, useEffect, useCallback, useRef } from 'react'
import { requestedSnapshotRecord, reportMissingSnapshotRecord } from '@shared/snapshotNavigation'
import { useBackendAPI } from '@shared/hooks/useBackendAPI'
import { useReadOnly } from '@shared/contexts/ReadOnlyContext'

const APP_NAME = "GridwellMail"

// ============================================================
// Type Definitions
// ============================================================

interface UserProfile {
  emailAddress: string
  messagesTotal: number
  threadsTotal: number
  historyId: string
}

interface Label {
  id: string
  name: string
  type: 'system' | 'user'
  labelListVisibility?: string
  messageListVisibility?: string
  messagesTotal?: number
  messagesUnread?: number
  threadsTotal?: number
  threadsUnread?: number
  color?: {
    textColor?: string
    backgroundColor?: string
  }
}

interface MessagePayloadPart {
  mimeType: string
  filename?: string
  body?: {
    data?: string
    attachmentId?: string
    size?: number
  }
}

interface MessagePayload {
  mimeType: string
  headers?: Array<{ name: string; value: string }>
  body?: {
    data?: string
    attachmentId?: string
    size?: number
  }
  parts?: MessagePayloadPart[]
}

interface Message {
  id: string
  threadId: string
  raw?: string
  sender?: string
  recipient?: string
  cc?: string
  bcc?: string
  subject?: string
  body?: string
  date?: string
  internalDate?: string
  isRead?: boolean
  labelIds?: string[]
  snippet?: string
  sizeEstimate?: number
  payload?: MessagePayload
  headers?: Array<{ name: string; value: string }>
}

interface Thread {
  id: string
  messageIds?: string[]
  messages?: Message[]
  snippet?: string
  historyId?: string
}

interface Draft {
  id: string
  message: Message
}

interface SendAsAlias {
  sendAsEmail: string
  displayName?: string
  replyToAddress?: string
  signature?: string
  isDefault?: boolean
  isPrimary?: boolean
  treatAsAlias?: boolean
  verificationStatus?: string
  smtpMsa?: {
    host: string
    port: number
    username?: string
    password?: string
    securityMode?: string
  }
}

interface SmimeInfo {
  id: string
  sendAsEmail?: string
  issuerCn?: string
  subjectCn?: string
  pem?: string
  pkcs12?: string
  encryptedKeyPassword?: string
  expiration?: string
  isDefault?: boolean
}

interface VacationSettings {
  enableAutoReply: boolean
  responseSubject?: string
  responseBodyPlainText?: string
  responseBodyHtml?: string
  restrictToContacts?: boolean
  restrictToDomain?: boolean
  startTime?: string
  endTime?: string
}

interface AutoForwardingSettings {
  enabled: boolean
  emailAddress?: string
  disposition?: string
}

interface ImapSettings {
  enabled: boolean
  autoExpunge?: boolean
  expungeBehavior?: string
  maxFolderSize?: number
}

interface PopSettings {
  accessWindow?: string
  disposition?: string
}

interface LanguageSettings {
  displayLanguage?: string
}

interface AppProps {
  onClose: () => void
  setRefreshHandler?: (handler: (() => void) | null) => void
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Extract a header value from message headers.
 * Checks payload.headers first, then message-level headers.
 */
function getHeaderValue(message: Message | null | undefined, headerName: string): string | undefined {
  if (!message) return undefined

  // Try payload.headers first
  const payloadHeaders = Array.isArray(message.payload?.headers) ? message.payload.headers : []
  const payloadHeader = payloadHeaders.find(
    h => h.name.toLowerCase() === headerName.toLowerCase()
  )
  if (payloadHeader?.value) return payloadHeader.value

  // Try message-level headers
  const messageHeaders = Array.isArray(message.headers) ? message.headers : []
  const messageHeader = messageHeaders.find(
    h => h.name.toLowerCase() === headerName.toLowerCase()
  )
  if (messageHeader?.value) return messageHeader.value

  return undefined
}

/**
 * Extract the message body from the payload structure.
 * The body may be in payload.body.data or in payload.parts[].body.data (text/plain).
 */
function getBodyFromPayload(payload?: MessagePayload): string {
  if (!payload) return ''

  // Check parts first (multipart messages)
  if (payload.parts && payload.parts.length > 0) {
    const textPart = payload.parts.find(p => p.mimeType === 'text/plain' && p.body?.data)
    if (textPart?.body?.data) {
      try {
        return atob(textPart.body.data)
      } catch {
        return textPart.body.data
      }
    }
  }

  // Check direct body
  if (payload.body?.data) {
    try {
      return atob(payload.body.data)
    } catch {
      return payload.body.data
    }
  }

  return ''
}

/**
 * Get normalized message data, extracting from headers if top-level fields are missing.
 */
function getMessageData(message: Message | null | undefined) {
  if (!message) {
    return {
      sender: '',
      recipient: '',
      subject: '',
      body: '',
      date: '',
      isRead: false
    }
  }

  return {
    sender: message.sender || getHeaderValue(message, 'From') || '',
    recipient: message.recipient || getHeaderValue(message, 'To') || '',
    subject: message.subject || getHeaderValue(message, 'Subject') || '',
    body: message.body || getBodyFromPayload(message.payload) || message.snippet || '',
    date: message.date || getHeaderValue(message, 'Date') || message.internalDate || '',
    isRead: message.isRead ?? true
  }
}

function formatDate(dateString: string | number): string {
  if (!dateString) return ''

  let date: Date
  // Handle numeric timestamps (milliseconds or seconds)
  if (typeof dateString === 'number' || /^\d+$/.test(dateString)) {
    let timestamp = typeof dateString === 'number' ? dateString : parseInt(dateString, 10)
    // Normalize: if timestamp looks like microseconds (>= 1e15), convert to milliseconds
    if (timestamp >= 1e15) {
      timestamp = Math.floor(timestamp / 1000)
    }
    // Timestamps >= 1e12 are in milliseconds (any date after ~2001), else treat as seconds
    date = new Date(timestamp >= 1e12 ? timestamp : timestamp * 1000)
    // If still invalid, too old, or too far in the future, try the other interpretation
    if (isNaN(date.getTime()) || date.getFullYear() < 2000 || date.getFullYear() > 2100) {
      date = new Date(timestamp >= 1e12 ? timestamp / 1000 : timestamp * 1000)
    }
    // Final fallback: if still unreasonable, try dividing by 1000 once more
    if (date.getFullYear() > 2100) {
      date = new Date(Math.floor(timestamp / 1000))
    }
  } else {
    date = new Date(dateString)
  }

  if (isNaN(date.getTime())) return ''

  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()

  if (isToday) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  }

  const isThisYear = date.getFullYear() === now.getFullYear()
  if (isThisYear) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getInitials(email: string): string {
  if (!email) return '??'
  const name = email.split('@')[0]
  const parts = name.split(/[._-]/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

function getAvatarColor(email: string): string {
  const colors = [
    '#E11D48', '#0D9488', '#059669', '#F59E0B', '#9334E6',
    '#E91E63', '#00BCD4', '#FF5722', '#607D8B', '#795548'
  ]
  if (!email) return colors[0]
  let hash = 0
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

function getAttachments(payload?: MessagePayload): MessagePayloadPart[] {
  if (!payload?.parts) return []
  return payload.parts.filter(part => part.filename && part.body?.attachmentId)
}

// ============================================================
// Main App Component
// ============================================================

function App({ setRefreshHandler }: AppProps) {
  const readOnly = useReadOnly()
  const api = useBackendAPI('gridwell_mail')

  // Navigation state
  const [activeLabel, setActiveLabel] = useState<string>('INBOX')
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')

  // Data state
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [labels, setLabels] = useState<Label[]>([])
  const [threads, setThreads] = useState<Thread[]>([])
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null)
  const [drafts, setDrafts] = useState<Draft[]>([])

  // UI state
  const [loading, setLoading] = useState(true)
  const [threadLoading, setThreadLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeMode, setComposeMode] = useState<'new' | 'reply' | 'forward' | 'draft'>('new')
  const [composeDraftId, setComposeDraftId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Thread action state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  // Multi-select state
  const [selectedThreadIds, setSelectedThreadIds] = useState<Set<string>>(new Set())
  const [multiSelectMode, setMultiSelectMode] = useState(false)

  // Settings state
  const [settingsTab, setSettingsTab] = useState<'general' | 'sendas' | 'smime' | 'labels' | 'admin'>('general')

  // Settings data state
  const [vacationSettings, setVacationSettings] = useState<VacationSettings | null>(null)
  const [autoForwardingSettings, setAutoForwardingSettings] = useState<AutoForwardingSettings | null>(null)
  const [imapSettings, setImapSettings] = useState<ImapSettings | null>(null)
  const [popSettings, setPopSettings] = useState<PopSettings | null>(null)
  const [languageSettings, setLanguageSettings] = useState<LanguageSettings | null>(null)
  const [sendAsAliases, setSendAsAliases] = useState<SendAsAlias[]>([])
  const [smimeInfoList, setSmimeInfoList] = useState<SmimeInfo[]>([])
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsError, setSettingsError] = useState<string | null>(null)

  // Label CRUD state
  const [showCreateLabel, setShowCreateLabel] = useState(false)
  const [newLabelName, setNewLabelName] = useState('')
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null)
  const [editingLabelName, setEditingLabelName] = useState('')
  const [showDeleteLabelConfirm, setShowDeleteLabelConfirm] = useState<string | null>(null)

  // Send-As form state
  const [showSendAsForm, setShowSendAsForm] = useState(false)
  const [editingSendAs, setEditingSendAs] = useState<SendAsAlias | null>(null)
  const [sendAsFormEmail, setSendAsFormEmail] = useState('')
  const [sendAsFormDisplayName, setSendAsFormDisplayName] = useState('')
  const [sendAsFormReplyTo, setSendAsFormReplyTo] = useState('')
  const [sendAsFormSignature, setSendAsFormSignature] = useState('')

  // S/MIME form state
  const [showSmimeForm, setShowSmimeForm] = useState(false)
  const [smimeFormSendAsEmail, setSmimeFormSendAsEmail] = useState('')
  const [smimeFormPem, setSmimeFormPem] = useState('')
  const [smimeFormPkcs12, setSmimeFormPkcs12] = useState('')

  // Admin panel state
  const [historyRecords, setHistoryRecords] = useState<unknown[]>([])
  const [showImportForm, setShowImportForm] = useState(false)
  const [importTo, setImportTo] = useState('')
  const [importSubject, setImportSubject] = useState('')
  const [importBody, setImportBody] = useState('')
  const [showInsertForm, setShowInsertForm] = useState(false)
  const [insertTo, setInsertTo] = useState('')
  const [insertSubject, setInsertSubject] = useState('')
  const [insertBody, setInsertBody] = useState('')
  const [checkUserEmail, setCheckUserEmail] = useState('')
  const [checkUserResult, setCheckUserResult] = useState<string | null>(null)
  const [createUserEmail, setCreateUserEmail] = useState('')
  const [watchStatus, setWatchStatus] = useState<string | null>(null)

  // Label menu state for batch operations
  const [showLabelMenu, setShowLabelMenu] = useState(false)

  // Message multi-select state (for EmailPreview)
  const [messageMultiSelectMode, setMessageMultiSelectMode] = useState(false)
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set())
  const [showBatchDeleteMessagesConfirm, setShowBatchDeleteMessagesConfirm] = useState(false)

  // Pagination state
  const [pageSize, setPageSize] = useState(10)
  const [currentPage, setCurrentPage] = useState(1)

  // Read filter state: 'all' | 'unread' | 'read'
  const [readFilter, setReadFilter] = useState<'all' | 'unread' | 'read'>('all')

  // Compose form state
  const [composeTo, setComposeTo] = useState('')
  const [composeSubject, setComposeSubject] = useState('')
  const [composeBody, setComposeBody] = useState('')
  const [replyThreadId, setReplyThreadId] = useState<string | null>(null)

  // Draft management state
  const [draftSaving, setDraftSaving] = useState(false)
  const [showDeleteDraftConfirm, setShowDeleteDraftConfirm] = useState(false)

  // Thread cache for label switching (labelId -> Thread[])
  const threadCacheRef = useRef<Map<string, Thread[]>>(new Map())
  // AbortController ref for cancelling stale loadThreadsForLabel requests
  const loadThreadsAbortRef = useRef<AbortController | null>(null)

  const invalidateThreadCache = (labelId?: string) => {
    if (labelId) {
      threadCacheRef.current.delete(labelId)
    } else {
      threadCacheRef.current.clear()
    }
  }

  // ============================================================
  // Data Loading Functions (regular functions, not useCallback)
  // ============================================================

  const loadUserProfile = async () => {
    try {
      const result = await api.callTool('get_user_profile', { userId: 'me' })
      setUserProfile(result as UserProfile)
    } catch (err) {
      console.error('Failed to load user profile:', err)
    }
  }

  const loadLabels = async () => {
    try {
      const result = await api.callTool('list_labels', { userId: 'me' })
      const labelList = (result as { labels: Label[] }).labels || []
      setLabels(labelList)
    } catch (err) {
      console.error('Failed to load labels:', err)
    }
  }

  /** Refresh label and profile counters after state mutations */
  const refreshCounters = () => Promise.all([loadLabels(), loadUserProfile()])

  /** Remove SPAM label from all messages in a thread (must run before trashing from SPAM) */
  const removeSpamLabelsFromThread = async (threadId: string) => {
    const thread = threads.find(t => t.id === threadId)
    const msgs = thread?.messages?.filter(m => m && m.id) || []
    await Promise.allSettled(msgs.map(msg =>
      api.callTool('modify_message_labels', {
        userId: 'me', id: msg.id, removeLabelIds: ['SPAM']
      })
    ))
  }

  /** Mark messages as read: set isRead=true and remove UNREAD label */
  const markMsgsRead = (m: Message) => ({ ...m, isRead: true, labelIds: (m.labelIds || []).filter((l: string) => l !== 'UNREAD') })

  /** Create current timestamp fields for message payloads */
  const nowTimestampFields = () => ({ internalDate: String(Date.now()), date: new Date().toISOString() })

  const loadThreadsForLabel = async (labelId: string = 'INBOX', query?: string) => {
    // Cancel any previous in-flight request
    if (loadThreadsAbortRef.current) {
      loadThreadsAbortRef.current.abort()
    }
    const abortController = new AbortController()
    loadThreadsAbortRef.current = abortController

    try {
      // Check cache first (only when not searching)
      if (!query) {
        const cached = threadCacheRef.current.get(labelId)
        if (cached) {
          if (!abortController.signal.aborted) {
            setThreads(cached)
          }
          return
        }
      }

      // list_messages already returns full message payloads (sender, subject,
      // body, date, labelIds, payload). Group by threadId to build Thread
      // objects for the list view — one call replaces list_threads + N
      // get_thread calls. Full thread detail is still fetched on row click via
      // loadThread().
      const includeSpamTrash = labelId === 'TRASH' || labelId === 'SPAM'
      const params: Record<string, unknown> = {
        userId: 'me',
        labelIds: [labelId],
        include_spam_trash: includeSpamTrash,
        max_results: 100,
      }
      if (query) {
        params.q = query
      }
      const result = await api.callTool('list_messages', params)
      if (abortController.signal.aborted) return
      const messages = (result as { messages?: Message[] }).messages || []

      // Group messages by threadId, preserving the server's sort order
      // (list_messages returns newest first; the first threadId we see is the
      // newest thread).
      const threadOrder: string[] = []
      const byThread = new Map<string, Message[]>()
      for (const msg of messages) {
        const tid = msg.threadId
        if (!tid) continue
        let bucket = byThread.get(tid)
        if (!bucket) {
          bucket = []
          byThread.set(tid, bucket)
          threadOrder.push(tid)
        }
        bucket.push(msg)
      }

      const builtThreads: Thread[] = threadOrder.map(tid => {
        // Messages within a thread: oldest → newest, matching get_thread's
        // contract so the preview pane renders consistently.
        const msgs = (byThread.get(tid) || []).slice().sort((a, b) => {
          const da = Number(a.internalDate || 0)
          const db = Number(b.internalDate || 0)
          return da - db
        })
        const latest = msgs[msgs.length - 1]
        return {
          id: tid,
          messageIds: msgs.map(m => m.id),
          messages: msgs,
          snippet: (latest?.body || '').slice(0, 100),
        }
      })

      setThreads(builtThreads)
      if (!query) {
        threadCacheRef.current.set(labelId, builtThreads)
      }
    } catch (err) {
      if (!abortController.signal.aborted) {
        console.error('Failed to load threads:', err)
        setThreads([])
      }
    }
  }

  const loadDrafts = async () => {
    try {
      const result = await api.callTool('list_drafts', { userId: 'me' })
      const draftList = (result as { drafts: Draft[] }).drafts || []
      setDrafts(draftList)
    } catch (err) {
      console.error('Failed to load drafts:', err)
    }
  }

  const loadThread = async (threadId: string) => {
    setThreadLoading(true)
    try {
      const result = await api.callTool('get_thread', {
        userId: 'me',
        id: threadId,
        format: 'full'
      }) as Thread

      // get_thread with format='full' returns messages with all fields
      setSelectedThread(result)
    } catch (err) {
      console.error('Failed to load thread:', err)
      setSelectedThread(null)
      if (requestedSnapshotRecord('gridwell_mail') === threadId) reportMissingSnapshotRecord('gridwell_mail', threadId)
    } finally {
      setThreadLoading(false)
    }
  }

  const loadInitialData = async () => {
    setLoading(true)
    setError(null)
    try {
      await Promise.all([
        loadUserProfile(),
        loadLabels(),
        loadThreadsForLabel('INBOX'),
        loadDrafts()
      ])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  // ============================================================
  // Event Handlers
  // ============================================================

  const handleSearch = async (query: string) => {
    setSearchQuery(query)
    setSelectedThreadId(null)
    setSelectedThread(null)
    await loadThreadsForLabel(activeLabel, query || undefined)
  }

  const handleLabelClick = async (labelId: string) => {
    // Cancel any in-flight thread loading
    if (loadThreadsAbortRef.current) {
      loadThreadsAbortRef.current.abort()
    }
    setActiveLabel(labelId)
    setSelectedThreadId(null)
    setSelectedThread(null)
    setMultiSelectMode(false)
    setSelectedThreadIds(new Set())

    if (labelId === 'DRAFT') {
      await loadDrafts()
    } else {
      await loadThreadsForLabel(labelId)
    }
  }

  const handleThreadClick = async (threadId: string) => {
    setSelectedThreadId(threadId)
    await loadThread(threadId)
    if (readOnly) return

    // Mark entire thread as read
    const thread = threads.find(t => t.id === threadId)
    const hasUnread = thread?.messages?.some(m => !getMessageData(m).isRead)
    if (hasUnread) {
      // Immediately update local state so UI reflects read status
      setThreads(prev => prev.map(t => {
        if (t.id !== threadId) return t
        return { ...t, messages: t.messages?.map(markMsgsRead) }
      }))
      setSelectedThread(prev => prev ? { ...prev, messages: prev.messages?.map(markMsgsRead) } : null)

      // Persist to backend - modify each message individually to avoid draft errors
      const threadData = threads.find(t => t.id === threadId)
      const msgs = threadData?.messages?.filter(m => m && m.id && !m.labelIds?.includes('DRAFT')) || []
      Promise.all(msgs.map(msg =>
        api.callTool('modify_message_labels', {
          userId: 'me',
          id: msg.id,
          removeLabelIds: ['UNREAD']
        }).catch(() => { /* skip messages that can't be modified */ })
      )).then(() => {
        // Invalidate cache so next folder switch fetches fresh read state
        invalidateThreadCache()
        // Refresh label counters so sidebar unread badge updates
        refreshCounters()
      }).catch((err) => {
        console.error('Failed to mark thread as read:', err)
      })
    }
  }

  const handleCompose = () => {
    setComposeMode('new')
    setComposeDraftId(null)
    setComposeTo('')
    setComposeSubject('')
    setComposeBody('')
    setReplyThreadId(null)
    setComposeOpen(true)
  }

  const handleReply = (message: Message) => {
    const msgData = getMessageData(message)
    setComposeMode('reply')
    setComposeDraftId(null)
    setComposeTo(msgData.sender)
    setComposeSubject(msgData.subject.startsWith('Re:') ? msgData.subject : `Re: ${msgData.subject}`)
    setComposeBody(`\n\n--- Original Message ---\nFrom: ${msgData.sender}\nDate: ${formatDate(msgData.date)}\n\n${msgData.body}`)
    setReplyThreadId(message.threadId)
    setComposeOpen(true)
  }

  const handleForward = (message: Message) => {
    const msgData = getMessageData(message)
    setComposeMode('forward')
    setComposeDraftId(null)
    setComposeTo('')
    setComposeSubject(msgData.subject.startsWith('Fwd:') ? msgData.subject : `Fwd: ${msgData.subject}`)
    setComposeBody(`\n\n--- Forwarded Message ---\nFrom: ${msgData.sender}\nTo: ${msgData.recipient}\nDate: ${formatDate(msgData.date)}\nSubject: ${msgData.subject}\n\n${msgData.body}`)
    setReplyThreadId(null)
    setComposeOpen(true)
  }

  const clearComposeForm = () => {
    setComposeTo('')
    setComposeSubject('')
    setComposeBody('')
    setReplyThreadId(null)
    setComposeDraftId(null)
    setComposeMode('new')
  }

  const handleDraftClick = async (draft: Draft) => {
    // Use get_draft API to fetch full draft data
    try {
      const fullDraft = await api.callTool('get_draft', { userId: 'me', id: draft.id }) as Draft
      const msg = fullDraft?.message || draft.message
      const msgData = getMessageData(msg)
      setComposeMode('draft')
      setComposeDraftId(draft.id)
      setComposeTo(msgData.recipient || '')
      setComposeSubject(msgData.subject || '')
      setComposeBody(msgData.body || '')
      setReplyThreadId(null)
      setComposeOpen(true)
    } catch {
      // Fallback to basic draft data
      const msg = draft.message
      const msgData = getMessageData(msg)
      setComposeMode('draft')
      setComposeDraftId(draft.id)
      setComposeTo(msgData.recipient || '')
      setComposeSubject(msgData.subject || '')
      setComposeBody(msgData.body || '')
      setReplyThreadId(null)
      setComposeOpen(true)
    }
  }

  const handleSaveDraft = async () => {
    setDraftSaving(true)
    try {
      const draftPayload = {
        message: {
          sender: userProfile?.emailAddress || 'me',
          recipient: composeTo,
          subject: composeSubject,
          body: composeBody,
          ...nowTimestampFields()
        }
      }

      if (composeDraftId && composeMode === 'draft') {
        // Update existing draft
        await api.callTool('update_draft', {
          userId: 'me',
          id: composeDraftId,
          draft: draftPayload
        })
      } else {
        // Create new draft
        await api.callTool('create_draft', {
          userId: 'me',
          draft: draftPayload
        })
      }

      setComposeOpen(false)
      clearComposeForm()
      await loadDrafts()
      // Refresh counters after draft creation/update
      await refreshCounters()
    } catch (err) {
      console.error('Failed to save draft:', err)
    } finally {
      setDraftSaving(false)
    }
  }

  const handleRequestDeleteDraft = () => {
    setShowDeleteDraftConfirm(true)
  }

  const handleCancelDeleteDraft = () => {
    setShowDeleteDraftConfirm(false)
  }

  const handleConfirmDeleteDraft = async () => {
    if (!composeDraftId) return
    setActionLoading(true)
    try {
      await api.callTool('delete_draft', {
        userId: 'me',
        id: composeDraftId
      })
      setShowDeleteDraftConfirm(false)
      setComposeOpen(false)
      clearComposeForm()
      await loadDrafts()
      await refreshCounters()
    } catch (err) {
      console.error('Failed to delete draft:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleSendMessage = async () => {
    if (!composeTo.trim()) return

    try {
      // If sending a draft, use send_draft API
      if (composeMode === 'draft' && composeDraftId) {
        await api.callTool('send_draft', {
          userId: 'me',
          draft: { id: composeDraftId }
        })
      } else {
        const messagePayload: {
          sender: string
          recipient: string
          subject: string
          body: string
          threadId?: string
          labelIds?: string[]
          internalDate?: string
          date?: string
        } = {
          sender: userProfile?.emailAddress || 'me',
          recipient: composeTo,
          subject: composeSubject,
          body: composeBody,
          ...nowTimestampFields()
        }

        // For replies, include threadId to add message to existing thread
        // Only add SENT label, not the current folder's label
        if (composeMode === 'reply' && replyThreadId) {
          messagePayload.threadId = replyThreadId
          messagePayload.labelIds = ['SENT']
        }

        await api.callTool('send_message', { userId: 'me', msg: messagePayload })
      }

      // Save compose state before clearing (clearComposeForm resets these)
      const wasDraft = composeMode === 'draft'
      const wasReply = composeMode === 'reply'
      const savedReplyThreadId = replyThreadId

      setComposeOpen(false)
      clearComposeForm()

      // Refresh drafts if we were in draft mode
      if (wasDraft) {
        try { await loadDrafts() } catch (e) { console.error('Failed to refresh drafts:', e) }
      }

      // Refresh threads for current label (new content added, must re-fetch)
      // Wrap in try-catch to prevent blackscreen crashes
      try {
        invalidateThreadCache()
        await loadThreadsForLabel(activeLabel)
      } catch (e) { console.error('Failed to refresh threads:', e) }

      // If replying, reload the thread to show the new message
      if (wasReply && savedReplyThreadId) {
        try {
          await loadThread(savedReplyThreadId)
        } catch (e) { console.error('Failed to reload thread:', e) }
      }

      // Refresh labels and profile to update counters
      try { await refreshCounters() } catch (e) { console.error('Failed to refresh counters:', e) }
    } catch (err) {
      console.error('Failed to send message:', err)
    }
  }

  const handleCloseCompose = () => {
    setComposeOpen(false)
  }

  // ============================================================
  // Settings Handlers
  // ============================================================

  const loadAllSettings = async () => {
    setSettingsLoading(true)
    setSettingsError(null)
    try {
      const [vacation, forwarding, imap, pop, language, sendAs] = await Promise.all([
        api.callTool('get_vacation_settings', { userId: 'me' }).catch(() => null),
        api.callTool('get_auto_forwarding_settings', { userId: 'me' }).catch(() => null),
        api.callTool('get_imap_settings', { userId: 'me' }).catch(() => null),
        api.callTool('get_pop_settings', { userId: 'me' }).catch(() => null),
        api.callTool('get_language_settings', { userId: 'me' }).catch(() => null),
        api.callTool('list_send_as_aliases', { userId: 'me' }).catch(() => null)
      ])
      if (vacation) setVacationSettings(vacation as VacationSettings)
      if (forwarding) setAutoForwardingSettings(forwarding as AutoForwardingSettings)
      if (imap) setImapSettings(imap as ImapSettings)
      if (pop) setPopSettings(pop as PopSettings)
      if (language) setLanguageSettings(language as LanguageSettings)
      if (sendAs) {
        const list = (sendAs as { sendAs?: SendAsAlias[] }).sendAs || []
        setSendAsAliases(Array.isArray(list) ? list : [])
      }
    } catch (err) {
      setSettingsError('Failed to load settings')
      console.error('Failed to load settings:', err)
    } finally {
      setSettingsLoading(false)
    }
  }

  const handleSaveVacation = async (settings: VacationSettings) => {
    setSettingsSaving(true)
    try {
      await api.callTool('update_vacation_settings', { userId: 'me', vacation_settings: settings })
      // Re-fetch from backend to confirm persistence
      const fresh = await api.callTool('get_vacation_settings', { userId: 'me' }).catch(() => null)
      setVacationSettings((fresh as VacationSettings) || settings)
    } catch (err) { console.error('Failed to save vacation settings:', err) }
    finally { setSettingsSaving(false) }
  }

  const handleSaveAutoForwarding = async (settings: AutoForwardingSettings) => {
    setSettingsSaving(true)
    try {
      await api.callTool('update_auto_forwarding_settings', { userId: 'me', auto_forwarding_settings: settings })
      const fresh = await api.callTool('get_auto_forwarding_settings', { userId: 'me' }).catch(() => null)
      setAutoForwardingSettings((fresh as AutoForwardingSettings) || settings)
    } catch (err) { console.error('Failed to save forwarding settings:', err) }
    finally { setSettingsSaving(false) }
  }

  const handleSaveImap = async (settings: ImapSettings) => {
    setSettingsSaving(true)
    try {
      await api.callTool('update_imap_settings', { userId: 'me', imap_settings: settings })
      const fresh = await api.callTool('get_imap_settings', { userId: 'me' }).catch(() => null)
      setImapSettings((fresh as ImapSettings) || settings)
    } catch (err) { console.error('Failed to save IMAP settings:', err) }
    finally { setSettingsSaving(false) }
  }

  const handleSavePop = async (settings: PopSettings) => {
    setSettingsSaving(true)
    try {
      await api.callTool('update_pop_settings', { userId: 'me', pop_settings: settings })
      const fresh = await api.callTool('get_pop_settings', { userId: 'me' }).catch(() => null)
      setPopSettings((fresh as PopSettings) || settings)
    } catch (err) { console.error('Failed to save POP settings:', err) }
    finally { setSettingsSaving(false) }
  }

  const handleSaveLanguage = async (settings: LanguageSettings) => {
    setSettingsSaving(true)
    try {
      await api.callTool('update_language_settings', { userId: 'me', language_settings: settings })
      const fresh = await api.callTool('get_language_settings', { userId: 'me' }).catch(() => null)
      setLanguageSettings((fresh as LanguageSettings) || settings)
    } catch (err) { console.error('Failed to save language settings:', err) }
    finally { setSettingsSaving(false) }
  }

  // Send-As alias handlers
  const handleCreateSendAs = async () => {
    setSettingsSaving(true)
    try {
      await api.callTool('create_send_as_alias', {
        userId: 'me',
        send_as: {
          sendAsEmail: sendAsFormEmail,
          displayName: sendAsFormDisplayName,
          replyToAddress: sendAsFormReplyTo,
          signature: sendAsFormSignature
        }
      })
      setShowSendAsForm(false)
      setSendAsFormEmail('')
      setSendAsFormDisplayName('')
      setSendAsFormReplyTo('')
      setSendAsFormSignature('')
      const result = await api.callTool('list_send_as_aliases', { userId: 'me' })
      const list = (result as { sendAs?: SendAsAlias[] }).sendAs || []
      setSendAsAliases(Array.isArray(list) ? list : [])
    } catch (err) { console.error('Failed to create send-as alias:', err) }
    finally { setSettingsSaving(false) }
  }

  const handleUpdateSendAs = async () => {
    if (!editingSendAs) return
    setSettingsSaving(true)
    try {
      await api.callTool('update_send_as_alias', {
        userId: 'me',
        send_as_email: editingSendAs.sendAsEmail,
        send_as: {
          displayName: sendAsFormDisplayName,
          replyToAddress: sendAsFormReplyTo,
          signature: sendAsFormSignature
        }
      })
      setShowSendAsForm(false)
      setEditingSendAs(null)
      const result = await api.callTool('list_send_as_aliases', { userId: 'me' })
      const list = (result as { sendAs?: SendAsAlias[] }).sendAs || []
      setSendAsAliases(Array.isArray(list) ? list : [])
    } catch (err) { console.error('Failed to update send-as alias:', err) }
    finally { setSettingsSaving(false) }
  }

  const handleDeleteSendAs = async (email: string) => {
    setSettingsSaving(true)
    try {
      await api.callTool('delete_send_as_alias', { userId: 'me', send_as_email: email })
      setSendAsAliases(prev => prev.filter(a => a.sendAsEmail !== email))
    } catch (err) { console.error('Failed to delete send-as alias:', err) }
    finally { setSettingsSaving(false) }
  }

  const handleVerifySendAs = async (email: string) => {
    try {
      await api.callTool('verify_send_as_alias', { userId: 'me', send_as_email: email })
      const result = await api.callTool('list_send_as_aliases', { userId: 'me' })
      const list = (result as { sendAs?: SendAsAlias[] }).sendAs || []
      setSendAsAliases(Array.isArray(list) ? list : [])
    } catch (err) { console.error('Failed to verify send-as alias:', err) }
  }

  const handleMakeDefaultSendAs = async (email: string) => {
    try {
      await api.callTool('patch_send_as_alias', { userId: 'me', send_as_email: email, send_as: { isDefault: true } })
      const result = await api.callTool('list_send_as_aliases', { userId: 'me' })
      const list = (result as { sendAs?: SendAsAlias[] }).sendAs || []
      setSendAsAliases(Array.isArray(list) ? list : [])
    } catch (err) { console.error('Failed to set default send-as:', err) }
  }

  // S/MIME handlers
  const loadSmimeForAlias = async (email: string) => {
    try {
      const result = await api.callTool('list_send_as_smime_info', { userId: 'me', send_as_email: email })
      const list = (result as { smimeInfo?: SmimeInfo[] }).smimeInfo || []
      setSmimeInfoList(Array.isArray(list) ? list : [])
    } catch (err) {
      console.error('Failed to load S/MIME info:', err)
      setSmimeInfoList([])
    }
  }

  const handleCreateSmime = async () => {
    if (!smimeFormSendAsEmail) return
    setSettingsSaving(true)
    try {
      await api.callTool('insert_send_as_smime_info', {
        userId: 'me',
        send_as_email: smimeFormSendAsEmail,
        smime: {
          pem: smimeFormPem || undefined,
          pkcs12: smimeFormPkcs12 || undefined
        }
      })
      setShowSmimeForm(false)
      setSmimeFormPem('')
      setSmimeFormPkcs12('')
      await loadSmimeForAlias(smimeFormSendAsEmail)
    } catch (err) { console.error('Failed to create S/MIME:', err) }
    finally { setSettingsSaving(false) }
  }

  const handleDeleteSmime = async (sendAsEmail: string, smimeId: string) => {
    try {
      await api.callTool('delete_send_as_smime_info', { userId: 'me', send_as_email: sendAsEmail, id: smimeId })
      setSmimeInfoList(prev => prev.filter(s => s.id !== smimeId))
    } catch (err) { console.error('Failed to delete S/MIME:', err) }
  }

  const handleSetDefaultSmime = async (sendAsEmail: string, smimeId: string) => {
    try {
      await api.callTool('set_default_send_as_smime_info', { userId: 'me', send_as_email: sendAsEmail, id: smimeId })
      await loadSmimeForAlias(sendAsEmail)
    } catch (err) { console.error('Failed to set default S/MIME:', err) }
  }

  // Label CRUD handlers
  const handleCreateLabel = async () => {
    if (!newLabelName.trim()) return
    const trimmedName = newLabelName.trim()
    if (labels.some(l => l.name.toLowerCase() === trimmedName.toLowerCase())) {
      alert('A label with this name already exists.')
      return
    }
    setActionLoading(true)
    try {
      await api.callTool('create_label', {
        userId: 'me',
        label: { name: newLabelName.trim(), labelListVisibility: 'labelShow', messageListVisibility: 'show' }
      })
      setNewLabelName('')
      setShowCreateLabel(false)
      await refreshCounters()
    } catch (err) { console.error('Failed to create label:', err) }
    finally { setActionLoading(false) }
  }

  const handleUpdateLabel = async (labelId: string) => {
    if (!editingLabelName.trim()) return
    const trimmedName = editingLabelName.trim()
    // Prevent duplicate label names when editing
    if (labels.some(l => l.id !== labelId && l.name.toLowerCase() === trimmedName.toLowerCase())) {
      alert('A label with this name already exists.')
      return
    }
    setActionLoading(true)
    try {
      // Use update_label (full update) instead of patch_label to ensure name persists
      const currentLabel = labels.find(l => l.id === labelId)
      await api.callTool('update_label', {
        userId: 'me',
        id: labelId,
        label: {
          name: trimmedName,
          labelListVisibility: currentLabel?.labelListVisibility || 'labelShow',
          messageListVisibility: currentLabel?.messageListVisibility || 'show'
        }
      })
      setEditingLabelId(null)
      setEditingLabelName('')
      await loadLabels()
    } catch (err) {
      console.error('Failed to update label:', err)
      // Fallback to patch_label if update_label fails
      try {
        await api.callTool('patch_label', {
          userId: 'me',
          id: labelId,
          label: { name: trimmedName }
        })
        setEditingLabelId(null)
        setEditingLabelName('')
        await loadLabels()
      } catch (err2) { console.error('Fallback patch also failed:', err2) }
    }
    finally { setActionLoading(false) }
  }

  const handleDeleteLabel = async (labelId: string) => {
    setActionLoading(true)
    try {
      await api.callTool('delete_label', { userId: 'me', id: labelId })
      setShowDeleteLabelConfirm(null)
      if (activeLabel === labelId) setActiveLabel('INBOX')
      await refreshCounters()
    } catch (err) { console.error('Failed to delete label:', err) }
    finally { setActionLoading(false) }
  }

  // Per-message action handlers
  const handleTrashMessage = async (messageId: string) => {
    setActionLoading(true)
    try {
      // If trashing from SPAM, remove SPAM label FIRST (before trashing)
      if (activeLabel === 'SPAM') {
        try {
          await api.callTool('modify_message_labels', {
            userId: 'me', id: messageId, removeLabelIds: ['SPAM']
          })
        } catch { /* skip if modification fails */ }
      }
      await api.callTool('trash_message', { userId: 'me', id: messageId })
      if (selectedThreadId) await loadThread(selectedThreadId)
      // Optimistic: update labels on the message locally - remove current folder label + SPAM
      const labelsToRemove = ['INBOX', 'SPAM', 'SENT', 'STARRED', activeLabel]
      setThreads(prev => prev.map(t => ({
        ...t,
        messages: t.messages?.map(m =>
          m.id === messageId
            ? { ...m, labelIds: [...(m.labelIds || []).filter(l => !labelsToRemove.includes(l)), 'TRASH'] }
            : m
        )
      })).filter(t => activeLabel === 'TRASH' || t.messages?.some(m => m.labelIds?.includes(activeLabel))))
      invalidateThreadCache()
      await refreshCounters()
    } catch (err) { console.error('Failed to trash message:', err) }
    finally { setActionLoading(false) }
  }

  const handleUntrashMessage = async (messageId: string) => {
    setActionLoading(true)
    try {
      await api.callTool('untrash_message', { userId: 'me', id: messageId })
      if (selectedThreadId) await loadThread(selectedThreadId)
      // Optimistic: remove TRASH label, add back INBOX
      setThreads(prev => prev.map(t => ({
        ...t,
        messages: t.messages?.map(m =>
          m.id === messageId
            ? { ...m, labelIds: [...(m.labelIds || []).filter(l => l !== 'TRASH'), 'INBOX'] }
            : m
        )
      })).filter(t => activeLabel !== 'TRASH' || t.messages?.some(m => m.labelIds?.includes('TRASH'))))
      invalidateThreadCache()
    } catch (err) { console.error('Failed to untrash message:', err) }
    finally { setActionLoading(false) }
  }

  const handleDeleteMessage = async (messageId: string) => {
    setActionLoading(true)
    try {
      await api.callTool('delete_message', { userId: 'me', id: messageId })
      // Optimistic: remove the message, and remove thread if it has no messages left
      setThreads(prev => prev.map(t => ({
        ...t,
        messages: t.messages?.filter(m => m.id !== messageId)
      })).filter(t => (t.messages?.length ?? 0) > 0))
      // Also update selectedThread optimistically
      const remainingInSelected = selectedThread?.messages?.filter(m => m.id !== messageId) || []
      if (remainingInSelected.length === 0) {
        setSelectedThreadId(null)
        setSelectedThread(null)
      } else {
        setSelectedThread(prev => prev ? { ...prev, messages: prev.messages?.filter(m => m.id !== messageId) } : null)
      }
      // Invalidate cache and force reload to ensure persistence
      invalidateThreadCache()
      await refreshCounters()
      // Reload the current view to confirm deletion persisted
      try { await loadThreadsForLabel(activeLabel) } catch { /* ignore */ }
    } catch (err) { console.error('Failed to delete message:', err) }
    finally { setActionLoading(false) }
  }

  const handleModifyMessageLabels = async (messageId: string, addLabelIds: string[], removeLabelIds: string[]) => {
    setActionLoading(true)
    try {
      await api.callTool('modify_message_labels', {
        userId: 'me',
        id: messageId,
        addLabelIds,
        removeLabelIds
      })
      // Optimistic update on BOTH threads and selectedThread immediately
      const updateLabels = (m: Message) =>
        m.id === messageId
          ? { ...m, labelIds: [...new Set([...(m.labelIds || []).filter(l => !removeLabelIds.includes(l)), ...addLabelIds])] }
          : m
      setThreads(prev => prev.map(t => ({
        ...t,
        messages: t.messages?.map(updateLabels)
      })))
      setSelectedThread(prev => prev ? {
        ...prev,
        messages: prev.messages?.map(updateLabels)
      } : null)
      invalidateThreadCache()
      // Reload thread from backend to confirm
      if (selectedThreadId) {
        try { await loadThread(selectedThreadId) } catch { /* ignore */ }
      }
    } catch (err) { console.error('Failed to modify message labels:', err) }
    finally { setActionLoading(false) }
  }

  // Star/unstar thread handler
  const handleToggleStar = async (threadId: string) => {
    try {
      // Check if any message in the thread has STARRED label
      const thread = threads.find(t => t.id === threadId) || selectedThread
      const isStarred = thread?.messages?.some(m => m?.labelIds?.includes('STARRED')) || false
      // Modify each message individually to avoid errors with draft message IDs
      const messages = thread?.messages?.filter(m => m && m.id) || []
      for (const msg of messages) {
        try {
          if (isStarred) {
            await api.callTool('modify_message_labels', {
              userId: 'me',
              id: msg.id,
              removeLabelIds: ['STARRED']
            })
          } else {
            await api.callTool('modify_message_labels', {
              userId: 'me',
              id: msg.id,
              addLabelIds: ['STARRED']
            })
          }
        } catch { /* skip messages that can't be modified (e.g. drafts) */ }
      }
      // Optimistic: toggle STARRED label on all messages locally
      setThreads(prev => prev.map(t => {
        if (t.id !== threadId) return t
        return {
          ...t,
          messages: t.messages?.map(m => ({
            ...m,
            labelIds: isStarred
              ? (m.labelIds || []).filter(l => l !== 'STARRED')
              : [...(m.labelIds || []), 'STARRED']
          }))
        }
      }))
      if (selectedThread?.id === threadId) {
        setSelectedThread(prev => prev ? {
          ...prev,
          messages: prev.messages?.map(m => ({
            ...m,
            labelIds: isStarred
              ? (m.labelIds || []).filter(l => l !== 'STARRED')
              : [...(m.labelIds || []), 'STARRED']
          }))
        } : null)
      }
      invalidateThreadCache()
    } catch (err) { console.error('Failed to toggle star:', err) }
  }

  // Attachment download handler
  const handleDownloadAttachment = async (messageId: string, attachmentId: string, filename: string) => {
    try {
      const result = await api.callTool('get_message_attachment', {
        user_id: 'me',
        message_id: messageId,
        id: attachmentId
      }) as { data?: string; size?: number }
      if (result?.data) {
        const byteCharacters = atob(result.data.replace(/-/g, '+').replace(/_/g, '/'))
        const byteNumbers = new Array(byteCharacters.length)
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i)
        }
        const byteArray = new Uint8Array(byteNumbers)
        const blob = new Blob([byteArray])
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }
    } catch (err) { console.error('Failed to download attachment:', err) }
  }

  // Batch modify message labels
  const handleBatchModifyMessageLabels = async (addLabelIds: string[], removeLabelIds: string[]) => {
    if (selectedMessageIds.size === 0) return
    setActionLoading(true)
    try {
      await api.callTool('batch_modify_message_labels', {
        userId: 'me',
        ids: Array.from(selectedMessageIds),
        addLabelIds,
        removeLabelIds
      })
      const modifiedIds = new Set(selectedMessageIds)
      setSelectedMessageIds(new Set())
      setMessageMultiSelectMode(false)
      if (selectedThreadId) await loadThread(selectedThreadId)
      // Optimistic: update labels on affected messages
      setThreads(prev => prev.map(t => ({
        ...t,
        messages: t.messages?.map(m =>
          modifiedIds.has(m.id)
            ? { ...m, labelIds: [...(m.labelIds || []).filter(l => !removeLabelIds.includes(l)), ...addLabelIds] }
            : m
        )
      })))
      invalidateThreadCache()
    } catch (err) { console.error('Failed to batch modify labels:', err) }
    finally { setActionLoading(false) }
  }

  // Admin panel handlers
  const handleLoadHistory = async () => {
    try {
      const result = await api.callTool('list_history_records', { userId: 'me', start_history_id: '1' })
      const records = (result as { history?: unknown[] }).history || []
      setHistoryRecords(records)
    } catch (err) { console.error('Failed to load history:', err) }
  }

  const handleGetDraft = async (draftId: string) => {
    try {
      const result = await api.callTool('get_draft', { userId: 'me', id: draftId })
      console.log('Draft details:', result)
    } catch (err) { console.error('Failed to get draft:', err) }
  }

  const handleImportMessage = async () => {
    setSettingsSaving(true)
    try {
      await api.callTool('import_message', {
        userId: 'me',
        msg: { sender: userProfile?.emailAddress || 'me', recipient: importTo, subject: importSubject, body: importBody }
      })
      setShowImportForm(false)
      setImportTo('')
      setImportSubject('')
      setImportBody('')
      invalidateThreadCache()
      await loadThreadsForLabel(activeLabel)
    } catch (err) { console.error('Failed to import message:', err) }
    finally { setSettingsSaving(false) }
  }

  const handleInsertMessage = async () => {
    setSettingsSaving(true)
    try {
      await api.callTool('insert_message', {
        userId: 'me',
        msg: { sender: userProfile?.emailAddress || 'me', recipient: insertTo, subject: insertSubject, body: insertBody }
      })
      setShowInsertForm(false)
      setInsertTo('')
      setInsertSubject('')
      setInsertBody('')
      invalidateThreadCache()
      await loadThreadsForLabel(activeLabel)
    } catch (err) { console.error('Failed to insert message:', err) }
    finally { setSettingsSaving(false) }
  }

  const handleCheckUser = async () => {
    try {
      const result = await api.callTool('check_user_exists', { userId: checkUserEmail || 'me' })
      setCheckUserResult(JSON.stringify(result, null, 2))
    } catch (err) {
      setCheckUserResult('Error: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const handleCreateUser = async () => {
    if (!createUserEmail.trim()) return
    setSettingsSaving(true)
    try {
      await api.callTool('create_user', { userId: createUserEmail.trim() })
      setCreateUserEmail('')
    } catch (err) { console.error('Failed to create user:', err) }
    finally { setSettingsSaving(false) }
  }

  const handleWatchMailbox = async () => {
    try {
      // Try different parameter formats to handle backend validation
      let result: unknown
      try {
        result = await api.callTool('watch_user_mailbox', {
          userId: 'me',
          request: { topicName: 'projects/myproject/topics/gridwell_mail', labelIds: ['INBOX'] }
        })
      } catch {
        // Fallback: try without nesting in request object
        result = await api.callTool('watch_user_mailbox', { userId: 'me' })
      }
      setWatchStatus('Watch active: ' + JSON.stringify(result))
    } catch (err) { setWatchStatus('Error: ' + (err instanceof Error ? err.message : String(err))) }
  }

  const handleStopWatch = async () => {
    try {
      await api.callTool('stop_mailbox_watch', { userId: 'me' })
      setWatchStatus('Watch stopped')
    } catch (err) { setWatchStatus('Error stopping: ' + (err instanceof Error ? err.message : String(err))) }
  }

  const handleListMessages = async () => {
    try {
      const result = await api.callTool('list_messages', { userId: 'me', labelIds: [activeLabel] })
      console.log('Messages list:', result)
    } catch (err) { console.error('Failed to list messages:', err) }
  }

  // ============================================================
  // Thread Operation Handlers
  // ============================================================

  const handleTrashThread = async (threadId: string) => {
    setActionLoading(true)
    try {
      // If trashing from SPAM, remove SPAM label FIRST so it doesn't reappear
      if (activeLabel === 'SPAM') await removeSpamLabelsFromThread(threadId)

      await api.callTool('trash_thread', { userId: 'me', id: threadId })

      setSelectedThreadId(null)
      setSelectedThread(null)
      // Optimistic: remove thread from current view (unless viewing TRASH)
      if (activeLabel !== 'TRASH') {
        setThreads(prev => prev.filter(t => t.id !== threadId))
      }
      invalidateThreadCache()
      await refreshCounters()
    } catch (err) {
      console.error('Failed to trash thread:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleUntrashThread = async (threadId: string) => {
    setActionLoading(true)
    try {
      await api.callTool('untrash_thread', { userId: 'me', id: threadId })
      setSelectedThreadId(null)
      setSelectedThread(null)
      // Optimistic: remove thread from TRASH view
      if (activeLabel === 'TRASH') {
        setThreads(prev => prev.filter(t => t.id !== threadId))
      }
      invalidateThreadCache()
    } catch (err) {
      console.error('Failed to restore thread:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleRequestDeleteThread = (threadId: string) => {
    setShowDeleteConfirm(threadId)
  }

  const handleCancelDelete = () => {
    setShowDeleteConfirm(null)
  }

  const handleConfirmDeleteThread = async () => {
    if (!showDeleteConfirm) return
    const threadId = showDeleteConfirm
    setActionLoading(true)
    try {
      await api.callTool('delete_thread', { userId: 'me', id: threadId })
      setSelectedThreadId(null)
      setSelectedThread(null)
      setShowDeleteConfirm(null)
      // Optimistic: remove thread from local state
      setThreads(prev => prev.filter(t => t.id !== threadId))
      // Invalidate cache and force reload to confirm deletion persisted
      invalidateThreadCache()
      await refreshCounters()
      try { await loadThreadsForLabel(activeLabel) } catch { /* ignore */ }
    } catch (err) {
      console.error('Failed to delete thread:', err)
    } finally {
      setActionLoading(false)
    }
  }

  // ============================================================
  // Multi-Select Handlers
  // ============================================================

  const handleToggleMultiSelect = () => {
    setMultiSelectMode(!multiSelectMode)
    if (multiSelectMode) {
      setSelectedThreadIds(new Set())
    }
  }

  const handleToggleThreadSelection = (threadId: string) => {
    const newSelection = new Set(selectedThreadIds)
    if (newSelection.has(threadId)) {
      newSelection.delete(threadId)
    } else {
      newSelection.add(threadId)
    }
    setSelectedThreadIds(newSelection)
  }

  const handleBatchTrash = async () => {
    if (selectedThreadIds.size === 0) return
    setActionLoading(true)
    try {
      for (const threadId of selectedThreadIds) {
        if (activeLabel === 'TRASH') {
          // In Trash, permanently delete instead of trashing again
          await api.callTool('delete_thread', { userId: 'me', id: threadId })
        } else {
          // If trashing from SPAM, remove SPAM label from messages first
          if (activeLabel === 'SPAM') await removeSpamLabelsFromThread(threadId)
          await api.callTool('trash_thread', { userId: 'me', id: threadId })
        }
      }
      const trashedIds = new Set(selectedThreadIds)
      setSelectedThreadIds(new Set())
      setMultiSelectMode(false)
      // Optimistic: remove trashed threads from view
      setThreads(prev => prev.filter(t => !trashedIds.has(t.id)))
      invalidateThreadCache()
      await refreshCounters()
      // Force reload to confirm deletions persisted
      if (activeLabel === 'TRASH') {
        try { await loadThreadsForLabel(activeLabel) } catch { /* ignore */ }
      }
    } catch (err) {
      console.error('Failed to batch trash threads:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleBatchLabel = async (labelId: string) => {
    if (selectedThreadIds.size === 0) return
    setActionLoading(true)
    try {
      for (const threadId of selectedThreadIds) {
        const threadData = threads.find(t => t.id === threadId)
        const msgs = threadData?.messages?.filter(m => m && m.id) || []
        for (const msg of msgs) {
          try {
            await api.callTool('modify_message_labels', {
              userId: 'me',
              id: msg.id,
              addLabelIds: [labelId]
            })
          } catch { /* skip messages that can't be modified */ }
        }
      }
      const targetIds = new Set(selectedThreadIds)
      setSelectedThreadIds(new Set())
      setMultiSelectMode(false)
      setShowLabelMenu(false)
      // Optimistic: add label only to messages of selected threads
      setThreads(prev => prev.map(t =>
        targetIds.has(t.id)
          ? { ...t, messages: t.messages?.map(m => ({ ...m, labelIds: [...new Set([...(m.labelIds || []), labelId])] })) }
          : t
      ))
      invalidateThreadCache()
    } catch (err) {
      console.error('Failed to batch label threads:', err)
    } finally {
      setActionLoading(false)
    }
  }

  // ============================================================
  // Message Multi-Select Handlers
  // ============================================================

  const handleToggleMessageMultiSelect = () => {
    setMessageMultiSelectMode(!messageMultiSelectMode)
    if (messageMultiSelectMode) {
      setSelectedMessageIds(new Set())
    }
  }

  const handleToggleMessageSelection = (messageId: string) => {
    const newSelection = new Set(selectedMessageIds)
    if (newSelection.has(messageId)) {
      newSelection.delete(messageId)
    } else {
      newSelection.add(messageId)
    }
    setSelectedMessageIds(newSelection)
  }

  const handleRequestBatchDeleteMessages = () => {
    if (selectedMessageIds.size === 0) return
    setShowBatchDeleteMessagesConfirm(true)
  }

  const handleCancelBatchDeleteMessages = () => {
    setShowBatchDeleteMessagesConfirm(false)
  }

  const handleConfirmBatchDeleteMessages = async () => {
    if (selectedMessageIds.size === 0) return
    setActionLoading(true)
    try {
      await api.callTool('batch_delete_messages', {
        userId: 'me',
        ids: Array.from(selectedMessageIds)
      })
      const deletedIds = new Set(selectedMessageIds)
      setSelectedMessageIds(new Set())
      setMessageMultiSelectMode(false)
      setShowBatchDeleteMessagesConfirm(false)
      // Optimistic: remove deleted messages, remove threads with no messages
      setThreads(prev => prev.map(t => ({
        ...t,
        messages: t.messages?.filter(m => !deletedIds.has(m.id))
      })).filter(t => (t.messages?.length ?? 0) > 0))
      // Also update selectedThread
      const remainingInSelected = selectedThread?.messages?.filter(m => !deletedIds.has(m.id)) || []
      if (remainingInSelected.length === 0) {
        setSelectedThreadId(null)
        setSelectedThread(null)
      } else {
        setSelectedThread(prev => prev ? { ...prev, messages: prev.messages?.filter(m => !deletedIds.has(m.id)) } : null)
      }
      // Force reload to ensure deletions persist
      invalidateThreadCache()
      await refreshCounters()
      try { await loadThreadsForLabel(activeLabel) } catch { /* ignore */ }
    } catch (err) {
      console.error('Failed to batch delete messages:', err)
    } finally {
      setActionLoading(false)
    }
  }

  // ============================================================
  // Pagination Handlers
  // ============================================================

  const filteredThreads = readFilter === 'all' ? threads : threads.filter(thread => {
    const messages = thread.messages || []
    const hasUnread = messages.some(m => !getMessageData(m).isRead)
    return readFilter === 'unread' ? hasUnread : !hasUnread
  })
  const totalPages = Math.ceil(filteredThreads.length / pageSize) || 1
  const paginatedThreads = filteredThreads.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize)
    setCurrentPage(1) // Reset to first page
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)))
  }

  // ============================================================
  // Settings Handlers
  // ============================================================

  const handleRefresh = async () => {
    setSettingsOpen(false)
    await loadInitialData()
  }

  const handleOpenSettings = async () => {
    setSettingsOpen(true)
    await loadAllSettings()
  }

  // ============================================================
  // Effects
  // ============================================================

  // Use a ref to store the refresh function to avoid re-render loops with setRefreshHandler
  const refreshRef = useRef(() => loadInitialData())
  refreshRef.current = () => loadInitialData()

  useEffect(() => {
    const record = requestedSnapshotRecord('gridwell_mail')
    loadInitialData().then(() => {
      if (record) {
        setSelectedThreadId(record)
        loadThread(record)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Refresh handler for admin panel - uses ref to avoid infinite re-render loop
  // Empty deps array: register once on mount, clean up on unmount
  useEffect(() => {
    if (setRefreshHandler) {
      setRefreshHandler(() => refreshRef.current())
    }
    return () => {
      if (setRefreshHandler) setRefreshHandler(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (composeOpen) {
          setComposeOpen(false)
        }
        if (settingsOpen) {
          setSettingsOpen(false)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [composeOpen, settingsOpen])

  // ============================================================
  // Render Helpers
  // ============================================================

  const getUnreadCount = (labelId: string): number => {
    const label = labels.find(l => l.id === labelId)
    return label?.messagesUnread || 0
  }

  const getDisplayThreads = (): (Thread | Draft)[] => {
    if (activeLabel === 'DRAFT') {
      return drafts
    }
    return paginatedThreads
  }

  // ============================================================
  // Loading State
  // ============================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-[var(--bg-primary)]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-[#E11D48]/30 border-t-[#E11D48] rounded-full animate-spin" />
          <p className="text-[var(--text-secondary)]">Loading {APP_NAME}...</p>
        </div>
      </div>
    )
  }

  // ============================================================
  // Error State
  // ============================================================

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 bg-[var(--bg-primary)]">
        <p className="text-[var(--danger-color)]">{error}</p>
        <button
          className="px-4 py-2 bg-[#E11D48] hover:bg-[#E11D48] text-white rounded-lg transition-colors font-medium"
          onClick={loadInitialData}
        >
          Retry
        </button>
      </div>
    )
  }

  // ============================================================
  // Main Render
  // ============================================================

  return (
    <div className="flex flex-col h-full bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Header */}
      <Header
        userProfile={userProfile}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearch={handleSearch}
        onSettingsClick={handleOpenSettings}
      />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          labels={labels}
          activeLabel={activeLabel}
          onLabelClick={handleLabelClick}
          onCompose={handleCompose}
          getUnreadCount={getUnreadCount}
          showCreateLabel={showCreateLabel}
          newLabelName={newLabelName}
          editingLabelId={editingLabelId}
          editingLabelName={editingLabelName}
          showDeleteLabelConfirm={showDeleteLabelConfirm}
          onShowCreateLabel={() => setShowCreateLabel(true)}
          onCancelCreateLabel={() => { setShowCreateLabel(false); setNewLabelName('') }}
          onNewLabelNameChange={setNewLabelName}
          onCreateLabel={handleCreateLabel}
          onStartEditLabel={(id, name) => { setEditingLabelId(id); setEditingLabelName(name) }}
          onCancelEditLabel={() => { setEditingLabelId(null); setEditingLabelName('') }}
          onEditingLabelNameChange={setEditingLabelName}
          onUpdateLabel={handleUpdateLabel}
          onRequestDeleteLabel={(id) => setShowDeleteLabelConfirm(id)}
          onCancelDeleteLabel={() => setShowDeleteLabelConfirm(null)}
          onDeleteLabel={handleDeleteLabel}
        />

        {/* Email List */}
        <EmailList
          items={getDisplayThreads()}
          activeLabel={activeLabel}
          selectedId={selectedThreadId}
          onItemClick={handleThreadClick}
          onDraftClick={handleDraftClick}
          drafts={drafts}
          multiSelectMode={multiSelectMode}
          selectedThreadIds={selectedThreadIds}
          onToggleMultiSelect={handleToggleMultiSelect}
          onToggleThreadSelection={handleToggleThreadSelection}
          onBatchTrash={handleBatchTrash}
          onBatchLabel={handleBatchLabel}
          showLabelMenu={showLabelMenu}
          onToggleLabelMenu={() => setShowLabelMenu(!showLabelMenu)}
          pageSize={pageSize}
          currentPage={currentPage}
          totalPages={totalPages}
          onPageSizeChange={handlePageSizeChange}
          onPageChange={handlePageChange}
          readFilter={readFilter}
          onReadFilterChange={(f) => { setReadFilter(f); setCurrentPage(1) }}
          onToggleStar={handleToggleStar}
          labels={labels}
        />

        {/* Email Preview */}
        <EmailPreview
          thread={selectedThread}
          loading={threadLoading}
          activeLabel={activeLabel}
          onReply={handleReply}
          onForward={handleForward}
          onTrash={handleTrashThread}
          onUntrash={handleUntrashThread}
          onDeleteForever={handleRequestDeleteThread}
          actionLoading={actionLoading}
          messageMultiSelectMode={messageMultiSelectMode}
          selectedMessageIds={selectedMessageIds}
          onToggleMessageMultiSelect={handleToggleMessageMultiSelect}
          onToggleMessageSelection={handleToggleMessageSelection}
          onBatchDeleteMessages={handleRequestBatchDeleteMessages}
          onTrashMessage={handleTrashMessage}
          onUntrashMessage={handleUntrashMessage}
          onDeleteMessage={handleDeleteMessage}
          onModifyMessageLabels={handleModifyMessageLabels}
          onDownloadAttachment={handleDownloadAttachment}
          onBatchModifyMessageLabels={handleBatchModifyMessageLabels}
          labels={labels}
        />
      </div>

      {/* Compose Modal */}
      {composeOpen && (
        <ComposeModal
          mode={composeMode}
          to={composeTo}
          subject={composeSubject}
          body={composeBody}
          draftId={composeDraftId}
          draftSaving={draftSaving}
          onToChange={setComposeTo}
          onSubjectChange={setComposeSubject}
          onBodyChange={setComposeBody}
          onSend={handleSendMessage}
          onSaveDraft={handleSaveDraft}
          onDeleteDraft={handleRequestDeleteDraft}
          onClose={handleCloseCompose}
        />
      )}

      {/* Settings Panel */}
      {settingsOpen && (
        <SettingsPanel
          onClose={() => setSettingsOpen(false)}
          onRefresh={handleRefresh}
          settingsTab={settingsTab}
          onTabChange={setSettingsTab}
          settingsLoading={settingsLoading}
          settingsSaving={settingsSaving}
          settingsError={settingsError}
          vacationSettings={vacationSettings}
          autoForwardingSettings={autoForwardingSettings}
          imapSettings={imapSettings}
          popSettings={popSettings}
          languageSettings={languageSettings}
          sendAsAliases={sendAsAliases}
          smimeInfoList={smimeInfoList}
          onSaveVacation={handleSaveVacation}
          onSaveAutoForwarding={handleSaveAutoForwarding}
          onSaveImap={handleSaveImap}
          onSavePop={handleSavePop}
          onSaveLanguage={handleSaveLanguage}
          showSendAsForm={showSendAsForm}
          editingSendAs={editingSendAs}
          sendAsFormEmail={sendAsFormEmail}
          sendAsFormDisplayName={sendAsFormDisplayName}
          sendAsFormReplyTo={sendAsFormReplyTo}
          sendAsFormSignature={sendAsFormSignature}
          onShowSendAsForm={(alias) => {
            if (alias) {
              setEditingSendAs(alias)
              setSendAsFormEmail(alias.sendAsEmail)
              setSendAsFormDisplayName(alias.displayName || '')
              setSendAsFormReplyTo(alias.replyToAddress || '')
              setSendAsFormSignature(alias.signature || '')
            } else {
              setEditingSendAs(null)
              setSendAsFormEmail('')
              setSendAsFormDisplayName('')
              setSendAsFormReplyTo('')
              setSendAsFormSignature('')
            }
            setShowSendAsForm(true)
          }}
          onCloseSendAsForm={() => { setShowSendAsForm(false); setEditingSendAs(null) }}
          onSendAsFormEmailChange={setSendAsFormEmail}
          onSendAsFormDisplayNameChange={setSendAsFormDisplayName}
          onSendAsFormReplyToChange={setSendAsFormReplyTo}
          onSendAsFormSignatureChange={setSendAsFormSignature}
          onCreateSendAs={handleCreateSendAs}
          onUpdateSendAs={handleUpdateSendAs}
          onDeleteSendAs={handleDeleteSendAs}
          onVerifySendAs={handleVerifySendAs}
          onMakeDefaultSendAs={handleMakeDefaultSendAs}
          showSmimeForm={showSmimeForm}
          smimeFormSendAsEmail={smimeFormSendAsEmail}
          smimeFormPem={smimeFormPem}
          smimeFormPkcs12={smimeFormPkcs12}
          onShowSmimeForm={(email) => { setSmimeFormSendAsEmail(email); setShowSmimeForm(true) }}
          onCloseSmimeForm={() => { setShowSmimeForm(false); setSmimeFormPem(''); setSmimeFormPkcs12('') }}
          onSmimeFormPemChange={setSmimeFormPem}
          onSmimeFormPkcs12Change={setSmimeFormPkcs12}
          onCreateSmime={handleCreateSmime}
          onDeleteSmime={handleDeleteSmime}
          onSetDefaultSmime={handleSetDefaultSmime}
          onLoadSmimeForAlias={loadSmimeForAlias}
          historyRecords={historyRecords}
          onLoadHistory={handleLoadHistory}
          showImportForm={showImportForm}
          importTo={importTo}
          importSubject={importSubject}
          importBody={importBody}
          onShowImportForm={() => setShowImportForm(true)}
          onCloseImportForm={() => setShowImportForm(false)}
          onImportToChange={setImportTo}
          onImportSubjectChange={setImportSubject}
          onImportBodyChange={setImportBody}
          onImportMessage={handleImportMessage}
          showInsertForm={showInsertForm}
          insertTo={insertTo}
          insertSubject={insertSubject}
          insertBody={insertBody}
          onShowInsertForm={() => setShowInsertForm(true)}
          onCloseInsertForm={() => setShowInsertForm(false)}
          onInsertToChange={setInsertTo}
          onInsertSubjectChange={setInsertSubject}
          onInsertBodyChange={setInsertBody}
          onInsertMessage={handleInsertMessage}
          checkUserEmail={checkUserEmail}
          checkUserResult={checkUserResult}
          onCheckUserEmailChange={setCheckUserEmail}
          onCheckUser={handleCheckUser}
          createUserEmail={createUserEmail}
          onCreateUserEmailChange={setCreateUserEmail}
          onCreateUser={handleCreateUser}
          watchStatus={watchStatus}
          onWatchMailbox={handleWatchMailbox}
          onStopWatch={handleStopWatch}
          onListMessages={handleListMessages}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <DeleteConfirmDialog
          onCancel={handleCancelDelete}
          onConfirm={handleConfirmDeleteThread}
          loading={actionLoading}
        />
      )}

      {/* Batch Delete Messages Confirmation Dialog */}
      {showBatchDeleteMessagesConfirm && (
        <BatchDeleteMessagesConfirmDialog
          count={selectedMessageIds.size}
          onCancel={handleCancelBatchDeleteMessages}
          onConfirm={handleConfirmBatchDeleteMessages}
          loading={actionLoading}
        />
      )}

      {/* Delete Draft Confirmation Dialog */}
      {showDeleteDraftConfirm && (
        <DeleteDraftConfirmDialog
          onCancel={handleCancelDeleteDraft}
          onConfirm={handleConfirmDeleteDraft}
          loading={actionLoading}
        />
      )}
    </div>
  )
}

// ============================================================
// Header Component
// ============================================================

interface HeaderProps {
  userProfile: UserProfile | null
  searchQuery: string
  onSearchChange: (query: string) => void
  onSearch: (query: string) => void
  onSettingsClick: () => void
}

function Header({ userProfile, searchQuery, onSearchChange, onSearch, onSettingsClick }: HeaderProps) {
  return (
    <header className="flex items-center gap-4 px-4 py-2 bg-[var(--bg-secondary)] border-b border-[var(--border-color)]">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none">
          <path d="M22 6L12 13L2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6Z" fill="#E11D48"/>
          <path d="M22 6L12 13L2 6" stroke="#BE123C" strokeWidth="1.5"/>
          <path d="M2 6L12 13L22 6V4C22 2.9 21.1 2 20 2H4C2.9 2 2 2.9 2 4V6Z" fill="#F59E0B"/>
        </svg>
        <span className="text-xl font-medium text-[var(--text-primary)]">{APP_NAME}</span>
      </div>

      {/* Search Bar */}
      <div className="flex-1 mx-4">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search mail"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSearch(searchQuery) }}
            className="w-full pl-10 pr-4 py-2 bg-[var(--bg-tertiary)] border border-transparent rounded-lg
                     text-[var(--text-primary)] placeholder-[var(--text-secondary)]
                     focus:bg-[var(--bg-secondary)] focus:border-[var(--border-color)] focus:outline-none
                     transition-colors"
          />
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-2">
        {/* Settings Button */}
        <button
          onClick={onSettingsClick}
          aria-label="Settings"
          data-testid="settings-button"
          className="p-2 hover:bg-[var(--bg-tertiary)] rounded-full transition-colors"
        >
          <svg className="w-5 h-5 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        {/* User Profile */}
        {userProfile && (
          <div className="flex items-center gap-2 px-2 py-1 rounded-full hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
              style={{ backgroundColor: getAvatarColor(userProfile.emailAddress) }}
            >
              {getInitials(userProfile.emailAddress)}
            </div>
            <span className="text-sm text-[var(--text-primary)] hidden sm:block">
              {userProfile.emailAddress}
            </span>
          </div>
        )}
      </div>
    </header>
  )
}

// ============================================================
// Sidebar Component
// ============================================================

interface SidebarProps {
  labels: Label[]
  activeLabel: string
  onLabelClick: (labelId: string) => void
  onCompose: () => void
  getUnreadCount: (labelId: string) => number
  showCreateLabel: boolean
  newLabelName: string
  editingLabelId: string | null
  editingLabelName: string
  showDeleteLabelConfirm: string | null
  onShowCreateLabel: () => void
  onCancelCreateLabel: () => void
  onNewLabelNameChange: (name: string) => void
  onCreateLabel: () => void
  onStartEditLabel: (id: string, name: string) => void
  onCancelEditLabel: () => void
  onEditingLabelNameChange: (name: string) => void
  onUpdateLabel: (id: string) => void
  onRequestDeleteLabel: (id: string) => void
  onCancelDeleteLabel: () => void
  onDeleteLabel: (id: string) => void
}

function Sidebar({ labels, activeLabel, onLabelClick, onCompose, getUnreadCount,
  showCreateLabel, newLabelName, editingLabelId, editingLabelName, showDeleteLabelConfirm,
  onShowCreateLabel, onCancelCreateLabel, onNewLabelNameChange, onCreateLabel,
  onStartEditLabel, onCancelEditLabel, onEditingLabelNameChange, onUpdateLabel,
  onRequestDeleteLabel, onCancelDeleteLabel, onDeleteLabel
}: SidebarProps) {
  // System labels to show in order
  const systemLabelOrder = ['INBOX', 'STARRED', 'SENT', 'DRAFT', 'TRASH', 'SPAM']

  const systemLabels = systemLabelOrder
    .map(id => labels.find(l => l.id === id))
    .filter((l): l is Label => l !== undefined)

  const userLabels = labels.filter(l => l.type === 'user')

  const getLabelIcon = (labelId: string) => {
    switch (labelId) {
      case 'INBOX':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        )
      case 'STARRED':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        )
      case 'SENT':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        )
      case 'DRAFT':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        )
      case 'TRASH':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        )
      case 'SPAM':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        )
      default:
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
        )
    }
  }

  const getLabelDisplayName = (label: Label): string => {
    if (label.id === 'DRAFT') return 'Drafts'
    return label.name
  }

  return (
    <aside className="w-[200px] flex-shrink-0 bg-[var(--bg-secondary)] border-r border-[var(--border-color)] overflow-y-auto">
      {/* Compose Button */}
      <div className="p-3">
        <button
          onClick={onCompose}
          className="flex items-center gap-3 w-full px-6 py-3 bg-[#E11D48] hover:bg-[#E11D48]
                   text-white rounded-2xl shadow-md hover:shadow-lg transition-all font-medium"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Compose
        </button>
      </div>

      {/* System Labels */}
      <nav className="px-2">
        {systemLabels.map(label => {
          const unreadCount = getUnreadCount(label.id)
          const isActive = activeLabel === label.id

          return (
            <button
              key={label.id}
              onClick={() => onLabelClick(label.id)}
              data-active={isActive}
              className={`flex items-center gap-3 w-full px-3 py-2 rounded-r-full text-left transition-colors
                ${isActive
                  ? 'bg-[#FFF1F2] text-[#BE123C]'
                  : 'hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                }`}
            >
              <span className={isActive ? 'text-[#BE123C]' : 'text-[var(--text-secondary)]'}>
                {getLabelIcon(label.id)}
              </span>
              <span className="flex-1 truncate">{getLabelDisplayName(label)}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{label.id}]</span></span>
              {unreadCount > 0 && (
                <span className={`text-xs font-medium ${isActive ? 'text-[#BE123C]' : 'text-[var(--text-secondary)]'}`}>
                  {unreadCount}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* User Labels */}
      <div className="px-4 py-2 mt-4 flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
          Labels
        </span>
        <button
          onClick={onShowCreateLabel}
          data-testid="create-label-button"
          className="p-1 hover:bg-[var(--bg-tertiary)] rounded transition-colors"
          title="Create label"
        >
          <svg className="w-4 h-4 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Create Label Form */}
      {showCreateLabel && (
        <div className="px-3 py-2" data-testid="create-label-form">
          <input
            type="text"
            value={newLabelName}
            onChange={(e) => onNewLabelNameChange(e.target.value)}
            placeholder="New label name"
            data-testid="new-label-input"
            className="w-full px-2 py-1 text-sm bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[#0D9488]"
            onKeyDown={(e) => { if (e.key === 'Enter') onCreateLabel(); if (e.key === 'Escape') onCancelCreateLabel() }}
            autoFocus
          />
          <div className="flex gap-1 mt-1">
            <button onClick={onCreateLabel} className="px-2 py-1 text-xs bg-[#0D9488] text-white rounded hover:bg-[#0F766E]">Create</button>
            <button onClick={onCancelCreateLabel} className="px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] rounded">Cancel</button>
          </div>
        </div>
      )}

      <nav className="px-2">
        {userLabels.map(label => {
          const isActive = activeLabel === label.id
          const isEditing = editingLabelId === label.id
          const isDeleting = showDeleteLabelConfirm === label.id

          if (isEditing) {
            return (
              <div key={label.id} className="px-1 py-1" data-testid="edit-label-form">
                <input
                  type="text"
                  value={editingLabelName}
                  onChange={(e) => onEditingLabelNameChange(e.target.value)}
                  className="w-full px-2 py-1 text-sm bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[#0D9488]"
                  onKeyDown={(e) => { if (e.key === 'Enter') onUpdateLabel(label.id); if (e.key === 'Escape') onCancelEditLabel() }}
                  autoFocus
                />
                <div className="flex gap-1 mt-1">
                  <button onClick={() => onUpdateLabel(label.id)} className="px-2 py-1 text-xs bg-[#0D9488] text-white rounded hover:bg-[#0F766E]">Save</button>
                  <button onClick={onCancelEditLabel} className="px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] rounded">Cancel</button>
                </div>
              </div>
            )
          }

          if (isDeleting) {
            return (
              <div key={label.id} className="px-3 py-2 bg-red-50 dark:bg-red-900/20 rounded" data-testid="delete-label-confirm">
                <p className="text-xs text-[var(--text-primary)] mb-1">Delete "{label.name}"?</p>
                <div className="flex gap-1">
                  <button onClick={() => onDeleteLabel(label.id)} className="px-2 py-1 text-xs bg-[var(--danger-color)] text-white rounded hover:bg-[#BE123C]">Delete</button>
                  <button onClick={onCancelDeleteLabel} className="px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] rounded">Cancel</button>
                </div>
              </div>
            )
          }

          return (
            <div
              key={label.id}
              className={`group flex items-center gap-3 w-full px-3 py-2 rounded-r-full transition-colors cursor-pointer
                ${isActive
                  ? 'bg-[#FFF1F2] text-[#BE123C]'
                  : 'hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                }`}
            >
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: label.color?.backgroundColor || '#9334E6' }}
                onClick={() => onLabelClick(label.id)}
              />
              <span className="flex-1 truncate" onClick={() => onLabelClick(label.id)}>{label.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{label.id}]</span></span>
              <div className="hidden group-hover:flex items-center gap-0.5">
                <button
                  onClick={(e) => { e.stopPropagation(); onStartEditLabel(label.id, label.name) }}
                  className="p-0.5 hover:bg-[var(--bg-secondary)] rounded"
                  title="Rename"
                >
                  <svg className="w-3 h-3 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onRequestDeleteLabel(label.id) }}
                  className="p-0.5 hover:bg-[var(--bg-secondary)] rounded"
                  title="Delete"
                >
                  <svg className="w-3 h-3 text-[var(--danger-color)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )
        })}
      </nav>
    </aside>
  )
}

// ============================================================
// Email List Component
// ============================================================

interface EmailListProps {
  items: (Thread | Draft)[]
  activeLabel: string
  selectedId: string | null
  onItemClick: (id: string) => void
  onDraftClick: (draft: Draft) => void
  drafts: Draft[]
  multiSelectMode: boolean
  selectedThreadIds: Set<string>
  onToggleMultiSelect: () => void
  onToggleThreadSelection: (threadId: string) => void
  onBatchTrash: () => void
  onBatchLabel: (labelId: string) => void
  showLabelMenu: boolean
  onToggleLabelMenu: () => void
  pageSize: number
  currentPage: number
  totalPages: number
  onPageSizeChange: (size: number) => void
  onPageChange: (page: number) => void
  readFilter: 'all' | 'unread' | 'read'
  onReadFilterChange: (filter: 'all' | 'unread' | 'read') => void
  onToggleStar: (threadId: string) => void
  labels: Label[]
}

function EmailList({
  items,
  activeLabel,
  selectedId,
  onItemClick,
  onDraftClick,
  drafts,
  multiSelectMode,
  selectedThreadIds,
  onToggleMultiSelect,
  onToggleThreadSelection,
  onBatchTrash,
  onBatchLabel,
  showLabelMenu,
  onToggleLabelMenu,
  pageSize,
  currentPage,
  totalPages,
  onPageSizeChange,
  onPageChange,
  readFilter,
  onReadFilterChange,
  onToggleStar,
  labels
}: EmailListProps) {
  const isDraftView = activeLabel === 'DRAFT'

  const getItemData = (item: Thread | Draft) => {
    if (isDraftView) {
      const draft = item as Draft
      const msgData = getMessageData(draft.message)
      return {
        id: draft.message.threadId || draft.id,
        subject: msgData.subject || '(No Subject)',
        sender: msgData.recipient || 'Draft',
        snippet: msgData.body || '',
        date: msgData.date || '',
        isUnread: false,
        hasAttachment: !!draft.message.payload?.parts?.some(p => p.filename),
        isStarred: false
      }
    } else {
      const thread = item as Thread
      const messages = thread.messages || []
      const latestMessage = messages.length > 0 ? messages[messages.length - 1] : null
      const msgData = getMessageData(latestMessage)

      // If no message data, try to extract info from thread snippet
      let subject = msgData.subject
      if (!subject && thread.snippet) {
        // Use snippet as a fallback subject hint
        subject = thread.snippet.slice(0, 50) + (thread.snippet.length > 50 ? '...' : '')
      }

      return {
        id: thread.id,
        subject: subject || '(No Subject)',
        sender: msgData.sender || '(Unknown Sender)',
        snippet: thread.snippet || msgData.body || '',
        date: msgData.date || '',
        isUnread: messages.some(m => !getMessageData(m).isRead),
        hasAttachment: latestMessage?.payload?.parts?.some(p => p.filename) || false,
        isStarred: messages.some(m => m?.labelIds?.includes('STARRED'))
      }
    }
  }

  if (items.length === 0) {
    return (
      <div className="w-[350px] flex-shrink-0 flex flex-col relative border-r border-[var(--border-color)] bg-[var(--bg-secondary)]" data-testid="thread-list">
        {/* Multi-select toolbar (same as non-empty) */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border-color)]">
          <button
            onClick={onToggleMultiSelect}
            data-testid="multi-select-toggle"
            className={`p-2 rounded transition-colors ${multiSelectMode ? 'bg-[#CCFBF1] dark:bg-[#115E59]' : 'hover:bg-[var(--bg-tertiary)]'}`}
            title={multiSelectMode ? 'Exit selection mode' : 'Select multiple'}
          >
            <svg className="w-5 h-5 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </button>
          <select
            data-testid="read-filter"
            value={readFilter}
            onChange={(e) => onReadFilterChange(e.target.value as 'all' | 'unread' | 'read')}
            className="ml-auto px-2 py-1 text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[#0D9488]"
          >
            <option value="all">All</option>
            <option value="unread">Unread</option>
            <option value="read">Read</option>
          </select>
        </div>
        {/* Empty state */}
        <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-secondary)]">
          <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
          <p className="text-lg">No messages</p>
          <p className="text-sm mt-1">This label has no messages</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="w-[350px] flex-shrink-0 flex flex-col border-r border-[var(--border-color)] bg-[var(--bg-secondary)]"
      data-testid="thread-list"
    >
      {/* Multi-select toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border-color)]">
        <button
          onClick={onToggleMultiSelect}
          data-testid="multi-select-toggle"
          className={`p-2 rounded transition-colors ${multiSelectMode ? 'bg-[#CCFBF1] dark:bg-[#115E59]' : 'hover:bg-[var(--bg-tertiary)]'}`}
          title={multiSelectMode ? 'Exit selection mode' : 'Select multiple'}
        >
          <svg className="w-5 h-5 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        </button>

        {multiSelectMode && selectedThreadIds.size > 0 && (
          <>
            <span className="text-sm text-[var(--text-secondary)]" data-testid="selection-count">
              {selectedThreadIds.size} selected
            </span>
            <button
              onClick={onBatchTrash}
              data-testid="batch-trash-button"
              className="p-2 hover:bg-[var(--bg-tertiary)] rounded transition-colors"
              title="Move to Trash"
            >
              <svg className="w-5 h-5 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
            <div className="relative">
              <button
                onClick={onToggleLabelMenu}
                data-testid="batch-label-button"
                className="p-2 hover:bg-[var(--bg-tertiary)] rounded transition-colors"
                title="Manage Labels"
              >
                <svg className="w-5 h-5 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
              </button>
              {/* Label Menu Dropdown - Include custom labels */}
              {showLabelMenu && (
                <div
                  data-testid="label-menu"
                  className="absolute top-full left-0 mt-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg shadow-lg z-10 py-1 min-w-[150px] max-h-[300px] overflow-y-auto"
                >
                  <div className="px-3 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Add Label</div>
                  <button onClick={() => onBatchLabel('STARRED')} className="w-full px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]">
                    STARRED
                  </button>
                  <button onClick={() => onBatchLabel('IMPORTANT')} className="w-full px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]">
                    IMPORTANT
                  </button>
                  {labels.filter(l => l.type === 'user').map(l => (
                    <button key={l.id} onClick={() => onBatchLabel(l.id)} className="w-full px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]">
                      {l.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
        <select
          data-testid="read-filter"
          value={readFilter}
          onChange={(e) => onReadFilterChange(e.target.value as 'all' | 'unread' | 'read')}
          className="ml-auto px-2 py-1 text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[#0D9488]"
        >
          <option value="all">All</option>
          <option value="unread">Unread</option>
          <option value="read">Read</option>
        </select>
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto">
      {items.map(item => {
        const data = getItemData(item)
        const isSelected = selectedId === data.id

        // Build background class - selected thread gets highlight, others get hover effect
        const bgClass = isSelected
          ? 'bg-[#CCFBF1] dark:bg-[#115E59]'
          : 'hover:bg-[var(--bg-tertiary)]'

        const isThreadSelected = selectedThreadIds.has(data.id)

        return (
          <div
            key={data.id}
            onClick={() => {
              if (multiSelectMode) {
                onToggleThreadSelection(data.id)
              } else if (isDraftView) {
                // When clicking a draft, open it in compose modal
                onDraftClick(item as Draft)
              } else {
                onItemClick(data.id)
              }
            }}
            data-testid="thread-row"
            data-unread={data.isUnread}
            className={`flex items-start gap-3 px-4 py-3 cursor-pointer border-b border-[var(--border-color)] transition-colors ${bgClass}`}
          >
            {/* Checkbox in multi-select mode */}
            {multiSelectMode && (
              <div className="flex-shrink-0 flex items-center justify-center w-5 h-10">
                <input
                  type="checkbox"
                  checked={isThreadSelected}
                  onChange={() => onToggleThreadSelection(data.id)}
                  onClick={(e) => e.stopPropagation()}
                  data-testid="thread-checkbox"
                  className="w-4 h-4 rounded border-[var(--border-color)] text-[#0D9488] focus:ring-[#0D9488]"
                />
              </div>
            )}

            {/* Unread indicator dot */}
            {data.isUnread && (
              <div className="flex-shrink-0 w-2.5 h-2.5 rounded-full bg-[#0D9488] mt-4" />
            )}

            {/* Star button */}
            {!isDraftView && (
              <button
                className="flex-shrink-0 p-1 hover:bg-[var(--bg-tertiary)] rounded-full transition-colors"
                onClick={(e) => { e.stopPropagation(); onToggleStar(data.id) }}
                data-testid="star-button"
                title={data.isStarred ? 'Unstar' : 'Star'}
              >
                <svg className={`w-5 h-5 ${data.isStarred ? 'text-yellow-400 fill-yellow-400' : 'text-[var(--text-secondary)]'}`} fill={data.isStarred ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
              </button>
            )}

            {/* Avatar */}
            <div
              className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-white text-sm font-medium"
              style={{ backgroundColor: getAvatarColor(data.sender) }}
            >
              {getInitials(data.sender)}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className={`truncate ${data.isUnread ? 'font-extrabold text-[var(--text-primary)]' : 'font-normal text-[var(--text-secondary)]'}`}>
                  {data.sender.split('@')[0]}
                </span>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {/* Attachment Indicator */}
                  {data.hasAttachment && (
                    <svg className="w-4 h-4 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                  )}
                  <span className={`text-xs ${data.isUnread ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`} data-testid="thread-date">
                    {formatDate(data.date)}
                  </span>
                </div>
              </div>
              <div className={`truncate text-sm ${data.isUnread ? 'font-bold text-[var(--text-primary)]' : 'font-normal text-[var(--text-secondary)]'}`}>
                {data.subject}
                {isDraftView
                  ? <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{(item as Draft).id}]</span>
                  : <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{(item as Thread).id}]</span>
                }
              </div>
              <div className={`truncate text-sm ${data.isUnread ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                {data.snippet}
              </div>
            </div>
          </div>
        )
      })}
      </div>

      {/* Pagination Footer */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-[var(--border-color)] bg-[var(--bg-tertiary)]">
        <div className="flex items-center gap-2">
          <select
            data-testid="page-size-dropdown"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="px-2 py-1 text-sm bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[#0D9488]"
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span className="text-xs text-[var(--text-secondary)]">per page</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            data-testid="pagination-prev"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            className="p-1 hover:bg-[var(--bg-secondary)] rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Previous page"
          >
            <svg className="w-4 h-4 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span data-testid="pagination-info" className="text-xs text-[var(--text-secondary)]">
            {currentPage}/{totalPages}
          </span>
          <button
            data-testid="pagination-next"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="p-1 hover:bg-[var(--bg-secondary)] rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Next page"
          >
            <svg className="w-4 h-4 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Email Preview Component
// ============================================================

interface EmailPreviewProps {
  thread: Thread | null
  loading: boolean
  activeLabel: string
  onReply: (message: Message) => void
  onForward: (message: Message) => void
  onTrash: (threadId: string) => void
  onUntrash: (threadId: string) => void
  onDeleteForever: (threadId: string) => void
  actionLoading: boolean
  messageMultiSelectMode: boolean
  selectedMessageIds: Set<string>
  onToggleMessageMultiSelect: () => void
  onToggleMessageSelection: (messageId: string) => void
  onBatchDeleteMessages: () => void
  onTrashMessage: (messageId: string) => void
  onUntrashMessage: (messageId: string) => void
  onDeleteMessage: (messageId: string) => void
  onModifyMessageLabels: (messageId: string, addLabelIds: string[], removeLabelIds: string[]) => void
  onDownloadAttachment: (messageId: string, attachmentId: string, filename: string) => void
  onBatchModifyMessageLabels: (addLabelIds: string[], removeLabelIds: string[]) => void
  labels: Label[]
}

function EmailPreview({
  thread,
  loading,
  activeLabel,
  onReply,
  onForward,
  onTrash,
  onUntrash,
  onDeleteForever,
  actionLoading,
  messageMultiSelectMode,
  selectedMessageIds,
  onToggleMessageMultiSelect,
  onToggleMessageSelection,
  onBatchDeleteMessages,
  onTrashMessage,
  onUntrashMessage,
  onDeleteMessage,
  onModifyMessageLabels,
  onDownloadAttachment,
  onBatchModifyMessageLabels,
  labels
}: EmailPreviewProps) {
  const [showBatchLabelMenu, setShowBatchLabelMenu] = useState(false)
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--bg-primary)]" data-testid="email-preview-loading">
        <div className="w-8 h-8 border-4 border-[#0D9488]/30 border-t-[#0D9488] rounded-full animate-spin" />
      </div>
    )
  }

  if (!thread) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[var(--bg-primary)] text-[var(--text-secondary)]" data-testid="email-preview-empty">
        <svg className="w-24 h-24 mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        <p className="text-lg">Select an email to read</p>
      </div>
    )
  }

  // Filter out invalid/undefined messages, and hide DRAFT messages when not in DRAFT view
  const messages = (thread.messages || []).filter(m => m && m.id && (activeLabel === 'DRAFT' || !m.labelIds?.includes('DRAFT')))
  const latestMessage = messages.length > 0 ? messages[messages.length - 1] : null
  const latestMsgData = getMessageData(latestMessage)

  const isTrashView = activeLabel === 'TRASH'

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[var(--bg-primary)]" data-testid="email-preview" data-snapshot-record={thread.id}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
        <h1 className="text-xl font-medium text-[var(--text-primary)] truncate" data-testid="preview-subject">
          {latestMsgData.subject || 'No Subject'}
          <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{thread.id}]</span>
        </h1>
        <div className="flex items-center gap-2">
          {/* Thread action buttons */}
          {isTrashView ? (
            <>
              {/* Restore button (untrash) */}
              <button
                onClick={() => onUntrash(thread.id)}
                data-testid="untrash-button"
                disabled={actionLoading}
                className="p-2 hover:bg-[var(--bg-tertiary)] rounded-full transition-colors disabled:opacity-50 cursor-pointer"
                title="Restore to Inbox"
              >
                <svg className="w-5 h-5 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </button>
              {/* Delete Forever button */}
              <button
                onClick={() => onDeleteForever(thread.id)}
                data-testid="delete-forever-button"
                disabled={actionLoading}
                className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-full transition-colors disabled:opacity-50 cursor-pointer"
                title="Delete Forever"
              >
                <svg className="w-5 h-5 text-[var(--danger-color)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </>
          ) : (
            /* Trash button (move to trash) */
            <button
              onClick={() => onTrash(thread.id)}
              data-testid="trash-button"
              disabled={actionLoading}
              className="p-2 hover:bg-[var(--bg-tertiary)] rounded-full transition-colors disabled:opacity-50"
              title="Move to Trash"
            >
              <svg className="w-5 h-5 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}

          {/* Reply button */}
          <button
            onClick={() => latestMessage && onReply(latestMessage)}
            data-testid="reply-button"
            className="p-2 hover:bg-[var(--bg-tertiary)] rounded-full transition-colors"
            title="Reply"
          >
            <svg className="w-5 h-5 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </button>
          {/* Forward button */}
          <button
            onClick={() => latestMessage && onForward(latestMessage)}
            data-testid="forward-button"
            className="p-2 hover:bg-[var(--bg-tertiary)] rounded-full transition-colors"
            title="Forward"
          >
            <svg className="w-5 h-5 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
            </svg>
          </button>

          {/* Separator */}
          <div className="w-px h-6 bg-[var(--border-color)] mx-1" />

          {/* Message Multi-Select Toggle */}
          <button
            onClick={onToggleMessageMultiSelect}
            data-testid="message-multiselect-toggle"
            className={`p-2 rounded-full transition-colors ${messageMultiSelectMode ? 'bg-[#CCFBF1] dark:bg-[#115E59]' : 'hover:bg-[var(--bg-tertiary)]'}`}
            title={messageMultiSelectMode ? 'Exit selection mode' : 'Select messages'}
          >
            <svg className="w-5 h-5 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </button>

          {/* Message Multi-Select Actions */}
          {messageMultiSelectMode && selectedMessageIds.size > 0 && (
            <>
              <span className="text-sm text-[var(--text-secondary)]" data-testid="message-selection-count">
                {selectedMessageIds.size} selected
              </span>
              <button
                onClick={onBatchDeleteMessages}
                data-testid="batch-delete-messages-button"
                disabled={actionLoading}
                className="p-2 hover:bg-[var(--bg-tertiary)] rounded-full transition-colors disabled:opacity-50"
                title="Delete selected messages"
              >
                <svg className="w-5 h-5 text-[var(--danger-color)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
              <div className="relative">
                <button
                  data-testid="message-label-button"
                  onClick={() => setShowBatchLabelMenu(!showBatchLabelMenu)}
                  className="p-2 hover:bg-[var(--bg-tertiary)] rounded-full transition-colors"
                  title="Modify labels"
                >
                  <svg className="w-5 h-5 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                </button>
                {showBatchLabelMenu && (
                  <div className="absolute top-full right-0 mt-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg shadow-lg z-10 py-1 min-w-[160px]" data-testid="batch-label-menu">
                    <div className="px-3 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Add Label</div>
                    {labels.filter(l => l.type === 'user' || ['STARRED', 'IMPORTANT'].includes(l.id)).map(l => (
                      <button key={l.id} onClick={() => { onBatchModifyMessageLabels([l.id], []); setShowBatchLabelMenu(false) }}
                        className="w-full px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]">
                        {l.name}
                      </button>
                    ))}
                    <div className="border-t border-[var(--border-color)] my-1" />
                    <div className="px-3 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Remove Label</div>
                    {labels.filter(l => l.type === 'user' || ['STARRED', 'IMPORTANT', 'UNREAD'].includes(l.id)).map(l => (
                      <button key={`rm-${l.id}`} onClick={() => { onBatchModifyMessageLabels([], [l.id]); setShowBatchLabelMenu(false) }}
                        className="w-full px-3 py-2 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]">
                        Remove {l.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6">
        {messages.map((message, index) => (
          <MessageItem
            key={message.id}
            message={message}
            isExpanded={index === messages.length - 1}
            multiSelectMode={messageMultiSelectMode}
            isSelected={selectedMessageIds.has(message.id)}
            onToggleSelection={() => onToggleMessageSelection(message.id)}
            activeLabel={activeLabel}
            onTrashMessage={onTrashMessage}
            onUntrashMessage={onUntrashMessage}
            onDeleteMessage={onDeleteMessage}
            onModifyMessageLabels={onModifyMessageLabels}
            onDownloadAttachment={onDownloadAttachment}
            labels={labels}
          />
        ))}
      </div>

      {/* Quick Reply */}
      <div className="px-6 py-4 border-t border-[var(--border-color)] bg-[var(--bg-secondary)]">
        <button
          onClick={() => latestMessage && onReply(latestMessage)}
          className="flex items-center gap-2 px-4 py-2 text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
          Reply
        </button>
      </div>
    </div>
  )
}

// ============================================================
// Message Item Component
// ============================================================

interface MessageItemProps {
  message: Message
  isExpanded?: boolean
  multiSelectMode?: boolean
  isSelected?: boolean
  onToggleSelection?: () => void
  activeLabel?: string
  onTrashMessage?: (messageId: string) => void
  onUntrashMessage?: (messageId: string) => void
  onDeleteMessage?: (messageId: string) => void
  onModifyMessageLabels?: (messageId: string, addLabelIds: string[], removeLabelIds: string[]) => void
  onDownloadAttachment?: (messageId: string, attachmentId: string, filename: string) => void
  labels?: Label[]
}

function MessageItem({ message, isExpanded = true, multiSelectMode = false, isSelected = false, onToggleSelection,
  activeLabel, onTrashMessage, onUntrashMessage, onDeleteMessage, onModifyMessageLabels, onDownloadAttachment, labels
}: MessageItemProps) {
  const [expanded, setExpanded] = useState(isExpanded)
  const [showMsgLabelMenu, setShowMsgLabelMenu] = useState(false)
  const [showDeleteMsgConfirm, setShowDeleteMsgConfirm] = useState(false)

  // Handle undefined or invalid message
  if (!message || !message.id) {
    return null
  }

  // Extract message data with fallback to headers
  const msgData = getMessageData(message)
  const sender = msgData.sender || 'unknown@unknown.com'
  const recipient = msgData.recipient || 'unknown'
  const date = msgData.date || ''
  const body = msgData.body
  const attachments = getAttachments(message.payload)

  return (
    <div
      className="mb-6 bg-[var(--bg-secondary)] rounded-lg shadow-sm border border-[var(--border-color)]"
      data-testid="message-item"
      data-snapshot-message={message.id}
    >
      {/* Message Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Checkbox in multi-select mode */}
        {multiSelectMode && (
          <div className="flex-shrink-0 flex items-center justify-center w-5">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => {
                e.stopPropagation()
                onToggleSelection?.()
              }}
              onClick={(e) => e.stopPropagation()}
              data-testid="message-checkbox"
              className="w-4 h-4 rounded border-[var(--border-color)] text-[#0D9488] focus:ring-[#0D9488]"
            />
          </div>
        )}
        <div
          className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-white text-sm font-medium"
          style={{ backgroundColor: getAvatarColor(sender) }}
        >
          {getInitials(sender)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-medium text-[var(--text-primary)] flex-shrink-0">
              {sender.split('@')[0]}
              <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{message.id}]</span>
            </span>
            <span className="text-sm text-[var(--text-secondary)] truncate">
              &lt;{sender}&gt;
            </span>
            <span className="text-sm text-[var(--text-secondary)] flex-shrink-0 ml-auto">
              {formatDate(date)}
            </span>
          </div>
          <div className="text-sm text-[var(--text-secondary)]">
            to {recipient}
          </div>
        </div>
        <svg
          className={`w-5 h-5 text-[var(--text-secondary)] transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Message Body */}
      {expanded && (
        <div className="px-4 pb-4">
          <div className="pl-[52px]">
            <div className="text-[var(--text-primary)] whitespace-pre-wrap">
              {body}
            </div>

            {/* Attachments */}
            {attachments.length > 0 && (
              <div className="mt-4 pt-4 border-t border-[var(--border-color)]">
                <div className="text-sm font-medium text-[var(--text-secondary)] mb-2">
                  Attachments ({attachments.length})
                </div>
                <div className="flex flex-wrap gap-2">
                  {attachments.map((attachment, idx) => (
                    <button
                      key={idx}
                      onClick={() => attachment.body?.attachmentId && onDownloadAttachment?.(message.id, attachment.body.attachmentId, attachment.filename || 'download')}
                      data-testid="attachment-download"
                      className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-tertiary)] rounded-lg text-sm hover:bg-[var(--bg-primary)] transition-colors cursor-pointer"
                      title="Download attachment"
                    >
                      <svg className="w-4 h-4 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      <span className="text-[var(--text-primary)]">{attachment.filename}</span>
                      {attachment.body?.size && (
                        <span className="text-xs text-[var(--text-secondary)]">({Math.round(attachment.body.size / 1024)}KB)</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Per-Message Actions */}
            <div className="mt-4 pt-3 border-t border-[var(--border-color)] flex items-center gap-1">
              {activeLabel === 'TRASH' ? (
                <>
                  <button onClick={() => onUntrashMessage?.(message.id)} data-testid="msg-untrash-button"
                    className="flex items-center gap-1 px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] rounded transition-colors" title="Restore">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    Restore
                  </button>
                  <button onClick={() => setShowDeleteMsgConfirm(true)} data-testid="msg-delete-button"
                    className="flex items-center gap-1 px-2 py-1 text-xs text-[var(--danger-color)] hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors" title="Delete forever">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    Delete Forever
                  </button>
                </>
              ) : (
                <button onClick={() => onTrashMessage?.(message.id)} data-testid="msg-trash-button"
                  className="flex items-center gap-1 px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] rounded transition-colors" title="Trash">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  Trash
                </button>
              )}

              {/* Label management per message */}
              <div className="relative">
                <button onClick={() => setShowMsgLabelMenu(!showMsgLabelMenu)} data-testid="msg-label-button"
                  className="flex items-center gap-1 px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] rounded transition-colors" title="Labels">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                  Labels
                </button>
                {showMsgLabelMenu && (
                  <div className="absolute bottom-full left-0 mb-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg shadow-lg z-10 py-1 min-w-[150px]" data-testid="msg-label-menu">
                    <div className="px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">Toggle Label</div>
                    {(labels || []).filter(l => l.type === 'user' || ['STARRED', 'IMPORTANT'].includes(l.id)).map(l => {
                      const hasLabel = message.labelIds?.includes(l.id)
                      return (
                        <button key={l.id} onClick={() => {
                          if (hasLabel) onModifyMessageLabels?.(message.id, [], [l.id])
                          else onModifyMessageLabels?.(message.id, [l.id], [])
                          setShowMsgLabelMenu(false)
                        }}
                          className="w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--bg-tertiary)] flex items-center gap-2">
                          <span className={`w-3 h-3 border rounded ${hasLabel ? 'bg-[#0D9488] border-[#0D9488]' : 'border-[var(--border-color)]'}`} />
                          <span className="text-[var(--text-primary)]">{l.name}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Current labels display */}
              {message.labelIds && message.labelIds.length > 0 && (
                <div className="flex gap-1 ml-2 flex-wrap">
                  {message.labelIds.filter(id => !['INBOX', 'SENT', 'DRAFT', 'TRASH', 'SPAM', 'UNREAD', 'CATEGORY_PERSONAL', 'CATEGORY_SOCIAL', 'CATEGORY_PROMOTIONS', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS'].includes(id)).map(id => {
                    const label = (labels || []).find(l => l.id === id)
                    const hasBgColor = label?.color?.backgroundColor
                    const hasTextColor = label?.color?.textColor
                    return (
                      <span
                        key={id}
                        className={`px-1.5 py-0.5 text-[10px] rounded ${!hasBgColor ? 'bg-[var(--bg-tertiary)]' : ''} ${!hasTextColor ? 'text-[var(--text-secondary)]' : ''}`}
                        style={{
                          ...(hasBgColor ? { backgroundColor: label.color!.backgroundColor } : {}),
                          ...(hasTextColor ? { color: label.color!.textColor } : {})
                        }}
                      >
                        {label?.name || id}
                      </span>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Delete message confirmation */}
            {showDeleteMsgConfirm && (
              <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded">
                <p className="text-xs text-[var(--text-primary)] mb-1">Permanently delete this message?</p>
                <div className="flex gap-1">
                  <button onClick={() => { onDeleteMessage?.(message.id); setShowDeleteMsgConfirm(false) }}
                    className="px-2 py-1 text-xs bg-[var(--danger-color)] text-white rounded">Delete</button>
                  <button onClick={() => setShowDeleteMsgConfirm(false)}
                    className="px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] rounded">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Compose Modal Component
// ============================================================

interface ComposeModalProps {
  mode: 'new' | 'reply' | 'forward' | 'draft'
  to: string
  subject: string
  body: string
  draftId: string | null
  draftSaving: boolean
  onToChange: (value: string) => void
  onSubjectChange: (value: string) => void
  onBodyChange: (value: string) => void
  onSend: () => void
  onSaveDraft: () => void
  onDeleteDraft: () => void
  onClose: () => void
}

function ComposeModal({
  mode,
  to,
  subject,
  body,
  draftId,
  draftSaving,
  onToChange,
  onSubjectChange,
  onBodyChange,
  onSend,
  onSaveDraft,
  onDeleteDraft,
  onClose
}: ComposeModalProps) {
  const getTitle = () => {
    switch (mode) {
      case 'reply': return 'Reply'
      case 'forward': return 'Forward'
      case 'draft': return 'Edit Draft'
      default: return 'New Message'
    }
  }

  return (
    <div
      className="fixed bottom-4 right-4 w-[480px] bg-[var(--bg-secondary)] rounded-t-lg shadow-2xl border border-[var(--border-color)] flex flex-col"
      style={{ height: '500px' }}
      data-testid="compose-modal"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#404040] text-white rounded-t-lg">
        <span className="font-medium">{getTitle()}</span>
        <div className="flex items-center gap-1">
          {/* Delete Draft button - only show when editing a draft */}
          {mode === 'draft' && draftId && (
            <button
              onClick={onDeleteDraft}
              data-testid="delete-draft-button"
              className="p-1 hover:bg-white/10 rounded transition-colors"
              title="Delete Draft"
            >
              <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
          <button
            onClick={onClose}
            data-testid="compose-close"
            className="p-1 hover:bg-white/10 rounded transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* To Field */}
        <div className="flex items-center border-b border-[var(--border-color)]">
          <span className="px-4 py-2 text-sm text-[var(--text-secondary)]">To</span>
          <input
            type="email"
            name="to"
            value={to}
            onChange={(e) => onToChange(e.target.value)}
            placeholder="Recipients"
            data-testid="compose-to"
            className="flex-1 px-2 py-2 bg-transparent text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none"
          />
        </div>

        {/* Subject Field */}
        <div className="flex items-center border-b border-[var(--border-color)]">
          <span className="px-4 py-2 text-sm text-[var(--text-secondary)]">Subject</span>
          <input
            type="text"
            name="subject"
            value={subject}
            onChange={(e) => onSubjectChange(e.target.value)}
            placeholder="Subject"
            data-testid="compose-subject"
            className="flex-1 px-2 py-2 bg-transparent text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none"
          />
        </div>

        {/* Body */}
        <textarea
          name="body"
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          placeholder="Compose email"
          data-testid="compose-body"
          className="flex-1 p-4 bg-transparent text-[var(--text-primary)] placeholder-[var(--text-secondary)] resize-none focus:outline-none"
        />

        {/* Footer */}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-[var(--border-color)]">
          <button
            onClick={onSend}
            disabled={!to.trim()}
            className="px-6 py-2 bg-[#0D9488] hover:bg-[#0F766E] disabled:bg-[#0D9488]/50
                     text-white rounded-md font-medium transition-colors disabled:cursor-not-allowed"
          >
            Send
          </button>
          <button
            onClick={onSaveDraft}
            disabled={draftSaving}
            data-testid="save-draft-button"
            className="px-4 py-2 hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-md font-medium transition-colors disabled:opacity-50"
          >
            {draftSaving ? 'Saving...' : 'Save Draft'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Settings Panel Component
// ============================================================

interface SettingsPanelProps {
  onClose: () => void
  onRefresh: () => void
  settingsTab: 'general' | 'sendas' | 'smime' | 'labels' | 'admin'
  onTabChange: (tab: 'general' | 'sendas' | 'smime' | 'labels' | 'admin') => void
  settingsLoading: boolean
  settingsSaving: boolean
  settingsError: string | null
  vacationSettings: VacationSettings | null
  autoForwardingSettings: AutoForwardingSettings | null
  imapSettings: ImapSettings | null
  popSettings: PopSettings | null
  languageSettings: LanguageSettings | null
  sendAsAliases: SendAsAlias[]
  smimeInfoList: SmimeInfo[]
  onSaveVacation: (s: VacationSettings) => void
  onSaveAutoForwarding: (s: AutoForwardingSettings) => void
  onSaveImap: (s: ImapSettings) => void
  onSavePop: (s: PopSettings) => void
  onSaveLanguage: (s: LanguageSettings) => void
  showSendAsForm: boolean
  editingSendAs: SendAsAlias | null
  sendAsFormEmail: string
  sendAsFormDisplayName: string
  sendAsFormReplyTo: string
  sendAsFormSignature: string
  onShowSendAsForm: (alias: SendAsAlias | null) => void
  onCloseSendAsForm: () => void
  onSendAsFormEmailChange: (v: string) => void
  onSendAsFormDisplayNameChange: (v: string) => void
  onSendAsFormReplyToChange: (v: string) => void
  onSendAsFormSignatureChange: (v: string) => void
  onCreateSendAs: () => void
  onUpdateSendAs: () => void
  onDeleteSendAs: (email: string) => void
  onVerifySendAs: (email: string) => void
  onMakeDefaultSendAs: (email: string) => void
  showSmimeForm: boolean
  smimeFormSendAsEmail: string
  smimeFormPem: string
  smimeFormPkcs12: string
  onShowSmimeForm: (email: string) => void
  onCloseSmimeForm: () => void
  onSmimeFormPemChange: (v: string) => void
  onSmimeFormPkcs12Change: (v: string) => void
  onCreateSmime: () => void
  onDeleteSmime: (sendAsEmail: string, smimeId: string) => void
  onSetDefaultSmime: (sendAsEmail: string, smimeId: string) => void
  onLoadSmimeForAlias: (email: string) => void
  historyRecords: unknown[]
  onLoadHistory: () => void
  showImportForm: boolean
  importTo: string
  importSubject: string
  importBody: string
  onShowImportForm: () => void
  onCloseImportForm: () => void
  onImportToChange: (v: string) => void
  onImportSubjectChange: (v: string) => void
  onImportBodyChange: (v: string) => void
  onImportMessage: () => void
  showInsertForm: boolean
  insertTo: string
  insertSubject: string
  insertBody: string
  onShowInsertForm: () => void
  onCloseInsertForm: () => void
  onInsertToChange: (v: string) => void
  onInsertSubjectChange: (v: string) => void
  onInsertBodyChange: (v: string) => void
  onInsertMessage: () => void
  checkUserEmail: string
  checkUserResult: string | null
  onCheckUserEmailChange: (v: string) => void
  onCheckUser: () => void
  createUserEmail: string
  onCreateUserEmailChange: (v: string) => void
  onCreateUser: () => void
  watchStatus: string | null
  onWatchMailbox: () => void
  onStopWatch: () => void
  onListMessages: () => void
}

function SettingsPanel(props: SettingsPanelProps) {
  const { onClose, onRefresh, settingsTab, onTabChange, settingsLoading, settingsSaving, settingsError } = props

  // Local form state for settings editing
  const [localVacation, setLocalVacation] = useState<VacationSettings>(props.vacationSettings || { enableAutoReply: false })
  const [localForwarding, setLocalForwarding] = useState<AutoForwardingSettings>(props.autoForwardingSettings || { enabled: false })
  const [localImap, setLocalImap] = useState<ImapSettings>(props.imapSettings || { enabled: false })
  const [localPop, setLocalPop] = useState<PopSettings>(props.popSettings || {})
  const [localLanguage, setLocalLanguage] = useState<LanguageSettings>(props.languageSettings || {})

  // Sync local state when props update
  useEffect(() => { if (props.vacationSettings) setLocalVacation(props.vacationSettings) }, [props.vacationSettings])
  useEffect(() => { if (props.autoForwardingSettings) setLocalForwarding(props.autoForwardingSettings) }, [props.autoForwardingSettings])
  useEffect(() => { if (props.imapSettings) setLocalImap(props.imapSettings) }, [props.imapSettings])
  useEffect(() => { if (props.popSettings) setLocalPop(props.popSettings) }, [props.popSettings])
  useEffect(() => { if (props.languageSettings) setLocalLanguage(props.languageSettings) }, [props.languageSettings])

  const tabs = [
    { id: 'general' as const, label: 'General' },
    { id: 'sendas' as const, label: 'Send-As' },
    { id: 'smime' as const, label: 'S/MIME' },
    { id: 'admin' as const, label: 'Admin' }
  ]

  const inputClass = "w-full px-3 py-2 text-sm bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[#0D9488]"
  const btnPrimary = "px-4 py-2 text-sm bg-[#0D9488] hover:bg-[#0F766E] text-white rounded font-medium transition-colors disabled:opacity-50"
  const btnSecondary = "px-4 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded font-medium transition-colors"
  const sectionTitle = "text-sm font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-3"
  const toggleRow = "flex items-center justify-between py-2"
  const labelText = "text-sm text-[var(--text-primary)]"

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[500px] h-full bg-[var(--bg-secondary)] shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
          <h2 className="text-xl font-medium text-[var(--text-primary)]">Settings</h2>
          <button onClick={onClose} className="p-2 hover:bg-[var(--bg-tertiary)] rounded-full transition-colors">
            <svg className="w-5 h-5 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--border-color)]">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => onTabChange(tab.id)}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${settingsTab === tab.id ? 'text-[#0D9488] border-b-2 border-[#0D9488]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {settingsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-[#0D9488]/30 border-t-[#0D9488] rounded-full animate-spin" />
            </div>
          ) : settingsError ? (
            <div className="text-center py-8 text-[var(--danger-color)]">{settingsError}</div>
          ) : settingsTab === 'general' ? (
            <div className="space-y-6">
              {/* Vacation Responder */}
              <div>
                <h3 className={sectionTitle}>Vacation Responder</h3>
                <div className={toggleRow}>
                  <span className={labelText}>Enable auto-reply</span>
                  <input type="checkbox" checked={localVacation.enableAutoReply} onChange={(e) => setLocalVacation({ ...localVacation, enableAutoReply: e.target.checked })}
                    className="w-4 h-4 text-[#0D9488] rounded focus:ring-[#0D9488]" />
                </div>
                {localVacation.enableAutoReply && (
                  <div className="space-y-2 mt-2">
                    <input type="text" placeholder="Subject" value={localVacation.responseSubject || ''} onChange={(e) => setLocalVacation({ ...localVacation, responseSubject: e.target.value })} className={inputClass} />
                    <textarea placeholder="Message body" value={localVacation.responseBodyPlainText || ''} onChange={(e) => setLocalVacation({ ...localVacation, responseBodyPlainText: e.target.value })} className={`${inputClass} h-20 resize-none`} />
                    <div className={toggleRow}>
                      <span className={labelText}>Contacts only</span>
                      <input type="checkbox" checked={localVacation.restrictToContacts || false} onChange={(e) => setLocalVacation({ ...localVacation, restrictToContacts: e.target.checked })} className="w-4 h-4" />
                    </div>
                    <div className={toggleRow}>
                      <span className={labelText}>Domain only</span>
                      <input type="checkbox" checked={localVacation.restrictToDomain || false} onChange={(e) => setLocalVacation({ ...localVacation, restrictToDomain: e.target.checked })} className="w-4 h-4" />
                    </div>
                    <div className="flex gap-2">
                      <input type="text" placeholder="Start time (epoch ms)" value={localVacation.startTime || ''} onChange={(e) => setLocalVacation({ ...localVacation, startTime: e.target.value })} className={inputClass} />
                      <input type="text" placeholder="End time (epoch ms)" value={localVacation.endTime || ''} onChange={(e) => setLocalVacation({ ...localVacation, endTime: e.target.value })} className={inputClass} />
                    </div>
                  </div>
                )}
                <button onClick={() => props.onSaveVacation(localVacation)} disabled={settingsSaving} className={`${btnPrimary} mt-2`}>
                  {settingsSaving ? 'Saving...' : 'Save Vacation Settings'}
                </button>
              </div>

              {/* Auto-Forwarding */}
              <div>
                <h3 className={sectionTitle}>Auto-Forwarding</h3>
                <div className={toggleRow}>
                  <span className={labelText}>Enable forwarding</span>
                  <input type="checkbox" checked={localForwarding.enabled} onChange={(e) => setLocalForwarding({ ...localForwarding, enabled: e.target.checked })} className="w-4 h-4" />
                </div>
                {localForwarding.enabled && (
                  <div className="space-y-2 mt-2">
                    <input type="email" placeholder="Forward to email" value={localForwarding.emailAddress || ''} onChange={(e) => setLocalForwarding({ ...localForwarding, emailAddress: e.target.value })} className={inputClass} />
                    <select value={localForwarding.disposition || ''} onChange={(e) => setLocalForwarding({ ...localForwarding, disposition: e.target.value })} className={inputClass}>
                      <option value="">Select disposition</option>
                      <option value="leaveInInbox">Keep in inbox</option>
                      <option value="archive">Archive</option>
                      <option value="trash">Trash</option>
                      <option value="markRead">Mark as read</option>
                    </select>
                  </div>
                )}
                <button onClick={() => props.onSaveAutoForwarding(localForwarding)} disabled={settingsSaving} className={`${btnPrimary} mt-2`}>Save Forwarding</button>
              </div>

              {/* IMAP */}
              <div>
                <h3 className={sectionTitle}>IMAP Settings</h3>
                <div className={toggleRow}>
                  <span className={labelText}>Enable IMAP</span>
                  <input type="checkbox" checked={localImap.enabled} onChange={(e) => setLocalImap({ ...localImap, enabled: e.target.checked })} className="w-4 h-4" />
                </div>
                {localImap.enabled && (
                  <div className="space-y-2 mt-2">
                    <div className={toggleRow}>
                      <span className={labelText}>Auto-expunge</span>
                      <input type="checkbox" checked={localImap.autoExpunge || false} onChange={(e) => setLocalImap({ ...localImap, autoExpunge: e.target.checked })} className="w-4 h-4" />
                    </div>
                    <select value={localImap.expungeBehavior || ''} onChange={(e) => setLocalImap({ ...localImap, expungeBehavior: e.target.value })} className={inputClass}>
                      <option value="">Expunge behavior</option>
                      <option value="archive">Archive</option>
                      <option value="trash">Trash</option>
                      <option value="deleteForever">Delete forever</option>
                    </select>
                    <input type="number" placeholder="Max folder size" value={localImap.maxFolderSize || ''} onChange={(e) => setLocalImap({ ...localImap, maxFolderSize: parseInt(e.target.value) || undefined })} className={inputClass} />
                  </div>
                )}
                <button onClick={() => props.onSaveImap(localImap)} disabled={settingsSaving} className={`${btnPrimary} mt-2`}>Save IMAP</button>
              </div>

              {/* POP */}
              <div>
                <h3 className={sectionTitle}>POP Settings</h3>
                <select value={localPop.accessWindow || ''} onChange={(e) => setLocalPop({ ...localPop, accessWindow: e.target.value })} className={inputClass}>
                  <option value="">Access window</option>
                  <option value="disabled">Disabled</option>
                  <option value="allMail">All mail</option>
                  <option value="fromNowOn">From now on</option>
                </select>
                <select value={localPop.disposition || ''} onChange={(e) => setLocalPop({ ...localPop, disposition: e.target.value })} className={`${inputClass} mt-2`}>
                  <option value="">Disposition</option>
                  <option value="leaveInInbox">Keep in inbox</option>
                  <option value="archive">Archive</option>
                  <option value="trash">Trash</option>
                  <option value="markRead">Mark as read</option>
                </select>
                <button onClick={() => props.onSavePop(localPop)} disabled={settingsSaving} className={`${btnPrimary} mt-2`}>Save POP</button>
              </div>

              {/* Language */}
              <div>
                <h3 className={sectionTitle}>Language</h3>
                <input type="text" placeholder="Display language (e.g. en)" value={localLanguage.displayLanguage || ''} onChange={(e) => setLocalLanguage({ ...localLanguage, displayLanguage: e.target.value })} className={inputClass} />
                <button onClick={() => props.onSaveLanguage(localLanguage)} disabled={settingsSaving} className={`${btnPrimary} mt-2`}>Save Language</button>
              </div>
            </div>
          ) : settingsTab === 'sendas' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className={sectionTitle}>Send-As Aliases</h3>
                <button onClick={() => props.onShowSendAsForm(null)} className={btnPrimary}>Add Alias</button>
              </div>

              {props.showSendAsForm && (
                <div className="p-4 bg-[var(--bg-tertiary)] rounded-lg space-y-2" data-testid="send-as-form">
                  <h4 className="text-sm font-medium text-[var(--text-primary)]">{props.editingSendAs ? 'Edit Alias' : 'New Alias'}</h4>
                  {!props.editingSendAs && (
                    <input type="email" placeholder="Email address" value={props.sendAsFormEmail} onChange={(e) => props.onSendAsFormEmailChange(e.target.value)} className={inputClass} />
                  )}
                  <input type="text" placeholder="Display name" value={props.sendAsFormDisplayName} onChange={(e) => props.onSendAsFormDisplayNameChange(e.target.value)} className={inputClass} />
                  <input type="email" placeholder="Reply-to address" value={props.sendAsFormReplyTo} onChange={(e) => props.onSendAsFormReplyToChange(e.target.value)} className={inputClass} />
                  <textarea placeholder="Signature" value={props.sendAsFormSignature} onChange={(e) => props.onSendAsFormSignatureChange(e.target.value)} className={`${inputClass} h-16 resize-none`} />
                  <div className="flex gap-2">
                    <button onClick={props.editingSendAs ? props.onUpdateSendAs : props.onCreateSendAs} disabled={settingsSaving} className={btnPrimary}>
                      {settingsSaving ? 'Saving...' : props.editingSendAs ? 'Update' : 'Create'}
                    </button>
                    <button onClick={props.onCloseSendAsForm} className={btnSecondary}>Cancel</button>
                  </div>
                </div>
              )}

              {props.sendAsAliases.map(alias => (
                <div key={alias.sendAsEmail} className="p-3 bg-[var(--bg-tertiary)] rounded-lg" data-testid="send-as-item">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-[var(--text-primary)]">
                        {alias.displayName || alias.sendAsEmail}
                        <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{alias.sendAsEmail}]</span>
                        {alias.isDefault && <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-[#0D9488] text-white rounded">Default</span>}
                        {alias.isPrimary && <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-[#059669] text-white rounded">Primary</span>}
                      </div>
                      <div className="text-xs text-[var(--text-secondary)]">{alias.sendAsEmail}</div>
                      {alias.verificationStatus && <div className="text-xs text-[var(--text-secondary)]">Status: {alias.verificationStatus}</div>}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => props.onShowSendAsForm(alias)} className="p-1 hover:bg-[var(--bg-secondary)] rounded text-xs" title="Edit">Edit</button>
                      {!alias.isPrimary && (
                        <>
                          <button onClick={() => props.onVerifySendAs(alias.sendAsEmail)} className="p-1 hover:bg-[var(--bg-secondary)] rounded text-xs text-[#0D9488]" title="Verify">Verify</button>
                          {!alias.isDefault && <button onClick={() => props.onMakeDefaultSendAs(alias.sendAsEmail)} className="p-1 hover:bg-[var(--bg-secondary)] rounded text-xs" title="Make default">Default</button>}
                          <button onClick={() => props.onDeleteSendAs(alias.sendAsEmail)} className="p-1 hover:bg-[var(--bg-secondary)] rounded text-xs text-[var(--danger-color)]" title="Delete">Delete</button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : settingsTab === 'smime' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className={sectionTitle}>S/MIME Certificates</h3>
              </div>
              <p className="text-sm text-[var(--text-secondary)]">Select a Send-As alias to manage its S/MIME certificates.</p>
              {props.sendAsAliases.map(alias => (
                <div key={alias.sendAsEmail} className="p-3 bg-[var(--bg-tertiary)] rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-[var(--text-primary)]">{alias.sendAsEmail}</span>
                    <div className="flex gap-1">
                      <button onClick={() => props.onLoadSmimeForAlias(alias.sendAsEmail)} className="px-2 py-1 text-xs bg-[var(--bg-secondary)] hover:bg-[var(--bg-primary)] rounded">Load Certs</button>
                      <button onClick={() => props.onShowSmimeForm(alias.sendAsEmail)} className="px-2 py-1 text-xs bg-[#0D9488] text-white rounded hover:bg-[#0F766E]">Add Cert</button>
                    </div>
                  </div>
                  {props.smimeInfoList.filter(s => s.sendAsEmail === alias.sendAsEmail || !s.sendAsEmail).length > 0 && (
                    <div className="space-y-1">
                      {props.smimeInfoList.filter(s => s.sendAsEmail === alias.sendAsEmail || !s.sendAsEmail).map(smime => (
                        <div key={smime.id} className="flex items-center justify-between p-2 bg-[var(--bg-secondary)] rounded text-xs">
                          <div>
                            <span className="text-[var(--text-primary)]">{smime.issuerCn || smime.id}</span>
                            <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{smime.id}]</span>
                            {smime.isDefault && <span className="ml-1 px-1 py-0.5 bg-[#0D9488] text-white rounded text-[10px]">Default</span>}
                            {smime.expiration && <span className="ml-1 text-[var(--text-secondary)]">Exp: {smime.expiration}</span>}
                          </div>
                          <div className="flex gap-1">
                            {!smime.isDefault && <button onClick={() => props.onSetDefaultSmime(alias.sendAsEmail, smime.id)} className="text-[#0D9488] hover:underline">Set Default</button>}
                            <button onClick={() => props.onDeleteSmime(alias.sendAsEmail, smime.id)} className="text-[var(--danger-color)] hover:underline">Delete</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {props.showSmimeForm && (
                <div className="p-4 bg-[var(--bg-tertiary)] rounded-lg space-y-2" data-testid="smime-form">
                  <h4 className="text-sm font-medium text-[var(--text-primary)]">Add S/MIME Certificate for {props.smimeFormSendAsEmail}</h4>
                  <textarea placeholder="PEM certificate data" value={props.smimeFormPem} onChange={(e) => props.onSmimeFormPemChange(e.target.value)} className={`${inputClass} h-16 resize-none`} />
                  <textarea placeholder="PKCS12 data (base64)" value={props.smimeFormPkcs12} onChange={(e) => props.onSmimeFormPkcs12Change(e.target.value)} className={`${inputClass} h-16 resize-none`} />
                  <div className="flex gap-2">
                    <button onClick={props.onCreateSmime} disabled={settingsSaving} className={btnPrimary}>{settingsSaving ? 'Saving...' : 'Add Certificate'}</button>
                    <button onClick={props.onCloseSmimeForm} className={btnSecondary}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          ) : settingsTab === 'admin' ? (
            <div className="space-y-6">
              {/* Data Management */}
              <div>
                <h3 className={sectionTitle}>Data Management</h3>
                <div className="space-y-2">
                  <button onClick={onRefresh} data-testid="refresh-button" className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors">
                    <svg className="w-4 h-4 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    <span className={labelText}>Refresh Data</span>
                  </button>
                  <button onClick={props.onListMessages} className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors">
                    <svg className="w-4 h-4 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                    <span className={labelText}>List Messages (console)</span>
                  </button>
                </div>
              </div>

              {/* History */}
              <div>
                <h3 className={sectionTitle}>History Records</h3>
                <button onClick={props.onLoadHistory} className={btnPrimary}>Load History</button>
                {props.historyRecords.length > 0 && (
                  <div className="mt-2 max-h-40 overflow-y-auto">
                    <pre className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap">{JSON.stringify(props.historyRecords, null, 2)}</pre>
                  </div>
                )}
              </div>

              {/* Import Message */}
              <div>
                <h3 className={sectionTitle}>Import Message</h3>
                {!props.showImportForm ? (
                  <button onClick={props.onShowImportForm} className={btnPrimary}>Import Message</button>
                ) : (
                  <div className="space-y-2 p-3 bg-[var(--bg-tertiary)] rounded-lg" data-testid="import-form">
                    <input type="email" placeholder="To" value={props.importTo} onChange={(e) => props.onImportToChange(e.target.value)} className={inputClass} />
                    <input type="text" placeholder="Subject" value={props.importSubject} onChange={(e) => props.onImportSubjectChange(e.target.value)} className={inputClass} />
                    <textarea placeholder="Body" value={props.importBody} onChange={(e) => props.onImportBodyChange(e.target.value)} className={`${inputClass} h-16 resize-none`} />
                    <div className="flex gap-2">
                      <button onClick={props.onImportMessage} disabled={settingsSaving} className={btnPrimary}>{settingsSaving ? 'Importing...' : 'Import'}</button>
                      <button onClick={props.onCloseImportForm} className={btnSecondary}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Insert Message */}
              <div>
                <h3 className={sectionTitle}>Insert Message</h3>
                {!props.showInsertForm ? (
                  <button onClick={props.onShowInsertForm} className={btnPrimary}>Insert Message</button>
                ) : (
                  <div className="space-y-2 p-3 bg-[var(--bg-tertiary)] rounded-lg" data-testid="insert-form">
                    <input type="email" placeholder="To" value={props.insertTo} onChange={(e) => props.onInsertToChange(e.target.value)} className={inputClass} />
                    <input type="text" placeholder="Subject" value={props.insertSubject} onChange={(e) => props.onInsertSubjectChange(e.target.value)} className={inputClass} />
                    <textarea placeholder="Body" value={props.insertBody} onChange={(e) => props.onInsertBodyChange(e.target.value)} className={`${inputClass} h-16 resize-none`} />
                    <div className="flex gap-2">
                      <button onClick={props.onInsertMessage} disabled={settingsSaving} className={btnPrimary}>{settingsSaving ? 'Inserting...' : 'Insert'}</button>
                      <button onClick={props.onCloseInsertForm} className={btnSecondary}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Mailbox Watch */}
              <div>
                <h3 className={sectionTitle}>Mailbox Watch</h3>
                <div className="flex gap-2">
                  <button onClick={props.onWatchMailbox} className={btnPrimary}>Start Watch</button>
                  <button onClick={props.onStopWatch} className={btnSecondary}>Stop Watch</button>
                </div>
                {props.watchStatus && <p className="text-xs text-[var(--text-secondary)] mt-2">{props.watchStatus}</p>}
              </div>

              {/* User Management */}
              <div>
                <h3 className={sectionTitle}>User Management</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-[var(--text-secondary)]">Check User Exists</label>
                    <div className="flex gap-2 mt-1">
                      <input type="text" placeholder="Email or 'me'" value={props.checkUserEmail} onChange={(e) => props.onCheckUserEmailChange(e.target.value)} className={inputClass} />
                      <button onClick={props.onCheckUser} className={btnPrimary}>Check</button>
                    </div>
                    {props.checkUserResult && <pre className="text-xs text-[var(--text-secondary)] mt-1 whitespace-pre-wrap">{props.checkUserResult}</pre>}
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-secondary)]">Create User</label>
                    <div className="flex gap-2 mt-1">
                      <input type="email" placeholder="New user email" value={props.createUserEmail} onChange={(e) => props.onCreateUserEmailChange(e.target.value)} className={inputClass} />
                      <button onClick={props.onCreateUser} disabled={settingsSaving} className={btnPrimary}>{settingsSaving ? 'Creating...' : 'Create'}</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Delete Confirmation Dialog Component
// ============================================================

interface DeleteConfirmDialogProps {
  onCancel: () => void
  onConfirm: () => void
  loading: boolean
}

function DeleteConfirmDialog({ onCancel, onConfirm, loading }: DeleteConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div
        className="relative bg-[var(--bg-secondary)] rounded-lg shadow-xl p-6 max-w-sm w-full mx-4"
        data-testid="delete-confirm-dialog"
      >
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[var(--danger-color)]/10 flex items-center justify-center">
            <svg className="w-6 h-6 text-[var(--danger-color)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-medium text-[var(--text-primary)]">Delete Forever?</h3>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              This action cannot be undone. The email will be permanently deleted.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            data-testid="cancel-delete-button"
            className="px-4 py-2 text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            data-testid="confirm-delete-button"
            disabled={loading}
            className="px-4 py-2 bg-[var(--danger-color)] hover:bg-[#BE123C] text-white rounded-md transition-colors disabled:opacity-50"
          >
            {loading ? 'Deleting...' : 'Delete Forever'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Batch Delete Messages Confirmation Dialog Component
// ============================================================

interface BatchDeleteMessagesConfirmDialogProps {
  count: number
  onCancel: () => void
  onConfirm: () => void
  loading: boolean
}

function BatchDeleteMessagesConfirmDialog({ count, onCancel, onConfirm, loading }: BatchDeleteMessagesConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div
        className="relative bg-[var(--bg-secondary)] rounded-lg shadow-xl p-6 max-w-sm w-full mx-4"
        data-testid="batch-delete-messages-confirm-dialog"
      >
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[var(--danger-color)]/10 flex items-center justify-center">
            <svg className="w-6 h-6 text-[var(--danger-color)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-medium text-[var(--text-primary)]">Delete {count} Message{count > 1 ? 's' : ''} Forever?</h3>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              This action cannot be undone. The selected message{count > 1 ? 's' : ''} will be permanently deleted.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            data-testid="cancel-batch-delete-messages-button"
            className="px-4 py-2 text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            data-testid="confirm-batch-delete-messages-button"
            disabled={loading}
            className="px-4 py-2 bg-[var(--danger-color)] hover:bg-[#BE123C] text-white rounded-md transition-colors disabled:opacity-50"
          >
            {loading ? 'Deleting...' : 'Delete Forever'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Delete Draft Confirmation Dialog Component
// ============================================================

interface DeleteDraftConfirmDialogProps {
  onCancel: () => void
  onConfirm: () => void
  loading: boolean
}

function DeleteDraftConfirmDialog({ onCancel, onConfirm, loading }: DeleteDraftConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div
        className="relative bg-[var(--bg-secondary)] rounded-lg shadow-xl p-6 max-w-sm w-full mx-4"
        data-testid="delete-draft-confirm-dialog"
      >
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[var(--danger-color)]/10 flex items-center justify-center">
            <svg className="w-6 h-6 text-[var(--danger-color)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-medium text-[var(--text-primary)]">Discard Draft?</h3>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              This draft will be permanently deleted.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            data-testid="cancel-delete-draft-button"
            className="px-4 py-2 text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            data-testid="confirm-delete-draft-button"
            disabled={loading}
            className="px-4 py-2 bg-[var(--danger-color)] hover:bg-[#BE123C] text-white rounded-md transition-colors disabled:opacity-50"
          >
            {loading ? 'Discarding...' : 'Discard'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default App
