import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useBackendAPI } from '@shared/hooks/useBackendAPI'

const APP_NAME = "Zenhelp"

// Types
interface Ticket {
  id: number
  subject: string
  status: string
  priority: string
  type?: string
  requester_id: number
  assignee_id?: number
  created_at: string
  updated_at: string
  description?: string
  tags?: string[]
  collaborator_ids?: number[]
  follower_ids?: number[]
  email_cc_ids?: number[]
  organization_id?: number
  due_at?: string
}

interface User {
  id: number
  name: string
  email: string
  role: string
  avatar_url?: string
  organization_id?: number
  phone?: string
  active?: boolean
  verified?: boolean
  tags?: string[]
  notes?: string
  details?: string
  created_at?: string
  updated_at?: string
}

interface Comment {
  id: number
  body: string
  html_body?: string
  author_id: number
  created_at: string
  public: boolean
  attachments?: Attachment[]
}

interface Organization {
  id: number
  name: string
  domain_names?: string[]
  industry?: string
  location?: string
  tags?: string[]
  notes?: string
  details?: string
  created_at?: string
  updated_at?: string
}

interface Attachment {
  id: number
  file_name: string
  content_url: string
  content_type: string
  size: number
  deleted?: boolean
  created_at?: string
  updated_at?: string
  upload_token?: string // Token needed to attach to tickets/comments
  url?: string // API URL
  inline?: boolean
  width?: string
  height?: string
  malware_scan_result?: string
  thumbnails?: Attachment[]
}

interface TicketAudit {
  id: number
  ticket_id: number
  author_id?: number
  created_at: string
  events: AuditEvent[]
}

interface AuditEvent {
  id: number
  type: string
  field_name?: string
  value?: any
  previous_value?: any
  body?: string
  public?: boolean
}

interface SearchResult {
  id: number
  result_type: 'ticket' | 'user' | 'organization'
  subject?: string
  name?: string
  email?: string
  status?: string
  priority?: string
  created_at?: string
  updated_at?: string
}

// Macro system for quick responses
interface Macro {
  id: number
  name: string
  description?: string
  actions: {
    comment?: { body: string; public: boolean }
    status?: string
    priority?: string
    assignee_id?: number | null
    tags_add?: string[]
    tags_remove?: string[]
  }
}

// Predefined views for ticket filtering
interface TicketView {
  id: string
  name: string
  icon: string
  filter: (ticket: Ticket, currentUserId?: number) => boolean
  count?: number
}

// Default macros
const DEFAULT_MACROS: Macro[] = [
  {
    id: 1,
    name: 'Close - Resolved',
    description: 'Mark ticket as solved with a closing message',
    actions: {
      status: 'solved',
      comment: { body: "We're glad we could help! If you have any other questions, please don't hesitate to reach out.", public: true }
    }
  },
  {
    id: 2,
    name: 'Request More Info',
    description: 'Ask the customer for more details',
    actions: {
      status: 'pending',
      comment: { body: "Thank you for reaching out. Could you please provide more details about your issue so we can better assist you?", public: true }
    }
  },
  {
    id: 3,
    name: 'Escalate to Tier 2',
    description: 'Escalate ticket to higher support tier',
    actions: {
      priority: 'high',
      tags_add: ['escalated', 'tier-2']
    }
  },
  {
    id: 4,
    name: 'Redirect to Help Center',
    description: 'Point customer to self-service resources',
    actions: {
      status: 'solved',
      comment: { body: "Thank you for your question! You can find detailed information about this topic in our Help Center. If you need further assistance, please let us know.", public: true }
    }
  },
  {
    id: 5,
    name: 'Internal Note - Investigating',
    description: 'Add internal note about investigation',
    actions: {
      comment: { body: "Currently investigating this issue. Will update once more information is available.", public: false }
    }
  }
]

// Predefined ticket views
const TICKET_VIEWS: TicketView[] = [
  {
    id: 'all',
    name: 'All tickets',
    icon: '',
    filter: () => true // Show all tickets
  },
  {
    id: 'my-open',
    name: 'My open tickets',
    icon: '',
    filter: (ticket, currentUserId) =>
      ticket.assignee_id === currentUserId &&
      ['new', 'open', 'pending'].includes(ticket.status.toLowerCase())
  },
  {
    id: 'unassigned',
    name: 'Unassigned',
    icon: '',
    filter: (ticket) => !ticket.assignee_id
  },
  {
    id: 'all-unsolved',
    name: 'Unsolved',
    icon: '',
    filter: (ticket) => ['new', 'open', 'pending', 'hold'].includes(ticket.status.toLowerCase())
  },
  {
    id: 'recently-updated',
    name: 'Recent',
    icon: '',
    filter: (ticket) => {
      const dayAgo = Date.now() - 24 * 60 * 60 * 1000
      return new Date(ticket.updated_at).getTime() > dayAgo
    }
  },
  {
    id: 'recently-solved',
    name: 'Solved',
    icon: '',
    filter: (ticket) => {
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
      return ticket.status.toLowerCase() === 'solved' &&
             new Date(ticket.updated_at).getTime() > weekAgo
    }
  },
  {
    id: 'pending',
    name: 'Pending',
    icon: '',
    filter: (ticket) => ticket.status.toLowerCase() === 'pending'
  },
  {
    id: 'on-hold',
    name: 'On-hold',
    icon: '',
    filter: (ticket) => ticket.status.toLowerCase() === 'hold'
  }
]

type PageView = 'home' | 'ticket' | 'create' | 'views' | 'users' | 'user-detail' | 'organizations' | 'org-detail' | 'search' | 'settings'
type WorkFilter = 'tickets' | 'cc' | 'following' | 'completed'

interface OpenWindowConfig {
  id: string
  title: string
  content: React.ReactNode
  width?: number
  height?: number
}

interface AppProps {
  onClose: () => void
  setAdminHandler?: (handler: (() => void) | null) => void
  setRefreshHandler?: (handler: (() => void) | null) => void
  openWindow?: (config: OpenWindowConfig) => void
}

const StatusBadge = ({ status }: { status: string }) => {
  // Refined status pills with subtle ring + soft tone
  const statusStyles: Record<string, { bg: string; text: string; dot: string; ring: string }> = {
    'new':     { bg: 'bg-sky-50',    text: 'text-sky-700',    dot: 'bg-sky-500',    ring: 'ring-sky-200/60' },
    'open':    { bg: 'bg-rose-50',   text: 'text-rose-700',   dot: 'bg-rose-500',   ring: 'ring-rose-200/60' },
    'pending': { bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-500',  ring: 'ring-amber-200/60' },
    'hold':    { bg: 'bg-slate-100', text: 'text-slate-600',  dot: 'bg-slate-400',  ring: 'ring-slate-200/60' },
    'solved':  { bg: 'bg-emerald-50',text: 'text-emerald-700',dot: 'bg-emerald-500',ring: 'ring-emerald-200/60' },
    'closed':  { bg: 'bg-slate-100', text: 'text-slate-500',  dot: 'bg-slate-400',  ring: 'ring-slate-200/60' },
  }
  const style = statusStyles[status.toLowerCase()] || statusStyles.open
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium tracking-wide ring-1 ${style.bg} ${style.text} ${style.ring}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`}></span>
      {status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()}
    </span>
  )
}

const PriorityBadge = ({ priority }: { priority: string }) => {
  // Modern priority indicators - subtle pill with refined glyph
  const priorityConfig: Record<string, { color: string; bg: string; arrow: string }> = {
    'low':    { color: 'text-emerald-700', bg: 'bg-emerald-50', arrow: '↓' },
    'normal': { color: 'text-slate-600',   bg: 'bg-slate-100',  arrow: '–' },
    'high':   { color: 'text-orange-800',  bg: 'bg-orange-50',  arrow: '↑' },
    'urgent': { color: 'text-rose-700',    bg: 'bg-rose-50',    arrow: '⇈' },
  }
  const config = priorityConfig[priority.toLowerCase()] || priorityConfig.normal
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium tracking-wide ${config.bg} ${config.color}`}>
      <span className="leading-none">{config.arrow}</span>
      {priority.charAt(0).toUpperCase() + priority.slice(1).toLowerCase()}
    </span>
  )
}

const TypeBadge = ({ type }: { type: string }) => {
  // Refined ticket type pill
  const typeConfig: Record<string, { bg: string; text: string; icon: string }> = {
    'question': { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: '?' },
    'incident': { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: '⚠' },
    'problem':  { bg: 'bg-orange-50',  text: 'text-orange-800',  icon: '◆' },
    'task':     { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: '✓' },
  }
  const config = typeConfig[type.toLowerCase()] || typeConfig.question
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium tracking-wide ${config.bg} ${config.text}`}>
      <span className="leading-none">{config.icon}</span>
      {type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()}
    </span>
  )
}

const RoleBadge = ({ role }: { role: string }) => {
  const roleColors: Record<string, string> = {
    'admin':    'bg-purple-50 text-purple-700 ring-purple-200/60',
    'agent':    'bg-sky-50 text-sky-700 ring-sky-200/60',
    'end-user': 'bg-slate-100 text-slate-600 ring-slate-200/60',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium tracking-wide ring-1 ${roleColors[role.toLowerCase()] || roleColors['end-user']}`}>
      {role}
    </span>
  )
}

const TagBadge = ({ tag, onRemove, clickable, onClick }: { tag: string; onRemove?: () => void; clickable?: boolean; onClick?: () => void }) => {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full transition ${clickable ? 'cursor-pointer hover:bg-slate-200/70' : ''}`}
      style={{ backgroundColor: '#eef2f6', color: '#334155' }}
      onClick={onClick}
    >
      <span className="text-slate-400">#</span>
      {tag}
      {onRemove && (
        <button onClick={(e: React.MouseEvent) => { e.stopPropagation(); onRemove(); }} className="ml-0.5 text-slate-400 hover:text-slate-700 transition">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  )
}

export default function ZenhelpApp({ onClose, setRefreshHandler }: AppProps) {
  const [view, setView] = useState<PageView>('home')
  const [activeTicketView, setActiveTicketView] = useState<string>('all') // For Views system
  const [macros] = useState<Macro[]>(DEFAULT_MACROS)
  const [requesterHistory, setRequesterHistory] = useState<Ticket[]>([]) // Requester's other tickets
  const [currentTicket, setCurrentTicket] = useState<Ticket | null>(null)
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [allTickets, setAllTickets] = useState<Ticket[]>([])
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [workFilter, setWorkFilter] = useState<WorkFilter>('tickets')
  const [ticketComments, setTicketComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const newCommentIsPublic = true // Backend always sends comments as public
  const [commentAuthors, setCommentAuthors] = useState<Record<number, number>>({})
  const [commentVisibility, setCommentVisibility] = useState<Record<number, boolean>>({})
  const [sortBy, setSortBy] = useState<'recommended' | 'oldest' | 'latest'>('latest')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [userStatus, setUserStatus] = useState<'online' | 'absent' | 'transfers' | 'offline'>('online')
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [initialLoadDone, setInitialLoadDone] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ ticketId: number; subject: string } | null>(null)
  const loadDataRef = useRef<() => void>(() => {})

  // New state for features
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchType, setSearchType] = useState<'all' | 'ticket' | 'user' | 'organization'>('all')
  const [searchLoading, setSearchLoading] = useState(false)
  const [ticketAudits, setTicketAudits] = useState<TicketAudit[]>([])
  const [showAuditPanel, setShowAuditPanel] = useState(false)
  const [auditsLoading, setAuditsLoading] = useState(false)
  const [expandedAuditId, setExpandedAuditId] = useState<number | null>(null)
  const [expandedAuditData, setExpandedAuditData] = useState<any>(null)
  const [auditDetailLoading, setAuditDetailLoading] = useState(false)
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [showCreateUserModal, setShowCreateUserModal] = useState(false)
  const [showCreateOrgModal, setShowCreateOrgModal] = useState(false)
  const [showTagManagement, setShowTagManagement] = useState(false)
  const [userDeleteConfirmation, setUserDeleteConfirmation] = useState<{ userId: number; name: string } | null>(null)
  const [orgDeleteConfirmation, setOrgDeleteConfirmation] = useState<{ orgId: number; name: string } | null>(null)
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([])
  const [selectedAttachment, setSelectedAttachment] = useState<Attachment | null>(null)
  const [attachmentLoading, setAttachmentLoading] = useState(false)

  const api = useBackendAPI('zenhelp')

  // Load comment authors and visibility from localStorage on mount
  useEffect(() => {
    try {
      const storedAuthors = localStorage.getItem('zenhelp_comment_authors')
      if (storedAuthors) {
        setCommentAuthors(JSON.parse(storedAuthors))
      }
      const storedVisibility = localStorage.getItem('zenhelp_comment_visibility')
      if (storedVisibility) {
        setCommentVisibility(JSON.parse(storedVisibility))
      }
    } catch (e) {
      console.error('Failed to load comment data from localStorage:', e)
    }
  }, [])

  const refreshApp = useCallback(() => {
    loadDataRef.current()
  }, [])

  useEffect(() => {
    if (setRefreshHandler) {
      setRefreshHandler(refreshApp)
      return () => setRefreshHandler(null)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Extract available tags from all tickets
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>()
    allTickets.forEach((ticket: Ticket) => {
      ticket.tags?.forEach((tag: string) => tagSet.add(tag))
    })
    return Array.from(tagSet).sort()
  }, [allTickets])

  // Work filter data
  const ccTickets = useMemo(() => {
    if (!currentUser) return []
    return allTickets.filter((t: Ticket) =>
      t.collaborator_ids?.includes(currentUser.id) ||
      t.email_cc_ids?.includes(currentUser.id)
    )
  }, [allTickets, currentUser])

  const followingTickets = useMemo(() => {
    if (!currentUser) return []
    return allTickets.filter((t: Ticket) => t.follower_ids?.includes(currentUser.id))
  }, [allTickets, currentUser])

  const completedTickets = useMemo(() => {
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000)
    return allTickets.filter((t: Ticket) => {
      // Must be solved or closed status
      if (!['solved', 'closed'].includes(t.status.toLowerCase())) {
        return false
      }
      // Must have updated_at within last 30 days
      if (!t.updated_at) {
        return false
      }
      const updatedTime = new Date(t.updated_at).getTime()
      // Check for valid date
      if (isNaN(updatedTime)) {
        return false
      }
      return updatedTime > thirtyDaysAgo
    })
  }, [allTickets])

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      setError(null)
      try {
        // Load tickets
        let ticketsData: Ticket[] = []
        try {
          const ticketsResult = await api.callTool<any>('list_tickets', {})
          // Backend wraps response in {"result": ...}
          // list_tickets returns a List[Dict], so result is the array
          if (Array.isArray(ticketsResult)) {
            ticketsData = ticketsResult
          } else {
            ticketsData = []
          }
        } catch (ticketErr) {
          console.warn('Failed to load tickets from backend:', ticketErr)
        }

        // Load users
        let usersData: User[] = []
        try {
          const usersResult = await api.callTool<any>('list_users', {})
          if (Array.isArray(usersResult)) {
            usersData = usersResult
          } else if (usersResult?.users) {
            usersData = usersResult.users
          } else if (usersResult && typeof usersResult === 'object') {
            const values = Object.values(usersResult)
            if (Array.isArray(values[0])) {
              usersData = values[0] as User[]
            }
          }
        } catch (userErr) {
          console.warn('Failed to load users from backend:', userErr)
        }

        // If no data exists, reset DB and reload
        if (ticketsData.length === 0 && usersData.length === 0) {
          try {
            console.log('No data found, resetting DB to default state...')
            const resetResponse = await fetch('./api/services/zenhelp/state/reset', { method: 'POST' })
            const resetData = await resetResponse.json()
            console.log('DB reset response:', resetData)
            
            // Reload data after reset
            const ticketsResult = await api.callTool<any>('list_tickets', {})
            if (Array.isArray(ticketsResult)) {
              ticketsData = ticketsResult
            }
            
            const usersResult = await api.callTool<any>('list_users', {})
            if (Array.isArray(usersResult)) {
              usersData = usersResult
            } else if (usersResult?.users) {
              usersData = usersResult.users
            }
          } catch (resetErr) {
            console.warn('Failed to reset DB and reload data:', resetErr)
          }
        }

        setTickets(ticketsData)
        setAllTickets(ticketsData)
        setInitialLoadDone(true)
        setUsers(usersData)

        if (usersData && usersData.length > 0) {
          // Find an agent user, or use the first user
          const agentUser = usersData.find((u: User) => u.role === 'agent' || u.role === 'admin') || usersData[0]
          setCurrentUser({
            id: agentUser.id,
            name: agentUser.name || 'Agent',
            email: agentUser.email || '',
            role: agentUser.role || 'agent',
          })
        } else {
          setCurrentUser(null)
        }

        // Load organizations
        try {
          const orgsResult = await api.callTool<any>('list_organizations', {})
          // list_organizations returns a plain array
          let orgsData: Organization[] = []
          if (Array.isArray(orgsResult)) {
            orgsData = orgsResult
          } else if (orgsResult?.organizations) {
            orgsData = orgsResult.organizations
          } else {
            orgsData = []
          }
          setOrganizations(orgsData)
        } catch (orgErr) {
          console.warn('Failed to load organizations:', orgErr)
          setOrganizations([])
        }
      } catch (err) {
        console.error('Unexpected error loading data:', err)
        setError('Failed to load data from backend')
      } finally {
        setLoading(false)
      }
    }

    loadDataRef.current = loadData
    loadData()
  }, [])

  const handleTicketClick = async (ticket: Ticket) => {
    setCurrentTicket(ticket)
    setView('ticket')
    setShowAuditPanel(false)
    setPendingAttachments([]) // Clear pending attachments when switching tickets
    setTicketComments([]) // Clear stale comments from previous ticket

    // Load full ticket details
    try {
      const ticketDetail = await api.callTool<any>('get_ticket_details', { ticket_id: ticket.id })
      // Preserve locally-modified tags (e.g. from macros) since the backend doesn't support tag updates
      const localTags = ticket.tags
      if (ticketDetail?.ticket) {
        setCurrentTicket(localTags ? { ...ticketDetail.ticket, tags: localTags } : ticketDetail.ticket)
      } else if (ticketDetail?.id) {
        setCurrentTicket(localTags ? { ...ticketDetail, tags: localTags } : ticketDetail)
      }
    } catch {
      // Keep existing ticket data as fallback
    }

    // Load comments
    try {
      const commentsResult = await api.callTool<any>('list_ticket_comments', {
        ticket_id: ticket.id,
      })
      // list_ticket_comments returns {"comments": [...]}
      const loadedComments = commentsResult?.comments || []
      setTicketComments(loadedComments)
    } catch (err) {
      setTicketComments([])
    }

    // Load requester's ticket history (for Customer Context panel)
    if (ticket.requester_id) {
      loadRequesterHistory(ticket.requester_id)
    }
  }

  const handleUserClick = async (user: any) => {
    setSelectedUser(user)
    setView('user-detail')
    try {
      const detailResult = await api.callTool<any>('get_user_details', { user_id: user.id })
      if (detailResult?.user) {
        setSelectedUser(detailResult.user)
      } else if (detailResult?.id) {
        setSelectedUser(detailResult)
      }
    } catch {
      // Keep existing user data as fallback
    }
  }

  const handleOrgClick = async (org: any) => {
    setSelectedOrg(org)
    setView('org-detail')
    try {
      const detailResult = await api.callTool<any>('get_organization_details', { organization_id: org.id })
      if (detailResult?.organization) {
        setSelectedOrg(detailResult.organization)
      } else if (detailResult?.id) {
        setSelectedOrg(detailResult)
      }
    } catch {
      // Keep existing org data as fallback
    }
  }

  // Attribute a newly-added comment to the current agent user
  const applyCommentAttribution = (loadedComments: any[], expectedBody: string, isPublic: boolean) => {
    if (loadedComments.length > 0 && currentUser) {
      const lastComment = loadedComments[loadedComments.length - 1]
      if (lastComment.body === expectedBody) {
        const newAuthors = { ...commentAuthors, [lastComment.id]: currentUser.id }
        setCommentAuthors(newAuthors)
        localStorage.setItem('zenhelp_comment_authors', JSON.stringify(newAuthors))
        lastComment.author_id = currentUser.id

        const newVisibility = { ...commentVisibility, [lastComment.id]: isPublic }
        setCommentVisibility(newVisibility)
        localStorage.setItem('zenhelp_comment_visibility', JSON.stringify(newVisibility))
        lastComment.public = isPublic
      }
    }
  }

  const handleSendComment = async () => {
    if (!newComment.trim() || !currentTicket) return

    try {
      const commentText = newComment
      await api.callTool('update_ticket', {
        ticket_id: currentTicket.id,
        ticket_updates: { comment_body: commentText },
      })
      setNewComment('')

      const commentsResult = await api.callTool<any>('list_ticket_comments', {
        ticket_id: currentTicket.id,
      })
      // list_ticket_comments returns {"comments": [...]}
      const loadedComments = commentsResult?.comments || []
      applyCommentAttribution(loadedComments, commentText, newCommentIsPublic)
      setTicketComments(loadedComments)
    } catch (err) {
      console.error('Error in handleSendComment:', err)
      setError(err instanceof Error ? err.message : 'Failed to add comment')
    }
  }

  const handleStatusChange = async (newStatus: string) => {
    if (!currentTicket) return

    try {
      await api.callTool('update_ticket', {
        ticket_id: currentTicket.id,
        ticket_updates: { status: newStatus },
      })

      const updatedTicket = { ...currentTicket, status: newStatus, updated_at: new Date().toISOString() }
      setCurrentTicket(updatedTicket)
      setTickets(tickets.map((t: Ticket) => t.id === currentTicket.id ? updatedTicket : t))
      setAllTickets(allTickets.map((t: Ticket) => t.id === currentTicket.id ? updatedTicket : t))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update ticket')
    }
  }

  const handleUpdateTicket = async () => {
    if (!currentTicket) return

    try {
      await api.callTool('update_ticket', {
        ticket_id: currentTicket.id,
        ticket_updates: {
          status: currentTicket.status,
          priority: currentTicket.priority,
          assignee_id: currentTicket.assignee_id || null,
          subject: currentTicket.subject,
        },
      })

      const updatedTicket = { ...currentTicket, updated_at: new Date().toISOString() }
      setCurrentTicket(updatedTicket)
      setTickets(tickets.map((t: Ticket) => t.id === currentTicket.id ? updatedTicket : t))
      setAllTickets(allTickets.map((t: Ticket) => t.id === currentTicket.id ? updatedTicket : t))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update ticket')
    }
  }

  // Handle individual field changes for ticket
  const handleTicketFieldChange = async (field: string, value: any) => {
    if (!currentTicket) return

    try {
      // Map frontend field names to backend TicketUpdatesInput field names
      const fieldMap: Record<string, string> = { type: 'ticket_type' }
      const backendField = fieldMap[field] || field
      const updates: Record<string, any> = { [backendField]: value }

      await api.callTool('update_ticket', {
        ticket_id: currentTicket.id,
        ticket_updates: updates,
      })

      // Update local state (use original field name for local ticket object)
      const updatedTicket = { ...currentTicket, [field]: value, updated_at: new Date().toISOString() }
      setCurrentTicket(updatedTicket)
      setTickets(tickets.map((t: Ticket) => t.id === currentTicket.id ? updatedTicket : t))
      setAllTickets(allTickets.map((t: Ticket) => t.id === currentTicket.id ? updatedTicket : t))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update ticket field')
    }
  }

  const handleDeleteTicket = (ticketId: number) => {
    const ticket = allTickets.find((t: Ticket) => t.id === ticketId)
    if (ticket) {
      setDeleteConfirmation({ ticketId, subject: ticket.subject })
    }
  }

  const confirmDeleteTicket = async () => {
    if (!deleteConfirmation) return

    try {
      await api.callTool('delete_ticket', { ticket_id: deleteConfirmation.ticketId })
      setTickets(tickets.filter((t: Ticket) => t.id !== deleteConfirmation.ticketId))
      setAllTickets(allTickets.filter((t: Ticket) => t.id !== deleteConfirmation.ticketId))

      if (currentTicket?.id === deleteConfirmation.ticketId) {
        setCurrentTicket(null)
        setView('home')
      }
      setDeleteConfirmation(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete ticket')
      setDeleteConfirmation(null)
    }
  }

  // Search functionality
  const executeSearch = async (typeOverride?: 'all' | 'ticket' | 'user' | 'organization') => {
    if (!searchQuery.trim()) return

    const effectiveType = typeOverride ?? searchType
    setSearchLoading(true)
    setView('search')
    try {
      const typePrefix = effectiveType !== 'all' ? `type:${effectiveType} ` : ''
      const result = await api.callTool<any>('search', {
        query: `${typePrefix}${searchQuery}`,
        per_page: 50,
      })
      setSearchResults(result?.results || [])
    } catch (err) {
      console.error('Search failed:', err)
      setSearchResults([])
    } finally {
      setSearchLoading(false)
    }
  }

  // Load ticket audits
  const loadTicketAudits = async (ticketId: number) => {
    setAuditsLoading(true)
    setExpandedAuditId(null)
    setExpandedAuditData(null)
    try {
      const result = await api.callTool<any>('list_audits_for_ticket', { ticket_id: ticketId })
      setTicketAudits(result?.audits || [])
    } catch (err) {
      console.error('Failed to load audits:', err)
      setTicketAudits([])
    } finally {
      setAuditsLoading(false)
    }
  }

  // Load individual audit details using show_audit API
  const loadAuditDetails = async (ticketId: number, auditId: number) => {
    if (expandedAuditId === auditId) {
      // Toggle off if already expanded
      setExpandedAuditId(null)
      setExpandedAuditData(null)
      return
    }

    setExpandedAuditId(auditId)
    setAuditDetailLoading(true)
    try {
      const result = await api.callTool<any>('show_audit', {
        ticket_id: ticketId,
        audit_id: auditId
      })
      setExpandedAuditData(result?.audit || null)
    } catch (err) {
      console.error('Failed to load audit details:', err)
      setExpandedAuditData(null)
    } finally {
      setAuditDetailLoading(false)
    }
  }

  // User CRUD
  const handleCreateUser = async (userData: Partial<User>) => {
    try {
      const params: any = {
        name: userData.name,
        email: userData.email || undefined,
        role: userData.role || 'end-user',
      }
      // Only add organization_id if it's a valid positive number
      if (userData.organization_id && userData.organization_id > 0) {
        params.organization_id = userData.organization_id
      }
      if (userData.phone) {
        params.phone = userData.phone
      }
      if (userData.notes) {
        params.notes = userData.notes
      }
      await api.callTool('create_user', params)
      loadDataRef.current()
      setShowCreateUserModal(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user')
    }
  }

  const handleUpdateUser = async (userId: number, updates: Partial<User>) => {
    try {
      await api.callTool('update_user', { user_id: userId, ...updates })
      loadDataRef.current()
      if (selectedUser?.id === userId) {
        setSelectedUser({ ...selectedUser, ...updates })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user')
    }
  }

  const handleDeleteUser = async (userId: number) => {
    try {
      await api.callTool('delete_user', { user_id: userId })
      loadDataRef.current()
      setUserDeleteConfirmation(null)
      if (selectedUser?.id === userId) {
        setSelectedUser(null)
        setView('users')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user')
      setUserDeleteConfirmation(null)
    }
  }

  // Organization CRUD
  const handleCreateOrg = async (orgData: Partial<Organization>) => {
    try {
      await api.callTool('create_organization', {
        name: orgData.name,
        industry: orgData.industry,
        location: orgData.location,
        domain_names: orgData.domain_names || [],
        notes: orgData.notes,
        tags: orgData.tags || [],
      })
      loadDataRef.current()
      setShowCreateOrgModal(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create organization')
    }
  }

  const handleUpdateOrg = async (orgId: number, updates: Partial<Organization>) => {
    try {
      await api.callTool('update_organization', { organization_id: orgId, ...updates })
      loadDataRef.current()
      if (selectedOrg?.id === orgId) {
        setSelectedOrg({ ...selectedOrg, ...updates })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update organization')
    }
  }

  const handleDeleteOrg = async (orgId: number) => {
    try {
      await api.callTool('delete_organization', { organization_id: orgId })
      loadDataRef.current()
      setOrgDeleteConfirmation(null)
      if (selectedOrg?.id === orgId) {
        setSelectedOrg(null)
        setView('organizations')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete organization')
      setOrgDeleteConfirmation(null)
    }
  }

  // Attachment upload - stores both attachment info and upload token
  const handleAttachmentUpload = async (filename: string) => {
    try {
      const result = await api.callTool<any>('create_attachment', {
        filename,
        file_size: 1024,
      })
      if (result?.upload?.attachment && result?.upload?.token) {
        const attachmentWithToken: Attachment = {
          ...result.upload.attachment,
          upload_token: result.upload.token
        }
        setPendingAttachments((prev: Attachment[]) => [...prev, attachmentWithToken])
      }
    } catch (err) {
      console.error('Upload failed:', err)
    }
  }

  // View attachment details
  const handleViewAttachment = async (attachmentId: number) => {
    setAttachmentLoading(true)
    try {
      const result = await api.callTool<Attachment>('show_attachment', {
        attachment_id: attachmentId
      })
      if (result) {
        // Preserve upload_token from pending attachments (needed for deletion)
        const pendingAtt = pendingAttachments.find((a: Attachment) => a.id === attachmentId)
        setSelectedAttachment({
          ...result,
          upload_token: pendingAtt?.upload_token || result.upload_token
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load attachment details')
    } finally {
      setAttachmentLoading(false)
    }
  }

  // Delete attachment (only works for pending/unlinked attachments with token)
  const handleDeleteAttachment = async (token: string) => {
    try {
      await api.callTool('delete_attachment', { token })
      // Remove from pending attachments
      setPendingAttachments((prev: Attachment[]) => prev.filter(a => a.upload_token !== token))
      setSelectedAttachment(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete attachment')
    }
  }

  // Load requester's other tickets (for Customer Context panel)
  const loadRequesterHistory = useCallback(async (requesterId: number) => {
    try {
      // Get all tickets for this requester
      const otherTickets = allTickets.filter(t => t.requester_id === requesterId)
      setRequesterHistory(otherTickets.slice(0, 10)) // Show last 10 tickets
    } catch (err) {
      console.error('Failed to load requester history:', err)
      setRequesterHistory([])
    }
  }, [allTickets])

  // Apply macro to current ticket
  const handleApplyMacro = async (macro: Macro) => {
    if (!currentTicket) return

    try {
      const updates: Record<string, any> = {}

      // Apply status change
      if (macro.actions.status) {
        updates.status = macro.actions.status
      }

      // Apply priority change
      if (macro.actions.priority) {
        updates.priority = macro.actions.priority
      }

      // Apply assignee change
      if (macro.actions.assignee_id !== undefined) {
        updates.assignee_id = macro.actions.assignee_id
      }

      // Compute new tags locally (backend does not support tags in update_ticket)
      let newTags: string[] | undefined
      if (macro.actions.tags_add || macro.actions.tags_remove) {
        newTags = [...(currentTicket.tags || [])]
        if (macro.actions.tags_add) {
          newTags = [...new Set([...newTags, ...macro.actions.tags_add])]
        }
        if (macro.actions.tags_remove) {
          newTags = newTags.filter(t => !macro.actions.tags_remove?.includes(t))
        }
      }

      // Apply comment
      if (macro.actions.comment) {
        updates.comment_body = macro.actions.comment.body
      }

      // Update the ticket via API (without tags, which the backend doesn't accept)
      await api.callTool('update_ticket', {
        ticket_id: currentTicket.id,
        ticket_updates: updates,
      })

      // Update local state (include tags locally)
      const updatedTicket = { ...currentTicket, ...updates, ...(newTags !== undefined ? { tags: newTags } : {}), updated_at: new Date().toISOString() }
      delete updatedTicket.comment_body
      setCurrentTicket(updatedTicket)
      setTickets(tickets.map((t: Ticket) => t.id === currentTicket.id ? updatedTicket : t))
      setAllTickets(allTickets.map((t: Ticket) => t.id === currentTicket.id ? updatedTicket : t))

      // Refresh comments if a comment was added
      if (macro.actions.comment) {
        const commentsResult = await api.callTool<any>('list_ticket_comments', {
          ticket_id: currentTicket.id,
        })
        // list_ticket_comments returns {"comments": [...]}
        const loadedComments = commentsResult?.comments || []
        applyCommentAttribution(loadedComments, macro.actions.comment.body, macro.actions.comment.public)
        setTicketComments(loadedComments)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply macro')
    }
  }

  // Status counts used by settings and dashboard
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    allTickets.forEach(t => { counts[t.status] = (counts[t.status] || 0) + 1 })
    return counts
  }, [allTickets])

  // Get view counts for sidebar
  const viewCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    TICKET_VIEWS.forEach(view => {
      counts[view.id] = allTickets.filter(t => view.filter(t, currentUser?.id)).length
    })
    return counts
  }, [allTickets, currentUser])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      switch (e.key) {
        case 'n':
          // New ticket
          setView('create')
          break
        case '/':
          // Focus search (prevent default browser search)
          e.preventDefault()
          const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement
          if (searchInput) searchInput.focus()
          break
        case 'Escape':
          // Close modals
          setSelectedAttachment(null)
          setShowCreateUserModal(false)
          setShowCreateOrgModal(false)
          setShowTagManagement(false)
          setDeleteConfirmation(null)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Filter tickets
  const getDisplayedTickets = () => {
    let displayTickets: Ticket[]
    switch (workFilter) {
      case 'cc':
        displayTickets = ccTickets
        break
      case 'following':
        displayTickets = followingTickets
        break
      case 'completed':
        displayTickets = completedTickets
        break
      default:
        displayTickets = tickets
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      displayTickets = displayTickets.filter(t => t.status.toLowerCase() === statusFilter.toLowerCase())
    }

    // Apply tag filter
    if (tagFilter.length > 0) {
      displayTickets = displayTickets.filter(t =>
        t.tags?.some(tag => tagFilter.includes(tag))
      )
    }

    // Sort
    return [...displayTickets].sort((a, b) => {
      if (sortBy === 'oldest') {
        return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
      }
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })
  }

  const sortedTickets = getDisplayedTickets()

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  return (
    <div className="h-full w-full relative">
      <div className="h-full flex bg-white overflow-hidden">
      {/* Left Sidebar - Charcoal */}
      <div className="w-16 flex flex-col items-center py-4 gap-1" style={{ backgroundColor: '#1C1917' }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold mb-3 shadow-md" style={{ backgroundColor: '#9A3412' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false" aria-label={APP_NAME}><rect x="3" y="3" width="8" height="8" rx="1.5" fill="currentColor"/><circle cx="17" cy="7" r="4" fill="currentColor"/><rect x="13" y="13" width="8" height="8" rx="1.5" fill="currentColor"/><path d="M3 13 L11 13 L7 21 Z" fill="currentColor"/></svg>
        </div>
        <button
          onClick={() => { setView('home'); setCurrentTicket(null); }}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${view === 'home' || view === 'ticket' || view === 'create' ? 'text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
          style={{ backgroundColor: view === 'home' || view === 'ticket' || view === 'create' ? '#9A3412' : 'transparent' }}
          title="Tickets"
        >

          <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26" aria-hidden="true" focusable="false" data-garden-id="chrome.nav_item_icon" data-garden-version="9.12.1" className="StyledBaseIcon-sc-1moykgb-0 StyledNavItemIcon-sc-7w9rpt-0 eWlVPJ YOjtB"><path fill="currentColor" d="m23.885 13.2-1.328 1.639a.522.522 0 0 1-.737.084l-1.444-1.155v7.182c0 .577-.474 1.05-1.054 1.05H16.51c-.58 0-1.054-.473-1.054-1.05v-3.182a2.43 2.43 0 0 0-.716-1.732 2.448 2.448 0 0 0-1.74-.714 2.45 2.45 0 0 0-1.739.714 2.43 2.43 0 0 0-.716 1.732v3.182c0 .577-.474 1.05-1.054 1.05H6.678c-.582 0-1.054-.47-1.054-1.05v-7.182L4.18 14.923a.522.522 0 0 1-.737-.084L2.115 13.2a.52.52 0 0 1 .084-.735l10.474-8.348a.51.51 0 0 1 .654 0L23.8 12.466a.52.52 0 0 1 .084.735"></path></svg>
        </button>
        <button
          onClick={() => setView('views')}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${view === 'views' ? 'text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
          style={{ backgroundColor: view === 'views' ? '#9A3412' : 'transparent' }}
          title="Views"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26" aria-hidden="true" focusable="false" data-garden-id="chrome.nav_item_icon" data-garden-version="9.12.1" className="StyledBaseIcon-sc-1moykgb-0 StyledNavItemIcon-sc-7w9rpt-0 eWlVPJ YOjtB"><path fill="currentColor" d="M20.007 4H5.993A.993.993 0 0 0 5 4.988v8.788a.49.49 0 0 0 .496.494h2.73a.49.49 0 0 1 .496.494v.742a.49.49 0 0 0 .496.494h7.564a.49.49 0 0 0 .496-.494v-.742a.49.49 0 0 1 .496-.494h2.978a.252.252 0 0 0 .248-.247V4.988A.993.993 0 0 0 20.007 4zM9.798 8C9.362 8 9 7.563 9 7.011V6.99c0-.553.362-.99.798-.99h6.395c.445 0 .807.448.807 1s-.362 1-.807 1H9.798zm0 4C9.362 12 9 11.563 9 11.011v-.022c0-.552.362-.989.798-.989h6.395c.445 0 .807.448.807 1s-.362 1-.807 1H9.798zM21 16.52v4.46c0 .56-.447 1.02-.993 1.02H5.993C5.447 22 5 21.54 5 20.98v-4.47c0-.281.222-.51.496-.51h.993c.278 0 .496.224.496.51v.766c0 .285.218.51.496.51H18.52a.504.504 0 0 0 .496-.51v-.756c0-.286.227-.52.506-.52h.973c.278 0 .506.234.506.52"></path></svg>
        </button>
        <button
          onClick={() => setView('users')}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${view === 'users' || view === 'user-detail' ? 'text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
          style={{ backgroundColor: view === 'users' || view === 'user-detail' ? '#9A3412' : 'transparent' }}
          title="Users"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26" aria-hidden="true" focusable="false" data-garden-id="chrome.nav_item_icon" data-garden-version="9.12.1" className="StyledBaseIcon-sc-1moykgb-0 StyledNavItemIcon-sc-7w9rpt-0 eWlVPJ YOjtB"><path fill="currentColor" d="M23.99 20.072c.082.49-.344.928-.878.928h-5.89a.477.477 0 0 1-.485-.555 2.16 2.16 0 0 0 .001-.704 7.74 7.74 0 0 0-1.63-3.63c-.21-.256-.103-.618.223-.731a6.887 6.887 0 0 1 2.265-.38c3.232 0 5.914 2.194 6.394 5.072M21 10.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0M8 13a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm-6.03 8.073c-.583 0-1.048-.518-.96-1.093A7.072 7.072 0 0 1 8 14a7.072 7.072 0 0 1 6.989 5.98c.09.575-.376 1.093-.958 1.093H1.97z"></path></svg>
        </button>
        <button
          onClick={() => setView('organizations')}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${view === 'organizations' || view === 'org-detail' ? 'text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
          style={{ backgroundColor: view === 'organizations' || view === 'org-detail' ? '#9A3412' : 'transparent' }}
          title="Organizations"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" fill="none" viewBox="0 0 26 26" aria-hidden="true" focusable="false" data-garden-id="chrome.nav_item_icon" data-garden-version="9.12.1" className="StyledBaseIcon-sc-1moykgb-0 StyledNavItemIcon-sc-7w9rpt-0 eWlVPJ YOjtB"><path fill="currentColor" fillRule="evenodd" d="M2 22V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-4a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1ZM8 6H5v3h3V6Zm-3 5h3v3H5v-3Zm8-5h-3v3h3V6Zm-3 5h3v3h-3v-3ZM17 7h6a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-6V7Zm5 4h-3v3h3v-3Zm-3 5h3v3h-3v-3Z" clipRule="evenodd"></path></svg>
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setView('settings')}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${view === 'settings' ? 'text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
          style={{ backgroundColor: view === 'settings' ? '#9A3412' : 'transparent' }}
          title="Settings"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Top Bar */}
        <div className="h-14 bg-white/80 backdrop-blur-sm border-b border-gray-200/80 flex items-center px-4 gap-3 justify-between">
          <div className="flex items-center gap-3">
            {currentTicket && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-full hover:bg-gray-100 hover:border-gray-300 cursor-pointer transition-all" onClick={() => setView('ticket')}>
                <span className="text-sm font-medium text-gray-900">Ticket #{currentTicket.id}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{currentTicket.id}]</span></span>
                <button
                  onClick={(e) => { e.stopPropagation(); setCurrentTicket(null); setView('home'); }}
                  className="w-4 h-4 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            )}
            <button
              onClick={() => setView('create')}
              className="px-3.5 py-1.5 bg-orange-800 text-white rounded-lg text-sm font-medium shadow-sm hover:bg-orange-900 hover:shadow active:translate-y-px transition-all">
              + Add Ticket
            </button>
          </div>

          {/* Search Bar */}
          <div className="flex items-center gap-2 flex-1 max-w-md mx-4">
            <div className="relative flex-1">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 110-16 8 8 0 010 16z" /></svg>
              <input
                type="text"
                placeholder="Search tickets, users, organizations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && executeSearch()}
                className="w-full pl-9 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:bg-white focus:border-orange-700 focus:ring-2 focus:ring-orange-700/15 transition-all"
              />
            </div>
            <select
              value={searchType}
              onChange={(e) => setSearchType(e.target.value as any)}
              className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-700 hover:border-gray-300 focus:outline-none focus:bg-white focus:border-orange-700 focus:ring-2 focus:ring-orange-700/15 transition-all"
            >
              <option value="all">All</option>
              <option value="ticket">Tickets</option>
              <option value="user">Users</option>
              <option value="organization">Orgs</option>
            </select>
            <button
              onClick={() => executeSearch()}
              className="px-3.5 py-1.5 bg-orange-800 text-white rounded-lg text-sm font-medium shadow-sm hover:bg-orange-900 hover:shadow active:translate-y-px transition-all"
            >
              Search
            </button>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-700 to-orange-900 text-white flex items-center justify-center text-sm font-semibold shadow-sm ring-2 ring-white hover:shadow-md transition-all"
              >
                {currentUser?.name?.charAt(0) || 'A'}
              </button>
              {showProfileMenu && (
                <div className="absolute right-0 mt-2 w-52 bg-white border border-gray-200/80 rounded-xl shadow-xl ring-1 ring-black/5 z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                    <p className="text-sm font-medium text-gray-900">{currentUser?.name}{currentUser && <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{currentUser.id}]</span>}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{currentUser?.email}</p>
                  </div>
                  <div className="py-1">
                    <button
                      onClick={() => setUserStatus('online')}
                      className={`w-full text-left px-4 py-2 text-sm transition ${userStatus === 'online' ? 'bg-orange-50 text-orange-900 font-medium' : 'hover:bg-gray-50 text-gray-700'}`}
                    >
                      <span className="inline-flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500"></span>Online</span>
                    </button>
                    <button
                      onClick={() => setUserStatus('offline')}
                      className={`w-full text-left px-4 py-2 text-sm transition ${userStatus === 'offline' ? 'bg-orange-50 text-orange-900 font-medium' : 'hover:bg-gray-50 text-gray-700'}`}
                    >
                      <span className="inline-flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-gray-400"></span>Offline</span>
                    </button>
                  </div>
                  <div className="border-t border-gray-100">
                    <button
                      onClick={onClose}
                      className="w-full text-left px-4 py-2.5 hover:bg-rose-50 text-sm text-rose-600 font-medium transition"
                    >
                      Leave
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content Area */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-9 h-9 border-[3px] border-orange-100 border-t-orange-700 rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center text-rose-600">
            <div className="text-center max-w-sm">
              <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-rose-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
              </div>
              <p className="mb-4 text-sm text-gray-700">{error}</p>
              <button
                onClick={() => { setError(null); loadDataRef.current(); }}
                className="px-4 py-2 bg-orange-800 text-white rounded-lg shadow-sm hover:bg-orange-900 hover:shadow transition-all text-sm font-medium"
              >
                Retry
              </button>
            </div>
          </div>
        ) : view === 'home' ? (
          <HomePage
            tickets={sortedTickets}
            currentUser={currentUser}
            onTicketClick={handleTicketClick}
            onDeleteTicket={handleDeleteTicket}
            workFilter={workFilter}
            onFilterChange={setWorkFilter}
            sortBy={sortBy}
            onSortChange={setSortBy}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            availableTags={availableTags}
            tagFilter={tagFilter}
            onTagFilterChange={setTagFilter}
            onOpenTagManagement={() => setShowTagManagement(true)}
            ccCount={ccTickets.length}
            followingCount={followingTickets.length}
            completedCount={completedTickets.length}
          />
        ) : view === 'views' ? (
          <ViewsPage
            tickets={allTickets}
            currentUser={currentUser}
            viewCounts={viewCounts}
            activeTicketView={activeTicketView}
            onTicketViewChange={setActiveTicketView}
            onTicketClick={handleTicketClick}
          />
        ) : view === 'create' ? (
          <CreateTicketPage
            currentUser={currentUser}
            users={users}
            organizations={organizations}
            availableTags={availableTags}
            onCancel={() => setView('home')}
            onTicketCreated={async () => { loadDataRef.current(); setView('home'); }}
            api={api}
            onViewAttachment={handleViewAttachment}
          />
        ) : view === 'ticket' && currentTicket ? (
          <TicketPage
            ticket={currentTicket}
            comments={ticketComments}
            commentAuthors={commentAuthors}
            commentVisibility={commentVisibility}
            onBack={() => { setCurrentTicket(null); setView('home'); }}
            onSendComment={handleSendComment}
            onStatusChange={handleStatusChange}
            onUpdateTicket={handleUpdateTicket}
            onFieldChange={handleTicketFieldChange}
            onDeleteTicket={handleDeleteTicket}
            newComment={newComment}
            onNewCommentChange={setNewComment}
            users={users}
            organizations={organizations}
            currentUser={currentUser}
            audits={ticketAudits}
            auditsLoading={auditsLoading}
            showAuditPanel={showAuditPanel}
            onToggleAuditPanel={() => {
              if (!showAuditPanel) loadTicketAudits(currentTicket.id)
              setShowAuditPanel(!showAuditPanel)
            }}
            expandedAuditId={expandedAuditId}
            expandedAuditData={expandedAuditData}
            auditDetailLoading={auditDetailLoading}
            onAuditClick={loadAuditDetails}
            onAttachmentUpload={handleAttachmentUpload}
            pendingAttachments={pendingAttachments}
            onRemoveAttachment={(id) => setPendingAttachments(prev => prev.filter(a => a.id !== id))}
            onViewAttachment={handleViewAttachment}
            macros={macros}
            onApplyMacro={handleApplyMacro}
            requesterHistory={requesterHistory}
            onTicketClick={handleTicketClick}
          />
        ) : view === 'users' ? (
          <UsersPage
            users={users}
            organizations={organizations}
            currentUser={currentUser}
            onUserClick={handleUserClick}
            onCreateUser={() => setShowCreateUserModal(true)}
            onDeleteUser={(userId, name) => setUserDeleteConfirmation({ userId, name })}
          />
        ) : view === 'user-detail' && selectedUser ? (
          <UserDetailPage
            user={selectedUser}
            organizations={organizations}
            onBack={() => { setSelectedUser(null); setView('users'); }}
            onUpdate={(updates) => handleUpdateUser(selectedUser.id, updates)}
            onDelete={() => setUserDeleteConfirmation({ userId: selectedUser.id, name: selectedUser.name })}
          />
        ) : view === 'organizations' ? (
          <OrganizationsPage
            organizations={organizations}
            users={users}
            onOrgClick={handleOrgClick}
            onCreateOrg={() => setShowCreateOrgModal(true)}
            onDeleteOrg={(orgId, name) => setOrgDeleteConfirmation({ orgId, name })}
          />
        ) : view === 'org-detail' && selectedOrg ? (
          <OrgDetailPage
            organization={selectedOrg}
            users={users.filter(u => u.organization_id === selectedOrg.id)}
            onBack={() => { setSelectedOrg(null); setView('organizations'); }}
            onUpdate={(updates) => handleUpdateOrg(selectedOrg.id, updates)}
            onDelete={() => setOrgDeleteConfirmation({ orgId: selectedOrg.id, name: selectedOrg.name })}
          />
        ) : view === 'search' ? (
          <SearchResultsPage
            results={searchResults}
            loading={searchLoading}
            query={searchQuery}
            searchType={searchType}
            onTypeChange={(type) => { setSearchType(type); executeSearch(type); }}
            onResultClick={(result) => {
              if (result.result_type === 'ticket') {
                const ticket = allTickets.find(t => t.id === result.id)
                if (ticket) handleTicketClick(ticket)
              } else if (result.result_type === 'user') {
                const user = users.find(u => u.id === result.id)
                if (user) handleUserClick(user)
              } else if (result.result_type === 'organization') {
                const org = organizations.find(o => o.id === result.id)
                if (org) handleOrgClick(org)
              }
            }}
          />
        ) : view === 'settings' ? (
          <div className="flex-1 overflow-y-auto p-8 bg-gray-50/50">
            <h1 className="text-2xl font-semibold text-gray-900 mb-1 tracking-tight">Settings</h1>
            <p className="text-sm text-gray-500 mb-8">Manage your account and view workspace statistics</p>
            <div className="max-w-2xl space-y-6">
              <div className="bg-white rounded-2xl border border-gray-200/70 shadow-sm p-6">
                <h2 className="text-base font-semibold text-gray-900 mb-5 tracking-tight">Account</h2>
                <div className="space-y-1">
                  <div className="flex justify-between items-center py-2.5 border-b border-gray-100">
                    <span className="text-sm text-gray-500">Name</span>
                    <span className="text-sm font-medium text-gray-900">{currentUser?.name || 'N/A'}{currentUser && <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{currentUser.id}]</span>}</span>
                  </div>
                  <div className="flex justify-between items-center py-2.5 border-b border-gray-100">
                    <span className="text-sm text-gray-500">Email</span>
                    <span className="text-sm font-medium text-gray-900">{currentUser?.email || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center py-2.5 border-b border-gray-100">
                    <span className="text-sm text-gray-500">Role</span>
                    <span className="text-sm font-medium text-gray-900 capitalize">{currentUser?.role || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2.5">
                    <span className="text-sm text-gray-500">Status</span>
                    <select
                      value={userStatus}
                      onChange={(e) => setUserStatus(e.target.value as any)}
                      className="text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 hover:border-gray-300 focus:outline-none focus:bg-white focus:border-orange-700 focus:ring-2 focus:ring-orange-700/15 transition-all"
                    >
                      <option value="online">Online</option>
                      <option value="absent">Absent</option>
                      <option value="transfers">Transfers only</option>
                      <option value="offline">Offline</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-gray-200/70 shadow-sm p-6">
                <h2 className="text-base font-semibold text-gray-900 mb-5 tracking-tight">Statistics</h2>
                <div className="space-y-1">
                  <div className="flex justify-between items-center py-2.5 border-b border-gray-100">
                    <span className="text-sm text-gray-500">Total Tickets</span>
                    <span className="text-sm font-semibold text-gray-900 tabular-nums">{allTickets.length}</span>
                  </div>
                  <div className="flex justify-between items-center py-2.5 border-b border-gray-100">
                    <span className="text-sm text-gray-500">Open Tickets</span>
                    <span className="text-sm font-semibold text-gray-900 tabular-nums">{statusCounts['open'] || 0}</span>
                  </div>
                  <div className="flex justify-between items-center py-2.5 border-b border-gray-100">
                    <span className="text-sm text-gray-500">Pending Tickets</span>
                    <span className="text-sm font-semibold text-gray-900 tabular-nums">{statusCounts['pending'] || 0}</span>
                  </div>
                  <div className="flex justify-between items-center py-2.5 border-b border-gray-100">
                    <span className="text-sm text-gray-500">Total Users</span>
                    <span className="text-sm font-semibold text-gray-900 tabular-nums">{users.length}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2.5">
                    <span className="text-sm text-gray-500">Total Organizations</span>
                    <span className="text-sm font-semibold text-gray-900 tabular-nums">{organizations.length}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      </div>

      {/* Delete Ticket Confirmation Modal */}
      {deleteConfirmation && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl ring-1 ring-black/5 p-6 w-96">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-rose-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900 mb-1">Delete ticket?</h2>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Are you sure you want to delete "<span className="font-medium text-gray-900">{deleteConfirmation.subject}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{deleteConfirmation.ticketId}]</span></span>"? This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteConfirmation(null)} className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium text-sm">Cancel</button>
              <button onClick={confirmDeleteTicket} className="px-4 py-2 bg-rose-600 text-white rounded-lg shadow-sm hover:bg-rose-700 hover:shadow transition-all font-medium text-sm">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete User Confirmation Modal */}
      {userDeleteConfirmation && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl ring-1 ring-black/5 p-6 w-96">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-rose-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900 mb-1">Delete user?</h2>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Are you sure you want to delete "<span className="font-medium text-gray-900">{userDeleteConfirmation.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{userDeleteConfirmation.userId}]</span></span>"? This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setUserDeleteConfirmation(null)} className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium text-sm">Cancel</button>
              <button onClick={() => handleDeleteUser(userDeleteConfirmation.userId)} className="px-4 py-2 bg-rose-600 text-white rounded-lg shadow-sm hover:bg-rose-700 hover:shadow transition-all font-medium text-sm">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Organization Confirmation Modal */}
      {orgDeleteConfirmation && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl ring-1 ring-black/5 p-6 w-96">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-rose-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900 mb-1">Delete organization?</h2>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Are you sure you want to delete "<span className="font-medium text-gray-900">{orgDeleteConfirmation.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{orgDeleteConfirmation.orgId}]</span></span>"? This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setOrgDeleteConfirmation(null)} className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium text-sm">Cancel</button>
              <button onClick={() => handleDeleteOrg(orgDeleteConfirmation.orgId)} className="px-4 py-2 bg-rose-600 text-white rounded-lg shadow-sm hover:bg-rose-700 hover:shadow transition-all font-medium text-sm">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {showCreateUserModal && (
        <CreateUserModal
          organizations={organizations}
          onClose={() => setShowCreateUserModal(false)}
          onCreate={handleCreateUser}
        />
      )}

      {/* Create Organization Modal */}
      {showCreateOrgModal && (
        <CreateOrgModal
          onClose={() => setShowCreateOrgModal(false)}
          onCreate={handleCreateOrg}
        />
      )}

      {/* Tag Management Modal */}
      {showTagManagement && (
        <TagManagementModal
          availableTags={availableTags}
          onClose={() => setShowTagManagement(false)}
        />
      )}

      {/* Attachment Detail Modal */}
      {selectedAttachment && (
        <AttachmentDetailModal
          attachment={selectedAttachment}
          onClose={() => setSelectedAttachment(null)}
          onDelete={pendingAttachments.some(a => a.id === selectedAttachment.id) ? handleDeleteAttachment : undefined}
          loading={attachmentLoading}
        />
      )}
    </div>
  )
}

// HomePage Component
interface HomePageProps {
  tickets: Ticket[]
  currentUser: User | null
  onTicketClick: (ticket: Ticket) => void
  onDeleteTicket: (ticketId: number) => void
  workFilter: WorkFilter
  onFilterChange: (filter: WorkFilter) => void
  sortBy: 'recommended' | 'oldest' | 'latest'
  onSortChange: (sort: 'recommended' | 'oldest' | 'latest') => void
  statusFilter: string
  onStatusFilterChange: (status: string) => void
  availableTags: string[]
  tagFilter: string[]
  onTagFilterChange: (tags: string[]) => void
  onOpenTagManagement: () => void
  ccCount: number
  followingCount: number
  completedCount: number
}

function HomePage({
  tickets,
  currentUser,
  onTicketClick,
  workFilter,
  onFilterChange,
  sortBy,
  onSortChange,
  statusFilter,
  onStatusFilterChange,
  availableTags,
  tagFilter,
  onTagFilterChange,
  onOpenTagManagement,
  ccCount,
  followingCount,
  completedCount,
}: HomePageProps) {
  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left Sidebar - Work Filters */}
      <div className="w-60 bg-gray-50/70 border-r border-gray-200/70 p-4 overflow-y-auto">
        <div className="mb-6">
          <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 px-3">Your work</h3>
          <button
            onClick={() => onFilterChange('tickets')}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${workFilter === 'tickets' ? 'bg-white text-gray-900 font-medium shadow-sm ring-1 ring-gray-200/70' : 'text-gray-600 hover:bg-white/70 hover:text-gray-900'}`}
          >
            All tickets
          </button>
        </div>

        <div className="mb-6">
          <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 px-3">Shared work</h3>
          <button
            onClick={() => onFilterChange('cc')}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center justify-between ${workFilter === 'cc' ? 'bg-white text-gray-900 font-medium shadow-sm ring-1 ring-gray-200/70' : 'text-gray-600 hover:bg-white/70 hover:text-gray-900'}`}
          >
            <span>In copy (CC)</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${workFilter === 'cc' ? 'bg-orange-50 text-orange-800' : 'bg-gray-200/70 text-gray-600'}`}>{ccCount}</span>
          </button>
          <button
            onClick={() => onFilterChange('following')}
            className={`w-full text-left px-3 py-2 mt-1 rounded-lg text-sm transition-all flex items-center justify-between ${workFilter === 'following' ? 'bg-white text-gray-900 font-medium shadow-sm ring-1 ring-gray-200/70' : 'text-gray-600 hover:bg-white/70 hover:text-gray-900'}`}
          >
            <span>Following</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${workFilter === 'following' ? 'bg-orange-50 text-orange-800' : 'bg-gray-200/70 text-gray-600'}`}>{followingCount}</span>
          </button>
        </div>

        <div className="mb-6">
          <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 px-3">Completed</h3>
          <button
            onClick={() => onFilterChange('completed')}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center justify-between ${workFilter === 'completed' ? 'bg-white text-gray-900 font-medium shadow-sm ring-1 ring-gray-200/70' : 'text-gray-600 hover:bg-white/70 hover:text-gray-900'}`}
          >
            <span>Last 30 days</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${workFilter === 'completed' ? 'bg-orange-50 text-orange-800' : 'bg-gray-200/70 text-gray-600'}`}>{completedCount}</span>
          </button>
        </div>

        {/* Tag Filter */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2 px-3">
            <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Filter by tags</h3>
            <button
              onClick={onOpenTagManagement}
              className="p-1 text-gray-400 hover:text-orange-800 hover:bg-white rounded-md transition"
              title="Manage Tags"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
          {availableTags.length > 0 ? (
            <div className="px-2">
            <div className="flex flex-wrap gap-1.5">
              {availableTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => {
                    if (tagFilter.includes(tag)) {
                      onTagFilterChange(tagFilter.filter(t => t !== tag))
                    } else {
                      onTagFilterChange([...tagFilter, tag])
                    }
                  }}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-full transition-all ${tagFilter.includes(tag) ? 'bg-orange-800 text-white shadow-sm' : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:ring-gray-300 hover:text-gray-900'}`}
                >
                  {tag}
                </button>
              ))}
            </div>
            {tagFilter.length > 0 && (
              <button
                onClick={() => onTagFilterChange([])}
                className="mt-3 text-xs text-orange-800 hover:text-orange-900 font-medium transition"
              >
                Clear filters
              </button>
            )}
          </div>
          ) : (
            <p className="text-xs text-gray-400 px-3">No tags yet</p>
          )}
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col bg-gray-50/40">
        {/* Filters and Stats */}
        <div className="flex gap-4 px-5 py-3 border-b border-gray-200/70 bg-white">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900 tabular-nums">{tickets.length}</span>
            <span className="text-sm text-gray-500">{tickets.length === 1 ? 'ticket' : 'tickets'}</span>
          </div>
          <div className="flex gap-2 ml-auto">
            <select
              value={statusFilter}
              onChange={(e) => onStatusFilterChange(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white text-gray-700 hover:border-gray-300 focus:outline-none focus:border-orange-700 focus:ring-2 focus:ring-orange-700/15 transition-all"
            >
              <option value="all">All Status</option>
              <option value="new">New</option>
              <option value="open">Open</option>
              <option value="pending">Pending</option>
              <option value="hold">On-hold</option>
              <option value="solved">Solved</option>
              <option value="closed">Closed</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value as any)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white text-gray-700 hover:border-gray-300 focus:outline-none focus:border-orange-700 focus:ring-2 focus:ring-orange-700/15 transition-all"
            >
              <option value="recommended">Recommended</option>
              <option value="oldest">Oldest update</option>
              <option value="latest">Latest update</option>
            </select>
          </div>
        </div>

        {/* Tickets List */}
        <div className="flex-1 flex gap-5 p-5 overflow-hidden">
          <div className="flex-1 overflow-y-auto bg-white rounded-2xl border border-gray-200/70 shadow-sm">
            <div>
              {tickets.length === 0 ? (
                <div className="text-center py-20 px-6">
                  <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4 text-2xl">📋</div>
                  <p className="text-base font-semibold text-gray-900 tracking-tight">No tickets yet</p>
                  <p className="text-sm mt-1.5 text-gray-500">Click "+ Add Ticket" in the header to create your first ticket</p>
                  {!currentUser && (
                    <p className="text-sm mt-5 text-orange-800 font-medium max-w-xs mx-auto">
                      Note: You need to create users first before creating tickets.
                      <br />Click the Users tab in the sidebar.
                    </p>
                  )}
                </div>
              ) : (
                tickets.map((ticket) => {
                  const isAssignedToMe = ticket.assignee_id === currentUser?.id

                  return (
                    <div
                      key={ticket.id}
                      onClick={() => onTicketClick(ticket)}
                      className="group px-5 py-4 border-b border-gray-100 last:border-b-0 hover:bg-gray-50/70 cursor-pointer transition-colors flex items-center gap-4"
                    >
                      {/* Status indicator line */}
                      <div
                        className="w-1 h-11 rounded-full flex-shrink-0"
                        style={{
                          backgroundColor: ticket.status.toLowerCase() === 'new' ? '#0EA5E9' :
                                          ticket.status.toLowerCase() === 'open' ? '#F43F5E' :
                                          ticket.status.toLowerCase() === 'pending' ? '#F59E0B' :
                                          ticket.status.toLowerCase() === 'solved' ? '#10B981' : '#CBD5E1'
                        }}
                      />
                      {/* Ticket ID and Priority */}
                      <div className="w-20 flex-shrink-0 text-center">
                        <span className="text-xs font-mono text-gray-400 tracking-tight">#{ticket.id}</span>
                        <div className="mt-1">
                          <PriorityBadge priority={ticket.priority} />
                        </div>
                      </div>
                      {/* Main content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-gray-900 truncate text-sm tracking-tight">{ticket.subject}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{ticket.id}]</span></h4>
                          {isAssignedToMe && (
                            <span className="flex-shrink-0 w-2 h-2 bg-orange-700 rounded-full ring-2 ring-orange-100" title="Assigned to you" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[11px] text-gray-400">{formatDateShort(ticket.created_at)}</span>
                          {ticket.type && <TypeBadge type={ticket.type} />}
                          {ticket.tags && ticket.tags.length > 0 && (
                            <div className="flex gap-1">
                              {ticket.tags.slice(0, 2).map(tag => (
                                <TagBadge key={tag} tag={tag} />
                              ))}
                              {ticket.tags.length > 2 && (
                                <span className="text-[11px] text-gray-400">+{ticket.tags.length - 2}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      {/* Status */}
                      <div className="flex-shrink-0">
                        <StatusBadge status={ticket.status} />
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Stats Sidebar */}
          <div className="w-56 flex-shrink-0 space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200/70 shadow-sm p-5">
              <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-4">Status</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-sky-500"></span>
                    <span className="text-sm text-gray-700">New</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-900 tabular-nums">{tickets.filter((t: Ticket) => t.status.toLowerCase() === 'new').length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                    <span className="text-sm text-gray-700">Open</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-900 tabular-nums">{tickets.filter((t: Ticket) => t.status.toLowerCase() === 'open').length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    <span className="text-sm text-gray-700">Pending</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-900 tabular-nums">{tickets.filter((t: Ticket) => t.status.toLowerCase() === 'pending').length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span className="text-sm text-gray-700">Solved</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-900 tabular-nums">{tickets.filter((t: Ticket) => t.status.toLowerCase() === 'solved').length}</span>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200/70 shadow-sm p-5">
              <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-4">Priority</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-rose-700 font-medium">Urgent</span>
                  <span className="text-sm font-semibold text-gray-900 tabular-nums">{tickets.filter((t: Ticket) => t.priority.toLowerCase() === 'urgent').length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-orange-800 font-medium">High</span>
                  <span className="text-sm font-semibold text-gray-900 tabular-nums">{tickets.filter((t: Ticket) => t.priority.toLowerCase() === 'high').length}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Views Page Component - Shows ticket views with filtering
interface ViewsPageProps {
  tickets: Ticket[]
  currentUser: User | null
  viewCounts: Record<string, number>
  activeTicketView: string
  onTicketViewChange: (viewId: string) => void
  onTicketClick: (ticket: Ticket) => void
}

function ViewsPage({
  tickets,
  currentUser,
  viewCounts,
  activeTicketView,
  onTicketViewChange,
  onTicketClick,
}: ViewsPageProps) {
  // Get filtered tickets based on active view
  const activeView = TICKET_VIEWS.find(v => v.id === activeTicketView)
  const filteredTickets = activeView
    ? tickets.filter(t => activeView.filter(t, currentUser?.id))
    : tickets

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left Panel - Views List */}
      <div className="w-64 bg-gray-50/70 border-r border-gray-200/70 overflow-y-auto">
        <div className="p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-4 tracking-tight">Views</h2>
          <div className="space-y-1">
            {TICKET_VIEWS.map(view => (
              <button
                key={view.id}
                onClick={() => onTicketViewChange(view.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center justify-between ${
                  activeTicketView === view.id
                    ? 'bg-white text-gray-900 font-medium shadow-sm ring-1 ring-gray-200/70'
                    : 'text-gray-600 hover:bg-white/70 hover:text-gray-900'
                }`}
              >
                <span className="flex items-center gap-2">
                  {view.icon && <span className="text-base">{view.icon}</span>}
                  <span>{view.name}</span>
                </span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                  activeTicketView === view.id
                    ? 'bg-orange-50 text-orange-800'
                    : 'bg-gray-200/70 text-gray-600'
                }`}>
                  {viewCounts[view.id] || 0}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel - Filtered Tickets */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50/40">
        <div className="px-5 py-4 border-b border-gray-200/70 bg-white">
          <h3 className="text-base font-semibold text-gray-900 tracking-tight">
            {activeView?.icon} {activeView?.name || 'All Tickets'}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {filteredTickets.length} ticket{filteredTickets.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {filteredTickets.length === 0 ? (
            <div className="text-center py-16 px-6">
              <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4 text-2xl">{activeView?.icon || '📋'}</div>
              <p className="text-base font-semibold text-gray-900 tracking-tight">No tickets in this view</p>
              <p className="text-sm mt-1.5 text-gray-500">Tickets matching this filter will appear here</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredTickets.map(ticket => (
                <button
                  key={ticket.id}
                  onClick={() => onTicketClick(ticket)}
                  className="w-full text-left p-4 bg-white rounded-xl border border-gray-200/70 shadow-sm hover:shadow-md hover:border-gray-300 transition-all"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-mono text-gray-400">#{ticket.id}</span>
                    <span className="text-[11px] text-gray-400">{formatTime(ticket.updated_at)}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-900 mb-2.5 tracking-tight">{ticket.subject}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{ticket.id}]</span></p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <StatusBadge status={ticket.status} />
                    <PriorityBadge priority={ticket.priority} />
                    {ticket.type && <TypeBadge type={ticket.type} />}
                    {ticket.tags && ticket.tags.length > 0 && (
                      <div className="flex gap-1">
                        {ticket.tags.slice(0, 2).map(tag => (
                          <TagBadge key={tag} tag={tag} />
                        ))}
                        {ticket.tags.length > 2 && (
                          <span className="text-[11px] text-gray-400">+{ticket.tags.length - 2}</span>
                        )}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Users Page Component
interface UsersPageProps {
  users: User[]
  organizations: Organization[]
  currentUser: User | null
  onUserClick: (user: User) => void
  onCreateUser: () => void
  onDeleteUser: (userId: number, name: string) => void
}

function UsersPage({ users, organizations, onUserClick, onCreateUser, onDeleteUser }: UsersPageProps) {
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')

  const filteredUsers = users.filter(user => {
    if (roleFilter !== 'all' && user.role !== roleFilter) return false
    if (searchTerm && !user.name.toLowerCase().includes(searchTerm.toLowerCase()) && !user.email.toLowerCase().includes(searchTerm.toLowerCase())) return false
    return true
  })

  const getOrgName = (orgId?: number) => {
    if (!orgId) return '-'
    const org = organizations.find(o => o.id === orgId)
    return org?.name || '-'
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50/40">
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-200/70 bg-white">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 tracking-tight">Users</h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage agents, admins, and end users</p>
          </div>
          <button
            onClick={onCreateUser}
            className="px-3.5 py-2 bg-orange-800 text-white rounded-lg text-sm font-medium shadow-sm hover:bg-orange-900 hover:shadow active:translate-y-px transition-all"
          >
            + Add User
          </button>
        </div>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 max-w-xs px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 hover:border-gray-300 focus:outline-none focus:bg-white focus:border-orange-700 focus:ring-2 focus:ring-orange-700/15 transition-all"
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 hover:border-gray-300 focus:outline-none focus:bg-white focus:border-orange-700 focus:ring-2 focus:ring-orange-700/15 transition-all"
          >
            <option value="all">All Roles</option>
            <option value="admin">Admin</option>
            <option value="agent">Agent</option>
            <option value="end-user">End User</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white rounded-2xl border border-gray-200/70 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="text-left text-[11px] text-gray-500 uppercase tracking-wider border-b border-gray-100 bg-gray-50/70">
              <th className="px-5 py-3 font-semibold">Name</th>
              <th className="px-5 py-3 font-semibold">Email</th>
              <th className="px-5 py-3 font-semibold">Role</th>
              <th className="px-5 py-3 font-semibold">Organization</th>
              <th className="px-5 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map(user => (
              <tr key={user.id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/70 cursor-pointer transition-colors" onClick={() => onUserClick(user)}>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-700 to-orange-900 flex items-center justify-center text-white text-sm font-semibold ring-2 ring-white shadow-sm">
                      {user.name.charAt(0)}
                    </div>
                    <span className="font-medium text-gray-900">{user.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{user.id}]</span></span>
                  </div>
                </td>
                <td className="px-5 py-3 text-sm text-gray-600">{user.email}</td>
                <td className="px-5 py-3"><RoleBadge role={user.role} /></td>
                <td className="px-5 py-3 text-sm text-gray-600">{getOrgName(user.organization_id)}</td>
                <td className="px-5 py-3 text-right">
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteUser(user.id, user.name); }}
                    className="text-rose-600 hover:text-rose-700 text-sm font-medium hover:bg-rose-50 px-2 py-1 rounded-md transition"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredUsers.length === 0 && (
          <div className="text-center py-16 px-6">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4 text-2xl">👥</div>
            <p className="text-base font-semibold text-gray-900 tracking-tight">No users found</p>
            <p className="text-sm mt-1.5 text-gray-500">Click "+ Add User" to create your first user</p>
            <p className="text-xs text-gray-400 mt-4">Users are needed to create tickets and organizations</p>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}

// User Detail Page
interface UserDetailPageProps {
  user: User
  organizations: Organization[]
  onBack: () => void
  onUpdate: (updates: Partial<User>) => void
  onDelete: () => void
}

function UserDetailPage({ user, organizations, onBack, onUpdate, onDelete }: UserDetailPageProps) {
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [role, setRole] = useState(user.role)
  const [phone, setPhone] = useState(user.phone || '')
  const [notes, setNotes] = useState(user.notes || '')
  const [orgId, setOrgId] = useState(user.organization_id || 0)

  const handleSave = () => {
    onUpdate({ name, email, role, phone, notes, organization_id: orgId || undefined })
  }

  const inputCls = "w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 hover:border-gray-300 focus:outline-none focus:bg-white focus:border-orange-700 focus:ring-2 focus:ring-orange-700/15 transition-all"
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50/40">
      <div className="px-6 py-5 border-b border-gray-200/70 bg-white">
        <button onClick={onBack} className="inline-flex items-center gap-1 text-orange-800 hover:text-orange-900 text-sm font-medium mb-2 transition">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Back to Users
        </button>
        <h1 className="text-xl font-semibold text-gray-900 tracking-tight">{user.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{user.id}]</span></h1>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-gray-200/70 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900 mb-5 tracking-tight">User Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Role</label>
                <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
                  <option value="end-user">End User</option>
                  <option value="agent">Agent</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Phone</label>
                <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Organization</label>
                <select value={orgId} onChange={(e) => setOrgId(Number(e.target.value))} className={inputCls}>
                  <option value={0}>None</option>
                  {organizations.map(org => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={inputCls + " resize-none"} />
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={handleSave} className="px-4 py-2 bg-orange-800 text-white rounded-lg text-sm font-medium shadow-sm hover:bg-orange-900 hover:shadow active:translate-y-px transition-all">Save Changes</button>
            <button onClick={onDelete} className="px-4 py-2 bg-white border border-rose-200 text-rose-700 rounded-lg text-sm font-medium hover:bg-rose-50 hover:border-rose-300 transition-all">Delete User</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Organizations Page
interface OrganizationsPageProps {
  organizations: Organization[]
  users: User[]
  onOrgClick: (org: Organization) => void
  onCreateOrg: () => void
  onDeleteOrg: (orgId: number, name: string) => void
}

function OrganizationsPage({ organizations, users, onOrgClick, onCreateOrg, onDeleteOrg }: OrganizationsPageProps) {
  const getUserCount = (orgId: number) => users.filter(u => u.organization_id === orgId).length

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50/40">
      <div className="px-6 py-5 border-b border-gray-200/70 bg-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 tracking-tight">Organizations</h1>
            <p className="text-sm text-gray-500 mt-0.5">Companies and customer groups</p>
          </div>
          <button onClick={onCreateOrg} className="px-3.5 py-2 bg-orange-800 text-white rounded-lg text-sm font-medium shadow-sm hover:bg-orange-900 hover:shadow active:translate-y-px transition-all">
            + Add Organization
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {organizations.map(org => (
            <div
              key={org.id}
              onClick={() => onOrgClick(org)}
              className="bg-white p-5 rounded-2xl border border-gray-200/70 shadow-sm hover:shadow-md hover:border-gray-300 cursor-pointer transition-all"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-sky-100 to-sky-50 flex items-center justify-center text-sky-700 font-semibold ring-1 ring-sky-200/40">
                  {org.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-gray-900 truncate tracking-tight">{org.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{org.id}]</span></h3>
                  <p className="text-xs text-gray-500 truncate">{org.industry || 'No industry'}</p>
                </div>
              </div>
              <div className="text-sm space-y-1.5">
                <div className="flex justify-between"><span className="text-gray-500">Location</span><span className="text-gray-700">{org.location || '–'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Users</span><span className="text-gray-700 font-medium tabular-nums">{getUserCount(org.id)}</span></div>
                {org.domain_names && org.domain_names.length > 0 && (
                  <div className="flex justify-between gap-2"><span className="text-gray-500 flex-shrink-0">Domains</span><span className="text-gray-700 truncate">{org.domain_names.join(', ')}</span></div>
                )}
                {org.tags && org.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1.5">
                    {org.tags.map(tag => (
                      <TagBadge key={tag} tag={tag} />
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-4 pt-3 border-t border-gray-100">
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteOrg(org.id, org.name); }}
                  className="text-rose-600 hover:text-rose-700 text-sm font-medium hover:bg-rose-50 px-2 py-1 -ml-2 rounded-md transition"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
        {organizations.length === 0 && (
          <div className="text-center py-16 px-6">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4 text-2xl">🏢</div>
            <p className="text-base font-semibold text-gray-900 tracking-tight">No organizations found</p>
            <p className="text-sm mt-1.5 text-gray-500">Click "+ Add Organization" to create your first organization</p>
          </div>
        )}
      </div>
    </div>
  )
}

// Organization Detail Page
interface OrgDetailPageProps {
  organization: Organization
  users: User[]
  onBack: () => void
  onUpdate: (updates: Partial<Organization>) => void
  onDelete: () => void
}

function OrgDetailPage({ organization, users, onBack, onUpdate, onDelete }: OrgDetailPageProps) {
  const [name, setName] = useState(organization.name)
  const [industry, setIndustry] = useState(organization.industry || '')
  const [location, setLocation] = useState(organization.location || '')
  const [notes, setNotes] = useState(organization.notes || '')
  const [domainInput, setDomainInput] = useState('')
  const [domains, setDomains] = useState<string[]>(organization.domain_names || [])
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>(organization.tags || [])

  const handleSave = () => {
    onUpdate({ name, industry, location, notes, domain_names: domains, tags })
  }

  const addDomain = () => {
    if (domainInput.trim() && !domains.includes(domainInput.trim())) {
      setDomains([...domains, domainInput.trim()])
      setDomainInput('')
    }
  }

  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()])
      setTagInput('')
    }
  }

  const inputCls = "w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 hover:border-gray-300 focus:outline-none focus:bg-white focus:border-orange-700 focus:ring-2 focus:ring-orange-700/15 transition-all"
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50/40">
      <div className="px-6 py-5 border-b border-gray-200/70 bg-white">
        <button onClick={onBack} className="inline-flex items-center gap-1 text-orange-800 hover:text-orange-900 text-sm font-medium mb-2 transition">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Back to Organizations
        </button>
        <h1 className="text-xl font-semibold text-gray-900 tracking-tight">{organization.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{organization.id}]</span></h1>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-gray-200/70 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900 mb-5 tracking-tight">Organization Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Industry</label>
                <input type="text" value={industry} onChange={(e) => setIndustry(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Location</label>
                <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Domains</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={domainInput}
                    onChange={(e) => setDomainInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addDomain()}
                    placeholder="Add domain"
                    className={inputCls + " flex-1"}
                  />
                  <button onClick={addDomain} className="px-3 py-2 bg-orange-800 text-white rounded-lg text-sm font-medium shadow-sm hover:bg-orange-900 hover:shadow transition-all">Add</button>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {domains.map(domain => (
                    <TagBadge key={domain} tag={domain} onRemove={() => setDomains(domains.filter(d => d !== domain))} />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Tags</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addTag()}
                    placeholder="Add tag"
                    className={inputCls + " flex-1"}
                  />
                  <button onClick={addTag} className="px-3 py-2 bg-orange-800 text-white rounded-lg text-sm font-medium shadow-sm hover:bg-orange-900 hover:shadow transition-all">Add</button>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {tags.map(tag => (
                    <TagBadge key={tag} tag={tag} onRemove={() => setTags(tags.filter(t => t !== tag))} />
                  ))}
                </div>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={inputCls + " resize-none"} />
              </div>
            </div>
          </div>

          {/* Members */}
          <div className="bg-white p-6 rounded-2xl border border-gray-200/70 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900 mb-5 tracking-tight">Members <span className="text-gray-400 font-normal">({users.length})</span></h2>
            {users.length > 0 ? (
              <div className="space-y-1">
                {users.map(user => (
                  <div key={user.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg transition">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-700 to-orange-900 flex items-center justify-center text-white text-sm font-semibold ring-2 ring-white shadow-sm">
                      {user.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{user.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{user.id}]</span></p>
                      <p className="text-xs text-gray-500 truncate">{user.email}</p>
                    </div>
                    <RoleBadge role={user.role} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No members in this organization</p>
            )}
          </div>

          <div className="flex gap-2">
            <button onClick={handleSave} className="px-4 py-2 bg-orange-800 text-white rounded-lg text-sm font-medium shadow-sm hover:bg-orange-900 hover:shadow active:translate-y-px transition-all">Save Changes</button>
            <button onClick={onDelete} className="px-4 py-2 bg-white border border-rose-200 text-rose-700 rounded-lg text-sm font-medium hover:bg-rose-50 hover:border-rose-300 transition-all">Delete Organization</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Search Results Page
interface SearchResultsPageProps {
  results: SearchResult[]
  loading: boolean
  query: string
  searchType: 'all' | 'ticket' | 'user' | 'organization'
  onTypeChange: (type: 'all' | 'ticket' | 'user' | 'organization') => void
  onResultClick: (result: SearchResult) => void
}

function SearchResultsPage({ results, loading, query, searchType, onTypeChange, onResultClick }: SearchResultsPageProps) {
  const ticketResults = results.filter(r => r.result_type === 'ticket')
  const userResults = results.filter(r => r.result_type === 'user')
  const orgResults = results.filter(r => r.result_type === 'organization')

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50/40">
      <div className="px-6 py-5 border-b border-gray-200/70 bg-white">
        <h1 className="text-xl font-semibold text-gray-900 mb-4 tracking-tight">Search results for <span className="text-gray-500 font-normal">"{query}"</span></h1>
        <div className="flex gap-2">
          {(['all', 'ticket', 'user', 'organization'] as const).map(type => (
            <button
              key={type}
              onClick={() => onTypeChange(type)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all ${searchType === type ? 'bg-orange-800 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'}`}
            >
              {type === 'all' ? `All (${results.length})` : type === 'ticket' ? `Tickets (${ticketResults.length})` : type === 'user' ? `Users (${userResults.length})` : `Organizations (${orgResults.length})`}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-9 h-9 border-[3px] border-orange-100 border-t-orange-700 rounded-full animate-spin" />
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-16 px-6">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4 text-2xl">🔍</div>
            <p className="text-base font-semibold text-gray-900 tracking-tight">No results found</p>
            <p className="text-sm mt-1.5 text-gray-500">Try different keywords or filters</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {(searchType === 'all' ? results : results.filter(r => r.result_type === searchType)).map(result => (
              <div
                key={`${result.result_type}-${result.id}`}
                onClick={() => onResultClick(result)}
                className="bg-white p-4 rounded-xl border border-gray-200/70 shadow-sm hover:shadow-md hover:border-gray-300 cursor-pointer transition-all"
              >
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium tracking-wide ring-1 ${
                    result.result_type === 'ticket' ? 'bg-sky-50 text-sky-700 ring-sky-200/60' :
                    result.result_type === 'user' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200/60' :
                    'bg-purple-50 text-purple-700 ring-purple-200/60'
                  }`}>
                    {result.result_type}
                  </span>
                  <span className="font-medium text-gray-900 tracking-tight">
                    {result.result_type === 'ticket' ? `#${result.id} – ${result.subject}` : result.name || result.email}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{result.id}]</span>
                  </span>
                </div>
                {result.result_type === 'ticket' && result.status && (
                  <div className="mt-2.5 flex gap-1.5">
                    <StatusBadge status={result.status} />
                    {result.priority && <PriorityBadge priority={result.priority} />}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Ticket Page Component (with audit panel)
interface TicketPageProps {
  ticket: Ticket
  comments: Comment[]
  commentAuthors: Record<number, number>
  commentVisibility: Record<number, boolean>
  onBack: () => void
  onSendComment: () => void
  onStatusChange: (status: string) => void
  onUpdateTicket: () => void
  onFieldChange: (field: string, value: any) => void
  onDeleteTicket: (ticketId: number) => void
  newComment: string
  onNewCommentChange: (comment: string) => void
  users: User[]
  organizations: Organization[]
  currentUser: User | null
  audits: TicketAudit[]
  auditsLoading: boolean
  showAuditPanel: boolean
  onToggleAuditPanel: () => void
  expandedAuditId: number | null
  expandedAuditData: any
  auditDetailLoading: boolean
  onAuditClick: (ticketId: number, auditId: number) => void
  onAttachmentUpload: (filename: string) => void
  pendingAttachments: Attachment[]
  onRemoveAttachment: (id: number) => void
  onViewAttachment: (attachmentId: number) => void
  macros: Macro[]
  onApplyMacro: (macro: Macro) => void
  requesterHistory: Ticket[]
  onTicketClick: (ticket: Ticket) => void
}

function TicketPage({
  ticket,
  comments,
  commentAuthors,
  commentVisibility,
  onSendComment,
  onStatusChange,
  onUpdateTicket,
  onFieldChange,
  onDeleteTicket,
  newComment,
  onNewCommentChange,
  users,
  organizations,
  currentUser,
  audits,
  auditsLoading,
  showAuditPanel,
  onToggleAuditPanel,
  expandedAuditId,
  expandedAuditData,
  auditDetailLoading,
  onAuditClick,
  onAttachmentUpload,
  pendingAttachments,
  onRemoveAttachment,
  onViewAttachment,
  macros,
  onApplyMacro,
  requesterHistory,
  onTicketClick,
}: TicketPageProps) {
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [showMacroMenu, setShowMacroMenu] = useState(false)
  const [showPriorityMenu, setShowPriorityMenu] = useState(false)
  const [showAssigneeMenu, setShowAssigneeMenu] = useState(false)

  // Get agents (users with agent or admin role) for assignee dropdown
  const agents = users.filter((u: User) => u.role === 'agent' || u.role === 'admin')

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  const getAuthorName = (authorId: number) => {
    const user = users.find((u: User) => u.id === authorId)
    return user?.name || 'Unknown'
  }

  const getUserById = (userId: number) => users.find((u: User) => u.id === userId)
  const getOrgById = (orgId: number) => organizations.find((o: Organization) => o.id === orgId)

  const requester = getUserById(ticket.requester_id)
  const assignee = ticket.assignee_id ? getUserById(ticket.assignee_id) : null
  const requesterOrg = requester?.organization_id ? getOrgById(requester.organization_id) : null

  // Calculate SLA indicators (visual simulation)
  const ticketAge = Math.floor((Date.now() - new Date(ticket.created_at).getTime()) / (1000 * 60 * 60))
  const slaStatus = ticketAge < 4 ? 'good' : ticketAge < 8 ? 'warning' : 'breached'

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header Bar */}
      <div className="h-16 bg-white border-b border-gray-200/70 flex items-center px-5 gap-3">
        <div className="relative">
          <button
            onClick={() => setShowStatusMenu(!showStatusMenu)}
            className="flex items-center gap-1.5 text-sm rounded-lg hover:bg-gray-50 px-2 py-1 -mx-2 transition"
          >
            <StatusBadge status={ticket.status} />
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showStatusMenu && (
            <div className="absolute top-full left-0 mt-1.5 w-48 bg-white border border-gray-200/80 rounded-xl shadow-xl ring-1 ring-black/5 z-50 py-1">
              {['new', 'open', 'pending', 'hold', 'solved', 'closed'].map((status) => (
                <button
                  key={status}
                  onClick={(e: React.MouseEvent) => { e.stopPropagation(); onStatusChange(status); setShowStatusMenu(false); }}
                  className={`w-full text-left px-3 py-2 hover:bg-gray-50 text-sm flex items-center gap-2 transition ${ticket.status.toLowerCase() === status ? 'bg-orange-50/50' : ''}`}
                >
                  <StatusBadge status={status} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold text-gray-900 truncate tracking-tight">
            Ticket #{ticket.id}: {ticket.subject}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{ticket.id}]</span>
          </h1>
          <div className="flex items-center gap-2 mt-1">
            {ticket.type && <TypeBadge type={ticket.type} />}
            {ticket.due_at && (
              <span className="text-[11px] text-gray-500">
                Due: {new Date(ticket.due_at).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        {/* SLA Indicator */}
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium tracking-wide ring-1 ${
          slaStatus === 'good' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200/60' :
          slaStatus === 'warning' ? 'bg-amber-50 text-amber-700 ring-amber-200/60' :
          'bg-rose-50 text-rose-700 ring-rose-200/60'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${slaStatus === 'good' ? 'bg-emerald-500' : slaStatus === 'warning' ? 'bg-amber-500' : 'bg-rose-500'}`}></span>
          {slaStatus === 'breached' ? 'SLA Breached' : `${8 - ticketAge}h remaining`}
        </div>

        <button
          onClick={onToggleAuditPanel}
          className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${showAuditPanel ? 'bg-orange-800 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          History
        </button>

        <button
          onClick={() => onDeleteTicket(ticket.id)}
          className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
          title="Delete Ticket"
        >
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* Three-Panel Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT PANEL - Properties */}
        <div className="w-64 bg-gray-50/70 border-r border-gray-200/70 overflow-y-auto flex-shrink-0">
          <div className="p-4">
            <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-4 px-1">Properties</h3>

            {/* Requester */}
            <div className="mb-3.5">
              <label className="text-[11px] font-medium text-gray-500 block mb-1.5 px-1">Requester</label>
              <div className="flex items-center gap-2.5 p-2.5 bg-white rounded-lg ring-1 ring-gray-200/70 shadow-sm">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-700 to-orange-900 text-white flex items-center justify-center text-sm font-semibold ring-2 ring-white shadow-sm">
                  {requester?.name?.charAt(0) || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{requester?.name || 'Unknown'}{requester && <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{requester.id}]</span>}</p>
                  <p className="text-xs text-gray-500 truncate">{requester?.email || ''}</p>
                </div>
              </div>
            </div>

            {/* Assignee */}
            <div className="mb-3.5">
              <label className="text-[11px] font-medium text-gray-500 block mb-1.5 px-1">Assignee</label>
              <div className="relative">
                <button
                  onClick={() => setShowAssigneeMenu(!showAssigneeMenu)}
                  className="w-full flex items-center gap-2.5 p-2.5 bg-white rounded-lg ring-1 ring-gray-200/70 shadow-sm hover:ring-gray-300 hover:shadow transition-all"
                >
                  {assignee ? (
                    <>
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-sky-500 to-sky-700 text-white flex items-center justify-center text-sm font-semibold ring-2 ring-white shadow-sm">
                        {assignee.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-sm font-medium text-gray-900 truncate">{assignee.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{assignee.id}]</span></p>
                        <RoleBadge role={assignee.role} />
                      </div>
                    </>
                  ) : (
                    <span className="text-sm text-gray-400 italic flex-1 text-left">Unassigned</span>
                  )}
                  <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showAssigneeMenu && (
                  <div className="absolute top-full left-0 mt-1.5 w-full bg-white border border-gray-200/80 rounded-xl shadow-xl ring-1 ring-black/5 z-50 py-1 max-h-56 overflow-y-auto">
                    {/* Unassign option */}
                    <button
                      onClick={() => { onFieldChange('assignee_id', null); setShowAssigneeMenu(false); }}
                      className={`w-full text-left px-3 py-2 hover:bg-gray-50 text-sm transition ${!ticket.assignee_id ? 'bg-orange-50/50' : ''}`}
                    >
                      <span className="text-gray-400 italic">Unassigned</span>
                    </button>
                    {/* Agent options */}
                    {agents.map((agent) => (
                      <button
                        key={agent.id}
                        onClick={() => { onFieldChange('assignee_id', agent.id); setShowAssigneeMenu(false); }}
                        className={`w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2.5 transition ${ticket.assignee_id === agent.id ? 'bg-orange-50/50' : ''}`}
                      >
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-sky-500 to-sky-700 text-white flex items-center justify-center text-xs font-semibold ring-2 ring-white shadow-sm">
                          {agent.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 truncate">{agent.name}</p>
                        </div>
                      </button>
                    ))}
                    {agents.length === 0 && (
                      <div className="px-3 py-2 text-sm text-gray-400 italic">No agents available</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Priority */}
            <div className="mb-3.5">
              <label className="text-[11px] font-medium text-gray-500 block mb-1.5 px-1">Priority</label>
              <div className="relative">
                <button
                  onClick={() => setShowPriorityMenu(!showPriorityMenu)}
                  className="w-full flex items-center justify-between p-2.5 bg-white rounded-lg ring-1 ring-gray-200/70 shadow-sm hover:ring-gray-300 hover:shadow transition-all"
                >
                  <PriorityBadge priority={ticket.priority} />
                  <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showPriorityMenu && (
                  <div className="absolute top-full left-0 mt-1.5 w-full bg-white border border-gray-200/80 rounded-xl shadow-xl ring-1 ring-black/5 z-50 py-1">
                    {['low', 'normal', 'high', 'urgent'].map((priority) => (
                      <button
                        key={priority}
                        onClick={() => { onFieldChange('priority', priority); setShowPriorityMenu(false); }}
                        className={`w-full text-left px-3 py-2 hover:bg-gray-50 text-sm transition ${ticket.priority === priority ? 'bg-orange-50/50' : ''}`}
                      >
                        <PriorityBadge priority={priority} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Type */}
            <div className="mb-3.5">
              <label className="text-[11px] font-medium text-gray-500 block mb-1.5 px-1">Type</label>
              <select
                value={ticket.type || 'question'}
                onChange={(e) => onFieldChange('type', e.target.value)}
                className="w-full p-2.5 bg-white rounded-lg ring-1 ring-gray-200/70 shadow-sm hover:ring-gray-300 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-700/30 transition-all"
              >
                <option value="question">Question</option>
                <option value="incident">Incident</option>
                <option value="problem">Problem</option>
                <option value="task">Task</option>
              </select>
            </div>

            {/* Due Date */}
            <div className="mb-3.5">
              <label className="text-[11px] font-medium text-gray-500 block mb-1.5 px-1">Due Date</label>
              <input
                type="date"
                value={ticket.due_at ? ticket.due_at.split('T')[0] : ''}
                onChange={(e) => {
                  const isoDate = e.target.value ? new Date(e.target.value).toISOString() : null
                  onFieldChange('due_at', isoDate)
                }}
                className="w-full p-2.5 bg-white rounded-lg ring-1 ring-gray-200/70 shadow-sm hover:ring-gray-300 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-700/30 transition-all"
                placeholder="Select due date"
              />
            </div>

            {/* Tags */}
            <div className="mb-3.5">
              <label className="text-[11px] font-medium text-gray-500 block mb-1.5 px-1">Tags</label>
              <div className="p-2.5 bg-white rounded-lg ring-1 ring-gray-200/70 shadow-sm min-h-[40px]">
                {ticket.tags && ticket.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {ticket.tags.map((tag: string) => (
                      <TagBadge key={tag} tag={tag} />
                    ))}
                  </div>
                ) : (
                  <span className="text-sm text-gray-400 italic">No tags</span>
                )}
              </div>
            </div>

            {/* Created */}
            <div className="mb-3.5">
              <label className="text-[11px] font-medium text-gray-500 block mb-1.5 px-1">Created</label>
              <div className="p-2.5 bg-white rounded-lg ring-1 ring-gray-200/70 shadow-sm">
                <span className="text-sm text-gray-700">{formatTime(ticket.created_at)}</span>
              </div>
            </div>

            {/* Updated */}
            <div className="mb-4">
              <label className="text-[11px] font-medium text-gray-500 block mb-1.5 px-1">Updated</label>
              <div className="p-2.5 bg-white rounded-lg ring-1 ring-gray-200/70 shadow-sm">
                <span className="text-sm text-gray-700">{formatTime(ticket.updated_at)}</span>
              </div>
            </div>

            {/* Update Button */}
            <button
              onClick={onUpdateTicket}
              className="w-full px-4 py-2.5 bg-orange-800 text-white rounded-lg text-sm font-medium shadow-sm hover:bg-orange-900 hover:shadow active:translate-y-px transition-all"
            >
              Update Ticket
            </button>
          </div>
        </div>

        {/* CENTER PANEL - Conversation */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          {/* Comments Thread */}
          <div className="flex-1 overflow-y-auto p-6 bg-gray-50/40">
            <div className="space-y-5 max-w-3xl mx-auto">
              {comments.map((comment) => {
                const actualAuthorId = commentAuthors[comment.id] || comment.author_id
                const authorName = getAuthorName(actualAuthorId)
                const isCurrentUser = actualAuthorId === currentUser?.id
                const commentIsPublic = commentVisibility[comment.id] !== undefined ? commentVisibility[comment.id] : comment.public

                return (
                  <div key={comment.id} className={`flex gap-3 ${isCurrentUser ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-white font-semibold text-sm ring-2 ring-white shadow-sm ${isCurrentUser ? 'bg-gradient-to-br from-orange-700 to-orange-900' : 'bg-gradient-to-br from-slate-500 to-slate-700'}`}>
                      {authorName.charAt(0)}
                    </div>
                    <div className={`flex-1 max-w-[78%] ${isCurrentUser ? 'text-right' : ''}`}>
                      <div className={`flex items-center gap-2 mb-1.5 ${isCurrentUser ? 'flex-row-reverse' : ''}`}>
                        <span className="font-medium text-gray-900 text-sm">{authorName}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{comment.id}]</span></span>
                        <span className="text-[11px] text-gray-400">{formatTime(comment.created_at)}</span>
                        {!commentIsPublic && (
                          <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-medium tracking-wide rounded-full ring-1 ring-amber-200/60">Internal</span>
                        )}
                      </div>
                      <div className={`px-4 py-3 rounded-2xl inline-block text-left leading-relaxed shadow-sm ${isCurrentUser ? 'bg-orange-800 text-white rounded-tr-sm' : 'bg-white ring-1 ring-gray-200/70 text-gray-900 rounded-tl-sm'}`}>
                        {comment.html_body ? (
                          <div className="text-sm prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: comment.html_body }} />
                        ) : (
                          <p className="text-sm whitespace-pre-wrap">{comment.body}</p>
                        )}

                        {/* Inline Attachments (Images) */}
                        {comment.attachments && comment.attachments.some((att: Attachment) => att.content_type.startsWith('image/')) && (
                          <div className="mt-3 space-y-2">
                            {comment.attachments
                              .filter((att: Attachment) => att.content_type.startsWith('image/'))
                              .map((att: Attachment) => (
                                <div key={att.id} className="rounded-xl overflow-hidden">
                                  <img
                                    src={att.content_url}
                                    alt={att.file_name}
                                    className="max-w-full h-auto rounded-xl cursor-pointer hover:opacity-90 transition"
                                    onClick={() => onViewAttachment(att.id)}
                                    style={{ maxHeight: '400px' }}
                                  />
                                  <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{att.id}]</span>
                                </div>
                              ))}
                          </div>
                        )}

                        {/* Non-image Attachments */}
                        {comment.attachments && comment.attachments.some((att: Attachment) => !att.content_type.startsWith('image/')) && (
                          <div className={`mt-3 pt-3 border-t ${isCurrentUser ? 'border-orange-700/50' : 'border-gray-100'} space-y-1.5`}>
                            {comment.attachments
                              .filter((att: Attachment) => !att.content_type.startsWith('image/'))
                              .map((att: Attachment) => (
                              <div key={att.id} className={`flex items-center gap-2.5 p-2 rounded-lg ${isCurrentUser ? 'bg-orange-900/40' : 'bg-gray-50'}`}>
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isCurrentUser ? 'bg-orange-900/60' : 'bg-white ring-1 ring-gray-200/70'}`}>
                                  <svg className={`w-4 h-4 ${isCurrentUser ? 'text-white' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                  </svg>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-xs font-medium truncate ${isCurrentUser ? 'text-white' : 'text-gray-900'}`}>{att.file_name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{att.id}]</span></p>
                                  <p className={`text-[11px] ${isCurrentUser ? 'text-orange-100/80' : 'text-gray-500'}`}>{Math.round(att.size / 1024)} KB</p>
                                </div>
                                <button
                                  onClick={() => onViewAttachment(att.id)}
                                  className={`p-1.5 rounded-lg transition ${isCurrentUser ? 'bg-orange-900/60 text-white hover:bg-orange-900' : 'bg-white ring-1 ring-gray-200/70 text-gray-600 hover:text-gray-900 hover:ring-gray-300'}`}
                                  title="View"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                  </svg>
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Reply Composer */}
          <div className="border-t border-gray-200/70 bg-white p-5">
            <div className="max-w-3xl mx-auto">
              {/* Composer Toolbar */}
              <div className="flex items-center gap-2 mb-2.5">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full font-medium bg-orange-50 text-orange-800 ring-1 ring-orange-200/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-700"></span>
                  Public reply
                </span>

                <div className="flex-1" />

                {/* Macros Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setShowMacroMenu(!showMacroMenu)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-100 hover:border-gray-300 transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Macros
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {showMacroMenu && (
                    <div className="absolute bottom-full right-0 mb-1.5 w-80 bg-white border border-gray-200/80 rounded-xl shadow-xl ring-1 ring-black/5 z-50 py-1 max-h-72 overflow-y-auto">
                      <div className="px-3 py-2 border-b border-gray-100">
                        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Quick Actions</p>
                      </div>
                      {macros.map((macro) => (
                        <button
                          key={macro.id}
                          onClick={() => { onApplyMacro(macro); setShowMacroMenu(false); }}
                          className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition"
                        >
                          <p className="text-sm font-medium text-gray-900">{macro.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{macro.id}]</span></p>
                          {macro.description && (
                            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{macro.description}</p>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Attachment Button */}
                <label className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-100 hover:border-gray-300 transition-all cursor-pointer">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  Attach
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        onAttachmentUpload(file.name)
                        e.target.value = ''
                      }
                    }}
                  />
                </label>
              </div>

              {/* Pending Attachments */}
              {pendingAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2.5">
                  {pendingAttachments.map((att) => (
                    <div key={att.id} className="flex items-center gap-2 px-2.5 py-1 bg-gray-50 border border-gray-200 rounded-full text-sm">
                      <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                      <span className="text-xs text-gray-700">{att.file_name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{att.id}]</span></span>
                      <button
                        onClick={() => onRemoveAttachment(att.id)}
                        className="text-gray-400 hover:text-rose-600 transition"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Text Area */}
              <textarea
                value={newComment}
                onChange={(e) => onNewCommentChange(e.target.value)}
                placeholder="Write a public reply..."
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 leading-relaxed hover:border-gray-300 focus:outline-none focus:bg-white focus:border-orange-700 focus:ring-2 focus:ring-orange-700/15 resize-none transition-all"
                rows={4}
              />

              {/* Send Button */}
              <div className="flex justify-end mt-2.5">
                <button
                  onClick={onSendComment}
                  disabled={!newComment.trim()}
                  className="px-4 py-2 bg-orange-800 text-white rounded-lg text-sm font-medium shadow-sm hover:bg-orange-900 hover:shadow active:translate-y-px transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                >
                  Send Reply
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL - Customer Context */}
        <div className="w-72 bg-white border-l border-gray-200/70 overflow-y-auto flex-shrink-0">
          <div className="p-5">
            {/* Requester Card */}
            <div className="text-center mb-7">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-700 to-orange-900 text-white flex items-center justify-center text-2xl font-semibold mx-auto mb-3 ring-4 ring-orange-50 shadow-md">
                {requester?.name?.charAt(0) || '?'}
              </div>
              <h3 className="font-semibold text-gray-900 tracking-tight">{requester?.name || 'Unknown'}{requester && <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{requester.id}]</span>}</h3>
              <p className="text-sm text-gray-500 mt-0.5">{requester?.email || ''}</p>
              {requester?.phone && (
                <p className="text-xs text-gray-400 mt-0.5">{requester.phone}</p>
              )}
              {requesterOrg && (
                <p className="text-xs text-gray-600 mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded-full">{requesterOrg.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{requesterOrg.id}]</span></p>
              )}
            </div>

            {/* User Details */}
            <div className="mb-6">
              <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-3">User Details</h4>
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Role</span>
                  <RoleBadge role={requester?.role || 'end-user'} />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">User ID</span>
                  <span className="text-gray-900 font-mono text-xs">#{requester?.id || '-'}</span>
                </div>
                {requester?.created_at && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Member since</span>
                    <span className="text-gray-700">{formatTime(requester.created_at)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Organization */}
            {requesterOrg && (
              <div className="mb-6">
                <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-3">Organization</h4>
                <div className="p-3 bg-gray-50 rounded-xl">
                  <p className="font-medium text-gray-900 text-sm tracking-tight">{requesterOrg.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{requesterOrg.id}]</span></p>
                  {requesterOrg.domain_names && requesterOrg.domain_names.length > 0 && (
                    <p className="text-xs text-gray-500 mt-1">{requesterOrg.domain_names[0]}</p>
                  )}
                  {requesterOrg.industry && (
                    <p className="text-xs text-gray-500">{requesterOrg.industry}</p>
                  )}
                </div>
              </div>
            )}

            {/* Interaction History */}
            <div className="mb-6">
              <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Interaction History <span className="text-gray-400 font-normal">({requesterHistory.filter((t: Ticket) => t.id !== ticket.id).length})</span>
              </h4>
              {requesterHistory.filter((t: Ticket) => t.id !== ticket.id).length === 0 ? (
                <p className="text-sm text-gray-400 italic">No other tickets</p>
              ) : (
                <div className="space-y-1.5">
                  {requesterHistory
                    .filter((t: Ticket) => t.id !== ticket.id)
                    .slice(0, 5)
                    .map((t: Ticket) => (
                      <button
                        key={t.id}
                        onClick={() => onTicketClick(t)}
                        className="w-full text-left p-2.5 rounded-xl hover:bg-gray-50 transition group"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-gray-400 font-mono">#{t.id}</span>
                          <StatusBadge status={t.status} />
                        </div>
                        <p className="text-sm text-gray-900 truncate mt-1 group-hover:text-orange-900 transition">{t.subject}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{t.id}]</span></p>
                        <p className="text-[11px] text-gray-400 mt-0.5">{formatTime(t.created_at)}</p>
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Audit Panel (slides over right panel when shown) */}
        {showAuditPanel && (
          <div className="absolute right-0 top-16 bottom-0 w-80 bg-white border-l border-gray-200/70 shadow-xl overflow-y-auto z-40">
            <div className="px-4 py-3.5 border-b border-gray-200/70 bg-white/95 backdrop-blur-sm sticky top-0 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 tracking-tight">Ticket History</h3>
              <button
                onClick={onToggleAuditPanel}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4">
              {auditsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-7 h-7 border-[3px] border-orange-100 border-t-orange-700 rounded-full animate-spin" />
                </div>
              ) : audits.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">No audit history</p>
              ) : (
                <div className="space-y-4">
                  {audits.map((audit) => {
                    const isExpanded = expandedAuditId === audit.id
                    return (
                      <div key={audit.id} className="relative pl-5 border-l-2 border-gray-200">
                        <div className="absolute -left-[5px] top-1 w-2.5 h-2.5 bg-orange-700 rounded-full ring-2 ring-white shadow-sm" />
                        <button
                          onClick={() => onAuditClick(ticket.id, audit.id)}
                          className="w-full text-left hover:bg-gray-50 rounded-lg p-1.5 -m-1.5 transition"
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] text-gray-400">{formatTime(audit.created_at)}</p>
                            <span className={`text-[10px] text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                              {auditDetailLoading && isExpanded ? '⋯' : '▾'}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-gray-800 mt-0.5">{getAuthorName(audit.author_id || 0)}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{audit.id}]</span></p>
                        </button>

                        {/* Basic event summary */}
                        {audit.events.map((event) => (
                          <div key={event.id} className="mt-1.5 text-xs text-gray-600 leading-relaxed">
                            <span className="font-medium">{event.type}</span><span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{event.id}]</span>
                            {event.field_name && (
                              <span>: {event.field_name}</span>
                            )}
                            {event.previous_value !== undefined && event.value !== undefined && (
                              <span className="block text-gray-500 mt-0.5">
                                {String(event.previous_value)} → {String(event.value)}
                              </span>
                            )}
                          </div>
                        ))}

                        {/* Expanded audit details from show_audit API */}
                        {isExpanded && expandedAuditData && (
                          <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-200/70 text-xs">
                            <h4 className="font-semibold text-gray-700 mb-2">Audit Details</h4>
                            <div className="space-y-1.5">
                              <div className="flex justify-between">
                                <span className="text-gray-500">Audit ID</span>
                                <span className="font-mono text-gray-700">{expandedAuditData.id}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">Created</span>
                                <span className="text-gray-700">{new Date(expandedAuditData.created_at).toLocaleString()}</span>
                              </div>
                              {expandedAuditData.via && (
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Channel</span>
                                  <span className="text-gray-700">{expandedAuditData.via.channel || 'N/A'}</span>
                                </div>
                              )}
                              {expandedAuditData.metadata?.system && (
                                <>
                                  {expandedAuditData.metadata.system.client && (
                                    <div className="flex justify-between">
                                      <span className="text-gray-500">Client</span>
                                      <span className="text-gray-700">{expandedAuditData.metadata.system.client}</span>
                                    </div>
                                  )}
                                  {expandedAuditData.metadata.system.ip_address && (
                                    <div className="flex justify-between">
                                      <span className="text-gray-500">IP</span>
                                      <span className="font-mono text-gray-700">{expandedAuditData.metadata.system.ip_address}</span>
                                    </div>
                                  )}
                                  {expandedAuditData.metadata.system.location && (
                                    <div className="flex justify-between">
                                      <span className="text-gray-500">Location</span>
                                      <span className="text-gray-700">{expandedAuditData.metadata.system.location}</span>
                                    </div>
                                  )}
                                </>
                              )}
                              {expandedAuditData.events && expandedAuditData.events.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-gray-200/70">
                                  <p className="font-semibold text-gray-600 mb-1.5">Events ({expandedAuditData.events.length})</p>
                                  {expandedAuditData.events.map((evt: any) => (
                                    <div key={evt.id} className="pl-2.5 border-l-2 border-gray-200 mb-2">
                                      <span className="font-medium text-gray-900">{evt.type}</span><span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{evt.id}]</span>
                                      {evt.field_name && <span className="text-gray-500"> – {evt.field_name}</span>}
                                      {evt.body && (
                                        <p className="text-gray-600 mt-1 italic truncate">{evt.body.substring(0, 100)}...</p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        {isExpanded && auditDetailLoading && (
                          <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-200/70 flex items-center justify-center">
                            <div className="w-4 h-4 border-2 border-orange-200 border-t-orange-700 rounded-full animate-spin" />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Create User Modal
function CreateUserModal({ organizations, onClose, onCreate }: { organizations: Organization[]; onClose: () => void; onCreate: (data: Partial<User>) => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('end-user')
  const [phone, setPhone] = useState('')
  const [orgId, setOrgId] = useState(0)

  const inputCls = "w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 hover:border-gray-300 focus:outline-none focus:bg-white focus:border-orange-700 focus:ring-2 focus:ring-orange-700/15 transition-all"
  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl ring-1 ring-black/5 w-[420px]">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 tracking-tight">Create User</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Name *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
              <option value="end-user">End User</option>
              <option value="agent">Agent</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Phone</label>
            <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Organization</label>
            <select value={orgId} onChange={(e) => setOrgId(Number(e.target.value))} className={inputCls}>
              <option value={0}>None</option>
              {organizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
            </select>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition">Cancel</button>
          <button
            onClick={() => { if (name.trim()) onCreate({ name, email, role, phone, organization_id: orgId || undefined }); }}
            disabled={!name.trim()}
            className="px-4 py-2 bg-orange-800 text-white rounded-lg text-sm font-medium shadow-sm hover:bg-orange-900 hover:shadow active:translate-y-px transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}

// Create Organization Modal
function CreateOrgModal({ onClose, onCreate }: { onClose: () => void; onCreate: (data: Partial<Organization>) => void }) {
  const [name, setName] = useState('')
  const [industry, setIndustry] = useState('')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')

  const inputCls = "w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 hover:border-gray-300 focus:outline-none focus:bg-white focus:border-orange-700 focus:ring-2 focus:ring-orange-700/15 transition-all"
  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl ring-1 ring-black/5 w-[420px]">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 tracking-tight">Create Organization</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Name *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Industry</label>
            <input type="text" value={industry} onChange={(e) => setIndustry(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Location</label>
            <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls + " resize-none"} />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition">Cancel</button>
          <button
            onClick={() => { if (name.trim()) onCreate({ name, industry, location, notes }); }}
            disabled={!name.trim()}
            className="px-4 py-2 bg-orange-800 text-white rounded-lg text-sm font-medium shadow-sm hover:bg-orange-900 hover:shadow active:translate-y-px transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}

// Tag Management Modal
interface TagManagementModalProps {
  availableTags: string[]
  onClose: () => void
}

function TagManagementModal({ availableTags, onClose }: TagManagementModalProps) {
  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl ring-1 ring-black/5 w-[420px] max-h-[80vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 tracking-tight">Tags Overview</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Tag List */}
        <div className="flex-1 overflow-y-auto p-5">
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-3">
            All Tags ({availableTags.length})
          </label>
          {availableTags.length === 0 ? (
            <div className="text-center py-10">
              <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-700">No tags yet</p>
              <p className="text-xs text-gray-500 mt-1">Tags are created when you add them to tickets</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {availableTags.map(tag => (
                <div key={tag} className="flex items-center justify-between px-3 py-2.5 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
                  <span className="text-sm text-gray-900 flex items-center gap-2.5">
                    <span className="w-1.5 h-1.5 bg-orange-700 rounded-full"></span>
                    {tag}
                  </span>
                  <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
          <p className="text-xs font-semibold text-gray-700 mb-1.5">How to manage tags</p>
          <ul className="text-xs text-gray-500 space-y-1 leading-relaxed">
            <li>• Add tags when creating or editing tickets</li>
            <li>• Tags are automatically collected from all tickets</li>
            <li>• Use the tag filter on the home page to filter by tags</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

// Attachment Detail Modal
interface AttachmentDetailModalProps {
  attachment: Attachment
  onClose: () => void
  onDelete?: (token: string) => void
  loading?: boolean
}

function AttachmentDetailModal({ attachment, onClose, onDelete, loading }: AttachmentDetailModalProps) {
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleString()
  }

  const getFileIcon = (contentType: string) => {
    if (contentType.startsWith('image/')) return '🖼️'
    if (contentType.startsWith('video/')) return '🎥'
    if (contentType.startsWith('audio/')) return '🎵'
    if (contentType.includes('pdf')) return '📄'
    if (contentType.includes('word') || contentType.includes('document')) return '📝'
    if (contentType.includes('sheet') || contentType.includes('excel')) return '📊'
    if (contentType.includes('zip') || contentType.includes('archive')) return '📦'
    return '📎'
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl ring-1 ring-black/5 w-[500px] max-h-[80vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 tracking-tight">Attachment Details</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-8 h-8 border-[3px] border-orange-100 border-t-orange-700 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* File Preview Header */}
              <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl mb-5">
                <div className="w-14 h-14 bg-white ring-1 ring-gray-200/70 rounded-xl flex items-center justify-center text-3xl shadow-sm">
                  {getFileIcon(attachment.content_type)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate tracking-tight">{attachment.file_name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{attachment.id}]</span></h3>
                  <p className="text-sm text-gray-500">{formatFileSize(attachment.size)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{attachment.content_type}</p>
                </div>
              </div>

              {/* Details Grid */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">ID</label>
                    <p className="text-sm text-gray-900 mt-0.5">{attachment.id}</p>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Status</label>
                    <p className="text-sm mt-0.5">
                      {attachment.deleted ? (
                        <span className="inline-flex items-center gap-1.5 text-rose-600 font-medium"><span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>Deleted</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>Active</span>
                      )}
                    </p>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Content URL</label>
                  <a
                    href={attachment.content_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-orange-800 hover:text-orange-900 hover:underline break-all block mt-0.5"
                  >
                    {attachment.content_url}
                  </a>
                </div>

                {attachment.url && (
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">API URL</label>
                    <p className="text-sm text-gray-600 break-all mt-0.5">{attachment.url}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Created</label>
                    <p className="text-sm text-gray-900 mt-0.5">{formatDate(attachment.created_at)}</p>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Updated</label>
                    <p className="text-sm text-gray-900 mt-0.5">{formatDate(attachment.updated_at)}</p>
                  </div>
                </div>

                {(attachment.width || attachment.height) && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Dimensions</label>
                      <p className="text-sm text-gray-900 mt-0.5">
                        {attachment.width || '?'} × {attachment.height || '?'} px
                      </p>
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Inline</label>
                      <p className="text-sm text-gray-900 mt-0.5">{attachment.inline ? 'Yes' : 'No'}</p>
                    </div>
                  </div>
                )}

                {attachment.malware_scan_result && (
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Malware Scan</label>
                    <p className="text-sm text-gray-900 mt-0.5">{attachment.malware_scan_result}</p>
                  </div>
                )}

                {attachment.thumbnails && attachment.thumbnails.length > 0 && (
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Thumbnails</label>
                    <div className="flex gap-2 mt-1.5">
                      {attachment.thumbnails.map((thumb, idx) => (
                        <div key={idx} className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center text-xs text-gray-500">
                          {thumb.file_name?.split('.').pop() || 'thumb'}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Actions Footer */}
        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl flex justify-between items-center">
          <div>
            {attachment.upload_token && onDelete && (
              <button
                onClick={() => onDelete(attachment.upload_token!)}
                className="px-3 py-1.5 text-sm font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition"
              >
                Delete Attachment
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <a
              href={attachment.content_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-orange-800 text-white rounded-lg text-sm font-medium shadow-sm hover:bg-orange-900 hover:shadow active:translate-y-px transition-all"
            >
              Download
            </a>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Create Ticket Page (updated with organizations)
interface CreateTicketPageProps {
  currentUser: User | null
  users: User[]
  organizations: Organization[]
  availableTags: string[]
  onCancel: () => void
  onTicketCreated: () => void
  api: ReturnType<typeof useBackendAPI>
  onViewAttachment: (attachmentId: number) => void
}

function CreateTicketPage({ currentUser, users, organizations, availableTags, onCancel, onTicketCreated, api, onViewAttachment }: CreateTicketPageProps) {
  // Get the first valid user ID if currentUser doesn't exist
  const defaultUserId = currentUser?.id || (users.length > 0 ? users[0].id : 0)
  const [subject, setSubject] = useState('')
  const [applicantId, setApplicantId] = useState<number>(defaultUserId)
  const [assignedId, setAssignedId] = useState<number>(defaultUserId)
  const [messageBody, setMessageBody] = useState('')
  const [status, setStatus] = useState('new')
  const [priority, setPriority] = useState('normal')
  const [ticketType, setTicketType] = useState('question')
  const [dueDate, setDueDate] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [showTagDropdown, setShowTagDropdown] = useState(false)
  const [orgId, setOrgId] = useState<number>(0)
  const [loading, setLoading] = useState(false)
  const [createdMessages, setCreatedMessages] = useState<{ author: string; body: string; timestamp: string; attachments?: Attachment[] }[]>([])
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([])

  // If no users exist, show a message to create users first
  if (users.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50/40 p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center text-3xl mx-auto mb-4">👥</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2 tracking-tight">No users found</h2>
          <p className="text-sm text-gray-600 mb-6 leading-relaxed">
            Before creating tickets, you need at least one user.
            Users are required as requesters and assignees.
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={onCancel}
              className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
            >
              Go Back
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-5">
            Tip: Click the Users tab in the sidebar to create users.
          </p>
        </div>
      </div>
    )
  }

  // Filter available tags based on input and exclude already selected
  const filteredTags = availableTags.filter(tag =>
    !tags.includes(tag) &&
    tag.toLowerCase().includes(tagInput.toLowerCase())
  )

  const handleAddTag = (tag: string) => {
    if (tag.trim() && !tags.includes(tag.trim())) {
      setTags([...tags, tag.trim()])
    }
    setTagInput('')
    setShowTagDropdown(false)
  }

  const handleAttachmentUpload = async (filename: string) => {
    try {
      const result = await api.callTool<any>('create_attachment', {
        filename,
        file_size: 1024,
      })
      if (result?.upload?.attachment && result?.upload?.token) {
        const attachmentWithToken: Attachment = {
          ...result.upload.attachment,
          upload_token: result.upload.token
        }
        setPendingAttachments((prev: Attachment[]) => [...prev, attachmentWithToken])
      }
    } catch (err) {
      console.error('Upload failed:', err)
    }
  }

  const handleSendMessage = () => {
    if (!messageBody.trim() && pendingAttachments.length === 0) return
    setCreatedMessages([...createdMessages, {
      author: currentUser?.name || 'Agent',
      body: messageBody,
      timestamp: new Date().toISOString(),
      attachments: pendingAttachments.length > 0 ? [...pendingAttachments] : undefined
    }])
    setMessageBody('')
    setPendingAttachments([])
  }

  const handleCreateTicket = async () => {
    if (!subject.trim() || createdMessages.length === 0) {
      alert('Please enter a subject and at least one message')
      return
    }

    setLoading(true)
    try {
      const comment = createdMessages.map((m: { body: string }) => m.body).join('\n')

      // Collect all upload tokens from attachments in messages
      const uploadTokens: string[] = []
      createdMessages.forEach((msg) => {
        if (msg.attachments) {
          msg.attachments.forEach((att) => {
            if (att.upload_token) {
              uploadTokens.push(att.upload_token)
            }
          })
        }
      })

      const ticketData: any = {
        subject,
        requester_id: applicantId,
        assignee_id: assignedId,
        status: status === 'new' ? 'open' : status,
        priority,
        type: ticketType,
        tags,
        organization_id: orgId || undefined,
        comment: {
          body: comment,
          public: true,
          uploads: uploadTokens.length > 0 ? uploadTokens : undefined
        },
      }

      // Add due_at if dueDate is set
      if (dueDate) {
        ticketData.due_at = new Date(dueDate).toISOString()
      }

      await api.callTool('create_ticket', {
        ticket: ticketData,
      })
      onTicketCreated()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create ticket')
    } finally {
      setLoading(false)
    }
  }

  const usersList = Array.isArray(users) ? users : Object.values(users || {})

  const inputCls = "w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 hover:border-gray-300 focus:outline-none focus:bg-white focus:border-orange-700 focus:ring-2 focus:ring-orange-700/15 transition-all"
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="h-12 bg-white border-b border-gray-200/70 flex items-center px-5">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-orange-50 text-orange-800 text-[11px] font-semibold tracking-wide rounded-full ring-1 ring-orange-200/60">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-700"></span>
          NEW TICKET
        </span>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-80 bg-gray-50/70 border-r border-gray-200/70 p-4 overflow-y-auto">
          <div className="bg-white p-5 rounded-2xl border border-gray-200/70 shadow-sm space-y-4">
            <div>
              <label className="block text-[11px] font-medium text-gray-600 mb-1.5 px-1">Requester</label>
              <select value={applicantId} onChange={(e) => setApplicantId(Number(e.target.value))} className={inputCls}>
                {usersList.map((user: User) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-600 mb-1.5 px-1">Assignee</label>
              <select value={assignedId} onChange={(e) => setAssignedId(Number(e.target.value))} className={inputCls}>
                {usersList.map((user: User) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-600 mb-1.5 px-1">Organization</label>
              <select value={orgId} onChange={(e) => setOrgId(Number(e.target.value))} className={inputCls}>
                <option value={0}>None</option>
                {organizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-600 mb-1.5 px-1">Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputCls + " capitalize"}>
                {['low', 'normal', 'high', 'urgent'].map(p => <option key={p} value={p} className="capitalize">{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-600 mb-1.5 px-1">Type</label>
              <select value={ticketType} onChange={(e) => setTicketType(e.target.value)} className={inputCls + " capitalize"}>
                {['question', 'incident', 'problem', 'task'].map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-600 mb-1.5 px-1">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={inputCls}
                placeholder="Select due date"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-600 mb-1.5 px-1">Tags</label>
              <div className="flex flex-wrap gap-1 mb-2">
                {tags.map((tag, i) => <TagBadge key={i} tag={tag} onRemove={() => setTags(tags.filter((_, idx) => idx !== i))} />)}
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => { setTagInput(e.target.value); setShowTagDropdown(true); }}
                  onFocus={() => setShowTagDropdown(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && tagInput.trim()) {
                      handleAddTag(tagInput.trim())
                      e.preventDefault()
                    } else if (e.key === 'Escape') {
                      setShowTagDropdown(false)
                    }
                  }}
                  placeholder="Search or add a tag"
                  className={inputCls}
                />
                {showTagDropdown && (filteredTags.length > 0 || tagInput.trim()) && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1.5 bg-white border border-gray-200/80 rounded-xl shadow-xl ring-1 ring-black/5 max-h-56 overflow-y-auto py-1">
                    {filteredTags.map(tag => (
                      <button
                        key={tag}
                        onClick={() => handleAddTag(tag)}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm text-gray-700 flex items-center gap-2 transition"
                      >
                        <span className="text-gray-400">#</span>{tag}
                      </button>
                    ))}
                    {tagInput.trim() && !availableTags.includes(tagInput.trim()) && !tags.includes(tagInput.trim()) && (
                      <button
                        onClick={() => handleAddTag(tagInput.trim())}
                        className="w-full text-left px-3 py-2 hover:bg-orange-900 bg-orange-800 text-sm text-white border-t border-gray-100 flex items-center gap-2 transition"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Create "{tagInput.trim()}"
                      </button>
                    )}
                    {filteredTags.length === 0 && !tagInput.trim() && (
                      <div className="px-3 py-2 text-sm text-gray-500">No more tags available</div>
                    )}
                  </div>
                )}
              </div>
              {showTagDropdown && <div className="fixed inset-0 z-40" onClick={() => setShowTagDropdown(false)} />}
            </div>
          </div>
        </div>

        {/* Main */}
        <div className="flex-1 flex flex-col">
          <div className="px-5 py-4 border-b border-gray-200/70 bg-white">
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Ticket subject"
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-lg font-semibold text-gray-900 tracking-tight placeholder:text-gray-400 placeholder:font-normal hover:border-gray-300 focus:outline-none focus:bg-white focus:border-orange-700 focus:ring-2 focus:ring-orange-700/15 transition-all"
            />
          </div>

          <div className="flex-1 overflow-y-auto p-5 bg-gray-50/40">
            <div className="space-y-4 max-w-3xl mx-auto">
              {createdMessages.map((msg, idx) => (
                <div key={idx} className="flex gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-700 to-orange-900 flex items-center justify-center text-white font-semibold text-sm ring-2 ring-white shadow-sm">{msg.author.charAt(0)}</div>
                  <div className="flex-1">
                    <span className="font-medium text-gray-900 text-sm">{msg.author}</span>
                    <div className="mt-1.5 px-4 py-3 bg-white rounded-2xl rounded-tl-sm ring-1 ring-gray-200/70 shadow-sm">
                      {msg.body && <p className="text-sm text-gray-900 leading-relaxed whitespace-pre-wrap">{msg.body}</p>}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
                          {msg.attachments.map((att: Attachment) => (
                            <div key={att.id} className="flex items-center gap-2 text-sm text-gray-700">
                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                              </svg>
                              <span>{att.file_name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{att.id}]</span></span>
                              <span className="text-xs text-gray-400">({Math.round(att.size / 1024)} KB)</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="px-5 py-4 border-t border-gray-200/70 bg-white">
            <div className="max-w-3xl mx-auto">
            <textarea
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              placeholder="Describe the issue..."
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 leading-relaxed hover:border-gray-300 focus:outline-none focus:bg-white focus:border-orange-700 focus:ring-2 focus:ring-orange-700/15 resize-none transition-all"
              rows={3}
            />
            {/* Pending Attachments */}
            {pendingAttachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {pendingAttachments.map((att: Attachment) => (
                  <span key={att.id} className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-50 border border-gray-200 rounded-full text-xs">
                    <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                    {att.file_name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{att.id}]</span>
                    <button onClick={() => onViewAttachment(att.id)} className="text-gray-400 hover:text-sky-600 ml-1 transition" title="View Details">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </button>
                    <button onClick={() => setPendingAttachments(pendingAttachments.filter((a: Attachment) => a.id !== att.id))} className="text-gray-400 hover:text-rose-600 ml-1 transition" title="Remove">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex justify-between items-center mt-2.5">
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-100 hover:border-gray-300 transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                Attach file
                <input type="file" className="hidden" onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    handleAttachmentUpload(file.name)
                    e.target.value = ''
                  }
                }} />
              </label>
              <button onClick={handleSendMessage} className="px-3.5 py-1.5 bg-gray-100 text-gray-800 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-200 transition-all">Add Message</button>
            </div>
            </div>
          </div>

          <div className="h-14 bg-gray-50/70 border-t border-gray-200/70 flex items-center px-5 justify-between">
            <button onClick={onCancel} className="px-4 py-2 text-sm font-medium bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            <button onClick={handleCreateTicket} disabled={loading} className="px-4 py-2 text-sm font-medium bg-orange-800 text-white rounded-lg shadow-sm hover:bg-orange-900 hover:shadow active:translate-y-px transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none">
              {loading ? 'Creating...' : 'Create Ticket'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function formatDateShort(dateString: string) {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}
