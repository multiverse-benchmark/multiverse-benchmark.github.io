import { useState, useEffect } from 'react'
import { useBackendAPI } from '@shared/hooks/useBackendAPI'

interface AppProps {
  onClose: () => void
  setRefreshHandler?: (handler: (() => void) | null) => void
}

interface LogInfo {
  runtime_id: string
  log_file_path: string
  log_file_exists: boolean
  log_file_size: number | null
}

interface AuthStatus {
  global_auth_enabled: boolean
  service_count: number
  services: Record<string, any>
}

interface ErrorManagerStatus {
  has_active_config: boolean
  config_info: any | null
}

interface FrameworkStatus {
  is_active: boolean
  config_path: string
  applied_paths: string[]
}

interface EnvironmentInfo {
  os_type: string
  package_manager: string | null
}

interface ToolCheckResult {
  tool_name: string
  installed: boolean
  path: string | null
}

// Status badge component
const StatusBadge = ({ active, activeText = 'Active', inactiveText = 'Inactive' }: { active: boolean, activeText?: string, inactiveText?: string }) => (
  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
    active
      ? 'bg-emerald-500/20 text-emerald-400'
      : 'bg-zinc-500/20 text-zinc-400'
  }`}>
    {active ? activeText : inactiveText}
  </span>
)

// Card component for consistent styling
const Card = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => (
  <div className={`bg-white/[0.03] backdrop-blur-sm rounded-xl p-5 ${className}`}>
    {children}
  </div>
)

// Section header
const SectionHeader = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-base font-medium text-[var(--text-primary)] mb-4 flex items-center gap-2">
    {children}
  </h2>
)

// Info row component
const InfoRow = ({ label, children, mono = false }: { label: string, children: React.ReactNode, mono?: boolean }) => (
  <div className="flex justify-between items-center py-2 border-b border-white/[0.04] last:border-0">
    <span className="text-[var(--text-secondary)] text-sm">{label}</span>
    <span className={`text-[var(--text-primary)] text-sm ${mono ? 'font-mono text-xs' : ''}`}>
      {children}
    </span>
  </div>
)

export default function CommonUtilsApp({ setRefreshHandler }: AppProps) {
  const api = useBackendAPI('common_utils')

  // State for different sections
  const [activeTab, setActiveTab] = useState<'logging' | 'auth' | 'error' | 'framework' | 'tools'>('logging')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [backendAvailable, setBackendAvailable] = useState(true)

  // Logging state
  const [logInfo, setLogInfo] = useState<LogInfo | null>(null)
  const [newRuntimeId, setNewRuntimeId] = useState('')

  // Auth state
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null)

  // Error manager state
  const [errorManagerStatus, setErrorManagerStatus] = useState<ErrorManagerStatus | null>(null)

  // Framework state
  const [frameworkStatus, setFrameworkStatus] = useState<FrameworkStatus | null>(null)

  // Tool installation state
  const [environmentInfo, setEnvironmentInfo] = useState<EnvironmentInfo | null>(null)
  const [toolName, setToolName] = useState('')
  const [toolCheckResult, setToolCheckResult] = useState<ToolCheckResult | null>(null)
  const [installCommand, setInstallCommand] = useState<string | null>(null)

  // Load data functions
  const loadLogInfo = async () => {
    try {
      const result = await api.callTool<LogInfo>('get_log_info', {})
      setLogInfo(result)
      setError(null)
      setBackendAvailable(true)
    } catch (err) {
      setError(`Backend unavailable: ${err}`)
      setBackendAvailable(false)
    }
  }

  const loadAuthStatus = async () => {
    try {
      const result = await api.callTool<AuthStatus>('get_auth_status', {})
      setAuthStatus(result)
      setError(null)
      setBackendAvailable(true)
    } catch (err) {
      setError(`Backend unavailable: ${err}`)
      setBackendAvailable(false)
    }
  }

  const loadErrorManagerStatus = async () => {
    try {
      const result = await api.callTool<ErrorManagerStatus>('get_error_manager_status', {})
      setErrorManagerStatus(result)
      setError(null)
      setBackendAvailable(true)
    } catch (err) {
      setError(`Backend unavailable: ${err}`)
      setBackendAvailable(false)
    }
  }

  const loadFrameworkStatus = async () => {
    try {
      const result = await api.callTool<FrameworkStatus>('get_framework_status', {})
      setFrameworkStatus(result)
      setError(null)
      setBackendAvailable(true)
    } catch (err) {
      setError(`Backend unavailable: ${err}`)
      setBackendAvailable(false)
    }
  }

  const loadEnvironmentInfo = async () => {
    try {
      const result = await api.callTool<EnvironmentInfo>('get_environment_info', {})
      setEnvironmentInfo(result)
      setError(null)
      setBackendAvailable(true)
    } catch (err) {
      setError(`Backend unavailable: ${err}`)
      setBackendAvailable(false)
    }
  }

  const loadAllData = async () => {
    setLoading(true)
    try {
      switch (activeTab) {
        case 'logging':
          await loadLogInfo()
          break
        case 'auth':
          await loadAuthStatus()
          break
        case 'error':
          await loadErrorManagerStatus()
          break
        case 'framework':
          await loadFrameworkStatus()
          break
        case 'tools':
          await loadEnvironmentInfo()
          break
      }
    } finally {
      setLoading(false)
    }
  }

  // Action handlers
  const handleSetRuntimeId = async () => {
    if (!newRuntimeId.trim()) {
      setError('Please enter a runtime ID')
      return
    }

    setLoading(true)
    try {
      await api.callTool('set_logging_runtime_id', { runtime_id: newRuntimeId })
      setNewRuntimeId('')
      await loadLogInfo()
      setError(null)
    } catch (err) {
      setError(`Failed to set runtime ID: ${err}`)
    } finally {
      setLoading(false)
    }
  }

  const handleClearLog = async () => {
    setLoading(true)
    try {
      await api.callTool('clear_current_log', {})
      await loadLogInfo()
      setError(null)
    } catch (err) {
      setError(`Failed to clear log: ${err}`)
    } finally {
      setLoading(false)
    }
  }

  const handleCheckTool = async () => {
    if (!toolName.trim()) {
      setError('Please enter a tool name')
      return
    }

    setLoading(true)
    try {
      const result = await api.callTool<ToolCheckResult>('check_tool', { tool_name: toolName })
      setToolCheckResult(result)
      setError(null)
    } catch (err) {
      setError(`Failed to check tool: ${err}`)
    } finally {
      setLoading(false)
    }
  }

  const handleGetInstallCommand = async () => {
    if (!toolName.trim()) {
      setError('Please enter a tool name')
      return
    }

    setLoading(true)
    try {
      const result = await api.callTool<{ command: string | null; message: string }>('get_tool_install_command', { tool_name: toolName })
      setInstallCommand(result.command)
      setError(null)
    } catch (err) {
      setError(`Failed to get install command: ${err}`)
    } finally {
      setLoading(false)
    }
  }

  // Load data on mount and tab change
  useEffect(() => {
    loadAllData()
  }, [activeTab])

  // Register refresh handler
  useEffect(() => {
    if (setRefreshHandler) {
      setRefreshHandler(loadAllData)
    }
    return () => {
      if (setRefreshHandler) setRefreshHandler(null)
    }
  }, [activeTab])

  const formatBytes = (bytes: number | null) => {
    if (bytes === null) return 'N/A'
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const tabs = [
    { id: 'logging', label: 'Logging', icon: '📋' },
    { id: 'auth', label: 'Auth', icon: '🔐' },
    { id: 'error', label: 'Errors', icon: '⚠️' },
    { id: 'framework', label: 'Framework', icon: '⚙️' },
    { id: 'tools', label: 'Tools', icon: '🔧' }
  ]

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-[var(--bg-primary)] to-[#0a0a0f]">
      {/* Header */}
      <div className="px-5 pt-5 pb-4">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Common Utils</h1>
        <p className="text-xs text-[var(--text-secondary)] mt-0.5 opacity-70">
          Framework utilities & monitoring
        </p>
        {!backendAvailable && (
          <div className="mt-2 px-2.5 py-1.5 bg-amber-500/10 rounded-lg text-xs text-amber-400 inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Backend unavailable
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-5 pb-4">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              activeTab === tab.id
                ? 'bg-white/10 text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.03]'
            }`}
          >
            <span className="mr-1.5">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error display */}
      {error && (
        <div className="mx-5 mb-4 px-3 py-2 bg-red-500/10 rounded-lg text-red-400 text-xs">
          {error}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto px-5 pb-5">
        {loading && !logInfo && !authStatus && !errorManagerStatus && !frameworkStatus && !environmentInfo ? (
          <div className="flex items-center justify-center h-full text-[var(--text-secondary)] text-sm">
            <div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin mr-2" />
            Loading...
          </div>
        ) : (
          <div className="space-y-4 max-w-2xl">
            {/* Logging Tab */}
            {activeTab === 'logging' && (
              <>
                <Card>
                  <SectionHeader>Current Log Info</SectionHeader>
                  {logInfo ? (
                    <div>
                      <InfoRow label="Runtime ID" mono>{logInfo.runtime_id}</InfoRow>
                      <InfoRow label="Log File" mono>
                        <span className="max-w-[280px] truncate block" title={logInfo.log_file_path}>
                          {logInfo.log_file_path}
                        </span>
                      </InfoRow>
                      <InfoRow label="File Exists">
                        <StatusBadge active={logInfo.log_file_exists} activeText="Yes" inactiveText="No" />
                      </InfoRow>
                      <InfoRow label="File Size">{formatBytes(logInfo.log_file_size)}</InfoRow>
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--text-secondary)] opacity-60">
                      Cannot load log information
                    </p>
                  )}
                </Card>

                <Card>
                  <SectionHeader>Set Runtime ID</SectionHeader>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newRuntimeId}
                      onChange={(e) => setNewRuntimeId(e.target.value)}
                      placeholder="Enter new runtime ID"
                      disabled={!backendAvailable}
                      className="flex-1 px-3 py-2 bg-white/[0.03] rounded-lg text-[var(--text-primary)] text-sm placeholder:text-[var(--text-secondary)]/40 focus:outline-none focus:ring-1 focus:ring-white/20 disabled:opacity-40"
                    />
                    <button
                      onClick={handleSetRuntimeId}
                      disabled={loading || !backendAvailable}
                      className="px-4 py-2 bg-indigo-500/80 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:hover:bg-indigo-500/80"
                    >
                      Set
                    </button>
                  </div>
                </Card>

                <Card>
                  <SectionHeader>Clear Log</SectionHeader>
                  <button
                    onClick={handleClearLog}
                    disabled={loading || !backendAvailable}
                    className="px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                  >
                    Clear Current Log
                  </button>
                </Card>
              </>
            )}

            {/* Authentication Tab */}
            {activeTab === 'auth' && (
              <>
                <Card>
                  <SectionHeader>Authentication Status</SectionHeader>
                  {authStatus ? (
                    <div>
                      <InfoRow label="Global Auth">
                        <StatusBadge active={authStatus.global_auth_enabled} activeText="Enabled" inactiveText="Disabled" />
                      </InfoRow>
                      <InfoRow label="Configured Services">{authStatus.service_count}</InfoRow>
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--text-secondary)] opacity-60">
                      Cannot load authentication status
                    </p>
                  )}
                </Card>

                {authStatus && authStatus.service_count > 0 && (
                  <Card>
                    <SectionHeader>Service Configurations</SectionHeader>
                    <div className="space-y-2">
                      {Object.entries(authStatus.services).map(([serviceName, config]) => (
                        <div key={serviceName} className="p-3 bg-white/[0.02] rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-sm text-[var(--text-primary)]">{serviceName}</span>
                            <StatusBadge active={config.authentication_enabled} activeText="Auth On" inactiveText="Auth Off" />
                          </div>
                          <div className="text-xs text-[var(--text-secondary)] space-y-1">
                            <div className="flex justify-between">
                              <span>Authenticated</span>
                              <span className={config.is_authenticated ? 'text-emerald-400' : 'text-zinc-500'}>
                                {config.is_authenticated ? 'Yes' : 'No'}
                              </span>
                            </div>
                            {config.excluded_functions?.length > 0 && (
                              <div className="pt-1 border-t border-white/[0.04]">
                                <span className="text-[var(--text-secondary)]/60">Excluded: </span>
                                <span className="font-mono">{config.excluded_functions.join(', ')}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </>
            )}

            {/* Error Manager Tab */}
            {activeTab === 'error' && (
              <Card>
                <SectionHeader>Error Manager Status</SectionHeader>
                {errorManagerStatus ? (
                  <div>
                    <InfoRow label="Active Config">
                      <StatusBadge active={errorManagerStatus.has_active_config} activeText="Yes" inactiveText="No" />
                    </InfoRow>
                    {errorManagerStatus.config_info && (
                      <>
                        <InfoRow label="Previous Config">
                          <StatusBadge active={errorManagerStatus.config_info.has_previous_config} activeText="Yes" inactiveText="No" />
                        </InfoRow>
                        <InfoRow label="Service Count">{errorManagerStatus.config_info.service_count}</InfoRow>
                      </>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-[var(--text-secondary)] opacity-60">
                    Cannot load error manager status
                  </p>
                )}
              </Card>
            )}

            {/* Framework Tab */}
            {activeTab === 'framework' && (
              <>
                <Card>
                  <SectionHeader>Framework Status</SectionHeader>
                  {frameworkStatus ? (
                    <div>
                      <InfoRow label="Status">
                        <StatusBadge active={frameworkStatus.is_active} />
                      </InfoRow>
                      <InfoRow label="Config Path" mono>
                        <span className="max-w-[280px] truncate block" title={frameworkStatus.config_path || 'Not set'}>
                          {frameworkStatus.config_path || 'Not set'}
                        </span>
                      </InfoRow>
                      <InfoRow label="Applied Paths">{frameworkStatus.applied_paths.length}</InfoRow>
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--text-secondary)] opacity-60">
                      Cannot load framework status
                    </p>
                  )}
                </Card>

                {frameworkStatus && frameworkStatus.applied_paths.length > 0 && (
                  <Card>
                    <SectionHeader>Applied Configuration Paths</SectionHeader>
                    <div className="space-y-1">
                      {frameworkStatus.applied_paths.map((path, index) => (
                        <div key={index} className="px-2 py-1.5 bg-white/[0.02] rounded text-xs font-mono text-[var(--text-secondary)] truncate">
                          {path}
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </>
            )}

            {/* Tools Tab */}
            {activeTab === 'tools' && (
              <>
                <Card>
                  <SectionHeader>Environment</SectionHeader>
                  {environmentInfo ? (
                    <div>
                      <InfoRow label="OS Type">
                        <span className="capitalize">{environmentInfo.os_type}</span>
                      </InfoRow>
                      <InfoRow label="Package Manager">
                        <span className="capitalize">{environmentInfo.package_manager || 'None detected'}</span>
                      </InfoRow>
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--text-secondary)] opacity-60">
                      Cannot load environment info
                    </p>
                  )}
                </Card>

                <Card>
                  <SectionHeader>Check Tool Installation</SectionHeader>
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={toolName}
                        onChange={(e) => setToolName(e.target.value)}
                        placeholder="Tool name (e.g., git, docker)"
                        disabled={!backendAvailable}
                        className="flex-1 px-3 py-2 bg-white/[0.03] rounded-lg text-[var(--text-primary)] text-sm placeholder:text-[var(--text-secondary)]/40 focus:outline-none focus:ring-1 focus:ring-white/20 disabled:opacity-40"
                      />
                      <button
                        onClick={handleCheckTool}
                        disabled={loading || !backendAvailable}
                        className="px-4 py-2 bg-indigo-500/80 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                      >
                        Check
                      </button>
                      <button
                        onClick={handleGetInstallCommand}
                        disabled={loading || !backendAvailable}
                        className="px-3 py-2 bg-white/[0.06] hover:bg-white/10 text-[var(--text-primary)] rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                      >
                        Install Cmd
                      </button>
                    </div>

                    {toolCheckResult && (
                      <div className="p-3 bg-white/[0.02] rounded-lg">
                        <InfoRow label="Tool" mono>{toolCheckResult.tool_name}</InfoRow>
                        <InfoRow label="Installed">
                          <StatusBadge active={toolCheckResult.installed} activeText="Yes" inactiveText="No" />
                        </InfoRow>
                        {toolCheckResult.path && (
                          <InfoRow label="Path" mono>
                            <span className="max-w-[200px] truncate block" title={toolCheckResult.path}>
                              {toolCheckResult.path}
                            </span>
                          </InfoRow>
                        )}
                      </div>
                    )}

                    {installCommand && (
                      <div className="p-3 bg-black/30 rounded-lg">
                        <div className="text-xs text-[var(--text-secondary)] mb-2">Installation Command</div>
                        <code className="block text-xs font-mono text-emerald-400 break-all">
                          {installCommand}
                        </code>
                      </div>
                    )}
                  </div>
                </Card>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
