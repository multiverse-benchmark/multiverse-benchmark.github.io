interface CalendarDateTime {
  date?: string
  dateTime?: string
  timeZone?: string
}

interface DateParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function partsInTimeZone(instant: Date, timeZone: string): DateParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant)
  const get = (type: string) => Number(parts.find(part => part.type === type)!.value)
  return {
    year: get('year'), month: get('month'), day: get('day'),
    hour: get('hour'), minute: get('minute'), second: get('second'),
  }
}

function utcValue(parts: DateParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
}

function localParts(date: Date): DateParts {
  return {
    year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(),
    hour: date.getHours(), minute: date.getMinutes(), second: date.getSeconds(),
  }
}

function wallClockDate(parts: DateParts): Date {
  return new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
}

// Calendar layout uses local Date accessors as wall-clock fields, not as instants.
// Find the actual instant represented by those fields in the requested timezone.
function wallClockInstant(parts: DateParts, timeZone: string): Date {
  const wallTime = utcValue(parts)
  let candidate = wallTime
  let previous = Number.NaN
  for (let attempt = 0; attempt < 4; attempt++) {
    const offset = utcValue(partsInTimeZone(new Date(candidate), timeZone)) - candidate
    const next = wallTime - offset
    if (next === candidate) return new Date(candidate)
    // A nonexistent spring-forward time alternates between two candidates.
    // Advance through the gap, as Date does for a local nonexistent time.
    if (next === previous) return new Date(Math.max(candidate, next))
    previous = candidate
    candidate = next
  }
  return new Date(candidate)
}

export function parseCalendarDateTime(value: CalendarDateTime, displayTimeZone: string): Date {
  if (value.dateTime) {
    // RFC3339's offset already identifies the instant. The optional timeZone
    // metadata must not shift that instant a second time.
    if (/(?:[+-]\d{2}:\d{2}|Z)$/i.test(value.dateTime)) {
      const instant = new Date(value.dateTime)
      if (!Number.isNaN(instant.getTime())) {
        return wallClockDate(partsInTimeZone(instant, displayTimeZone))
      }
    }

    const match = value.dateTime.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/)
    if (match) {
      const [, year, month, day, hour, minute, second] = match
      const parts = {
        year: Number(year), month: Number(month), day: Number(day),
        hour: Number(hour), minute: Number(minute), second: Number(second),
      }
      if (value.timeZone && value.timeZone !== displayTimeZone) {
        return wallClockDate(partsInTimeZone(wallClockInstant(parts, value.timeZone), displayTimeZone))
      }
      return wallClockDate(parts)
    }
    return new Date(value.dateTime)
  }

  if (value.date) {
    const match = value.date.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    return new Date(value.date + 'T00:00:00')
  }
  return new Date()
}

export function formatCalendarDateTime(date: Date, displayTimeZone: string): string {
  const instant = wallClockInstant(localParts(date), displayTimeZone)
  const parts = partsInTimeZone(instant, displayTimeZone)
  const offsetMinutes = (utcValue(parts) - instant.getTime()) / 60_000
  const pad = (value: number) => String(value).padStart(2, '0')
  const sign = offsetMinutes < 0 ? '-' : '+'
  const offset = Math.abs(offsetMinutes)
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}` +
    `${sign}${pad(Math.floor(offset / 60))}:${pad(offset % 60)}`
}
