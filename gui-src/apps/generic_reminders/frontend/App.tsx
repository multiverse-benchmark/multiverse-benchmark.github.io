import { useState, useEffect, useRef, useCallback } from 'react'
import { requestedSnapshotRecord, reportMissingSnapshotRecord } from '@shared/snapshotNavigation'
import { useBackendAPI } from '@shared/hooks/useBackendAPI'

interface Reminder {
  id: string
  title: string
  description?: string
  start_date?: string
  time_of_day?: string
  am_pm_or_unknown?: string
  completed: boolean
  deleted?: boolean
  schedule: string
  created_at: string
  updated_at?: string
  repeat_every_n?: number
  repeat_interval_unit?: string
  end_date?: string
  occurrence_count?: number
  days_of_week?: string[]
  weeks_of_month?: string[]
  days_of_month?: string[]
  uri?: string
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

export default function RemindersApp({ setRefreshHandler }: AppProps) {
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [newHour, setNewHour] = useState<number | string>('')
  const [newMinute, setNewMinute] = useState<number | string>('')
  const [createLoading, setCreateLoading] = useState(false)
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null)
  const [isInvalidDate, setIsInvalidDate] = useState(false)
  const [shakeDate, setShakeDate] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterFromDate, setFilterFromDate] = useState('')
  const [filterToDate, setFilterToDate] = useState('')
  const [filterFromTime, setFilterFromTime] = useState('')
  const [filterToTime, setFilterToTime] = useState('')
  const [filterIsRecurring, setFilterIsRecurring] = useState<boolean | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [timeRangeError, setTimeRangeError] = useState('')
  // Recurrence states
  const [isRecurring, setIsRecurring] = useState(false)
  const [repeatEveryN, setRepeatEveryN] = useState<number | string>(1)
  const [repeatUnit, setRepeatUnit] = useState<'MINUTE' | 'HOUR' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'>('DAY')
  const [endType, setEndType] = useState<'date' | 'count' | null>(null)
  const [recurEndDate, setRecurEndDate] = useState('')
  const [occurenceCount, setOccurenceCount] = useState<number | string>('')
  const [selectedDaysOfWeek, setSelectedDaysOfWeek] = useState<string[]>([])
  const [selectedDaysOfMonth, setSelectedDaysOfMonth] = useState<string[]>([])
  const [monthPatternType, setMonthPatternType] = useState<'dayOfMonth' | 'weekPattern' | null>(null)
  const [weekOfMonth, setWeekOfMonth] = useState<'FIRST' | 'SECOND' | 'THIRD' | 'FOURTH' | 'LAST'>('FIRST')
  const [viewingReminder, setViewingReminder] = useState<Reminder | null>(null)
  const [viewingTrash, setViewingTrash] = useState(false)
  const [deletedReminders, setDeletedReminders] = useState<Reminder[]>([])
  const [loadingTrash, setLoadingTrash] = useState(false)
  const [activeTab, setActiveTab] = useState<'incomplete' | 'completed'>('incomplete')
  const [completedReminders, setCompletedReminders] = useState<Reminder[]>([])
  const [searchByIdMode, setSearchByIdMode] = useState(false)
  const [searchIdInput, setSearchIdInput] = useState('')
  const [activeSearchQuery, setActiveSearchQuery] = useState('')
  const [undoToast, setUndoToast] = useState<{ message: string; visible: boolean } | null>(null)
  const undoTimerRef = useRef<NodeJS.Timeout | null>(null)
  const loadDataRef = useRef<() => void>(() => {})
  const setRefreshHandlerRef = useRef(setRefreshHandler)

  const api = useBackendAPI('generic_reminders')

  // Sanitize invalid recurrence field combinations before sending modify_reminder
  const sanitizeModifyData = (reminder: Reminder, updateData: Record<string, unknown>): Record<string, unknown> => {
    const result = { ...updateData }
    // Determine the effective interval unit after this update
    const effectiveUnit = (result.repeat_interval_unit !== undefined
      ? result.repeat_interval_unit
      : reminder.repeat_interval_unit) as string | undefined

    // If interval is DAY or YEAR, days_of_week and weeks_of_month are invalid
    if (effectiveUnit === 'DAY' || effectiveUnit === 'YEAR') {
      if (reminder.days_of_week && reminder.days_of_week.length > 0 && result.days_of_week === undefined) {
        result.days_of_week = null
      }
      if (reminder.weeks_of_month && reminder.weeks_of_month.length > 0 && result.weeks_of_month === undefined) {
        result.weeks_of_month = null
      }
      if (reminder.days_of_month && reminder.days_of_month.length > 0 && result.days_of_month === undefined) {
        result.days_of_month = null
      }
    }
    // If interval is WEEK, weeks_of_month and days_of_month are invalid
    if (effectiveUnit === 'WEEK') {
      if (reminder.weeks_of_month && reminder.weeks_of_month.length > 0 && result.weeks_of_month === undefined) {
        result.weeks_of_month = null
      }
      if (reminder.days_of_month && reminder.days_of_month.length > 0 && result.days_of_month === undefined) {
        result.days_of_month = null
      }
    }
    return result
  }

  const showUndoToast = (message: string) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    setUndoToast({ message, visible: true })
    undoTimerRef.current = setTimeout(() => {
      setUndoToast(prev => prev ? { ...prev, visible: false } : null)
      setTimeout(() => setUndoToast(null), 300)
    }, 4000)
  }

  const handleUndo = async () => {
    try {
      await api.callTool('undo', {})
      setUndoToast(null)
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
      loadDataRef.current()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Undo failed')
    }
  }

  const searchReminderById = useCallback(async (reminderId: string) => {
    if (!reminderId.trim()) {
      setError('Please enter a reminder ID')
      return
    }
    
    try {
      setError(null)
      setLoading(true)
      const result = await api.callTool('show_matching_reminders', {
        reminder_ids: [reminderId.trim()]
      })
      
      if (result?.reminders && result.reminders.length > 0) {
        setViewingReminder(result.reminders[0])
        setSearchIdInput('')
        setSearchByIdMode(false)
      } else {
        setError('Reminder not found')
        if (requestedSnapshotRecord('generic_reminders') === reminderId) reportMissingSnapshotRecord('generic_reminders', reminderId)
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to find reminder by ID')
    } finally {
      setLoading(false)
    }
  }, [api])

  const refreshApp = useCallback(() => {
    loadDataRef.current()
  }, [])

  useEffect(() => {
    setRefreshHandlerRef.current = setRefreshHandler
  })

  useEffect(() => {
    if (setRefreshHandlerRef.current) {
      setRefreshHandlerRef.current(refreshApp)
    }
    return () => {
      if (setRefreshHandlerRef.current) {
        setRefreshHandlerRef.current(null)
      }
    }
  }, [refreshApp])

  useEffect(() => {
    loadDataRef.current = loadData
  })

  // Trigger loadData when any filter changes (excluding searchQuery which is now on-demand)
  useEffect(() => {
    loadData()
    // Also reload completed reminders to update the count in sidebar and tab
    loadCompletedReminders()
  }, [activeSearchQuery, filterFromDate, filterToDate, filterFromTime, filterToTime, filterIsRecurring])

  // Debounce text search: update activeSearchQuery as user types
  useEffect(() => {
    const timer = setTimeout(() => {
      setActiveSearchQuery(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    loadData()
    // Load completed reminders at startup for sidebar count
    loadCompletedReminders()
    const record = requestedSnapshotRecord('generic_reminders')
    if (record) searchReminderById(record)
  }, [])

  // Load deleted reminders when trash modal is opened
  useEffect(() => {
    if (viewingTrash) {
      loadDeletedReminders()
    }
  }, [viewingTrash])

  // Reload completed reminders when tab changes
  useEffect(() => {
    if (activeTab === 'completed') {
      loadCompletedReminders()
    }
  }, [activeTab])

  const loadData = async () => {
    // Validate time range
    if (filterFromTime && filterToTime && filterFromTime > filterToTime) {
      setTimeRangeError('From Time cannot be after To Time')
      setReminders([])
      return
    }
    setTimeRangeError('')
    
    setLoading(true)
    setError(null)
    try {
      const params: any = {
        include_completed: false
      }
      if (activeSearchQuery) params.query = activeSearchQuery
      if (filterFromDate) params.from_date = filterFromDate
      if (filterToDate) params.to_date = filterToDate
      if (filterFromTime) params.from_time_of_day = `${filterFromTime}:00`
      if (filterToTime) params.to_time_of_day = `${filterToTime}:00`
      if (filterIsRecurring !== null) params.is_recurring = filterIsRecurring
      
      const result = await api.callTool<{ reminders: Reminder[] }>('get_reminders', params)
      const reminderList = result?.reminders || []
      // Sort by start_date and time_of_day (soonest first)
      reminderList.sort((a, b) => {
        const dateA = a.start_date || ''
        const dateB = b.start_date || ''
        if (dateA !== dateB) return dateA.localeCompare(dateB)
        const timeA = a.time_of_day || ''
        const timeB = b.time_of_day || ''
        return timeA.localeCompare(timeB)
      })
      setReminders(reminderList)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reminders')
    } finally {
      setLoading(false)
    }
  }

  const loadCompletedReminders = async () => {
    setLoading(true)
    setError(null)
    try {
      const params: any = {
        include_completed: true
      }
      if (activeSearchQuery) params.query = activeSearchQuery
      if (filterFromDate) params.from_date = filterFromDate
      if (filterToDate) params.to_date = filterToDate
      if (filterFromTime) params.from_time_of_day = `${filterFromTime}:00`
      if (filterToTime) params.to_time_of_day = `${filterToTime}:00`
      if (filterIsRecurring !== null) params.is_recurring = filterIsRecurring
      
      const result = await api.callTool<{ reminders: Reminder[] }>('get_reminders', params)
      const allReminders = result?.reminders || []
      // Filter to only get completed reminders
      const completed = allReminders.filter(r => r.completed)
      // Sort by start_date and time_of_day (soonest first)
      completed.sort((a, b) => {
        const dateA = a.start_date || ''
        const dateB = b.start_date || ''
        if (dateA !== dateB) return dateA.localeCompare(dateB)
        const timeA = a.time_of_day || ''
        const timeB = b.time_of_day || ''
        return timeA.localeCompare(timeB)
      })
      setCompletedReminders(completed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load completed reminders')
    } finally {
      setLoading(false)
    }
  }

  const loadDeletedReminders = async () => {
    setLoadingTrash(true)
    try {
      // Fetch reminders with include_deleted=true to get all deleted reminders from backend
      const result = await api.callTool<{ reminders: Reminder[] }>('get_reminders', {
        include_deleted: true
      })
      const allReminders = result?.reminders || []
      // Filter to only get deleted reminders
      const deleted = allReminders.filter(r => r.deleted)
      setDeletedReminders(deleted)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trash')
    } finally {
      setLoadingTrash(false)
    }
  }

  const handleCreate = async () => {
    if (!newTitle.trim()) return
    
    // Validate date
    if (newDueDate && isDateInPast(newDueDate)) {
      setIsInvalidDate(true)
      setShakeDate(true)
      setTimeout(() => setShakeDate(false), 500)
      return
    }

    setCreateLoading(true)
    try {
      const timeOfDay = newHour !== '' && newMinute !== '' ? `${String(newHour).padStart(2, '0')}:${String(newMinute).padStart(2, '0')}:00` : undefined
      
      const createData: any = {
        title: newTitle.trim(),
        description: newDescription.trim() || undefined,
        start_date: newDueDate || undefined,
        time_of_day: timeOfDay,
        am_pm_or_unknown: timeOfDay ? 'UNKNOWN' : undefined,
      }

      // Add recurrence if enabled
      if (isRecurring) {
        createData.repeat_every_n = parseInt(String(repeatEveryN), 10)
        createData.repeat_interval_unit = repeatUnit
        if (endType === 'date') {
          createData.end_date = recurEndDate || undefined
        } else if (endType === 'count') {
          createData.occurrence_count = parseInt(String(occurenceCount), 10)
        }
        // Only send days_of_week for WEEK if we have selected days
        if (repeatUnit === 'WEEK' && selectedDaysOfWeek.length > 0) {
          createData.days_of_week = selectedDaysOfWeek
        }
        // Only send days_of_month or week pattern for MONTH
        if (repeatUnit === 'MONTH') {
          if (monthPatternType === 'dayOfMonth' && selectedDaysOfMonth.length > 0) {
            createData.days_of_month = selectedDaysOfMonth
          } else if (monthPatternType === 'weekPattern' && selectedDaysOfWeek.length > 0) {
            // For week pattern in month, send days_of_week + weeks_of_month
            createData.days_of_week = selectedDaysOfWeek
            createData.weeks_of_month = [weekOfMonth]
          }
        }
      }

      await api.callTool('create_reminder', createData)
      // Reset form and close modal
      setNewTitle('')
      setNewDescription('')
      setNewDueDate('')
      setNewHour('')
      setNewMinute('')
      setIsInvalidDate(false)
      setIsRecurring(false)
      setRepeatEveryN(1)
      setRepeatUnit('DAY')
      setEndType(null)
      setRecurEndDate('')
      setOccurenceCount('')
      setSelectedDaysOfWeek([])
      setSelectedDaysOfMonth([])
      setMonthPatternType(null)
      setWeekOfMonth('FIRST')
      setShowCreateModal(false)
      // Refresh list
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create reminder')
    } finally {
      setCreateLoading(false)
    }
  }

  const handleEdit = (reminder: Reminder) => {
    setEditingReminder(reminder)
    setNewTitle(reminder.title)
    setNewDescription(reminder.description || '')
    setNewDueDate(reminder.start_date || '')
    
    if (reminder.time_of_day) {
      const [h, m] = reminder.time_of_day.split(':')
      setNewHour(parseInt(h, 10))
      setNewMinute(parseInt(m, 10))
    } else {
      setNewHour('')
      setNewMinute('')
    }

    // Always reset recurrence state first
    setIsRecurring(false)
    setRepeatEveryN(1)
    setRepeatUnit('DAY')
    setEndType(null)
    setRecurEndDate('')
    setOccurenceCount('')
    setSelectedDaysOfWeek([])
    setSelectedDaysOfMonth([])
    setMonthPatternType(null)
    setWeekOfMonth('FIRST')

    // Only set recurrence if reminder has valid repeat_every_n > 0
    if (reminder.repeat_every_n && reminder.repeat_every_n > 0) {
      setIsRecurring(true)
      setRepeatEveryN(reminder.repeat_every_n)
      setRepeatUnit((reminder.repeat_interval_unit as typeof repeatUnit) || 'DAY')
      
      if (reminder.end_date) {
        setEndType('date')
        setRecurEndDate(reminder.end_date)
      } else if (reminder.occurrence_count) {
        setEndType('count')
        setOccurenceCount(reminder.occurrence_count)
      }
      
      if (reminder.days_of_week && reminder.days_of_week.length > 0) {
        setSelectedDaysOfWeek(reminder.days_of_week)
        // For MONTH interval, week pattern means both days_of_week and weeks_of_month were set
        if (reminder.repeat_interval_unit === 'MONTH') {
          setMonthPatternType('weekPattern')
          // Load the selected week from weeks_of_month if available
          if (reminder.weeks_of_month && reminder.weeks_of_month.length > 0) {
            setWeekOfMonth(reminder.weeks_of_month[0] as 'FIRST' | 'SECOND' | 'THIRD' | 'FOURTH' | 'LAST')
          }
        }
      }
      if (reminder.days_of_month && reminder.days_of_month.length > 0) {
        setSelectedDaysOfMonth(reminder.days_of_month)
        setMonthPatternType('dayOfMonth')
      }
    }
    
    setShowCreateModal(true)
  }

  const handleDelete = async (reminder: Reminder) => {
    const confirmed = window.confirm(`Are you sure you want to delete "${reminder.title}"? This action cannot be undone.`)
    if (!confirmed) return

    setCreateLoading(true)
    try {
      // Call backend API to mark reminder as deleted
      await api.callTool('modify_reminder', {
        reminder_ids: [reminder.id],
        deleted: true,
        is_bulk_mutation: false
      })
      
      // Update frontend state - mark as deleted instead of removing
      setReminders(reminders.map(r => 
        r.id === reminder.id ? { ...r, deleted: true } : r
      ))
      
      // Add to deleted reminders list
      setDeletedReminders([...deletedReminders, { ...reminder, deleted: true }])

      // Close modal if editing
      if (editingReminder?.id === reminder.id) {
        closeModal()
      }
      // Close view modal if viewing
      if (viewingReminder?.id === reminder.id) {
        setViewingReminder(null)
      }
      showUndoToast(`Deleted "${reminder.title}"`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete reminder')
    } finally {
      setCreateLoading(false)
    }
  }

  const handleRestore = async (reminder: Reminder) => {
    setCreateLoading(true)
    try {
      // Call backend API to restore reminder (set deleted: false)
      await api.callTool('modify_reminder', {
        reminder_ids: [reminder.id],
        deleted: false,
        is_bulk_mutation: false
      })
      
      // Update frontend state - mark as not deleted in both lists
      setReminders([...reminders, { ...reminder, deleted: false }])
      setDeletedReminders(deletedReminders.filter(r => r.id !== reminder.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore reminder')
    } finally {
      setCreateLoading(false)
    }
  }

  const handleComplete = async (reminder: Reminder) => {
    // Prevent completing past reminders - backend doesn't allow this
    if (isPastReminder(reminder) && !reminder.completed) {
      setError('Past reminders can only have their title and description modified')
      return
    }

    try {
      // Call backend API to toggle completion status
      await api.callTool('modify_reminder', {
        reminder_ids: [reminder.id],
        completed: !reminder.completed,
        is_bulk_mutation: false
      })
      
      // Update frontend state based on new completion status
      if (reminder.completed) {
        // Moving from completed to incomplete
        setCompletedReminders(completedReminders.filter(r => r.id !== reminder.id))
        setReminders([...reminders, { ...reminder, completed: false }])
        showUndoToast(`Marked "${reminder.title}" incomplete`)
      } else {
        // Moving from incomplete to completed
        setReminders(reminders.filter(r => r.id !== reminder.id))
        setCompletedReminders([...completedReminders, { ...reminder, completed: true }])
        showUndoToast(`Completed "${reminder.title}"`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update reminder status')
    }
  }

  const handleUpdate = async () => {
    if (!newTitle.trim() || !editingReminder) return

    // Validate date
    if (newDueDate && isDateInPast(newDueDate)) {
      setIsInvalidDate(true)
      setShakeDate(true)
      setTimeout(() => setShakeDate(false), 500)
      return
    }

    setCreateLoading(true)
    try {
      // Build update object - only include fields that have been changed
      const updateData: any = {
        reminder_ids: [editingReminder.id],
        is_bulk_mutation: false,
      }

      // Only send title if changed
      if (newTitle.trim() !== editingReminder.title) {
        updateData.title = newTitle.trim()
      }

      // Only send description if changed (empty string = keep existing)
      const newDesc = newDescription.trim()
      const oldDesc = editingReminder.description || ''
      if (newDesc !== oldDesc) {
        updateData.description = newDesc || null
      }

      // Only send start_date if changed
      if (newDueDate !== (editingReminder.start_date || '')) {
        updateData.start_date = newDueDate || null
      }

      // Only send time_of_day and am_pm_or_unknown if time changed
      const newTime = newHour !== '' && newMinute !== '' ? `${String(newHour).padStart(2, '0')}:${String(newMinute).padStart(2, '0')}:00` : ''
      const oldTime = editingReminder.time_of_day || ''
      if (newTime !== oldTime) {
        updateData.time_of_day = newTime || null
        // Only set am_pm_or_unknown when explicitly setting time_of_day
        if (newTime) {
          updateData.am_pm_or_unknown = 'UNKNOWN'
        }
      }

      // Handle recurrence updates
      if (isRecurring) {
        // Always send repeat_every_n when enabling recurrence
        const newRepeatEveryN = parseInt(String(repeatEveryN), 10)
        if (!editingReminder.repeat_every_n || editingReminder.repeat_every_n === 0 || newRepeatEveryN !== editingReminder.repeat_every_n) {
          updateData.repeat_every_n = newRepeatEveryN
        }
        if (repeatUnit !== (editingReminder.repeat_interval_unit || 'DAY')) {
          updateData.repeat_interval_unit = repeatUnit
        }
        if (endType === 'date' && recurEndDate !== (editingReminder.end_date || '')) {
          updateData.end_date = recurEndDate || null
        } else if (endType === 'count' && parseInt(String(occurenceCount), 10) !== (editingReminder.occurrence_count || 0)) {
          updateData.occurrence_count = parseInt(String(occurenceCount), 10)
        }
        // Only send days_of_week for WEEK if we have selected days
        if (repeatUnit === 'WEEK') {
          if (selectedDaysOfWeek.length > 0) {
            updateData.days_of_week = selectedDaysOfWeek
          } else if (editingReminder.days_of_week) {
            // Clear if switched away from WEEK
            updateData.days_of_week = null
          }
        } else if (editingReminder.days_of_week) {
          // Clear days_of_week if switching to a unit that doesn't support it
          updateData.days_of_week = null
        }
        // Only send days_of_month or week pattern for MONTH
        if (repeatUnit === 'MONTH') {
          if (monthPatternType === 'dayOfMonth' && selectedDaysOfMonth.length > 0) {
            updateData.days_of_month = selectedDaysOfMonth
            // Clear week pattern fields if switching
            if (editingReminder.days_of_week) {
              updateData.days_of_week = null
            }
          } else if (monthPatternType === 'weekPattern' && selectedDaysOfWeek.length > 0) {
            // For week pattern in month, send days_of_week + weeks_of_month
            updateData.days_of_week = selectedDaysOfWeek
            updateData.weeks_of_month = [weekOfMonth]
            // Clear day-of-month if switching
            if (editingReminder.days_of_month) {
              updateData.days_of_month = null
            }
          } else if (editingReminder.days_of_month || editingReminder.days_of_week) {
            // Clear if no selection
            updateData.days_of_month = null
            updateData.days_of_week = null
          }
        } else if (editingReminder.days_of_month) {
          // Clear days_of_month if switching to a unit that doesn't support it
          updateData.days_of_month = null
        }
      } else {
        // If turning off recurrence, clear all recurrence fields (use 0 to disable, not null)
        if (editingReminder.repeat_every_n) {
          updateData.repeat_every_n = 0
          updateData.repeat_interval_unit = null
          updateData.end_date = null
          updateData.occurrence_count = null
          updateData.days_of_week = null
          updateData.days_of_month = null
        }
      }

      await api.callTool('modify_reminder', updateData)
      // Reset form and close modal
      setNewTitle('')
      setNewDescription('')
      setNewDueDate('')
      setNewHour('')
      setNewMinute('')
      
      // Update viewingReminder if it's the same reminder being edited
      if (viewingReminder && viewingReminder.id === editingReminder.id) {
        const updatedReminder = { ...viewingReminder, ...updateData }
        setViewingReminder(updatedReminder)
      }
      
      setEditingReminder(null)
      setIsInvalidDate(false)
      setShowCreateModal(false)
      // Refresh list
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update reminder')
    } finally {
      setCreateLoading(false)
    }
  }

  const closeModal = () => {
    setShowCreateModal(false)
    setEditingReminder(null)
    setNewTitle('')
    setNewDescription('')
    setNewDueDate('')
    setNewHour('')
    setNewMinute('')
    setIsInvalidDate(false)
    setShakeDate(false)
    setIsRecurring(false)
    setRepeatEveryN(1)
    setRepeatUnit('DAY')
    setEndType(null)
    setRecurEndDate('')
    setOccurenceCount('')
    setSelectedDaysOfWeek([])
    setSelectedDaysOfMonth([])
    setMonthPatternType(null)
    setWeekOfMonth('FIRST')
  }

  const isPastReminder = (reminder: Reminder): boolean => {
    if (!reminder.start_date) return false
    
    // Use UTC to avoid timezone issues with backend
    const now = new Date()
    const today = now.getUTCFullYear() + '-' + 
                  String(now.getUTCMonth() + 1).padStart(2, '0') + '-' + 
                  String(now.getUTCDate()).padStart(2, '0')
    
    // Extract just the date part in case start_date includes time
    const reminderDateOnly = reminder.start_date.split('T')[0] || reminder.start_date.substring(0, 10)
    
    // Only consider old if date is strictly before today
    return reminderDateOnly < today
  }

  const isDateInPast = (dateStr: string): boolean => {
    if (!dateStr) return false
    
    // Use UTC to avoid timezone issues with backend
    const now = new Date()
    const today = now.getUTCFullYear() + '-' + 
                  String(now.getUTCMonth() + 1).padStart(2, '0') + '-' + 
                  String(now.getUTCDate()).padStart(2, '0')
    
    // Extract just the date part in case dateStr includes time
    const dateOnly = dateStr.split('T')[0] || dateStr.substring(0, 10)
    
    // Only dates strictly before today are considered past
    return dateOnly < today
  }

  const handleDateChange = (newDate: string) => {
    setNewDueDate(newDate)
    const invalid = isDateInPast(newDate)
    setIsInvalidDate(invalid)
    if (invalid) {
      setShakeDate(true)
      setTimeout(() => setShakeDate(false), 500)
    }
  }

  const formatDateTime = (date?: string, time?: string) => {
    if (!date && !time) return null
    const parts = []
    if (date) {
      const d = new Date(date + 'T00:00:00')
      parts.push(d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }))
    }
    if (time) {
      const timeParts = time.split(':')
      const h = timeParts[0]
      const m = timeParts[1]
      if (h && m) {
        const hour = parseInt(h, 10)
        const ampm = hour >= 12 ? 'PM' : 'AM'
        const hour12 = hour % 12 || 12
        parts.push(`${hour12}:${m} ${ampm}`)
      }
    }
    return parts.join(' at ')
  }

  return (
    <div className="h-full flex flex-col bg-[var(--bg-primary)] relative">
      {/* Undo Toast */}
      {undoToast && (
        <div
          className="absolute top-4 left-1/2 z-50 flex items-center gap-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] shadow-lg rounded-xl px-4 py-3"
          style={{
            transform: `translateX(-50%) ${undoToast.visible ? 'translateY(0)' : 'translateY(-20px)'}`,
            opacity: undoToast.visible ? 1 : 0,
            transition: 'transform 0.3s ease, opacity 0.3s ease',
          }}
        >
          <span className="text-sm text-[var(--text-primary)]">{undoToast.message}</span>
          <button
            onClick={handleUndo}
            className="text-sm font-semibold text-blue-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50"
          >
            Undo
          </button>
        </div>
      )}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
        .scrollbar {
          scrollbar-width: thin;
          scrollbar-color: var(--border-color) var(--bg-primary);
        }
        .scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .scrollbar::-webkit-scrollbar-track {
          background: var(--bg-primary);
        }
        .scrollbar::-webkit-scrollbar-thumb {
          background: var(--border-color);
          border-radius: 4px;
        }
        .scrollbar::-webkit-scrollbar-thumb:hover {
          background: var(--text-secondary);
        }
      `}</style>

      {/* Top Toolbar */}
      <div className="h-16 bg-[var(--bg-secondary)] border-b border-[var(--border-color)] flex items-center justify-between px-4 gap-4 flex-shrink-0">
        {/* Left: App Icon and Title */}
        <div className="flex items-center gap-3 min-w-fit">
          <svg className="w-8 h-8 text-[var(--accent-color)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <h1 className="text-lg font-bold text-[var(--text-primary)]">Reminders</h1>
        </div>

        {/* Center: Search Bar */}
        <div className="flex-1 flex items-center gap-2 max-w-md">
          {searchByIdMode ? (
            <>
              <input
                type="text"
                placeholder="Enter reminder ID..."
                value={searchIdInput}
                onChange={(e) => setSearchIdInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && searchIdInput.trim() && searchReminderById(searchIdInput)}
                className="flex-1 px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
                autoFocus
              />
              <button
                onClick={() => searchReminderById(searchIdInput)}
                disabled={!searchIdInput.trim()}
                className="p-2 hover:bg-[var(--accent-color)] rounded-lg transition-colors text-[var(--accent-color)] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                title="Search (Enter)"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
              <button
                onClick={() => {
                  setSearchByIdMode(false)
                  setSearchIdInput('')
                  setError(null)
                }}
                className="px-3 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--border-color)] text-[var(--text-secondary)] rounded-lg transition-colors text-sm font-medium"
                title="Back to text search"
              >
                Back
              </button>
            </>
          ) : (
            <>
              <input
                type="text"
                placeholder="Search reminders..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') setActiveSearchQuery(searchQuery) }}
                className="flex-1 px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
              />
              <button
                onClick={() => setActiveSearchQuery(searchQuery)}
                className="p-2 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors text-[var(--text-secondary)] hover:text-[var(--accent-color)]"
                title="Search"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
              <button
                className="px-3 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--border-color)] text-[var(--text-secondary)] rounded-lg transition-colors text-sm font-medium"
                title="Switch to ID search"
                onClick={() => {
                  setSearchByIdMode(true)
                  setSearchQuery('')
                  setActiveSearchQuery('')
                }}
              >
                Search by ID
              </button>
              <button
                className="p-2 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors text-[var(--text-secondary)] hover:text-[var(--accent-color)]"
                title="Filter reminders"
                onClick={() => setShowFilters(!showFilters)}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
              </button>
            </>
          )}
        </div>

        {/* Right: Spacer */}
        <div className="w-64 flex-shrink-0" />
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="h-auto bg-[var(--bg-secondary)] border-b border-[var(--border-color)] px-4 py-4 flex-shrink-0">
          <div className="grid grid-cols-5 gap-4">
            {/* Date Range */}
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">From Date {!filterFromDate && <span className="text-[var(--text-tertiary)] italic">(inactive)</span>}</label>
              <input
                type="date"
                value={filterFromDate}
                onChange={(e) => setFilterFromDate(e.target.value)}
                className="w-full px-2 py-1 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">To Date {!filterToDate && <span className="text-[var(--text-tertiary)] italic">(inactive)</span>}</label>
              <input
                type="date"
                value={filterToDate}
                onChange={(e) => setFilterToDate(e.target.value)}
                className="w-full px-2 py-1 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
              />
            </div>

            {/* Time Range */}
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">From Time {!filterFromTime && <span className="text-[var(--text-tertiary)] italic">(inactive)</span>}</label>
              <input
                type="time"
                value={filterFromTime}
                onChange={(e) => setFilterFromTime(e.target.value)}
                className={`w-full px-2 py-1 bg-[var(--bg-primary)] border rounded text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 ${
                  timeRangeError ? 'border-red-500 focus:ring-red-500' : 'border-[var(--border-color)] focus:ring-[var(--accent-color)]'
                }`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">To Time {!filterToTime && <span className="text-[var(--text-tertiary)] italic">(inactive)</span>}</label>
              <input
                type="time"
                value={filterToTime}
                onChange={(e) => setFilterToTime(e.target.value)}
                className={`w-full px-2 py-1 bg-[var(--bg-primary)] border rounded text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 ${
                  timeRangeError ? 'border-red-500 focus:ring-red-500' : 'border-[var(--border-color)] focus:ring-[var(--accent-color)]'
                }`}
              />
            </div>

            {/* Recurring Filter */}
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Type {filterIsRecurring === null && <span className="text-[var(--text-tertiary)] italic">(inactive)</span>}</label>
              <select
                value={filterIsRecurring === null ? 'all' : filterIsRecurring ? 'recurring' : 'non-recurring'}
                onChange={(e) => {
                  if (e.target.value === 'all') setFilterIsRecurring(null)
                  else setFilterIsRecurring(e.target.value === 'recurring')
                }}
                className="w-full px-2 py-1 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
              >
                <option value="all">All</option>
                <option value="recurring">Recurring</option>
                <option value="non-recurring">Non-recurring</option>
              </select>
            </div>
          </div>

          {/* Error Message */}
          {timeRangeError && (
            <div className="mt-2 px-3 py-2 bg-red-500/20 border border-red-500/50 rounded text-sm text-red-600 font-medium">
              {timeRangeError}
            </div>
          )}

          {/* Clear Filters Button */}
          <div className="mt-3">
            <button
              onClick={() => {
                setFilterFromDate('')
                setFilterToDate('')
                setFilterFromTime('')
                setFilterToTime('')
                setFilterIsRecurring(null)
                setTimeRangeError('')
                setSearchQuery('')
                setActiveSearchQuery('')
              }}
              className="px-3 py-1 text-xs bg-[var(--bg-tertiary)] hover:bg-[var(--bg-primary)] text-[var(--text-secondary)] rounded transition-colors"
            >
              Clear Filters
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Reminders List */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-[var(--border-color)]">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-8 h-8 border-4 border-[var(--accent-color)]/30 border-t-[var(--accent-color)] rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 p-4">
              <p className="text-[var(--danger-color)]">{error}</p>
              <button
                className="px-4 py-2 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-colors font-medium"
                onClick={loadData}
              >
                Retry
              </button>
            </div>
          ) : reminders.length === 0 && completedReminders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] p-4">
              <svg className="w-16 h-16 mb-3 text-[var(--text-tertiary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-lg">{searchQuery || filterFromDate || filterToDate || filterFromTime || filterToTime || filterIsRecurring !== null ? 'No reminders found' : 'No reminders'}</p>
              <p className="text-sm mt-1">{searchQuery || filterFromDate || filterToDate || filterFromTime || filterToTime || filterIsRecurring !== null ? 'Try different filters' : 'Create one using the + button'}</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Tabs */}
              <div className="flex-shrink-0 border-b border-[var(--border-color)] px-4 pt-3 pb-0">
                <div className="flex gap-2">
                  <button
                    onClick={() => setActiveTab('incomplete')}
                    className={`px-4 py-2 rounded-t-lg font-medium text-sm transition-colors border-b-2 ${
                      activeTab === 'incomplete'
                        ? 'text-[var(--accent-color)] border-[var(--accent-color)] bg-[var(--accent-color)]/5'
                        : 'text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)]'
                    }`}
                  >
                    Incomplete ({reminders.filter(r => !r.deleted).length})
                  </button>
                  <button
                    onClick={() => setActiveTab('completed')}
                    className={`px-4 py-2 rounded-t-lg font-medium text-sm transition-colors border-b-2 ${
                      activeTab === 'completed'
                        ? 'text-[var(--success-color)] border-[var(--success-color)] bg-[var(--success-color)]/5'
                        : 'text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)]'
                    }`}
                  >
                    Completed ({completedReminders.length})
                  </button>
                </div>
              </div>

              {/* Reminders List */}
              <div className="flex-1 overflow-auto p-4 space-y-3">
              {activeTab === 'incomplete' ? (
                <>
                  {reminders
                    .filter(r => !r.deleted)
                    .map(reminder => {
                      const isPast = isPastReminder(reminder)
                    return (
                      <div
                        key={reminder.id}
                        onClick={() => setViewingReminder(reminder)}
                        className="p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] shadow-sm transition-all relative cursor-pointer hover:shadow-md hover:border-[var(--accent-color)]/50"
                      >
                        {/* Top right buttons */}
                        <div className="absolute top-3 right-3 flex gap-1">
                          <button
                            disabled={isPast}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isPast
                                ? 'text-[var(--text-tertiary)] cursor-not-allowed opacity-50'
                                : 'hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--success-color)]'
                            }`}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleComplete(reminder)
                            }}
                            title={isPast ? 'Past reminders cannot be marked complete' : 'Mark as complete'}
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                          <button
                            className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors text-[var(--text-secondary)] hover:text-[var(--accent-color)]"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleEdit(reminder)
                            }}
                            title="Edit reminder"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors text-[var(--text-secondary)] hover:text-[var(--danger-color)]"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDelete(reminder)
                            }}
                            title="Delete reminder"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                        
                        <div className="flex items-start gap-3 pr-20">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-[var(--text-primary)]">
                              {reminder.title}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{reminder.id}]</span>
                            </div>
                            {reminder.description && (
                              <div className="text-sm text-[var(--text-secondary)] mt-1 line-clamp-2">
                                {reminder.description}
                              </div>
                            )}
                            {(reminder.schedule && reminder.schedule !== 'No schedule set') ? (
                              <div className="text-xs mt-2 flex items-center gap-1 text-[var(--text-tertiary)]">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                {reminder.schedule}
                              </div>
                            ) : (reminder.start_date || reminder.time_of_day) ? (
                              <div className="text-xs mt-2 flex items-center gap-1 text-[var(--text-tertiary)]">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                {formatDateTime(reminder.start_date, reminder.time_of_day)}
                              </div>
                            ) : null}
                            {(isPast || (reminder.repeat_every_n ?? 0) > 0) && (
                              <div className="mt-2 flex items-center gap-2 flex-wrap">
                                {isPast && (
                                  <div className="text-[var(--text-tertiary)] text-xs font-medium">
                                    Old Reminder
                                  </div>
                                )}
                                {(reminder.repeat_every_n ?? 0) > 0 && (
                                  <div className="text-[var(--accent-color)] text-xs font-medium">
                                    Recurring
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {reminders.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] p-4">
                      <svg className="w-16 h-16 mb-3 text-[var(--text-tertiary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-lg">{searchQuery || filterFromDate || filterToDate || filterFromTime || filterToTime || filterIsRecurring !== null ? 'No reminders found' : 'No reminders'}</p>
                      <p className="text-sm mt-1">{searchQuery || filterFromDate || filterToDate || filterFromTime || filterToTime || filterIsRecurring !== null ? 'Try different filters' : 'Create one using the + button'}</p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {completedReminders.map(reminder => (
                    <div
                      key={reminder.id}
                      onClick={() => setViewingReminder(reminder)}
                      className="p-4 rounded-xl border border-[var(--success-color)]/30 bg-[var(--success-color)]/10 shadow-sm transition-all relative cursor-pointer hover:shadow-md"
                    >
                      {/* Top right buttons */}
                      <div className="absolute top-3 right-3 flex gap-1">
                        <button
                          className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors text-[var(--success-color)]"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleComplete(reminder)
                          }}
                          title="Mark as incomplete"
                        >
                          <svg className="w-5 h-5" fill="currentColor" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </button>
                      </div>
                      
                      <div className="flex items-start gap-3 pr-20">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-[var(--text-secondary)] line-through">
                            {reminder.title}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)', textDecoration: 'none' }}>[{reminder.id}]</span>
                          </div>
                          {reminder.description && (
                            <div className="text-sm text-[var(--text-tertiary)] mt-1 line-clamp-2 line-through">
                              {reminder.description}
                            </div>
                          )}
                          {(reminder.schedule && reminder.schedule !== 'No schedule set') ? (
                            <div className="text-xs mt-2 flex items-center gap-1 text-[var(--text-tertiary)]">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              {reminder.schedule}
                            </div>
                          ) : (reminder.start_date || reminder.time_of_day) ? (
                            <div className="text-xs mt-2 flex items-center gap-1 text-[var(--text-tertiary)]">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              {formatDateTime(reminder.start_date, reminder.time_of_day)}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                  {completedReminders.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] p-4">
                      <svg className="w-16 h-16 mb-3 text-[var(--text-tertiary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-lg">No completed reminders</p>
                      <p className="text-sm mt-1">Complete reminders to see them here</p>
                    </div>
                  )}
                </>
              )}
            </div>
            </div>
          )}
        </div>

        {/* Right: Sidebar with Quick Actions */}
        <div className="w-64 flex flex-col bg-[var(--bg-secondary)] border-l border-[var(--border-color)] flex-shrink-0 overflow-hidden">
          {/* Quick Actions Section */}
          <div className="p-4 border-b border-[var(--border-color)] space-y-2">
            <button
              onClick={() => {
                // Set default time to current time + 5 minutes
                const now = new Date()
                const futureTime = new Date(now.getTime() + 5 * 60000)
                setNewHour(futureTime.getHours())
                setNewMinute(futureTime.getMinutes())
                setShowCreateModal(true)
              }}
              className="w-full px-4 py-3 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
              title="Create new reminder"
            >
              <span className="text-lg">+</span>
              <span>New Reminder</span>
            </button>
            <button
              onClick={loadData}
              className="w-full px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--border-color)] rounded-lg transition-colors text-sm font-medium text-[var(--text-primary)] flex items-center justify-center gap-2"
              title="Refresh reminders list"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>

          {/* All Reminders Section */}
          <div className="flex-1 p-4 border-b border-[var(--border-color)] overflow-auto">
            <h3 className="text-xs font-semibold text-[var(--text-tertiary)] uppercase mb-3">All Reminders</h3>
            <div className="space-y-2">
              <button onClick={() => { setActiveTab('incomplete'); setFilterIsRecurring(null); }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors text-sm text-[var(--text-primary)] font-medium flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                All ({reminders.filter(r => !r.deleted).length})
              </button>
              <button onClick={() => { setActiveTab('completed'); setFilterIsRecurring(null); }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors text-sm text-[var(--text-primary)] flex items-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Completed ({completedReminders.length})
              </button>
              <button onClick={() => { setActiveTab('incomplete'); setFilterIsRecurring(null); }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors text-sm text-[var(--text-primary)] flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Pending ({reminders.filter(r => !r.deleted).length})
              </button>
              {reminders.filter(r => r.repeat_every_n && r.repeat_every_n > 0 && !r.deleted).length > 0 && (
                <button onClick={() => { setActiveTab('incomplete'); setFilterIsRecurring(true); }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors text-sm text-[var(--text-primary)] flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Recurring ({reminders.filter(r => r.repeat_every_n && r.repeat_every_n > 0 && !r.deleted).length})
                </button>
              )}
            </div>
          </div>

          {/* Trash Section */}
          <div className="p-4 border-t border-[var(--border-color)]">
            <button 
              onClick={() => setViewingTrash(true)}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors text-sm text-[var(--danger-color)] font-medium flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Trash
            </button>
          </div>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--bg-secondary)] rounded-xl shadow-xl w-full max-w-3xl mx-4 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-[var(--border-color)] flex-shrink-0">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                {editingReminder ? 'Edit Reminder' : 'New Reminder'}
              </h2>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {/* Title and Description - Full Width */}
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                    Title <span className="text-[var(--danger-color)]">*</span>
                  </label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    placeholder="What do you need to remember?"
                    className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                    Description
                  </label>
                  <textarea
                    value={newDescription}
                    onChange={e => setNewDescription(e.target.value)}
                    placeholder="Add details (optional)"
                    rows={3}
                    className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] resize-none"
                  />
                </div>
              </div>

              {/* Two Column Layout - Schedule and Recurrence */}
              <div className="space-y-6">
                {/* Schedule Section */}
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-3">
                    Schedule
                  </label>
                  <div className="space-y-3">
                    <div className="flex gap-2 items-center h-10">
                      {/* Date Picker */}
                      <div className="flex-1 h-full">
                        <input
                          type="date"
                          value={newDueDate}
                          onChange={e => handleDateChange(e.target.value)}
                          className={`w-full h-full px-3 py-2 text-sm bg-[var(--bg-primary)] border rounded transition-all ${
                            isInvalidDate
                              ? 'border-[var(--danger-color)] focus:ring-2 focus:ring-[var(--danger-color)]'
                              : 'border-[var(--border-color)] focus:ring-2 focus:ring-[var(--accent-color)]'
                          } text-[var(--text-primary)] focus:outline-none ${shakeDate ? 'animate-shake' : ''}`}
                          style={shakeDate ? {
                            animation: 'shake 0.5s ease-in-out'
                          } : undefined}
                        />
                      </div>

                      {/* Time Picker - Minimalist Design */}
                      <div className="flex items-center bg-[var(--bg-primary)] border border-[var(--border-color)] rounded px-2 py-2 gap-1 h-full">
                        {/* Hour Input */}
                        <input
                          type="number"
                          min="0"
                          max="23"
                          value={newHour === '' ? '' : String(newHour).padStart(2, '0')}
                          onChange={e => setNewHour(e.target.value === '' ? '' : Math.min(23, Math.max(0, parseInt(e.target.value, 10))))}
                          placeholder="--"
                          className="w-8 h-6 text-center bg-transparent text-sm font-medium text-[var(--text-primary)] focus:outline-none focus:bg-[var(--bg-secondary)] rounded transition-colors"
                        />

                        {/* Separator */}
                        <span className="text-[var(--text-tertiary)] font-light">:</span>

                        {/* Minute Input */}
                        <input
                          type="number"
                          min="0"
                          max="59"
                          value={newMinute === '' ? '' : String(newMinute).padStart(2, '0')}
                          onChange={e => setNewMinute(e.target.value === '' ? '' : Math.min(59, Math.max(0, parseInt(e.target.value, 10))))}
                          placeholder="--"
                          className="w-8 h-6 text-center bg-transparent text-sm font-medium text-[var(--text-primary)] focus:outline-none focus:bg-[var(--bg-secondary)] rounded transition-colors"
                        />

                        {/* Clear button */}
                        {(newHour !== '' || newMinute !== '') && (
                          <button
                            type="button"
                            onClick={() => {
                              setNewHour('')
                              setNewMinute('')
                            }}
                            className="ml-1 px-1.5 py-0 rounded text-xs font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                    {isInvalidDate && (
                      <p className="text-xs text-[var(--danger-color)] font-medium">Date cannot be in the past</p>
                    )}
                    <p className="text-xs text-[var(--text-tertiary)]">Time default: current + 5 min</p>
                  </div>
                </div>

                {/* Recurrence Section */}
                <div>
                  <label className="flex items-center gap-2 mb-3">
                    <input
                      type="checkbox"
                      checked={isRecurring}
                      onChange={e => {
                        setIsRecurring(e.target.checked)
                        if (!e.target.checked) {
                          setRepeatEveryN(1)
                          setRepeatUnit('DAY')
                          setEndType(null)
                          setRecurEndDate('')
                          setOccurenceCount('')
                          setSelectedDaysOfWeek([])
                          setSelectedDaysOfMonth([])
                        }
                      }}
                      className="w-4 h-4 rounded border-[var(--border-color)] bg-[var(--bg-primary)] checked:bg-[var(--accent-color)] checked:border-[var(--accent-color)] text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-0 cursor-pointer"
                    />
                    <span className="text-sm font-medium text-[var(--text-secondary)]">Make this reminder recurrent</span>
                  </label>

                  {isRecurring && (
                    <div className="space-y-4 pt-2 border-t border-[var(--border-color)]">
                      {/* Primary: Repeat pattern */}
                      <div>
                        <p className="text-xs text-[var(--text-tertiary)] font-medium mb-2">Repeat pattern</p>
                        <div className="flex gap-2 items-center">
                          <span className="text-xs text-[var(--text-secondary)]">Every</span>
                          <input
                            type="number"
                            min="1"
                            max="999"
                            value={repeatEveryN}
                            onChange={e => setRepeatEveryN(e.target.value === '' ? 1 : Math.max(1, parseInt(e.target.value, 10)))}
                            className="w-14 px-2 py-1.5 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
                          />
                          <select
                            value={repeatUnit}
                            onChange={e => {
                              const newUnit = e.target.value
                              setRepeatUnit(newUnit)
                              // Clear selected days when switching units
                              if (newUnit !== 'WEEK') setSelectedDaysOfWeek([])
                              if (newUnit !== 'MONTH') {
                                setSelectedDaysOfMonth([])
                                setMonthPatternType(null)
                              }
                            }}
                            className="flex-1 px-2 py-1.5 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
                          >
                            <option value="MINUTE">Minute(s)</option>
                            <option value="HOUR">Hour(s)</option>
                            <option value="DAY">Day(s)</option>
                            <option value="WEEK">Week(s)</option>
                            <option value="MONTH">Month(s)</option>
                            <option value="YEAR">Year(s)</option>
                          </select>
                        </div>
                      </div>

                      {/* Days of week selector - only for WEEK */}
                      {repeatUnit === 'WEEK' && (
                        <div>
                          <p className="text-xs text-[var(--text-tertiary)] font-medium mb-2">Repeats on</p>
                          <div className="grid grid-cols-7 gap-1">
                            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, idx) => {
                              const dayNames = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
                              const dayName = dayNames[idx]
                              const isSelected = selectedDaysOfWeek.includes(dayName)
                              return (
                                <button
                                  key={day}
                                  onClick={() => {
                                    if (isSelected) {
                                      setSelectedDaysOfWeek(selectedDaysOfWeek.filter(d => d !== dayName))
                                    } else {
                                      setSelectedDaysOfWeek([...selectedDaysOfWeek, dayName])
                                    }
                                  }}
                                  className={`py-1.5 px-1 rounded text-xs font-medium transition-colors ${
                                    isSelected
                                      ? 'bg-[var(--accent-color)] text-white'
                                      : 'bg-[var(--bg-primary)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                                  }`}
                                >
                                  {day}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Days of month selector - only for MONTH */}
                      {repeatUnit === 'MONTH' && (
                        <div className="space-y-3">
                          <p className="text-xs text-[var(--text-tertiary)] font-medium mb-2">Repeats on</p>
                          
                          {/* Day of month option */}
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="monthPattern"
                              value="dayOfMonth"
                              checked={monthPatternType === 'dayOfMonth'}
                              onChange={() => {
                                setMonthPatternType('dayOfMonth')
                                setSelectedDaysOfWeek([])
                                setSelectedDaysOfMonth([])
                                // Auto-set to current date's day if no selection exists
                                if (newDueDate) {
                                  const date = new Date(newDueDate)
                                  setSelectedDaysOfMonth([String(date.getDate())])
                                } else {
                                  setSelectedDaysOfMonth(['1'])
                                }
                              }}
                              className="w-3.5 h-3.5 text-[var(--accent-color)] border-[var(--border-color)] focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-0 cursor-pointer"
                            />
                            <span className="text-xs text-[var(--text-secondary)]">Day of month</span>
                          </label>
                          
                          {monthPatternType === 'dayOfMonth' && (
                            <div className="ml-6 grid grid-cols-7 gap-1">
                              {Array.from({ length: 31 }, (_, i) => String(i + 1)).map(day => (
                                <button
                                  key={day}
                                  type="button"
                                  onClick={() => setSelectedDaysOfMonth([day])}
                                  className={`py-1 px-1 rounded text-xs font-medium transition-colors ${
                                    selectedDaysOfMonth.includes(day)
                                      ? 'bg-[var(--accent-color)] text-white'
                                      : 'bg-[var(--bg-primary)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                                  }`}
                                >
                                  {day}
                                </button>
                              ))}
                            </div>
                          )}
                          
                          {/* Week pattern option */}
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="monthPattern"
                              value="weekPattern"
                              checked={monthPatternType === 'weekPattern'}
                              onChange={() => {
                                setMonthPatternType('weekPattern')
                                setSelectedDaysOfMonth([])
                                setSelectedDaysOfWeek([])
                                // Auto-set to current date's day if no selection exists
                                if (newDueDate) {
                                  const date = new Date(newDueDate)
                                  const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
                                  setSelectedDaysOfWeek([dayNames[date.getDay()]])
                                } else {
                                  setSelectedDaysOfWeek(['MONDAY'])
                                }
                              }}
                              className="w-3.5 h-3.5 text-[var(--accent-color)] border-[var(--border-color)] focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-0 cursor-pointer"
                            />
                            <span className="text-xs text-[var(--text-secondary)]">Week pattern (e.g., 2nd Tuesday)</span>
                          </label>
                          
                          {monthPatternType === 'weekPattern' && (
                            <div className="ml-6 space-y-3">
                              <div>
                                <p className="text-xs text-[var(--text-tertiary)] mb-1.5">Which week?</p>
                                <select
                                  value={weekOfMonth}
                                  onChange={e => setWeekOfMonth(e.target.value as 'FIRST' | 'SECOND' | 'THIRD' | 'FOURTH' | 'LAST')}
                                  className="w-full px-2 py-1.5 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
                                >
                                  <option value="FIRST">1st</option>
                                  <option value="SECOND">2nd</option>
                                  <option value="THIRD">3rd</option>
                                  <option value="FOURTH">4th</option>
                                  <option value="LAST">Last</option>
                                </select>
                              </div>
                              <div>
                                <p className="text-xs text-[var(--text-tertiary)] mb-1.5">Which day?</p>
                                <div className="grid grid-cols-7 gap-1">
                                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, idx) => {
                                    const dayNames = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
                                    const dayName = dayNames[idx]
                                    const isSelected = selectedDaysOfWeek.includes(dayName)
                                    return (
                                      <button
                                        key={day}
                                        type="button"
                                        onClick={() => setSelectedDaysOfWeek([dayName])}
                                        className={`py-1 px-1 rounded text-xs font-medium transition-colors ${
                                          isSelected
                                            ? 'bg-[var(--accent-color)] text-white'
                                            : 'bg-[var(--bg-primary)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                                        }`}
                                      >
                                        {day}
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Tertiary: End condition */}
                      <div className="pt-2 border-t border-[var(--border-color)]">
                        <p className="text-xs text-[var(--text-tertiary)] font-medium mb-2">Ends</p>
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="endType"
                              value="never"
                              checked={!endType}
                              onChange={() => {
                                setEndType(null)
                                setOccurenceCount('')
                                setRecurEndDate('')
                              }}
                              className="w-3.5 h-3.5 text-[var(--accent-color)] border-[var(--border-color)] focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-0 cursor-pointer"
                            />
                            <span className="text-xs text-[var(--text-secondary)]">Never</span>
                          </label>

                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="endType"
                              value="count"
                              checked={endType === 'count'}
                              onChange={() => {
                                setEndType('count')
                                setRecurEndDate('')
                                setOccurenceCount(occurenceCount === '' ? 1 : occurenceCount)
                              }}
                              className="w-3.5 h-3.5 text-[var(--accent-color)] border-[var(--border-color)] focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-0 cursor-pointer"
                            />
                            <span className="text-xs text-[var(--text-secondary)]">After</span>
                            <input
                              type="number"
                              min="1"
                              max="999"
                              value={occurenceCount}
                              onChange={e => setOccurenceCount(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value, 10)))}
                              className="w-12 px-1.5 py-1 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] disabled:opacity-50"
                              disabled={endType !== 'count'}
                            />
                            <span className="text-xs text-[var(--text-secondary)]">times</span>
                          </label>

                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="endType"
                              value="date"
                              checked={endType === 'date'}
                              onChange={() => {
                                setEndType('date')
                                setOccurenceCount('')
                              }}
                              className="w-3.5 h-3.5 text-[var(--accent-color)] border-[var(--border-color)] focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-0 cursor-pointer"
                            />
                            <span className="text-xs text-[var(--text-secondary)]">On date</span>
                            <input
                              type="date"
                              value={recurEndDate}
                              onChange={e => setRecurEndDate(e.target.value)}
                              min={newDueDate}
                              className="px-2 py-1 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] disabled:opacity-50"
                              disabled={endType !== 'date'}
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-[var(--border-color)] flex gap-3 justify-end flex-shrink-0">
              <button
                className="px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--border-color)] rounded-lg transition-colors text-sm font-medium text-[var(--text-primary)]"
                onClick={closeModal}
                disabled={createLoading}
              >
                Cancel
              </button>
              {editingReminder && (
                <button
                  className="px-4 py-2 bg-[var(--danger-color)] hover:bg-red-600 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => handleDelete(editingReminder)}
                  disabled={createLoading}
                  title="Delete this reminder"
                >
                  Delete
                </button>
              )}
              <button
                className="px-4 py-2 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                onClick={editingReminder ? handleUpdate : handleCreate}
                disabled={!newTitle.trim() || createLoading || isInvalidDate}
              >
                {createLoading && (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                {editingReminder ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Details Modal */}
      {viewingReminder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--bg-secondary)] rounded-xl shadow-xl w-full max-w-2xl mx-4 overflow-hidden flex flex-col max-h-[90vh]" role="dialog" aria-label="Reminder details" data-snapshot-record={viewingReminder.id}>
            <div className="p-4 border-b border-[var(--border-color)] flex-shrink-0 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Reminder Details</h2>
              <button
                onClick={() => setViewingReminder(null)}
                className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4 scrollbar scrollbar-thumb-[var(--border-color)] scrollbar-track-[var(--bg-primary)]">
              {/* ID */}
              <div>
                <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase mb-1">ID</p>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-mono text-[var(--text-primary)] bg-[var(--bg-primary)] px-2 py-1 rounded border border-[var(--border-color)]">{viewingReminder.id}</p>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(viewingReminder.id)
                    }}
                    className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded transition-colors text-[var(--text-secondary)] hover:text-[var(--accent-color)]"
                    title="Copy ID"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Title */}
              <div>
                <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase mb-1">Title</p>
                <p className="text-sm font-medium text-[var(--text-primary)]">{viewingReminder.title}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{viewingReminder.id}]</span></p>
              </div>

              {/* Description */}
              {viewingReminder.description && (
                <div>
                  <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase mb-1">Description</p>
                  <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap break-words">{viewingReminder.description}</p>
                </div>
              )}

              {/* Date and Time */}
              {(viewingReminder.schedule && viewingReminder.schedule !== 'No schedule set') ? (
                <div>
                  <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase mb-1">Scheduled</p>
                  <p className="text-sm text-[var(--text-secondary)] flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {viewingReminder.schedule}
                  </p>
                </div>
              ) : (viewingReminder.start_date || viewingReminder.time_of_day) ? (
                <div>
                  <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase mb-1">Scheduled</p>
                  <p className="text-sm text-[var(--text-secondary)] flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {formatDateTime(viewingReminder.start_date, viewingReminder.time_of_day)}
                  </p>
                </div>
              ) : null}

              {/* Recurrence */}
              {(viewingReminder.repeat_every_n ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase mb-2">Recurrence</p>
                  <div className="space-y-1 text-sm text-[var(--text-secondary)]">
                    <p>• Repeats every {viewingReminder.repeat_every_n} {viewingReminder.repeat_interval_unit?.toLowerCase()}</p>
                    {viewingReminder.days_of_week && viewingReminder.days_of_week.length > 0 && (
                      <p>• Days: {viewingReminder.days_of_week.join(', ')}</p>
                    )}
                    {viewingReminder.weeks_of_month && viewingReminder.weeks_of_month.length > 0 && (
                      <p>• Weeks of month: {viewingReminder.weeks_of_month.map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(', ')}</p>
                    )}
                    {viewingReminder.days_of_month && viewingReminder.days_of_month.length > 0 && (
                      <p>• Days of month: {viewingReminder.days_of_month.join(', ')}</p>
                    )}
                    {viewingReminder.end_date && (
                      <p>• Ends on: {new Date(viewingReminder.end_date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                    )}
                    {viewingReminder.occurrence_count && (
                      <p>• Occurs {viewingReminder.occurrence_count} times</p>
                    )}
                  </div>
                </div>
              )}

              {/* Status */}
              <div>
                <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase mb-1">Status</p>
                <p className="text-sm text-[var(--text-secondary)] flex items-center gap-2">
                  {viewingReminder.completed ? (
                    <>
                      <svg className="w-4 h-4 text-[var(--success-color)]" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      Completed
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 text-[var(--accent-color)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Pending
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="p-4 border-t border-[var(--border-color)] flex gap-3 justify-end flex-shrink-0">
              <button
                onClick={() => setViewingReminder(null)}
                className="px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--border-color)] rounded-lg transition-colors text-sm font-medium text-[var(--text-primary)]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trash Modal */}
      {viewingTrash && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--bg-secondary)] rounded-xl shadow-xl w-full max-w-3xl mx-4 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-[var(--border-color)] flex-shrink-0 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Trash</h2>
              <button
                onClick={() => setViewingTrash(false)}
                className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {loadingTrash ? (
                <div className="flex items-center justify-center h-full">
                  <div className="w-8 h-8 border-4 border-[var(--accent-color)]/30 border-t-[var(--accent-color)] rounded-full animate-spin" />
                </div>
              ) : deletedReminders.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] p-4">
                  <svg className="w-16 h-16 mb-3 text-[var(--text-tertiary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <p className="text-lg">Trash is empty</p>
                  <p className="text-sm mt-1">Deleted reminders will appear here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {deletedReminders.map(reminder => (
                    <div
                      key={reminder.id}
                      className="p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] shadow-sm hover:shadow-md transition-all"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-[var(--text-primary)]">
                            {reminder.title}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{reminder.id}]</span>
                          </div>
                          {reminder.description && (
                            <div className="text-sm text-[var(--text-secondary)] mt-1 line-clamp-2">
                              {reminder.description}
                            </div>
                          )}
                          {(reminder.schedule && reminder.schedule !== 'No schedule set') ? (
                            <div className="text-xs text-[var(--text-tertiary)] mt-2 flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              {reminder.schedule}
                            </div>
                          ) : (reminder.start_date || reminder.time_of_day) ? (
                            <div className="text-xs text-[var(--text-tertiary)] mt-2 flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              {formatDateTime(reminder.start_date, reminder.time_of_day)}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <button
                            className={`p-1.5 rounded-lg transition-colors ${
                              isPastReminder(reminder)
                                ? 'text-[var(--text-tertiary)] cursor-not-allowed opacity-50'
                                : 'hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--success-color)]'
                            }`}
                            onClick={() => handleRestore(reminder)}
                            title={isPastReminder(reminder) ? 'Cannot restore past reminders' : 'Restore reminder'}
                            disabled={createLoading || isPastReminder(reminder)}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 15L3 9m0 0l6-6M3 9h15a6 6 0 010 12h-3" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-[var(--border-color)] flex gap-3 justify-end flex-shrink-0">
              <button
                onClick={() => setViewingTrash(false)}
                className="px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--border-color)] rounded-lg transition-colors text-sm font-medium text-[var(--text-primary)]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
