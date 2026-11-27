import { useState, useEffect, useRef, useCallback } from 'react'
import { useBackendAPI } from '@shared/hooks/useBackendAPI'

const APP_NAME = "GithutActions"

// ==================== Types ====================

type Tab = 'workflows' | 'runs' | 'secrets'

interface Secret {
  name: string
  created_at: string
  updated_at: string
}

interface Workflow {
  id: number
  node_id: string
  name: string
  path: string
  state: string
  created_at: string
  updated_at: string
}

interface WorkflowUsage {
  billable: {
    UBUNTU?: { total_ms: number; jobs: number }
    MACOS?: { total_ms: number; jobs: number }
    WINDOWS?: { total_ms: number; jobs: number }
  }
}

interface GithutActor {
  login: string
  id: number
  type: string
}

interface HeadCommit {
  id: string
  message: string
  timestamp: string
  author: { name: string; email: string }
}

interface WorkflowRun {
  id: number
  name: string | null
  node_id: string
  head_branch: string | null
  head_sha: string
  path: string
  run_number: number
  event: string
  status: string | null
  conclusion: string | null
  workflow_id: number
  created_at: string
  updated_at: string
  run_attempt: number
  run_started_at: string | null
  actor: GithutActor
  triggering_actor: GithutActor
  head_commit: HeadCommit
}

interface Step {
  name: string
  status: string
  conclusion: string | null
  number: number
  started_at: string | null
  completed_at: string | null
}

interface Job {
  id: number
  run_id: number
  name: string
  status: string
  conclusion: string | null
  started_at: string
  completed_at: string | null
  steps: Step[]
}

interface OpenWindowConfig {
  id: string
  title: string
  content: React.ReactNode
  width?: number
  height?: number
}

interface AppProps {
  onClose: () => void
  setRefreshHandler?: (handler: (() => void) | null) => void
  openWindow?: (config: OpenWindowConfig) => void
}

// ==================== Constants ====================

const workflowStateColors: Record<string, { bg: string; text: string }> = {
  active: { bg: 'bg-green-500/20', text: 'text-green-400' },
  disabled_fork: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  disabled_inactivity: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  disabled_manually: { bg: 'bg-red-500/20', text: 'text-red-400' },
  deleted: { bg: 'bg-gray-500/20', text: 'text-gray-400' },
}

const runStatusColors: Record<string, { bg: string; text: string; icon: string }> = {
  queued: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', icon: '○' },
  in_progress: { bg: 'bg-blue-500/20', text: 'text-blue-400', icon: '●' },
  waiting: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', icon: '◐' },
  pending: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', icon: '○' },
  requested: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', icon: '○' },
  // Conclusions
  success: { bg: 'bg-green-500/20', text: 'text-green-400', icon: '✓' },
  failure: { bg: 'bg-red-500/20', text: 'text-red-400', icon: '✗' },
  cancelled: { bg: 'bg-gray-500/20', text: 'text-gray-400', icon: '⊘' },
  skipped: { bg: 'bg-gray-500/20', text: 'text-gray-400', icon: '⊘' },
  timed_out: { bg: 'bg-orange-500/20', text: 'text-orange-400', icon: '⏱' },
  action_required: { bg: 'bg-orange-500/20', text: 'text-orange-400', icon: '!' },
  neutral: { bg: 'bg-gray-500/20', text: 'text-gray-400', icon: '◉' },
  stale: { bg: 'bg-gray-500/20', text: 'text-gray-400', icon: '◌' },
}

const statusFilterOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'queued', label: 'Queued' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'action_required', label: 'Action Required' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'success', label: 'Success' },
  { value: 'failure', label: 'Failure' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'timed_out', label: 'Timed Out' },
  { value: 'neutral', label: 'Neutral' },
]

// ==================== Helper Functions ====================

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

function calculateDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return '-'
  const start = new Date(startedAt)
  const end = completedAt ? new Date(completedAt) : new Date()
  const diffMs = end.getTime() - start.getTime()
  return formatDuration(diffMs)
}

function getEffectiveStatus(run: WorkflowRun): string {
  if (run.status === 'completed' && run.conclusion) {
    return run.conclusion
  }
  return run.status || 'unknown'
}

function getRunStatusStyle(status: string) {
  return runStatusColors[status] || { bg: 'bg-gray-500/20', text: 'text-gray-400', icon: '?' }
}

function canCancel(run: WorkflowRun): boolean {
  const cancellableStatuses = ['queued', 'in_progress', 'waiting', 'action_required', 'requested', 'pending']
  return cancellableStatuses.includes(run.status || '')
}

function canRerun(run: WorkflowRun): boolean {
  const nonRerunnable = ['queued', 'in_progress', 'waiting', 'action_required', 'pending', 'requested']
  return !nonRerunnable.includes(run.status || '')
}

// ==================== Main Component ====================

export default function GithutActionsApp({ setRefreshHandler }: AppProps) {
  // Tab state
  const [activeTab, setActiveTab] = useState<Tab>('workflows')

  // Common state
  const [owner, setOwner] = useState('')
  const [repo, setRepo] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Workflows tab state
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null)
  const [workflowUsage, setWorkflowUsage] = useState<WorkflowUsage | null>(null)
  const [totalWorkflowCount, setTotalWorkflowCount] = useState(0)
  const [usageLoading, setUsageLoading] = useState(false)

  // Runs tab state
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRun[]>([])
  const [selectedRun, setSelectedRun] = useState<WorkflowRun | null>(null)
  const [runJobs, setRunJobs] = useState<Job[]>([])
  const [totalRunsCount, setTotalRunsCount] = useState(0)
  const [runsLoading, setRunsLoading] = useState(false)
  const [jobsLoading, setJobsLoading] = useState(false)
  const [expandedJobs, setExpandedJobs] = useState<Set<number>>(new Set())

  // Filters
  const [filterWorkflowId, setFilterWorkflowId] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterBranch, setFilterBranch] = useState<string>('')

  // Trigger modal state
  const [showTriggerModal, setShowTriggerModal] = useState(false)
  const [triggerWorkflowId, setTriggerWorkflowId] = useState<string>('')
  const [triggerRef, setTriggerRef] = useState('main')
  const [triggerLoading, setTriggerLoading] = useState(false)
  const [triggerInputs, setTriggerInputs] = useState<Record<string, string>>({})

  // Action loading states
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Secrets state
  const [secrets, setSecrets] = useState<Secret[]>([])
  const [showAddSecretModal, setShowAddSecretModal] = useState(false)
  const [newSecretName, setNewSecretName] = useState('')
  const [newSecretValue, setNewSecretValue] = useState('')

  const loadDataRef = useRef<() => void>(() => {})
  const api = useBackendAPI('githut_actions')

  // Available repositories for the picker
  const [availableRepos, setAvailableRepos] = useState<Array<{ owner: string; name: string; full_name: string }>>([])
  const [reposLoading, setReposLoading] = useState(false)

  // ==================== Effects ====================

  const refreshApp = useCallback(() => {
    loadDataRef.current()
  }, [])

  const setRefreshHandlerRef = useRef(setRefreshHandler)
  setRefreshHandlerRef.current = setRefreshHandler

  useEffect(() => {
    if (setRefreshHandlerRef.current) {
      setRefreshHandlerRef.current(refreshApp)
    }
    return () => {
      if (setRefreshHandlerRef.current) setRefreshHandlerRef.current(null)
    }
  }, [refreshApp])

  useEffect(() => {
    loadDataRef.current = () => {
      if (activeTab === 'workflows') {
        loadWorkflows(owner, repo)
      } else {
        loadWorkflowRuns()
      }
    }
  })

  useEffect(() => {
    loadAvailableRepos()
    loadInitialState()
  }, [])

  const loadAvailableRepos = async () => {
    setReposLoading(true)
    try {
      const stateResponse = await fetch('./api/services/githut_actions/state').then(r => r.json())
      const repos = stateResponse?.state?.repositories || {}
      const normalized = Object.keys(repos)
        .map((key) => {
          const [o, n] = key.split('/')
          return { owner: o || '', name: n || '', full_name: key }
        })
        .filter((r) => r.owner && r.name)
        .sort((a, b) => a.full_name.localeCompare(b.full_name))
      setAvailableRepos(normalized)
    } catch (err) {
      console.error('Failed to load repositories:', err)
    } finally {
      setReposLoading(false)
    }
  }

  const selectRepo = (fullName: string) => {
    if (!fullName) return
    const [o, n] = fullName.split('/')
    if (!o || !n) return
    setSelectedWorkflow(null)
    setWorkflowUsage(null)
    setSelectedRun(null)
    setRunJobs([])
    setOwner(o)
    setRepo(n)
    if (activeTab === 'workflows') {
      loadWorkflows(o, n)
    } else if (activeTab === 'runs') {
      loadWorkflowRuns(o, n)
    }
  }

  // Load runs when switching to runs tab or when filters change
  useEffect(() => {
    if (activeTab === 'runs' && owner && repo) {
      loadWorkflowRuns(owner, repo)
    }
  }, [activeTab, filterWorkflowId, filterStatus, filterBranch, owner, repo])

  // Auto-refresh runs every 10 seconds when on runs tab
  useEffect(() => {
    if (activeTab !== 'runs' || !owner || !repo) return
    const interval = setInterval(() => {
      loadWorkflowRuns(owner, repo)
    }, 10000)
    return () => clearInterval(interval)
  }, [activeTab, owner, repo, filterWorkflowId, filterStatus, filterBranch])

  // ==================== Data Loading ====================

  const loadInitialState = async () => {
    setLoading(true)
    setError(null)
    try {
      const stateResponse = await fetch('./api/services/githut_actions/state').then(r => r.json())
      const state = stateResponse?.state || {}

      const stateOwner = state.owner || ''
      const stateRepo = state.repo || ''

      if (stateOwner && stateRepo) {
        setOwner(stateOwner)
        setRepo(stateRepo)
        await loadWorkflows(stateOwner, stateRepo)
      } else {
        const repos = state.repositories || {}
        const repoKeys = Object.keys(repos)
        if (repoKeys.length > 0) {
          const [firstOwner, firstRepo] = repoKeys[0].split('/')
          if (firstOwner && firstRepo) {
            setOwner(firstOwner)
            setRepo(firstRepo)
            await loadWorkflows(firstOwner, firstRepo)
          }
        }
      }
    } catch (err) {
      console.error('Failed to load initial state:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadWorkflows = async (ownerParam: string, repoParam: string) => {
    if (!ownerParam || !repoParam) return
    setLoading(true)
    setError(null)
    try {
      const result = await api.callTool<{ total_count: number; workflows: Workflow[] }>('list_workflows', {
        owner: ownerParam,
        repo: repoParam,
        per_page: 100,
      })

      setWorkflows(result?.workflows || [])
      setTotalWorkflowCount(result?.total_count || 0)

      if (!selectedWorkflow && result?.workflows?.length > 0) {
        await selectWorkflow(result.workflows[0], ownerParam, repoParam)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflows')
      setWorkflows([])
    } finally {
      setLoading(false)
    }
  }

  const selectWorkflow = async (workflow: Workflow, ownerParam?: string, repoParam?: string) => {
    const o = ownerParam || owner
    const r = repoParam || repo

    setSelectedWorkflow(workflow)
    setUsageLoading(true)
    setWorkflowUsage(null)

    try {
      const [usage, detail] = await Promise.allSettled([
        api.callTool<WorkflowUsage>('get_workflow_usage', {
          owner: o,
          repo: r,
          workflow_id: workflow.id,
        }),
        api.callTool<Workflow>('get_workflow', {
          owner: o,
          repo: r,
          workflow_id: workflow.id,
        })
      ])
      if (usage.status === 'fulfilled') setWorkflowUsage(usage.value)
      if (detail.status === 'fulfilled' && detail.value) setSelectedWorkflow(detail.value)
    } catch (err) {
      console.error('Failed to load workflow details:', err)
    } finally {
      setUsageLoading(false)
    }
  }

  const loadWorkflowRuns = async (ownerParam?: string, repoParam?: string) => {
    const o = ownerParam || owner
    const r = repoParam || repo
    if (!o || !r) return
    setRunsLoading(true)
    try {
      const params: Record<string, unknown> = { owner: o, repo: r, per_page: 50 }
      if (filterWorkflowId) params.workflow_id = parseInt(filterWorkflowId)
      if (filterStatus) params.status = filterStatus
      if (filterBranch) params.branch = filterBranch

      const result = await api.callTool<{ total_count: number; workflow_runs: WorkflowRun[] }>('list_workflow_runs', params)
      setWorkflowRuns(result?.workflow_runs || [])
      setTotalRunsCount(result?.total_count || 0)

      // Update selected run status if it's in the list
      if (selectedRun) {
        const updatedRun = result?.workflow_runs?.find(wr => wr.id === selectedRun.id)
        if (updatedRun) {
          setSelectedRun(updatedRun)
        }
      }

      // Auto-select first run
      if (!selectedRun && result?.workflow_runs?.length > 0) {
        await selectRun(result.workflow_runs[0], o, r)
      }
    } catch (err) {
      console.error('Failed to load workflow runs:', err)
      setWorkflowRuns([])
    } finally {
      setRunsLoading(false)
    }
  }

  const selectRun = async (run: WorkflowRun, ownerParam?: string, repoParam?: string) => {
    const o = ownerParam || owner
    const r = repoParam || repo
    setSelectedRun(run)
    setRunJobs([])
    setExpandedJobs(new Set())
    setJobsLoading(true)

    try {
      // Fetch fresh run data and jobs in parallel
      const [freshRun, jobsResult] = await Promise.allSettled([
        api.callTool<WorkflowRun>('get_workflow_run', { owner: o, repo: r, run_id: run.id }),
        api.callTool<{ total_count: number; jobs: Job[] }>('get_workflow_run_jobs', { owner: o, repo: r, run_id: run.id }),
      ])
      if (freshRun.status === 'fulfilled' && freshRun.value) {
        setSelectedRun(freshRun.value)
      }
      const jobs = jobsResult.status === 'fulfilled' ? (jobsResult.value?.jobs || []) : []
      setRunJobs(jobs)
      // Auto-expand all jobs so logs (steps) are visible immediately
      setExpandedJobs(new Set(jobs.map(j => j.id)))
    } catch (err) {
      console.error('Failed to load run jobs:', err)
    } finally {
      setJobsLoading(false)
    }
  }

  // ==================== Actions ====================

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!owner || !repo) return
    setSelectedWorkflow(null)
    setWorkflowUsage(null)
    setSelectedRun(null)
    setRunJobs([])
    if (activeTab === 'workflows') {
      await loadWorkflows(owner, repo)
    } else {
      await loadWorkflowRuns()
    }
  }

  const triggerWorkflowRun = async () => {
    if (!triggerWorkflowId || !triggerRef) return
    setTriggerLoading(true)
    try {
      // Parse workflow_id as integer if possible, otherwise use as string
      const wfId = /^\d+$/.test(triggerWorkflowId) ? parseInt(triggerWorkflowId) : triggerWorkflowId
      const params: Record<string, unknown> = {
        owner,
        repo,
        workflow_id: wfId,
        ref: triggerRef,
      }
      // Only include inputs if there are non-empty values
      const nonEmptyInputs = Object.fromEntries(
        Object.entries(triggerInputs).filter(([, v]) => v !== '')
      )
      if (Object.keys(nonEmptyInputs).length > 0) {
        params.inputs = nonEmptyInputs
      }
      await api.callTool('trigger_workflow', params)
      setShowTriggerModal(false)
      setTriggerWorkflowId('')
      setTriggerRef('main')
      setTriggerInputs({})
      // Switch to runs tab and reload to show the new run
      setActiveTab('runs')
      await loadWorkflowRuns(owner, repo)
    } catch (err) {
      console.error('Failed to trigger workflow:', err)
      alert('Failed to trigger workflow: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setTriggerLoading(false)
    }
  }

  const cancelRun = async (runId: number) => {
    setActionLoading(`cancel-${runId}`)
    try {
      await api.callTool('cancel_workflow_run', { owner, repo, run_id: runId })
      await loadWorkflowRuns()
      if (selectedRun?.id === runId) {
        const updated = await api.callTool<WorkflowRun>('get_workflow_run', { owner, repo, run_id: runId })
        if (updated) {
          setSelectedRun(updated)
          await selectRun(updated)
        }
      }
    } catch (err) {
      console.error('Failed to cancel run:', err)
      alert('Failed to cancel run: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setActionLoading(null)
    }
  }

  const rerunWorkflow = async (runId: number) => {
    setActionLoading(`rerun-${runId}`)
    try {
      await api.callTool('rerun_workflow', { owner, repo, run_id: runId })
      await loadWorkflowRuns()
    } catch (err) {
      console.error('Failed to rerun workflow:', err)
      alert('Failed to rerun workflow: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setActionLoading(null)
    }
  }

  // Secrets management (client-side, no backend API)
  const addSecret = () => {
    const name = newSecretName.trim().toUpperCase()
    if (!name) return
    const now = new Date().toISOString()
    setSecrets(prev => {
      const existing = prev.find(s => s.name === name)
      if (existing) {
        return prev.map(s => s.name === name ? { ...s, updated_at: now } : s)
      }
      return [...prev, { name, created_at: now, updated_at: now }]
    })
    setNewSecretName('')
    setNewSecretValue('')
    setShowAddSecretModal(false)
  }

  const deleteSecret = (name: string) => {
    setSecrets(prev => prev.filter(s => s.name !== name))
  }

  const toggleJobExpanded = (jobId: number) => {
    setExpandedJobs(prev => {
      const next = new Set(prev)
      if (next.has(jobId)) {
        next.delete(jobId)
      } else {
        next.add(jobId)
      }
      return next
    })
  }

  // ==================== Render Helpers ====================

  const getWorkflowStateColor = (state: string) => {
    return workflowStateColors[state] || { bg: 'bg-gray-500/20', text: 'text-gray-400' }
  }

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'workflows', label: 'Workflows', icon: '⚙️' },
    { id: 'runs', label: 'Runs', icon: '▶️' },
    { id: 'secrets', label: 'Secrets', icon: '🔒' },
  ]

  // ==================== Render ====================

  return (
    <div
      className="h-full flex flex-col"
      style={{
        ['--bg-primary' as string]: '#FCFBF8',
        ['--bg-secondary' as string]: '#F5F2EC',
        ['--bg-tertiary' as string]: '#EDE8DF',
        ['--text-primary' as string]: '#162B2A',
        ['--text-secondary' as string]: '#4F6360',
        ['--text-tertiary' as string]: '#7A8E8B',
        ['--border-color' as string]: '#DCD5C6',
        ['--accent-color' as string]: '#0F766E',
        ['--accent-hover' as string]: '#115E59',
        ['--danger-color' as string]: '#B83A3A',
        backgroundColor: '#FCFBF8',
      } as React.CSSProperties}
    >
      {/* Header with repo picker */}
      <div className="px-5 py-4 bg-[var(--bg-secondary)] border-b border-[var(--border-color)]">
        <div className="text-[11px] font-semibold tracking-[0.08em] text-[var(--text-tertiary)] mb-2.5">
          {APP_NAME}
        </div>
        <div className="flex gap-2.5 items-center">
          <label className="text-xs text-[var(--text-secondary)] flex-shrink-0 font-medium">Repository</label>
          <div className="relative flex-1">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none">
              <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"/>
            </svg>
            <select
              value={owner && repo ? `${owner}/${repo}` : ''}
              onChange={(e) => selectRepo(e.target.value)}
              disabled={reposLoading || availableRepos.length === 0}
              className="w-full pl-9 pr-9 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 appearance-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed transition-all"
            >
              {reposLoading ? (
                <option value="">Loading repositories…</option>
              ) : availableRepos.length === 0 ? (
                <option value="">No repositories available</option>
              ) : (
                <>
                  <option value="" disabled>Select a repository…</option>
                  {availableRepos.map((r) => (
                    <option key={r.full_name} value={r.full_name}>{r.full_name}</option>
                  ))}
                </>
              )}
            </select>
            <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none">
              <path d="M12.78 6.22a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L3.22 7.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L8 9.94l3.72-3.72a.75.75 0 0 1 1.06 0Z"/>
            </svg>
          </div>
          <button
            type="button"
            onClick={() => owner && repo && handleSearch({ preventDefault: () => {} } as React.FormEvent)}
            disabled={!owner || !repo || loading}
            className="px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--border-color)] text-[var(--text-primary)] rounded-lg transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed border border-transparent hover:border-[var(--border-color)]"
            title="Refresh"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="px-5 pt-3 pb-2 bg-[var(--bg-secondary)] border-b border-[var(--border-color)]">
        <div className="inline-flex bg-[var(--bg-tertiary)] rounded-xl p-1 gap-0.5">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
                activeTab === tab.id
                  ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-[0_1px_3px_rgba(15,23,42,0.08),0_1px_2px_rgba(15,23,42,0.04)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]/50'
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {activeTab === 'workflows' ? (
          <WorkflowsTab
            workflows={workflows}
            selectedWorkflow={selectedWorkflow}
            workflowUsage={workflowUsage}
            totalCount={totalWorkflowCount}
            loading={loading}
            usageLoading={usageLoading}
            error={error}
            owner={owner}
            repo={repo}
            onSelectWorkflow={selectWorkflow}
            onRetry={() => loadWorkflows(owner, repo)}
            getStateColor={getWorkflowStateColor}
          />
        ) : activeTab === 'runs' ? (
          <RunsTab
            workflows={workflows}
            workflowRuns={workflowRuns}
            selectedRun={selectedRun}
            runJobs={runJobs}
            totalCount={totalRunsCount}
            runsLoading={runsLoading}
            jobsLoading={jobsLoading}
            expandedJobs={expandedJobs}
            filterWorkflowId={filterWorkflowId}
            filterStatus={filterStatus}
            filterBranch={filterBranch}
            actionLoading={actionLoading}
            owner={owner}
            repo={repo}
            onSelectRun={selectRun}
            onFilterWorkflowChange={setFilterWorkflowId}
            onFilterStatusChange={setFilterStatus}
            onFilterBranchChange={setFilterBranch}
            onToggleJobExpanded={toggleJobExpanded}
            onCancelRun={cancelRun}
            onRerunWorkflow={rerunWorkflow}
            onTrigger={() => setShowTriggerModal(true)}
          />
        ) : (
          <SecretsTab
            secrets={secrets}
            onAddSecret={() => setShowAddSecretModal(true)}
            onDeleteSecret={deleteSecret}
          />
        )}
      </div>

      {/* Footer with refresh button */}
      <div className="px-5 py-3 bg-[var(--bg-secondary)] border-t border-[var(--border-color)] flex items-center justify-between">
        <div className="text-xs text-[var(--text-tertiary)]">
          {owner && repo ? `${owner}/${repo}` : 'No repository selected'}
        </div>
        <button
          className="px-4 py-1.5 bg-[var(--bg-tertiary)] hover:bg-[var(--border-color)] rounded-lg transition-all text-xs font-medium text-[var(--text-primary)] disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => activeTab === 'workflows' ? loadWorkflows(owner, repo) : activeTab === 'runs' ? loadWorkflowRuns(owner, repo) : undefined}
          disabled={!owner || !repo || activeTab === 'secrets'}
        >
          Refresh
        </button>
      </div>

      {/* Trigger Modal */}
      {showTriggerModal && (
        <TriggerModal
          workflows={workflows}
          triggerWorkflowId={triggerWorkflowId}
          triggerRef={triggerRef}
          triggerLoading={triggerLoading}
          triggerInputs={triggerInputs}
          onWorkflowChange={setTriggerWorkflowId}
          onRefChange={setTriggerRef}
          onInputsChange={setTriggerInputs}
          onTrigger={triggerWorkflowRun}
          onClose={() => setShowTriggerModal(false)}
        />
      )}

      {/* Add Secret Modal */}
      {showAddSecretModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[var(--bg-primary)] rounded-2xl p-6 w-[28rem] border border-[var(--border-color)] shadow-[0_20px_60px_-15px_rgba(15,23,42,0.25)]">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">Add Repository Secret</h2>
            <p className="text-xs text-[var(--text-tertiary)] mb-5">Encrypted environment variables for workflows.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Secret Name</label>
                <input
                  type="text"
                  value={newSecretName}
                  onChange={(e) => setNewSecretName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))}
                  placeholder="MY_SECRET_NAME"
                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm font-mono placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 transition-all"
                />
                <p className="text-xs text-[var(--text-tertiary)] mt-1.5">Uppercase letters, numbers, and underscores only</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Secret Value</label>
                <input
                  type="password"
                  value={newSecretValue}
                  onChange={(e) => setNewSecretValue(e.target.value)}
                  placeholder="Enter secret value..."
                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 transition-all"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => { setShowAddSecretModal(false); setNewSecretName(''); setNewSecretValue('') }}
                className="px-4 py-2 bg-transparent hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg transition-all text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={addSecret}
                disabled={!newSecretName.trim() || !newSecretValue.trim()}
                className="px-4 py-2 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_1px_3px_rgba(15,118,110,0.3)] hover:shadow-[0_2px_6px_rgba(15,118,110,0.35)]"
              >
                Add Secret
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ==================== Workflows Tab ====================

interface WorkflowsTabProps {
  workflows: Workflow[]
  selectedWorkflow: Workflow | null
  workflowUsage: WorkflowUsage | null
  totalCount: number
  loading: boolean
  usageLoading: boolean
  error: string | null
  owner: string
  repo: string
  onSelectWorkflow: (workflow: Workflow) => void
  onRetry: () => void
  getStateColor: (state: string) => { bg: string; text: string }
}

function WorkflowsTab({
  workflows,
  selectedWorkflow,
  workflowUsage,
  totalCount,
  loading,
  usageLoading,
  error,
  owner,
  repo,
  onSelectWorkflow,
  onRetry,
  getStateColor,
}: WorkflowsTabProps) {
  return (
    <>
      {/* Workflows list */}
      <div className="w-80 border-r border-[var(--border-color)] flex flex-col bg-[var(--bg-primary)]">
        <div className="px-4 py-3 border-b border-[var(--border-color)]">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] tracking-tight">Workflows</h2>
            {totalCount > 0 && (
              <span className="text-[11px] font-medium text-[var(--text-tertiary)] bg-[var(--bg-tertiary)] px-2 py-0.5 rounded-full">{totalCount}</span>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-7 h-7 border-[3px] border-[var(--accent-color)]/20 border-t-[var(--accent-color)] rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 p-6">
              <p className="text-[var(--danger-color)] text-sm text-center leading-relaxed">{error}</p>
              <button
                className="px-4 py-2 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-all font-medium text-sm shadow-[0_1px_3px_rgba(15,118,110,0.3)]"
                onClick={onRetry}
              >
                Retry
              </button>
            </div>
          ) : workflows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] p-6">
              <div className="w-12 h-12 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center mb-3 text-2xl opacity-70">⚙</div>
              <p className="text-sm text-center text-[var(--text-secondary)] leading-relaxed">
                {owner && repo ? 'No workflows found' : 'Select a repository to view workflows'}
              </p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {workflows.map((workflow) => {
                const colors = getStateColor(workflow.state)
                const isSelected = selectedWorkflow?.id === workflow.id

                return (
                  <button
                    key={workflow.id}
                    onClick={() => onSelectWorkflow(workflow)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-all group ${
                      isSelected
                        ? 'bg-[var(--accent-color)]/10 ring-1 ring-[var(--accent-color)]/40'
                        : 'hover:bg-[var(--bg-tertiary)]/70'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className={`font-medium text-sm truncate ${isSelected ? 'text-[var(--accent-color)]' : 'text-[var(--text-primary)]'}`}>
                          {workflow.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary)', fontWeight: 400 }}>[{workflow.id}]</span>
                        </div>
                        <div className="text-[11px] text-[var(--text-tertiary)] truncate mt-1 font-mono tracking-tight">
                          {workflow.path}
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium tracking-wide ${colors.bg} ${colors.text}`}>
                        {workflow.state}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Workflow details panel */}
      <div className="flex-1 overflow-auto p-6 bg-[var(--bg-secondary)]/40">
        {selectedWorkflow ? (
          <div className="space-y-4 max-w-3xl">
            {/* Workflow header */}
            <div className="bg-[var(--bg-primary)] rounded-2xl p-6 border border-[var(--border-color)] shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold text-[var(--text-primary)] tracking-tight">
                    {selectedWorkflow.name}<span style={{ marginLeft: '8px', fontSize: '12px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary)', fontWeight: 400 }}>[{selectedWorkflow.id}]</span>
                  </h2>
                  <p className="text-sm text-[var(--text-tertiary)] mt-1.5 font-mono tracking-tight">
                    {selectedWorkflow.path}
                  </p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium tracking-wide whitespace-nowrap ${getStateColor(selectedWorkflow.state).bg} ${getStateColor(selectedWorkflow.state).text}`}>
                  {selectedWorkflow.state}
                </span>
              </div>
            </div>

            {/* Workflow details */}
            <div className="bg-[var(--bg-primary)] rounded-2xl p-6 border border-[var(--border-color)] shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
              <h3 className="text-xs font-semibold text-[var(--text-secondary)] mb-4 uppercase tracking-wider">Details</h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-[var(--text-tertiary)] font-medium">Workflow ID</div>
                  <div className="text-sm text-[var(--text-primary)] font-mono mt-1">{selectedWorkflow.id}</div>
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-wide text-[var(--text-tertiary)] font-medium">Node ID</div>
                  <div className="text-sm text-[var(--text-primary)] font-mono truncate mt-1">{selectedWorkflow.node_id}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-[var(--text-tertiary)] font-medium">Created</div>
                  <div className="text-sm text-[var(--text-primary)] mt-1">{formatDate(selectedWorkflow.created_at)}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-[var(--text-tertiary)] font-medium">Last Updated</div>
                  <div className="text-sm text-[var(--text-primary)] mt-1">{formatDate(selectedWorkflow.updated_at)}</div>
                </div>
              </div>
            </div>

            {/* Usage statistics */}
            <div className="bg-[var(--bg-primary)] rounded-2xl p-6 border border-[var(--border-color)] shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
              <h3 className="text-xs font-semibold text-[var(--text-secondary)] mb-4 uppercase tracking-wider">Usage Statistics</h3>
              {usageLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-[3px] border-[var(--accent-color)]/20 border-t-[var(--accent-color)] rounded-full animate-spin" />
                </div>
              ) : workflowUsage?.billable ? (
                <div className="space-y-4">
                  {workflowUsage.billable.UBUNTU && (
                    <UsageBar label="Ubuntu" icon="🐧" totalMs={workflowUsage.billable.UBUNTU.total_ms} jobs={workflowUsage.billable.UBUNTU.jobs} color="bg-orange-500" />
                  )}
                  {workflowUsage.billable.MACOS && (
                    <UsageBar label="macOS" icon="🍎" totalMs={workflowUsage.billable.MACOS.total_ms} jobs={workflowUsage.billable.MACOS.jobs} color="bg-blue-500" />
                  )}
                  {workflowUsage.billable.WINDOWS && (
                    <UsageBar label="Windows" icon="🪟" totalMs={workflowUsage.billable.WINDOWS.total_ms} jobs={workflowUsage.billable.WINDOWS.jobs} color="bg-cyan-500" />
                  )}
                  {!workflowUsage.billable.UBUNTU && !workflowUsage.billable.MACOS && !workflowUsage.billable.WINDOWS && (
                    <div className="text-center text-[var(--text-tertiary)] py-4 text-sm">No usage data available</div>
                  )}
                </div>
              ) : (
                <div className="text-center text-[var(--text-tertiary)] py-4 text-sm">No usage data available</div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)]">
            <div className="w-16 h-16 rounded-2xl bg-[var(--bg-tertiary)] flex items-center justify-center mb-4 text-3xl opacity-70">📋</div>
            <p className="text-base font-medium text-[var(--text-secondary)]">Select a workflow to view details</p>
            <p className="text-sm text-[var(--text-tertiary)] mt-1">Choose one from the list to see usage and metadata.</p>
          </div>
        )}
      </div>
    </>
  )
}

// ==================== Runs Tab ====================

interface RunsTabProps {
  workflows: Workflow[]
  workflowRuns: WorkflowRun[]
  selectedRun: WorkflowRun | null
  runJobs: Job[]
  totalCount: number
  runsLoading: boolean
  jobsLoading: boolean
  expandedJobs: Set<number>
  filterWorkflowId: string
  filterStatus: string
  filterBranch: string
  actionLoading: string | null
  owner: string
  repo: string
  onSelectRun: (run: WorkflowRun) => void
  onFilterWorkflowChange: (value: string) => void
  onFilterStatusChange: (value: string) => void
  onFilterBranchChange: (value: string) => void
  onToggleJobExpanded: (jobId: number) => void
  onCancelRun: (runId: number) => void
  onRerunWorkflow: (runId: number) => void
  onTrigger: () => void
}

function RunsTab({
  workflows,
  workflowRuns,
  selectedRun,
  runJobs,
  totalCount,
  runsLoading,
  jobsLoading,
  expandedJobs,
  filterWorkflowId,
  filterStatus,
  filterBranch,
  actionLoading,
  owner,
  repo,
  onSelectRun,
  onFilterWorkflowChange,
  onFilterStatusChange,
  onFilterBranchChange,
  onToggleJobExpanded,
  onCancelRun,
  onRerunWorkflow,
  onTrigger,
}: RunsTabProps) {
  return (
    <>
      {/* Runs list */}
      <div className="w-96 border-r border-[var(--border-color)] flex flex-col bg-[var(--bg-primary)]">
        {/* Filters */}
        <div className="px-4 py-3 border-b border-[var(--border-color)] space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] tracking-tight">Workflow Runs</h2>
            <button
              onClick={onTrigger}
              className="px-3 py-1.5 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-all text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_1px_2px_rgba(15,118,110,0.3)] hover:shadow-[0_2px_5px_rgba(15,118,110,0.35)]"
              disabled={!owner || !repo || workflows.length === 0}
            >
              + Trigger
            </button>
          </div>
          <div className="flex gap-2">
            <select
              value={filterWorkflowId}
              onChange={(e) => onFilterWorkflowChange(e.target.value)}
              className="flex-1 px-2.5 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-xs focus:outline-none focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 transition-all cursor-pointer"
            >
              <option value="">All Workflows</option>
              {workflows.map(w => (
                <option key={w.id} value={w.id.toString()}>{w.name}</option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => onFilterStatusChange(e.target.value)}
              className="flex-1 px-2.5 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-xs focus:outline-none focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 transition-all cursor-pointer"
            >
              {statusFilterOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <input
            type="text"
            placeholder="Filter by branch..."
            value={filterBranch}
            onChange={(e) => onFilterBranchChange(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-xs placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 transition-all"
          />
          {totalCount > 0 && (
            <div className="text-[11px] text-[var(--text-tertiary)] font-medium">{totalCount} run{totalCount !== 1 ? 's' : ''} found</div>
          )}
        </div>

        {/* Runs list */}
        <div className="flex-1 overflow-auto">
          {runsLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-7 h-7 border-[3px] border-[var(--accent-color)]/20 border-t-[var(--accent-color)] rounded-full animate-spin" />
            </div>
          ) : workflowRuns.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] p-6">
              <div className="w-12 h-12 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center mb-3 text-2xl opacity-70">▶</div>
              <p className="text-sm text-center text-[var(--text-secondary)] leading-relaxed">
                {owner && repo ? 'No workflow runs found' : 'Select a repository to view runs'}
              </p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {workflowRuns.map((run) => {
                const effectiveStatus = getEffectiveStatus(run)
                const statusStyle = getRunStatusStyle(effectiveStatus)
                const isSelected = selectedRun?.id === run.id

                return (
                  <button
                    key={run.id}
                    onClick={() => onSelectRun(run)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-all ${
                      isSelected
                        ? 'bg-[var(--accent-color)]/10 ring-1 ring-[var(--accent-color)]/40'
                        : 'hover:bg-[var(--bg-tertiary)]/70'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`${statusStyle.text} text-sm leading-none`}>{statusStyle.icon}</span>
                          <span className={`font-medium text-sm truncate ${isSelected ? 'text-[var(--accent-color)]' : 'text-[var(--text-primary)]'}`}>
                            {run.name || run.path.split('/').pop()}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary)', fontWeight: 400 }}>[{run.id}]</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 ml-6">
                          <span className="text-[11px] font-mono text-[var(--text-tertiary)]">#{run.run_number}</span>
                          {run.head_branch && (
                            <span className="text-[11px] text-[var(--text-tertiary)] truncate font-mono tracking-tight">
                              · {run.head_branch}
                            </span>
                          )}
                          <span className="text-[11px] text-[var(--text-tertiary)] ml-auto whitespace-nowrap">
                            {formatRelativeTime(run.created_at)}
                          </span>
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium tracking-wide whitespace-nowrap ${statusStyle.bg} ${statusStyle.text}`}>
                        {effectiveStatus}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Run details panel */}
      <div className="flex-1 overflow-auto p-6 bg-[var(--bg-secondary)]/40">
        {selectedRun ? (
          <div className="space-y-4 max-w-3xl">
            {/* Run header */}
            <div className="bg-[var(--bg-primary)] rounded-2xl p-6 border border-[var(--border-color)] shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold text-[var(--text-primary)] tracking-tight truncate">
                    {selectedRun.name || selectedRun.path.split('/').pop()}<span style={{ marginLeft: '8px', fontSize: '12px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary)', fontWeight: 400 }}>[{selectedRun.id}]</span>
                  </h2>
                  <p className="text-sm text-[var(--text-tertiary)] mt-1.5">
                    Run #{selectedRun.run_number} <span className="opacity-60">·</span> Attempt #{selectedRun.run_attempt}
                  </p>
                </div>
                {(() => {
                  const effectiveStatus = getEffectiveStatus(selectedRun)
                  const statusStyle = getRunStatusStyle(effectiveStatus)
                  return (
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium tracking-wide whitespace-nowrap ${statusStyle.bg} ${statusStyle.text}`}>
                      <span>{statusStyle.icon}</span> {effectiveStatus}
                    </span>
                  )
                })()}
              </div>

              {/* Action buttons */}
              {(canCancel(selectedRun) || canRerun(selectedRun)) && (
                <div className="flex gap-2 mt-5 pt-5 border-t border-[var(--border-color)]">
                  {canCancel(selectedRun) && (
                    <button
                      onClick={() => onCancelRun(selectedRun.id)}
                      disabled={actionLoading === `cancel-${selectedRun.id}`}
                      className="px-4 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed border border-red-500/20"
                    >
                      {actionLoading === `cancel-${selectedRun.id}` ? 'Cancelling…' : 'Cancel run'}
                    </button>
                  )}
                  {canRerun(selectedRun) && (
                    <button
                      onClick={() => onRerunWorkflow(selectedRun.id)}
                      disabled={actionLoading === `rerun-${selectedRun.id}`}
                      className="px-4 py-1.5 bg-[var(--accent-color)]/10 hover:bg-[var(--accent-color)]/20 text-[var(--accent-color)] rounded-lg transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed border border-[var(--accent-color)]/20"
                    >
                      {actionLoading === `rerun-${selectedRun.id}` ? 'Re-running…' : 'Re-run'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Run details */}
            <div className="bg-[var(--bg-primary)] rounded-2xl p-6 border border-[var(--border-color)] shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
              <h3 className="text-xs font-semibold text-[var(--text-secondary)] mb-4 uppercase tracking-wider">Details</h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-[var(--text-tertiary)] font-medium">Branch</div>
                  <div className="text-sm text-[var(--text-primary)] font-mono mt-1 truncate">{selectedRun.head_branch || '—'}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-[var(--text-tertiary)] font-medium">Event</div>
                  <div className="text-sm text-[var(--text-primary)] mt-1">{selectedRun.event}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-[var(--text-tertiary)] font-medium">Commit</div>
                  <div className="text-sm text-[var(--text-primary)] font-mono mt-1">{selectedRun.head_sha.substring(0, 7)}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-[var(--text-tertiary)] font-medium">Duration</div>
                  <div className="text-sm text-[var(--text-primary)] font-mono mt-1">
                    {calculateDuration(selectedRun.run_started_at, selectedRun.status === 'completed' ? selectedRun.updated_at : null)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-[var(--text-tertiary)] font-medium">Actor</div>
                  <div className="text-sm text-[var(--text-primary)] mt-1 truncate">{selectedRun.actor?.login || '—'}{selectedRun.actor && <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary)', fontWeight: 400 }}>[{selectedRun.actor.id}]</span>}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-[var(--text-tertiary)] font-medium">Created</div>
                  <div className="text-sm text-[var(--text-primary)] mt-1">{formatDate(selectedRun.created_at)}</div>
                </div>
              </div>
              {selectedRun.head_commit && (
                <div className="mt-5 pt-5 border-t border-[var(--border-color)]">
                  <div className="text-[11px] uppercase tracking-wide text-[var(--text-tertiary)] font-medium mb-1.5">Commit Message</div>
                  <div className="text-sm text-[var(--text-primary)] line-clamp-2 leading-relaxed">{selectedRun.head_commit.message}</div>
                </div>
              )}
            </div>

            {/* Jobs */}
            <div className="bg-[var(--bg-primary)] rounded-2xl p-6 border border-[var(--border-color)] shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
              <h3 className="text-xs font-semibold text-[var(--text-secondary)] mb-4 uppercase tracking-wider">Jobs</h3>
              {jobsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-[3px] border-[var(--accent-color)]/20 border-t-[var(--accent-color)] rounded-full animate-spin" />
                </div>
              ) : runJobs.length === 0 ? (
                <div className="text-center text-[var(--text-tertiary)] py-6 text-sm">No jobs found</div>
              ) : (
                <div className="space-y-2">
                  {runJobs.map(job => {
                    const jobStatus = job.conclusion || job.status
                    const jobStyle = getRunStatusStyle(jobStatus)
                    const isExpanded = expandedJobs.has(job.id)

                    return (
                      <div key={job.id} className="bg-[var(--bg-secondary)]/60 rounded-xl overflow-hidden transition-all hover:bg-[var(--bg-secondary)]">
                        <button
                          onClick={() => onToggleJobExpanded(job.id)}
                          className="w-full flex items-center justify-between px-4 py-3 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className={`${jobStyle.text} text-sm leading-none flex-shrink-0`}>{jobStyle.icon}</span>
                            <span className="text-sm font-medium text-[var(--text-primary)] truncate">{job.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary)', fontWeight: 400 }}>[{job.id}]</span></span>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <span className="text-xs font-mono text-[var(--text-tertiary)]">
                              {calculateDuration(job.started_at, job.completed_at)}
                            </span>
                            <svg
                              viewBox="0 0 12 12"
                              width="10"
                              height="10"
                              fill="currentColor"
                              className={`text-[var(--text-tertiary)] transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                              aria-hidden
                            >
                              <path d="M3.22 2.97a.75.75 0 0 1 1.06 0l3 3a.75.75 0 0 1 0 1.06l-3 3a.75.75 0 1 1-1.06-1.06L5.69 6.5 3.22 4.03a.75.75 0 0 1 0-1.06Z"/>
                            </svg>
                          </div>
                        </button>
                        {isExpanded && job.steps && job.steps.length > 0 && (
                          <div className="border-t border-[var(--border-color)] bg-[var(--bg-tertiary)]/40">
                            {job.steps.map(step => {
                              const stepStatus = step.conclusion || step.status
                              const stepStyle = getRunStatusStyle(stepStatus)
                              return (
                                <div key={step.number} className="flex items-center gap-2.5 px-4 py-2 border-b border-[var(--border-color)]/50 last:border-b-0">
                                  <span className={`text-xs ${stepStyle.text} leading-none flex-shrink-0`}>{stepStyle.icon}</span>
                                  <span className="text-xs text-[var(--text-primary)] flex-1 truncate">{step.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary)', fontWeight: 400 }}>[{step.number}]</span></span>
                                  <span className="text-[11px] font-mono text-[var(--text-tertiary)]">
                                    {step.started_at && step.completed_at
                                      ? calculateDuration(step.started_at, step.completed_at)
                                      : '—'}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)]">
            <div className="w-16 h-16 rounded-2xl bg-[var(--bg-tertiary)] flex items-center justify-center mb-4 text-3xl opacity-70">▶</div>
            <p className="text-base font-medium text-[var(--text-secondary)]">Select a run to view details</p>
            <p className="text-sm text-[var(--text-tertiary)] mt-1">Choose one from the list to see jobs and steps.</p>
          </div>
        )}
      </div>
    </>
  )
}

// ==================== Trigger Modal ====================

interface TriggerModalProps {
  workflows: Workflow[]
  triggerWorkflowId: string
  triggerRef: string
  triggerLoading: boolean
  triggerInputs: Record<string, string>
  onWorkflowChange: (value: string) => void
  onRefChange: (value: string) => void
  onInputsChange: (inputs: Record<string, string>) => void
  onTrigger: () => void
  onClose: () => void
}

function TriggerModal({
  workflows,
  triggerWorkflowId,
  triggerRef,
  triggerLoading,
  triggerInputs,
  onWorkflowChange,
  onRefChange,
  onInputsChange,
  onTrigger,
  onClose,
}: TriggerModalProps) {
  const [newInputKey, setNewInputKey] = useState('')

  const addInput = () => {
    const key = newInputKey.trim()
    if (key && !(key in triggerInputs)) {
      onInputsChange({ ...triggerInputs, [key]: '' })
      setNewInputKey('')
    }
  }

  const updateInput = (key: string, value: string) => {
    onInputsChange({ ...triggerInputs, [key]: value })
  }

  const removeInput = (key: string) => {
    const next = { ...triggerInputs }
    delete next[key]
    onInputsChange(next)
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[var(--bg-primary)] rounded-2xl p-6 w-[28rem] border border-[var(--border-color)] shadow-[0_20px_60px_-15px_rgba(15,23,42,0.25)] max-h-[80vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">Trigger Workflow</h2>
        <p className="text-xs text-[var(--text-tertiary)] mb-5">Manually dispatch a workflow run with optional inputs.</p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Workflow</label>
            <select
              value={triggerWorkflowId}
              onChange={(e) => onWorkflowChange(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 transition-all cursor-pointer"
            >
              <option value="">Select a workflow…</option>
              {workflows.filter(w => w.state === 'active').map(w => (
                <option key={w.id} value={w.id.toString()}>{w.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Branch / Tag / SHA</label>
            <input
              type="text"
              value={triggerRef}
              onChange={(e) => onRefChange(e.target.value)}
              placeholder="main"
              className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm font-mono placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Workflow Inputs</label>
            {Object.entries(triggerInputs).length > 0 && (
              <div className="space-y-2 mb-2">
                {Object.entries(triggerInputs).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-xs text-[var(--text-secondary)] min-w-[80px] truncate font-mono">{key}</span>
                    <input
                      type="text"
                      value={value}
                      onChange={(e) => updateInput(key, e.target.value)}
                      placeholder="value"
                      className="flex-1 px-2.5 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 transition-all"
                    />
                    <button
                      onClick={() => removeInput(key)}
                      className="text-[var(--text-tertiary)] hover:text-red-500 hover:bg-red-500/10 text-sm w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                      title="Remove input"
                      aria-label="Remove input"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={newInputKey}
                onChange={(e) => setNewInputKey(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addInput() }}
                placeholder="Input name (e.g. environment)"
                className="flex-1 px-2.5 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 transition-all"
              />
              <button
                onClick={addInput}
                disabled={!newInputKey.trim()}
                className="px-3 py-1.5 bg-[var(--bg-tertiary)] hover:bg-[var(--border-color)] text-[var(--text-primary)] rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
              >
                Add
              </button>
            </div>
            <p className="text-xs text-[var(--text-tertiary)] mt-1.5">Key-value pairs for workflow_dispatch inputs</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-transparent hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg transition-all text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onTrigger}
            disabled={!triggerWorkflowId || !triggerRef || triggerLoading}
            className="px-4 py-2 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_1px_3px_rgba(15,118,110,0.3)] hover:shadow-[0_2px_6px_rgba(15,118,110,0.35)]"
          >
            {triggerLoading ? 'Triggering…' : 'Trigger'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ==================== Secrets Tab ====================

interface SecretsTabProps {
  secrets: Secret[]
  onAddSecret: () => void
  onDeleteSecret: (name: string) => void
}

function SecretsTab({ secrets, onAddSecret, onDeleteSecret }: SecretsTabProps) {
  return (
    <div className="flex-1 overflow-auto p-6 bg-[var(--bg-secondary)]/40">
      <div className="max-w-2xl mx-auto">
        <div className="bg-[var(--bg-primary)] rounded-2xl p-6 border border-[var(--border-color)] shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
          <div className="flex items-start justify-between mb-5 gap-4">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-[var(--text-primary)] tracking-tight">Repository Secrets</h2>
              <p className="text-sm text-[var(--text-tertiary)] mt-1 leading-relaxed">
                Encrypted environment variables used in workflows.
              </p>
            </div>
            <button
              onClick={onAddSecret}
              className="px-4 py-2 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-all text-sm font-medium shadow-[0_1px_3px_rgba(15,118,110,0.3)] hover:shadow-[0_2px_6px_rgba(15,118,110,0.35)] whitespace-nowrap"
            >
              + New Secret
            </button>
          </div>

          {secrets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-[var(--text-secondary)]">
              <div className="w-14 h-14 rounded-2xl bg-[var(--bg-tertiary)] flex items-center justify-center mb-4 text-2xl opacity-70">🔒</div>
              <p className="text-sm font-medium text-[var(--text-secondary)]">No secrets configured</p>
              <p className="text-xs text-[var(--text-tertiary)] mt-1">Add a secret to get started.</p>
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden border border-[var(--border-color)]">
              <table className="w-full">
                <thead>
                  <tr className="bg-[var(--bg-tertiary)]/60">
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Name</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Last Updated</th>
                    <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {secrets.map(secret => (
                    <tr key={secret.name} className="border-t border-[var(--border-color)] hover:bg-[var(--bg-tertiary)]/40 transition-colors group">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-[var(--text-tertiary)]">🔑</span>
                          <span className="text-sm font-mono font-medium text-[var(--text-primary)] tracking-tight">{secret.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">
                        {formatDate(secret.updated_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => onDeleteSecret(secret.name)}
                          className="px-3 py-1 bg-transparent hover:bg-red-500/10 text-[var(--text-tertiary)] hover:text-red-500 rounded-lg transition-all text-xs font-medium opacity-70 group-hover:opacity-100"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ==================== Usage Bar Component ====================

interface UsageBarProps {
  label: string
  icon: string
  totalMs: number
  jobs: number
  color: string
}

function UsageBar({ label, icon, totalMs, jobs, color }: UsageBarProps) {
  const maxMs = 3600000
  const percentage = Math.min((totalMs / maxMs) * 100, 100)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span>{icon}</span>
          <span className="text-[var(--text-primary)] font-medium">{label}</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-sm text-[var(--text-primary)]">{formatDuration(totalMs)}</span>
          <span className="text-[11px] text-[var(--text-tertiary)]">{jobs} job{jobs !== 1 ? 's' : ''}</span>
        </div>
      </div>
      <div className="h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-500 ease-out`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
