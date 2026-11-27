import { gunzipSync, strFromU8 } from 'fflate'
import { readSnapshotTool } from './snapshotReadTools'

export interface Snapshot {
  available: boolean
  data: Record<string, any>
  services: string[]
  provenance: string
  reason?: string
  warnings?: unknown[]
  reconstruction?: { beforeValueMismatches?: unknown[]; createdPaths?: unknown[]; warnings?: unknown[] }
  unavailableServices?: Record<string, string>
}
export let snapshot: Snapshot
export let taskTitle = ''
export let taskTime = ''
export const unavailableSnapshotReads = new Map<string, Map<string, string>>()
export const snapshotParams = new URLSearchParams(location.search)
export const taskId = snapshotParams.get('task') || ''
export const demoId = snapshotParams.get('demo') || ''
export const isIllustrativeDemo = demoId === 'figure1-message-demo'
export const snapshotPhase = snapshotParams.get('phase') === 'final' ? 'final' : 'initial'
// The task files of the paper's release (v1.0.0) are in ../data; a later release named in the
// link (?release=v1.1.0) keeps its files in a folder of its own, ../data/<release>.
const PAPER_RELEASE = 'v1.0.0'
const release = snapshotParams.get('release') || ''
const taskDataRoot = /^v\d+\.\d+\.\d+$/.test(release) && release !== PAPER_RELEASE ? `../data/${release}/` : '../data/'
export const snapshotDataPath = isIllustrativeDemo
  ? `../data/demos/${demoId}/${snapshotPhase}.json.gz`
  : `${taskDataRoot}states/${encodeURIComponent(taskId)}/${snapshotPhase}.json.gz`
const originalFetch = window.fetch.bind(window)
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })

async function compressedJson(path: string) {
  const response = await originalFetch(new URL(path, location.href))
  if (!response.ok) throw new Error(`Snapshot could not be loaded (${response.status}).`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  return JSON.parse(strFromU8(bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes))
}

function signalUnavailable(service: string, tool: string, message: string) {
  if (!unavailableSnapshotReads.has(service)) unavailableSnapshotReads.set(service, new Map())
  unavailableSnapshotReads.get(service)!.set(tool, message)
  window.dispatchEvent(new CustomEvent('snapshot-tool-unavailable', { detail: { service, tool, message } }))
}

function isolateSnapshotStorage() {
  // Native apps persist dismissed records, local uploads, stars and deleted
  // IDs. Those are UI conveniences in a live workspace, but must never hide
  // or add another task's records in this static snapshot viewer. Keep only
  // presentation preferences persistent; content caches live in this frame.
  const persistent = window.localStorage
  const preferenceKeys = new Set(['theme', 'multiverse_notes_view_mode', 'multiverse_notes_sidebar_width'])
  const localValues = new Map<string, string>()
  const keys = () => [...new Set([...localValues.keys(), ...[...preferenceKeys].filter(key => persistent.getItem(key) !== null)])]
  const isolated: Storage = {
    get length() { return keys().length },
    key(index) { return keys()[index] ?? null },
    getItem(key) { return preferenceKeys.has(String(key)) ? persistent.getItem(String(key)) : localValues.get(String(key)) ?? null },
    setItem(key, value) { if (preferenceKeys.has(String(key))) persistent.setItem(String(key), String(value)); else localValues.set(String(key), String(value)) },
    removeItem(key) { if (preferenceKeys.has(String(key))) persistent.removeItem(String(key)); else localValues.delete(String(key)) },
    clear() { localValues.clear() },
  }
  Object.defineProperty(window, 'localStorage', { configurable: true, value: isolated })
}

export async function installSnapshotBackend() {
  if (demoId && !isIllustrativeDemo) throw new Error('This illustrative demo is not available.')
  if (!isIllustrativeDemo && !/^[a-zA-Z0-9_-]{1,100}$/.test(taskId)) throw new Error('Choose a task in the task explorer to open its desktop.')
  isolateSnapshotStorage()
  const [state, task] = await Promise.all([
    compressedJson(snapshotDataPath),
    compressedJson(isIllustrativeDemo ? `../data/demos/${demoId}/task.json.gz` : `${taskDataRoot}tasks/${encodeURIComponent(taskId)}.json.gz`).catch(() => null),
  ])
  snapshot = state as Snapshot
  if (!snapshot.available || !snapshot.data || typeof snapshot.data !== 'object') throw new Error(snapshot.reason || 'This snapshot is unavailable.')
  taskTitle = task?.title || demoId || taskId
  taskTime = String(task?.userSimulation?.global_context_variables || '').match(/\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?(?:[+-]\d\d:\d\d|Z)/)?.[0] || ''
  document.title = `${taskTitle} · MultiVerse Desktop`

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = new URL(input instanceof Request ? input.url : String(input), location.href)
    const prefix = new URL('./api/', location.href).pathname
    if (requestUrl.origin !== location.origin || !requestUrl.pathname.startsWith(prefix)) return originalFetch(input, init)
    const route = requestUrl.pathname.slice(prefix.length)
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
    if (method === 'GET' && route === 'config') return json({ read_only: true, mutation_warning_enabled: false, snapshot: true })
    if (method === 'GET' && route === 'services') return json({ services: Object.keys(snapshot.data).map(name => ({ name, loaded: true })) })
    if (method === 'GET' && route === 'time') return json({ is_overridden: !!taskTime, current_time: taskTime || new Date().toISOString(), timezone_offset: taskTime.match(/[+-]\d\d:\d\d$/)?.[0] || '+00:00' })
    const match = route.match(/^services\/([^/]+)(?:\/(.*))?$/)
    if (!match) return json({ error: 'This action is unavailable in the read-only snapshot desktop.' }, 403)
    const service = decodeURIComponent(match[1]), action = match[2] || ''
    if (!Object.hasOwn(snapshot.data, service)) return json({ error: `${service} is not present in this task snapshot.` }, 404)
    if (method === 'GET' && action === 'state') return json({ state: snapshot.data[service] })
    if (method === 'GET' && !action) return json({ name: service, tools: [], read_only: true })
    if (method !== 'POST' || !(action.startsWith('tools/') || action === 'batch')) return json({ error: 'Snapshot data is read-only. Switch Initial / Final to inspect the authored task states.' }, 403)
    let body: Record<string, any>
    try { body = JSON.parse(typeof init?.body === 'string' ? init.body : input instanceof Request ? await input.clone().text() : '{}') } catch { return json({ error: 'Invalid JSON request.' }, 400) }
    const call = (tool: string, params: Record<string, any>) => {
      try { return { success: true, result: readSnapshotTool(service, tool, params, snapshot.data) } }
      catch (error) {
        const message = error instanceof Error ? error.message : 'This tool is unavailable in snapshot mode.'
        if (!/^(?:create|update|delete|send|add|remove|modify|set|start|stop|play|pause|reset|mark|insert|upload|batch_update|trash|untrash|reply|forward|append|clear|cancel|complete|toggle|prepare|publish|like|unlike|follow|unfollow|archive|unarchive|pin|unpin|join|leave|invite|kick|open|close|transfer|move|copy|duplicate|assign|unassign|execute|run|write|put|post|patch)/.test(tool)) signalUnavailable(service, tool, message)
        return { success: false, error: message }
      }
    }
    if (action === 'batch') return json({ results: (body.calls || []).map((item: any) => call(item.tool_name, item.arguments || item.params || {})) })
    const result = call(decodeURIComponent(action.slice('tools/'.length)), body.params || body.arguments || {})
    return result.success ? json(result) : json(result, 422)
  }
}
