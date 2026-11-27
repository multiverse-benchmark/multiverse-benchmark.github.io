import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  RefreshCw, Search, ChevronRight, ChevronDown, ChevronsUpDown,
  ChevronUp, ChevronLeft, Play, X, Database, Wrench, Loader2,
} from 'lucide-react'
import { dispatchBackendStateChanged } from '../../hooks/useBackendAPI'

// ─── Types ─────────────────────────────────────────────────────────

interface AdminPanelProps {
  serviceName: string
  onClose: () => void
  onRefreshApp?: () => void
}

interface ToolParameter {
  type: string
  description?: string
  enum?: string[]
  items?: { type: string }
  properties?: Record<string, ToolParameter>
  required?: string[]
  default?: unknown
}

interface ToolDefinition {
  name: string
  description: string
  parameters?: {
    type: string
    properties?: Record<string, ToolParameter>
    required?: string[]
  }
}

interface ServiceInfo {
  name: string
  tools: ToolDefinition[]
}

// ─── API helpers ───────────────────────────────────────────────────

const API_BASE = './api'

async function fetchState(serviceName: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}/services/${serviceName}/state`)
  if (!res.ok) throw new Error(`Failed to fetch state: ${res.status}`)
  return res.json()
}

async function fetchServiceInfo(serviceName: string): Promise<ServiceInfo> {
  const res = await fetch(`${API_BASE}/services/${serviceName}`)
  if (!res.ok) throw new Error(`Failed to fetch service: ${res.status}`)
  return res.json()
}

async function executeTool(serviceName: string, toolName: string, params: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${API_BASE}/services/${serviceName}/tools/${toolName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ params }),
  })
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    throw new Error(errData.error || `HTTP ${res.status}`)
  }
  const data = await res.json()
  // Notify that backend state may have changed (so apps can refresh)
  dispatchBackendStateChanged(toolName)
  return data.result !== undefined ? data.result : data
}

// ─── JSON Tree Component ──────────────────────────────────────────

interface JsonNodeProps {
  keyName: string | null
  value: unknown
  depth: number
  expandAll: boolean | null // null means "use local state"
  searchTerm: string
  matchIndex: number | null // current active match index (for highlighting)
  matchCounter: { current: number } // mutable counter to assign global match indices
  activeMatchIndex: number
  onManualToggle?: () => void // resets expandAll so individual toggling works
}

function highlightText(text: string, search: string, matchCounter: { current: number }, activeMatchIndex: number): React.ReactNode {
  if (!search) return text
  const lower = text.toLowerCase()
  const searchLower = search.toLowerCase()
  const parts: React.ReactNode[] = []
  let lastIdx = 0
  let idx = lower.indexOf(searchLower)
  while (idx !== -1) {
    if (idx > lastIdx) parts.push(text.slice(lastIdx, idx))
    const thisMatchIdx = matchCounter.current++
    const isActive = thisMatchIdx === activeMatchIndex
    parts.push(
      <span
        key={idx}
        data-match-index={thisMatchIdx}
        className={isActive ? 'bg-yellow-400 text-black rounded px-0.5' : 'bg-yellow-200/60 text-black rounded px-0.5'}
      >
        {text.slice(idx, idx + search.length)}
      </span>
    )
    lastIdx = idx + search.length
    idx = lower.indexOf(searchLower, lastIdx)
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx))
  return parts.length > 0 ? <>{parts}</> : text
}

function countMatches(text: string, search: string): number {
  if (!search) return 0
  const lower = text.toLowerCase()
  const searchLower = search.toLowerCase()
  let count = 0
  let idx = lower.indexOf(searchLower)
  while (idx !== -1) {
    count++
    idx = lower.indexOf(searchLower, idx + searchLower.length)
  }
  return count
}

function JsonNode({ keyName, value, depth, expandAll, searchTerm, matchCounter, activeMatchIndex, onManualToggle }: JsonNodeProps) {
  const [localExpanded, setLocalExpanded] = useState(depth < 2)

  const expanded = expandAll !== null ? expandAll : localExpanded

  const isObject = value !== null && typeof value === 'object' && !Array.isArray(value)
  const isArray = Array.isArray(value)
  const isExpandable = isObject || isArray

  const toggle = () => {
    setLocalExpanded(prev => !prev)
    onManualToggle?.()
  }

  // Reset local expanded when expandAll changes
  useEffect(() => {
    if (expandAll !== null) setLocalExpanded(expandAll)
  }, [expandAll])

  const renderValue = (val: unknown): React.ReactNode => {
    if (val === null) return <span className="text-mac-tertiary italic">null</span>
    if (val === undefined) return <span className="text-mac-tertiary italic">undefined</span>
    if (typeof val === 'boolean') return <span className="text-orange-500">{val.toString()}</span>
    if (typeof val === 'number') return <span className="text-blue-500">{highlightText(val.toString(), searchTerm, matchCounter, activeMatchIndex)}</span>
    if (typeof val === 'string') return <span className="text-green-600 dark:text-green-400">"{highlightText(val, searchTerm, matchCounter, activeMatchIndex)}"</span>
    return <span>{String(val)}</span>
  }

  const keyDisplay = keyName !== null ? (
    <span className="text-purple-600 dark:text-purple-400 font-medium mr-1">
      {highlightText(keyName, searchTerm, matchCounter, activeMatchIndex)}
      <span className="text-mac-secondary">: </span>
    </span>
  ) : null

  if (!isExpandable) {
    return (
      <div className="flex items-baseline" style={{ paddingLeft: depth * 16 }}>
        {keyDisplay}
        {renderValue(value)}
      </div>
    )
  }

  const entries = isArray
    ? (value as unknown[]).map((v, i) => [String(i), v] as [string, unknown])
    : Object.entries(value as Record<string, unknown>)
  const label = isArray ? `[...]` : `{...}`

  return (
    <div>
      <div
        className="flex items-center cursor-pointer hover:bg-mac-tertiary/30 rounded px-1"
        style={{ paddingLeft: depth * 16 }}
        onClick={toggle}
      >
        {expanded ? <ChevronDown size={14} className="text-mac-secondary mr-1 shrink-0" /> : <ChevronRight size={14} className="text-mac-secondary mr-1 shrink-0" />}
        {keyDisplay}
        <span className="text-mac-tertiary text-xs">{label}</span>
      </div>
      {expanded && (
        <div>
          {entries.map(([k, v]) => (
            <JsonNode
              key={k}
              keyName={k}
              value={v}
              depth={depth + 1}
              expandAll={expandAll}
              searchTerm={searchTerm}
              matchCounter={matchCounter}
              activeMatchIndex={activeMatchIndex}
              matchIndex={null}
              onManualToggle={onManualToggle}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Database Tab ─────────────────────────────────────────────────

function DatabaseTab({ serviceName }: { serviceName: string }) {
  const [data, setData] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandAll, setExpandAll] = useState<boolean | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeMatchIndex, setActiveMatchIndex] = useState(0)
  const treeRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const state = await fetchState(serviceName)
      setData(state)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [serviceName])

  useEffect(() => { load() }, [load])

  // Count total matches in the JSON data
  const totalMatches = useMemo(() => {
    if (!searchTerm || !data) return 0
    function countInValue(val: unknown): number {
      if (val === null || val === undefined) return 0
      if (typeof val === 'string') return countMatches(val, searchTerm)
      if (typeof val === 'number') return countMatches(val.toString(), searchTerm)
      if (typeof val === 'boolean') return 0
      if (Array.isArray(val)) {
        return val.reduce((sum, v, i) => sum + countMatches(String(i), searchTerm) + countInValue(v), 0)
      }
      if (typeof val === 'object') {
        return Object.entries(val as Record<string, unknown>).reduce(
          (sum, [k, v]) => sum + countMatches(k, searchTerm) + countInValue(v), 0
        )
      }
      return 0
    }
    return countInValue(data)
  }, [data, searchTerm])

  // When searchTerm changes, expand all to show matches and reset active index
  useEffect(() => {
    if (searchTerm) {
      setExpandAll(true)
      setActiveMatchIndex(0)
    } else {
      setExpandAll(null)
    }
  }, [searchTerm])

  // Reset expandAll to null so individual node toggling works after bulk operation
  const handleManualToggle = useCallback(() => setExpandAll(null), [])

  // Scroll active match into view
  useEffect(() => {
    if (!treeRef.current || !searchTerm) return
    const el = treeRef.current.querySelector(`[data-match-index="${activeMatchIndex}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeMatchIndex, searchTerm, data])

  const goNext = () => {
    if (totalMatches > 0) setActiveMatchIndex(prev => (prev + 1) % totalMatches)
  }
  const goPrev = () => {
    if (totalMatches > 0) setActiveMatchIndex(prev => (prev - 1 + totalMatches) % totalMatches)
  }

  // Reset match counter before each render of the tree
  const matchCounter = useRef({ current: 0 })

  if (loading) return <div className="flex items-center justify-center h-full gap-2 text-mac-secondary"><Loader2 size={18} className="animate-spin" /> Loading database...</div>
  if (error) return <div className="p-4 text-red-500">Error: {error} <button onClick={load} className="ml-2 underline">Retry</button></div>

  // Reset counter at render time
  matchCounter.current = { current: 0 }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-2 border-b border-mac bg-mac-tertiary/30">
        <button
          onClick={load}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-mac-secondary/20 hover:bg-mac-secondary/40 text-mac-primary transition-colors"
          title="Refresh database state"
        >
          <RefreshCw size={13} /> Refresh
        </button>
        <button
          onClick={() => setExpandAll(prev => prev === true ? false : true)}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-mac-secondary/20 hover:bg-mac-secondary/40 text-mac-primary transition-colors"
          title={expandAll ? 'Collapse All' : 'Expand All'}
        >
          <ChevronsUpDown size={13} /> {expandAll ? 'Collapse All' : 'Expand All'}
        </button>
        <div className="flex-1" />
        <div className="relative flex items-center">
          <Search size={13} className="absolute left-2 text-mac-tertiary" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search..."
            className="pl-7 pr-2 py-1 text-xs rounded bg-mac-secondary border border-mac text-mac-primary w-48 focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="ml-1 text-mac-tertiary hover:text-mac-primary">
              <X size={13} />
            </button>
          )}
        </div>
        {searchTerm && totalMatches > 0 && (
          <div className="flex items-center gap-1 text-xs text-mac-secondary">
            <span>{activeMatchIndex + 1}/{totalMatches}</span>
            <button onClick={goPrev} className="p-0.5 rounded hover:bg-mac-secondary/40"><ChevronUp size={13} /></button>
            <button onClick={goNext} className="p-0.5 rounded hover:bg-mac-secondary/40"><ChevronDown size={13} /></button>
          </div>
        )}
        {searchTerm && totalMatches === 0 && (
          <span className="text-xs text-mac-tertiary">No matches</span>
        )}
      </div>
      {/* Tree */}
      <div ref={treeRef} className="flex-1 overflow-auto p-3 font-mono text-xs leading-5">
        <JsonNode
          keyName={null}
          value={data}
          depth={0}
          expandAll={expandAll}
          searchTerm={searchTerm}
          matchCounter={matchCounter.current}
          activeMatchIndex={activeMatchIndex}
          matchIndex={null}
          onManualToggle={handleManualToggle}
        />
      </div>
    </div>
  )
}

// ─── Tools Tab ────────────────────────────────────────────────────

function ToolCard({ tool, serviceName }: { tool: ToolDefinition; serviceName: string }) {
  const [expanded, setExpanded] = useState(false)
  const [paramValues, setParamValues] = useState<Record<string, string>>({})
  const [result, setResult] = useState<{ data?: unknown; error?: string } | null>(null)
  const [running, setRunning] = useState(false)
  const [resultView, setResultView] = useState<'raw' | 'tree'>('raw')
  const resultMatchCounter = useRef({ current: 0 })

  const properties = tool.parameters?.properties || {}
  const required = tool.parameters?.required || []
  const paramEntries = Object.entries(properties)

  const setParam = (key: string, value: string) => {
    setParamValues(prev => ({ ...prev, [key]: value }))
  }

  const run = async () => {
    setRunning(true)
    setResult(null)
    try {
      // Build params with proper types
      const params: Record<string, unknown> = {}
      for (const [key, schema] of paramEntries) {
        const raw = paramValues[key]
        if (raw === undefined || raw === '') continue
        if (schema.type === 'number' || schema.type === 'integer') {
          const num = Number(raw)
          if (!isNaN(num)) params[key] = num
        } else if (schema.type === 'boolean') {
          params[key] = raw === 'true'
        } else if (schema.type === 'array' || schema.type === 'object') {
          try { params[key] = JSON.parse(raw) } catch { params[key] = raw }
        } else {
          params[key] = raw
        }
      }
      const data = await executeTool(serviceName, tool.name, params)
      setResult({ data })
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setRunning(false)
    }
  }

  // Reset match counter before each render of the tree
  resultMatchCounter.current = { current: 0 }

  return (
    <div className="border border-mac rounded-lg overflow-hidden bg-mac-secondary/50">
      <div
        className="flex items-center gap-2 p-3 cursor-pointer hover:bg-mac-tertiary/30 transition-colors"
        onClick={() => setExpanded(prev => !prev)}
      >
        {expanded ? <ChevronDown size={14} className="text-mac-secondary shrink-0" /> : <ChevronRight size={14} className="text-mac-secondary shrink-0" />}
        <div className="flex-1 min-w-0">
          <span className="font-mono text-sm font-semibold text-mac-primary">{tool.name}</span>
          {tool.description && <p className="text-xs text-mac-secondary mt-0.5">{tool.description}</p>}
        </div>
        <span className="text-xs text-mac-tertiary shrink-0">{paramEntries.length} param{paramEntries.length !== 1 ? 's' : ''}</span>
      </div>
      {expanded && (
        <div className="border-t border-mac p-3 space-y-3">
          {paramEntries.length === 0 && (
            <p className="text-xs text-mac-tertiary italic">No parameters</p>
          )}
          {paramEntries.map(([key, schema]) => {
            const isRequired = required.includes(key)
            return (
              <div key={key} className="space-y-1">
                <div className="flex items-center gap-1">
                  <label className="text-xs font-mono font-medium text-mac-primary">{key}</label>
                  <span className="text-[10px] text-mac-tertiary">({schema.type})</span>
                  {isRequired && <span className="text-[10px] text-red-500 font-medium">required</span>}
                </div>
                {schema.description && <p className="text-[11px] text-mac-secondary">{schema.description}</p>}
                {schema.enum ? (
                  <select
                    value={paramValues[key] || ''}
                    onChange={e => setParam(key, e.target.value)}
                    className="w-full text-xs px-2 py-1.5 rounded border border-mac bg-mac-secondary text-mac-primary focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
                  >
                    <option value="">-- Select --</option>
                    {schema.enum.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                ) : schema.type === 'boolean' ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={paramValues[key] === 'true'}
                      onChange={e => setParam(key, e.target.checked ? 'true' : 'false')}
                      className="rounded"
                    />
                    <span className="text-xs text-mac-secondary">{paramValues[key] === 'true' ? 'true' : 'false'}</span>
                  </div>
                ) : schema.type === 'number' || schema.type === 'integer' ? (
                  <input
                    type="number"
                    value={paramValues[key] || ''}
                    onChange={e => setParam(key, e.target.value)}
                    placeholder={schema.default !== undefined ? String(schema.default) : ''}
                    className="w-full text-xs px-2 py-1.5 rounded border border-mac bg-mac-secondary text-mac-primary focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
                  />
                ) : schema.type === 'array' || schema.type === 'object' ? (
                  <textarea
                    value={paramValues[key] || ''}
                    onChange={e => setParam(key, e.target.value)}
                    placeholder="JSON value..."
                    rows={3}
                    className="w-full text-xs font-mono px-2 py-1.5 rounded border border-mac bg-mac-secondary text-mac-primary focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)] resize-y"
                  />
                ) : (
                  <input
                    type="text"
                    value={paramValues[key] || ''}
                    onChange={e => setParam(key, e.target.value)}
                    placeholder={schema.default !== undefined ? String(schema.default) : ''}
                    className="w-full text-xs px-2 py-1.5 rounded border border-mac bg-mac-secondary text-mac-primary focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
                  />
                )}
              </div>
            )
          })}
          <button
            onClick={run}
            disabled={running}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-accent-mac text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
            {running ? 'Running...' : 'Run'}
          </button>
          {result && (
            <div className="mt-2">
              {result.error ? (
                <div className="rounded p-2 text-xs font-mono bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <span className="text-red-600 dark:text-red-400">Error: {result.error}</span>
                </div>
              ) : (
                <div>
                  <div className="flex gap-1 mb-1">
                    <button
                      onClick={() => setResultView('raw')}
                      className={`px-2 py-0.5 text-[11px] rounded ${resultView === 'raw' ? 'bg-[var(--accent-color)] text-white' : 'bg-mac-secondary/20 text-mac-secondary hover:bg-mac-secondary/40'}`}
                    >
                      Raw JSON
                    </button>
                    <button
                      onClick={() => setResultView('tree')}
                      className={`px-2 py-0.5 text-[11px] rounded ${resultView === 'tree' ? 'bg-[var(--accent-color)] text-white' : 'bg-mac-secondary/20 text-mac-secondary hover:bg-mac-secondary/40'}`}
                    >
                      Structured
                    </button>
                  </div>
                  <div className="rounded p-2 text-xs font-mono overflow-auto max-h-60 bg-mac-tertiary/30 border border-mac">
                    {resultView === 'raw' ? (
                      <pre className="text-mac-primary whitespace-pre-wrap break-words">{JSON.stringify(result.data, null, 2)}</pre>
                    ) : (
                      <JsonNode
                        keyName={null}
                        value={result.data}
                        depth={0}
                        expandAll={null}
                        searchTerm=""
                        matchCounter={resultMatchCounter.current}
                        activeMatchIndex={-1}
                        matchIndex={null}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ToolsTab({ serviceName }: { serviceName: string }) {
  const [tools, setTools] = useState<ToolDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    setLoading(true)
    fetchServiceInfo(serviceName)
      .then(info => setTools(info.tools || []))
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [serviceName])

  const filtered = useMemo(() => {
    if (!searchTerm) return tools
    const lower = searchTerm.toLowerCase()
    return tools.filter(t =>
      t.name.toLowerCase().includes(lower) ||
      (t.description || '').toLowerCase().includes(lower)
    )
  }, [tools, searchTerm])

  if (loading) return <div className="flex items-center justify-center h-full gap-2 text-mac-secondary"><Loader2 size={18} className="animate-spin" /> Loading tools...</div>
  if (error) return <div className="p-4 text-red-500">Error: {error}</div>

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-2 border-b border-mac bg-mac-tertiary/30">
        <div className="relative flex items-center flex-1">
          <Search size={13} className="absolute left-2 text-mac-tertiary" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Filter tools..."
            className="w-full pl-7 pr-2 py-1 text-xs rounded bg-mac-secondary border border-mac text-mac-primary focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-2 text-mac-tertiary hover:text-mac-primary">
              <X size={13} />
            </button>
          )}
        </div>
        <span className="text-xs text-mac-tertiary whitespace-nowrap">{filtered.length} of {tools.length} tools</span>
      </div>
      <div className="flex-1 overflow-auto p-3 space-y-2">
        {filtered.length === 0 && (
          <p className="text-center text-sm text-mac-tertiary py-8">No tools found</p>
        )}
        {filtered.map(tool => (
          <ToolCard key={tool.name} tool={tool} serviceName={serviceName} />
        ))}
      </div>
    </div>
  )
}

// ─── Main AdminPanel ──────────────────────────────────────────────

export function AdminPanel({ serviceName, onClose, onRefreshApp }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<'database' | 'tools'>('database')

  return (
    <div className="flex flex-col h-full bg-mac-secondary text-mac-primary">
      {/* Tab bar */}
      <div className="flex items-center border-b border-mac bg-mac-tertiary/20">
        <button
          onClick={() => setActiveTab('database')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'database'
              ? 'border-[var(--accent-color)] text-[var(--accent-color)]'
              : 'border-transparent text-mac-secondary hover:text-mac-primary'
          }`}
        >
          <Database size={14} /> Database
        </button>
        <button
          onClick={() => setActiveTab('tools')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'tools'
              ? 'border-[var(--accent-color)] text-[var(--accent-color)]'
              : 'border-transparent text-mac-secondary hover:text-mac-primary'
          }`}
        >
          <Wrench size={14} /> Tools
        </button>
        <div className="flex-1" />
        {onRefreshApp && (
          <button
            onClick={onRefreshApp}
            className="flex items-center gap-1 px-2 py-1 mr-2 text-[11px] rounded bg-mac-secondary/20 hover:bg-mac-secondary/40 text-mac-secondary transition-colors"
            title="Refresh the parent app"
          >
            <RefreshCw size={11} /> Refresh App
          </button>
        )}
      </div>
      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'database' ? (
          <DatabaseTab serviceName={serviceName} />
        ) : (
          <ToolsTab serviceName={serviceName} />
        )}
      </div>
    </div>
  )
}
