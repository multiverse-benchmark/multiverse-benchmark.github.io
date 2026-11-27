import { useState, useEffect, useRef, useCallback } from 'react'
import { useBackendAPI } from '@shared/hooks/useBackendAPI'
import { useReadOnly } from '@shared/contexts/ReadOnlyContext'

interface Alarm {
  alarm_id: string
  label: string
  time_of_day: string
  state: string
  recurrence: string
  date: string
}

interface Timer {
  timer_id: string
  label: string
  duration: string
  state: string
  remaining_duration: string
}

interface WorldClock {
  clock_id?: string
  label: string
  time_of_day?: string
  type: string
}

type Tab = 'alarms' | 'timers' | 'stopwatch' | 'worldclock'

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

const WORLD_CLOCKS_STORAGE_KEY = 'multiverse_clock_world_clocks'

export default function ClockApp({ setRefreshHandler }: AppProps) {
  const [activeTab, setActiveTab] = useState<Tab>('alarms')
  const [alarms, setAlarms] = useState<Alarm[]>([])
  const [timers, setTimers] = useState<Timer[]>([])
  const [worldClocks, setWorldClocks] = useState<WorldClock[]>(() => {
    try {
      const stored = localStorage.getItem(WORLD_CLOCKS_STORAGE_KEY)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const loadDataRef = useRef<() => void>(() => {})

  useEffect(() => {
    try {
      localStorage.setItem(WORLD_CLOCKS_STORAGE_KEY, JSON.stringify(worldClocks))
    } catch { /* quota exceeded or unavailable */ }
  }, [worldClocks])

  const api = useBackendAPI('clock')

  const refreshApp = useCallback(() => {
    loadDataRef.current()
  }, [])

  useEffect(() => {
    if (setRefreshHandler) {
      setRefreshHandler(refreshApp)
    }
    return () => {
      if (setRefreshHandler) setRefreshHandler(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshApp])

  useEffect(() => {
    loadDataRef.current = loadData
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [alarmsResult, timersResult] = await Promise.all([
        api.callTool<{ alarm?: Alarm[] }>('show_matching_alarms', {}),
        api.callTool<{ timer?: Timer[] }>('show_matching_timers', {}),
      ])

      setAlarms(alarmsResult?.alarm || [])
      const timerList = (timersResult?.timer || []).map((t: any) => ({
        ...t,
        duration: t.duration || t.original_duration || '',
      }))
      setTimers(timerList)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const toggleAlarmState = async (alarmId: string, currentState: string) => {
    const stateOperation = currentState === 'DISABLED' ? 'ENABLE' : 'DISABLE'
    try {
      await api.callTool('modify_alarm_v2', {
        filters: { alarm_ids: [alarmId] },
        modifications: { state_operation: stateOperation },
      })
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update alarm')
    }
  }

  const deleteAlarm = async (alarmId: string) => {
    try {
      await api.callTool('change_alarm_state', {
        state_operation: 'DELETE',
        alarm_ids: [alarmId],
      })
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete alarm')
    }
  }

  const createAlarm = async (params: { time?: string; label?: string; recurrence?: string[] }) => {
    try {
      await api.callTool('create_alarm', params)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create alarm')
    }
  }

  const editAlarm = async (alarmId: string, params: { new_time_of_day?: string; new_label?: string; new_recurrence?: string[] }) => {
    try {
      // Use modify_alarm (v1) for direct field updates
      await api.callTool('modify_alarm', {
        alarm_ids: [alarmId],
        ...params,
      })
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to modify alarm')
    }
  }

  const editAlarmV2 = async (alarmId: string, modifications: Record<string, unknown>) => {
    try {
      await api.callTool('modify_alarm_v2', {
        filters: { alarm_ids: [alarmId] },
        modifications,
      })
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to modify alarm')
    }
  }

  const [snoozeMessage, setSnoozeMessage] = useState<string | null>(null)

  const snoozeAlarm = async (alarmId: string, duration: string = '600') => {
    try {
      setSnoozeMessage(null)
      // First try snooze_alarm API (works for firing alarms with duration)
      const result = await api.callTool<{ message?: string }>('snooze_alarm', { snooze_duration: duration })
      // If no firing alarms were found, fall back to change_alarm_state with SNOOZE
      if (result?.message?.includes('No firing alarms')) {
        const stateResult = await api.callTool<{ message?: string }>('change_alarm_state', {
          state_operation: 'SNOOZE',
          alarm_ids: [alarmId],
        })
        if (stateResult?.message) setSnoozeMessage(stateResult.message)
      } else if (result?.message) {
        setSnoozeMessage(result.message)
      }
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to snooze')
    }
  }

  const createTimer = async (params: { duration?: string; label?: string }) => {
    try {
      await api.callTool('create_timer', params)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create timer')
    }
  }

  const editTimer = async (timerId: string, params: { new_duration?: string; new_label?: string }) => {
    try {
      await api.callTool('modify_timer', {
        timer_ids: [timerId],
        ...params,
      })
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to modify timer')
    }
  }

  const editTimerV2 = async (timerId: string, modifications: Record<string, unknown>) => {
    try {
      await api.callTool('modify_timer_v2', {
        filters: { timer_ids: [timerId] },
        modifications,
      })
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to modify timer')
    }
  }

  const changeTimerState = async (timerId: string, stateOperation: string) => {
    try {
      await api.callTool('change_timer_state', {
        state_operation: stateOperation,
        timer_ids: [timerId],
      })
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change timer state')
    }
  }

  const createWorldClock = async (params: { label?: string; timezone?: string }) => {
    setWorldClocks(prev => [...prev, {
      label: params.label || 'World Clock',
      type: 'WORLD_CLOCK',
      time_of_day: params.timezone,
    }])
  }

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'alarms', label: 'Alarms', icon: '\u23f0' },
    { id: 'timers', label: 'Timers', icon: '\u23f1' },
    { id: 'stopwatch', label: 'Stopwatch', icon: '\u23f1' },
    { id: 'worldclock', label: 'World Clock', icon: '\ud83c\udf0d' },
  ]

  return (
    <div className="h-full flex flex-col bg-[var(--bg-primary)]">
      {/* Tab bar */}
      <div className="p-3 bg-[var(--bg-secondary)] border-b border-[var(--border-color)]">
        <div className="flex bg-[var(--bg-tertiary)] rounded-lg p-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                activeTab === tab.id
                  ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="mr-1.5">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 bg-[var(--bg-primary)]">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-4 border-[var(--accent-color)]/30 border-t-[var(--accent-color)] rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <p className="text-[var(--danger-color)]">{error}</p>
            <button
              className="px-4 py-2 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-colors font-medium"
              onClick={loadData}
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {activeTab === 'alarms' && (
              <AlarmsTab
                alarms={alarms}
                onToggle={toggleAlarmState}
                onDelete={deleteAlarm}
                onCreate={createAlarm}
                onEdit={editAlarm}
                onEditV2={editAlarmV2}
                onSnoozeAlarm={snoozeAlarm}
                snoozeMessage={snoozeMessage}
                onDismissSnoozeMessage={() => setSnoozeMessage(null)}
              />
            )}
            {activeTab === 'timers' && (
              <TimersTab
                timers={timers}
                onCreate={createTimer}
                onEdit={editTimer}
                onEditV2={editTimerV2}
                onChangeState={changeTimerState}
              />
            )}
            {activeTab === 'stopwatch' && (
              <StopwatchTab api={api} />
            )}
            {activeTab === 'worldclock' && (
              <WorldClockTab
                clocks={worldClocks}
                onCreate={createWorldClock}
              />
            )}
          </>
        )}
      </div>

      {/* Refresh button */}
      <div className="p-3 bg-[var(--bg-secondary)] border-t border-[var(--border-color)]">
        <button
          className="w-full px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--border-color)] rounded-lg transition-colors text-sm font-medium text-[var(--text-primary)]"
          onClick={loadData}
        >
          Refresh
        </button>
      </div>
    </div>
  )
}

// ─── Alarms Tab ──────────────────────────────────────────────────────────────

interface AlarmsTabProps {
  alarms: Alarm[]
  onToggle: (id: string, state: string) => void
  onDelete: (id: string) => void
  onCreate: (params: { time?: string; label?: string; recurrence?: string[] }) => void
  onEdit: (id: string, params: { new_time_of_day?: string; new_label?: string; new_recurrence?: string[] }) => void
  onEditV2: (id: string, modifications: Record<string, unknown>) => void
  onSnoozeAlarm: (alarmId: string, duration?: string) => void
  snoozeMessage?: string | null
  onDismissSnoozeMessage?: () => void
}

function AlarmsTab({ alarms, onToggle, onDelete, onCreate, onEdit, onEditV2, onSnoozeAlarm, snoozeMessage, onDismissSnoozeMessage }: AlarmsTabProps) {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingAlarm, setEditingAlarm] = useState<Alarm | null>(null)
  const editFormRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (editingAlarm && editFormRef.current) {
      editFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [editingAlarm])

  return (
    <div className="space-y-3">
      {/* Snooze feedback message */}
      {snoozeMessage && (
        <div className="p-3 bg-[var(--accent-color)]/10 border border-[var(--accent-color)]/30 rounded-xl flex items-center justify-between">
          <span className="text-sm text-[var(--text-primary)]">{snoozeMessage}</span>
          <button
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] ml-2"
            onClick={onDismissSnoozeMessage}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Create Alarm Button */}
      <button
        className="w-full px-4 py-3 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-xl transition-colors font-medium text-sm"
        onClick={() => setShowCreateForm(!showCreateForm)}
      >
        {showCreateForm ? 'Cancel' : '+ Create Alarm'}
      </button>

      {/* Create Alarm Form */}
      {showCreateForm && (
        <CreateAlarmForm
          onSubmit={(params) => {
            onCreate(params)
            setShowCreateForm(false)
          }}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {alarms.length === 0 && !showCreateForm ? (
        <div className="flex flex-col items-center justify-center py-16 text-[var(--text-secondary)]">
          <span className="text-5xl mb-3">{'\u23f0'}</span>
          <p className="text-lg">No alarms set</p>
        </div>
      ) : (
        alarms.map(alarm => (
          <div key={alarm.alarm_id}>
            {/* Inline Edit Alarm Form - shown directly above the alarm being edited */}
            {editingAlarm?.alarm_id === alarm.alarm_id && (
              <div ref={editFormRef} className="mb-3">
                <EditAlarmForm
                  alarm={editingAlarm}
                  onSubmit={(params) => {
                    onEdit(editingAlarm.alarm_id, params)
                    setEditingAlarm(null)
                  }}
                  onSubmitV2={(modifications) => {
                    onEditV2(editingAlarm.alarm_id, modifications)
                    setEditingAlarm(null)
                  }}
                  onCancel={() => setEditingAlarm(null)}
                />
              </div>
            )}
            <div
              className={`p-4 rounded-xl border shadow-sm transition-all ${
                alarm.state === 'DISABLED'
                  ? 'bg-[var(--bg-tertiary)]/50 border-[var(--border-color)] opacity-60'
                  : 'bg-[var(--bg-secondary)] border-[var(--border-color)]'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="text-3xl font-light text-[var(--text-primary)] tabular-nums">{alarm.time_of_day}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{alarm.alarm_id}]</span></div>
                  <div className="text-sm text-[var(--text-secondary)] mt-1">{alarm.label}</div>
                  {alarm.recurrence && (
                    <div className="text-xs text-[var(--text-tertiary)] mt-1">{alarm.recurrence}</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                      alarm.state === 'DISABLED'
                        ? 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--border-color)]'
                        : 'bg-[var(--success-color)] text-white hover:brightness-110'
                    }`}
                    onClick={() => onToggle(alarm.alarm_id, alarm.state)}
                  >
                    {alarm.state === 'DISABLED' ? 'Off' : 'On'}
                  </button>
                </div>
              </div>
              {/* Action buttons */}
              <div className="flex gap-2 mt-3 pt-3 border-t border-[var(--border-color)]">
                <button
                  className="px-3 py-1.5 text-xs font-medium bg-[var(--bg-tertiary)] hover:bg-[var(--border-color)] text-[var(--text-primary)] rounded-lg transition-colors"
                  onClick={() => setEditingAlarm(alarm)}
                >
                  Edit
                </button>
                <button
                  className="px-3 py-1.5 text-xs font-medium bg-[var(--warning-color)]/20 hover:bg-[var(--warning-color)]/30 text-[var(--warning-color)] rounded-lg transition-colors"
                  onClick={() => onSnoozeAlarm(alarm.alarm_id)}
                  title="Snooze (default 10 min)"
                >
                  Snooze
                </button>
                <button
                  className="px-3 py-1.5 text-xs font-medium bg-[var(--accent-color)]/20 hover:bg-[var(--accent-color)]/30 text-[var(--accent-color)] rounded-lg transition-colors"
                  onClick={() => onSnoozeAlarm(alarm.alarm_id, '300')}
                  title="Snooze 5 min"
                >
                  Snooze 5m
                </button>
                <button
                  className="px-3 py-1.5 text-xs font-medium bg-[var(--danger-color)]/20 hover:bg-[var(--danger-color)]/30 text-[var(--danger-color)] rounded-lg transition-colors ml-auto"
                  onClick={() => {
                    if (window.confirm('Are you sure you want to delete this alarm?')) {
                      onDelete(alarm.alarm_id)
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

function CreateAlarmForm({ onSubmit, onCancel }: {
  onSubmit: (params: { time?: string; label?: string; recurrence?: string[] }) => void
  onCancel: () => void
}) {
  const [time, setTime] = useState('08:00')
  const [label, setLabel] = useState('')
  const [recurrence, setRecurrence] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const params: { time?: string; label?: string; recurrence?: string[] } = {}
    if (time) params.time = time
    if (label) params.label = label
    if (recurrence) params.recurrence = recurrence.split(',').map(s => s.trim().toUpperCase())
    onSubmit(params)
  }

  const DAYS_OF_WEEK = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
  const selectedDays = recurrence ? recurrence.split(',').map(s => s.trim().toUpperCase()).filter(Boolean) : []
  const toggleDay = (day: string) => {
    if (selectedDays.includes(day)) {
      setRecurrence(selectedDays.filter(d => d !== day).join(', '))
    } else {
      setRecurrence([...selectedDays, day].join(', '))
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] space-y-3">
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">New Alarm</h3>
      <div>
        <label className="block text-xs text-[var(--text-secondary)] mb-1">Time</label>
        <input
          type="time"
          value={time}
          onChange={e => setTime(e.target.value)}
          className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm"
        />
      </div>
      <div>
        <label className="block text-xs text-[var(--text-secondary)] mb-1">Label</label>
        <input
          type="text"
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="e.g. Wake up"
          className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm placeholder:text-[var(--text-tertiary)]"
        />
      </div>
      <div>
        <label className="block text-xs text-[var(--text-secondary)] mb-1">Recurrence</label>
        <div className="flex flex-wrap gap-1.5">
          {DAYS_OF_WEEK.map(day => (
            <button
              key={day}
              type="button"
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                selectedDays.includes(day)
                  ? 'bg-[var(--accent-color)] text-white'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--border-color)]'
              }`}
              onClick={() => toggleDay(day)}
            >
              {day.charAt(0) + day.slice(1, 3).toLowerCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button type="submit" className="px-4 py-2 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg text-sm font-medium transition-colors">
          Create
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--border-color)] text-[var(--text-primary)] rounded-lg text-sm font-medium transition-colors">
          Cancel
        </button>
      </div>
    </form>
  )
}

function EditAlarmForm({ alarm, onSubmit, onSubmitV2, onCancel }: {
  alarm: Alarm
  onSubmit: (params: { new_time_of_day?: string; new_label?: string; new_recurrence?: string[] }) => void
  onSubmitV2: (modifications: Record<string, unknown>) => void
  onCancel: () => void
}) {
  // Convert 12h format (e.g. "9:30:00 AM") to 24h format for HTML time input
  const convertTo24h = (timeStr: string): string => {
    const match = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i)
    if (!match) return timeStr
    let h = parseInt(match[1])
    const m = match[2]
    const ampm = match[4].toUpperCase()
    if (ampm === 'PM' && h !== 12) h += 12
    if (ampm === 'AM' && h === 12) h = 0
    return `${h.toString().padStart(2, '0')}:${m}`
  }

  const originalTime24h = convertTo24h(alarm.time_of_day || '')
  const [time, setTime] = useState(originalTime24h)
  const [label, setLabel] = useState(alarm.label || '')
  const [recurrence, setRecurrence] = useState(alarm.recurrence || '')
  const [useV2, setUseV2] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (useV2) {
      const modifications: Record<string, unknown> = {}
      if (time && time !== originalTime24h) modifications.time = time.length === 5 ? time + ':00' : time
      if (label !== alarm.label) modifications.label = label
      if (recurrence !== alarm.recurrence) modifications.recurrence = recurrence.split(',').map(s => s.trim().toUpperCase())
      onSubmitV2(modifications)
    } else {
      const params: { new_time_of_day?: string; new_label?: string; new_recurrence?: string[] } = {}
      if (time && time !== originalTime24h) params.new_time_of_day = time.length === 5 ? time + ':00' : time
      if (label !== alarm.label) params.new_label = label
      if (recurrence !== alarm.recurrence) params.new_recurrence = recurrence.split(',').map(s => s.trim().toUpperCase())
      onSubmit(params)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 bg-[var(--bg-secondary)] rounded-xl border border-[var(--accent-color)]/30 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Edit Alarm<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{alarm.alarm_id}]</span></h3>
        <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          <input type="checkbox" checked={useV2} onChange={e => setUseV2(e.target.checked)} className="rounded" />
          Use V2 API
        </label>
      </div>
      <div>
        <label className="block text-xs text-[var(--text-secondary)] mb-1">Time</label>
        <input
          type="time"
          value={time}
          onChange={e => setTime(e.target.value)}
          className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm"
        />
      </div>
      <div>
        <label className="block text-xs text-[var(--text-secondary)] mb-1">Label</label>
        <input
          type="text"
          value={label}
          onChange={e => setLabel(e.target.value)}
          className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm"
        />
      </div>
      <div>
        <label className="block text-xs text-[var(--text-secondary)] mb-1">Recurrence</label>
        <input
          type="text"
          value={recurrence}
          onChange={e => setRecurrence(e.target.value)}
          placeholder="e.g. MONDAY, WEDNESDAY, FRIDAY"
          className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm placeholder:text-[var(--text-tertiary)]"
        />
      </div>
      <div className="flex gap-2 pt-1">
        <button type="submit" className="px-4 py-2 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg text-sm font-medium transition-colors">
          Save
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--border-color)] text-[var(--text-primary)] rounded-lg text-sm font-medium transition-colors">
          Cancel
        </button>
      </div>
    </form>
  )
}

// ─── Timers Tab ──────────────────────────────────────────────────────────────

interface TimersTabProps {
  timers: Timer[]
  onCreate: (params: { duration?: string; label?: string }) => void
  onEdit: (id: string, params: { new_duration?: string; new_label?: string }) => void
  onEditV2: (id: string, modifications: Record<string, unknown>) => void
  onChangeState: (id: string, operation: string) => void
}

function TimersTab({ timers, onCreate, onEdit, onEditV2, onChangeState }: TimersTabProps) {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingTimer, setEditingTimer] = useState<Timer | null>(null)

  return (
    <div className="space-y-3">
      {/* Create Timer Button */}
      <button
        className="w-full px-4 py-3 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-xl transition-colors font-medium text-sm"
        onClick={() => setShowCreateForm(!showCreateForm)}
      >
        {showCreateForm ? 'Cancel' : '+ Create Timer'}
      </button>

      {/* Create Timer Form */}
      {showCreateForm && (
        <CreateTimerForm
          onSubmit={(params) => {
            onCreate(params)
            setShowCreateForm(false)
          }}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {/* Edit Timer Form */}
      {editingTimer && (
        <EditTimerForm
          timer={editingTimer}
          onSubmit={(params) => {
            onEdit(editingTimer.timer_id, params)
            setEditingTimer(null)
          }}
          onSubmitV2={(modifications) => {
            onEditV2(editingTimer.timer_id, modifications)
            setEditingTimer(null)
          }}
          onCancel={() => setEditingTimer(null)}
        />
      )}

      {timers.length === 0 && !showCreateForm ? (
        <div className="flex flex-col items-center justify-center py-16 text-[var(--text-secondary)]">
          <span className="text-5xl mb-3">{'\u23f1'}</span>
          <p className="text-lg">No timers set</p>
        </div>
      ) : (
        timers.map(timer => (
          <div
            key={timer.timer_id}
            className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-light font-mono text-[var(--text-primary)] tabular-nums">
                  {(timer.state === 'RUNNING' || timer.state === 'PAUSED') ? (timer.remaining_duration || timer.duration) : timer.duration}
                </div>
                {(timer.state === 'RUNNING' || timer.state === 'PAUSED') && timer.duration && (
                  <div className="text-xs text-[var(--text-tertiary)] mt-0.5 font-mono">of {timer.duration}</div>
                )}
                <div className="text-sm text-[var(--text-secondary)] mt-1">{timer.label}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{timer.timer_id}]</span></div>
              </div>
              <span
                className={`px-4 py-1.5 rounded-full text-xs font-semibold ${
                  timer.state === 'RUNNING'
                    ? 'bg-[var(--accent-color)] text-white'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                }`}
              >
                {timer.state}
              </span>
            </div>
            {/* Timer control buttons */}
            <div className="flex gap-2 mt-3 pt-3 border-t border-[var(--border-color)]">
              {timer.state === 'RUNNING' ? (
                <button
                  className="px-3 py-1.5 text-xs font-medium bg-[var(--warning-color)] hover:brightness-110 text-white rounded-lg transition-colors"
                  onClick={() => onChangeState(timer.timer_id, 'PAUSE')}
                >
                  Pause
                </button>
              ) : timer.state === 'PAUSED' ? (
                <button
                  className="px-3 py-1.5 text-xs font-medium bg-[var(--success-color)] hover:brightness-110 text-white rounded-lg transition-colors"
                  onClick={() => onChangeState(timer.timer_id, 'RESUME')}
                >
                  Resume
                </button>
              ) : (
                <button
                  className="px-3 py-1.5 text-xs font-medium bg-[var(--success-color)] hover:brightness-110 text-white rounded-lg transition-colors"
                  onClick={() => onChangeState(timer.timer_id, 'RESUME')}
                >
                  Start
                </button>
              )}
              <button
                className="px-3 py-1.5 text-xs font-medium bg-[var(--bg-tertiary)] hover:bg-[var(--border-color)] text-[var(--text-primary)] rounded-lg transition-colors"
                onClick={() => onChangeState(timer.timer_id, 'RESET')}
              >
                Reset
              </button>
              <button
                className="px-3 py-1.5 text-xs font-medium bg-[var(--bg-tertiary)] hover:bg-[var(--border-color)] text-[var(--text-primary)] rounded-lg transition-colors"
                onClick={() => setEditingTimer(timer)}
              >
                Edit
              </button>
              <button
                className="px-3 py-1.5 text-xs font-medium bg-[var(--danger-color)]/20 hover:bg-[var(--danger-color)]/30 text-[var(--danger-color)] rounded-lg transition-colors ml-auto"
                onClick={() => {
                  if (window.confirm('Are you sure you want to cancel this timer?')) {
                    onChangeState(timer.timer_id, 'CANCEL')
                  }
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

function CreateTimerForm({ onSubmit, onCancel }: {
  onSubmit: (params: { duration?: string; label?: string }) => void
  onCancel: () => void
}) {
  const [hours, setHours] = useState('0')
  const [minutes, setMinutes] = useState('5')
  const [seconds, setSeconds] = useState('0')
  const [label, setLabel] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const h = Math.max(0, parseInt(hours) || 0)
    const m = Math.max(0, parseInt(minutes) || 0)
    const s = Math.max(0, parseInt(seconds) || 0)
    const totalSeconds = h * 3600 + m * 60 + s
    if (totalSeconds <= 0) {
      alert('Please enter a duration greater than 0.')
      return
    }
    const dh = Math.floor(totalSeconds / 3600)
    const dm = Math.floor((totalSeconds % 3600) / 60)
    const ds = totalSeconds % 60
    const parts: string[] = []
    if (dh > 0) parts.push(`${dh}h`)
    if (dm > 0) parts.push(`${dm}m`)
    if (ds > 0) parts.push(`${ds}s`)
    const duration = parts.join('') || '1s'
    const params: { duration?: string; label?: string } = { duration }
    if (label) params.label = label
    onSubmit(params)
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] space-y-3">
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">New Timer</h3>
      <div>
        <label className="block text-xs text-[var(--text-secondary)] mb-1">Duration</label>
        <div className="flex gap-2">
          <div className="flex-1">
            <input type="number" min="0" max="23" value={hours} onChange={e => setHours(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm text-center" />
            <span className="block text-xs text-[var(--text-tertiary)] text-center mt-1">Hours</span>
          </div>
          <div className="flex-1">
            <input type="number" min="0" max="59" value={minutes} onChange={e => setMinutes(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm text-center" />
            <span className="block text-xs text-[var(--text-tertiary)] text-center mt-1">Min</span>
          </div>
          <div className="flex-1">
            <input type="number" min="0" max="59" value={seconds} onChange={e => setSeconds(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm text-center" />
            <span className="block text-xs text-[var(--text-tertiary)] text-center mt-1">Sec</span>
          </div>
        </div>
      </div>
      <div>
        <label className="block text-xs text-[var(--text-secondary)] mb-1">Label</label>
        <input
          type="text"
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="e.g. Cooking"
          className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm placeholder:text-[var(--text-tertiary)]"
        />
      </div>
      <div className="flex gap-2 pt-1">
        <button type="submit" className="px-4 py-2 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg text-sm font-medium transition-colors">
          Create
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--border-color)] text-[var(--text-primary)] rounded-lg text-sm font-medium transition-colors">
          Cancel
        </button>
      </div>
    </form>
  )
}

function EditTimerForm({ timer, onSubmit, onSubmitV2, onCancel }: {
  timer: Timer
  onSubmit: (params: { new_duration?: string; new_label?: string }) => void
  onSubmitV2: (modifications: Record<string, unknown>) => void
  onCancel: () => void
}) {
  const [duration, setDuration] = useState(timer.duration || '')
  const [label, setLabel] = useState(timer.label || '')
  const [useV2, setUseV2] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (useV2) {
      const modifications: Record<string, unknown> = {}
      if (duration !== timer.duration) modifications.duration = duration
      if (label !== timer.label) modifications.label = label
      onSubmitV2(modifications)
    } else {
      const params: { new_duration?: string; new_label?: string } = {}
      if (duration !== timer.duration) params.new_duration = duration
      if (label !== timer.label) params.new_label = label
      onSubmit(params)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 bg-[var(--bg-secondary)] rounded-xl border border-[var(--accent-color)]/30 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Edit Timer<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{timer.timer_id}]</span></h3>
        <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          <input type="checkbox" checked={useV2} onChange={e => setUseV2(e.target.checked)} className="rounded" />
          Use V2 API
        </label>
      </div>
      <div>
        <label className="block text-xs text-[var(--text-secondary)] mb-1">Duration</label>
        <input
          type="text"
          value={duration}
          onChange={e => setDuration(e.target.value)}
          placeholder="e.g. 10m, 1h30m, 45s"
          className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm"
        />
      </div>
      <div>
        <label className="block text-xs text-[var(--text-secondary)] mb-1">Label</label>
        <input
          type="text"
          value={label}
          onChange={e => setLabel(e.target.value)}
          className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm"
        />
      </div>
      <div className="flex gap-2 pt-1">
        <button type="submit" className="px-4 py-2 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg text-sm font-medium transition-colors">
          Save
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--border-color)] text-[var(--text-primary)] rounded-lg text-sm font-medium transition-colors">
          Cancel
        </button>
      </div>
    </form>
  )
}

// ─── World Clock Tab ─────────────────────────────────────────────────────────

interface WorldClockTabProps {
  clocks: WorldClock[]
  onCreate: (params: { label?: string; timezone?: string }) => void
}

const TIMEZONE_ABBREVIATION_MAP: Record<string, string> = {
  'EST': 'America/New_York', 'EDT': 'America/New_York',
  'CST': 'America/Chicago', 'CDT': 'America/Chicago',
  'MST': 'America/Denver', 'MDT': 'America/Denver',
  'PST': 'America/Los_Angeles', 'PDT': 'America/Los_Angeles',
  'GMT': 'Europe/London', 'BST': 'Europe/London',
  'CET': 'Europe/Paris', 'CEST': 'Europe/Paris',
  'EET': 'Europe/Athens', 'EEST': 'Europe/Athens',
  'IST': 'Asia/Kolkata', 'JST': 'Asia/Tokyo',
  'KST': 'Asia/Seoul', 'CST_ASIA': 'Asia/Shanghai',
  'SGT': 'Asia/Singapore', 'HKT': 'Asia/Hong_Kong',
  'AEST': 'Australia/Sydney', 'AEDT': 'Australia/Sydney',
  'ACST': 'Australia/Adelaide', 'AWST': 'Australia/Perth',
  'NZST': 'Pacific/Auckland', 'NZDT': 'Pacific/Auckland',
  'HST': 'Pacific/Honolulu', 'AKST': 'America/Anchorage',
  'AST': 'America/Halifax', 'NST': 'America/St_Johns',
  'BRT': 'America/Sao_Paulo', 'ART': 'America/Argentina/Buenos_Aires',
  'WAT': 'Africa/Lagos', 'CAT': 'Africa/Johannesburg',
  'EAT': 'Africa/Nairobi', 'MSK': 'Europe/Moscow',
  'GST': 'Asia/Dubai', 'PKT': 'Asia/Karachi',
  'ICT': 'Asia/Bangkok', 'WIB': 'Asia/Jakarta',
  'PHT': 'Asia/Manila', 'NPT': 'Asia/Kathmandu',
}

const CITY_TO_TIMEZONE: Record<string, string> = {
  'new york': 'America/New_York', 'nyc': 'America/New_York', 'manhattan': 'America/New_York',
  'los angeles': 'America/Los_Angeles', 'la': 'America/Los_Angeles', 'san francisco': 'America/Los_Angeles',
  'chicago': 'America/Chicago', 'dallas': 'America/Chicago', 'houston': 'America/Chicago',
  'denver': 'America/Denver', 'phoenix': 'America/Phoenix',
  'london': 'Europe/London', 'paris': 'Europe/Paris', 'berlin': 'Europe/Berlin',
  'madrid': 'Europe/Madrid', 'rome': 'Europe/Rome', 'amsterdam': 'Europe/Amsterdam',
  'moscow': 'Europe/Moscow', 'istanbul': 'Europe/Istanbul', 'athens': 'Europe/Athens',
  'dubai': 'Asia/Dubai', 'mumbai': 'Asia/Kolkata', 'delhi': 'Asia/Kolkata', 'kolkata': 'Asia/Kolkata',
  'bangkok': 'Asia/Bangkok', 'singapore': 'Asia/Singapore', 'hong kong': 'Asia/Hong_Kong',
  'shanghai': 'Asia/Shanghai', 'beijing': 'Asia/Shanghai', 'tokyo': 'Asia/Tokyo',
  'seoul': 'Asia/Seoul', 'taipei': 'Asia/Taipei', 'jakarta': 'Asia/Jakarta',
  'sydney': 'Australia/Sydney', 'melbourne': 'Australia/Melbourne', 'perth': 'Australia/Perth',
  'auckland': 'Pacific/Auckland', 'honolulu': 'Pacific/Honolulu',
  'toronto': 'America/Toronto', 'vancouver': 'America/Vancouver',
  'sao paulo': 'America/Sao_Paulo', 'buenos aires': 'America/Argentina/Buenos_Aires',
  'cairo': 'Africa/Cairo', 'johannesburg': 'Africa/Johannesburg', 'lagos': 'Africa/Lagos',
  'nairobi': 'Africa/Nairobi', 'karachi': 'Asia/Karachi', 'manila': 'Asia/Manila',
}

function resolveTimezone(input: string): string | null {
  if (!input) return null
  const trimmed = input.trim()

  // Check if it's already a valid IANA timezone
  try {
    new Date().toLocaleTimeString('en-US', { timeZone: trimmed })
    return trimmed
  } catch { /* not a valid IANA timezone */ }

  // Check abbreviation map (case-insensitive)
  const upper = trimmed.toUpperCase()
  if (TIMEZONE_ABBREVIATION_MAP[upper]) {
    return TIMEZONE_ABBREVIATION_MAP[upper]
  }

  // Check city name map (case-insensitive)
  const lower = trimmed.toLowerCase()
  if (CITY_TO_TIMEZONE[lower]) {
    return CITY_TO_TIMEZONE[lower]
  }

  // Handle UTC+N, UTC-N, GMT+N, GMT-N formats
  const utcMatch = trimmed.match(/^(?:UTC|GMT)\s*([+-])\s*(\d{1,2})(?::(\d{2}))?$/i)
  if (utcMatch) {
    const sign = utcMatch[1]
    const hours = parseInt(utcMatch[2])
    const minutes = utcMatch[3] ? parseInt(utcMatch[3]) : 0
    if (hours <= 14 && minutes < 60) {
      // Etc/GMT uses inverted sign convention
      const etcSign = sign === '+' ? '-' : '+'
      if (minutes === 0) {
        const tz = `Etc/GMT${etcSign}${hours}`
        try {
          new Date().toLocaleTimeString('en-US', { timeZone: tz })
          return tz
        } catch { /* fallback */ }
      }
      // For non-round offsets, find closest IANA match using offset
      const totalMinutes = (sign === '+' ? 1 : -1) * (hours * 60 + minutes)
      const fixedOffset = `Etc/GMT${etcSign}${Math.round(Math.abs(totalMinutes) / 60)}`
      try {
        new Date().toLocaleTimeString('en-US', { timeZone: fixedOffset })
        return fixedOffset
      } catch { /* fallback */ }
    }
  }

  return null
}

function WorldClockTab({ clocks, onCreate }: WorldClockTabProps) {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [city, setCity] = useState('')
  const [timezone, setTimezone] = useState('')
  const [currentTimes, setCurrentTimes] = useState<Record<string, string>>({})
  const [tzError, setTzError] = useState<string | null>(null)

  const getUtcOffset = (tz: string): string => {
    try {
      const now = new Date()
      const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC', hour12: false, hour: '2-digit', minute: '2-digit' })
      const tzStr = now.toLocaleString('en-US', { timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit' })
      const [utcH, utcM] = utcStr.split(':').map(Number)
      const [tzH, tzM] = tzStr.split(':').map(Number)
      let diffMin = (tzH * 60 + tzM) - (utcH * 60 + utcM)
      if (diffMin > 720) diffMin -= 1440
      if (diffMin < -720) diffMin += 1440
      const sign = diffMin >= 0 ? '+' : '-'
      const absMin = Math.abs(diffMin)
      const h = Math.floor(absMin / 60)
      const m = absMin % 60
      return `UTC${sign}${h}${m > 0 ? ':' + m.toString().padStart(2, '0') : ''}`
    } catch {
      return ''
    }
  }

  // Update displayed times every second
  useEffect(() => {
    const updateTimes = () => {
      const times: Record<string, string> = {}
      clocks.forEach((clock, idx) => {
        const tz = clock.time_of_day // stored timezone string
        if (tz) {
          try {
            times[clock.clock_id || String(idx)] = new Date().toLocaleTimeString('en-US', {
              timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
            })
          } catch { /* invalid timezone */ }
        }
      })
      setCurrentTimes(times)
    }
    updateTimes()
    const interval = setInterval(updateTimes, 1000)
    return () => clearInterval(interval)
  }, [clocks])

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    setTzError(null)
    // Try to resolve timezone from the timezone field first, then from the city name
    let resolvedTz = resolveTimezone(timezone)
    if (timezone && !resolvedTz) {
      setTzError(`Invalid timezone "${timezone}". Use IANA format (e.g. America/New_York), abbreviations (e.g. CST, EST), or UTC offsets (e.g. UTC+5).`)
      return
    }
    if (!resolvedTz && city) {
      resolvedTz = resolveTimezone(city)
    }
    if (!resolvedTz) {
      setTzError('Please enter a timezone (e.g. America/New_York, CST, UTC+5) or a recognized city name.')
      return
    }
    onCreate({
      label: city || timezone || 'World Clock',
      timezone: resolvedTz,
    })
    setCity('')
    setTimezone('')
    setTzError(null)
    setShowCreateForm(false)
  }

  const commonTimezones = [
    { city: 'New York', tz: 'America/New_York' },
    { city: 'London', tz: 'Europe/London' },
    { city: 'Tokyo', tz: 'Asia/Tokyo' },
    { city: 'Sydney', tz: 'Australia/Sydney' },
    { city: 'Paris', tz: 'Europe/Paris' },
    { city: 'Dubai', tz: 'Asia/Dubai' },
    { city: 'Los Angeles', tz: 'America/Los_Angeles' },
    { city: 'Singapore', tz: 'Asia/Singapore' },
    { city: 'Mumbai', tz: 'Asia/Kolkata' },
    { city: 'Berlin', tz: 'Europe/Berlin' },
  ]

  return (
    <div className="space-y-3">
      <button
        className="w-full px-4 py-3 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-xl transition-colors font-medium text-sm"
        onClick={() => setShowCreateForm(!showCreateForm)}
      >
        {showCreateForm ? 'Cancel' : '+ Add World Clock'}
      </button>

      {showCreateForm && (
        <form onSubmit={handleCreate} className="p-4 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] space-y-3">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Add World Clock</h3>
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">City / Label</label>
            <input
              type="text"
              value={city}
              onChange={e => setCity(e.target.value)}
              placeholder="e.g. New York"
              className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm placeholder:text-[var(--text-tertiary)]"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Timezone</label>
            <input
              type="text"
              value={timezone}
              onChange={e => { setTimezone(e.target.value); setTzError(null) }}
              placeholder="e.g. America/New_York, CST, UTC+5"
              className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm placeholder:text-[var(--text-tertiary)]"
            />
            {tzError && (
              <p className="text-xs text-[var(--danger-color)] mt-1">{tzError}</p>
            )}
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-2">Quick Add</label>
            <div className="flex flex-wrap gap-1.5">
              {commonTimezones.map(tz => (
                <button
                  key={tz.tz}
                  type="button"
                  className="px-2.5 py-1 text-xs bg-[var(--bg-tertiary)] hover:bg-[var(--border-color)] text-[var(--text-secondary)] rounded-md transition-colors"
                  onClick={() => { setCity(tz.city); setTimezone(tz.tz) }}
                >
                  {tz.city}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" className="px-4 py-2 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg text-sm font-medium transition-colors">
              Add Clock
            </button>
            <button type="button" onClick={() => setShowCreateForm(false)} className="px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--border-color)] text-[var(--text-primary)] rounded-lg text-sm font-medium transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {clocks.length === 0 && !showCreateForm ? (
        <div className="flex flex-col items-center justify-center py-16 text-[var(--text-secondary)]">
          <span className="text-5xl mb-3">{'\ud83c\udf0d'}</span>
          <p className="text-lg">No world clocks added</p>
          <p className="text-sm mt-1">Add a city to track its time</p>
        </div>
      ) : (
        clocks.map((clock, idx) => {
          const key = clock.clock_id || String(idx)
          return (
            <div key={key} className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-medium text-[var(--text-primary)]">{clock.label}{clock.clock_id && <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{clock.clock_id}]</span>}</div>
                  {clock.time_of_day && (
                    <div className="text-xs text-[var(--text-tertiary)] mt-0.5">
                      {clock.time_of_day} ({getUtcOffset(clock.time_of_day)})
                    </div>
                  )}
                  <div className="text-2xl font-light font-mono text-[var(--text-primary)] tabular-nums mt-1">
                    {currentTimes[key] || '--:--:--'}
                  </div>
                </div>
                <span className="text-2xl">{'\ud83c\udf0d'}</span>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

// ─── Stopwatch Tab ───────────────────────────────────────────────────────────

interface StopwatchState {
  state: string
  elapsed_time: number
  start_time: string | null
  lap_times: Array<{
    lap_number: number
    lap_duration: string
    split_duration: string
  }>
}

function formatElapsedTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const secs = safeSeconds % 60

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

function StopwatchTab({ api }: { api: ReturnType<typeof useBackendAPI> }) {
  const readOnly = useReadOnly()
  const [stopwatch, setStopwatch] = useState<StopwatchState | null>(null)
  const [displayTime, setDisplayTime] = useState(0)
  const [loading, setLoading] = useState(false)
  const cachedLapsRef = useRef<StopwatchState['lap_times']>([])
  const loadedAtRef = useRef<number>(Date.now())

  const parseElapsedString = (str: string): number => {
    // Parse "1h30m45s", "30m", "0h0m14s", etc. into seconds
    let total = 0
    const hMatch = str.match(/(\d+)h/)
    const mMatch = str.match(/(\d+)m/)
    const sMatch = str.match(/(\d+)s/)
    if (hMatch) total += parseInt(hMatch[1]) * 3600
    if (mMatch) total += parseInt(mMatch[1]) * 60
    if (sMatch) total += parseInt(sMatch[1])
    return total
  }

  const loadStopwatch = async () => {
    setLoading(true)
    try {
      // show_stopwatch initializes state; a viewer reads the existing snapshot.
      const showResult = readOnly
        ? null
        : await api.callTool<{ message?: string }>('show_stopwatch', {})

      // Parse the message string: "Stopwatch is [stopped|running|paused]. [Total time|Elapsed time]: XhYmZs"
      let parsedState = 'STOPPED'
      let parsedElapsed = 0
      if (showResult?.message) {
        const msg = showResult.message
        if (msg.toLowerCase().includes('running')) parsedState = 'RUNNING'
        else if (msg.toLowerCase().includes('paused')) parsedState = 'PAUSED'
        else parsedState = 'STOPPED'
        // Extract time from message (e.g. "Elapsed time: 0h0m14s" or "Total time: 1h30m45s")
        const timeMatch = msg.match(/(?:Total time|Elapsed time):\s*(\S+)/)
        if (timeMatch) {
          parsedElapsed = parseElapsedString(timeMatch[1])
        }
      }

      // Also fetch raw state for structured data (start_time, lap_times)
      let startTime: string | null = null
      let lapTimes: StopwatchState['lap_times'] = []
      try {
        const stateResp = await fetch('./api/services/clock/state')
        if (readOnly && !stateResp.ok) {
          throw new Error(`Failed to load stopwatch state: ${stateResp.status}`)
        }
        if (stateResp.ok) {
          const stateData = await stateResp.json()
          const swData = stateData?.state?.stopwatch
          if (swData) {
            if (readOnly) parsedState = swData.state || 'STOPPED'
            startTime = swData.start_time || null
            lapTimes = swData.lap_times || []
            // For RUNNING state: compute total elapsed = accumulated + (now - start_time)
            // The raw elapsed_time is only the accumulated time before the current run
            if (parsedState === 'RUNNING' && swData.start_time && typeof swData.elapsed_time === 'number') {
              try {
                const startMs = new Date(swData.start_time).getTime()
                const nowMs = Date.now()
                const currentPeriod = Math.max(0, Math.floor((nowMs - startMs) / 1000))
                parsedElapsed = Math.max(0, swData.elapsed_time) + currentPeriod
              } catch { /* fallback to message-parsed value */ }
            } else if (typeof swData.elapsed_time === 'number') {
              parsedElapsed = Math.max(0, swData.elapsed_time)
            }
          }
        }
      } catch (err) {
        if (readOnly) throw err
        // Editable mode can fall back to values parsed from show_stopwatch.
      }

      // Use backend lap times if available, otherwise keep cached laps
      if (lapTimes.length > 0) {
        cachedLapsRef.current = lapTimes
      }

      const sw: StopwatchState = {
        state: parsedState,
        elapsed_time: parsedElapsed,
        start_time: startTime,
        lap_times: lapTimes.length > 0 ? lapTimes : cachedLapsRef.current,
      }
      setStopwatch(sw)
      loadedAtRef.current = Date.now()
      setDisplayTime(Math.max(0, sw.elapsed_time))
    } catch (err) {
      console.error('Failed to load stopwatch:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (stopwatch?.state !== 'RUNNING') return

    let prevSecond = -1
    const interval = setInterval(() => {
      const now = Date.now()
      const clientDelta = Math.max(0, Math.floor((now - loadedAtRef.current) / 1000))
      const newTime = stopwatch.elapsed_time + clientDelta
      if (newTime !== prevSecond) {
        prevSecond = newTime
        setDisplayTime(newTime)
      }
    }, 100)

    return () => clearInterval(interval)
  }, [stopwatch])

  useEffect(() => {
    loadStopwatch()
  }, [])

  const handleStart = async () => {
    await api.callTool('start_stopwatch', {})
    await loadStopwatch()
  }

  const handlePause = async () => {
    await api.callTool('pause_stopwatch', {})
    await loadStopwatch()
  }

  const handleReset = async () => {
    await api.callTool('reset_stopwatch', {})
    cachedLapsRef.current = []
    await loadStopwatch()
  }

  const handleLap = async () => {
    await api.callTool('lap_stopwatch', {})
    await loadStopwatch()
  }

  if (loading && !stopwatch) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-[var(--accent-color)]/30 border-t-[var(--accent-color)] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6">
      {/* Main timer display */}
      <div className="text-6xl font-mono font-light text-[var(--text-primary)] tabular-nums tracking-tight">
        {formatElapsedTime(displayTime)}
      </div>

      {/* Status badge */}
      <div className={`px-3 py-1 rounded-full text-xs font-medium ${
        stopwatch?.state === 'RUNNING'
          ? 'bg-[var(--success-color)]/20 text-[var(--success-color)]'
          : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
      }`}>
        {stopwatch?.state || 'STOPPED'}
      </div>

      {/* Control buttons */}
      <div className="flex gap-3">
        {stopwatch?.state === 'RUNNING' ? (
          <button
            className="px-6 py-2.5 bg-[var(--warning-color)] hover:brightness-110 text-white rounded-lg transition-all font-medium shadow-sm"
            onClick={handlePause}
          >
            Pause
          </button>
        ) : (
          <button
            className="px-6 py-2.5 bg-[var(--success-color)] hover:brightness-110 text-white rounded-lg transition-all font-medium shadow-sm"
            onClick={handleStart}
          >
            Start
          </button>
        )}
        <button
          className="px-6 py-2.5 bg-[var(--accent-color)] hover:brightness-110 text-white rounded-lg transition-all font-medium shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={handleLap}
          disabled={stopwatch?.state !== 'RUNNING'}
        >
          Lap
        </button>
        <button
          className="px-6 py-2.5 bg-[var(--bg-tertiary)] hover:bg-[var(--border-color)] text-[var(--text-primary)] rounded-lg transition-all font-medium border border-[var(--border-color)]"
          onClick={handleReset}
        >
          Reset
        </button>
      </div>

      {/* Lap times */}
      {stopwatch?.lap_times && stopwatch.lap_times.length > 0 && (
        <div className="w-full mt-4 max-h-48 overflow-auto">
          <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-2 px-1">Laps</h3>
          <div className="space-y-1">
            {[...stopwatch.lap_times].reverse().map((lap) => (
              <div
                key={lap.lap_number}
                className="flex justify-between text-sm p-3 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]"
              >
                <span className="text-[var(--text-secondary)] font-medium">Lap {lap.lap_number}</span>
                <span className="font-mono text-[var(--text-tertiary)] tabular-nums">+{lap.split_duration}</span>
                <span className="font-mono text-[var(--text-primary)] font-medium tabular-nums">{lap.lap_duration}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
