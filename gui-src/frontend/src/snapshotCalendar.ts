/** Convert a Calendar database timestamp to the shape returned by its read API. */
export function calendarSnapshotDateTime(value: any): any {
  if (!value || typeof value !== 'object' || value.date || typeof value.dateTime !== 'string') return value

  // Runtime DB snapshots store UTC clock fields without a Z, and keep the
  // original local offset separately (common_utils.datetime_utils.local_to_UTC).
  // Initialization literals can instead contain ordinary RFC3339/local values.
  // Convert only the internal UTC-naive + offset representation; never attach
  // its offset directly to the unchanged UTC clock or shift RFC3339 twice.
  const offset = typeof value.offset === 'string' && value.offset.match(/^([+-])(\d{2}):([0-5]\d)$/)
  if (!offset || Number(offset[2]) > 23 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value.dateTime)) return value
  const utc = Date.parse(`${value.dateTime}Z`)
  if (!Number.isFinite(utc)) return value
  const minutes = (Number(offset[2]) * 60 + Number(offset[3])) * (offset[1] === '-' ? -1 : 1)
  const local = new Date(utc + minutes * 60_000).toISOString()
  const { offset: _storedOffset, ...projected } = value
  return { ...projected, dateTime: local.replace(/(?:\.000)?Z$/, '') + value.offset }
}
