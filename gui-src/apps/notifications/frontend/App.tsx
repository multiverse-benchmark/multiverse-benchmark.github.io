import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { RefreshCw, Filter as FilterIcon, Bell, Search, X, EyeOff } from 'lucide-react'
import { useBackendAPI, BACKEND_STATE_CHANGED_EVENT, dispatchBackendStateChanged } from '@shared/hooks/useBackendAPI'
import { useBadge } from '@shared/hooks/useBadge'
import type { BundledNotification, NotificationsResponse, ReplyResponse } from './types'
import { NotificationCard } from './components/NotificationCard'
import { NotificationGroup } from './components/NotificationGroup'
import { LoadingSkeleton } from './components/LoadingSkeleton'
import { EmptyState } from './components/EmptyState'
import { ErrorBoundary } from './components/ErrorBoundary'
import { MOCK_NOTIFICATIONS, USE_MOCK_DATA, generateNewMockNotification, INITIAL_VIEWED_NOTIFICATIONS } from './mockData'

// Storage version constant - bump this to force clean state reset
const STORAGE_VERSION = '10'

const STATE_API_BASE = './api'

interface AppProps {
  onClose: () => void
  setRefreshHandler?: (handler: (() => void) | null) => void
}

/** Deduplicate notifications by key, keeping the first occurrence */
function deduplicateByKey(notifications: BundledNotification[]): BundledNotification[] {
  const seen = new Set<string>()
  return notifications.filter(notif => {
    if (seen.has(notif.key)) return false
    seen.add(notif.key)
    return true
  })
}

/** Clear notifications-related localStorage keys for a fresh state */
function clearNotificationsLocalStorage() {
  localStorage.removeItem('notifications_viewed')
  localStorage.removeItem('notifications_dismissed')
  localStorage.removeItem('notifications_badge')
}

/** Filter out notifications with zero messages or all-empty content */
function filterEmptyNotifications(notifications: BundledNotification[]): BundledNotification[] {
  return notifications.filter(notif => {
    if (!notif.message_notifications || notif.message_notifications.length === 0) return false
    // Check if at least one message has non-empty content
    const hasContent = notif.message_notifications.some(
      msg => msg.content && msg.content.trim().length > 0
    )
    return hasContent
  })
}

// --- State API helpers (read/write backend state without side effects) ---

async function fetchServiceState(serviceName: string): Promise<any> {
  try {
    const response = await fetch(`${STATE_API_BASE}/services/${serviceName}/state`)
    if (!response.ok) return null
    const data = await response.json()
    return data.state
  } catch {
    return null
  }
}

async function saveServiceState(serviceName: string, state: any): Promise<boolean> {
  try {
    const response = await fetch(`${STATE_API_BASE}/services/${serviceName}/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state })
    })
    return response.ok
  } catch {
    return false
  }
}

async function callServiceTool(serviceName: string, toolName: string, params: Record<string, any>): Promise<any> {
  try {
    const response = await fetch(`${STATE_API_BASE}/services/${serviceName}/tools/${toolName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ params })
    })
    if (!response.ok) return null
    const data = await response.json()
    return data.result
  } catch {
    return null
  }
}

/** Build BundledNotification[] from raw notifications backend state (no side effects) */
function buildNotificationsFromState(state: any): {
  notifications: BundledNotification[]
  backendUnreadKeys: Set<string>
} {
  const bundles = state.bundled_notifications || {}
  const senders = state.message_senders || {}
  const messages = state.message_notifications || {}
  const backendUnreadKeys = new Set<string>()

  const notifications: BundledNotification[] = []

  for (const bundle of Object.values(bundles) as any[]) {
    const sender = senders[bundle.sender_id]
    if (!sender) continue

    const messageNotifications = (bundle.message_notification_ids || [])
      .map((msgId: string) => messages[msgId])
      .filter(Boolean)
      .map((msg: any) => ({
        sender_name: senders[msg.sender_id]?.name || '',
        content: msg.content || '',
        content_type: msg.content_type || 'text',
        date: msg.date || '',
        time_of_day: msg.time_of_day || ''
      }))

    if (!bundle.is_read) {
      backendUnreadKeys.add(bundle.key)
    }

    notifications.push({
      key: bundle.key,
      localized_app_name: bundle.localized_app_name || '',
      app_package_name: bundle.app_package_name || '',
      sender: {
        type: sender.type || 'user',
        name: sender.name || ''
      },
      message_count: messageNotifications.length,
      message_notifications: messageNotifications,
      supported_actions: bundle.supported_actions || [],
      sender_id: bundle.sender_id
    })
  }

  return { notifications, backendUnreadKeys }
}

/**
 * Check messaging app states and determine which notification
 * bundle keys should be considered "read" based on cross-app state.
 * Returns a Set of bundle keys that are read in their native apps.
 * Does NOT modify the notifState — caller uses the returned set for display only.
 */
async function getReadKeysFromApps(notifState: any): Promise<Set<string>> {
  const readKeys = new Set<string>()
  const bundles = Object.entries(notifState.bundled_notifications || {}) as [string, any][]
  const unreadBundles = bundles.filter(([_, b]) => !b.is_read)
  if (unreadBundles.length === 0) return readKeys

  // Group unread bundles by app package
  const byApp: Record<string, [string, any][]> = {}
  for (const entry of unreadBundles) {
    const app = entry[1].app_package_name
    if (!byApp[app]) byApp[app] = []
    byApp[app].push(entry)
  }

  // Fetch all needed messaging app states in parallel
  const fetchPromises: Promise<{ app: string; state: any }>[] = []
  if (byApp['com.whatsup']?.length) {
    fetchPromises.push(fetchServiceState('whatsup').then(state => ({ app: 'whatsup', state })))
  }
  if (byApp['com.Slick']?.length) {
    fetchPromises.push(fetchServiceState('slick').then(state => ({ app: 'slick', state })))
  }
  if (byApp['com.gridwell.android.apps.dynamite']?.length) {
    fetchPromises.push(fetchServiceState('gridwell_chat').then(state => ({ app: 'gridwell_chat', state })))
  }

  const results = await Promise.allSettled(fetchPromises)
  const stateByApp: Record<string, any> = {}
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.state) {
      stateByApp[result.value.app] = result.value.state
    }
  }

  // Check Whatsup: if chat's unread_count == 0, the message was read in Whatsup
  if (byApp['com.whatsup']?.length && stateByApp['whatsup']?.chats) {
    const waState = stateByApp['whatsup']
    const chatsByJid: Record<string, any> = {}
    for (const chat of Object.values(waState.chats) as any[]) {
      if (chat.chat_jid) chatsByJid[chat.chat_jid] = chat
    }
    for (const [key, bundle] of byApp['com.whatsup']) {
      const chatJid = bundle.metadata?.chat_jid
      if (chatJid && chatsByJid[chatJid] && chatsByJid[chatJid].unread_count === 0) {
        readKeys.add(bundle.key)
      }
    }
  }

  // Check Slick: if channel has a read cursor >= the thread_ts, the message was read
  if (byApp['com.Slick']?.length && stateByApp['slick']?.channels) {
    const slickState = stateByApp['slick']
    for (const [key, bundle] of byApp['com.Slick']) {
      const channelId = bundle.metadata?.channel
      if (!channelId) continue
      const channelData = slickState.channels?.[channelId]
      const readCursors = channelData?.conversations?.read_cursors
      if (readCursors && Object.keys(readCursors).length > 0) {
        const threadTs = bundle.metadata?.thread_ts ? parseFloat(bundle.metadata.thread_ts) : 0
        // Only mark as read if we have a specific thread_ts to compare against
        if (threadTs > 0) {
          const maxCursor = Math.max(...Object.values(readCursors).map((v: any) => parseFloat(v) || 0))
          if (maxCursor >= threadTs) {
            readKeys.add(bundle.key)
          }
        }
      }
    }
  }

  // Check GridwellChat: if space/thread has a read state with lastReadTime
  if (byApp['com.gridwell.android.apps.dynamite']?.length && stateByApp['gridwell_chat']) {
    const gchatState = stateByApp['gridwell_chat']
    const spaceReadStates = gchatState.SpaceReadState || []
    const threadReadStates = gchatState.ThreadReadState || []
    for (const [key, bundle] of byApp['com.gridwell.android.apps.dynamite']) {
      const threadName = bundle.metadata?.thread_name
      const spaceId = bundle.metadata?.space_id
      if (threadName) {
        const threadRead = threadReadStates.find((trs: any) =>
          trs.name === threadName && trs.lastReadTime
        )
        if (threadRead) {
          readKeys.add(bundle.key)
          continue
        }
      }
      if (spaceId) {
        const spaceRead = spaceReadStates.find((srs: any) =>
          srs.name === `users/me/${spaceId}/spaceReadState` && srs.lastReadTime
        )
        if (spaceRead) {
          readKeys.add(bundle.key)
        }
      }
    }
  }

  return readKeys
}

/** Reset a service's backend state to its default DB file */
async function resetServiceState(serviceName: string): Promise<boolean> {
  try {
    const response = await fetch(`${STATE_API_BASE}/services/${serviceName}/state/reset`, {
      method: 'POST'
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * Reset notifications AND all related messaging app services to their default states.
 * This ensures cross-app sync doesn't re-read stale state from messaging apps.
 */
async function resetNotificationsAndRelatedServices(): Promise<void> {
  await Promise.allSettled([
    resetServiceState('notifications'),
    resetServiceState('whatsup'),
    resetServiceState('slick'),
    resetServiceState('gridwell_chat'),
    resetServiceState('messages'),
  ])
}

/**
 * Mark a notification as read in the notifications backend
 * AND in the corresponding messaging app's backend.
 */
async function markNotificationReadInBackend(bundleKey: string): Promise<void> {
  try {
    // Fetch current notifications state
    const notifState = await fetchServiceState('notifications')
    if (!notifState?.bundled_notifications?.[bundleKey]) return

    const bundle = notifState.bundled_notifications[bundleKey]
    if (bundle.is_read) return // already read in backend

    // Mark as read in notifications state
    bundle.is_read = true
    await saveServiceState('notifications', notifState)

    // Cross-app sync: also mark as read in the corresponding messaging app
    const appPkg = bundle.app_package_name
    const metadata = bundle.metadata

    if (appPkg === 'com.whatsup' && metadata?.chat_jid) {
      // Whatsup: fetch unread message IDs, then mark them as read
      const waState = await fetchServiceState('whatsup')
      const chat = waState?.chats?.[metadata.chat_jid]
      if (chat?.messages) {
        const unreadIds = (chat.messages as any[])
          .filter((msg: any) => !msg.is_outgoing && !msg.is_read)
          .map((msg: any) => msg.message_id)
        if (unreadIds.length > 0) {
          await callServiceTool('whatsup', 'mark_messages_as_read', {
            chat_jid: metadata.chat_jid,
            message_ids: unreadIds
          })
          dispatchBackendStateChanged('mark_messages_as_read')
        }
      }
    } else if (appPkg === 'com.Slick' && metadata?.channel) {
      // Slick: use the mark_conversation_read tool
      const ts = metadata.thread_ts || String(Date.now() / 1000)
      await callServiceTool('slick', 'mark_conversation_read', {
        channel: metadata.channel,
        ts: ts
      })
      dispatchBackendStateChanged('mark_conversation_read')
    } else if (appPkg === 'com.gridwell.android.apps.dynamite' && metadata?.space_id) {
      // GridwellChat: update space read state
      // Fetch state to find the actual SpaceReadState name (uses real user ID, not "me")
      const gcState = await fetchServiceState('gridwell_chat')
      const spaceId = metadata.space_id.replace('spaces/', '')
      const readStates = (gcState?.SpaceReadState || []) as any[]
      const existingState = readStates.find((s: any) =>
        s.name && s.name.endsWith(`/spaces/${spaceId}/spaceReadState`)
      )
      if (existingState) {
        const readStateName = existingState.name
        await callServiceTool('gridwell_chat', 'update_space_read_state_for_user', {
          name: readStateName,
          updateMask: 'lastReadTime',
          requestBody: { name: readStateName, lastReadTime: new Date().toISOString() }
        })
        dispatchBackendStateChanged('update_space_read_state_for_user')
      }
    }
    // Messages app has no mark-as-read tool, so we skip it
  } catch (err) { console.warn('[Notifications] Cross-app sync error:', err) }
}

function NotificationsApp({ setRefreshHandler }: AppProps) {
  // Load notifications from localStorage if using mock data
  // Reset to initial state if data is corrupted or from old version
  const [notifications, setNotifications] = useState<BundledNotification[]>(() => {
    if (USE_MOCK_DATA) {
      const storedVersion = localStorage.getItem('notifications_version')

      // If version mismatch, clear ALL old data to force clean state
      if (storedVersion !== STORAGE_VERSION) {
        localStorage.removeItem('notifications_data')
        localStorage.removeItem('notifications_viewed')
        localStorage.removeItem('notifications_dismissed')
        localStorage.setItem('notifications_version', STORAGE_VERSION)

        // Calculate and set initial badge count
        const initialUnreadCount = MOCK_NOTIFICATIONS.filter(
          notif => !INITIAL_VIEWED_NOTIFICATIONS.includes(notif.key)
        ).length
        localStorage.setItem('notifications_badge', initialUnreadCount.toString())

        return MOCK_NOTIFICATIONS
      }

      // Version matches - try to load stored data
      const stored = localStorage.getItem('notifications_data')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length >= MOCK_NOTIFICATIONS.length && parsed.length <= MOCK_NOTIFICATIONS.length + 10) {
          return parsed
        }
      }

      return MOCK_NOTIFICATIONS
    }
    return []
  })

  // Load viewed notifications from localStorage on mount
  const [viewedNotifications, setViewedNotifications] = useState<Set<string>>(() => {
    const storedVersion = localStorage.getItem('notifications_version')

    if (storedVersion === STORAGE_VERSION) {
      const stored = localStorage.getItem('notifications_viewed')
      if (stored) {
        const parsed = JSON.parse(stored)
        return new Set(parsed)
      }
    }

    if (USE_MOCK_DATA) {
      return new Set(INITIAL_VIEWED_NOTIFICATIONS)
    }
    return new Set()
  })

  // Track dismissed notification keys persistently
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(() => {
    const stored = localStorage.getItem('notifications_dismissed')
    if (stored) {
      try {
        return new Set(JSON.parse(stored))
      } catch {
        return new Set()
      }
    }
    return new Set()
  })

  const [loading, setLoading] = useState(USE_MOCK_DATA ? false : true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [replySuccess, setReplySuccess] = useState<string | null>(null)
  const [toastAnimating, setToastAnimating] = useState(false)
  const [groupBy, setGroupBy] = useState<'none' | 'app' | 'unread'>('app')
  const [senderFilter, setSenderFilter] = useState('')
  const [appFilter, setAppFilter] = useState('')
  const [showSearch, setShowSearch] = useState(false)

  const api = useBackendAPI('notifications')
  const loadingRef = useRef(false)
  const mountedRef = useRef(true)
  const lastLoadTime = useRef(0)
  const initialLoadDone = useRef(false)
  const unreadKeys = useRef<Set<string>>(new Set())

  // Calculate unread count for both mock and backend modes
  const unreadCount = useMemo(() => {
    if (notifications.length === 0) return undefined
    if (USE_MOCK_DATA) {
      return notifications.filter(notif => !viewedNotifications.has(notif.key)).length
    }
    // Backend mode: unread = in unreadKeys and not viewed
    return notifications.filter(notif => unreadKeys.current.has(notif.key) && !viewedNotifications.has(notif.key)).length
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications, viewedNotifications])

  // Update badge counter with unread count
  useBadge('notifications', unreadCount)

  // Persist badge count to localStorage for immediate loading on next page load
  useEffect(() => {
    if (unreadCount !== undefined) {
      localStorage.setItem('notifications_badge', unreadCount.toString())
    }
  }, [unreadCount])

  // Persist viewed notifications to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('notifications_viewed', JSON.stringify(Array.from(viewedNotifications)))
    localStorage.setItem('notifications_version', STORAGE_VERSION)
  }, [viewedNotifications])

  // Persist dismissed keys to localStorage
  useEffect(() => {
    localStorage.setItem('notifications_dismissed', JSON.stringify(Array.from(dismissedKeys)))
  }, [dismissedKeys])

  // Persist notifications to localStorage when using mock data
  useEffect(() => {
    if (USE_MOCK_DATA && notifications.length > 0) {
      localStorage.setItem('notifications_data', JSON.stringify(notifications))
      localStorage.setItem('notifications_version', STORAGE_VERSION)
    }
  }, [notifications])

  // Initialize unreadKeys on mount
  useEffect(() => {
    if (USE_MOCK_DATA && notifications.length > 0) {
      notifications.forEach(notif => {
        unreadKeys.current.add(notif.key)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Use a ref-based approach for loadNotifications to avoid dependency loops
  const loadNotifications = async (isRefresh = false) => {
    // Prevent concurrent loads
    if (loadingRef.current) {
      return
    }

    // Prevent rapid successive calls (debounce with 2 second minimum interval)
    const now = Date.now()
    if (!isRefresh && now - lastLoadTime.current < 2000) {
      return
    }
    lastLoadTime.current = now

    try {
      loadingRef.current = true

      if (isRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }
      setError(null)

      let unreadNotifications: BundledNotification[] = []
      let readNotifications: BundledNotification[] = []

      if (USE_MOCK_DATA) {
        // When mock data is enabled, load from localStorage or use MOCK_NOTIFICATIONS
        const stored = localStorage.getItem('notifications_data')
        const allNotifications = stored ? JSON.parse(stored) : MOCK_NOTIFICATIONS

        // ALL notifications are "unread" from backend perspective
        allNotifications.forEach((notif: BundledNotification) => {
          unreadKeys.current.add(notif.key)
        })

        // Separate into unread (not viewed) and read (viewed) for display purposes
        unreadNotifications = allNotifications.filter(
          (notif: BundledNotification) => !viewedNotifications.has(notif.key)
        )
        readNotifications = allNotifications.filter(
          (notif: BundledNotification) => viewedNotifications.has(notif.key)
        )
      } else {
        // Read raw state via state API instead of get_notifications(unread=true)
        // which has the side effect of marking ALL unread notifications as read.
        // This preserves the backend's is_read state so other apps see correct status.
        const notifState = await fetchServiceState('notifications')

        if (!mountedRef.current) return

        if (!notifState) {
          throw new Error('Failed to load notifications state')
        }

        // Build notifications from raw state (no side effects on backend)
        const { notifications: builtNotifications, backendUnreadKeys } =
          buildNotificationsFromState(notifState)

        if (!mountedRef.current) return

        // Check messaging app states for cross-app read sync.
        // Returns keys that are read in their native apps (Whatsup/Slick/etc).
        // This does NOT modify or save the notifications backend state.
        const crossAppReadKeys = await getReadKeysFromApps(notifState)

        if (!mountedRef.current) return

        // Derive viewed/unread state from backend's is_read flags
        // combined with cross-app read status. This ensures that after a backend
        // reset, the frontend correctly reflects the reset state.
        // Remove cross-app read keys from the unread set
        for (const key of crossAppReadKeys) {
          backendUnreadKeys.delete(key)
        }
        unreadKeys.current = backendUnreadKeys

        // Sync viewedNotifications with backend: if backend says is_read=true
        // OR cross-app sync says it's read, mark as viewed. If backend says
        // is_read=false and cross-app doesn't override, mark as unread.
        const backendViewedKeys = new Set<string>()
        for (const n of builtNotifications) {
          if (!backendUnreadKeys.has(n.key)) {
            backendViewedKeys.add(n.key)
          }
        }
        setViewedNotifications(backendViewedKeys)

        // Also clear dismissed keys that are back in the backend (after a reset)
        const allBackendKeys = new Set(builtNotifications.map(n => n.key))
        setDismissedKeys(prev => {
          const newSet = new Set<string>()
          for (const key of prev) {
            if (!allBackendKeys.has(key)) {
              // Keep dismissed keys for notifications no longer in backend
              newSet.add(key)
            }
          }
          // Only update if different
          if (newSet.size !== prev.size) return newSet
          return prev
        })

        // Store all notifications; sender/app filtering is handled by searchFilteredNotifications
        unreadNotifications = builtNotifications.filter(n => backendUnreadKeys.has(n.key))
        readNotifications = builtNotifications.filter(n => !backendUnreadKeys.has(n.key))

        // Reset permission denied state
        setPermissionDenied(false)
      }

      // Deduplicate notifications by key
      let allNotifications = deduplicateByKey([...unreadNotifications, ...readNotifications])

      // Filter out dismissed notifications
      allNotifications = allNotifications.filter(n => !dismissedKeys.has(n.key))

      // Filter out empty notifications
      allNotifications = filterEmptyNotifications(allNotifications)

      setNotifications(allNotifications)

      initialLoadDone.current = true
    } catch (err) {
      if (!mountedRef.current) return
      setError(err instanceof Error ? err.message : 'Failed to load notifications')
      setNotifications([])
    } finally {
      loadingRef.current = false
      if (mountedRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }

  // Use a ref to always have access to the latest loadNotifications
  const loadNotificationsRef = useRef(loadNotifications)
  loadNotificationsRef.current = loadNotifications

  // Register refresh handler for admin panel - use ref to avoid re-render loops
  // setRefreshHandler may be unstable (new reference each render from parent),
  // so we use a ref to avoid the effect re-firing and causing infinite loops.
  const setRefreshHandlerRef = useRef(setRefreshHandler)
  setRefreshHandlerRef.current = setRefreshHandler

  useEffect(() => {
    const setter = setRefreshHandlerRef.current
    if (setter) {
      // The refresh handler (called from window title bar reset button)
      // must reset the backend state to its default DB file, clear local state,
      // then reload. This ensures the playground properly reverts to the original
      // database state instead of showing stale/modified state.
      setter(async () => {
        if (!USE_MOCK_DATA) {
          clearNotificationsLocalStorage()
          await resetNotificationsAndRelatedServices()
        }
        loadNotificationsRef.current(true)
      })
    }
    return () => {
      const setter = setRefreshHandlerRef.current
      if (setter) {
        setter(null)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Listen for backend state changes from other apps to sync read status.
  // When another messaging app (Whatsup, Slick, etc.) marks a message as read,
  // the BACKEND_STATE_CHANGED_EVENT is dispatched. We reload to pick up changes.
  useEffect(() => {
    if (USE_MOCK_DATA) return

    const handleStateChange = (event: Event) => {
      const detail = (event as CustomEvent).detail
      // Reload if a messaging app tool was called (not our own notifications tools)
      const toolName = detail?.toolName || ''
      if (
        toolName.includes('mark') ||
        toolName.includes('read') ||
        toolName === 'batch'
      ) {
        // Debounce: only reload if we haven't loaded recently
        const now = Date.now()
        if (now - lastLoadTime.current > 3000) {
          loadNotificationsRef.current(true)
        }
      }
    }

    window.addEventListener(BACKEND_STATE_CHANGED_EVENT, handleStateChange)
    return () => {
      window.removeEventListener(BACKEND_STATE_CHANGED_EVENT, handleStateChange)
    }
  }, [])


  useEffect(() => {
    // Only run once on mount
    if (initialLoadDone.current) {
      return
    }

    mountedRef.current = true

    // Load notifications immediately when app opens (skip if using mock data - already initialized)
    if (!USE_MOCK_DATA) {
      loadNotifications()
    } else {
      initialLoadDone.current = true
    }

    // Poll for new notifications every 30 seconds to update badge (only for backend mode)
    let pollInterval: NodeJS.Timeout | null = null
    if (!USE_MOCK_DATA) {
      pollInterval = setInterval(() => {
        loadNotifications(true)
      }, 30000)
    }

    return () => {
      mountedRef.current = false
      if (pollInterval) {
        clearInterval(pollInterval)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleNotificationView = useCallback((notificationKey: string) => {
    // Mark notification as viewed when user expands it
    if (unreadKeys.current.has(notificationKey)) {
      setViewedNotifications(prev => {
        if (prev.has(notificationKey)) return prev // already viewed, no update
        const newSet = new Set(prev)
        newSet.add(notificationKey)
        return newSet
      })

      // Mark as read in the notifications backend AND in the
      // corresponding messaging app (Whatsup, Slick, etc.) for cross-app sync
      if (!USE_MOCK_DATA) {
        markNotificationReadInBackend(notificationKey)
      }
    }
  }, [])

  // Mark as unread functionality
  const handleMarkUnread = useCallback((notificationKey: string) => {
    // Remove from viewed notifications so it appears unread again
    setViewedNotifications(prev => {
      const newSet = new Set(prev)
      newSet.delete(notificationKey)
      return newSet
    })
    // Ensure it's in unreadKeys
    unreadKeys.current.add(notificationKey)
  }, [])

  const handleReply = async (bundle: BundledNotification, message: string) => {
    try {
      // Validate recipient name and message exist - call API if missing
      if (!bundle.sender?.name || !message.trim()) {
        await api.callTool('reply_notification_message_or_contact_missing', {})
        throw new Error(!bundle.sender?.name ? 'Recipient information is missing' : 'Reply message cannot be empty')
      }

      if (USE_MOCK_DATA) {
        // Mock mode: Simulate reply locally
        const now = Date.now()
        const replyMessage = {
          sender_name: 'You',
          content: message,
          content_type: 'text' as const,
          date: new Date(now).toISOString().split('T')[0],
          time_of_day: new Date(now).toTimeString().split(' ')[0]
        }

        // Update the notification bundle with the new message
        setNotifications(prev => {
          const updated = prev.map(notif => {
            if (notif.key === bundle.key) {
              return {
                ...notif,
                message_count: notif.message_count + 1,
                message_notifications: [...notif.message_notifications, replyMessage]
              }
            }
            return notif
          })
          localStorage.setItem('notifications_data', JSON.stringify(updated))
          return updated
        })

        // Show success confirmation with animation
        setReplySuccess('Message sent')
        setToastAnimating(true)
        setTimeout(() => setToastAnimating(false), 2500)
        setTimeout(() => setReplySuccess(null), 3000)
      } else {
        // Backend mode: Call actual API
        const response = await api.callTool('reply_notification', {
          key: bundle.key,
          message_body: message,
          recipient_name: bundle.sender.name,
          app_name: bundle.localized_app_name,
          app_package_name: bundle.app_package_name
        }) as ReplyResponse

        if (response?.emitted_action_count > 0) {
          setReplySuccess('Message sent')
          setToastAnimating(true)
          setTimeout(() => setToastAnimating(false), 2500)
          setTimeout(() => setReplySuccess(null), 3000)
        }

        // Reload notifications after reply
        await loadNotifications(true)
      }
    } catch (err) {
      if (err instanceof Error) {
        const errorMsg = err.message
        if (errorMsg.includes('not found')) {
          throw new Error(`Cannot send reply: Notification not found`)
        } else if (errorMsg.includes('not supported')) {
          throw new Error(`Reply is not available for this ${bundle.localized_app_name} notification`)
        } else if (errorMsg.includes('missing')) {
          throw new Error(`Cannot send reply: ${errorMsg}`)
        } else if (errorMsg.includes('failed to handle')) {
          throw new Error(`${bundle.localized_app_name} app failed to send the reply. Please try again.`)
        } else {
          throw new Error(errorMsg)
        }
      }
      throw new Error('Failed to send reply. Please try again.')
    }
  }

  // handleDelete now persists dismissal
  const handleDelete = useCallback((notificationKey: string) => {
    // Add to dismissed keys so it stays dismissed across refreshes
    setDismissedKeys(prev => {
      const newSet = new Set(prev)
      newSet.add(notificationKey)
      return newSet
    })

    // Remove notification from list
    setNotifications(prev => prev.filter(notif => notif.key !== notificationKey))

    // Remove from unread keys
    unreadKeys.current.delete(notificationKey)

    // Remove from viewed notifications
    setViewedNotifications(prev => {
      const newSet = new Set(prev)
      newSet.delete(notificationKey)
      return newSet
    })
  }, [])

  // Refresh button resets backend state to default DB and reloads
  const handleRefresh = async () => {
    setRefreshing(true)

    try {
      if (USE_MOCK_DATA) {
        await new Promise(resolve => setTimeout(resolve, 1500))
        const newNotification = generateNewMockNotification()
        unreadKeys.current.add(newNotification.key)
        setNotifications(prev => [newNotification, ...prev])
      } else {
        clearNotificationsLocalStorage()
        await resetNotificationsAndRelatedServices()
        await loadNotifications(true)
      }
    } finally {
      setRefreshing(false)
    }
  }

  // Filter and group notifications - memoized to prevent unnecessary re-renders
  const searchFilteredNotifications = useMemo(() => {
    return notifications.filter(notif => {
      // Also filter empty notifications during display
      if (!notif.message_notifications || notif.message_notifications.length === 0) return false
      if (!notif.message_notifications.some(msg => msg.content && msg.content.trim().length > 0)) return false

      if (senderFilter.trim()) {
        const senderMatch = notif.sender?.name?.toLowerCase().includes(senderFilter.trim().toLowerCase())
        if (!senderMatch) return false
      }
      if (appFilter.trim()) {
        const appMatch = notif.localized_app_name?.toLowerCase().includes(appFilter.trim().toLowerCase())
        if (!appMatch) return false
      }
      return true
    })
  }, [notifications, senderFilter, appFilter])

  // Memoize filtered notifications to prevent re-render cascades
  const filteredNotifications = useMemo(() => {
    if (groupBy === 'unread') {
      return searchFilteredNotifications.filter(
        notif => unreadKeys.current.has(notif.key) && !viewedNotifications.has(notif.key)
      )
    }
    return searchFilteredNotifications
  }, [groupBy, searchFilteredNotifications, viewedNotifications])

  const groupedNotifications = useMemo(() => {
    if (groupBy === 'app') {
      return filteredNotifications.reduce((acc, notif) => {
        const app = notif.localized_app_name
        if (!acc[app]) acc[app] = []
        acc[app].push(notif)
        return acc
      }, {} as Record<string, BundledNotification[]>)
    }
    return { 'All Notifications': filteredNotifications }
  }, [groupBy, filteredNotifications])

  const totalCount = notifications.length
  const displayCount = filteredNotifications.length

  // Permission Denied State
  if (permissionDenied && !loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--bg-primary)] p-6">
        <div className="bg-[var(--bg-secondary)] rounded-2xl shadow-xl p-8 max-w-md w-full text-center border border-[var(--border-color)]">
          <div className="w-16 h-16 bg-[var(--warning-color)]/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Bell className="w-8 h-8 text-[var(--warning-color)]" />
          </div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">
            Permission Required
          </h2>
          <p className="text-[var(--text-secondary)] mb-6">
            Notification access permission is required to view your notifications.
            Please grant notification access in your device settings.
          </p>
          <button
            onClick={() => loadNotifications()}
            className="px-6 py-3 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-xl transition-colors font-medium shadow-sm"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  // Error State
  if (error && !loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--bg-primary)] p-6">
        <div className="bg-[var(--bg-secondary)] rounded-2xl shadow-xl p-8 max-w-md w-full text-center border border-[var(--border-color)]">
          <div className="w-16 h-16 bg-[var(--danger-color)]/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Bell className="w-8 h-8 text-[var(--danger-color)]" />
          </div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">
            Oops! Something went wrong
          </h2>
          <p className="text-[var(--text-secondary)] mb-6">{error}</p>
          <button
            onClick={() => loadNotifications()}
            className="px-6 py-3 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-xl transition-colors font-medium shadow-sm"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-[var(--bg-primary)]">
      {/* Success Toast */}
      {replySuccess && (
        <div
          className="fixed top-16 left-1/2 -translate-x-1/2 z-50"
          style={{
            transform: toastAnimating ? 'translateX(-50%) scale(1) translateY(0)' : 'translateX(-50%) scale(0.8) translateY(-20px)',
            opacity: toastAnimating ? 1 : 0,
            transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease-out',
          }}
        >
          <div className="bg-[var(--success-color)] text-white px-6 py-3 rounded-xl shadow-lg flex items-center space-x-3">
            <div className="w-5 h-5 bg-white rounded-full flex items-center justify-center">
              <svg className="w-3 h-3 text-[var(--success-color)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className="font-medium">{replySuccess}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-[var(--bg-secondary)] border-b border-[var(--border-color)] shadow-sm">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              {totalCount > 0 && (
                <>
                  <div className="w-10 h-10 rounded-full bg-[var(--accent-color)] flex items-center justify-center flex-shrink-0">
                    <Bell className="w-5 h-5 text-white" fill="currentColor" />
                  </div>
                  <p className="text-sm text-[var(--text-secondary)]">
                    {totalCount} {totalCount === 1 ? 'notification' : 'notifications'}
                    {unreadCount !== undefined && (
                      <span className="font-semibold text-[var(--accent-color)]">
                        {' '}({unreadCount} unread)
                      </span>
                    )}
                  </p>
                </>
              )}
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center space-x-2 px-4 py-2 text-[var(--accent-color)] hover:bg-[var(--bg-tertiary)] rounded-xl transition-colors font-medium text-sm disabled:opacity-50"
              aria-label="Refresh notifications"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">
                {refreshing ? 'Loading new messages...' : 'Refresh'}
              </span>
            </button>
          </div>

          {/* Filters */}
          {totalCount > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <FilterIcon className="w-4 h-4 text-[var(--text-tertiary)]" />
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setGroupBy('none')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide transition-colors ${
                      groupBy === 'none'
                        ? 'bg-[var(--accent-color)]/20 text-[var(--accent-color)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                    }`}
                  >
                    ALL
                  </button>
                  <button
                    onClick={() => setGroupBy('app')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide transition-colors ${
                      groupBy === 'app'
                        ? 'bg-[var(--accent-color)]/20 text-[var(--accent-color)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                    }`}
                  >
                    BY APP
                  </button>
                  <button
                    onClick={() => setGroupBy('unread')}
                    className={`relative px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide transition-colors ${
                      groupBy === 'unread'
                        ? 'bg-[var(--accent-color)]/20 text-[var(--accent-color)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                    }`}
                  >
                    UNREAD
                    {unreadCount !== undefined && unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 bg-[var(--danger-color)] rounded-full" />
                    )}
                  </button>
                </div>
              </div>
              <button
                onClick={() => setShowSearch(!showSearch)}
                className={`p-1.5 rounded-lg transition-colors ${
                  showSearch || senderFilter || appFilter
                    ? 'bg-[var(--accent-color)]/20 text-[var(--accent-color)]'
                    : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)]'
                }`}
                aria-label="Search filters"
                title="Search by sender or app"
              >
                <Search className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Search Filters */}
          {showSearch && (
            <div className="flex items-center space-x-2 mt-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Filter by sender name..."
                  value={senderFilter}
                  onChange={(e) => setSenderFilter(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
                />
                {senderFilter && (
                  <button onClick={() => setSenderFilter('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Filter by app name..."
                  value={appFilter}
                  onChange={(e) => setAppFilter(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
                />
                {appFilter && (
                  <button onClick={() => setAppFilter('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-6 py-6">
          {loading ? (
            <LoadingSkeleton />
          ) : totalCount === 0 ? (
            <EmptyState />
          ) : displayCount === 0 ? (
            <div className="text-center py-12">
              <p className="text-[var(--text-secondary)] text-sm">No unread notifications</p>
            </div>
          ) : groupBy === 'app' ? (
            Object.entries(groupedNotifications).map(([appName, notifs]) => (
              <NotificationGroup
                key={appName}
                appName={appName}
                notifications={notifs}
                onReply={handleReply}
                onView={handleNotificationView}
                onDelete={handleDelete}
                onMarkUnread={handleMarkUnread}
                unreadKeys={unreadKeys.current}
                viewedNotifications={viewedNotifications}
              />
            ))
          ) : (
            <div className="space-y-3">
              {filteredNotifications.map((notification) => {
                const isUnread = unreadKeys.current.has(notification.key) && !viewedNotifications.has(notification.key)
                return (
                  <div key={notification.key} className="relative">
                    <NotificationCard
                      notification={notification}
                      onReply={handleReply}
                      onView={handleNotificationView}
                      onDelete={handleDelete}
                      isUnread={isUnread}
                    />
                    {/* Mark as Unread button for read notifications */}
                    {!isUnread && (
                      <button
                        onClick={() => handleMarkUnread(notification.key)}
                        className="absolute top-3 right-20 flex items-center space-x-1 px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--accent-color)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors z-10"
                        title="Mark as unread"
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>Unread</span>
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Export wrapped with ErrorBoundary
export default function NotificationsAppWithErrorBoundary(props: AppProps) {
  return (
    <ErrorBoundary>
      <NotificationsApp {...props} />
    </ErrorBoundary>
  )
}
