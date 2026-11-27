import { snapshotParams } from './snapshotBackend'

/** Record links select existing native views; they never construct or change data. */
export const snapshotRecordErrors = new Map<string, string>()

export function requestedSnapshotRecord(service: string): string | null {
  return snapshotParams.get('app') === service ? snapshotParams.get('record') : null
}

export function requestedSnapshotView(service: string): string | null {
  return snapshotParams.get('app') === service ? snapshotParams.get('view') : null
}

export function reportMissingSnapshotRecord(service: string, record: string) {
  snapshotRecordErrors.set(service, `Linked record ${record} is not present in this snapshot. The available records remain browsable.`)
  window.dispatchEvent(new CustomEvent('snapshot-record-unavailable', { detail: { service } }))
}

export function clearSnapshotRecord(service: string) {
  if (snapshotParams.get('app') !== service) return
  snapshotParams.delete('record')
  history.replaceState(null, '', `?${snapshotParams}`)
}
