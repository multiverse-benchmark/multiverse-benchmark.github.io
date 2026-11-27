import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useBackendAPI } from '@shared/hooks/useBackendAPI'
import { useReadOnly } from '@shared/contexts/ReadOnlyContext'
import { getDisplayTimeZone, getNowInTimeZone } from '@shared/timeOverride'
import { parseCalendarDateTime, formatCalendarDateTime } from '@shared/calendarDateTime'
const APP_NAME = "Calendar";

// ============================================================================
// Calendar Color Palette
// ============================================================================
// Consistent color scheme using the shared Teal-Cyan suite palette
const COLORS = {
  // Backgrounds
  bgPrimary: '#ffffff',
  bgSecondary: '#f8f9fa',
  bgTertiary: '#f1f3f4',
  bgHover: '#e8eaed',

  // Text
  textPrimary: '#202124',
  textSecondary: '#5f6368',
  textTertiary: '#80868b',

  // Accent (Teal)
  accent: '#0D9488',
  accentHover: '#0F766E',
  accentLight: '#F0FDFA',
  accentText: '#0F766E',

  // Borders
  border: '#dadce0',
  borderLight: '#e8eaed',

  // Status colors
  danger: '#E11D48',
  dangerHover: '#BE123C',
  dangerLight: '#FFF1F2',
  success: '#059669',
  successLight: '#ECFDF5',
  warning: '#F59E0B',
  warningLight: '#FFFBEB',

  // Calendar-specific
  todayBg: '#F0FDFA',
  todayText: '#0D9488',
  currentTime: '#E11D48',

  // Event default
  eventDefault: '#0891B2',
}

// ============================================================================
// Type Definitions
// ============================================================================

interface EventDateTime {
  date?: string           // YYYY-MM-DD for all-day events
  dateTime?: string       // RFC3339 for timed events
  timeZone?: string
}

interface Attendee {
  email: string
  displayName?: string
  responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted'
  organizer?: boolean
  self?: boolean
  optional?: boolean
}

interface Reminder {
  method: 'email' | 'popup' | 'sms'
  minutes: number
}

interface EventAttachment {
  fileUrl: string
  title?: string
  mimeType?: string
  iconLink?: string
  fileId?: string
}

interface CalendarEvent {
  id: string
  calendarId?: string  // Track which calendar the event belongs to
  summary?: string
  description?: string
  location?: string
  start: EventDateTime
  end: EventDateTime
  recurrence?: string[]
  recurringEventId?: string
  attendees?: Attendee[]
  reminders?: {
    useDefault: boolean
    overrides?: Reminder[]
  }
  colorId?: string
  status?: 'confirmed' | 'tentative' | 'cancelled'
  attachments?: EventAttachment[]
  extendedProperties?: {
    private?: Record<string, string>
  }
  created?: string
  updated?: string
}

interface Calendar {
  id: string
  summary: string
  description?: string
  timeZone?: string
  primary?: boolean
  backgroundColor?: string
  foregroundColor?: string
  selected?: boolean
  colorId?: string
  summaryOverride?: string
  hidden?: boolean
  notificationSettings?: {
    notifications: Array<{
      type: string
      method: string
    }>
  }
}

interface AclRule {
  ruleId: string
  calendarId: string
  scope: {
    type: string
    value: string
  }
  role: string
}

interface ColorDefinition {
  background: string
  foreground: string
}

interface Colors {
  calendar: Record<string, ColorDefinition>
  event: Record<string, ColorDefinition>
}

// Default calendar category colors (suite Teal-Cyan palette)
const DEFAULT_CALENDAR_COLORS: Record<string, ColorDefinition> = {
  '1': { background: '#14B8A6', foreground: '#ffffff' },  // Teal light
  '2': { background: '#059669', foreground: '#ffffff' },  // Emerald
  '3': { background: '#0E7490', foreground: '#ffffff' },  // Cyan deep
  '4': { background: '#FB7185', foreground: '#ffffff' },  // Rose light
  '5': { background: '#F59E0B', foreground: '#000000' },  // Amber
  '6': { background: '#E11D48', foreground: '#ffffff' },  // Rose
  '7': { background: '#0891B2', foreground: '#ffffff' },  // Cyan
  '8': { background: '#616161', foreground: '#ffffff' },  // Graphite
  '9': { background: '#0D9488', foreground: '#ffffff' },  // Teal
  '10': { background: '#047857', foreground: '#ffffff' }, // Emerald deep
  '11': { background: '#BE123C', foreground: '#ffffff' }, // Rose deep
  '12': { background: '#FBBF24', foreground: '#000000' }, // Amber light
}

type CalendarView = 'day' | 'week' | 'month'

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

// ============================================================================
// Constants & Helpers
// ============================================================================

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// Default event colors (suite Teal-Cyan palette)
const EVENT_COLORS: Record<string, { background: string; foreground: string }> = {
  '1': { background: '#14B8A6', foreground: '#1d1d1d' },  // Teal light
  '2': { background: '#059669', foreground: '#1d1d1d' },  // Emerald
  '3': { background: '#0E7490', foreground: '#ffffff' },  // Cyan deep
  '4': { background: '#FB7185', foreground: '#1d1d1d' },  // Rose light
  '5': { background: '#FBBF24', foreground: '#1d1d1d' },  // Amber light
  '6': { background: '#E11D48', foreground: '#ffffff' },  // Rose
  '7': { background: '#0891B2', foreground: '#ffffff' },  // Cyan
  '8': { background: '#616161', foreground: '#ffffff' },  // Graphite
  '9': { background: '#0D9488', foreground: '#ffffff' },  // Teal
  '10': { background: '#047857', foreground: '#ffffff' }, // Emerald deep
  '11': { background: '#BE123C', foreground: '#ffffff' }, // Rose deep
}

const CALENDAR_COLORS: Record<string, { background: string; foreground: string }> = {
  '1': { background: '#115E59', foreground: '#ffffff' },  // Teal darkest
  '2': { background: '#9F1239', foreground: '#ffffff' },  // Rose darkest
  '3': { background: '#BE123C', foreground: '#ffffff' },  // Rose deep
  '4': { background: '#E11D48', foreground: '#ffffff' },  // Rose
  '5': { background: '#FB7185', foreground: '#1d1d1d' },  // Rose light
  '6': { background: '#FBBF24', foreground: '#1d1d1d' },  // Amber light
  '7': { background: '#34D399', foreground: '#1d1d1d' },  // Emerald light
  '8': { background: '#059669', foreground: '#ffffff' },  // Emerald
  '9': { background: '#047857', foreground: '#ffffff' },  // Emerald deep
  '10': { background: '#A7F3D0', foreground: '#1d1d1d' }, // Emerald tint
  '11': { background: '#FDE68A', foreground: '#1d1d1d' }, // Amber tint
  '12': { background: '#F59E0B', foreground: '#1d1d1d' }, // Amber
  '13': { background: '#99F6E4', foreground: '#1d1d1d' }, // Teal tint
  '14': { background: '#CFFAFE', foreground: '#1d1d1d' }, // Cyan tint
  '15': { background: '#06B6D4', foreground: '#1d1d1d' }, // Cyan light
  '16': { background: '#0891B2', foreground: '#ffffff' }, // Cyan
  '17': { background: '#0E7490', foreground: '#ffffff' }, // Cyan deep
  '18': { background: '#155E75', foreground: '#ffffff' }, // Cyan darkest
  '19': { background: '#c2c2c2', foreground: '#1d1d1d' }, // Neutral
  '20': { background: '#94A3B8', foreground: '#1d1d1d' }, // Slate
  '21': { background: '#14B8A6', foreground: '#1d1d1d' }, // Teal light
  '22': { background: '#0D9488', foreground: '#ffffff' }, // Teal
  '23': { background: '#0F766E', foreground: '#ffffff' }, // Teal deep
  '24': { background: '#D97706', foreground: '#ffffff' }, // Amber deep
}

// Date utilities
function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDateTime(date: Date): string {
  return formatCalendarDateTime(date, getDisplayTimeZone())
}

function formatTime(date: Date): string {
  const hours = date.getHours()
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const ampm = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  return `${displayHours}:${minutes} ${ampm}`
}

function formatTimeInput(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

function parseValidDateInput(value: string): Date | null {
  if (!value) return null
  const d = new Date(value + 'T00:00:00')
  return isNaN(d.getTime()) ? null : d
}

function parseValidTimeInput(value: string): { hours: number; minutes: number } | null {
  if (!value || !value.includes(':')) return null
  const [hours, minutes] = value.split(':').map(Number)
  return isNaN(hours) || isNaN(minutes) ? null : { hours, minutes }
}

function parseEventDateTime(eventDateTime: EventDateTime): Date {
  return parseCalendarDateTime(eventDateTime, getDisplayTimeZone())
}

function getCalendarTimeZone(calendars: Calendar[]): string {
  const primary = calendars.find(c => c.primary)
  return primary?.timeZone || calendars[0]?.timeZone || 'UTC'
}

function isAllDayEvent(event: CalendarEvent): boolean {
  // Check for legacy date-only format
  if (event.start.date && !event.start.dateTime) {
    return true
  }
  // Check for full-day span using dateTime (00:00:00 to 23:59:xx)
  if (event.start.dateTime && event.end.dateTime) {
    const start = parseEventDateTime(event.start)
    const end = parseEventDateTime(event.end)
    const startsAtMidnight = start.getHours() === 0 && start.getMinutes() === 0
    const endsAtEndOfDay = end.getHours() === 23 && end.getMinutes() === 59
    return startsAtMidnight && endsAtEndOfDay
  }
  return false
}

function isSameDay(date1: Date, date2: Date): boolean {
  return date1.getFullYear() === date2.getFullYear() &&
         date1.getMonth() === date2.getMonth() &&
         date1.getDate() === date2.getDate()
}

function getStartOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d
}

function getEndOfWeek(date: Date): Date {
  const d = getStartOfWeek(date)
  d.setDate(d.getDate() + 6)
  d.setHours(23, 59, 59, 999)
  return d
}

function getStartOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function getEndOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)
}

function getDaysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
}

function getViewDateRange(date: Date, view: CalendarView): { start: Date; end: Date } {
  switch (view) {
    case 'day':
      const dayStart = new Date(date)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(date)
      dayEnd.setHours(23, 59, 59, 999)
      return { start: dayStart, end: dayEnd }
    case 'week':
      return { start: getStartOfWeek(date), end: getEndOfWeek(date) }
    case 'month':
      // For month view, include days from previous/next month that appear in the grid
      const monthStart = getStartOfMonth(date)
      const monthEnd = getEndOfMonth(date)
      const gridStart = getStartOfWeek(monthStart)
      const gridEnd = getEndOfWeek(monthEnd)
      return { start: gridStart, end: gridEnd }
  }
}

// Client-side recurring event expansion
function expandRecurringEvents(events: CalendarEvent[], rangeStart: Date, rangeEnd: Date): CalendarEvent[] {
  const expanded: CalendarEvent[] = []

  for (const event of events) {
    if (!event.recurrence || event.recurrence.length === 0 || event.recurringEventId) {
      expanded.push(event)
      continue
    }

    const rruleLine = event.recurrence.find(r => r.startsWith('RRULE:'))
    if (!rruleLine) {
      expanded.push(event)
      continue
    }

    const rrule = rruleLine.substring(6)
    const parts: Record<string, string> = {}
    for (const part of rrule.split(';')) {
      const [key, value] = part.split('=')
      if (key && value) parts[key] = value
    }

    const freq = parts['FREQ']
    const count = parts['COUNT'] ? parseInt(parts['COUNT']) : undefined
    const interval = parts['INTERVAL'] ? parseInt(parts['INTERVAL']) : 1

    if (!freq) {
      expanded.push(event)
      continue
    }

    const eventStart = parseEventDateTime(event.start)
    const eventEnd = parseEventDateTime(event.end)
    const duration = eventEnd.getTime() - eventStart.getTime()

    const exdates = new Set<string>()
    for (const r of event.recurrence) {
      if (r.startsWith('EXDATE:')) {
        exdates.add(r.substring(7))
      }
    }

    let occurrenceCount = 0
    const maxOccurrences = count || 365
    let currentStart = new Date(eventStart)

    while (currentStart <= rangeEnd && occurrenceCount < maxOccurrences) {
      if (currentStart >= rangeStart || isSameDay(currentStart, rangeStart)) {
        const exdateStr = new Date(formatDateTime(currentStart)).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
        if (!exdates.has(exdateStr)) {
          const currentEnd = new Date(currentStart.getTime() + duration)
          expanded.push({
            ...event,
            id: `${event.id}_${currentStart.toISOString()}`,
            recurringEventId: event.id,
            start: { dateTime: formatDateTime(currentStart), timeZone: event.start.timeZone },
            end: { dateTime: formatDateTime(currentEnd), timeZone: event.end.timeZone },
            recurrence: undefined,
          })
        }
      }

      occurrenceCount++
      const next = new Date(currentStart)
      switch (freq) {
        case 'DAILY':
          next.setDate(next.getDate() + interval)
          break
        case 'WEEKLY':
          next.setDate(next.getDate() + 7 * interval)
          break
        case 'MONTHLY':
          next.setMonth(next.getMonth() + interval)
          break
        case 'YEARLY':
          next.setFullYear(next.getFullYear() + interval)
          break
        default:
          if (occurrenceCount === 1) expanded.push(event)
          occurrenceCount = maxOccurrences
          continue
      }
      currentStart = next
    }
  }

  return expanded
}

function navigateDate(date: Date, view: CalendarView, direction: -1 | 1): Date {
  const d = new Date(date)
  switch (view) {
    case 'day':
      d.setDate(d.getDate() + direction)
      break
    case 'week':
      d.setDate(d.getDate() + (direction * 7))
      break
    case 'month':
      d.setMonth(d.getMonth() + direction)
      break
  }
  return d
}

function formatViewTitle(date: Date, view: CalendarView): string {
  switch (view) {
    case 'day':
      return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
    case 'week':
      const weekStart = getStartOfWeek(date)
      const weekEnd = getEndOfWeek(date)
      if (weekStart.getMonth() === weekEnd.getMonth()) {
        return `${MONTHS[weekStart.getMonth()]} ${weekStart.getDate()} - ${weekEnd.getDate()}, ${weekStart.getFullYear()}`
      }
      return `${MONTHS[weekStart.getMonth()]} ${weekStart.getDate()} - ${MONTHS[weekEnd.getMonth()]} ${weekEnd.getDate()}, ${weekStart.getFullYear()}`
    case 'month':
      return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`
  }
}

function getEventColor(event: CalendarEvent, calendar?: Calendar, eventColors?: Record<string, ColorDefinition> | null): { background: string; foreground: string } {
  // First check if event has its own colorId
  if (event.colorId) {
    // Try backend-provided event colors first
    if (eventColors && eventColors[event.colorId]) {
      return eventColors[event.colorId]
    }
    // Fall back to default event colors
    if (EVENT_COLORS[event.colorId]) {
      return EVENT_COLORS[event.colorId]
    }
  }
  // Events inherit their calendar's color
  // First check backgroundColor (set via our color picker)
  if (calendar?.backgroundColor) {
    return { background: calendar.backgroundColor, foreground: calendar.foregroundColor || '#ffffff' }
  }
  // Then check colorId with our default calendar colors
  if (calendar?.colorId && DEFAULT_CALENDAR_COLORS[calendar.colorId]) {
    return DEFAULT_CALENDAR_COLORS[calendar.colorId]
  }
  // Fallback to default color if no calendar or no color info
  return { background: COLORS.eventDefault, foreground: '#ffffff' }
}

// ============================================================================
// Main Component
// ============================================================================

export default function GridwellCalendarApp({ setRefreshHandler }: AppProps) {
  const readOnly = useReadOnly()
  // Calendar state
  const [calendars, setCalendars] = useState<Calendar[]>([])
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<Set<string>>(new Set())
  const [colors, setColors] = useState<Colors | null>(null)

  // Event state
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)

  // View state
  const [currentView, setCurrentView] = useState<CalendarView>('week')
  const [currentDate, setCurrentDate] = useState<Date>(new Date())

  // UI state
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toastError, setToastError] = useState<string | null>(null)
  const [showEventEditor, setShowEventEditor] = useState(false)
  const [showCalendarEditor, setShowCalendarEditor] = useState(false)
  const [showManageCalendars, setShowManageCalendars] = useState(false)
  const [editingEvent, setEditingEvent] = useState<Partial<CalendarEvent> | null>(null)
  const [editingCalendar, setEditingCalendar] = useState<Partial<Calendar> | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<'event' | 'calendar' | 'clear' | null>(null)
  const [showRecurringEditChoice, setShowRecurringEditChoice] = useState(false)
  const [showRecurringDeleteChoice, setShowRecurringDeleteChoice] = useState(false)
  const [pendingSaveAction, setPendingSaveAction] = useState<'this' | 'all' | null>(null)
  const [showEventDetails, setShowEventDetails] = useState(false)
  const [viewingEvent, setViewingEvent] = useState<CalendarEvent | null>(null)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importDestinationCalendar, setImportDestinationCalendar] = useState('')
  const [showAclModal, setShowAclModal] = useState(false)
  const [aclCalendar, setAclCalendar] = useState<Calendar | null>(null)
  const [aclRules, setAclRules] = useState<AclRule[]>([])
  const [aclError, setAclError] = useState<string | null>(null)
  const [newRuleEmail, setNewRuleEmail] = useState('')
  const [newRuleRole, setNewRuleRole] = useState<'reader' | 'writer'>('reader')
  const [showEventInstances, setShowEventInstances] = useState(false)
  const [eventInstances, setEventInstances] = useState<CalendarEvent[]>([])
  const [loadingInstances, setLoadingInstances] = useState(false)

  // Calendar metadata state
  const [showCalendarMetadata, setShowCalendarMetadata] = useState(false)
  const [calendarMetadata, setCalendarMetadata] = useState<Record<string, unknown> | null>(null)
  const [editingMetadata, setEditingMetadata] = useState<Record<string, string> | null>(null)

  // Subscribe calendar state
  const [showSubscribeCalendar, setShowSubscribeCalendar] = useState(false)
  const [subscribeCalendarId, setSubscribeCalendarId] = useState('')

  // Watch/notification channels state
  const [showWatchPanel, setShowWatchPanel] = useState(false)
  const [activeChannels, setActiveChannels] = useState<Array<{ id: string; resourceId: string; type: string }>>([])

  // ACL rule detail state
  const [viewingAclRule, setViewingAclRule] = useState<AclRule | null>(null)
  const [editingAclRuleRole, setEditingAclRuleRole] = useState<string>('')

  // Refs
  const loadInitialDataRef = useRef<() => Promise<void>>(() => Promise.resolve())
  const initialLoadDoneRef = useRef(false)
  // Local map to track event colors (fallback when backend doesn't return extendedProperties)
  const eventColorMapRef = useRef<Record<string, string>>({})

  const api = useBackendAPI('gridwell_calendar')

  // Derived timezone from the primary calendar (used for API calls)
  const calendarTimeZone = useMemo(() => getCalendarTimeZone(calendars), [calendars])
  // Display timezone: CURRENT_TIME's timezone, or browser's local timezone
  const displayTimeZone = getDisplayTimeZone()

  // Correct currentDate to the display timezone on first calendar load
  const calendarTzAppliedRef = useRef(false)
  useEffect(() => {
    if (calendars.length > 0 && !calendarTzAppliedRef.current) {
      calendarTzAppliedRef.current = true
      setCurrentDate(getNowInTimeZone(displayTimeZone))
    }
  }, [calendars, displayTimeZone])

  // ============================================================================
  // Data Loading
  // ============================================================================

  const loadCalendars = useCallback(async () => {
    try {
      const result = await api.callTool('list_calendar_list_entries', { showHidden: true })
      const items = (result as { items?: Calendar[] })?.items || []

      // Ensure all calendars have a background color
      const colorIds = Object.keys(DEFAULT_CALENDAR_COLORS)
      const calendarsWithColors = items.map((cal, index) => {
        if (!cal.backgroundColor && !cal.colorId) {
          // Assign a default color based on index
          const colorId = colorIds[index % colorIds.length]
          const colorDef = DEFAULT_CALENDAR_COLORS[colorId]
          return {
            ...cal,
            colorId,
            backgroundColor: colorDef.background,
            foregroundColor: colorDef.foreground,
          }
        }
        return cal
      })

      setCalendars(calendarsWithColors)
      // Select all calendars by default
      const calendarIds = new Set(calendarsWithColors.map((c: Calendar) => c.id))
      setSelectedCalendarIds(calendarIds)
    } catch (e) {
      console.error('Failed to load calendars:', e)
    }
  }, [api])

  const loadColors = useCallback(async () => {
    try {
      const result = await api.callTool('get_calendar_and_event_colors', {})
      setColors(result as Colors)
    } catch (e) {
      console.error('Failed to load colors:', e)
    }
  }, [api])

  // Extract colorId from extendedProperties.private (backend stores it there)
  const extractColorId = (event: CalendarEvent): string | undefined =>
    event.extendedProperties?.private?.colorId || event.colorId

  const loadEvents = useCallback(async () => {
    const { start, end } = getViewDateRange(currentDate, currentView)
    const allEvents: CalendarEvent[] = []
    const userTimeZone = calendarTimeZone

    for (const calendarId of selectedCalendarIds) {
      try {
        const result = await api.callTool('list_events', {
          calendarId,
          timeMin: formatDateTime(start),
          timeMax: formatDateTime(end),
          timeZone: userTimeZone,
          singleEvents: true,
          orderBy: 'startTime',
        })
        const items = (result as { items?: CalendarEvent[] })?.items || []
        // Add calendarId to each event so we know which calendar it belongs to
        // Filter out cancelled events - backend delete_event sets status to 'cancelled'
        // rather than removing, so we need to exclude them from the view
        // Also extract colorId from extendedProperties.private if present
        allEvents.push(...items.filter(event => event.status !== 'cancelled').map(event => ({
          ...event, calendarId, colorId: extractColorId(event) || eventColorMapRef.current[event.id],
        })))
      } catch (e) {
        console.error(`Failed to load events for calendar ${calendarId}:`, e)
      }
    }

    // Expand recurring events client-side
    const expandedEvents = expandRecurringEvents(allEvents, start, end)

    // Sort by start time
    expandedEvents.sort((a, b) => {
      const aTime = parseEventDateTime(a.start).getTime()
      const bTime = parseEventDateTime(b.start).getTime()
      return aTime - bTime
    })

    setEvents(expandedEvents)
  }, [api, currentDate, currentView, selectedCalendarIds, calendarTimeZone])

  const loadInitialData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await Promise.all([loadCalendars(), loadColors()])
      initialLoadDoneRef.current = true
      // Events will be loaded by the useEffect when selectedCalendarIds updates
    } catch (e) {
      setError('Failed to load calendar data')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [loadCalendars, loadColors])

  // Keep ref updated
  useEffect(() => {
    loadInitialDataRef.current = loadInitialData
  }, [loadInitialData])

  // Initial load
  useEffect(() => {
    loadInitialData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Reload events when view, date, or selected calendars change
  useEffect(() => {
    if (initialLoadDoneRef.current && !loading && selectedCalendarIds.size > 0) {
      loadEvents()
    }
  }, [currentDate, currentView, selectedCalendarIds, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-dismiss toast errors after 5 seconds
  useEffect(() => {
    if (toastError) {
      const timer = setTimeout(() => setToastError(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [toastError])

  // Refresh handler for admin panel - use ref to avoid re-render loops
  const refreshApp = useCallback(() => {
    loadInitialDataRef.current()
  }, [])

  const setRefreshHandlerRef = useRef(setRefreshHandler)
  useEffect(() => {
    setRefreshHandlerRef.current = setRefreshHandler
  })

  useEffect(() => {
    const handler = setRefreshHandlerRef.current
    if (handler) {
      handler(refreshApp)
    }
    return () => {
      const cleanupHandler = setRefreshHandlerRef.current
      if (cleanupHandler) cleanupHandler(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshApp])

  // ============================================================================
  // Event Handlers
  // ============================================================================

  const loadEventInstances = async (calendarId: string, eventId: string) => {
    setLoadingInstances(true)
    try {
      const result = await api.callTool('list_event_instances', {
        calendarId,
        eventId,
      })
      const instances = (result as { items?: CalendarEvent[] })?.items || []
      // Add calendarId to each instance
      const instancesWithCalendarId = instances.map(inst => ({ ...inst, calendarId }))
      setEventInstances(instancesWithCalendarId)
      setShowEventInstances(true)
    } catch (e) {
      console.error('Failed to load event instances:', e)
      setToastError('Failed to load event instances')
    } finally {
      setLoadingInstances(false)
    }
  }

  const handleCreateEvent = () => {
    const now = getNowInTimeZone(displayTimeZone)
    now.setMinutes(0, 0, 0)
    const end = new Date(now)
    end.setHours(end.getHours() + 1)

    // Default to primary calendar or first available
    const defaultCalendarId = calendars.find(c => c.primary)?.id || calendars[0]?.id

    setEditingEvent({
      summary: '',
      description: '',
      location: '',
      calendarId: defaultCalendarId,
      start: { dateTime: formatDateTime(now) },
      end: { dateTime: formatDateTime(end) },
      reminders: { useDefault: true },
    })
    setShowEventEditor(true)
  }

  const handleViewEvent = async (event: CalendarEvent) => {
    if (readOnly) {
      setViewingEvent(event)
      setShowEventDetails(true)
      return
    }
    // Fetch full event details to get attendees and other fields not in list response
    try {
      const calendarId = event.calendarId || calendars.find(c => c.primary)?.id || calendars[0]?.id
      const userTimeZone = calendarTimeZone
      if (calendarId && event.id) {
        const fullEvent = await api.callTool('get_event', {
          calendarId,
          eventId: event.id,
          timeZone: userTimeZone,
        }) as CalendarEvent
        // Keep the displayed occurrence's times when loading its other details.
        setViewingEvent({ ...fullEvent, calendarId, start: event.start, end: event.end })
      } else {
        setViewingEvent(event)
      }
    } catch (e) {
      console.error('Failed to fetch event details:', e)
      setViewingEvent(event)
    }
    setShowEventDetails(true)
  }

  const handleEditEvent = async (event?: CalendarEvent) => {
    const eventToEdit = event || viewingEvent
    if (!eventToEdit) return

    setSelectedEvent(eventToEdit)
    setShowEventDetails(false)
    setViewingEvent(null)

    const calendarId = eventToEdit.calendarId || calendars.find(c => c.primary)?.id || calendars[0]?.id
    const userTimeZone = calendarTimeZone

    // Fetch full event details to ensure we have attendees and all fields
    try {
      if (calendarId && eventToEdit.id) {
        // If this is a recurring instance, we need both the instance and master event
        if (eventToEdit.recurringEventId) {
          const [fullEvent, masterEvent] = await Promise.all([
            api.callTool('get_event', { calendarId, eventId: eventToEdit.id, timeZone: userTimeZone }) as Promise<CalendarEvent>,
            api.callTool('get_event', { calendarId, eventId: eventToEdit.recurringEventId, timeZone: userTimeZone }) as Promise<CalendarEvent>,
          ])
          // Use instance data with full details, but with master's recurrence pattern
          // Preserve the displayed occurrence's start/end times.
          const colorId = extractColorId(fullEvent) || eventToEdit.colorId
          setEditingEvent({
            ...fullEvent,
            calendarId,
            colorId,
            recurrence: masterEvent.recurrence,
            start: eventToEdit.start,
            end: eventToEdit.end,
          })
        } else {
          const fullEvent = await api.callTool('get_event', {
            calendarId,
            eventId: eventToEdit.id,
            timeZone: userTimeZone,
          }) as CalendarEvent
          // Preserve the displayed occurrence's start/end times.
          const colorId = extractColorId(fullEvent) || eventToEdit.colorId
          setEditingEvent({ ...fullEvent, calendarId, colorId, start: eventToEdit.start, end: eventToEdit.end })
        }
      } else {
        console.warn('[handleEditEvent] Missing calendarId or eventId, using eventToEdit:', { calendarId, eventId: eventToEdit.id })
        setEditingEvent({ ...eventToEdit })
      }
    } catch (e) {
      console.error('[handleEditEvent] Failed to fetch event details:', e)
      setEditingEvent({ ...eventToEdit })
    }

    setShowEventEditor(true)
  }

  const handleSaveEvent = async (editMode?: 'this' | 'all') => {
    if (!editingEvent) return

    // If this is a recurring event instance and no edit mode specified, show choice dialog
    const isRecurringInstance = !!editingEvent.recurringEventId
    if (isRecurringInstance && editingEvent.id && !editMode) {
      setShowRecurringEditChoice(true)
      return
    }

    // Use the selected calendar from the event, or fall back to primary/first
    const targetCalendarId = editingEvent.calendarId || calendars.find(c => c.primary)?.id || calendars[0]?.id
    if (!targetCalendarId) {
      setToastError('No calendar available. Please create a calendar first.')
      return
    }

    try {
      // Ensure timezone is included in start/end for backend compatibility
      const userTimeZone = calendarTimeZone
      const startWithTz = editingEvent.start?.dateTime
        ? { ...editingEvent.start, timeZone: userTimeZone }
        : editingEvent.start
      const endWithTz = editingEvent.end?.dateTime
        ? { ...editingEvent.end, timeZone: userTimeZone }
        : editingEvent.end

      // Base resource fields - backend StrictBaseModel only accepts defined fields
      // Filter out undefined values to avoid StrictBaseModel validation errors
      const resource: Record<string, unknown> = {
        summary: editingEvent.summary || 'Untitled Event',
        start: startWithTz,
        end: endWithTz,
      }

      // Only include optional fields if they have values
      if (editingEvent.description !== undefined && editingEvent.description !== '') {
        resource.description = editingEvent.description
      }
      if (editingEvent.location !== undefined && editingEvent.location !== '') {
        resource.location = editingEvent.location
      }
      if (editingEvent.attendees && editingEvent.attendees.length > 0) {
        resource.attendees = editingEvent.attendees
      }
      if (editingEvent.reminders) {
        resource.reminders = editingEvent.reminders
      }
      if (editingEvent.recurrence && editingEvent.recurrence.length > 0) {
        resource.recurrence = editingEvent.recurrence
      }

      // Attachments are supported by backend for both create and update
      if (editingEvent.attachments && editingEvent.attachments.length > 0) {
        resource.attachments = editingEvent.attachments.map(a => ({ fileUrl: a.fileUrl }))
      }

      // Store colorId via extendedProperties.private (backend Event model doesn't support colorId directly)
      if (editingEvent.colorId) {
        resource.extendedProperties = {
          private: { colorId: editingEvent.colorId },
        }
      }

      if (editingEvent.id) {
        if (isRecurringInstance && editMode === 'this') {
          // Edit only this instance:
          // 1. Get the original start time to create an EXDATE
          // 2. Use patch_event to add EXDATE to the master (avoids touching start/end)
          // 3. Create a new standalone event with the modified details

          const masterEventId = editingEvent.recurringEventId!
          const originalCalendarId = selectedEvent?.calendarId || targetCalendarId

          // Get the original start time for the EXDATE - use selectedEvent (before user edits)
          const originalStartTime = selectedEvent?.start?.dateTime
          if (!originalStartTime) {
            setToastError('Cannot determine original event time')
            return
          }

          // Format EXDATE (needs to be in the format YYYYMMDDTHHMMSSZ)
          const originalDate = new Date(originalStartTime)
          const exdateStr = originalDate.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

          // Get the master event to get its current recurrence rules
          const masterEvent = await api.callTool('get_event', {
            calendarId: originalCalendarId,
            eventId: masterEventId,
          }) as CalendarEvent

          // Add EXDATE to the master event's recurrence
          const updatedRecurrence = [...(masterEvent.recurrence || []), `EXDATE:${exdateStr}`]

          // Use patch_event to only update recurrence - avoids timezone issues with start/end
          await api.callTool('patch_event', {
            calendarId: originalCalendarId,
            eventId: masterEventId,
            resource: {
              recurrence: updatedRecurrence,
            },
          })

          // Create a new standalone event with the modified details (no recurrence)
          const newEventResource = { ...resource }
          delete newEventResource.recurrence
          // Add status for the new standalone event (create_event supports status)
          if (editingEvent.status) {
            newEventResource.status = editingEvent.status
          }
          const createdEvent = await api.callTool('create_event', {
            calendarId: targetCalendarId,
            resource: newEventResource,
            sendUpdates: 'none',
          }) as CalendarEvent

        } else {
          // Edit all events in series (or not a recurring instance)
          const eventIdToUpdate = isRecurringInstance ? editingEvent.recurringEventId! : editingEvent.id

          // Build patch resource - patch_event supports status and attachments
          // Always include status to ensure it's persisted correctly
          const patchResource = { ...resource }
          patchResource.status = editingEvent.status || 'confirmed'

          // Check if we need to move the event to a different calendar
          const originalCalendarId = selectedEvent?.calendarId
          if (originalCalendarId && originalCalendarId !== targetCalendarId) {
            // Move event to different calendar
            await api.callTool('move_event', {
              calendarId: originalCalendarId,
              eventId: eventIdToUpdate,
              destination: targetCalendarId,
              sendUpdates: 'none',
            })
            // Then patch the event details (patch_event supports status)
            await api.callTool('patch_event', {
              calendarId: targetCalendarId,
              eventId: eventIdToUpdate,
              resource: patchResource,
            })
          } else {
            // Patch existing event in same calendar
            await api.callTool('patch_event', {
              calendarId: targetCalendarId,
              eventId: eventIdToUpdate,
              resource: patchResource,
            })
          }

        }
      } else {
        // Create new event - always include status
        const createResource = { ...resource }
        createResource.status = editingEvent.status || 'confirmed'
        const createdEvent = await api.callTool('create_event', {
          calendarId: targetCalendarId,
          resource: createResource,
          sendUpdates: 'none',
        }) as CalendarEvent
      }

      // Track event color locally and optimistically update state for immediate UI feedback
      if (editingEvent.id) {
        if (editingEvent.colorId) {
          eventColorMapRef.current[editingEvent.id] = editingEvent.colorId
        } else {
          delete eventColorMapRef.current[editingEvent.id]
        }
        const updatedStatus = editingEvent.status || 'confirmed'
        setEvents(prev => prev.map(e => {
          if (e.id === editingEvent.id || (editingEvent.recurringEventId && e.recurringEventId === editingEvent.recurringEventId)) {
            return { ...e, status: updatedStatus, colorId: editingEvent.colorId || e.colorId }
          }
          return e
        }))
      }

      setShowEventEditor(false)
      setShowRecurringEditChoice(false)
      setEditingEvent(null)
      setSelectedEvent(null)
      await loadEvents()
    } catch (e) {
      console.error('Failed to save event:', e)
      setToastError('Failed to save event')
    }
  }

  const handleDeleteEvent = async (deleteMode?: 'this' | 'all') => {
    if (!selectedEvent) return

    // If this is a recurring event instance and no delete mode specified, show choice dialog
    const isRecurringInstance = !!selectedEvent.recurringEventId
    if (isRecurringInstance && !deleteMode) {
      setShowDeleteConfirm(null) // Close the regular confirm dialog
      setShowRecurringDeleteChoice(true)
      return
    }

    // Use the event's calendar, or fall back to primary/first
    const calendarId = selectedEvent.calendarId || calendars.find(c => c.primary)?.id || calendars[0]?.id
    if (!calendarId) {
      setToastError('No calendar available.')
      return
    }

    try {
      if (isRecurringInstance && deleteMode === 'this') {
        // Delete only this instance by adding EXDATE to the master event
        const masterEventId = selectedEvent.recurringEventId!

        // Get the original start time for the EXDATE
        const originalStartTime = selectedEvent.start?.dateTime
        if (!originalStartTime) {
          setToastError('Cannot determine original event time')
          return
        }

        // Format EXDATE (needs to be in the format YYYYMMDDTHHMMSSZ)
        const originalDate = new Date(originalStartTime)
        const exdateStr = originalDate.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

        // Get the master event to get its current recurrence rules
        const masterEvent = await api.callTool('get_event', {
          calendarId,
          eventId: masterEventId,
        }) as CalendarEvent

        // Add EXDATE to the master event's recurrence
        const updatedRecurrence = [...(masterEvent.recurrence || []), `EXDATE:${exdateStr}`]

        // Use patch_event to only update recurrence - avoids timezone issues with start/end
        await api.callTool('patch_event', {
          calendarId,
          eventId: masterEventId,
          resource: {
            recurrence: updatedRecurrence,
          },
        })
      } else {
        // Delete all events (or non-recurring event)
        const eventIdToDelete = isRecurringInstance ? selectedEvent.recurringEventId! : selectedEvent.id
        await api.callTool('delete_event', {
          calendarId,
          eventId: eventIdToDelete,
          sendUpdates: 'none',
        })
      }

      // Optimistically remove deleted events from local state
      // (backend delete_event only marks as 'cancelled', so we must filter locally)
      if (isRecurringInstance && deleteMode === 'this') {
        // Remove only this instance
        setEvents(prev => prev.filter(e => e.id !== selectedEvent.id))
        delete eventColorMapRef.current[selectedEvent.id]
      } else {
        // Remove all events with this ID or matching recurringEventId (entire series)
        const deletedId = isRecurringInstance ? selectedEvent.recurringEventId! : selectedEvent.id
        setEvents(prev => prev.filter(e =>
          e.id !== deletedId && e.recurringEventId !== deletedId
        ))
        // Clean up color map
        delete eventColorMapRef.current[deletedId]
      }

      setShowDeleteConfirm(null)
      setShowRecurringDeleteChoice(false)
      setShowEventEditor(false)
      setShowEventDetails(false)
      setEditingEvent(null)
      setSelectedEvent(null)
      setViewingEvent(null)
      await loadEvents()
    } catch (e) {
      console.error('Failed to delete event:', e)
      setToastError('Failed to delete event')
    }
  }

  // Always use default calendar colors since the API may return incomplete data
  const calendarColors = DEFAULT_CALENDAR_COLORS

  const handleCreateCalendar = () => {
    // Find a color not already used by existing calendars
    const colorIds = Object.keys(calendarColors)

    // Get all background colors currently in use (normalize to lowercase)
    const usedBackgrounds = new Set<string>()
    calendars.forEach(c => {
      if (c.backgroundColor) {
        usedBackgrounds.add(c.backgroundColor.toLowerCase())
      }
    })

    // Find first color whose background isn't already in use
    let nextColorId = colorIds.find(id => {
      const bg = calendarColors[id]?.background?.toLowerCase()
      return bg && !usedBackgrounds.has(bg)
    })

    if (!nextColorId) {
      // All 12 colors used, just pick the next one in sequence
      nextColorId = colorIds[calendars.length % colorIds.length]
    }

    const nextColor = calendarColors[nextColorId]

    setEditingCalendar({
      summary: '',
      description: '',
      colorId: nextColorId,
      backgroundColor: nextColor?.background,
    })
    setShowCalendarEditor(true)
  }

  const handleEditCalendar = async (calendar: Calendar) => {
    try {
      // Load full calendar list entry to get summaryOverride, hidden, and notificationSettings
      const calendarListEntry = await api.callTool('get_calendar_list_entry', {
        calendarId: calendar.id,
      }) as Calendar

      // Determine the correct colorId by matching backgroundColor to calendarColors
      let matchedColorId = calendar.colorId
      if (calendar.backgroundColor) {
        const colorEntry = Object.entries(calendarColors).find(
          ([_, colorDef]) => colorDef.background === calendar.backgroundColor
        )
        if (colorEntry) {
          matchedColorId = colorEntry[0]
        }
      }

      setEditingCalendar({
        id: calendar.id,
        summary: calendar.summary,
        description: calendar.description || '',
        primary: calendar.primary,
        colorId: matchedColorId,
        backgroundColor: calendar.backgroundColor,
        foregroundColor: calendar.foregroundColor,
        summaryOverride: calendarListEntry.summaryOverride,
        hidden: calendarListEntry.hidden,
        notificationSettings: calendarListEntry.notificationSettings,
      })
      setShowCalendarEditor(true)
    } catch (e) {
      console.error('Failed to load calendar list entry:', e)
      // Fallback to existing behavior if API call fails
      // Also match colorId for fallback case
      let matchedColorId = calendar.colorId
      if (calendar.backgroundColor) {
        const colorEntry = Object.entries(calendarColors).find(
          ([_, colorDef]) => colorDef.background === calendar.backgroundColor
        )
        if (colorEntry) {
          matchedColorId = colorEntry[0]
        }
      }

      setEditingCalendar({
        id: calendar.id,
        summary: calendar.summary,
        description: calendar.description || '',
        primary: calendar.primary,
        colorId: matchedColorId,
        backgroundColor: calendar.backgroundColor,
        foregroundColor: calendar.foregroundColor,
      })
      setShowCalendarEditor(true)
    }
  }

  const handleSaveCalendar = async () => {
    if (!editingCalendar) return

    try {
      let calendarId = editingCalendar.id

      if (calendarId) {
        // Update existing calendar metadata
        await api.callTool('update_calendar_metadata', {
          calendarId,
          resource: {
            summary: editingCalendar.summary,
            description: editingCalendar.description,
          },
        })
      } else {
        // Create new calendar with user's timezone
        const userTimeZone = calendarTimeZone
        const result = await api.callTool('create_secondary_calendar', {
          resource: {
            summary: editingCalendar.summary || 'New Calendar',
            description: editingCalendar.description,
            timeZone: userTimeZone,
          },
        }) as { id: string }
        calendarId = result.id
      }

      // Update calendar list entry customization (including color)
      if (calendarId) {
        if (editingCalendar.id) {
          // Existing calendar - update all customization fields in one call
          const resource: any = {
            summaryOverride: editingCalendar.summaryOverride || null,
            hidden: editingCalendar.hidden || false,
            notificationSettings: editingCalendar.notificationSettings || { notifications: [] },
          }

          // Include existing color to preserve it (unless it was changed)
          if (editingCalendar.backgroundColor) {
            resource.backgroundColor = editingCalendar.backgroundColor
            if (editingCalendar.foregroundColor) {
              resource.foregroundColor = editingCalendar.foregroundColor
            }
          }

          await api.callTool('update_calendar_list_entry', {
            calendarId,
            colorRgbFormat: true,
            resource,
          })
        } else {
          // New calendar - update notification settings and color if set
          const resource: any = {}

          if (editingCalendar.notificationSettings) {
            resource.notificationSettings = editingCalendar.notificationSettings
          }

          if (editingCalendar.colorId) {
            const colorDef = calendarColors[editingCalendar.colorId]
            if (colorDef) {
              resource.backgroundColor = colorDef.background
              resource.foregroundColor = colorDef.foreground
            }
          }

          // Only make the call if there's something to update
          if (Object.keys(resource).length > 0) {
            await api.callTool('update_calendar_list_entry', {
              calendarId,
              colorRgbFormat: true,
              resource,
            })
          }
        }
      }

      setShowCalendarEditor(false)
      setEditingCalendar(null)
      await loadCalendars()
    } catch (e) {
      console.error('Failed to save calendar:', e)
      setToastError('Failed to save calendar')
    }
  }

  const handleDeleteCalendar = async () => {
    if (!editingCalendar?.id) return

    const deletedCalendarId = editingCalendar.id

    try {
      await api.callTool('delete_secondary_calendar', {
        calendarId: deletedCalendarId,
      })
      setShowDeleteConfirm(null)
      setShowCalendarEditor(false)
      setEditingCalendar(null)

      // Remove deleted calendar from selectedCalendarIds before loading events
      setSelectedCalendarIds(prev => {
        const next = new Set(prev)
        next.delete(deletedCalendarId)
        return next
      })

      await loadCalendars()
      await loadEvents()
      // Events will be reloaded by useEffect when selectedCalendarIds changes
    } catch (e) {
      console.error('Failed to delete calendar:', e)
      setToastError('Failed to delete calendar')
    }
  }

  const handleClearCalendar = async () => {
    if (!editingCalendar?.id) return

    try {
      await api.callTool('clear_primary_calendar', {
        calendarId: editingCalendar.id,
      })
      setShowDeleteConfirm(null)
      await loadEvents()
    } catch (e) {
      console.error('Failed to clear calendar:', e)
      setToastError('Failed to clear calendar events')
    }
  }

  const handleImportEvent = async (destinationCalendarId: string) => {
    if (!viewingEvent?.id || !viewingEvent?.calendarId) return

    try {
      const full_id = `${viewingEvent.calendarId}:${viewingEvent.id}`
      await api.callTool('import_event', {
        calendarId: destinationCalendarId,
        resource: {
          full_id,
          start: viewingEvent.start,
          end: viewingEvent.end,
        },
      })
      setShowImportDialog(false)
      await loadEvents()
    } catch (e) {
      console.error('Failed to import event:', e)
      setToastError('Failed to copy event')
    }
  }

  const handleOpenAclModal = async (calendar: Calendar) => {
    setAclCalendar(calendar)
    setShowAclModal(true)
    setAclError(null)
    setNewRuleEmail('')
    setNewRuleRole('reader')
    await loadAclRules(calendar.id)
  }

  const handleCloseAclModal = () => {
    setShowAclModal(false)
    setAclCalendar(null)
    setAclRules([])
    setAclError(null)
    setNewRuleEmail('')
    setNewRuleRole('reader')
  }

  const loadAclRules = async (calendarId: string) => {
    try {
      const result = await api.callTool('list_access_control_rules', {
        calendarId,
      }) as { items: AclRule[] }
      setAclRules(result.items || [])
    } catch (e) {
      console.error('Failed to load ACL rules:', e)
      setAclError('Failed to load access rules')
    }
  }

  const handleAddAclRule = async () => {
    if (!aclCalendar?.id || !newRuleEmail.trim()) return

    // Check if a rule already exists for this email - update role instead of adding duplicate
    const existingRule = aclRules.find(rule => rule.scope.value.toLowerCase() === newRuleEmail.trim().toLowerCase())
    if (existingRule) {
      if (existingRule.role === newRuleRole) {
        setAclError('This person already has that role.')
        return
      }
      // Update the existing rule's role
      try {
        await handleUpdateAclRule(existingRule.ruleId, existingRule, newRuleRole)
        setNewRuleEmail('')
        setNewRuleRole('reader')
      } catch (e) {
        console.error('Failed to update ACL rule:', e)
        setAclError('Failed to update access rule')
      }
      return
    }

    try {
      await api.callTool('create_access_control_rule', {
        calendarId: aclCalendar.id,
        resource: {
          role: newRuleRole,
          scope: {
            type: 'user',
            value: newRuleEmail.trim(),
          },
        },
      })
      setNewRuleEmail('')
      setNewRuleRole('reader')
      setAclError(null)
      await loadAclRules(aclCalendar.id)
    } catch (e) {
      console.error('Failed to add ACL rule:', e)
      setAclError('Failed to add access rule. Please check the email address.')
    }
  }

  const handleUpdateAclRule = async (ruleId: string, currentRule: AclRule, newRole: string) => {
    if (!aclCalendar?.id) return

    try {
      await api.callTool('update_access_control_rule', {
        calendarId: aclCalendar.id,
        ruleId,
        resource: {
          role: newRole,
          scope: currentRule.scope,
        },
      })
      setAclRules(prev =>
        prev.map(rule =>
          rule.ruleId === ruleId ? { ...rule, role: newRole } : rule
        )
      )
      setAclError(null)
    } catch (e) {
      console.error('Failed to update ACL rule:', e)
      setAclError('Failed to update access rule')
      await loadAclRules(aclCalendar.id)
    }
  }

  const handleDeleteAclRule = async (ruleId: string) => {
    if (!aclCalendar?.id) return

    try {
      await api.callTool('delete_access_control_rule', {
        calendarId: aclCalendar.id,
        ruleId,
      })
      setAclRules(prev => prev.filter(rule => rule.ruleId !== ruleId))
      setAclError(null)
    } catch (e) {
      console.error('Failed to delete ACL rule:', e)
      setAclError('Failed to delete access rule')
    }
  }

  const handleToggleCalendar = (calendarId: string) => {
    setSelectedCalendarIds(prev => {
      const next = new Set(prev)
      if (next.has(calendarId)) {
        next.delete(calendarId)
      } else {
        next.add(calendarId)
      }
      return next
    })
  }

  // ============================================================================
  // Calendar Metadata Handlers
  // ============================================================================

  const handleViewCalendarMetadata = async (calendar: Calendar) => {
    try {
      const metadata = await api.callTool('get_calendar_metadata', {
        calendarId: calendar.id,
      }) as Record<string, unknown>
      setCalendarMetadata(metadata)
      setEditingMetadata({
        summary: (metadata.summary as string) || '',
        description: (metadata.description as string) || '',
        timeZone: (metadata.timeZone as string) || '',
      })
      setShowCalendarMetadata(true)
    } catch (e) {
      console.error('Failed to get calendar metadata:', e)
      setToastError('Failed to load calendar metadata')
    }
  }

  const handlePatchCalendarMetadata = async () => {
    if (!calendarMetadata || !editingMetadata) return
    const calendarId = calendarMetadata.id as string
    if (!calendarId) return

    try {
      const resource: Record<string, string> = {}
      if (editingMetadata.summary) resource.summary = editingMetadata.summary
      if (editingMetadata.description !== undefined) resource.description = editingMetadata.description
      if (editingMetadata.timeZone) resource.timeZone = editingMetadata.timeZone

      await api.callTool('patch_calendar_metadata', {
        calendarId,
        resource,
      })
      setShowCalendarMetadata(false)
      setCalendarMetadata(null)
      setEditingMetadata(null)
      await loadCalendars()
    } catch (e) {
      console.error('Failed to patch calendar metadata:', e)
      setToastError('Failed to update calendar metadata')
    }
  }

  // ============================================================================
  // Calendar List Entry Handlers (subscribe/unsubscribe)
  // ============================================================================

  const handleSubscribeCalendar = async () => {
    if (!subscribeCalendarId.trim()) return

    try {
      await api.callTool('create_calendar_list_entry', {
        resource: {
          id: subscribeCalendarId.trim(),
        },
      })
      setShowSubscribeCalendar(false)
      setSubscribeCalendarId('')
      await loadCalendars()
    } catch (e) {
      console.error('Failed to subscribe to calendar:', e)
      setToastError('Failed to add calendar. Check the calendar ID.')
    }
  }

  const handleUnsubscribeCalendar = async (calendarId: string) => {
    try {
      await api.callTool('delete_calendar_list_entry', {
        calendarId,
      })
      setSelectedCalendarIds(prev => {
        const next = new Set(prev)
        next.delete(calendarId)
        return next
      })
      await loadCalendars()
    } catch (e) {
      console.error('Failed to unsubscribe from calendar:', e)
      setToastError('Failed to remove calendar from list')
    }
  }

  const handlePatchCalendarListEntry = async (calendarId: string, updates: Record<string, unknown>) => {
    try {
      await api.callTool('patch_calendar_list_entry', {
        calendarId,
        resource: updates,
        colorRgbFormat: true,
      })
      await loadCalendars()
    } catch (e) {
      console.error('Failed to patch calendar list entry:', e)
      setToastError('Failed to update calendar list entry')
    }
  }

  // ============================================================================
  // Full Event Update Handler (update_event - PUT-style)
  // ============================================================================

  const handleFullUpdateEvent = async () => {
    if (!editingEvent?.id || !editingEvent?.calendarId) return

    try {
      const userTimeZone = calendarTimeZone
      const startWithTz = editingEvent.start?.dateTime
        ? { ...editingEvent.start, timeZone: userTimeZone }
        : editingEvent.start
      const endWithTz = editingEvent.end?.dateTime
        ? { ...editingEvent.end, timeZone: userTimeZone }
        : editingEvent.end

      const resource: Record<string, unknown> = {
        summary: editingEvent.summary || 'Untitled Event',
        description: editingEvent.description || '',
        location: editingEvent.location || '',
        start: startWithTz,
        end: endWithTz,
        attendees: editingEvent.attendees || [],
        reminders: editingEvent.reminders || { useDefault: true },
        recurrence: editingEvent.recurrence || [],
      }

      if (editingEvent.attachments && editingEvent.attachments.length > 0) {
        resource.attachments = editingEvent.attachments.map(a => ({ fileUrl: a.fileUrl }))
      }
      // Include status in full update
      resource.status = editingEvent.status || 'confirmed'
      // Include colorId via extendedProperties
      if (editingEvent.colorId) {
        resource.extendedProperties = {
          private: { colorId: editingEvent.colorId },
        }
      }

      await api.callTool('update_event', {
        calendarId: editingEvent.calendarId,
        eventId: editingEvent.id,
        resource,
        sendUpdates: 'none',
      })

      setShowEventEditor(false)
      setEditingEvent(null)
      setSelectedEvent(null)
      await loadEvents()
    } catch (e) {
      console.error('Failed to full-update event:', e)
      setToastError('Failed to update event')
    }
  }

  // ============================================================================
  // Watch / Notification Channel Handlers
  // ============================================================================

  const handleWatchEventChanges = async (calendarId: string) => {
    try {
      const channelId = `evt-watch-${Date.now()}`
      const result = await api.callTool('watch_event_changes', {
        calendarId,
        resource: {
          id: channelId,
          type: 'web_hook',
          address: 'https://example.com/webhook/events',
        },
      }) as Record<string, unknown>
      setActiveChannels(prev => [...prev, {
        id: result.id as string || channelId,
        resourceId: result.resourceId as string || '',
        type: 'events',
      }])
    } catch (e) {
      console.error('Failed to watch event changes:', e)
      setToastError('Failed to start watching events')
    }
  }

  const handleWatchAclChanges = async (calendarId: string) => {
    try {
      const channelId = `acl-watch-${Date.now()}`
      const result = await api.callTool('watch_access_control_rule_changes', {
        calendarId,
        resource: {
          id: channelId,
          type: 'web_hook',
          address: 'https://example.com/webhook/acl',
        },
      }) as Record<string, unknown>
      setActiveChannels(prev => [...prev, {
        id: result.id as string || channelId,
        resourceId: result.resourceId as string || '',
        type: 'acl',
      }])
    } catch (e) {
      console.error('Failed to watch ACL changes:', e)
      setToastError('Failed to start watching ACL changes')
    }
  }

  const handleWatchCalendarListChanges = async () => {
    try {
      const channelId = `callist-watch-${Date.now()}`
      const result = await api.callTool('watch_calendar_list_changes', {
        resource: {
          id: channelId,
          type: 'web_hook',
        },
      }) as Record<string, unknown>
      setActiveChannels(prev => [...prev, {
        id: result.id as string || channelId,
        resourceId: result.resourceId as string || '',
        type: 'calendar_list',
      }])
    } catch (e) {
      console.error('Failed to watch calendar list changes:', e)
      setToastError('Failed to start watching calendar list')
    }
  }

  const handleStopChannel = async (channelId: string, resourceId: string) => {
    try {
      await api.callTool('stop_notification_channel', {
        resource: {
          id: channelId,
        },
      })
      setActiveChannels(prev => prev.filter(c => c.id !== channelId))
    } catch (e) {
      console.error('Failed to stop channel:', e)
      setToastError('Failed to stop notification channel')
    }
  }

  // ============================================================================
  // ACL Rule Detail Handlers
  // ============================================================================

  const handleViewAclRule = async (calendarId: string, ruleId: string) => {
    try {
      const rule = await api.callTool('get_access_control_rule', {
        calendarId,
        ruleId,
      }) as AclRule
      setViewingAclRule(rule)
      setEditingAclRuleRole(rule.role)
    } catch (e) {
      console.error('Failed to get ACL rule:', e)
      setAclError('Failed to load rule details')
    }
  }

  const handlePatchAclRule = async () => {
    if (!viewingAclRule || !aclCalendar) return

    try {
      await api.callTool('patch_access_control_rule', {
        calendarId: aclCalendar.id,
        ruleId: viewingAclRule.ruleId,
        resource: {
          role: editingAclRuleRole,
        },
      })
      setViewingAclRule(null)
      setEditingAclRuleRole('')
      await loadAclRules(aclCalendar.id)
    } catch (e) {
      console.error('Failed to patch ACL rule:', e)
      setAclError('Failed to patch access rule')
    }
  }

  const handleNavigate = (direction: -1 | 1) => {
    setCurrentDate(prev => navigateDate(prev, currentView, direction))
  }

  const handleToday = () => {
    setCurrentDate(getNowInTimeZone(displayTimeZone))
  }

  // ============================================================================
  // Render Helpers
  // ============================================================================

  const renderEventChip = (event: CalendarEvent, compact = false) => {
    const calendar = calendars.find(c => c.id === event.calendarId)
    const color = getEventColor(event, calendar, colors?.event)
    const isAllDay = isAllDayEvent(event)
    const startTime = parseEventDateTime(event.start)
    const isCancelled = event.status === 'cancelled'
    const isTentative = event.status === 'tentative'

    // Build style based on event status
    const eventStyle: React.CSSProperties = isCancelled
      ? {
          // Cancelled: outline only, no fill
          backgroundColor: 'transparent',
          color: color.background,
          border: `2px solid ${color.background}`,
          opacity: 0.7,
        }
      : isTentative
      ? {
          // Tentative: hatched/striped pattern
          background: `repeating-linear-gradient(
            45deg,
            ${color.background},
            ${color.background} 2px,
            transparent 2px,
            transparent 6px
          )`,
          backgroundColor: color.background + '40', // 25% opacity base
          color: color.foreground,
          border: `1px solid ${color.background}`,
        }
      : {
          // Confirmed: normal solid fill
          backgroundColor: color.background,
          color: color.foreground,
        }

    return (
      <div
        key={event.id}
        className={`rounded px-2 py-1 cursor-pointer truncate text-xs ${compact ? 'mb-0.5' : 'mb-1'}`}
        style={eventStyle}
        onClick={(e) => {
          e.stopPropagation()
          handleViewEvent(event)
        }}
        title={event.summary || 'Untitled'}
      >
        {!isAllDay && !compact && (
          <span className="font-medium mr-1">{formatTime(startTime)}</span>
        )}
        {event.summary || 'Untitled'}
        <span style={{ marginLeft: '4px', fontSize: '10px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#80868b' }}>[{event.id}]</span>
      </div>
    )
  }

  // ============================================================================
  // View Components
  // ============================================================================

  const renderTimeColumn = () => {
    const hours = []
    for (let i = 0; i < 24; i++) {
      const hour = i === 0 ? 12 : i > 12 ? i - 12 : i
      const ampm = i < 12 ? 'AM' : 'PM'
      hours.push(
        <div
          key={i}
          className="h-12 pr-2 text-right text-xs"
          style={{ color: COLORS.textTertiary, borderBottom: `1px solid ${COLORS.borderLight}` }}
        >
          {hour} {ampm}
        </div>
      )
    }
    return <div className="w-16 flex-shrink-0" style={{ minHeight: 24 * 48 }}>{hours}</div>
  }

  const renderDayColumn = (date: Date, isToday: boolean, key?: React.Key) => {
    const dayEvents = events.filter(event => {
      const eventStart = parseEventDateTime(event.start)
      return isSameDay(eventStart, date)
    })

    const allDayEvents = dayEvents.filter(isAllDayEvent)
    const timedEvents = dayEvents.filter(e => !isAllDayEvent(e))

    return (
      <div key={key} className="flex-1 min-w-0" style={{ borderLeft: `1px solid ${COLORS.border}` }}>
        {/* All-day events */}
        {allDayEvents.length > 0 && (
          <div
            className="px-1 py-1 min-h-[28px]"
            style={{ backgroundColor: COLORS.bgSecondary, borderBottom: `1px solid ${COLORS.border}` }}
          >
            {allDayEvents.map(event => renderEventChip(event, true))}
          </div>
        )}
        {/* Time grid */}
        <div className="relative" style={{ minHeight: 24 * 48 }}>
          {Array.from({ length: 24 }).map((_, i) => (
            <div
              key={i}
              className="h-12 cursor-pointer"
              style={{
                borderBottom: `1px solid ${COLORS.borderLight}`,
                backgroundColor: isToday ? `${COLORS.todayBg}50` : 'transparent',
              }}
              onClick={() => {
                const clickDate = new Date(date)
                clickDate.setHours(i, 0, 0, 0)
                const endDate = new Date(clickDate)
                endDate.setHours(i + 1)
                setEditingEvent({
                  summary: '',
                  start: { dateTime: formatDateTime(clickDate) },
                  end: { dateTime: formatDateTime(endDate) },
                  reminders: { useDefault: true },
                })
                setShowEventEditor(true)
              }}
            />
          ))}
          {/* Timed events */}
          {timedEvents.map(event => {
            const start = parseEventDateTime(event.start)
            const end = parseEventDateTime(event.end)
            const startHour = start.getHours() + start.getMinutes() / 60
            const endHour = end.getHours() + end.getMinutes() / 60
            const duration = Math.max(endHour - startHour, 0.5)
            const calendar = calendars.find(c => c.id === event.calendarId)
            const color = getEventColor(event, calendar, colors?.event)
            const isCancelled = event.status === 'cancelled'
            const isTentative = event.status === 'tentative'

            // Build style based on event status
            const eventStyle: React.CSSProperties = {
              top: `${startHour * 48}px`,
              height: `${duration * 48 - 2}px`,
              ...(isCancelled
                ? {
                    // Cancelled: outline only, no fill
                    backgroundColor: 'transparent',
                    color: color.background,
                    border: `2px solid ${color.background}`,
                    opacity: 0.7,
                  }
                : isTentative
                ? {
                    // Tentative: hatched/striped pattern
                    background: `repeating-linear-gradient(
                      45deg,
                      ${color.background},
                      ${color.background} 2px,
                      transparent 2px,
                      transparent 6px
                    )`,
                    backgroundColor: color.background + '40',
                    color: color.foreground,
                    border: `1px solid ${color.background}`,
                  }
                : {
                    // Confirmed: normal solid fill
                    backgroundColor: color.background,
                    color: color.foreground,
                  }),
            }

            return (
              <div
                key={event.id}
                className="absolute left-1 right-1 rounded px-1 py-0.5 text-xs overflow-hidden cursor-pointer"
                style={eventStyle}
                onClick={(e) => {
                  e.stopPropagation()
                  handleViewEvent(event)
                }}
              >
                <div className="font-medium truncate">{event.summary || 'Untitled'}<span style={{ marginLeft: '4px', fontSize: '10px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#80868b' }}>[{event.id}]</span></div>
                <div className="truncate opacity-80">{formatTime(start)} - {formatTime(end)}</div>
              </div>
            )
          })}
          {/* Current time indicator */}
          {isToday && (
            <div
              className="absolute left-0 right-0 z-10"
              style={{
                top: `${(() => { const n = getNowInTimeZone(displayTimeZone); return (n.getHours() + n.getMinutes() / 60) * 48 })()}px`,
                borderTop: `2px solid ${COLORS.currentTime}`,
              }}
            >
              <div
                className="absolute -left-1 -top-1.5 w-3 h-3 rounded-full"
                style={{ backgroundColor: COLORS.currentTime }}
              />
            </div>
          )}
        </div>
      </div>
    )
  }

  const renderDayView = () => {
    const today = getNowInTimeZone(displayTimeZone)
    const isToday = isSameDay(currentDate, today)

    return (
      <div className="flex flex-1 overflow-auto">
        {renderTimeColumn()}
        <div className="flex flex-1 h-max">
          {renderDayColumn(currentDate, isToday)}
        </div>
      </div>
    )
  }

  const renderWeekView = () => {
    const weekStart = getStartOfWeek(currentDate)
    const today = getNowInTimeZone(displayTimeZone)
    const days = []

    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStart)
      day.setDate(day.getDate() + i)
      days.push(day)
    }

    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Day headers */}
        <div className="flex" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
          <div className="w-16 flex-shrink-0" />
          {days.map((day, i) => {
            const isToday = isSameDay(day, today)
            return (
              <div
                key={i}
                className="flex-1 text-center py-2"
                style={{
                  borderLeft: `1px solid ${COLORS.border}`,
                  backgroundColor: isToday ? COLORS.todayBg : 'transparent',
                }}
              >
                <div className="text-xs" style={{ color: COLORS.textTertiary }}>{DAYS_OF_WEEK[day.getDay()]}</div>
                <div
                  className="text-lg"
                  style={{
                    color: isToday ? COLORS.todayText : COLORS.textPrimary,
                    fontWeight: isToday ? 'bold' : 'normal',
                  }}
                >
                  {day.getDate()}
                </div>
              </div>
            )
          })}
        </div>
        {/* Time grid */}
        <div className="flex flex-1 overflow-auto">
          {renderTimeColumn()}
          <div className="flex flex-1 h-max">
            {days.map((day, i) => renderDayColumn(day, isSameDay(day, today), i))}
          </div>
        </div>
      </div>
    )
  }

  const renderMonthView = () => {
    const monthStart = getStartOfMonth(currentDate)
    const gridStart = getStartOfWeek(monthStart)
    const today = getNowInTimeZone(displayTimeZone)
    const weeks = []

    let currentDay = new Date(gridStart)
    for (let week = 0; week < 6; week++) {
      const days = []
      for (let day = 0; day < 7; day++) {
        const d = new Date(currentDay)
        const isCurrentMonth = d.getMonth() === currentDate.getMonth()
        const isToday = isSameDay(d, today)
        const dayEvents = events.filter(event => {
          const eventStart = parseEventDateTime(event.start)
          return isSameDay(eventStart, d)
        })

        days.push(
          <div
            key={day}
            className="flex-1 min-h-[100px] p-1 cursor-pointer transition-colors"
            style={{
              borderBottom: `1px solid ${COLORS.border}`,
              borderRight: `1px solid ${COLORS.border}`,
              backgroundColor: isToday ? COLORS.todayBg : isCurrentMonth ? COLORS.bgPrimary : COLORS.bgSecondary,
            }}
            onMouseEnter={(e) => {
              if (!isToday) e.currentTarget.style.backgroundColor = COLORS.bgHover
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = isToday ? COLORS.todayBg : isCurrentMonth ? COLORS.bgPrimary : COLORS.bgSecondary
            }}
            onClick={() => {
              setCurrentDate(d)
              setCurrentView('day')
            }}
          >
            <div
              className="text-sm mb-1"
              style={{
                color: isToday ? COLORS.todayText : isCurrentMonth ? COLORS.textPrimary : COLORS.textTertiary,
                fontWeight: isToday ? 'bold' : 'normal',
              }}
            >
              {d.getDate()}
            </div>
            <div className="overflow-hidden">
              {dayEvents.slice(0, 3).map(event => renderEventChip(event, true))}
              {dayEvents.length > 3 && (
                <div className="text-xs pl-2" style={{ color: COLORS.textTertiary }}>
                  +{dayEvents.length - 3} more
                </div>
              )}
            </div>
          </div>
        )
        currentDay.setDate(currentDay.getDate() + 1)
      }
      weeks.push(
        <div key={week} className="flex">
          {days}
        </div>
      )
    }

    return (
      <div className="flex flex-col flex-1 overflow-auto">
        {/* Day headers */}
        <div className="flex" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
          {DAYS_OF_WEEK.map((day, i) => (
            <div
              key={i}
              className="flex-1 text-center py-2 text-xs font-medium"
              style={{ color: COLORS.textTertiary }}
            >
              {day}
            </div>
          ))}
        </div>
        {/* Calendar grid */}
        <div className="flex-1">
          {weeks}
        </div>
      </div>
    )
  }

  // ============================================================================
  // Sidebar
  // ============================================================================

  const renderSidebar = () => {
    return (
      <div
        className="w-56 flex-shrink-0 flex flex-col"
        style={{ borderRight: `1px solid ${COLORS.border}`, backgroundColor: COLORS.bgPrimary }}
      >
        {/* Create button */}
        <div className="p-4">
          <button
            onClick={handleCreateEvent}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-full shadow-sm transition-shadow hover:shadow-md"
            style={{ backgroundColor: COLORS.bgPrimary, border: `1px solid ${COLORS.border}` }}
          >
            <svg width="36" height="36" viewBox="0 0 36 36">
              <path fill="#059669" d="M16 16v14h4V20z"/>
              <path fill="#0D9488" d="M30 16H20l-4 4h14z"/>
              <path fill="#F59E0B" d="M6 16v4h10l4-4z"/>
              <path fill="#E11D48" d="M20 16V6h-4v14z"/>
            </svg>
            <span className="font-medium" style={{ color: COLORS.textSecondary }}>Create</span>
          </button>
        </div>

        {/* Mini calendar - simplified */}
        <div className="px-4 pb-4">
          <div className="text-sm font-medium mb-2" style={{ color: COLORS.textSecondary }}>
            {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-xs text-center">
            {DAYS_OF_WEEK.map(d => (
              <div key={d} className="py-1" style={{ color: COLORS.textTertiary }}>{d[0]}</div>
            ))}
            {(() => {
              const monthStart = getStartOfMonth(currentDate)
              const gridStart = getStartOfWeek(monthStart)
              const today = getNowInTimeZone(displayTimeZone)
              const cells = []
              const d = new Date(gridStart)
              for (let i = 0; i < 42; i++) {
                const day = new Date(d)
                const isCurrentMonth = day.getMonth() === currentDate.getMonth()
                const isToday = isSameDay(day, today)
                const isSelected = isSameDay(day, currentDate)
                cells.push(
                  <div
                    key={i}
                    className="py-1 cursor-pointer rounded transition-colors"
                    style={{
                      color: isToday ? COLORS.todayText : isCurrentMonth ? COLORS.textPrimary : COLORS.textTertiary,
                      fontWeight: isToday ? 'bold' : 'normal',
                      backgroundColor: isSelected ? COLORS.accentLight : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = COLORS.bgHover
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = isSelected ? COLORS.accentLight : 'transparent'
                    }}
                    onClick={() => setCurrentDate(day)}
                  >
                    {day.getDate()}
                  </div>
                )
                d.setDate(d.getDate() + 1)
              }
              return cells
            })()}
          </div>
        </div>

        {/* Calendar list */}
        <div className="flex-1 overflow-auto px-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium" style={{ color: COLORS.textSecondary }}>My calendars</span>
            <button
              onClick={handleCreateCalendar}
              className="transition-colors"
              style={{ color: COLORS.textTertiary }}
              onMouseEnter={(e) => e.currentTarget.style.color = COLORS.textSecondary}
              onMouseLeave={(e) => e.currentTarget.style.color = COLORS.textTertiary}
              title="Add calendar"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
          </div>
          {calendars.filter(calendar => !calendar.hidden).map(calendar => (
            <div
              key={calendar.id}
              className="group flex items-center gap-2 py-1 cursor-pointer rounded px-1 transition-colors"
              style={{ backgroundColor: 'transparent' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.bgHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <input
                type="checkbox"
                checked={selectedCalendarIds.has(calendar.id)}
                onChange={() => handleToggleCalendar(calendar.id)}
                className="rounded"
                style={{ accentColor: calendar.backgroundColor || COLORS.eventDefault }}
              />
              <div
                className="w-3 h-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: calendar.backgroundColor || COLORS.eventDefault }}
              />
              <span
                className="text-sm truncate flex-1"
                style={{ color: COLORS.textPrimary }}
                onClick={() => handleToggleCalendar(calendar.id)}
              >
                {calendar.summaryOverride || calendar.summary}
                <span style={{ marginLeft: '4px', fontSize: '10px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#80868b' }}>[{calendar.id}]</span>
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleEditCalendar(calendar)
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded"
                style={{ color: COLORS.textTertiary }}
                onMouseEnter={(e) => e.currentTarget.style.color = COLORS.textSecondary}
                onMouseLeave={(e) => e.currentTarget.style.color = COLORS.textTertiary}
                title="Edit calendar"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="1" />
                  <circle cx="12" cy="5" r="1" />
                  <circle cx="12" cy="19" r="1" />
                </svg>
              </button>
            </div>
          ))}
          {calendars.filter(calendar => !calendar.hidden).length > 0 && (
            <button
              onClick={() => setShowManageCalendars(true)}
              className="text-xs mt-2 cursor-pointer transition-colors"
              style={{ color: COLORS.textTertiary }}
              onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
              onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
            >
              Manage calendars
            </button>
          )}
          <button
            onClick={() => setShowSubscribeCalendar(true)}
            className="text-xs mt-1 cursor-pointer transition-colors block"
            style={{ color: COLORS.textTertiary }}
            onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
            onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
          >
            Subscribe to calendar
          </button>
          <button
            onClick={() => setShowWatchPanel(true)}
            className="text-xs mt-1 cursor-pointer transition-colors block"
            style={{ color: COLORS.textTertiary }}
            onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
            onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
          >
            Watch & notifications
          </button>
        </div>
      </div>
    )
  }

  // ============================================================================
  // Event Editor
  // ============================================================================

  const renderEventEditor = () => {
    if (!showEventEditor || !editingEvent) return null

    // Check if it's an all-day event (full day span or legacy date-only format)
    const isAllDay = (() => {
      // Legacy date-only format
      if (editingEvent.start?.date && !editingEvent.start?.dateTime) return true
      // Full day span check
      if (editingEvent.start?.dateTime && editingEvent.end?.dateTime) {
        const start = parseEventDateTime(editingEvent.start as EventDateTime)
        const end = parseEventDateTime(editingEvent.end as EventDateTime)
        return start.getHours() === 0 && start.getMinutes() === 0 &&
               end.getHours() === 23 && end.getMinutes() === 59
      }
      return false
    })()
    const startDate = editingEvent.start?.dateTime
      ? parseEventDateTime(editingEvent.start as EventDateTime)
      : editingEvent.start?.date
        ? parseEventDateTime(editingEvent.start as EventDateTime)
        : getNowInTimeZone(displayTimeZone)
    const endDate = editingEvent.end?.dateTime
      ? parseEventDateTime(editingEvent.end as EventDateTime)
      : editingEvent.end?.date
        ? parseEventDateTime(editingEvent.end as EventDateTime)
        : getNowInTimeZone(displayTimeZone)

    return (
      <div
        className="w-96 flex flex-col overflow-hidden"
        style={{ borderLeft: `1px solid ${COLORS.border}`, backgroundColor: COLORS.bgPrimary }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-4"
          style={{ borderBottom: `1px solid ${COLORS.border}` }}
        >
          <h2 className="text-lg font-medium" style={{ color: COLORS.textPrimary }}>
            {editingEvent.id ? 'Edit Event' : 'New Event'}
            {editingEvent.id && <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#80868b' }}>[{editingEvent.id}]</span>}
          </h2>
          <button
            onClick={() => {
              setShowEventEditor(false)
              setEditingEvent(null)
              setSelectedEvent(null)
            }}
            className="transition-colors"
            style={{ color: COLORS.textTertiary }}
            onMouseEnter={(e) => e.currentTarget.style.color = COLORS.textSecondary}
            onMouseLeave={(e) => e.currentTarget.style.color = COLORS.textTertiary}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Recurring event info */}
        {editingEvent.recurringEventId && editingEvent.id && (
          <div
            className="mx-4 mt-2 p-3 rounded text-sm"
            style={{ backgroundColor: COLORS.accentLight, color: COLORS.textPrimary }}
          >
            <div className="flex items-center gap-2 mb-1">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={COLORS.accent} strokeWidth="2">
                <polyline points="23 4 23 10 17 10"/>
                <polyline points="1 20 1 14 7 14"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
              <span className="font-medium">Recurring event</span>
            </div>
            <div className="text-xs" style={{ color: COLORS.textSecondary }}>
              When saving, you can choose to edit only this occurrence or all events in the series.
            </div>
          </div>
        )}

        {/* Form */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Title */}
          <input
            type="text"
            placeholder="Add title"
            value={editingEvent.summary || ''}
            onChange={(e) => setEditingEvent({ ...editingEvent, summary: e.target.value })}
            className="w-full text-xl font-medium border-0 pb-2 focus:outline-none"
            style={{
              color: COLORS.textPrimary,
              borderBottom: `1px solid ${COLORS.border}`,
              backgroundColor: 'transparent',
            }}
          />

          {/* Calendar selector */}
          <div className="flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: COLORS.textTertiary }}>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <select
              value={editingEvent.calendarId || ''}
              onChange={(e) => setEditingEvent({ ...editingEvent, calendarId: e.target.value })}
              className="flex-1 px-2 py-1 rounded text-sm"
              style={{ border: `1px solid ${COLORS.border}`, color: COLORS.textPrimary, backgroundColor: COLORS.bgPrimary }}
            >
              {calendars.map(cal => (
                <option key={cal.id} value={cal.id}>
                  {cal.summaryOverride || cal.summary}{cal.primary ? ' (Primary)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* All-day toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isAllDay}
              onChange={(e) => {
                if (e.target.checked) {
                  // Set to full day span: 00:00:00 to 23:59:59
                  const allDayStart = new Date(startDate)
                  allDayStart.setHours(0, 0, 0, 0)
                  const allDayEnd = new Date(endDate)
                  allDayEnd.setHours(23, 59, 59, 0)
                  setEditingEvent({
                    ...editingEvent,
                    start: { dateTime: formatDateTime(allDayStart) },
                    end: { dateTime: formatDateTime(allDayEnd) },
                  })
                } else {
                  // Set to a 1-hour event at 9am
                  const timedStart = new Date(startDate)
                  timedStart.setHours(9, 0, 0, 0)
                  const timedEnd = new Date(timedStart)
                  timedEnd.setHours(10, 0, 0, 0)
                  setEditingEvent({
                    ...editingEvent,
                    start: { dateTime: formatDateTime(timedStart) },
                    end: { dateTime: formatDateTime(timedEnd) },
                  })
                }
              }}
              className="rounded"
            />
            <span className="text-sm" style={{ color: COLORS.textSecondary }}>All day</span>
          </label>

          {/* Date/Time */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: COLORS.textTertiary }}>
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <input
                type="date"
                key={`start-date-${formatDate(startDate)}`}
                defaultValue={formatDate(startDate)}
                onChange={(e) => {
                  if (!parseValidDateInput(e.target.value)) return

                  // Calculate duration to preserve it
                  const duration = endDate.getTime() - startDate.getTime()

                  let newStartDate: Date
                  let newEndDate: Date

                  if (isAllDay) {
                    // For all-day events, set to full day span
                    newStartDate = new Date(e.target.value + 'T00:00:00')
                    newEndDate = new Date(newStartDate.getTime() + duration)
                    newEndDate.setHours(23, 59, 59, 0)
                  } else {
                    newStartDate = new Date(e.target.value + 'T' + formatTimeInput(startDate))
                    newEndDate = new Date(newStartDate.getTime() + duration)
                  }

                  setEditingEvent(prev => prev ? {
                    ...prev,
                    start: { dateTime: formatDateTime(newStartDate) },
                    end: { dateTime: formatDateTime(newEndDate) },
                  } : prev)
                }}
                className="flex-1 px-2 py-1 rounded text-sm"
                style={{ border: `1px solid ${COLORS.border}`, color: COLORS.textPrimary }}
              />
              {!isAllDay && (
                <input
                  type="time"
                  key={`start-time-${formatTimeInput(startDate)}`}
                  defaultValue={formatTimeInput(startDate)}
                  onChange={(e) => {
                    const parsed = parseValidTimeInput(e.target.value)
                    if (!parsed) return

                    const newStartDate = new Date(startDate)
                    newStartDate.setHours(parsed.hours, parsed.minutes)
                    // Calculate duration to preserve it
                    const duration = endDate.getTime() - startDate.getTime()
                    const newEndDate = new Date(newStartDate.getTime() + duration)

                    setEditingEvent(prev => prev ? {
                      ...prev,
                      start: { dateTime: formatDateTime(newStartDate) },
                      end: { dateTime: formatDateTime(newEndDate) },
                    } : prev)
                  }}
                  className="w-24 px-2 py-1 rounded text-sm"
                  style={{ border: `1px solid ${COLORS.border}`, color: COLORS.textPrimary }}
                />
              )}
            </div>
            <div className="flex items-center gap-2 pl-7">
              <span className="text-sm" style={{ color: COLORS.textTertiary }}>to</span>
              <input
                type="date"
                key={`end-date-${formatDate(endDate)}`}
                defaultValue={formatDate(endDate)}
                onChange={(e) => {
                  if (!parseValidDateInput(e.target.value)) return

                  let newEndDate: Date

                  if (isAllDay) {
                    // For all-day events, set to end of day
                    newEndDate = new Date(e.target.value + 'T23:59:59')
                  } else {
                    newEndDate = new Date(e.target.value + 'T' + formatTimeInput(endDate))
                  }

                  // Ensure end is not before start
                  if (newEndDate < startDate) {
                    newEndDate = new Date(startDate)
                    if (isAllDay) {
                      newEndDate.setHours(23, 59, 59, 0)
                    } else {
                      newEndDate.setHours(newEndDate.getHours() + 1)
                    }
                  }

                  setEditingEvent(prev => prev ? { ...prev, end: { dateTime: formatDateTime(newEndDate) } } : prev)
                }}
                className="flex-1 px-2 py-1 rounded text-sm"
                style={{ border: `1px solid ${COLORS.border}`, color: COLORS.textPrimary }}
              />
              {!isAllDay && (
                <input
                  type="time"
                  key={`end-time-${formatTimeInput(endDate)}`}
                  defaultValue={formatTimeInput(endDate)}
                  onChange={(e) => {
                    const parsed = parseValidTimeInput(e.target.value)
                    if (!parsed) return

                    let newEndDate = new Date(endDate)
                    newEndDate.setHours(parsed.hours, parsed.minutes)
                    // Ensure end is not before start
                    if (newEndDate <= startDate) {
                      newEndDate = new Date(startDate)
                      newEndDate.setHours(newEndDate.getHours() + 1)
                    }
                    setEditingEvent(prev => prev ? { ...prev, end: { dateTime: formatDateTime(newEndDate) } } : prev)
                  }}
                  className="w-24 px-2 py-1 rounded text-sm"
                  style={{ border: `1px solid ${COLORS.border}`, color: COLORS.textPrimary }}
                />
              )}
            </div>
          </div>

          {/* Recurrence */}
          <div className="flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: COLORS.textTertiary }}>
              <polyline points="23 4 23 10 17 10"/>
              <polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            <select
              value={editingEvent.recurrence?.[0]?.includes('DAILY') ? 'daily' :
                     editingEvent.recurrence?.[0]?.includes('WEEKLY') ? 'weekly' :
                     editingEvent.recurrence?.[0]?.includes('MONTHLY') ? 'monthly' :
                     editingEvent.recurrence?.[0]?.includes('YEARLY') ? 'yearly' : 'none'}
              onChange={(e) => {
                const value = e.target.value
                if (value === 'none') {
                  setEditingEvent({ ...editingEvent, recurrence: undefined })
                } else {
                  const rules: Record<string, string> = {
                    daily: 'RRULE:FREQ=DAILY',
                    weekly: 'RRULE:FREQ=WEEKLY',
                    monthly: 'RRULE:FREQ=MONTHLY',
                    yearly: 'RRULE:FREQ=YEARLY',
                  }
                  setEditingEvent({ ...editingEvent, recurrence: [rules[value]] })
                }
              }}
              className="flex-1 px-2 py-1 rounded text-sm"
              style={{ border: `1px solid ${COLORS.border}`, color: COLORS.textPrimary }}
            >
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>

          {/* Event Color */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: COLORS.textTertiary }}>
                <circle cx="12" cy="12" r="10"/>
                <circle cx="12" cy="12" r="4"/>
              </svg>
              <span className="text-sm" style={{ color: COLORS.textTertiary }}>Event color</span>
            </div>
            <div className="pl-7 flex flex-wrap gap-2">
              <button
                onClick={() => setEditingEvent({ ...editingEvent, colorId: undefined })}
                className="w-6 h-6 rounded-full transition-transform hover:scale-110 flex items-center justify-center"
                style={{
                  backgroundColor: COLORS.bgTertiary,
                  border: !editingEvent.colorId ? `2px solid ${COLORS.textPrimary}` : '2px solid transparent',
                }}
                title="Calendar default"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={COLORS.textSecondary} strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
              {Object.entries((colors?.event && Object.keys(colors.event).length > 0) ? colors.event : EVENT_COLORS).map(([colorId, colorDef]) => (
                <button
                  key={colorId}
                  onClick={() => setEditingEvent({ ...editingEvent, colorId })}
                  className="w-6 h-6 rounded-full transition-transform hover:scale-110"
                  style={{
                    backgroundColor: colorDef.background,
                    border: editingEvent.colorId === colorId ? `2px solid ${COLORS.textPrimary}` : '2px solid transparent',
                  }}
                  title={`Color ${colorId}`}
                />
              ))}
            </div>
          </div>

          {/* Event Status */}
          <div className="flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: COLORS.textTertiary }}>
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <select
              value={editingEvent.status || 'confirmed'}
              onChange={(e) => {
                const newStatus = e.target.value as 'confirmed' | 'tentative' | 'cancelled'
                setEditingEvent(prev => prev ? { ...prev, status: newStatus } : prev)
              }}
              className="flex-1 px-2 py-1 rounded text-sm"
              style={{ border: `1px solid ${COLORS.border}`, color: COLORS.textPrimary }}
            >
              <option value="confirmed">Confirmed</option>
              <option value="tentative">Tentative</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Location */}
          <div className="flex items-start gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-1" style={{ color: COLORS.textTertiary }}>
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
            <input
              type="text"
              placeholder="Add location"
              value={editingEvent.location || ''}
              onChange={(e) => setEditingEvent({ ...editingEvent, location: e.target.value })}
              className="flex-1 px-2 py-1 rounded text-sm"
              style={{ border: `1px solid ${COLORS.border}`, color: COLORS.textPrimary }}
            />
          </div>

          {/* Description */}
          <div className="flex items-start gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-1" style={{ color: COLORS.textTertiary }}>
              <line x1="17" y1="10" x2="3" y2="10"/>
              <line x1="21" y1="6" x2="3" y2="6"/>
              <line x1="21" y1="14" x2="3" y2="14"/>
              <line x1="17" y1="18" x2="3" y2="18"/>
            </svg>
            <textarea
              placeholder="Add description"
              value={editingEvent.description || ''}
              onChange={(e) => setEditingEvent({ ...editingEvent, description: e.target.value })}
              className="flex-1 px-2 py-1 rounded text-sm min-h-[80px] resize-none"
              style={{ border: `1px solid ${COLORS.border}`, color: COLORS.textPrimary }}
            />
          </div>

          {/* Attendees */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: COLORS.textTertiary }}>
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              <span className="text-sm" style={{ color: COLORS.textTertiary }}>Attendees</span>
            </div>
            <div className="pl-7 space-y-2">
              {(editingEvent.attendees || []).map((attendee, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div
                    className="flex-1 flex items-center gap-2 px-2 py-1 rounded text-sm"
                    style={{ backgroundColor: COLORS.bgTertiary, color: COLORS.textPrimary }}
                  >
                    <span className="truncate">{attendee.displayName || attendee.email}<span style={{ marginLeft: '4px', fontSize: '10px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#80868b' }}>[{attendee.email}]</span></span>
                    {attendee.responseStatus && (
                      <span
                        className="text-xs px-1 rounded"
                        style={{
                          backgroundColor: attendee.responseStatus === 'accepted' ? COLORS.successLight :
                            attendee.responseStatus === 'declined' ? COLORS.dangerLight :
                            attendee.responseStatus === 'tentative' ? COLORS.warningLight :
                            COLORS.bgHover,
                          color: attendee.responseStatus === 'accepted' ? COLORS.success :
                            attendee.responseStatus === 'declined' ? COLORS.danger :
                            attendee.responseStatus === 'tentative' ? COLORS.warning :
                            COLORS.textSecondary,
                        }}
                      >
                        {attendee.responseStatus}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setEditingEvent(prev => {
                        if (!prev) return prev
                        const newAttendees = [...(prev.attendees || [])]
                        newAttendees.splice(index, 1)
                        return { ...prev, attendees: newAttendees }
                      })
                    }}
                    className="transition-colors"
                    style={{ color: COLORS.textTertiary }}
                    onMouseEnter={(e) => e.currentTarget.style.color = COLORS.danger}
                    onMouseLeave={(e) => e.currentTarget.style.color = COLORS.textTertiary}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              ))}
              <input
                type="email"
                placeholder="Add attendee email"
                className="w-full px-2 py-1 rounded text-sm"
                style={{ border: `1px solid ${COLORS.border}`, color: COLORS.textPrimary }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const input = e.target as HTMLInputElement
                    const email = input.value.trim()
                    if (email && email.includes('@')) {
                      // Check for duplicate attendee
                      const alreadyAdded = (editingEvent.attendees || []).some(
                        a => a.email.toLowerCase() === email.toLowerCase()
                      )
                      if (alreadyAdded) {
                        input.value = ''
                        return
                      }
                      setEditingEvent(prev => prev ? {
                        ...prev,
                        attendees: [...(prev.attendees || []), { email, responseStatus: 'needsAction' }],
                      } : prev)
                      input.value = ''
                    }
                  }
                }}
              />
            </div>
          </div>

          {/* Reminders */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: COLORS.textTertiary }}>
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              <span className="text-sm" style={{ color: COLORS.textTertiary }}>Reminders</span>
            </div>
            <div className="pl-7 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingEvent.reminders?.useDefault ?? true}
                  onChange={(e) => {
                    setEditingEvent({
                      ...editingEvent,
                      reminders: {
                        useDefault: e.target.checked,
                        overrides: e.target.checked ? [] : editingEvent.reminders?.overrides
                      },
                    })
                  }}
                  className="rounded"
                />
                <span className="text-sm" style={{ color: COLORS.textSecondary }}>Use default reminders</span>
              </label>
              {!editingEvent.reminders?.useDefault && (
                <>
                  {(editingEvent.reminders?.overrides || []).map((reminder, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <select
                        value={reminder.method}
                        onChange={(e) => {
                          const newOverrides = [...(editingEvent.reminders?.overrides || [])]
                          newOverrides[index] = { ...reminder, method: e.target.value as 'email' | 'popup' | 'sms' }
                          setEditingEvent({
                            ...editingEvent,
                            reminders: { ...editingEvent.reminders, useDefault: false, overrides: newOverrides },
                          })
                        }}
                        className="px-2 py-1 rounded text-sm"
                        style={{ border: `1px solid ${COLORS.border}`, color: COLORS.textPrimary }}
                      >
                        <option value="popup">Notification</option>
                        <option value="email">Email</option>
                        <option value="sms">SMS</option>
                      </select>
                      <input
                        type="number"
                        min="0"
                        value={reminder.minutes}
                        onChange={(e) => {
                          const newOverrides = [...(editingEvent.reminders?.overrides || [])]
                          newOverrides[index] = { ...reminder, minutes: parseInt(e.target.value) || 0 }
                          setEditingEvent({
                            ...editingEvent,
                            reminders: { ...editingEvent.reminders, useDefault: false, overrides: newOverrides },
                          })
                        }}
                        className="w-16 px-2 py-1 rounded text-sm"
                        style={{ border: `1px solid ${COLORS.border}`, color: COLORS.textPrimary }}
                      />
                      <span className="text-sm" style={{ color: COLORS.textTertiary }}>minutes before</span>
                      <button
                        onClick={() => {
                          const newOverrides = [...(editingEvent.reminders?.overrides || [])]
                          newOverrides.splice(index, 1)
                          setEditingEvent({
                            ...editingEvent,
                            reminders: { ...editingEvent.reminders, useDefault: false, overrides: newOverrides },
                          })
                        }}
                        className="transition-colors"
                        style={{ color: COLORS.textTertiary }}
                        onMouseEnter={(e) => e.currentTarget.style.color = COLORS.danger}
                        onMouseLeave={(e) => e.currentTarget.style.color = COLORS.textTertiary}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18"/>
                          <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      const newOverrides = [...(editingEvent.reminders?.overrides || []), { method: 'popup' as const, minutes: 10 }]
                      setEditingEvent({
                        ...editingEvent,
                        reminders: { ...editingEvent.reminders, useDefault: false, overrides: newOverrides },
                      })
                    }}
                    className="text-sm"
                    style={{ color: COLORS.accent }}
                    onMouseEnter={(e) => e.currentTarget.style.color = COLORS.accentHover}
                    onMouseLeave={(e) => e.currentTarget.style.color = COLORS.accent}
                  >
                    + Add reminder
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Attachments */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: COLORS.textTertiary }}>
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
              <span className="text-sm" style={{ color: COLORS.textTertiary }}>Attachments</span>
            </div>
            <div className="pl-7 space-y-2">
              {(editingEvent.attachments || []).map((attachment, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div
                    className="flex-1 flex items-center gap-2 px-2 py-1 rounded text-sm"
                    style={{ backgroundColor: COLORS.bgTertiary, color: COLORS.textPrimary }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                    </svg>
                    <a
                      href={attachment.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate hover:underline"
                      style={{ color: COLORS.accent }}
                    >
                      {attachment.title || attachment.fileUrl}
                    </a>
                  </div>
                  <button
                    onClick={() => {
                      setEditingEvent(prev => {
                        if (!prev) return prev
                        const newAttachments = [...(prev.attachments || [])]
                        newAttachments.splice(index, 1)
                        return { ...prev, attachments: newAttachments }
                      })
                    }}
                    className="transition-colors"
                    style={{ color: COLORS.textTertiary }}
                    onMouseEnter={(e) => e.currentTarget.style.color = COLORS.danger}
                    onMouseLeave={(e) => e.currentTarget.style.color = COLORS.textTertiary}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              ))}
              <input
                type="url"
                placeholder="Add attachment URL (e.g., https://drive.gridwell.com/...)"
                className="w-full px-2 py-1 rounded text-sm"
                style={{ border: `1px solid ${COLORS.border}`, color: COLORS.textPrimary }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const input = e.target as HTMLInputElement
                    const url = input.value.trim()
                    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
                      setEditingEvent(prev => prev ? {
                        ...prev,
                        attachments: [...(prev.attachments || []), { fileUrl: url, title: url.split('/').pop() || url }],
                      } : prev)
                      input.value = ''
                    }
                  }
                }}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between p-4"
          style={{ borderTop: `1px solid ${COLORS.border}` }}
        >
          {editingEvent.id && (
            <button
              onClick={() => setShowDeleteConfirm('event')}
              className="px-4 py-2 rounded transition-colors"
              style={{ color: COLORS.danger }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.dangerLight}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              Delete
            </button>
          )}
          <div className="flex-1" />
          <div className="flex gap-2">
            <button
              onClick={() => {
                setShowEventEditor(false)
                setEditingEvent(null)
                setSelectedEvent(null)
              }}
              className="px-4 py-2 rounded transition-colors"
              style={{ color: COLORS.textSecondary }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.bgHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              Cancel
            </button>
            {editingEvent.id && !editingEvent.recurringEventId && (
              <button
                onClick={handleFullUpdateEvent}
                className="px-4 py-2 rounded transition-colors"
                style={{ color: COLORS.accent, border: `1px solid ${COLORS.accent}` }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.accentLight}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                title="Full update (replaces entire event)"
              >
                Full Update
              </button>
            )}
            <button
              onClick={() => handleSaveEvent()}
              className="px-4 py-2 rounded transition-colors text-white"
              style={{ backgroundColor: COLORS.accent }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.accentHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = COLORS.accent}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ============================================================================
  // Calendar Editor Modal
  // ============================================================================

  const renderCalendarEditor = () => {
    if (!showCalendarEditor || !editingCalendar) return null

    return (
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <div className="rounded-lg shadow-xl w-96 max-h-full flex flex-col overflow-hidden" style={{ backgroundColor: COLORS.bgPrimary }}>
          <div
            className="flex items-center justify-between p-4 flex-shrink-0"
            style={{ borderBottom: `1px solid ${COLORS.border}` }}
          >
            <h2 className="text-lg font-medium" style={{ color: COLORS.textPrimary }}>
              {editingCalendar.id ? 'Edit Calendar' : 'Create Calendar'}
              {editingCalendar.id && <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#80868b' }}>[{editingCalendar.id}]</span>}
            </h2>
            <button
              onClick={() => {
                setShowCalendarEditor(false)
                setEditingCalendar(null)
              }}
              className="transition-colors"
              style={{ color: COLORS.textTertiary }}
              onMouseEnter={(e) => e.currentTarget.style.color = COLORS.textSecondary}
              onMouseLeave={(e) => e.currentTarget.style.color = COLORS.textTertiary}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div className="p-4 space-y-4 overflow-y-auto flex-1 min-h-0">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: COLORS.textSecondary }}>Name</label>
              <input
                type="text"
                value={editingCalendar.summary || ''}
                onChange={(e) => setEditingCalendar({ ...editingCalendar, summary: e.target.value })}
                className="w-full px-3 py-2 rounded focus:outline-none"
                style={{
                  border: `1px solid ${COLORS.border}`,
                  color: COLORS.textPrimary,
                }}
                placeholder="Calendar name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: COLORS.textSecondary }}>Description</label>
              <textarea
                value={editingCalendar.description || ''}
                onChange={(e) => setEditingCalendar({ ...editingCalendar, description: e.target.value })}
                className="w-full px-3 py-2 rounded focus:outline-none min-h-[80px] resize-none"
                style={{
                  border: `1px solid ${COLORS.border}`,
                  color: COLORS.textPrimary,
                }}
                placeholder="Calendar description"
              />
            </div>
            {/* Notifications - available for both new and existing calendars */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: COLORS.textSecondary }}>Notifications</label>
              <div className="space-y-2">
                {[
                  { type: 'eventCreation', label: 'Event created' },
                  { type: 'eventChange', label: 'Event changed' },
                  { type: 'eventCancellation', label: 'Event cancelled' },
                ].map(({ type, label }) => {
                  const isChecked = editingCalendar.notificationSettings?.notifications?.some(
                    n => n.type === type
                  ) || false

                  return (
                    <div key={type} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`notification-${type}`}
                        checked={isChecked}
                        onChange={(e) => {
                          const currentNotifications = editingCalendar.notificationSettings?.notifications || []
                          let newNotifications

                          if (e.target.checked) {
                            // Add this notification type
                            newNotifications = [...currentNotifications, { type, method: 'email' }]
                          } else {
                            // Remove this notification type
                            newNotifications = currentNotifications.filter(n => n.type !== type)
                          }

                          setEditingCalendar({
                            ...editingCalendar,
                            notificationSettings: { notifications: newNotifications }
                          })
                        }}
                        className="rounded"
                      />
                      <label htmlFor={`notification-${type}`} className="text-sm" style={{ color: COLORS.textSecondary }}>
                        {label}
                      </label>
                    </div>
                  )
                })}
              </div>
            </div>
            {/* Calendar list entry customization - only show when editing existing calendar */}
            {editingCalendar.id && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: COLORS.textSecondary }}>Custom Display Name</label>
                  <input
                    type="text"
                    value={editingCalendar.summaryOverride || ''}
                    onChange={(e) => setEditingCalendar({ ...editingCalendar, summaryOverride: e.target.value })}
                    className="w-full px-3 py-2 rounded focus:outline-none"
                    style={{
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.textPrimary,
                    }}
                    placeholder="Override calendar name"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="hidden-checkbox"
                    checked={editingCalendar.hidden || false}
                    onChange={(e) => setEditingCalendar({ ...editingCalendar, hidden: e.target.checked })}
                    className="rounded"
                  />
                  <label htmlFor="hidden-checkbox" className="text-sm" style={{ color: COLORS.textSecondary }}>
                    Hide from sidebar
                  </label>
                </div>
              </>
            )}
            {/* Color picker - only show when editing existing calendar */}
            {editingCalendar.id && (
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: COLORS.textSecondary }}>Color</label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(calendarColors).map(([colorId, colorDef]) => (
                    <button
                      key={colorId}
                      onClick={() => setEditingCalendar({
                        ...editingCalendar,
                        colorId,
                        backgroundColor: colorDef.background,
                        foregroundColor: colorDef.foreground,
                      })}
                      className="w-6 h-6 rounded-full transition-transform hover:scale-110"
                      style={{
                        backgroundColor: colorDef.background,
                        border: editingCalendar.colorId === colorId
                          ? `2px solid ${COLORS.textPrimary}`
                          : '2px solid transparent',
                        boxShadow: editingCalendar.colorId === colorId
                          ? `0 0 0 2px ${COLORS.bgPrimary}`
                          : 'none',
                      }}
                      title={`Color ${colorId}`}
                    />
                  ))}
                </div>
              </div>
            )}
            {/* Calendar metadata button - only show when editing existing calendar */}
            {editingCalendar.id && (
              <div>
                <button
                  onClick={() => {
                    setShowCalendarEditor(false)
                    handleViewCalendarMetadata(editingCalendar as Calendar)
                  }}
                  className="w-full px-3 py-2 rounded transition-colors text-sm"
                  style={{
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.textPrimary,
                    backgroundColor: COLORS.bgSecondary,
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.bgHover}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = COLORS.bgSecondary}
                >
                  View/Edit Metadata
                </button>
              </div>
            )}
            {/* Manage roles button - only show when editing existing calendar */}
            {editingCalendar.id && (
              <div>
                <button
                  onClick={() => handleOpenAclModal(editingCalendar as Calendar)}
                  className="w-full px-3 py-2 rounded transition-colors text-sm"
                  style={{
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.textPrimary,
                    backgroundColor: COLORS.bgSecondary,
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.bgHover}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = COLORS.bgSecondary}
                >
                  Manage roles
                </button>
              </div>
            )}
          </div>
          <div
            className="flex items-center justify-between p-4 flex-shrink-0"
            style={{ borderTop: `1px solid ${COLORS.border}` }}
          >
            <div className="flex gap-2">
              {editingCalendar.id && !editingCalendar.primary && (
                <button
                  onClick={() => setShowDeleteConfirm('calendar')}
                  className="px-4 py-2 rounded transition-colors"
                  style={{ color: COLORS.danger }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.dangerLight}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  Delete
                </button>
              )}
              {editingCalendar.id && editingCalendar.primary && (
                <button
                  onClick={() => setShowDeleteConfirm('clear')}
                  className="px-4 py-2 rounded transition-colors"
                  style={{ color: COLORS.danger }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.dangerLight}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  Clear Events
                </button>
              )}
            </div>
            <div className="flex-1" />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowCalendarEditor(false)
                  setEditingCalendar(null)
                }}
                className="px-4 py-2 rounded transition-colors"
                style={{ color: COLORS.textSecondary }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.bgHover}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCalendar}
                className="px-4 py-2 rounded transition-colors text-white"
                style={{ backgroundColor: COLORS.accent }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.accentHover}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = COLORS.accent}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ============================================================================
  // Manage Calendars Modal
  // ============================================================================

  const renderManageCalendars = () => {
    if (!showManageCalendars) return null

    return (
      <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <div className="rounded-lg shadow-xl w-96 max-h-[80vh] flex flex-col" style={{ backgroundColor: COLORS.bgPrimary }}>
          <div
            className="flex items-center justify-between p-4"
            style={{ borderBottom: `1px solid ${COLORS.border}` }}
          >
            <h2 className="text-lg font-medium" style={{ color: COLORS.textPrimary }}>
              Manage Calendars
            </h2>
            <button
              onClick={() => setShowManageCalendars(false)}
              className="transition-colors"
              style={{ color: COLORS.textTertiary }}
              onMouseEnter={(e) => e.currentTarget.style.color = COLORS.textSecondary}
              onMouseLeave={(e) => e.currentTarget.style.color = COLORS.textTertiary}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {calendars.map(calendar => (
              <div
                key={calendar.id}
                className="flex items-center gap-3 py-2 px-2 rounded mb-1"
                style={{ backgroundColor: COLORS.bgSecondary }}
              >
                <div
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: calendar.backgroundColor || COLORS.eventDefault }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate" style={{ color: COLORS.textPrimary }}>
                    {calendar.summaryOverride || calendar.summary}
                    <span style={{ marginLeft: '4px', fontSize: '10px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#80868b' }}>[{calendar.id}]</span>
                  </div>
                  {calendar.hidden && (
                    <span className="text-xs" style={{ color: COLORS.textTertiary }}>Hidden</span>
                  )}
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => {
                      setShowManageCalendars(false)
                      handleViewCalendarMetadata(calendar)
                    }}
                    className="px-2 py-1 rounded text-xs transition-colors"
                    style={{ color: COLORS.textTertiary, border: `1px solid ${COLORS.border}` }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.bgHover}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    title="View/edit metadata"
                  >
                    Info
                  </button>
                  <button
                    onClick={() => {
                      setShowManageCalendars(false)
                      handleEditCalendar(calendar)
                    }}
                    className="px-2 py-1 rounded text-xs transition-colors"
                    style={{ color: COLORS.textSecondary, border: `1px solid ${COLORS.border}` }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.bgHover}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    Edit
                  </button>
                  {!calendar.primary && (
                    <button
                      onClick={() => {
                        if (confirm('Remove this calendar from your list?')) {
                          setShowManageCalendars(false)
                          handleUnsubscribeCalendar(calendar.id)
                        }
                      }}
                      className="px-2 py-1 rounded text-xs transition-colors"
                      style={{ color: COLORS.danger, border: `1px solid ${COLORS.danger}` }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.dangerLight}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      title="Remove from list"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ============================================================================
  // ACL Modal
  // ============================================================================

  const renderAclModal = () => {
    if (!showAclModal || !aclCalendar) return null

    return (
      <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <div className="rounded-lg shadow-xl w-[500px] max-h-[80vh] flex flex-col" style={{ backgroundColor: COLORS.bgPrimary }}>
          <div
            className="flex items-center justify-between p-4 flex-shrink-0"
            style={{ borderBottom: `1px solid ${COLORS.border}` }}
          >
            <h2 className="text-lg font-medium" style={{ color: COLORS.textPrimary }}>
              Manage roles: {aclCalendar.summaryOverride || aclCalendar.summary}
              <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#80868b' }}>[{aclCalendar.id}]</span>
            </h2>
            <button
              onClick={handleCloseAclModal}
              className="transition-colors"
              style={{ color: COLORS.textTertiary }}
              onMouseEnter={(e) => e.currentTarget.style.color = COLORS.textSecondary}
              onMouseLeave={(e) => e.currentTarget.style.color = COLORS.textTertiary}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">
            {/* Error message */}
            {aclError && (
              <div
                className="p-3 rounded text-sm"
                style={{ backgroundColor: COLORS.dangerLight, color: COLORS.danger }}
              >
                {aclError}
              </div>
            )}

            {/* Section 1: Current Access */}
            <div>
              <h3 className="text-sm font-medium mb-3" style={{ color: COLORS.textSecondary }}>
                Current Access
              </h3>
              {aclRules.length === 0 ? (
                <div className="text-sm text-center py-4" style={{ color: COLORS.textTertiary }}>
                  No one has access yet. Add people below.
                </div>
              ) : (
                <div className="space-y-2">
                  {aclRules.map(rule => (
                    <div
                      key={rule.ruleId}
                      className="flex items-center gap-3 p-2 rounded"
                      style={{ backgroundColor: COLORS.bgSecondary }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate" style={{ color: COLORS.textPrimary }}>
                          {rule.scope.type === 'user' && '👤 '}
                          {rule.scope.type === 'group' && '👥 '}
                          {rule.scope.type === 'domain' && '🌐 '}
                          {rule.scope.type === 'default' && '🌍 '}
                          {rule.scope.value || 'Public'}
                          <span style={{ marginLeft: '4px', fontSize: '10px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#80868b' }}>[{rule.ruleId}]</span>
                        </div>
                      </div>
                      <select
                        value={rule.role}
                        onChange={(e) => handleUpdateAclRule(rule.ruleId, rule, e.target.value)}
                        className="px-2 py-1 rounded text-sm"
                        style={{
                          border: `1px solid ${COLORS.border}`,
                          color: COLORS.textPrimary,
                          backgroundColor: COLORS.bgPrimary,
                        }}
                      >
                        <option value="reader">Reader</option>
                        <option value="writer">Writer</option>
                        {rule.role !== 'reader' && rule.role !== 'writer' && (
                          <option value={rule.role}>{rule.role.charAt(0).toUpperCase() + rule.role.slice(1)}</option>
                        )}
                      </select>
                      <button
                        onClick={() => {
                          if (aclCalendar) handleViewAclRule(aclCalendar.id, rule.ruleId)
                        }}
                        className="transition-colors p-1"
                        style={{ color: COLORS.textTertiary }}
                        onMouseEnter={(e) => e.currentTarget.style.color = COLORS.accent}
                        onMouseLeave={(e) => e.currentTarget.style.color = COLORS.textTertiary}
                        title="View rule details"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="11" cy="11" r="8"/>
                          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteAclRule(rule.ruleId)}
                        className="transition-colors p-1"
                        style={{ color: COLORS.textTertiary }}
                        onMouseEnter={(e) => e.currentTarget.style.color = COLORS.danger}
                        onMouseLeave={(e) => e.currentTarget.style.color = COLORS.textTertiary}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18"/>
                          <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Section 2: Add Access */}
            <div
              className="pt-4"
              style={{ borderTop: `1px solid ${COLORS.border}` }}
            >
              <h3 className="text-sm font-medium mb-3" style={{ color: COLORS.textSecondary }}>
                Add Access
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs mb-1" style={{ color: COLORS.textTertiary }}>
                    Email address
                  </label>
                  <input
                    type="email"
                    value={newRuleEmail}
                    onChange={(e) => setNewRuleEmail(e.target.value)}
                    placeholder="Enter email address"
                    className="w-full px-3 py-2 rounded text-sm"
                    style={{
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.textPrimary,
                      backgroundColor: COLORS.bgPrimary,
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleAddAclRule()
                      }
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: COLORS.textTertiary }}>
                    Role
                  </label>
                  <select
                    value={newRuleRole}
                    onChange={(e) => setNewRuleRole(e.target.value as 'reader' | 'writer')}
                    className="w-full px-3 py-2 rounded text-sm"
                    style={{
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.textPrimary,
                      backgroundColor: COLORS.bgPrimary,
                    }}
                  >
                    <option value="reader">Reader</option>
                    <option value="writer">Writer</option>
                  </select>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={handleAddAclRule}
                    disabled={!newRuleEmail.trim()}
                    className="px-4 py-2 rounded text-sm transition-colors text-white"
                    style={{
                      backgroundColor: newRuleEmail.trim() ? COLORS.accent : COLORS.bgTertiary,
                      cursor: newRuleEmail.trim() ? 'pointer' : 'not-allowed',
                    }}
                    onMouseEnter={(e) => {
                      if (newRuleEmail.trim()) {
                        e.currentTarget.style.backgroundColor = COLORS.accentHover
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (newRuleEmail.trim()) {
                        e.currentTarget.style.backgroundColor = COLORS.accent
                      }
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div
            className="flex items-center justify-end p-4 flex-shrink-0"
            style={{ borderTop: `1px solid ${COLORS.border}` }}
          >
            <button
              onClick={handleCloseAclModal}
              className="px-4 py-2 rounded transition-colors text-white"
              style={{ backgroundColor: COLORS.accent }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.accentHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = COLORS.accent}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ============================================================================
  // Event Details View (Read-only)
  // ============================================================================

  const formatReminderTime = (minutes: number): string => {
    if (minutes === 0) return 'at event time'
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} before`
    if (minutes < 1440) {
      const hours = Math.floor(minutes / 60)
      return `${hours} hour${hours !== 1 ? 's' : ''} before`
    }
    const days = Math.floor(minutes / 1440)
    return `${days} day${days !== 1 ? 's' : ''} before`
  }

  const renderEventDetails = () => {
    if (!showEventDetails || !viewingEvent) return null

    const calendar = calendars.find(c => c.id === viewingEvent.calendarId)
    const color = getEventColor(viewingEvent, calendar, colors?.event)
    const startDate = parseEventDateTime(viewingEvent.start)
    const endDate = parseEventDateTime(viewingEvent.end)
    const isAllDay = isAllDayEvent(viewingEvent)
    const isRecurring = !!(viewingEvent.recurringEventId || (viewingEvent.recurrence && viewingEvent.recurrence.length > 0))
    const isCancelled = viewingEvent.status === 'cancelled'

    // Format recurrence text
    const getRecurrenceText = () => {
      const recurrence = viewingEvent.recurrence?.[0] || ''
      if (recurrence.includes('DAILY')) return 'Repeats daily'
      if (recurrence.includes('WEEKLY')) return 'Repeats weekly'
      if (recurrence.includes('MONTHLY')) return 'Repeats monthly'
      if (recurrence.includes('YEARLY')) return 'Repeats yearly'
      if (viewingEvent.recurringEventId) return 'Part of a recurring series'
      return null
    }

    const recurrenceText = getRecurrenceText()

    return (
      <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <div
          className="rounded-lg shadow-xl w-[420px] max-h-[80vh] flex flex-col overflow-hidden"
          style={{ backgroundColor: COLORS.bgPrimary }}
        >
          {/* Header with color bar */}
          <div className="h-2" style={{ backgroundColor: color.background }} />

          {/* Close button */}
          <div className="flex justify-end p-2">
            <button
              onClick={() => {
                setShowEventDetails(false)
                setViewingEvent(null)
              }}
              className="p-1 rounded transition-colors"
              style={{ color: COLORS.textTertiary }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.bgHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto px-6 pb-4">
            {/* Title with Status Badge */}
            <div className="flex items-start gap-2 mb-4">
              <h2
                className="text-xl font-medium flex-1"
                style={{
                  color: isCancelled ? COLORS.textTertiary : COLORS.textPrimary,
                  textDecoration: isCancelled ? 'line-through' : 'none',
                }}
              >
                {viewingEvent.summary || 'Untitled Event'}
                <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#80868b' }}>[{viewingEvent.id}]</span>
              </h2>
              {viewingEvent.status && viewingEvent.status !== 'confirmed' && (
                <span
                  className="px-2 py-0.5 rounded text-xs font-medium"
                  style={{
                    backgroundColor: viewingEvent.status === 'cancelled' ? COLORS.dangerLight : COLORS.warningLight,
                    color: viewingEvent.status === 'cancelled' ? COLORS.danger : COLORS.warning,
                  }}
                >
                  {viewingEvent.status === 'cancelled' ? 'Cancelled' : 'Tentative'}
                </span>
              )}
            </div>

            {/* Date/Time */}
            <div className="flex items-start gap-3 mb-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: COLORS.textTertiary, marginTop: 2 }}>
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <div>
                <div style={{ color: COLORS.textPrimary }}>
                  {isAllDay ? (
                    formatDate(startDate) === formatDate(endDate) ? (
                      formatDate(startDate)
                    ) : (
                      `${formatDate(startDate)} - ${formatDate(endDate)}`
                    )
                  ) : (
                    <>
                      {formatDate(startDate)}
                      <br />
                      <span style={{ color: COLORS.textSecondary }}>
                        {formatTime(startDate)} - {formatTime(endDate)}
                      </span>
                    </>
                  )}
                </div>
                {isAllDay && (
                  <div className="text-sm" style={{ color: COLORS.textSecondary }}>All day</div>
                )}
              </div>
            </div>

            {/* Recurrence */}
            {recurrenceText && (
              <div className="flex items-center gap-3 mb-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: COLORS.textTertiary }}>
                  <polyline points="23 4 23 10 17 10"/>
                  <polyline points="1 20 1 14 7 14"/>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
                <span style={{ color: COLORS.textSecondary }}>{recurrenceText}</span>
              </div>
            )}

            {/* Location */}
            {viewingEvent.location && (
              <div className="flex items-start gap-3 mb-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: COLORS.textTertiary, marginTop: 2 }}>
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
                <span style={{ color: COLORS.textPrimary }}>{viewingEvent.location}</span>
              </div>
            )}

            {/* Description */}
            {viewingEvent.description && (
              <div className="flex items-start gap-3 mb-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: COLORS.textTertiary, marginTop: 2 }}>
                  <line x1="17" y1="10" x2="3" y2="10"/>
                  <line x1="21" y1="6" x2="3" y2="6"/>
                  <line x1="21" y1="14" x2="3" y2="14"/>
                  <line x1="17" y1="18" x2="3" y2="18"/>
                </svg>
                <p style={{ color: COLORS.textSecondary }} className="whitespace-pre-wrap">
                  {viewingEvent.description}
                </p>
              </div>
            )}

            {/* Calendar */}
            {calendar && (
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-5 h-5 rounded"
                  style={{ backgroundColor: calendar.backgroundColor || COLORS.eventDefault }}
                />
                <span style={{ color: COLORS.textSecondary }}>{calendar.summaryOverride || calendar.summary}<span style={{ marginLeft: '4px', fontSize: '10px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#80868b' }}>[{calendar.id}]</span></span>
              </div>
            )}

            {/* Attendees */}
            {viewingEvent.attendees && viewingEvent.attendees.length > 0 && (
              <div className="flex items-start gap-3 mb-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: COLORS.textTertiary, marginTop: 2 }}>
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                <div className="flex-1">
                  <div className="text-sm mb-1" style={{ color: COLORS.textTertiary }}>
                    {viewingEvent.attendees.length} attendee{viewingEvent.attendees.length !== 1 ? 's' : ''}
                  </div>
                  <div className="space-y-1">
                    {viewingEvent.attendees.map((attendee, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-xs text-white"
                          style={{ backgroundColor: COLORS.accent }}
                        >
                          {(attendee.displayName || attendee.email || '?')[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate" style={{ color: COLORS.textPrimary }}>
                            {attendee.displayName || attendee.email}
                            <span style={{ marginLeft: '4px', fontSize: '10px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#80868b' }}>[{attendee.email}]</span>
                          </div>
                          {attendee.displayName && (
                            <div className="text-xs truncate" style={{ color: COLORS.textTertiary }}>
                              {attendee.email}
                            </div>
                          )}
                        </div>
                        {attendee.responseStatus && (
                          <span
                            className="text-xs px-2 py-0.5 rounded-full"
                            style={{
                              backgroundColor: attendee.responseStatus === 'accepted' ? COLORS.successLight :
                                attendee.responseStatus === 'declined' ? COLORS.dangerLight :
                                attendee.responseStatus === 'tentative' ? COLORS.warningLight :
                                COLORS.bgSecondary,
                              color: attendee.responseStatus === 'accepted' ? COLORS.success :
                                attendee.responseStatus === 'declined' ? COLORS.danger :
                                attendee.responseStatus === 'tentative' ? COLORS.warning :
                                COLORS.textSecondary,
                            }}
                          >
                            {attendee.responseStatus === 'needsAction' ? 'pending' : attendee.responseStatus}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Reminders */}
            {viewingEvent.reminders && (viewingEvent.reminders.useDefault || (viewingEvent.reminders.overrides && viewingEvent.reminders.overrides.length > 0)) && (
              <div className="flex items-start gap-3 mb-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: COLORS.textTertiary, marginTop: 2 }}>
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                <div className="flex-1">
                  {viewingEvent.reminders.useDefault && (
                    <div className="text-sm mb-1" style={{ color: COLORS.textSecondary }}>
                      Default reminders enabled
                    </div>
                  )}
                  {viewingEvent.reminders.overrides && viewingEvent.reminders.overrides.length > 0 && (
                    <div className="space-y-1">
                      {viewingEvent.reminders.overrides.map((reminder, index) => (
                        <div key={index} className="text-sm" style={{ color: COLORS.textSecondary }}>
                          {reminder.method === 'email' ? 'Email' : reminder.method === 'sms' ? 'SMS' : 'Popup notification'} {formatReminderTime(reminder.minutes)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Attachments */}
            {viewingEvent.attachments && viewingEvent.attachments.length > 0 && (
              <div className="flex items-start gap-3 mb-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: COLORS.textTertiary, marginTop: 2 }}>
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                </svg>
                <div className="flex-1">
                  <div className="text-sm mb-1" style={{ color: COLORS.textTertiary }}>
                    {viewingEvent.attachments.length} attachment{viewingEvent.attachments.length !== 1 ? 's' : ''}
                  </div>
                  <div className="space-y-1">
                    {viewingEvent.attachments.map((attachment, index) => (
                      <a
                        key={index}
                        href={attachment.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm hover:underline"
                        style={{ color: COLORS.accent }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                          <polyline points="15 3 21 3 21 9"/>
                          <line x1="10" y1="14" x2="21" y2="3"/>
                        </svg>
                        {attachment.title || attachment.fileUrl}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* View Instances Button for Recurring Events */}
            {isRecurring && (
              <button
                onClick={() => {
                  if (viewingEvent.calendarId) {
                    // Use recurringEventId for instances, or the event's own id for master events
                    const masterEventId = viewingEvent.recurringEventId || viewingEvent.id
                    loadEventInstances(viewingEvent.calendarId, masterEventId)
                  }
                }}
                disabled={loadingInstances}
                className="w-full py-2 px-3 rounded text-sm flex items-center justify-center gap-2 transition-colors"
                style={{
                  border: `1px solid ${COLORS.border}`,
                  color: COLORS.textSecondary,
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.bgHover}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="8" y1="6" x2="21" y2="6"/>
                  <line x1="8" y1="12" x2="21" y2="12"/>
                  <line x1="8" y1="18" x2="21" y2="18"/>
                  <line x1="3" y1="6" x2="3.01" y2="6"/>
                  <line x1="3" y1="12" x2="3.01" y2="12"/>
                  <line x1="3" y1="18" x2="3.01" y2="18"/>
                </svg>
                {loadingInstances ? 'Loading...' : 'View All Instances'}
              </button>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex justify-between p-4" style={{ borderTop: `1px solid ${COLORS.border}` }}>
            <button
              onClick={() => {
                setShowEventDetails(false)
                setSelectedEvent(viewingEvent)
                setShowDeleteConfirm('event')
              }}
              className="px-4 py-2 rounded transition-colors"
              style={{ color: COLORS.danger }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.bgHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              Delete
            </button>
            <div className="flex gap-2">
              {calendars.filter(c => c.id !== viewingEvent.calendarId).length > 0 && (
                <button
                  onClick={() => {
                    // Default to primary calendar, but skip if it's the current calendar
                    const availableCals = calendars.filter(c => c.id !== viewingEvent.calendarId)
                    const defaultCal = availableCals.find(c => c.primary)?.id || availableCals[0]?.id || ''
                    setImportDestinationCalendar(defaultCal)
                    setShowImportDialog(true)
                  }}
                  className="px-4 py-2 rounded transition-colors"
                  style={{ color: COLORS.textPrimary, border: `1px solid ${COLORS.border}` }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.bgHover}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  Copy
                </button>
              )}
              <button
                onClick={() => handleEditEvent()}
                className="px-4 py-2 rounded transition-colors text-white"
                style={{ backgroundColor: COLORS.accent }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.accentHover}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = COLORS.accent}
              >
                Edit
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ============================================================================
  // Delete Confirmation Modal
  // ============================================================================

  const renderDeleteConfirm = () => {
    if (!showDeleteConfirm) return null

    const isEvent = showDeleteConfirm === 'event'
    const isClear = showDeleteConfirm === 'clear'
    const title = isEvent ? 'Delete Event' : isClear ? 'Clear All Events' : 'Delete Calendar'
    const message = isEvent
      ? 'Are you sure you want to delete this event? This action cannot be undone.'
      : isClear
        ? 'Are you sure you want to delete all events from this calendar? This action cannot be undone.'
        : 'Are you sure you want to delete this calendar? All events in this calendar will also be deleted.'

    return (
      <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <div className="rounded-lg shadow-xl w-96" style={{ backgroundColor: COLORS.bgPrimary }}>
          <div className="p-4">
            <h2 className="text-lg font-medium mb-2" style={{ color: COLORS.textPrimary }}>{title}</h2>
            <p className="text-sm" style={{ color: COLORS.textSecondary }}>{message}</p>
          </div>
          <div className="flex justify-end gap-2 p-4" style={{ borderTop: `1px solid ${COLORS.border}` }}>
            <button
              onClick={() => setShowDeleteConfirm(null)}
              className="px-4 py-2 rounded transition-colors"
              style={{ color: COLORS.textSecondary }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.bgHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              Cancel
            </button>
            <button
              onClick={isEvent ? () => handleDeleteEvent() : isClear ? handleClearCalendar : handleDeleteCalendar}
              className="px-4 py-2 rounded transition-colors text-white"
              style={{ backgroundColor: COLORS.danger }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.dangerHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = COLORS.danger}
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    )
  }

  const renderRecurringEditChoice = () => {
    if (!showRecurringEditChoice) return null

    return (
      <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <div className="rounded-lg shadow-xl w-96" style={{ backgroundColor: COLORS.bgPrimary }}>
          <div className="p-4">
            <h2 className="text-lg font-medium mb-2" style={{ color: COLORS.textPrimary }}>Edit recurring event</h2>
            <p className="text-sm" style={{ color: COLORS.textSecondary }}>
              This event is part of a series. Do you want to edit only this event or all events in the series?
            </p>
          </div>
          <div className="flex flex-col gap-2 p-4" style={{ borderTop: `1px solid ${COLORS.border}` }}>
            <button
              onClick={() => {
                setShowRecurringEditChoice(false)
                handleSaveEvent('this')
              }}
              className="w-full px-4 py-2 rounded transition-colors text-left"
              style={{ border: `1px solid ${COLORS.border}`, color: COLORS.textPrimary }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.bgHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <div className="font-medium">This event only</div>
              <div className="text-xs" style={{ color: COLORS.textTertiary }}>
                Changes will only apply to this occurrence
              </div>
            </button>
            <button
              onClick={() => {
                setShowRecurringEditChoice(false)
                handleSaveEvent('all')
              }}
              className="w-full px-4 py-2 rounded transition-colors text-left"
              style={{ border: `1px solid ${COLORS.border}`, color: COLORS.textPrimary }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.bgHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <div className="font-medium">All events in series</div>
              <div className="text-xs" style={{ color: COLORS.textTertiary }}>
                Changes will apply to all occurrences
              </div>
            </button>
            <button
              onClick={() => setShowRecurringEditChoice(false)}
              className="w-full px-4 py-2 rounded transition-colors"
              style={{ color: COLORS.textSecondary }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.bgHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  const renderRecurringDeleteChoice = () => {
    if (!showRecurringDeleteChoice) return null

    return (
      <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <div className="rounded-lg shadow-xl w-96" style={{ backgroundColor: COLORS.bgPrimary }}>
          <div className="p-4">
            <h2 className="text-lg font-medium mb-2" style={{ color: COLORS.textPrimary }}>Delete recurring event</h2>
            <p className="text-sm" style={{ color: COLORS.textSecondary }}>
              This event is part of a series. Do you want to delete only this event or all events in the series?
            </p>
          </div>
          <div className="flex flex-col gap-2 p-4" style={{ borderTop: `1px solid ${COLORS.border}` }}>
            <button
              onClick={() => {
                setShowRecurringDeleteChoice(false)
                handleDeleteEvent('this')
              }}
              className="w-full px-4 py-2 rounded transition-colors text-left"
              style={{ border: `1px solid ${COLORS.border}`, color: COLORS.textPrimary }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.bgHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <div className="font-medium">This event only</div>
              <div className="text-xs" style={{ color: COLORS.textTertiary }}>
                Only this occurrence will be deleted
              </div>
            </button>
            <button
              onClick={() => {
                setShowRecurringDeleteChoice(false)
                handleDeleteEvent('all')
              }}
              className="w-full px-4 py-2 rounded transition-colors text-left"
              style={{ border: `1px solid ${COLORS.border}`, color: COLORS.textPrimary }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.bgHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <div className="font-medium">All events in series</div>
              <div className="text-xs" style={{ color: COLORS.textTertiary }}>
                All occurrences will be deleted
              </div>
            </button>
            <button
              onClick={() => setShowRecurringDeleteChoice(false)}
              className="w-full px-4 py-2 rounded transition-colors"
              style={{ color: COLORS.textSecondary }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.bgHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ============================================================================
  // Event Instances Modal (Read-only list of recurring event instances)
  // ============================================================================

  const renderEventInstances = () => {
    if (!showEventInstances) return null

    return (
      <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <div
          className="rounded-lg shadow-xl w-[500px] max-h-[80vh] flex flex-col overflow-hidden"
          style={{ backgroundColor: COLORS.bgPrimary }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between p-4"
            style={{ borderBottom: `1px solid ${COLORS.border}` }}
          >
            <h2 className="text-lg font-medium" style={{ color: COLORS.textPrimary }}>
              Event Instances
            </h2>
            <button
              onClick={() => {
                setShowEventInstances(false)
                setEventInstances([])
              }}
              className="p-1 rounded transition-colors"
              style={{ color: COLORS.textTertiary }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.bgHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Instances List */}
          <div className="flex-1 overflow-auto p-4">
            {eventInstances.length === 0 ? (
              <p className="text-center py-8" style={{ color: COLORS.textTertiary }}>
                No instances found
              </p>
            ) : (
              <div className="space-y-2">
                {eventInstances.map((instance) => {
                  const startDate = parseEventDateTime(instance.start)
                  const endDate = parseEventDateTime(instance.end)
                  const isAllDay = isAllDayEvent(instance)
                  const calendar = calendars.find(c => c.id === instance.calendarId)
                  const color = getEventColor(instance, calendar, colors?.event)
                  const isCancelled = instance.status === 'cancelled'

                  return (
                    <div
                      key={instance.id}
                      className="flex items-center gap-3 p-3 rounded cursor-pointer transition-colors"
                      style={{
                        backgroundColor: COLORS.bgSecondary,
                        opacity: isCancelled ? 0.6 : 1,
                      }}
                      onClick={() => {
                        setShowEventInstances(false)
                        setEventInstances([])
                        handleViewEvent(instance)
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.bgHover}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = COLORS.bgSecondary}
                    >
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: isCancelled ? COLORS.textTertiary : color.background }}
                      />
                      <div className="flex-1 min-w-0">
                        <div
                          className="font-medium truncate"
                          style={{
                            color: isCancelled ? COLORS.textTertiary : COLORS.textPrimary,
                            textDecoration: isCancelled ? 'line-through' : 'none',
                          }}
                        >
                          {instance.summary || 'Untitled Event'}
                          <span style={{ marginLeft: '4px', fontSize: '10px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#80868b' }}>[{instance.id}]</span>
                        </div>
                        <div className="text-sm" style={{ color: COLORS.textSecondary }}>
                          {isAllDay ? (
                            formatDate(startDate)
                          ) : (
                            `${formatDate(startDate)} · ${formatTime(startDate)} - ${formatTime(endDate)}`
                          )}
                        </div>
                      </div>
                      {isCancelled && (
                        <span
                          className="px-2 py-0.5 rounded text-xs"
                          style={{ backgroundColor: COLORS.dangerLight, color: COLORS.danger }}
                        >
                          Cancelled
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            className="flex justify-end p-4"
            style={{ borderTop: `1px solid ${COLORS.border}` }}
          >
            <button
              onClick={() => {
                setShowEventInstances(false)
                setEventInstances([])
              }}
              className="px-4 py-2 rounded transition-colors text-white"
              style={{ backgroundColor: COLORS.accent }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.accentHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = COLORS.accent}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ============================================================================
  // Import Event Dialog
  // ============================================================================

  const renderImportDialog = () => {
    if (!showImportDialog || !viewingEvent) return null

    // Filter out the current calendar
    const availableCalendars = calendars.filter(cal => cal.id !== viewingEvent.calendarId)

    return (
      <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <div className="rounded-lg shadow-xl w-96" style={{ backgroundColor: COLORS.bgPrimary }}>
          <div className="p-4">
            <h2 className="text-lg font-medium mb-2" style={{ color: COLORS.textPrimary }}>Copy to Calendar</h2>
            <p className="text-sm mb-4" style={{ color: COLORS.textSecondary }}>
              Copy this event to another calendar
            </p>
            <select
              value={importDestinationCalendar}
              onChange={(e) => setImportDestinationCalendar(e.target.value)}
              className="w-full px-3 py-2 rounded text-sm"
              style={{ border: `1px solid ${COLORS.border}`, color: COLORS.textPrimary, backgroundColor: COLORS.bgPrimary }}
            >
              {availableCalendars.map(cal => (
                <option key={cal.id} value={cal.id}>
                  {cal.summaryOverride || cal.summary}{cal.primary ? ' (Primary)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 p-4" style={{ borderTop: `1px solid ${COLORS.border}` }}>
            <button
              onClick={() => setShowImportDialog(false)}
              className="px-4 py-2 rounded transition-colors"
              style={{ color: COLORS.textSecondary }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.bgHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              Cancel
            </button>
            <button
              onClick={() => handleImportEvent(importDestinationCalendar)}
              className="px-4 py-2 rounded transition-colors text-white"
              style={{ backgroundColor: COLORS.accent }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.accentHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = COLORS.accent}
            >
              Copy
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ============================================================================
  // Calendar Metadata Modal
  // ============================================================================

  const renderCalendarMetadataModal = () => {
    if (!showCalendarMetadata || !calendarMetadata || !editingMetadata) return null

    return (
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <div className="rounded-lg shadow-xl w-96 max-h-full flex flex-col overflow-hidden" style={{ backgroundColor: COLORS.bgPrimary }}>
          <div
            className="flex items-center justify-between p-4 flex-shrink-0"
            style={{ borderBottom: `1px solid ${COLORS.border}` }}
          >
            <h2 className="text-lg font-medium" style={{ color: COLORS.textPrimary }}>
              Calendar Metadata
              {calendarMetadata && <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#80868b' }}>[{calendarMetadata.id as string}]</span>}
            </h2>
            <button
              onClick={() => {
                setShowCalendarMetadata(false)
                setCalendarMetadata(null)
                setEditingMetadata(null)
              }}
              className="transition-colors"
              style={{ color: COLORS.textTertiary }}
              onMouseEnter={(e) => e.currentTarget.style.color = COLORS.textSecondary}
              onMouseLeave={(e) => e.currentTarget.style.color = COLORS.textTertiary}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div className="p-4 space-y-4 overflow-y-auto flex-1 min-h-0">
            <div>
              <label className="block text-xs mb-1" style={{ color: COLORS.textTertiary }}>Calendar ID</label>
              <div className="text-sm px-3 py-2 rounded" style={{ backgroundColor: COLORS.bgSecondary, color: COLORS.textSecondary }}>
                {calendarMetadata.id as string}
              </div>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: COLORS.textTertiary }}>Summary</label>
              <input
                type="text"
                value={editingMetadata.summary}
                onChange={(e) => setEditingMetadata({ ...editingMetadata, summary: e.target.value })}
                className="w-full px-3 py-2 rounded text-sm"
                style={{ border: `1px solid ${COLORS.border}`, color: COLORS.textPrimary }}
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: COLORS.textTertiary }}>Description</label>
              <textarea
                value={editingMetadata.description}
                onChange={(e) => setEditingMetadata({ ...editingMetadata, description: e.target.value })}
                className="w-full px-3 py-2 rounded text-sm min-h-[60px] resize-none"
                style={{ border: `1px solid ${COLORS.border}`, color: COLORS.textPrimary }}
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: COLORS.textTertiary }}>Time Zone</label>
              <input
                type="text"
                value={editingMetadata.timeZone}
                onChange={(e) => setEditingMetadata({ ...editingMetadata, timeZone: e.target.value })}
                className="w-full px-3 py-2 rounded text-sm"
                style={{ border: `1px solid ${COLORS.border}`, color: COLORS.textPrimary }}
                placeholder="e.g., America/New_York"
              />
            </div>
          </div>
          <div
            className="flex items-center justify-end gap-2 p-4 flex-shrink-0"
            style={{ borderTop: `1px solid ${COLORS.border}` }}
          >
            <button
              onClick={() => {
                setShowCalendarMetadata(false)
                setCalendarMetadata(null)
                setEditingMetadata(null)
              }}
              className="px-4 py-2 rounded transition-colors"
              style={{ color: COLORS.textSecondary }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.bgHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              Cancel
            </button>
            <button
              onClick={handlePatchCalendarMetadata}
              className="px-4 py-2 rounded transition-colors text-white"
              style={{ backgroundColor: COLORS.accent }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.accentHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = COLORS.accent}
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ============================================================================
  // Subscribe Calendar Modal
  // ============================================================================

  const renderSubscribeCalendarModal = () => {
    if (!showSubscribeCalendar) return null

    return (
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <div className="rounded-lg shadow-xl w-96" style={{ backgroundColor: COLORS.bgPrimary }}>
          <div
            className="flex items-center justify-between p-4"
            style={{ borderBottom: `1px solid ${COLORS.border}` }}
          >
            <h2 className="text-lg font-medium" style={{ color: COLORS.textPrimary }}>
              Subscribe to Calendar
            </h2>
            <button
              onClick={() => {
                setShowSubscribeCalendar(false)
                setSubscribeCalendarId('')
              }}
              className="transition-colors"
              style={{ color: COLORS.textTertiary }}
              onMouseEnter={(e) => e.currentTarget.style.color = COLORS.textSecondary}
              onMouseLeave={(e) => e.currentTarget.style.color = COLORS.textTertiary}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div className="p-4 space-y-3">
            <p className="text-sm" style={{ color: COLORS.textSecondary }}>
              Enter the calendar ID to add it to your calendar list.
            </p>
            <input
              type="text"
              value={subscribeCalendarId}
              onChange={(e) => setSubscribeCalendarId(e.target.value)}
              placeholder="Calendar ID (e.g., user@example.com)"
              className="w-full px-3 py-2 rounded text-sm"
              style={{ border: `1px solid ${COLORS.border}`, color: COLORS.textPrimary }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubscribeCalendar()
              }}
            />
          </div>
          <div className="flex justify-end gap-2 p-4" style={{ borderTop: `1px solid ${COLORS.border}` }}>
            <button
              onClick={() => {
                setShowSubscribeCalendar(false)
                setSubscribeCalendarId('')
              }}
              className="px-4 py-2 rounded transition-colors"
              style={{ color: COLORS.textSecondary }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.bgHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              Cancel
            </button>
            <button
              onClick={handleSubscribeCalendar}
              disabled={!subscribeCalendarId.trim()}
              className="px-4 py-2 rounded transition-colors text-white"
              style={{
                backgroundColor: subscribeCalendarId.trim() ? COLORS.accent : COLORS.bgTertiary,
                cursor: subscribeCalendarId.trim() ? 'pointer' : 'not-allowed',
              }}
              onMouseEnter={(e) => {
                if (subscribeCalendarId.trim()) e.currentTarget.style.backgroundColor = COLORS.accentHover
              }}
              onMouseLeave={(e) => {
                if (subscribeCalendarId.trim()) e.currentTarget.style.backgroundColor = COLORS.accent
              }}
            >
              Subscribe
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ============================================================================
  // Watch / Channels Panel Modal
  // ============================================================================

  const renderWatchPanel = () => {
    if (!showWatchPanel) return null

    return (
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <div className="rounded-lg shadow-xl w-[500px] max-h-[80vh] flex flex-col overflow-hidden" style={{ backgroundColor: COLORS.bgPrimary }}>
          <div
            className="flex items-center justify-between p-4 flex-shrink-0"
            style={{ borderBottom: `1px solid ${COLORS.border}` }}
          >
            <h2 className="text-lg font-medium" style={{ color: COLORS.textPrimary }}>
              Watch & Notifications
            </h2>
            <button
              onClick={() => setShowWatchPanel(false)}
              className="transition-colors"
              style={{ color: COLORS.textTertiary }}
              onMouseEnter={(e) => e.currentTarget.style.color = COLORS.textSecondary}
              onMouseLeave={(e) => e.currentTarget.style.color = COLORS.textTertiary}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">
            {/* Start watching section */}
            <div>
              <h3 className="text-sm font-medium mb-3" style={{ color: COLORS.textSecondary }}>
                Start Watching
              </h3>
              <div className="space-y-2">
                {/* Watch events for each calendar */}
                {calendars.map(cal => (
                  <button
                    key={`watch-events-${cal.id}`}
                    onClick={() => handleWatchEventChanges(cal.id)}
                    className="w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center gap-2"
                    style={{ border: `1px solid ${COLORS.border}`, color: COLORS.textPrimary }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.bgHover}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                      <line x1="16" y1="2" x2="16" y2="6"/>
                      <line x1="8" y1="2" x2="8" y2="6"/>
                    </svg>
                    Watch events: {cal.summaryOverride || cal.summary}
                  </button>
                ))}
                {/* Watch ACL changes for each calendar */}
                {calendars.map(cal => (
                  <button
                    key={`watch-acl-${cal.id}`}
                    onClick={() => handleWatchAclChanges(cal.id)}
                    className="w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center gap-2"
                    style={{ border: `1px solid ${COLORS.border}`, color: COLORS.textPrimary }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.bgHover}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                    Watch ACL: {cal.summaryOverride || cal.summary}
                  </button>
                ))}
                {/* Watch calendar list changes */}
                <button
                  onClick={handleWatchCalendarListChanges}
                  className="w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center gap-2"
                  style={{ border: `1px solid ${COLORS.border}`, color: COLORS.textPrimary }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.bgHover}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="8" y1="6" x2="21" y2="6"/>
                    <line x1="8" y1="12" x2="21" y2="12"/>
                    <line x1="8" y1="18" x2="21" y2="18"/>
                    <line x1="3" y1="6" x2="3.01" y2="6"/>
                    <line x1="3" y1="12" x2="3.01" y2="12"/>
                    <line x1="3" y1="18" x2="3.01" y2="18"/>
                  </svg>
                  Watch calendar list changes
                </button>
              </div>
            </div>

            {/* Active channels section */}
            <div className="pt-4" style={{ borderTop: `1px solid ${COLORS.border}` }}>
              <h3 className="text-sm font-medium mb-3" style={{ color: COLORS.textSecondary }}>
                Active Channels ({activeChannels.length})
              </h3>
              {activeChannels.length === 0 ? (
                <div className="text-sm text-center py-4" style={{ color: COLORS.textTertiary }}>
                  No active watch channels
                </div>
              ) : (
                <div className="space-y-2">
                  {activeChannels.map(channel => (
                    <div
                      key={channel.id}
                      className="flex items-center gap-3 p-2 rounded"
                      style={{ backgroundColor: COLORS.bgSecondary }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate" style={{ color: COLORS.textPrimary }}>
                          {channel.type} channel
                        </div>
                        <div className="text-xs truncate" style={{ color: COLORS.textTertiary }}>
                          ID: {channel.id}
                        </div>
                      </div>
                      <button
                        onClick={() => handleStopChannel(channel.id, channel.resourceId)}
                        className="px-3 py-1 rounded text-xs transition-colors"
                        style={{ color: COLORS.danger, border: `1px solid ${COLORS.danger}` }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.dangerLight}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        Stop
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div
            className="flex justify-end p-4 flex-shrink-0"
            style={{ borderTop: `1px solid ${COLORS.border}` }}
          >
            <button
              onClick={() => setShowWatchPanel(false)}
              className="px-4 py-2 rounded transition-colors text-white"
              style={{ backgroundColor: COLORS.accent }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.accentHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = COLORS.accent}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ============================================================================
  // ACL Rule Detail Modal
  // ============================================================================

  const renderAclRuleDetail = () => {
    if (!viewingAclRule || !aclCalendar) return null

    return (
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <div className="rounded-lg shadow-xl w-96" style={{ backgroundColor: COLORS.bgPrimary }}>
          <div
            className="flex items-center justify-between p-4"
            style={{ borderBottom: `1px solid ${COLORS.border}` }}
          >
            <h2 className="text-lg font-medium" style={{ color: COLORS.textPrimary }}>
              ACL Rule Detail
              {viewingAclRule && <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#80868b' }}>[{viewingAclRule.ruleId}]</span>}
            </h2>
            <button
              onClick={() => {
                setViewingAclRule(null)
                setEditingAclRuleRole('')
              }}
              className="transition-colors"
              style={{ color: COLORS.textTertiary }}
              onMouseEnter={(e) => e.currentTarget.style.color = COLORS.textSecondary}
              onMouseLeave={(e) => e.currentTarget.style.color = COLORS.textTertiary}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: COLORS.textTertiary }}>Rule ID</label>
              <div className="text-sm px-3 py-2 rounded" style={{ backgroundColor: COLORS.bgSecondary, color: COLORS.textSecondary }}>
                {viewingAclRule.ruleId}
              </div>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: COLORS.textTertiary }}>Scope Type</label>
              <div className="text-sm px-3 py-2 rounded" style={{ backgroundColor: COLORS.bgSecondary, color: COLORS.textSecondary }}>
                {viewingAclRule.scope.type}
              </div>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: COLORS.textTertiary }}>Scope Value</label>
              <div className="text-sm px-3 py-2 rounded" style={{ backgroundColor: COLORS.bgSecondary, color: COLORS.textSecondary }}>
                {viewingAclRule.scope.value || 'Public'}
              </div>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: COLORS.textTertiary }}>Role</label>
              <select
                value={editingAclRuleRole}
                onChange={(e) => setEditingAclRuleRole(e.target.value)}
                className="w-full px-3 py-2 rounded text-sm"
                style={{ border: `1px solid ${COLORS.border}`, color: COLORS.textPrimary, backgroundColor: COLORS.bgPrimary }}
              >
                <option value="reader">Reader</option>
                <option value="writer">Writer</option>
                <option value="owner">Owner</option>
                <option value="freeBusyReader">Free/Busy Reader</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 p-4" style={{ borderTop: `1px solid ${COLORS.border}` }}>
            <button
              onClick={() => {
                setViewingAclRule(null)
                setEditingAclRuleRole('')
              }}
              className="px-4 py-2 rounded transition-colors"
              style={{ color: COLORS.textSecondary }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.bgHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              Cancel
            </button>
            <button
              onClick={handlePatchAclRule}
              className="px-4 py-2 rounded transition-colors text-white"
              style={{ backgroundColor: COLORS.accent }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.accentHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = COLORS.accent}
            >
              Update Role
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ============================================================================
  // Main Render
  // ============================================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ backgroundColor: COLORS.bgPrimary }} aria-label={`Loading ${APP_NAME}`}>
        <div
          className="animate-spin rounded-full h-8 w-8"
          style={{ borderWidth: '2px', borderColor: COLORS.bgTertiary, borderTopColor: COLORS.accent }}
        />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full" style={{ backgroundColor: COLORS.bgPrimary }}>
        <p className="mb-4" style={{ color: COLORS.danger }}>{error}</p>
        <button
          onClick={() => loadInitialData()}
          className="px-4 py-2 rounded text-white transition-colors"
          style={{ backgroundColor: COLORS.accent }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.accentHover}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = COLORS.accent}
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: COLORS.bgPrimary }}>
      {/* Toast error banner */}
      {toastError && (
        <div
          className="flex items-center justify-between px-4 py-2 text-sm"
          style={{ backgroundColor: COLORS.dangerLight, color: COLORS.danger, borderBottom: `1px solid ${COLORS.danger}` }}
        >
          <span>{toastError}</span>
          <button
            onClick={() => setToastError(null)}
            className="ml-4 font-bold hover:opacity-70"
            style={{ color: COLORS.danger }}
          >
            &times;
          </button>
        </div>
      )}
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2"
        style={{ borderBottom: `1px solid ${COLORS.border}` }}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={handleToday}
            className="px-3 py-1.5 rounded text-sm font-medium transition-colors"
            style={{ border: `1px solid ${COLORS.border}`, color: COLORS.textSecondary }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.bgHover}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            Today
          </button>
          <div className="flex items-center">
            <button
              onClick={() => handleNavigate(-1)}
              className="p-1 rounded transition-colors"
              style={{ color: COLORS.textSecondary }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.bgHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <button
              onClick={() => handleNavigate(1)}
              className="p-1 rounded transition-colors"
              style={{ color: COLORS.textSecondary }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.bgHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          </div>
          <h1 className="text-xl font-medium" style={{ color: COLORS.textPrimary }}>{formatViewTitle(currentDate, currentView)}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded overflow-hidden" style={{ border: `1px solid ${COLORS.border}` }}>
            {(['day', 'week', 'month'] as CalendarView[]).map((view) => (
              <button
                key={view}
                onClick={() => setCurrentView(view)}
                className="px-3 py-1.5 text-sm font-medium capitalize transition-colors"
                style={{
                  backgroundColor: currentView === view ? COLORS.accentLight : 'transparent',
                  color: currentView === view ? COLORS.accentText : COLORS.textSecondary,
                }}
                onMouseEnter={(e) => {
                  if (currentView !== view) e.currentTarget.style.backgroundColor = COLORS.bgHover
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = currentView === view ? COLORS.accentLight : 'transparent'
                }}
              >
                {view}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {renderSidebar()}
        <div className="flex flex-1 overflow-hidden">
          {currentView === 'day' && renderDayView()}
          {currentView === 'week' && renderWeekView()}
          {currentView === 'month' && renderMonthView()}
        </div>
        {renderEventEditor()}
      </div>

      {/* Modals */}
      {renderEventDetails()}
      {renderCalendarEditor()}
      {renderManageCalendars()}
      {renderAclModal()}
      {renderDeleteConfirm()}
      {renderRecurringEditChoice()}
      {renderRecurringDeleteChoice()}
      {renderImportDialog()}
      {renderEventInstances()}
      {renderCalendarMetadataModal()}
      {renderSubscribeCalendarModal()}
      {renderWatchPanel()}
      {renderAclRuleDetail()}
    </div>
  )
}
