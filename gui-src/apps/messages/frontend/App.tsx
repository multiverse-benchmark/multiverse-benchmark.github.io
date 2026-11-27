import { useState, useEffect, useRef, useCallback } from 'react'
import { useBackendAPI } from '@shared/hooks/useBackendAPI'
import { useReadOnly } from '@shared/contexts/ReadOnlyContext'
import { requestedSnapshotRecord, reportMissingSnapshotRecord } from '@shared/snapshotNavigation'

interface ContactEndpoint {
  endpoint_type: string
  endpoint_value: string
  endpoint_label?: string
}

interface Recipient {
  contact_id?: string
  contact_name: string
  contact_endpoints: ContactEndpoint[]
  contact_photo_url?: string
  phone_number?: string // Legacy field for compatibility
}

interface MediaAttachment {
  media_id: string
  media_type: string
  source: string
  // Local-only fields for UI preview (not sent to API)
  fileName?: string
  previewUrl?: string
}

interface Message {
  id: string
  recipient: Recipient
  message_body: string
  media_attachments: MediaAttachment[]
  timestamp: string
  status: 'sent' | 'failed' | 'pending'
  is_from_me?: boolean
}

interface MessageHistoryEntry {
  id: string
  action: string
  timestamp: string
  recipient_name: string
  message_preview: string
}

interface AppProps {
  onClose: () => void
  setRefreshHandler?: (handler: (() => void) | null) => void
  openWindow?: (config: { id: string; title: string; content: React.ReactNode; width?: number; height?: number }) => void
}

// View modes for the app
type ViewMode = 'contacts' | 'endpoint_selection' | 'conversation'

export default function MessagesApp({ setRefreshHandler }: AppProps) {
  const readOnly = useReadOnly()
  const [messages, setMessages] = useState<Message[]>([])
  const [messageHistory, setMessageHistory] = useState<MessageHistoryEntry[]>([])
  const [recipients, setRecipients] = useState<Record<string, Recipient>>({})
  const [selectedRecipient, setSelectedRecipient] = useState<Recipient | null>(null)
  const [messageInput, setMessageInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sendingMessage, setSendingMessage] = useState(false)
  const loadDataRef = useRef<() => void>(() => {})

  // New state for features
  const [viewMode, setViewMode] = useState<ViewMode>('contacts')
  const [searchQuery, setSearchQuery] = useState('')
  const [mediaAttachments, setMediaAttachments] = useState<MediaAttachment[]>([])
  const [pendingRecipient, setPendingRecipient] = useState<Recipient | null>(null) // For endpoint selection
  const [recipientCardData, setRecipientCardData] = useState<Recipient | null>(null) // For ask_for_message_body
  const mediaIdCounter = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Message viewing/editing state
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editedMessageBody, setEditedMessageBody] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Store image data URLs persistently (keyed by media_id)
  const [imageDataUrls, setImageDataUrls] = useState<Record<string, string>>({})

  const api = useBackendAPI('messages')

  // Stable callback for refreshing the app - used by admin panel
  const refreshApp = useCallback(() => {
    loadDataRef.current()
  }, [])

  // Store setRefreshHandler in a ref to avoid re-trigger loops
  const setRefreshHandlerRef = useRef(setRefreshHandler)
  setRefreshHandlerRef.current = setRefreshHandler

  // Register refresh handler once on mount
  useEffect(() => {
    setRefreshHandlerRef.current?.(refreshApp)
    return () => {
      setRefreshHandlerRef.current?.(null)
    }
  }, [refreshApp])

  const transformContactToRecipient = useCallback((contactId: string, contact: any): Recipient => {
    // Transform Contacts API structure to Recipient structure
    const name = contact.names?.[0]
      ? `${contact.names[0].givenName || ''} ${contact.names[0].familyName || ''}`.trim()
      : null
    const phone = contact.phoneNumbers?.[0]?.value || null

    return {
      contact_id: contactId,
      contact_name: name || phone || 'Unknown Contact',
      phone_number: phone,
      contact_endpoints: contact.phoneNumbers?.map((p: any) => ({
        endpoint_type: 'PHONE_NUMBER',
        endpoint_value: p.value,
        endpoint_label: p.type
      })) || [],
      contact_photo_url: contact.photos?.[0]?.url || null
    }
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Fetch from state endpoint to get all messages data
      const response = await fetch('./api/services/messages/state')
      const data = await response.json()

      const messagesData: Message[] = Object.values(data.state?.messages || {})
      let rawRecipients: Record<string, any> = data.state?.recipients || {}
      const historyData: MessageHistoryEntry[] = data.state?.message_history || []

      // Messages backend proxies recipients from contacts.myContacts via a live
      // link; when the contacts service isn't up, that dict is empty. Fall back
      // to asking the contacts service directly so the conversation list is
      // never blank when contacts actually exist.
      if (Object.keys(rawRecipients).length === 0) {
        try {
          const contactsRes = await fetch('./api/services/contacts/state')
          if (contactsRes.ok) {
            const contactsData = await contactsRes.json()
            rawRecipients = contactsData.state?.myContacts
              || contactsData.state?.contacts
              || {}
          }
        } catch {
          /* leave empty; existing empty-state UI handles it */
        }
      }

      // Transform Contacts API format to Recipient format
      const recipientsData: Record<string, Recipient> = {}
      for (const [contactId, contact] of Object.entries(rawRecipients)) {
        recipientsData[contactId] = transformContactToRecipient(contactId, contact)
      }

      // Sort messages by timestamp (newest first)
      messagesData.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

      // Sort history by timestamp (newest first)
      historyData.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

      setMessages(messagesData)
      setRecipients(recipientsData)
      setMessageHistory(historyData)

      const record = requestedSnapshotRecord('messages')
      if (record) {
        const message = messagesData.find(item => item.id === record)
        // A message link uses its stored counterpart. A recipient link can
        // also show an existing contact's genuinely empty conversation.
        const recipient = message
          ? ((message as any).message_type === 'inbox' && (message as any).sender ? (message as any).sender : message.recipient)
          : recipientsData[record]
        if (recipient) {
          setSelectedRecipient(recipient)
          setRecipientCardData(recipient)
          setViewMode('conversation')
        } else reportMissingSnapshotRecord('messages', record)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [transformContactToRecipient])

  // Keep the ref always up to date with the latest loadData
  useEffect(() => {
    loadDataRef.current = loadData
  })

  // Load initial data only once on mount
  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sendMessage = async () => {
    if ((!messageInput.trim() && mediaAttachments.length === 0) || !selectedRecipient) return

    setSendingMessage(true)
    try {
      // Strip out phone_number field and ensure only one endpoint
      // API requires exactly one endpoint for sending messages
      const { phone_number, ...recipientBase } = selectedRecipient
      const apiRecipient = {
        ...recipientBase,
        contact_endpoints: recipientBase.contact_endpoints.slice(0, 1) // Only send first endpoint
      }

      // Validation: ensure at least one of message_body or media_attachments
      const trimmedMessage = messageInput.trim()
      if (!trimmedMessage && mediaAttachments.length === 0) {
        // Call ask_for_message_body API when message body is missing
        const { phone_number: _pn, ...cleanRecip } = selectedRecipient
        await api.callTool('ask_for_message_body', {
          recipient: { ...cleanRecip, contact_endpoints: cleanRecip.contact_endpoints.slice(0, 1) }
        }).catch(() => {})
        setError('Please enter a message or attach an image')
        setSendingMessage(false)
        return
      }

      // Build params - backend DB requires message_body to be a string (not null)
      // If only sending images, use a placeholder message
      const messageBody = trimmedMessage || (mediaAttachments.length > 0 ? '[Image]' : '')

      // Pre-send validation step via prepare_chat_message
      await api.callTool('prepare_chat_message', {
        message_body: messageBody,
        recipients: [apiRecipient],
      }).catch(() => {/* proceed even if prepare fails */})

      const params: Record<string, unknown> = {
        recipient: apiRecipient,
        message_body: messageBody,
      }

      // Add media attachments if any (strip local-only fields)
      if (mediaAttachments.length > 0) {
        params.media_attachments = mediaAttachments.map(({ media_id, media_type, source }) => ({
          media_id,
          media_type,
          source
        }))
      }

      const result = await api.callTool<{ sent_message_id?: string }>('send_chat_message', params)

      // Ensure the sent message is persisted in backend state
      const stateResponse = await fetch('./api/services/messages/state')
      const stateData = await stateResponse.json()
      const currentState = stateData.state || {}
      if (!currentState.messages) currentState.messages = {}
      if (!currentState.message_history) currentState.message_history = []

      const messageId = result?.sent_message_id || `msg_${Date.now()}`
      // Only add if not already persisted by the tool
      if (!currentState.messages[messageId]) {
        currentState.messages[messageId] = {
          id: messageId,
          recipient: apiRecipient,
          message_body: messageBody,
          media_attachments: mediaAttachments.map(({ media_id, media_type, source }) => ({
            media_id, media_type, source
          })),
          timestamp: new Date().toISOString(),
          status: 'sent',
          is_from_me: true
        }
        currentState.message_history.push({
          id: messageId,
          action: 'sent',
          timestamp: new Date().toISOString(),
          recipient_name: apiRecipient.contact_name,
          message_preview: messageBody.slice(0, 50)
        })
        await fetch('./api/services/messages/state', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: currentState })
        })
      }

      setMessageInput('')
      // Clean up preview URLs before clearing
      mediaAttachments.forEach(a => {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl)
      })
      setMediaAttachments([])
      await loadData()
    } catch (err) {
      console.error('Send message error:', err)
      const errorMessage = err instanceof Error ? err.message : String(err)
      setError(`Failed to send message: ${errorMessage}`)
    } finally {
      setSendingMessage(false)
    }
  }

  // Mark messages from a recipient as read in the backend
  const markConversationAsRead = async (recipient: Recipient) => {
    if (readOnly) return
    try {
      const stateResponse = await fetch('./api/services/messages/state')
      const stateData = await stateResponse.json()
      const currentState = stateData.state || {}
      if (!currentState.message_history) return

      let updated = false
      for (const entry of currentState.message_history) {
        if (entry.action !== 'read') {
          // Check if this history entry belongs to the recipient (use sender for inbox msgs).
          const msg = (currentState.messages || {})[entry.id]
          const other = msg?.message_type === 'inbox' && msg?.sender ? msg.sender : msg?.recipient
          if (msg && recipientsMatch(other, recipient)) {
            entry.action = 'read'
            updated = true
          }
        }
      }

      if (updated) {
        await fetch('./api/services/messages/state', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: currentState })
        })
        await loadData()
      }
    } catch {
      // Silently ignore - read receipts are not critical
    }
  }

  // Handle contact selection - check for multiple endpoints
  const handleContactSelect = async (recipient: Recipient) => {
    const endpoints = recipient.contact_endpoints || []
    if (readOnly) {
      if (endpoints.length > 1) {
        setPendingRecipient(recipient)
        setViewMode('endpoint_selection')
      } else if (endpoints.length === 1) {
        setRecipientCardData(recipient)
        setSelectedRecipient(recipient)
        setViewMode('conversation')
      } else {
        setError('This contact has no phone number')
      }
      return
    }

    // Strip out phone_number field - backend doesn't accept extra fields
    const { phone_number, ...cleanRecipient } = recipient

    if (endpoints.length > 1) {
      // Multiple phone numbers - show endpoint selection
      setPendingRecipient(recipient)
      try {
        // Call show_message_recipient_choices API to validate
        await api.callTool('show_message_recipient_choices', {
          recipients: [cleanRecipient],
          message_body: null
        })
        setViewMode('endpoint_selection')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load recipient choices')
      }
    } else if (endpoints.length === 1) {
      // Single endpoint - use ask_for_message_body to show recipient card
      try {
        const result = await api.callTool<{
          action_card_content_passthrough?: { recipient: Recipient }
        }>('ask_for_message_body', {
          recipient: cleanRecipient
        })
        if (result.action_card_content_passthrough?.recipient) {
          setRecipientCardData(result.action_card_content_passthrough.recipient)
        }
        setSelectedRecipient(recipient)
        setViewMode('conversation')
        markConversationAsRead(recipient)
      } catch (err) {
        // If ask_for_message_body fails, just proceed with the recipient
        setSelectedRecipient(recipient)
        setViewMode('conversation')
        markConversationAsRead(recipient)
      }
    } else {
      // No endpoints - shouldn't happen but handle gracefully
      setError('This contact has no phone number')
    }
  }

  // Handle endpoint selection from multiple choices
  const handleEndpointSelect = async (endpoint: ContactEndpoint) => {
    if (!pendingRecipient) return

    // Strip out phone_number field - backend doesn't accept extra fields
    const { phone_number, ...cleanPendingRecipient } = pendingRecipient

    const recipientWithSelectedEndpoint: Recipient = {
      ...cleanPendingRecipient,
      contact_endpoints: [endpoint] // Only the selected endpoint
    }

    if (readOnly) {
      setRecipientCardData(recipientWithSelectedEndpoint)
    } else try {
      // Call ask_for_message_body to show recipient card
      const result = await api.callTool<{
        action_card_content_passthrough?: { recipient: Recipient }
      }>('ask_for_message_body', {
        recipient: recipientWithSelectedEndpoint
      })
      if (result.action_card_content_passthrough?.recipient) {
        setRecipientCardData(result.action_card_content_passthrough.recipient)
      }
    } catch {
      // Proceed even if the API call fails
    }

    // Keep phone_number in the local state for display purposes
    const recipientForView = { ...recipientWithSelectedEndpoint, phone_number }
    setSelectedRecipient(recipientForView)
    setPendingRecipient(null)
    setViewMode('conversation')
    markConversationAsRead(recipientForView)
  }

  // Trigger file input click
  const handleAddImageClick = () => {
    fileInputRef.current?.click()
  }

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    Array.from(files).forEach(file => {
      // Only accept image files
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file')
        return
      }

      // Use simple media_id format to avoid any character issues
      const mediaId = `img_${Date.now()}_${++mediaIdCounter.current}`

      // Create preview URL for immediate display
      const previewUrl = URL.createObjectURL(file)

      // Also convert to data URL for persistence
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        setImageDataUrls(prev => ({ ...prev, [mediaId]: dataUrl }))
      }
      reader.readAsDataURL(file)

      const newAttachment: MediaAttachment = {
        media_id: mediaId,
        media_type: 'IMAGE',
        source: 'IMAGE_UPLOAD',
        fileName: file.name,
        previewUrl: previewUrl
      }
      setMediaAttachments(prev => [...prev, newAttachment])
    })

    // Reset file input so the same file can be selected again
    e.target.value = ''
  }

  // Remove media attachment
  const removeMediaAttachment = (mediaId: string) => {
    setMediaAttachments(prev => {
      const attachment = prev.find(a => a.media_id === mediaId)
      // Revoke object URL to prevent memory leak
      if (attachment?.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl)
      }
      return prev.filter(a => a.media_id !== mediaId)
    })
  }

  // Filter recipients based on search query
  const filteredRecipients = Object.values(recipients).filter(recipient => {
    if (!searchQuery.trim()) return true
    const name = (recipient.contact_name || '').toLowerCase()
    const phone = recipient.contact_endpoints?.[0]?.endpoint_value || recipient.phone_number || ''
    return name.includes(searchQuery.toLowerCase()) || phone.includes(searchQuery)
  })

  // Check if search yielded no results (for showing "not found" UI)
  const showNotFound = searchQuery.trim() && filteredRecipients.length === 0

  // Handle showing "recipient not found" via API
  const handleShowNotFound = async () => {
    try {
      await api.callTool('show_message_recipient_not_found_or_specified', {
        contact_name: searchQuery.trim() || null,
        message_body: null
      })
    } catch {
      // Ignore errors - this is just for API recording
    }
  }

  // Call show_message_recipient_not_found_or_specified when search yields no results
  useEffect(() => {
    if (showNotFound) {
      handleShowNotFound()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showNotFound])

  // Reset view when going back to contacts
  const handleBackToContacts = () => {
    setSelectedRecipient(null)
    setPendingRecipient(null)
    setRecipientCardData(null)
    // Clean up preview URLs before clearing
    mediaAttachments.forEach(a => {
      if (a.previewUrl) URL.revokeObjectURL(a.previewUrl)
    })
    setMediaAttachments([])
    setMessageInput('')
    setViewMode('contacts')
  }

  // Handle clicking on a message in Recent Activity
  const handleActivityClick = (entry: MessageHistoryEntry) => {
    // Find the full message
    const message = messages.find(m => m.id === entry.id)
    if (!message) return

    // Find the recipient in our recipients list that matches
    const matchingRecipient = Object.values(recipients).find(r =>
      getRecipientName(r) === entry.recipient_name ||
      getRecipientName(r) === getRecipientName(message.recipient)
    )

    if (matchingRecipient) {
      // Use the recipient from our list (has proper structure)
      setSelectedRecipient(matchingRecipient)
      setRecipientCardData(matchingRecipient)
    } else {
      // Fall back to the recipient from the message
      setSelectedRecipient(message.recipient)
      setRecipientCardData(message.recipient)
    }

    setViewMode('conversation')
    markConversationAsRead(matchingRecipient || message.recipient)

    // Also open the message detail modal
    setSelectedMessage(message)
    setEditedMessageBody(message.message_body || '')
  }

  // Open message detail view
  const handleMessageClick = (message: Message) => {
    setSelectedMessage(message)
    setEditedMessageBody(message.message_body || '')
    setIsEditing(false)
    setShowDeleteConfirm(false)
  }

  // Close message detail view
  const closeMessageDetail = () => {
    setSelectedMessage(null)
    setIsEditing(false)
    setEditedMessageBody('')
    setShowDeleteConfirm(false)
  }

  // Start editing a message
  const startEditing = () => {
    if (selectedMessage) {
      setEditedMessageBody(selectedMessage.message_body || '')
      setIsEditing(true)
    }
  }

  // Save edited message
  const saveEditedMessage = async () => {
    if (!selectedMessage || !editedMessageBody.trim()) return

    try {
      // Fetch current state
      const response = await fetch('./api/services/messages/state')
      const data = await response.json()
      const currentState = data.state

      // Update the message
      if (currentState.messages[selectedMessage.id]) {
        currentState.messages[selectedMessage.id].message_body = editedMessageBody.trim()

        // Also update message_history preview if exists
        const historyEntry = currentState.message_history?.find(
          (h: MessageHistoryEntry) => h.id === selectedMessage.id
        )
        if (historyEntry) {
          historyEntry.message_preview = editedMessageBody.trim().slice(0, 50)
        }

        // Note: Cannot add audit trail to message_history for edits because the backend
        // MessageAction enum only supports: sent, delivered, failed, read, pending

        // Save updated state
        await fetch('./api/services/messages/state', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: currentState })
        })

        await loadData()
        closeMessageDetail()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to edit message')
    }
  }

  // Delete a message
  const deleteMessage = async () => {
    if (!selectedMessage) return

    try {
      // Fetch current state
      const response = await fetch('./api/services/messages/state')
      const data = await response.json()
      const currentState = data.state

      // Delete the message
      if (currentState.messages[selectedMessage.id]) {
        const deletedMessage = currentState.messages[selectedMessage.id]
        delete currentState.messages[selectedMessage.id]

        // Also remove from message_history
        if (currentState.message_history) {
          currentState.message_history = currentState.message_history.filter(
            (h: MessageHistoryEntry) => h.id !== selectedMessage.id
          )
        }

        // Note: Cannot add audit trail to message_history for deletes because the backend
        // MessageAction enum only supports: sent, delivered, failed, read, pending

        // Save updated state
        await fetch('./api/services/messages/state', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: currentState })
        })

        await loadData()
        closeMessageDetail()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete message')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent':
        return 'text-[var(--success-color)]'
      case 'failed':
        return 'text-[var(--danger-color)]'
      case 'pending':
        return 'text-[var(--warning-color)]'
      default:
        return 'text-[var(--text-secondary)]'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sent':
        return '✓'
      case 'failed':
        return '✕'
      case 'pending':
        return '⏱'
      default:
        return '•'
    }
  }

  const getRecipientName = (recipient: Recipient) => {
    return recipient.contact_name || recipient.phone_number || 'Unknown Contact'
  }

  // The "other party" of a message. For inbox messages the app's user (current
  // device owner) is the recipient, so the conversation partner is the sender.
  const otherParty = (msg: Message): Recipient => {
    const mt = (msg as any).message_type
    const sender = (msg as any).sender as Recipient | null | undefined
    if (mt === 'inbox' && sender) return sender
    return msg.recipient
  }

  const normalizePhone = (s?: string | null) => (s ?? '').replace(/[^\d]/g, '')

  // Match recipients by contact_id OR name OR any shared phone number. The
  // messages DB and contacts DB are seeded independently, so the stricter
  // name+phone match misses rows where one side is slightly different.
  const recipientsMatch = (a: Recipient | null, b: Recipient | null): boolean => {
    if (!a || !b) return false
    if (a.contact_id && b.contact_id && a.contact_id === b.contact_id) return true
    const aName = getRecipientName(a).toLowerCase()
    const bName = getRecipientName(b).toLowerCase()
    if (aName && bName && aName === bName) return true
    const aPhones = (a.contact_endpoints || []).map(e => normalizePhone(e.endpoint_value))
    const bPhones = (b.contact_endpoints || []).map(e => normalizePhone(e.endpoint_value))
    return aPhones.some(p => p && bPhones.includes(p))
  }

  // Get the latest message for a recipient (for preview in contact list).
  const getLatestMessageForRecipient = (recipient: Recipient): Message | undefined => {
    return messages.find(msg => recipientsMatch(otherParty(msg), recipient))
  }

  const getRecipientAvatar = (recipient: Recipient) => {
    if (recipient.contact_photo_url) {
      return (
        <img
          src={recipient.contact_photo_url}
          alt=""
          className="w-10 h-10 rounded-full object-cover"
        />
      )
    }

    const name = recipient.contact_name || recipient.phone_number || 'Unknown'
    const initial = name.charAt(0).toUpperCase()
    const colors = ['#E91E63', '#9C27B0', '#673AB7', '#3F51B5', '#2196F3', '#009688', '#4CAF50', '#FF9800']
    const colorIndex = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length

    return (
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg"
        style={{ backgroundColor: colors[colorIndex] }}
      >
        {initial}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="w-8 h-8 border-4 border-[var(--accent-color)]/30 border-t-[var(--accent-color)] rounded-full animate-spin" />
      </div>
    )
  }

  if (error && messages.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-[var(--bg-primary)] gap-4">
        <p className="text-[var(--danger-color)]">{error}</p>
        <button
          className="px-4 py-2 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-colors font-medium"
          onClick={loadData}
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-[var(--bg-primary)]">
      {/* Header */}
      <div className="p-4 bg-[var(--bg-secondary)] border-b border-[var(--border-color)]">
        <h1 className="text-xl font-bold text-[var(--text-primary)]">Messages</h1>
        {selectedRecipient && (
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            To: {selectedRecipient.contact_name}
          </p>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {viewMode === 'contacts' ? (
          /* Recipient selection view */
          <div className="p-4 flex-1 overflow-auto">
            {/* Search input */}
            <div className="mb-4">
              <input
                type="text"
                className="w-full px-4 py-3 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
                placeholder="Search contacts..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            <h2 className="text-sm font-semibold text-[var(--text-secondary)] mb-3 uppercase tracking-wide">
              Select a recipient
            </h2>

            {/* Recipient not found UI */}
            {showNotFound ? (
              <div className="flex flex-col items-center justify-center py-12 text-[var(--text-secondary)]">
                <span className="text-5xl mb-3">🔍</span>
                <p className="text-lg font-medium">Recipient not found</p>
                <p className="text-sm mt-1">No contacts match "{searchQuery}"</p>
                <button
                  className="mt-4 px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--border-color)] rounded-lg transition-colors text-sm"
                  onClick={() => setSearchQuery('')}
                >
                  Clear search
                </button>
              </div>
            ) : Object.values(recipients).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-[var(--text-secondary)]">
                <span className="text-5xl mb-3">👤</span>
                <p className="text-lg">No contacts available</p>
                <p className="text-sm mt-1">Add contacts to start messaging</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredRecipients.map((recipient) => (
                  <button
                    key={recipient.contact_id || getRecipientName(recipient)}
                    className="w-full flex items-center gap-3 p-3 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors border border-[var(--border-color)]"
                    onClick={() => handleContactSelect(recipient)}
                  >
                    {getRecipientAvatar(recipient)}
                    <div className="flex-1 text-left min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-[var(--text-primary)] truncate">
                          {getRecipientName(recipient)}{recipient.contact_id && <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{recipient.contact_id}]</span>}
                        </span>
                        {(() => {
                          const latestMsg = getLatestMessageForRecipient(recipient)
                          return latestMsg ? (
                            <span className="text-xs text-[var(--text-tertiary)] whitespace-nowrap">
                              {formatTimestamp(latestMsg.timestamp)}
                            </span>
                          ) : null
                        })()}
                      </div>
                      <div className="flex items-center gap-2">
                        {(() => {
                          const latestMsg = getLatestMessageForRecipient(recipient)
                          if (latestMsg) {
                            return (
                              <span className="text-sm text-[var(--text-secondary)] truncate flex-1">
                                {latestMsg.message_body
                                  ? latestMsg.message_body.slice(0, 50) + (latestMsg.message_body.length > 50 ? '...' : '')
                                  : latestMsg.media_attachments.length > 0 ? '[Image]' : ''}
                              </span>
                            )
                          }
                          return (
                            <>
                              {recipient.contact_endpoints?.[0] && (
                                <span className="text-sm text-[var(--text-secondary)]">
                                  {recipient.contact_endpoints[0].endpoint_value}
                                </span>
                              )}
                              {!recipient.contact_endpoints && recipient.phone_number && (
                                <span className="text-sm text-[var(--text-secondary)]">
                                  {recipient.phone_number}
                                </span>
                              )}
                            </>
                          )
                        })()}
                        {/* Show badge if multiple phone numbers */}
                        {(recipient.contact_endpoints?.length || 0) > 1 && (
                          <span className="px-2 py-0.5 text-xs bg-[var(--accent-color)]/20 text-[var(--accent-color)] rounded-full shrink-0">
                            {recipient.contact_endpoints?.length} numbers
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Message History */}
            {messageHistory.length > 0 && !showNotFound && (
              <div className="mt-8">
                <h2 className="text-sm font-semibold text-[var(--text-secondary)] mb-3 uppercase tracking-wide">
                  Recent Activity
                </h2>
                <div className="space-y-2">
                  {messageHistory.slice(0, 10).map((entry) => (
                    <button
                      key={`${entry.id}-${entry.timestamp}`}
                      className="w-full p-3 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] hover:bg-[var(--bg-tertiary)] transition-colors text-left"
                      onClick={() => handleActivityClick(entry)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-[var(--text-primary)] truncate">
                              {entry.recipient_name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{entry.id}]</span>
                            </span>
                            <span className={`text-xs ${getStatusColor(entry.action)}`}>
                              {getStatusIcon(entry.action)} {entry.action}
                            </span>
                          </div>
                          <p className="text-sm text-[var(--text-secondary)] truncate mt-1">
                            {entry.message_preview}
                          </p>
                        </div>
                        <span className="text-xs text-[var(--text-tertiary)] whitespace-nowrap">
                          {formatTimestamp(entry.timestamp)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : viewMode === 'endpoint_selection' && pendingRecipient ? (
          /* Endpoint selection view - for contacts with multiple phone numbers */
          <div className="p-4">
            <button
              className="text-[var(--accent-color)] hover:text-[var(--accent-hover)] font-medium text-sm mb-4"
              onClick={handleBackToContacts}
            >
              ← Back to contacts
            </button>

            <div className="flex items-center gap-4 mb-6 p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]">
              {getRecipientAvatar(pendingRecipient)}
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                  {getRecipientName(pendingRecipient)}{pendingRecipient.contact_id && <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{pendingRecipient.contact_id}]</span>}
                </h2>
                <p className="text-sm text-[var(--text-secondary)]">
                  {readOnly ? 'Select a phone number' : 'Select a phone number to message'}
                </p>
              </div>
            </div>

            <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-3 uppercase tracking-wide">
              Phone Numbers
            </h3>
            <div className="space-y-2">
              {pendingRecipient.contact_endpoints?.map((endpoint, index) => (
                <button
                  key={`${endpoint.endpoint_value}-${index}`}
                  className="w-full flex items-center gap-3 p-4 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors border border-[var(--border-color)]"
                  onClick={() => handleEndpointSelect(endpoint)}
                >
                  <div className="w-10 h-10 rounded-full bg-[var(--accent-color)]/20 flex items-center justify-center">
                    <span className="text-lg">📱</span>
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-medium text-[var(--text-primary)]">
                      {endpoint.endpoint_value}
                    </div>
                    {endpoint.endpoint_label && (
                      <div className="text-sm text-[var(--text-secondary)] capitalize">
                        {endpoint.endpoint_label}
                      </div>
                    )}
                  </div>
                  <span className="text-[var(--text-tertiary)]">→</span>
                </button>
              ))}
            </div>
          </div>
        ) : !selectedRecipient ? (
          /* Null guard - redirect back to contacts if no recipient selected */
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] p-8">
            <span className="text-5xl mb-3">💬</span>
            <p className="text-lg mb-4">No recipient selected</p>
            <button
              className="px-4 py-2 bg-[var(--accent-color)] text-white rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
              onClick={handleBackToContacts}
            >
              Back to contacts
            </button>
          </div>
        ) : (
          /* Conversation view */
          <div className="flex flex-col h-full min-h-0" data-snapshot-record={selectedRecipient.contact_id}>
            {/* Back button */}
            <div className="p-3 border-b border-[var(--border-color)]">
              <button
                className="text-[var(--accent-color)] hover:text-[var(--accent-hover)] font-medium text-sm"
                onClick={handleBackToContacts}
              >
                ← Back to contacts
              </button>
            </div>

            {/* Recipient Card (from ask_for_message_body) */}
            {recipientCardData && selectedRecipient && (
              <div className="p-4 bg-[var(--bg-secondary)] border-b border-[var(--border-color)]">
                <div className="flex items-center gap-3">
                  {getRecipientAvatar(recipientCardData)}
                  <div className="flex-1">
                    <div className="font-medium text-[var(--text-primary)]">
                      {recipientCardData.contact_name}{recipientCardData.contact_id && <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{recipientCardData.contact_id}]</span>}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                      <span>{recipientCardData.contact_endpoints?.[0]?.endpoint_value}</span>
                      {recipientCardData.contact_endpoints?.[0]?.endpoint_label && (
                        <span className="px-2 py-0.5 text-xs bg-[var(--bg-tertiary)] rounded capitalize">
                          {recipientCardData.contact_endpoints[0].endpoint_label}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Messages with this recipient */}
            <div className="flex-1 overflow-auto p-4">
              {(() => {
                const conversationMessages = messages
                  .filter(msg => recipientsMatch(otherParty(msg), selectedRecipient))
                  .slice()
                  .reverse()
                return conversationMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)]">
                    <span className="text-5xl mb-3">💬</span>
                    <p className="text-lg">No messages yet</p>
                    {!readOnly && <p className="text-sm mt-1">Send your first message below</p>}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {conversationMessages.map((msg, index) => {
                      // Derive direction from message_type (set by backend) with
                      // is_from_me as a legacy fallback. message_type === 'inbox'
                      // means the user received it; 'sent'/'draft' are outbound.
                      const mt = (msg as any).message_type
                      const isFromMe = mt === 'inbox'
                        ? false
                        : (mt === 'sent' || mt === 'draft')
                          ? true
                          : (msg.is_from_me ?? true)
                      return (
                        <div key={msg.id} data-snapshot-record={msg.id} data-snapshot-message={msg.id} className={`flex ${isFromMe ? 'justify-end' : 'justify-start'}`}>
                          <div className={`flex flex-col ${isFromMe ? 'items-end' : 'items-start'} max-w-[75%]`}>
                            <div className="flex items-baseline gap-2 mb-1">
                              {!isFromMe && (
                                <span className="text-xs font-medium text-[var(--accent-color)]">
                                  {getRecipientName(msg.recipient)}
                                </span>
                              )}
                              <span style={{ fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{msg.id}]</span>
                              <span className="text-xs text-[var(--text-tertiary)]">
                                {formatTimestamp(msg.timestamp)}
                              </span>
                              {isFromMe && (
                                <span className={`text-xs ${getStatusColor(msg.status)}`}>
                                  {getStatusIcon(msg.status)}
                                </span>
                              )}
                            </div>
                            <button
                              className="p-3 rounded-2xl text-left cursor-pointer hover:opacity-90 transition-opacity"
                              style={{
                                background: isFromMe
                                  ? 'linear-gradient(135deg, #34C759 0%, #30D158 100%)'
                                  : 'var(--bg-tertiary)',
                              }}
                              onClick={() => handleMessageClick(msg)}
                              title="Click to view/edit message"
                            >
                              {msg.message_body && (
                                <p className={`whitespace-pre-wrap break-words ${isFromMe ? 'text-white' : 'text-[var(--text-primary)]'}`}>
                                  {msg.message_body}
                                </p>
                              )}
                              {msg.media_attachments.length > 0 && (
                                <div className={`flex flex-wrap gap-2 ${msg.message_body ? 'mt-2' : ''}`}>
                                  {msg.media_attachments.map((media) => {
                                    const imageUrl = imageDataUrls[media.media_id]
                                    return imageUrl ? (
                                      <img
                                        key={media.media_id}
                                        src={imageUrl}
                                        alt="Attached image"
                                        className="max-w-[200px] max-h-[200px] rounded-lg object-cover"
                                      />
                                    ) : (
                                      <div
                                        key={media.media_id}
                                        className={`px-2 py-1 rounded text-xs ${isFromMe ? 'bg-white/20 text-white' : 'bg-[var(--border-color)] text-[var(--text-secondary)]'}`}
                                      >
                                        📎 {media.media_type}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{media.media_id}]</span>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Message input (shown when recipient is selected) */}
      {!readOnly && selectedRecipient && viewMode === 'conversation' && (
        <div className="p-4 border-t border-[var(--border-color)] bg-[var(--bg-secondary)]">
          {error && (
            <div className="mb-2 p-2 bg-[var(--danger-color)]/10 border border-[var(--danger-color)] rounded text-sm text-[var(--danger-color)]">
              {error}
            </div>
          )}

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />

          {/* Media Attachments Preview */}
          {mediaAttachments.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {mediaAttachments.map((attachment) => (
                <div
                  key={attachment.media_id}
                  className="relative group"
                >
                  {attachment.previewUrl ? (
                    <div className="relative">
                      <img
                        src={attachment.previewUrl}
                        alt={attachment.fileName || 'Attached image'}
                        className="w-20 h-20 object-cover rounded-lg border border-[var(--border-color)]"
                      />
                      <button
                        className="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center rounded-full bg-[var(--danger-color)] text-white hover:bg-red-600 text-xs shadow-md"
                        onClick={() => removeMediaAttachment(attachment.media_id)}
                        title="Remove attachment"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg">
                      <span className="text-lg">🖼️</span>
                      <span className="text-sm text-[var(--text-primary)]">{attachment.fileName || attachment.media_id}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{attachment.media_id}]</span></span>
                      <button
                        className="ml-1 w-5 h-5 flex items-center justify-center rounded-full bg-[var(--danger-color)]/20 text-[var(--danger-color)] hover:bg-[var(--danger-color)]/30 text-xs"
                        onClick={() => removeMediaAttachment(attachment.media_id)}
                        title="Remove attachment"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                  {attachment.previewUrl && (
                    <p className="text-xs text-[var(--text-secondary)] mt-1 truncate max-w-20 text-center">
                      {attachment.fileName || ''}<span style={{ marginLeft: '4px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{attachment.media_id}]</span>
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg overflow-hidden">
            <textarea
              className="w-full px-4 py-3 bg-transparent text-[var(--text-primary)] text-sm resize-none focus:outline-none placeholder-[var(--text-tertiary)]"
              placeholder={`Message ${selectedRecipient.contact_name}...`}
              rows={2}
              value={messageInput}
              onChange={e => setMessageInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sendingMessage}
            />
            <div className="flex items-center justify-between px-3 py-2 border-t border-[var(--border-color)]">
              {/* Add attachment button */}
              <button
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors bg-[var(--bg-secondary)] hover:bg-[var(--border-color)] text-[var(--text-primary)]"
                onClick={handleAddImageClick}
                disabled={sendingMessage}
                title="Add image attachment"
              >
                <span>📷</span>
                <span>Add Image</span>
              </button>

              <button
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  (messageInput.trim() || mediaAttachments.length > 0) && !sendingMessage
                    ? 'bg-[var(--accent-color)] text-white hover:bg-[var(--accent-hover)]'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] cursor-not-allowed'
                }`}
                onClick={sendMessage}
                disabled={(!messageInput.trim() && mediaAttachments.length === 0) || sendingMessage}
              >
                {sendingMessage ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Refresh button (shown in contacts view) */}
      {viewMode === 'contacts' && (
        <div className="p-3 bg-[var(--bg-secondary)] border-t border-[var(--border-color)]">
          <button
            className="w-full px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--border-color)] rounded-lg transition-colors text-sm font-medium text-[var(--text-primary)]"
            onClick={loadData}
          >
            Refresh
          </button>
        </div>
      )}

      {/* Message Detail Modal */}
      {selectedMessage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-primary)] rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-4 bg-[var(--bg-secondary)] border-b border-[var(--border-color)] flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                {isEditing ? 'Edit Message' : 'Message Details'}
              </h3>
              <button
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
                onClick={closeMessageDetail}
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-auto p-4">
              {/* Recipient Info - prefer current contact data over stored message data */}
              {(() => {
                const currentRecipient = selectedRecipient && recipientsMatch(selectedMessage.recipient, selectedRecipient)
                  ? selectedRecipient
                  : selectedMessage.recipient
                return (
                  <div className="flex items-center gap-3 mb-4 p-3 bg-[var(--bg-secondary)] rounded-lg">
                    {getRecipientAvatar(currentRecipient)}
                    <div>
                      <div className="font-medium text-[var(--text-primary)]">
                        {getRecipientName(currentRecipient)}{currentRecipient.contact_id && <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{currentRecipient.contact_id}]</span>}
                      </div>
                      <div className="text-sm text-[var(--text-secondary)]">
                        {currentRecipient.contact_endpoints?.[0]?.endpoint_value}
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* Message Content */}
              <div className="mb-4">
                <label className="text-sm font-medium text-[var(--text-secondary)] mb-2 block">
                  Message
                </label>
                {isEditing ? (
                  <textarea
                    className="w-full px-4 py-3 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
                    rows={4}
                    value={editedMessageBody}
                    onChange={e => setEditedMessageBody(e.target.value)}
                    autoFocus
                  />
                ) : (
                  <div className="p-4 bg-[var(--bg-tertiary)] rounded-lg">
                    <p className="text-[var(--text-primary)] whitespace-pre-wrap">
                      {selectedMessage.message_body || '(No message body)'}
                    </p>
                  </div>
                )}
              </div>

              {/* Media Attachments */}
              {selectedMessage.media_attachments.length > 0 && (
                <div className="mb-4">
                  <label className="text-sm font-medium text-[var(--text-secondary)] mb-2 block">
                    Attachments
                  </label>
                  <div className="flex flex-wrap gap-3">
                    {selectedMessage.media_attachments.map((media) => {
                      const imageUrl = imageDataUrls[media.media_id]
                      return (
                        <div key={media.media_id} className="flex flex-col items-center">
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt="Attached image"
                              className="max-w-[150px] max-h-[150px] rounded-lg object-cover border border-[var(--border-color)]"
                            />
                          ) : (
                            <div className="w-[100px] h-[100px] bg-[var(--bg-tertiary)] rounded-lg flex items-center justify-center">
                              <span className="text-3xl">🖼️</span>
                            </div>
                          )}
                          <span style={{ marginTop: '4px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>[{media.media_id}]</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Metadata */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-[var(--text-secondary)]">Status:</span>
                  <span className={`ml-2 ${getStatusColor(selectedMessage.status)}`}>
                    {getStatusIcon(selectedMessage.status)} {selectedMessage.status}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--text-secondary)]">
                    {(() => {
                      const mt = (selectedMessage as any).message_type
                      const fromMe = mt === 'inbox'
                        ? false
                        : (mt === 'sent' || mt === 'draft')
                          ? true
                          : (selectedMessage.is_from_me ?? true)
                      return fromMe ? 'Sent:' : 'Received:'
                    })()}
                  </span>
                  <span className="ml-2 text-[var(--text-primary)]">
                    {new Date(selectedMessage.timestamp).toLocaleString()}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-[var(--text-secondary)]">Message ID:</span>
                  <span style={{ marginLeft: '8px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{selectedMessage.id}]</span>
                </div>
              </div>

              {/* Delete Confirmation */}
              {showDeleteConfirm && (
                <div className="mt-4 p-4 bg-[var(--danger-color)]/10 border border-[var(--danger-color)] rounded-lg">
                  <p className="text-[var(--danger-color)] font-medium mb-3">
                    Are you sure you want to delete this message?
                  </p>
                  <div className="flex gap-2">
                    <button
                      className="px-4 py-2 bg-[var(--danger-color)] text-white rounded-lg hover:opacity-90 text-sm font-medium"
                      onClick={deleteMessage}
                    >
                      Yes, Delete
                    </button>
                    <button
                      className="px-4 py-2 bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-lg hover:bg-[var(--border-color)] text-sm font-medium"
                      onClick={() => setShowDeleteConfirm(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-[var(--bg-secondary)] border-t border-[var(--border-color)] flex justify-between">
              {isEditing ? (
                <>
                  <button
                    className="px-4 py-2 bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-lg hover:bg-[var(--border-color)] text-sm font-medium"
                    onClick={() => setIsEditing(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="px-4 py-2 bg-[var(--accent-color)] text-white rounded-lg hover:bg-[var(--accent-hover)] text-sm font-medium"
                    onClick={saveEditedMessage}
                    disabled={!editedMessageBody.trim()}
                  >
                    Save Changes
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="px-4 py-2 bg-[var(--danger-color)]/10 text-[var(--danger-color)] rounded-lg hover:bg-[var(--danger-color)]/20 text-sm font-medium"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    Delete
                  </button>
                  <button
                    className="px-4 py-2 bg-[var(--accent-color)] text-white rounded-lg hover:bg-[var(--accent-hover)] text-sm font-medium"
                    onClick={startEditing}
                  >
                    Edit Message
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
