import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { useBackendAPI } from '@shared/hooks/useBackendAPI'

const APP_NAME = "Salespower"

// Types
interface Task {
  Id: string
  Subject?: string
  Status?: string
  Priority?: string
  Description?: string
  ActivityDate?: string
  OwnerId?: string
  WhoId?: string
  WhatId?: string
  IsDeleted?: boolean
  CreatedDate?: string
  SystemModstamp?: string
  IsClosed?: boolean
  IsHighPriority?: boolean
}

interface Event {
  Id: string
  Subject?: string
  StartDateTime?: string
  EndDateTime?: string
  Description?: string
  Location?: string
  IsAllDayEvent?: boolean
  OwnerId?: string
  WhoId?: string
  WhatId?: string
  IsDeleted?: boolean
  CreatedDate?: string
  SystemModstamp?: string
  DurationInMinutes?: number
  Type?: string
  ShowAs?: string
}

interface DeletedRecord {
  id: string
  deletedDate?: string
  Subject?: string
}

interface Contact {
  Id: string
  LastName: string
  FirstName?: string | null
  Email?: string | null
  Phone?: string | null
  Title?: string | null
  AccountId?: string | null
  OwnerId?: string | null
  IsDeleted?: boolean
  CreatedDate?: string
  SystemModstamp?: string
}

interface Account {
  Id: string
  Name: string
  Type?: string | null
  Industry?: string | null
  AccountNumber?: string | null
  Phone?: string | null
  Website?: string | null
  OwnerId?: string | null
  ParentId?: string | null
  IsDeleted?: boolean
  CreatedDate?: string
  SystemModstamp?: string
}

interface Opportunity {
  Id: string
  // Required-on-create but may be null in records persisted by the agentic generator.
  Name?: string | null
  StageName?: string | null
  CloseDate?: string | null
  AccountId?: string | null
  OwnerId?: string | null
  Amount?: number | null
  Probability?: number | null
  Type?: string | null
  IsDeleted?: boolean
  CreatedDate?: string
  SystemModstamp?: string
}

interface Lead {
  Id: string
  // Required-on-create but may be null in records persisted by the agentic generator.
  LastName?: string | null
  Company?: string | null
  Status?: string | null
  Email?: string | null
  Phone?: string | null
  Notes?: string | null
  OwnerId?: string | null
  ConvertedAccountId?: string | null
  ConvertedOpportunityId?: string | null
  IsDeleted?: boolean
  CreatedDate?: string
  SystemModstamp?: string
}

type Tab = 'tasks' | 'events' | 'pipeline' | 'crm' | 'soql' | 'metadata' | 'data_ops'
type ToastType = 'success' | 'error' | 'info' | 'undo'

interface Toast {
  id: number
  message: string
  type: ToastType
  onUndo?: () => void
}

interface AppProps {
  onClose: () => void
  setRefreshHandler?: (handler: (() => void) | null) => void
}

// Toast Component with Undo support
function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 min-w-[300px] animate-slide-in ${
            toast.type === 'success' ? 'bg-green-600 text-white' :
            toast.type === 'error' ? 'bg-red-600 text-white' :
            toast.type === 'undo' ? 'bg-gray-800 text-white' :
            'bg-blue-600 text-white'
          }`}
        >
          <span className="text-lg">
            {toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : toast.type === 'undo' ? '🗑️' : 'ℹ'}
          </span>
          <span className="flex-1 text-sm">{toast.message}</span>
          {toast.onUndo && (
            <button
              onClick={() => { toast.onUndo?.(); onDismiss(toast.id); }}
              className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded text-sm font-medium transition-colors"
            >
              Undo
            </button>
          )}
          <button onClick={() => onDismiss(toast.id)} className="opacity-70 hover:opacity-100 ml-1">✕</button>
        </div>
      ))}
    </div>
  )
}

// Helper Components
function SectionCard({ title, children, actions, className }: { title: string; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={`bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl overflow-hidden ${className || ''}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)] bg-[var(--bg-tertiary)]">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
        <div className="flex gap-2">{actions}</div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function TextInput({ value, onChange, placeholder, className, type = 'text', disabled }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  type?: string;
  disabled?: boolean
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={`px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E]/50 focus:border-[#0F766E] disabled:opacity-50 ${className || ''}`}
    />
  )
}

function TextArea({ value, onChange, placeholder, className, rows = 3, disabled }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  rows?: number;
  disabled?: boolean
}) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      disabled={disabled}
      className={`px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)] text-[var(--text-primary)] text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#0F766E]/50 focus:border-[#0F766E] disabled:opacity-50 ${className || ''}`}
    />
  )
}

function Select({ value, onChange, options, placeholder, className, disabled }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
  disabled?: boolean
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className={`px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E]/50 focus:border-[#0F766E] disabled:opacity-50 ${className || ''}`}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  )
}

function Button({ onClick, children, variant = 'default', disabled, className, size = 'md' }: {
  onClick: () => void;
  children: ReactNode;
  variant?: 'default' | 'danger' | 'primary' | 'success' | 'ghost';
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md'
}) {
  const base = 'rounded-lg border transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]'
  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm'
  }
  const variants = {
    primary: 'bg-[#0F766E] text-white border-[#0F766E] hover:bg-[#115E59] shadow-sm',
    danger: 'bg-red-500 text-white border-red-500 hover:bg-red-600 shadow-sm',
    success: 'bg-green-500 text-white border-green-500 hover:bg-green-600 shadow-sm',
    ghost: 'bg-transparent text-[var(--text-secondary)] border-transparent hover:bg-[var(--bg-tertiary)]',
    default: 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] border-[var(--border-color)] hover:bg-[var(--border-color)]'
  }
  return (
    <button onClick={onClick} className={`${base} ${sizes[size]} ${variants[variant]} ${className || ''}`} disabled={disabled}>
      {children}
    </button>
  )
}

function Badge({ children, variant = 'default' }: { children: ReactNode; variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' }) {
  const styles = {
    default: 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]',
    success: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    danger: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[variant]}`}>
      {children}
    </span>
  )
}

function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const sizes = { sm: 'w-4 h-4 border-2', md: 'w-8 h-8 border-4' }
  return (
    <div className={`${sizes[size]} border-[#0F766E]/30 border-t-[#0F766E] rounded-full animate-spin`} />
  )
}

function LoadErrorBanner({ collection, message }: { collection: string; message: string }) {
  return (
    <div className="mb-3 px-3 py-2 rounded-lg border border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-800 text-xs text-red-800 dark:text-red-300">
      <div className="font-semibold mb-1">Failed to load {collection} from the backend.</div>
      <div className="font-mono break-all whitespace-pre-wrap">{message}</div>
      <div className="mt-1 text-red-700/80 dark:text-red-300/80">
        The underlying DB likely contains a record that fails the API's response schema (e.g. a required field is missing).
        Use the SOQL tab to inspect the raw records and locate the offending row, then fix it via update_* before reloading.
      </div>
    </div>
  )
}

function EmptyState({ icon, message, action }: { icon: string; message: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-[var(--text-secondary)]">
      <span className="text-4xl mb-3 opacity-50">{icon}</span>
      <p className="text-sm mb-4">{message}</p>
      {action}
    </div>
  )
}

function Modal({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-[var(--bg-secondary)] rounded-xl shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)]">
          <h3 className="font-semibold text-[var(--text-primary)]">{title}</h3>
          <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">✕</button>
        </div>
        <div className="p-4 overflow-y-auto max-h-[60vh]">{children}</div>
      </div>
    </div>
  )
}

// Main App Component
export default function SalespowerApp({ setRefreshHandler }: AppProps) {
  const api = useBackendAPI('salespower')
  const [activeTab, setActiveTab] = useState<Tab>('tasks')
  const [loading, setLoading] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastIdRef = useRef(0)

  // Data states
  const [tasks, setTasks] = useState<Task[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [leads, setLeads] = useState<Lead[]>([])

  // Per-collection load errors. A failing collection (e.g. query_leads when the
  // DB has a malformed record that breaks response validation) must not block
  // the other tabs; the affected tab surfaces the raw error inline so the user
  // can still investigate the rest of the dataset.
  const [loadErrors, setLoadErrors] = useState<Record<string, string | null>>({})

  const loadDataRef = useRef<() => void>(() => {})
  const setRefreshHandlerRef = useRef(setRefreshHandler)
  setRefreshHandlerRef.current = setRefreshHandler

  const showToast = useCallback((message: string, type: ToastType = 'info', onUndo?: () => void) => {
    const id = ++toastIdRef.current
    setToasts(prev => [...prev, { id, message, type, onUndo }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, type === 'undo' ? 8000 : 4000) // Longer timeout for undo toasts
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    // Run each query independently — one collection failing (e.g. backend
    // response validation rejecting a malformed record) must not erase the
    // other tabs. We track per-collection errors so each tab can render its
    // own inline error and the rest of the UI keeps working.
    const errors: Record<string, string | null> = {}
    const queries: Array<[string, () => Promise<unknown>, (rows: any[]) => void]> = [
      ['tasks', () => api.callTool<{ results?: Task[] }>('query_tasks', { criteria: {} }), rs => setTasks(rs as Task[])],
      ['events', () => api.callTool<{ results?: Event[] }>('query_events', { criteria: {} }), rs => setEvents(rs as Event[])],
      ['contacts', () => api.callTool<{ results?: Contact[] }>('query_contacts', { criteria: {} }), rs => setContacts(rs as Contact[])],
      ['accounts', () => api.callTool<{ results?: Account[] }>('query_accounts', { criteria: {} }), rs => setAccounts(rs as Account[])],
      ['opportunities', () => api.callTool<{ results?: Opportunity[] }>('query_opportunities', { criteria: {} }), rs => setOpportunities(rs as Opportunity[])],
      ['leads', () => api.callTool<{ results?: Lead[] }>('query_leads', { criteria: {} }), rs => setLeads(rs as Lead[])],
    ]
    const settled = await Promise.allSettled(queries.map(([, fn]) => fn()))
    settled.forEach((res, i) => {
      const [key, , apply] = queries[i]
      if (res.status === 'fulfilled') {
        const value = res.value as { results?: any[] } | undefined
        apply(value?.results || [])
        errors[key] = null
      } else {
        // Keep prior data for this collection (don't clobber a previously good load).
        const reason = res.reason
        errors[key] = reason instanceof Error ? reason.message : String(reason)
      }
    })
    setLoadErrors(errors)
    setLoading(false)
    // Surface a single summary toast if anything failed, so the user notices
    // without being spammed per-collection.
    const failedKeys = Object.entries(errors).filter(([, v]) => v).map(([k]) => k)
    if (failedKeys.length > 0) {
      showToast(`Failed to load: ${failedKeys.join(', ')}. See affected tabs for details.`, 'error')
    }
  }, [api.callTool, showToast])

  useEffect(() => {
    loadDataRef.current = loadData
  }, [loadData])

  const refreshApp = useCallback(() => {
    loadDataRef.current()
  }, [])

  useEffect(() => {
    setRefreshHandlerRef.current?.(refreshApp)
    return () => {
      setRefreshHandlerRef.current?.(null)
    }
  }, [refreshApp])

  useEffect(() => {
    loadData()
  }, [loadData])

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'tasks', label: 'Tasks', icon: '✓' },
    { id: 'events', label: 'Events', icon: '📅' },
    { id: 'pipeline', label: 'Pipeline', icon: '📊' },
    { id: 'crm', label: 'CRM', icon: '👥' },
    { id: 'soql', label: 'SOQL', icon: '🔍' },
    { id: 'metadata', label: 'Metadata', icon: '📋' },
    { id: 'data_ops', label: 'Data Ops', icon: '⚙️' }
  ]

  return (
    <div className="h-full flex flex-col bg-[var(--bg-primary)]">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Header */}
      <div className="px-5 py-3.5 bg-[#1E293B] border-b-2 border-[var(--border-color)]">
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {tabs.map(t => (
              <button
                key={t.id}
                className={`px-4 py-2 text-sm rounded-md transition-all font-medium ${
                  activeTab === t.id
                    ? 'bg-white/20 text-white'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}
                onClick={() => setActiveTab(t.id)}
              >
                <span className="mr-1.5">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
          <Button onClick={loadData} disabled={loading} variant="ghost" className="!text-white/80 hover:!text-white hover:!bg-white/10">
            {loading ? <LoadingSpinner size="sm" /> : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'tasks' && <TasksTab tasks={tasks} api={api} onChanged={loadData} showToast={showToast} />}
        {activeTab === 'events' && <EventsTab events={events} api={api} onChanged={loadData} showToast={showToast} />}
        {activeTab === 'pipeline' && <PipelineTab opportunities={opportunities} accounts={accounts} api={api} onChanged={loadData} showToast={showToast} loadErrors={loadErrors} />}
        {activeTab === 'crm' && <CRMTab contacts={contacts} accounts={accounts} leads={leads} api={api} onChanged={loadData} showToast={showToast} loadErrors={loadErrors} />}
        {activeTab === 'soql' && <SOQLTab api={api} showToast={showToast} />}
        {activeTab === 'metadata' && <MetadataTab api={api} showToast={showToast} />}
        {activeTab === 'data_ops' && <DataOpsTab api={api} onChanged={loadData} showToast={showToast} />}
      </div>

      <style>{`
        @keyframes slide-in {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .animate-slide-in { animation: slide-in 0.3s ease-out; }
      `}</style>
    </div>
  )
}

// Tasks Tab Component
function TasksTab({ tasks, api, onChanged, showToast }: {
  tasks: Task[];
  api: ReturnType<typeof useBackendAPI>;
  onChanged: () => void;
  showToast: (msg: string, type: ToastType, onUndo?: () => void) => void
}) {
  const [showModal, setShowModal] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<Task[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [detailTask, setDetailTask] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Form state
  const [formSubject, setFormSubject] = useState('')
  const [formStatus, setFormStatus] = useState('Not Started')
  const [formPriority, setFormPriority] = useState('Normal')
  const [formDescription, setFormDescription] = useState('')
  const [formActivityDate, setFormActivityDate] = useState('')

  const viewTaskDetails = async (task: Task) => {
    setDetailLoading(true)
    try {
      const res = await api.callTool<any>('retrieve_task_details', { task_id: task.Id })
      setDetailTask(res)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load task details', 'error')
    } finally {
      setDetailLoading(false)
    }
  }

  const statusOptions = [
    { value: 'Not Started', label: 'Not Started' },
    { value: 'In Progress', label: 'In Progress' },
    { value: 'Completed', label: 'Completed' },
    { value: 'Waiting', label: 'Waiting' },
    { value: 'Deferred', label: 'Deferred' }
  ]

  const priorityOptions = [
    { value: 'High', label: 'High' },
    { value: 'Normal', label: 'Normal' },
    { value: 'Low', label: 'Low' }
  ]

  const resetForm = () => {
    setFormSubject('')
    setFormStatus('Not Started')
    setFormPriority('Normal')
    setFormDescription('')
    setFormActivityDate('')
    setEditingTask(null)
    setShowModal(false)
  }

  const openCreateModal = () => {
    resetForm()
    setShowModal(true)
  }

  const openEditModal = (task: Task) => {
    setFormSubject(task.Subject || '')
    setFormStatus(task.Status || 'Not Started')
    setFormPriority(task.Priority || 'Normal')
    setFormDescription(task.Description || '')
    setFormActivityDate(task.ActivityDate || '')
    setEditingTask(task)
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!formSubject.trim()) {
      showToast('Subject is required', 'error')
      return
    }
    setSaving(true)
    try {
      if (editingTask) {
        // Update - only send changed fields
        const updateData: Record<string, any> = { task_id: editingTask.Id }
        if (formSubject !== editingTask.Subject) updateData.Subject = formSubject
        if (formStatus !== editingTask.Status) updateData.Status = formStatus
        if (formPriority !== editingTask.Priority) updateData.Priority = formPriority
        if (formDescription !== (editingTask.Description || '')) updateData.Description = formDescription
        if (formActivityDate !== (editingTask.ActivityDate || '')) updateData.ActivityDate = formActivityDate || undefined

        await api.callTool('update_task', updateData)
        showToast('Task updated successfully', 'success')
      } else {
        // Create
        const createData: Record<string, any> = {
          Subject: formSubject,
          Status: formStatus,
          Priority: formPriority
        }
        if (formDescription) createData.Description = formDescription
        if (formActivityDate) createData.ActivityDate = formActivityDate

        await api.callTool('create_task', createData)
        showToast('Task created successfully', 'success')
      }
      resetForm()
      await onChanged()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to save task', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (task: Task) => {
    try {
      await api.callTool('delete_task', { task_id: task.Id })
      await onChanged()

      // Show undo toast
      showToast(`Task "${task.Subject || 'Untitled'}" deleted`, 'undo', async () => {
        try {
          await api.callTool('undelete_task', { task_id: task.Id })
          showToast('Task restored', 'success')
          await onChanged()
        } catch (e) {
          showToast('Failed to restore task', 'error')
        }
      })
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to delete task', 'error')
    }
  }

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      setSearchResults(null)
      return
    }
    try {
      const res = await api.callTool<{ results?: Task[] }>('search_tasks', { search_term: searchTerm })
      setSearchResults(res?.results || [])
      showToast(`Found ${res?.results?.length || 0} tasks`, 'info')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Search failed', 'error')
    }
  }

  const clearSearch = () => {
    setSearchTerm('')
    setSearchResults(null)
  }

  const displayTasks = searchResults !== null ? searchResults : tasks

  const getStatusVariant = (status?: string): 'default' | 'success' | 'warning' | 'danger' | 'info' => {
    switch (status) {
      case 'Completed': return 'success'
      case 'In Progress': return 'info'
      case 'Deferred': return 'warning'
      default: return 'default'
    }
  }

  const getPriorityVariant = (priority?: string): 'default' | 'success' | 'warning' | 'danger' | 'info' => {
    switch (priority) {
      case 'High': return 'danger'
      case 'Low': return 'info'
      default: return 'default'
    }
  }

  return (
    <div className="space-y-4">
      {/* Search & Actions */}
      <div className="flex gap-3 items-center">
        <div className="flex-1 flex gap-2">
          <TextInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search tasks..."
            className="flex-1"
          />
          <Button onClick={handleSearch} variant="default">Search</Button>
          {searchResults !== null && (
            <Button onClick={clearSearch} variant="ghost">Clear</Button>
          )}
        </div>
        <Button onClick={openCreateModal} variant="primary">+ New Task</Button>
      </div>

      {searchResults !== null && (
        <div className="text-sm text-[var(--text-secondary)]">
          Showing {searchResults.length} search result(s)
        </div>
      )}

      {/* Task List */}
      <SectionCard title={`Tasks (${displayTasks.length})`}>
        {displayTasks.length === 0 ? (
          <EmptyState
            icon="✓"
            message="No tasks found"
            action={<Button onClick={openCreateModal} variant="primary" size="sm">Create your first task</Button>}
          />
        ) : (
          <div className="space-y-2">
            {displayTasks.map(task => (
              <div
                key={task.Id}
                className="p-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] hover:border-[#0F766E]/50 transition-colors group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-medium text-[var(--text-primary)]">
                        {task.Subject || '(No Subject)'}
                      </span>
                      <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{task.Id}]</span>
                      <Badge variant={getStatusVariant(task.Status)}>{task.Status}</Badge>
                      <Badge variant={getPriorityVariant(task.Priority)}>{task.Priority}</Badge>
                    </div>
                    {task.Description && (
                      <p className="text-sm text-[var(--text-secondary)] line-clamp-2 mb-2">{task.Description}</p>
                    )}
                    <div className="flex gap-4 text-xs text-[var(--text-tertiary)] flex-wrap">
                      {task.ActivityDate && <span>Activity Date: {task.ActivityDate}</span>}
                      {task.WhoId && <span>Contact: {task.WhoId}</span>}
                      {task.WhatId && <span>Account: {task.WhatId}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button onClick={() => viewTaskDetails(task)} variant="default" size="sm">View</Button>
                    <Button onClick={() => openEditModal(task)} variant="default" size="sm">Edit</Button>
                    <Button onClick={() => handleDelete(task)} variant="danger" size="sm">Delete</Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Task Detail Modal */}
      <Modal isOpen={detailTask !== null || detailLoading} onClose={() => setDetailTask(null)} title="Task Details">
        {detailLoading ? (
          <div className="flex justify-center py-8"><LoadingSpinner /></div>
        ) : detailTask ? (
          <div className="space-y-3">
            {[
              { label: 'ID', value: detailTask.Id },
              { label: 'Subject', value: detailTask.Subject },
              { label: 'Status', value: detailTask.Status },
              { label: 'Priority', value: detailTask.Priority },
              { label: 'Description', value: detailTask.Description },
              { label: 'Activity Date', value: detailTask.ActivityDate },
              { label: 'Owner ID', value: detailTask.OwnerId },
              { label: 'Who ID', value: detailTask.WhoId },
              { label: 'What ID', value: detailTask.WhatId },
              { label: 'Is Closed', value: String(detailTask.Status === 'Completed' || detailTask.Status === 'Closed') },
              { label: 'Is High Priority', value: String(detailTask.Priority === 'High') },
              { label: 'Is Deleted', value: detailTask.IsDeleted != null ? String(detailTask.IsDeleted) : null },
              { label: 'Created Date', value: detailTask.CreatedDate },
              { label: 'System Modstamp', value: detailTask.SystemModstamp },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-start gap-3 py-2 border-b border-[var(--border-color)] last:border-0">
                <span className="text-xs font-medium text-[var(--text-tertiary)] w-36 shrink-0">{label}</span>
                <span className="text-sm text-[var(--text-primary)] break-all">{value || '-'}</span>
              </div>
            ))}
            <div className="flex justify-end pt-2">
              <Button onClick={() => setDetailTask(null)} variant="default">Close</Button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Create/Edit Modal */}
      <Modal isOpen={showModal} onClose={resetForm} title={editingTask ? 'Edit Task' : 'Create Task'}>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">Subject *</label>
            <TextInput value={formSubject} onChange={setFormSubject} placeholder="Enter task subject" className="w-full" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">Status *</label>
              <Select value={formStatus} onChange={setFormStatus} options={statusOptions} className="w-full" />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">Priority *</label>
              <Select value={formPriority} onChange={setFormPriority} options={priorityOptions} className="w-full" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">Activity Date</label>
            <TextInput type="date" value={formActivityDate} onChange={setFormActivityDate} className="w-full" />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">Description</label>
            <TextArea value={formDescription} onChange={setFormDescription} placeholder="Enter description" className="w-full" rows={4} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button onClick={resetForm} variant="default">Cancel</Button>
            <Button onClick={handleSave} variant="primary" disabled={saving || !formSubject.trim()}>
              {saving ? <LoadingSpinner size="sm" /> : (editingTask ? 'Update Task' : 'Create Task')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// Events Tab Component
function EventsTab({ events, api, onChanged, showToast }: {
  events: Event[];
  api: ReturnType<typeof useBackendAPI>;
  onChanged: () => void;
  showToast: (msg: string, type: ToastType, onUndo?: () => void) => void
}) {
  const [showModal, setShowModal] = useState(false)
  const [editingEvent, setEditingEvent] = useState<Event | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<Event[] | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
  const [saving, setSaving] = useState(false)
  const [detailEvent, setDetailEvent] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Form state
  const [formSubject, setFormSubject] = useState('')
  const [formStartDateTime, setFormStartDateTime] = useState('')
  const [formEndDateTime, setFormEndDateTime] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formLocation, setFormLocation] = useState('')
  const [formIsAllDay, setFormIsAllDay] = useState(false)

  const viewEventDetails = async (event: Event) => {
    setDetailLoading(true)
    try {
      const res = await api.callTool<any>('retrieve_event_details', { event_id: event.Id })
      setDetailEvent(res)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load event details', 'error')
    } finally {
      setDetailLoading(false)
    }
  }

  const resetForm = () => {
    setFormSubject('')
    setFormStartDateTime('')
    setFormEndDateTime('')
    setFormDescription('')
    setFormLocation('')
    setFormIsAllDay(false)
    setEditingEvent(null)
    setShowModal(false)
  }

  const openCreateModal = () => {
    resetForm()
    setShowModal(true)
  }

  const openEditModal = (event: Event) => {
    setFormSubject(event.Subject || '')
    setFormStartDateTime(event.StartDateTime ? event.StartDateTime.substring(0, 16) : '')
    setFormEndDateTime(event.EndDateTime ? event.EndDateTime.substring(0, 16) : '')
    setFormDescription(event.Description || '')
    setFormLocation(event.Location || '')
    setFormIsAllDay(event.IsAllDayEvent || false)
    setEditingEvent(event)
    setShowModal(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const data: Record<string, any> = {}
      if (formSubject) data.Subject = formSubject
      if (formStartDateTime) data.StartDateTime = new Date(formStartDateTime).toISOString()
      if (formEndDateTime) data.EndDateTime = new Date(formEndDateTime).toISOString()
      if (formDescription) data.Description = formDescription
      if (formLocation) data.Location = formLocation
      data.IsAllDayEvent = formIsAllDay

      if (editingEvent) {
        await api.callTool('update_event', { event_id: editingEvent.Id, ...data })
        showToast('Event updated successfully', 'success')
      } else {
        await api.callTool('create_event', data)
        showToast('Event created successfully', 'success')
      }
      resetForm()
      await onChanged()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to save event', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (event: Event) => {
    try {
      await api.callTool('delete_event', { event_id: event.Id })
      await onChanged()

      // Show undo toast
      showToast(`Event "${event.Subject || 'Untitled'}" deleted`, 'undo', async () => {
        try {
          await api.callTool('undelete_event', { event_id: event.Id })
          showToast('Event restored', 'success')
          await onChanged()
        } catch (e) {
          showToast('Failed to restore event', 'error')
        }
      })
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to delete event', 'error')
    }
  }

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      setSearchResults(null)
      return
    }
    try {
      const res = await api.callTool<{ results?: Event[] }>('search_events', { search_term: searchTerm })
      setSearchResults(res?.results || [])
      showToast(`Found ${res?.results?.length || 0} events`, 'info')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Search failed', 'error')
    }
  }

  const clearSearch = () => {
    setSearchTerm('')
    setSearchResults(null)
  }

  const displayEvents = searchResults !== null ? searchResults : events

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '-'
    try {
      return new Date(dateStr).toLocaleString()
    } catch {
      return dateStr
    }
  }

  // Group events by date for calendar view
  const groupedByDate = displayEvents.reduce((acc, event) => {
    const date = event.StartDateTime ? event.StartDateTime.split('T')[0] : 'No Date'
    if (!acc[date]) acc[date] = []
    acc[date].push(event)
    return acc
  }, {} as Record<string, Event[]>)

  return (
    <div className="space-y-4">
      {/* Search & Actions */}
      <div className="flex gap-3 items-center">
        <div className="flex-1 flex gap-2">
          <TextInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search events..."
            className="flex-1"
          />
          <Button onClick={handleSearch} variant="default">Search</Button>
          {searchResults !== null && (
            <Button onClick={clearSearch} variant="ghost">Clear</Button>
          )}
        </div>
        <div className="flex gap-1 bg-[var(--bg-tertiary)] p-1 rounded-lg">
          <button
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${viewMode === 'list' ? 'bg-[var(--bg-primary)] shadow-sm' : ''}`}
            onClick={() => setViewMode('list')}
          >
            List
          </button>
          <button
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${viewMode === 'calendar' ? 'bg-[var(--bg-primary)] shadow-sm' : ''}`}
            onClick={() => setViewMode('calendar')}
          >
            Calendar
          </button>
        </div>
        <Button onClick={openCreateModal} variant="primary">+ New Event</Button>
      </div>

      {searchResults !== null && (
        <div className="text-sm text-[var(--text-secondary)]">
          Showing {searchResults.length} search result(s)
        </div>
      )}

      {/* Event List/Calendar */}
      {viewMode === 'list' ? (
        <SectionCard title={`Events (${displayEvents.length})`}>
          {displayEvents.length === 0 ? (
            <EmptyState
              icon="📅"
              message="No events found"
              action={<Button onClick={openCreateModal} variant="primary" size="sm">Create your first event</Button>}
            />
          ) : (
            <div className="space-y-2">
              {displayEvents.map(event => (
                <div
                  key={event.Id}
                  className="p-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] hover:border-[#0F766E]/50 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-medium text-[var(--text-primary)]">
                          {event.Subject || '(No Subject)'}
                        </span>
                        <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{event.Id}]</span>
                        {event.IsAllDayEvent && <Badge variant="info">All Day</Badge>}
                        {event.Type && <Badge>{event.Type}</Badge>}
                      </div>
                      <div className="text-sm text-[var(--text-secondary)] mb-1">
                        {formatDateTime(event.StartDateTime)} - {formatDateTime(event.EndDateTime)}
                      </div>
                      {event.Location && (
                        <p className="text-sm text-[var(--text-tertiary)]">📍 {event.Location}</p>
                      )}
                      {event.Description && (
                        <p className="text-sm text-[var(--text-secondary)] line-clamp-2 mt-1">{event.Description}</p>
                      )}
                      <div className="flex gap-4 text-xs text-[var(--text-tertiary)] flex-wrap mt-1">
                        {event.WhoId && <span>Contact: {event.WhoId}</span>}
                        {event.WhatId && <span>Account: {event.WhatId}</span>}
                      </div>
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button onClick={() => viewEventDetails(event)} variant="default" size="sm">View</Button>
                      <Button onClick={() => openEditModal(event)} variant="default" size="sm">Edit</Button>
                      <Button onClick={() => handleDelete(event)} variant="danger" size="sm">Delete</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      ) : (
        <SectionCard title="Calendar View">
          {Object.keys(groupedByDate).length === 0 ? (
            <EmptyState icon="📅" message="No events found" />
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedByDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, dateEvents]) => (
                <div key={date}>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3 pb-2 border-b border-[var(--border-color)]">
                    {date === 'No Date' ? date : new Date(date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </h3>
                  <div className="space-y-2 pl-4 border-l-2 border-[#0F766E]">
                    {dateEvents.map(event => (
                      <div
                        key={event.Id}
                        className="p-3 rounded-lg bg-[var(--bg-tertiary)] cursor-pointer hover:bg-[var(--border-color)] transition-colors"
                        onClick={() => openEditModal(event)}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{event.Subject || '(No Subject)'}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{event.Id}]</span></span>
                          <span className="text-xs text-[var(--text-tertiary)]">
                            {event.StartDateTime ? new Date(event.StartDateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                        </div>
                        {event.Location && (
                          <span className="text-xs text-[var(--text-tertiary)]">📍 {event.Location}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {/* Event Detail Modal */}
      <Modal isOpen={detailEvent !== null || detailLoading} onClose={() => setDetailEvent(null)} title="Event Details">
        {detailLoading ? (
          <div className="flex justify-center py-8"><LoadingSpinner /></div>
        ) : detailEvent ? (
          <div className="space-y-3">
            {[
              { label: 'ID', value: detailEvent.Id },
              { label: 'Subject', value: detailEvent.Subject },
              { label: 'Start Date/Time', value: detailEvent.StartDateTime },
              { label: 'End Date/Time', value: detailEvent.EndDateTime },
              { label: 'Description', value: detailEvent.Description },
              { label: 'Location', value: detailEvent.Location },
              { label: 'Is All Day Event', value: detailEvent.IsAllDayEvent != null ? String(detailEvent.IsAllDayEvent) : null },
              { label: 'Type', value: detailEvent.Type },
              { label: 'Show As', value: detailEvent.ShowAs },
              { label: 'Duration (Minutes)', value: detailEvent.DurationInMinutes != null ? String(detailEvent.DurationInMinutes) : null },
              { label: 'Owner ID', value: detailEvent.OwnerId },
              { label: 'Who ID', value: detailEvent.WhoId },
              { label: 'What ID', value: detailEvent.WhatId },
              { label: 'Is Deleted', value: detailEvent.IsDeleted != null ? String(detailEvent.IsDeleted) : null },
              { label: 'Created Date', value: detailEvent.CreatedDate },
              { label: 'System Modstamp', value: detailEvent.SystemModstamp },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-start gap-3 py-2 border-b border-[var(--border-color)] last:border-0">
                <span className="text-xs font-medium text-[var(--text-tertiary)] w-36 shrink-0">{label}</span>
                <span className="text-sm text-[var(--text-primary)] break-all">{value || '-'}</span>
              </div>
            ))}
            <div className="flex justify-end pt-2">
              <Button onClick={() => setDetailEvent(null)} variant="default">Close</Button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Create/Edit Modal */}
      <Modal isOpen={showModal} onClose={resetForm} title={editingEvent ? 'Edit Event' : 'Create Event'}>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">Subject</label>
            <TextInput value={formSubject} onChange={setFormSubject} placeholder="Enter event subject" className="w-full" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">Start Date/Time</label>
              <TextInput type="datetime-local" value={formStartDateTime} onChange={setFormStartDateTime} className="w-full" />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">End Date/Time</label>
              <TextInput type="datetime-local" value={formEndDateTime} onChange={setFormEndDateTime} className="w-full" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">Location</label>
            <TextInput value={formLocation} onChange={setFormLocation} placeholder="Enter location" className="w-full" />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="allDay"
              checked={formIsAllDay}
              onChange={e => setFormIsAllDay(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="allDay" className="text-sm text-[var(--text-primary)] cursor-pointer">All Day Event</label>
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">Description</label>
            <TextArea value={formDescription} onChange={setFormDescription} placeholder="Enter description" className="w-full" rows={4} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button onClick={resetForm} variant="default">Cancel</Button>
            <Button onClick={handleSave} variant="primary" disabled={saving}>
              {saving ? <LoadingSpinner size="sm" /> : (editingEvent ? 'Update Event' : 'Create Event')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// Canonical Salespower Opportunity stages (rendered in this order). Stages
// found on actual records but missing from this list are appended in encounter
// order so custom stages still show a column.
const CANONICAL_OPPORTUNITY_STAGES = [
  'Prospecting',
  'Qualification',
  'Needs Analysis',
  'Value Proposition',
  'Id. Decision Makers',
  'Perception Analysis',
  'Proposal/Price Quote',
  'Negotiation/Review',
  'Closed Won',
  'Closed Lost',
]

function stageBorderColor(stage: string): string {
  if (stage === 'Closed Won') return 'border-t-green-500'
  if (stage === 'Closed Lost') return 'border-t-red-500'
  if (stage === 'Negotiation/Review' || stage === 'Proposal/Price Quote') return 'border-t-yellow-500'
  if (stage === 'Prospecting' || stage === 'Qualification') return 'border-t-gray-400'
  return 'border-t-blue-500'
}

function formatAmount(amount: number | null | undefined): string | null {
  if (amount === null || amount === undefined) return null
  try {
    return amount.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
  } catch {
    return `$${amount}`
  }
}

// Pipeline Tab Component — renders real Opportunity records grouped by StageName.
function PipelineTab({ opportunities, accounts, api, onChanged, showToast, loadErrors }: {
  opportunities: Opportunity[];
  accounts: Account[];
  api: ReturnType<typeof useBackendAPI>;
  onChanged: () => void;
  showToast: (msg: string, type: ToastType, onUndo?: () => void) => void;
  loadErrors: Record<string, string | null>;
}) {
  const [updating, setUpdating] = useState<string | null>(null)

  const accountNameById = new Map<string, string>()
  accounts.forEach(a => { if (a.Id) accountNameById.set(a.Id, a.Name) })

  // Dynamic stage list: canonical stages first, then any extra stages present in data.
  const stagesInData: string[] = []
  const seenStages = new Set<string>(CANONICAL_OPPORTUNITY_STAGES)
  opportunities.forEach(o => {
    const s = o.StageName || 'Unspecified'
    if (!seenStages.has(s)) {
      seenStages.add(s)
      stagesInData.push(s)
    }
  })
  const stages = [...CANONICAL_OPPORTUNITY_STAGES, ...stagesInData]

  const opportunitiesByStage = stages.reduce((acc, stage) => {
    acc[stage] = opportunities.filter(o => (o.StageName || 'Unspecified') === stage)
    return acc
  }, {} as Record<string, Opportunity[]>)

  const handleStageChange = async (opp: Opportunity, newStage: string) => {
    if (opp.StageName === newStage) return
    setUpdating(opp.Id)
    try {
      await api.callTool('update_opportunity', { opportunity_id: opp.Id, StageName: newStage })
      showToast(`Stage updated to "${newStage}"`, 'success')
      await onChanged()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to update stage', 'error')
    } finally {
      setUpdating(null)
    }
  }

  const opportunitiesError = loadErrors.opportunities
  const accountsError = loadErrors.accounts

  return (
    <div className="space-y-4">
      <SectionCard title={`Opportunity Pipeline (${opportunities.length})`}>
        {opportunitiesError && <LoadErrorBanner collection="opportunities" message={opportunitiesError} />}
        {accountsError && <LoadErrorBanner collection="accounts" message={accountsError} />}
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          Pipeline view of Opportunity records grouped by stage. Change an opportunity's stage with the dropdown on each card; changes are persisted via update_opportunity.
        </p>
        {opportunities.length === 0 && !opportunitiesError ? (
          <EmptyState icon="📊" message="No opportunities found. Create one via the API (create_opportunity) to see it here." />
        ) : (
          <div className="grid grid-cols-5 gap-3">
            {stages.map(stage => (
              <div key={stage} className={`rounded-lg border border-[var(--border-color)] border-t-4 ${stageBorderColor(stage)} bg-[var(--bg-primary)]`}>
                <div className="px-3 py-2 border-b border-[var(--border-color)] bg-[var(--bg-tertiary)]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[var(--text-primary)]">{stage}</span>
                    <Badge>{opportunitiesByStage[stage].length}</Badge>
                  </div>
                </div>
                <div className="p-2 space-y-2 min-h-[100px] max-h-[400px] overflow-y-auto">
                  {opportunitiesByStage[stage].map(opp => {
                    const accountName = opp.AccountId ? (accountNameById.get(opp.AccountId) || opp.AccountId) : null
                    const amount = formatAmount(opp.Amount)
                    return (
                      <div key={opp.Id} className="p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)] hover:border-[#0F766E]/50 transition-colors">
                        <div className="text-sm font-medium text-[var(--text-primary)] mb-1 truncate">{opp.Name || '(No Name)'}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{opp.Id}]</span></div>
                        <div className="flex gap-2 text-xs text-[var(--text-tertiary)] mb-2 flex-wrap">
                          {amount && <Badge variant="info">{amount}</Badge>}
                          {typeof opp.Probability === 'number' && <Badge>{opp.Probability}%</Badge>}
                          {opp.CloseDate && <span>Close: {opp.CloseDate}</span>}
                          {accountName && <span>Acct: {accountName}</span>}
                        </div>
                        <Select
                          value={opp.StageName || 'Unspecified'}
                          onChange={(v) => handleStageChange(opp, v)}
                          options={stages.map(s => ({ value: s, label: s }))}
                          className="w-full !text-xs !py-1"
                          disabled={updating === opp.Id}
                        />
                      </div>
                    )
                  })}
                  {opportunitiesByStage[stage].length === 0 && (
                    <div className="text-xs text-[var(--text-tertiary)] text-center py-4">No items</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

// CRM Tab Component — renders real Contact and Lead records.
function CRMTab({ contacts, accounts, leads, api, onChanged, showToast, loadErrors }: {
  contacts: Contact[];
  accounts: Account[];
  leads: Lead[];
  api: ReturnType<typeof useBackendAPI>;
  onChanged: () => void;
  showToast: (msg: string, type: ToastType, onUndo?: () => void) => void;
  loadErrors: Record<string, string | null>;
}) {
  const [crmView, setCrmView] = useState<'contacts' | 'leads' | 'activities'>('contacts')
  const [converting, setConverting] = useState<string | null>(null)
  const [loggingSaving, setLoggingSaving] = useState(false)

  // Activity logging form
  const [logType, setLogType] = useState<'task' | 'event'>('task')
  const [logSubject, setLogSubject] = useState('')
  const [logDescription, setLogDescription] = useState('')
  const [logStatus, setLogStatus] = useState('Completed')
  const [logPriority, setLogPriority] = useState('Normal')

  const accountNameById = new Map<string, string>()
  accounts.forEach(a => { if (a.Id) accountNameById.set(a.Id, a.Name) })

  const contactDisplayName = (c: Contact): string => {
    const parts = [c.FirstName, c.LastName].filter(p => p && p.length > 0)
    return parts.length > 0 ? parts.join(' ') : '(No Name)'
  }

  const leadDisplayName = (l: Lead): string => l.LastName || '(No Name)'

  const isLeadConverted = (l: Lead): boolean => (l.Status || '').startsWith('Closed -') || Boolean(l.ConvertedAccountId) || Boolean(l.ConvertedOpportunityId)

  const handleConvertLead = async (lead: Lead) => {
    setConverting(lead.Id)
    try {
      await api.callTool('update_lead', { lead_id: lead.Id, Status: 'Closed - Converted' })
      showToast(`Lead "${leadDisplayName(lead)}" converted successfully`, 'success')
      await onChanged()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to convert lead', 'error')
    } finally {
      setConverting(null)
    }
  }

  const handleLogActivity = async () => {
    if (!logSubject.trim()) {
      showToast('Subject is required', 'error')
      return
    }
    setLoggingSaving(true)
    try {
      if (logType === 'task') {
        const params: Record<string, any> = {
          Subject: logSubject,
          Status: logStatus,
          Priority: logPriority
        }
        if (logDescription) params.Description = logDescription
        await api.callTool('create_task', params)
        showToast('Activity logged as task', 'success')
      } else {
        const params: Record<string, any> = {
          Subject: logSubject,
          StartDateTime: new Date().toISOString(),
          EndDateTime: new Date(Date.now() + 3600000).toISOString()
        }
        if (logDescription) params.Description = logDescription
        await api.callTool('create_event', params)
        showToast('Activity logged as event', 'success')
      }
      setLogSubject('')
      setLogDescription('')
      setLogStatus('Completed')
      setLogPriority('Normal')
      await onChanged()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to log activity', 'error')
    } finally {
      setLoggingSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* CRM Sub-navigation */}
      <div className="flex gap-1 bg-[var(--bg-tertiary)] p-1 rounded-lg w-fit">
        {[
          { id: 'contacts' as const, label: 'Contacts' },
          { id: 'leads' as const, label: 'Leads' },
          { id: 'activities' as const, label: 'Log Activity' }
        ].map(v => (
          <button
            key={v.id}
            className={`px-4 py-2 text-sm rounded-md transition-colors font-medium ${
              crmView === v.id ? 'bg-[var(--bg-primary)] shadow-sm text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            onClick={() => setCrmView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Contacts View */}
      {crmView === 'contacts' && (
        <SectionCard title={`Contacts (${contacts.length})`}>
          {loadErrors.contacts && <LoadErrorBanner collection="contacts" message={loadErrors.contacts} />}
          {loadErrors.accounts && <LoadErrorBanner collection="accounts" message={loadErrors.accounts} />}
          {contacts.length === 0 && !loadErrors.contacts ? (
            <EmptyState icon="👥" message='No contacts found. Create one via the API ("create_contact") to see it here.' />
          ) : (
            <div className="space-y-3">
              {contacts.map(contact => {
                const accountName = contact.AccountId ? (accountNameById.get(contact.AccountId) || contact.AccountId) : null
                return (
                  <div key={contact.Id} className="p-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)]">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span className="text-sm font-medium text-[var(--text-primary)]">{contactDisplayName(contact)}</span>
                          <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{contact.Id}]</span>
                          {contact.Title && <Badge>{contact.Title}</Badge>}
                        </div>
                        {accountName && (
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs text-[var(--text-tertiary)]">Account:</span>
                            <Badge variant="info">{accountName}</Badge>
                          </div>
                        )}
                        <div className="flex gap-4 text-xs text-[var(--text-tertiary)] flex-wrap">
                          {contact.Email && <span>{contact.Email}</span>}
                          {contact.Phone && <span>{contact.Phone}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </SectionCard>
      )}

      {/* Leads View */}
      {crmView === 'leads' && (
        <SectionCard title={`Leads (${leads.length})`}>
          {loadErrors.leads && <LoadErrorBanner collection="leads" message={loadErrors.leads} />}
          {leads.length === 0 && !loadErrors.leads ? (
            <EmptyState icon="🎯" message='No leads found. Create one via the API ("create_lead") to see it here.' />
          ) : (
            <div className="space-y-2">
              {leads.map(lead => {
                const converted = isLeadConverted(lead)
                return (
                  <div key={lead.Id} className="p-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] hover:border-[#0F766E]/50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-medium text-[var(--text-primary)]">{leadDisplayName(lead)}</span>
                          {lead.Company && <span className="text-sm text-[var(--text-secondary)]">· {lead.Company}</span>}
                          <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{lead.Id}]</span>
                          <Badge variant={converted ? 'success' : 'warning'}>{lead.Status}</Badge>
                        </div>
                        {lead.Notes && (
                          <p className="text-sm text-[var(--text-secondary)] line-clamp-2 mb-2">{lead.Notes}</p>
                        )}
                        <div className="flex gap-4 text-xs text-[var(--text-tertiary)] flex-wrap">
                          {lead.Email && <span>{lead.Email}</span>}
                          {lead.Phone && <span>{lead.Phone}</span>}
                          {lead.ConvertedAccountId && <span>Converted Account: {lead.ConvertedAccountId}</span>}
                          {lead.ConvertedOpportunityId && <span>Converted Opp: {lead.ConvertedOpportunityId}</span>}
                        </div>
                      </div>
                      {!converted && (
                        <Button
                          onClick={() => handleConvertLead(lead)}
                          variant="success"
                          size="sm"
                          disabled={converting === lead.Id}
                        >
                          {converting === lead.Id ? <LoadingSpinner size="sm" /> : 'Convert'}
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </SectionCard>
      )}

      {/* Activity Logging */}
      {crmView === 'activities' && (
        <SectionCard title="Log Activity">
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">
              Log a new activity. This creates a task or event record in the backend.
            </p>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={logType === 'task'} onChange={() => setLogType('task')} className="accent-[#0F766E]" />
                <span className="text-sm">Task</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={logType === 'event'} onChange={() => setLogType('event')} className="accent-[#0F766E]" />
                <span className="text-sm">Event</span>
              </label>
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">Subject *</label>
              <TextInput value={logSubject} onChange={setLogSubject} placeholder="Enter activity subject" className="w-full" />
            </div>
            {logType === 'task' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">Status</label>
                  <Select value={logStatus} onChange={setLogStatus} options={[
                    { value: 'Completed', label: 'Completed' },
                    { value: 'In Progress', label: 'In Progress' },
                    { value: 'Not Started', label: 'Not Started' }
                  ]} className="w-full" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">Priority</label>
                  <Select value={logPriority} onChange={setLogPriority} options={[
                    { value: 'High', label: 'High' },
                    { value: 'Normal', label: 'Normal' },
                    { value: 'Low', label: 'Low' }
                  ]} className="w-full" />
                </div>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">Description</label>
              <TextArea value={logDescription} onChange={setLogDescription} placeholder="Describe the activity..." className="w-full" rows={3} />
            </div>
            <Button onClick={handleLogActivity} variant="primary" disabled={loggingSaving || !logSubject.trim()}>
              {loggingSaving ? <LoadingSpinner size="sm" /> : 'Log Activity'}
            </Button>
          </div>
        </SectionCard>
      )}
    </div>
  )
}

// SOQL Tab Component
function SOQLTab({ api, showToast }: { api: ReturnType<typeof useBackendAPI>; showToast: (msg: string, type: ToastType) => void }) {
  const [query, setQuery] = useState('SELECT Id, Subject, Status, Priority FROM Task LIMIT 10')
  const [results, setResults] = useState<any[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [conditionsInput, setConditionsInput] = useState('')
  const [parsedConditions, setParsedConditions] = useState<any[] | null>(null)
  const [parsingLoading, setParsingLoading] = useState(false)

  const sampleQueries = [
    { label: 'All Tasks (10)', query: 'SELECT Id, Subject, Status, Priority FROM Task LIMIT 10' },
    { label: 'Completed Tasks', query: "SELECT Id, Subject FROM Task WHERE Status = 'Completed'" },
    { label: 'High Priority Tasks', query: "SELECT Id, Subject, Status FROM Task WHERE Priority = 'High'" },
    { label: 'All Events (10)', query: 'SELECT Id, Subject, StartDateTime, Location FROM Event LIMIT 10' },
    { label: 'All Day Events', query: 'SELECT Id, Subject, StartDateTime FROM Event WHERE IsAllDayEvent = true' },
  ]

  const executeQuery = async () => {
    if (!query.trim()) return
    setLoading(true)
    try {
      const res = await api.callTool<{ results?: any[]; error?: string }>('execute_soql_query', { q: query })
      if (res?.error) {
        showToast(res.error, 'error')
        setResults(null)
      } else {
        setResults(res?.results || [])
        showToast(`Query returned ${res?.results?.length || 0} records`, 'success')
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Query execution failed', 'error')
      setResults(null)
    } finally {
      setLoading(false)
    }
  }

  const parseConditions = async () => {
    const lines = conditionsInput.split('\n').map(l => l.trim()).filter(l => l.length > 0)
    if (lines.length === 0) {
      showToast('Please enter at least one condition', 'error')
      return
    }
    setParsingLoading(true)
    try {
      const res = await api.callTool<any>('parse_where_clause_conditions', { conditions: lines })
      setParsedConditions(Array.isArray(res) ? res : res?.results || res?.conditions || res?.parsed || [res])
      showToast(`Parsed ${lines.length} condition(s)`, 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to parse conditions', 'error')
      setParsedConditions(null)
    } finally {
      setParsingLoading(false)
    }
  }

  const getColumnHeaders = () => {
    if (!results || results.length === 0) return []
    return Object.keys(results[0])
  }

  return (
    <div className="space-y-4">
      <SectionCard title="SOQL Query Editor">
        <div className="space-y-4">
          <TextArea
            value={query}
            onChange={setQuery}
            placeholder="Enter SOQL query..."
            className="w-full font-mono"
            rows={4}
          />
          <div className="flex flex-wrap gap-2">
            {sampleQueries.map((sq, idx) => (
              <button
                key={idx}
                onClick={() => setQuery(sq.query)}
                className="px-3 py-1.5 text-xs bg-[var(--bg-tertiary)] hover:bg-[var(--border-color)] rounded-lg border border-[var(--border-color)] text-[var(--text-secondary)] transition-colors"
              >
                {sq.label}
              </button>
            ))}
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-[var(--text-tertiary)]">
              Supports: SELECT, FROM, WHERE, ORDER BY, LIMIT, OFFSET
            </span>
            <Button onClick={executeQuery} variant="primary" disabled={loading || !query.trim()}>
              {loading ? <LoadingSpinner size="sm" /> : 'Execute Query'}
            </Button>
          </div>
        </div>
      </SectionCard>

      {results !== null && (
        <SectionCard title={`Results (${results.length} records)`}>
          {results.length === 0 ? (
            <EmptyState icon="🔍" message="No records found" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-color)]">
                    {getColumnHeaders().map(header => (
                      <th key={header} className="px-4 py-3 text-left font-medium text-[var(--text-primary)] bg-[var(--bg-tertiary)]">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map((row, idx) => (
                    <tr key={idx} className="border-b border-[var(--border-color)] hover:bg-[var(--bg-tertiary)]">
                      {getColumnHeaders().map(header => (
                        <td key={header} className="px-4 py-3 text-[var(--text-secondary)]">
                          {typeof row[header] === 'boolean'
                            ? (row[header] ? 'true' : 'false')
                            : row[header] !== null && row[header] !== undefined
                              ? String(row[header])
                              : '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      <SectionCard title="WHERE Clause Parser">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">
              Enter conditions (one per line)
            </label>
            <TextArea
              value={conditionsInput}
              onChange={setConditionsInput}
              placeholder={"Subject = 'Meeting'\nPriority IN ('High', 'Normal')\nStatus != 'Completed'"}
              className="w-full font-mono"
              rows={4}
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={parseConditions} variant="primary" disabled={parsingLoading || !conditionsInput.trim()}>
              {parsingLoading ? <LoadingSpinner size="sm" /> : 'Parse Conditions'}
            </Button>
          </div>
        </div>
      </SectionCard>

      {parsedConditions !== null && (
        <SectionCard title={`Parsed Conditions (${parsedConditions.length})`}>
          {parsedConditions.length === 0 ? (
            <EmptyState icon="🔍" message="No conditions parsed" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-color)]">
                    {Object.keys(parsedConditions[0]).map(header => (
                      <th key={header} className="px-4 py-3 text-left font-medium text-[var(--text-primary)] bg-[var(--bg-tertiary)]">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsedConditions.map((row: any, idx: number) => (
                    <tr key={idx} className="border-b border-[var(--border-color)] hover:bg-[var(--bg-tertiary)]">
                      {Object.keys(parsedConditions[0]).map(header => (
                        <td key={header} className="px-4 py-3 text-[var(--text-secondary)]">
                          {typeof row[header] === 'object' && row[header] !== null
                            ? JSON.stringify(row[header])
                            : typeof row[header] === 'boolean'
                              ? (row[header] ? 'true' : 'false')
                              : row[header] !== null && row[header] !== undefined
                                ? String(row[header])
                                : '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}
    </div>
  )
}

// Metadata Tab Component
function MetadataTab({ api, showToast }: { api: ReturnType<typeof useBackendAPI>; showToast: (msg: string, type: ToastType) => void }) {
  const [activeType, setActiveType] = useState<'task_object' | 'event_object' | 'task_layout' | 'event_layout'>('task_object')
  const [metadata, setMetadata] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [eventIdForLayout, setEventIdForLayout] = useState('')
  const [taskLayoutId, setTaskLayoutId] = useState('')
  const [availableEvents, setAvailableEvents] = useState<Event[]>([])
  const [loadingEvents, setLoadingEvents] = useState(false)

  // Load available events when event_layout is selected
  const loadAvailableEvents = async () => {
    setLoadingEvents(true)
    try {
      const res = await api.callTool<{ results?: Event[] }>('query_events', { criteria: {} })
      setAvailableEvents(res?.results || [])
      if (res?.results && res.results.length > 0 && !eventIdForLayout) {
        setEventIdForLayout(res.results[0].Id)
      }
    } catch (e) {
      // Silently fail - user can still input an ID manually
    } finally {
      setLoadingEvents(false)
    }
  }

  const loadMetadata = async () => {
    if (activeType === 'event_layout' && !eventIdForLayout.trim()) {
      showToast('Please select or enter an Event ID', 'error')
      return
    }
    if (activeType === 'task_layout' && !taskLayoutId.trim()) {
      showToast('Please enter a Task Layout ID', 'error')
      return
    }

    setLoading(true)
    try {
      let res: any
      switch (activeType) {
        case 'task_object':
          res = await api.callTool('describe_task_object', {})
          break
        case 'event_object':
          res = await api.callTool('describe_event_object', {})
          break
        case 'task_layout':
          res = await api.callTool('describe_task_layout', { layout_id: taskLayoutId.trim() })
          break
        case 'event_layout':
          // Event layout requires an existing event ID
          res = await api.callTool('describe_event_layout', { event_id: eventIdForLayout })
          break
      }
      setMetadata(res)
      showToast('Metadata loaded successfully', 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load metadata', 'error')
      setMetadata(null)
    } finally {
      setLoading(false)
    }
  }

  const metadataTypes = [
    { id: 'task_object' as const, label: 'Task Object', description: 'View Task SObject schema and fields' },
    { id: 'event_object' as const, label: 'Event Object', description: 'View Event SObject schema and fields' },
    { id: 'task_layout' as const, label: 'Task Layout', description: 'View Task page layout configuration' },
    { id: 'event_layout' as const, label: 'Event Layout', description: 'View Event page layout (requires existing event)' }
  ]

  const currentType = metadataTypes.find(t => t.id === activeType)

  return (
    <div className="space-y-4">
      <SectionCard title="Object Metadata">
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Explore {APP_NAME} object metadata including field definitions, relationships, and layout configurations.
          </p>

          <div className="grid grid-cols-2 gap-3">
            {metadataTypes.map(t => (
              <button
                key={t.id}
                onClick={() => {
                  setActiveType(t.id)
                  setMetadata(null)
                  if (t.id === 'event_layout') {
                    loadAvailableEvents()
                  }
                }}
                className={`p-4 rounded-xl border text-left transition-all ${
                  activeType === t.id
                    ? 'bg-[#0F766E]/10 border-[#0F766E] ring-2 ring-[#0F766E]/20'
                    : 'bg-[var(--bg-tertiary)] border-[var(--border-color)] hover:border-[#0F766E]/50'
                }`}
              >
                <div className="font-medium text-sm text-[var(--text-primary)]">{t.label}</div>
                <div className="text-xs text-[var(--text-tertiary)] mt-1">{t.description}</div>
              </button>
            ))}
          </div>

          {/* Layout ID input for task layout */}
          {activeType === 'task_layout' && (
            <div className="p-4 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)] space-y-3">
              <p className="text-sm text-[var(--text-secondary)]">
                Task Layout requires a valid Layout ID from your {APP_NAME} org.
              </p>
              <div>
                <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">Layout ID</label>
                <TextInput
                  value={taskLayoutId}
                  onChange={setTaskLayoutId}
                  placeholder="e.g., 00h000000000001AAA"
                  className="w-full"
                />
              </div>
            </div>
          )}

          {/* Event ID selector for event layout */}
          {activeType === 'event_layout' && (
            <div className="p-4 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)] space-y-3">
              <p className="text-sm text-[var(--text-secondary)]">
                Event Layout requires an existing event ID. Select from your events or enter an ID manually.
              </p>
              {loadingEvents ? (
                <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
                  <LoadingSpinner size="sm" />
                  Loading events...
                </div>
              ) : availableEvents.length > 0 ? (
                <div>
                  <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">Select Event</label>
                  <Select
                    value={eventIdForLayout}
                    onChange={setEventIdForLayout}
                    options={availableEvents.map(e => ({
                      value: e.Id,
                      label: `${e.Subject || '(No Subject)'} - ${e.Id}`
                    }))}
                    placeholder="Select an event..."
                    className="w-full"
                  />
                </div>
              ) : (
                <div className="text-sm text-yellow-600 dark:text-yellow-400 flex items-center gap-2">
                  <span>⚠️</span>
                  No events found. Create an event first in the Events tab, or enter an ID manually below.
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">Or Enter Event ID Manually</label>
                <TextInput
                  value={eventIdForLayout}
                  onChange={setEventIdForLayout}
                  placeholder="e.g., 00U000000000001AAA"
                  className="w-full"
                />
              </div>
            </div>
          )}

          <div className="pt-2">
            <Button
              onClick={loadMetadata}
              variant="primary"
              disabled={loading || (activeType === 'event_layout' && !eventIdForLayout.trim()) || (activeType === 'task_layout' && !taskLayoutId.trim())}
            >
              {loading ? <LoadingSpinner size="sm" /> : `Load ${currentType?.label}`}
            </Button>
          </div>
        </div>
      </SectionCard>

      {metadata && (
        <SectionCard title={`${currentType?.label} Metadata`}>
          <div className="bg-[var(--bg-primary)] p-4 rounded-lg overflow-auto max-h-[500px] border border-[var(--border-color)]">
            <pre className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap font-mono">
              {JSON.stringify(metadata, null, 2)}
            </pre>
          </div>
        </SectionCard>
      )}
    </div>
  )
}

// Data Operations Tab Component
function DataOpsTab({ api, onChanged, showToast }: {
  api: ReturnType<typeof useBackendAPI>;
  onChanged: () => void;
  showToast: (msg: string, type: ToastType) => void
}) {
  const [deletedTasks, setDeletedTasks] = useState<DeletedRecord[]>([])
  const [deletedEvents, setDeletedEvents] = useState<DeletedRecord[]>([])
  const [updatedTaskIds, setUpdatedTaskIds] = useState<string[]>([])
  const [updatedEventIds, setUpdatedEventIds] = useState<string[]>([])
  const [loading, setLoading] = useState<string | null>(null)

  // Upsert form
  const [upsertType, setUpsertType] = useState<'task' | 'event'>('task')
  const [upsertId, setUpsertId] = useState('')
  const [upsertSubject, setUpsertSubject] = useState('')
  const [upsertStatus, setUpsertStatus] = useState('Not Started')
  const [upsertPriority, setUpsertPriority] = useState('Normal')
  // Task-specific fields
  const [upsertActivityDate, setUpsertActivityDate] = useState('')
  const [upsertDescription, setUpsertDescription] = useState('')
  // Event-specific fields
  const [upsertStartDateTime, setUpsertStartDateTime] = useState('')
  const [upsertEndDateTime, setUpsertEndDateTime] = useState('')
  const [upsertLocation, setUpsertLocation] = useState('')
  const [upsertIsAllDay, setUpsertIsAllDay] = useState(false)

  const loadDeletedTasks = async () => {
    setLoading('deleted_tasks')
    try {
      const res = await api.callTool<{ deletedRecords?: DeletedRecord[] }>('get_deleted_tasks', { sObjectType: 'Task' })
      setDeletedTasks(res?.deletedRecords || [])
      showToast(`Found ${res?.deletedRecords?.length || 0} deleted tasks`, 'info')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load deleted tasks', 'error')
    } finally {
      setLoading(null)
    }
  }

  const loadDeletedEvents = async () => {
    setLoading('deleted_events')
    try {
      const res = await api.callTool<{ deletedRecords?: DeletedRecord[] }>('get_deleted_events', { sObjectType: 'Event' })
      setDeletedEvents(res?.deletedRecords || [])
      showToast(`Found ${res?.deletedRecords?.length || 0} deleted events`, 'info')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load deleted events', 'error')
    } finally {
      setLoading(null)
    }
  }

  const loadUpdatedTasks = async () => {
    setLoading('updated_tasks')
    try {
      const res = await api.callTool<{ ids?: string[] }>('get_updated_tasks', {})
      setUpdatedTaskIds(res?.ids || [])
      showToast(`Found ${res?.ids?.length || 0} updated tasks`, 'info')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load updated tasks', 'error')
    } finally {
      setLoading(null)
    }
  }

  const loadUpdatedEvents = async () => {
    setLoading('updated_events')
    try {
      const now = new Date()
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const res = await api.callTool<{ updated?: any[] }>('get_updated_events', {
        start_date_time: weekAgo.toISOString(),
        end_date_time: now.toISOString()
      })
      const ids = res?.updated?.map((e: any) => e.Id) || []
      setUpdatedEventIds(ids)
      showToast(`Found ${ids.length} updated events`, 'info')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load updated events', 'error')
    } finally {
      setLoading(null)
    }
  }

  const handleUndeleteTask = async (taskId: string) => {
    try {
      await api.callTool('undelete_task', { task_id: taskId })
      showToast('Task restored successfully', 'success')
      await loadDeletedTasks()
      await onChanged()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to restore task', 'error')
    }
  }

  const handleUndeleteEvent = async (eventId: string) => {
    try {
      await api.callTool('undelete_event', { event_id: eventId })
      showToast('Event restored successfully', 'success')
      await loadDeletedEvents()
      await onChanged()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to restore event', 'error')
    }
  }

  const handleUpsert = async () => {
    if (!upsertSubject.trim()) {
      showToast('Subject is required', 'error')
      return
    }
    setLoading('upsert')
    try {
      if (upsertType === 'task') {
        const params: Record<string, any> = {
          Subject: upsertSubject,
          Status: upsertStatus,
          Priority: upsertPriority
        }
        if (upsertId.trim()) params.Id = upsertId
        if (upsertActivityDate) params.ActivityDate = upsertActivityDate
        if (upsertDescription.trim()) params.Description = upsertDescription
        const res = await api.callTool<{ id?: string; created?: boolean }>('upsert_task', params)
        showToast(res?.created ? `Task created (ID: ${res?.id})` : `Task updated (ID: ${res?.id})`, 'success')
      } else {
        const params: Record<string, any> = {
          Subject: upsertSubject
        }
        if (upsertId.trim()) params.Id = upsertId
        if (upsertStartDateTime) params.StartDateTime = new Date(upsertStartDateTime).toISOString()
        if (upsertEndDateTime) params.EndDateTime = new Date(upsertEndDateTime).toISOString()
        if (upsertLocation) params.Location = upsertLocation
        params.IsAllDayEvent = upsertIsAllDay

        const res = await api.callTool<{ id?: string; created?: boolean }>('upsert_event', params)
        showToast(res?.created ? `Event created (ID: ${res?.id})` : `Event updated (ID: ${res?.id})`, 'success')
      }
      // Reset form
      setUpsertId('')
      setUpsertSubject('')
      setUpsertStatus('Not Started')
      setUpsertPriority('Normal')
      setUpsertActivityDate('')
      setUpsertDescription('')
      setUpsertStartDateTime('')
      setUpsertEndDateTime('')
      setUpsertLocation('')
      setUpsertIsAllDay(false)
      await onChanged()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Upsert failed', 'error')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Deleted Records */}
      <SectionCard title="Deleted Records">
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            View and restore recently deleted tasks and events.
          </p>
          <div className="flex gap-2">
            <Button onClick={loadDeletedTasks} disabled={loading === 'deleted_tasks'}>
              {loading === 'deleted_tasks' ? <LoadingSpinner size="sm" /> : 'Load Deleted Tasks'}
            </Button>
            <Button onClick={loadDeletedEvents} disabled={loading === 'deleted_events'}>
              {loading === 'deleted_events' ? <LoadingSpinner size="sm" /> : 'Load Deleted Events'}
            </Button>
          </div>

          {deletedTasks.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-[var(--text-primary)] mb-2">Deleted Tasks ({deletedTasks.length})</h4>
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {deletedTasks.map((task, idx) => (
                  <div key={task.id || idx} className="p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)] flex justify-between items-center">
                    <div>
                      <span className="text-sm font-medium">{task.id}</span>
                      {task.deletedDate && <span className="text-xs text-[var(--text-tertiary)] ml-2">Deleted: {new Date(task.deletedDate).toLocaleString()}</span>}
                    </div>
                    <Button onClick={() => handleUndeleteTask(task.id)} variant="success" size="sm">Restore</Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {deletedEvents.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-[var(--text-primary)] mb-2">Deleted Events ({deletedEvents.length})</h4>
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {deletedEvents.map((event, idx) => (
                  <div key={event.id || idx} className="p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)] flex justify-between items-center">
                    <div>
                      <span className="text-sm font-medium">{event.id}</span>
                      {event.deletedDate && <span className="text-xs text-[var(--text-tertiary)] ml-2">Deleted: {new Date(event.deletedDate).toLocaleString()}</span>}
                    </div>
                    <Button onClick={() => handleUndeleteEvent(event.id)} variant="success" size="sm">Restore</Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {deletedTasks.length === 0 && deletedEvents.length === 0 && (
            <p className="text-sm text-[var(--text-tertiary)]">Click a button above to load deleted records.</p>
          )}
        </div>
      </SectionCard>

      {/* Updated Records */}
      <SectionCard title="Updated Records">
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            View records that have been recently modified.
          </p>
          <div className="flex gap-2">
            <Button onClick={loadUpdatedTasks} disabled={loading === 'updated_tasks'}>
              {loading === 'updated_tasks' ? <LoadingSpinner size="sm" /> : 'Load Updated Tasks'}
            </Button>
            <Button onClick={loadUpdatedEvents} disabled={loading === 'updated_events'}>
              {loading === 'updated_events' ? <LoadingSpinner size="sm" /> : 'Load Updated Events'}
            </Button>
          </div>

          {updatedTaskIds.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-[var(--text-primary)] mb-2">Updated Task IDs ({updatedTaskIds.length})</h4>
              <div className="flex flex-wrap gap-2">
                {updatedTaskIds.map((id, idx) => (
                  <Badge key={idx} variant="info">{id}</Badge>
                ))}
              </div>
            </div>
          )}

          {updatedEventIds.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-[var(--text-primary)] mb-2">Updated Event IDs ({updatedEventIds.length})</h4>
              <div className="flex flex-wrap gap-2">
                {updatedEventIds.map((id, idx) => (
                  <Badge key={idx} variant="info">{id}</Badge>
                ))}
              </div>
            </div>
          )}

          {updatedTaskIds.length === 0 && updatedEventIds.length === 0 && (
            <p className="text-sm text-[var(--text-tertiary)]">Click a button above to load updated records.</p>
          )}
        </div>
      </SectionCard>

      {/* Upsert Operation */}
      <SectionCard title="Upsert Operation">
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Create a new record or update an existing one. Leave ID empty to create new.
          </p>

          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={upsertType === 'task'}
                onChange={() => setUpsertType('task')}
                className="accent-[#0F766E]"
              />
              <span className="text-sm">Task</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={upsertType === 'event'}
                onChange={() => setUpsertType('event')}
                className="accent-[#0F766E]"
              />
              <span className="text-sm">Event</span>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">ID (optional)</label>
              <TextInput value={upsertId} onChange={setUpsertId} placeholder="Leave empty to create new" className="w-full" />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">Subject *</label>
              <TextInput value={upsertSubject} onChange={setUpsertSubject} placeholder="Enter subject" className="w-full" />
            </div>
          </div>

          {upsertType === 'task' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">Status</label>
                  <Select
                    value={upsertStatus}
                    onChange={setUpsertStatus}
                    options={[
                      { value: 'Not Started', label: 'Not Started' },
                      { value: 'In Progress', label: 'In Progress' },
                      { value: 'Completed', label: 'Completed' },
                      { value: 'Waiting', label: 'Waiting' },
                      { value: 'Deferred', label: 'Deferred' }
                    ]}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">Priority</label>
                  <Select
                    value={upsertPriority}
                    onChange={setUpsertPriority}
                    options={[
                      { value: 'High', label: 'High' },
                      { value: 'Normal', label: 'Normal' },
                      { value: 'Low', label: 'Low' }
                    ]}
                    className="w-full"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">Activity Date</label>
                <TextInput type="date" value={upsertActivityDate} onChange={setUpsertActivityDate} className="w-full" />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">Description</label>
                <TextArea value={upsertDescription} onChange={setUpsertDescription} placeholder="Enter task description..." className="w-full" rows={3} />
              </div>
            </>
          )}

          {upsertType === 'event' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">Start Date/Time</label>
                  <TextInput type="datetime-local" value={upsertStartDateTime} onChange={setUpsertStartDateTime} className="w-full" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">End Date/Time</label>
                  <TextInput type="datetime-local" value={upsertEndDateTime} onChange={setUpsertEndDateTime} className="w-full" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">Location</label>
                  <TextInput value={upsertLocation} onChange={setUpsertLocation} placeholder="Enter location" className="w-full" />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={upsertIsAllDay}
                      onChange={e => setUpsertIsAllDay(e.target.checked)}
                      className="rounded accent-[#0F766E]"
                    />
                    <span className="text-sm">All Day Event</span>
                  </label>
                </div>
              </div>
            </>
          )}

          <Button onClick={handleUpsert} variant="primary" disabled={loading === 'upsert' || !upsertSubject.trim()}>
            {loading === 'upsert' ? <LoadingSpinner size="sm" /> : 'Upsert'}
          </Button>
        </div>
      </SectionCard>
    </div>
  )
}
