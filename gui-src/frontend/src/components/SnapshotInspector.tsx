import { Component, useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react'
import type { AppProps } from '../AppRegistry'
import { snapshot, unavailableSnapshotReads } from '../snapshotBackend'
import { snapshotRecordErrors } from '../snapshotNavigation'

const isObject = (value: unknown): value is Record<string, any> => value !== null && typeof value === 'object'
const summary = (value: unknown) => Array.isArray(value) ? `${value.length} items` : isObject(value) ? `${Object.keys(value).length} fields` : value === null ? 'null' : String(value)
const label = (key: string, value: unknown) => isObject(value) ? String(value.subject || value.title || value.name || value.summary || value.displayName || value.text || value.content || value.id || key).slice(0, 120) : key

export function SnapshotInspector({ service }: { service: string }) {
  const [path, setPath] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(80)
  const [raw, setRaw] = useState(false)
  const data = snapshot.data[service]
  const current = path.reduce<unknown>((value, key) => isObject(value) ? value[key] : undefined, data)
  const rows = useMemo(() => isObject(current) ? Object.entries(current).filter(([key, value]) => !query || `${key} ${JSON.stringify(value)}`.toLowerCase().includes(query.toLowerCase())) : [], [current, query])
  const navigate = (next: string[]) => { setPath(next); setQuery(''); setLimit(80); setRaw(false) }
  return <div className="snapshot-inspector">
    <div className="snapshot-inspector-toolbar"><nav aria-label="Snapshot data path"><button onClick={() => navigate([])}>{service}</button>{path.map((part, i) => <span key={i}> / <button onClick={() => navigate(path.slice(0, i + 1))}>{part}</button></span>)}</nav><button onClick={() => setRaw(value => !value)} aria-pressed={raw}>{raw ? 'Browse records' : 'View JSON'}</button></div>
    <div className="snapshot-inspector-search"><input aria-label="Search snapshot records" placeholder="Search keys and record contents…" value={query} onChange={event => { setQuery(event.target.value); setLimit(80) }} /><span>{rows.length} records</span></div>
    <div className="snapshot-inspector-body">{raw || !isObject(current) ? <pre>{JSON.stringify(current, null, 2)}</pre> : rows.length ? <div className="snapshot-records">{rows.slice(0, limit).map(([key, value]) => <div className="snapshot-record" key={key}>{isObject(value) ? <button onClick={() => navigate([...path, key])}><strong>{label(key, value)}</strong><small>{key} · {summary(value)}</small><span aria-hidden="true">›</span></button> : <div><strong>{key}</strong><p>{summary(value)}</p></div>}</div>)}{rows.length > limit && <button className="snapshot-more" onClick={() => setLimit(value => value + 80)}>Show more ({rows.length - limit} remaining)</button>}</div> : <p className="snapshot-empty">{query ? 'No stored records match your search.' : 'This collection has no stored records.'}</p>}</div>
  </div>
}

class NativeBoundary extends Component<{ children: ReactNode; service: string; onError: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onError() }
  render() { return this.state.failed ? <SnapshotInspector service={this.props.service} /> : this.props.children }
}

export function wrapSnapshotApp(service: string, Native: ComponentType<AppProps> | null): ComponentType<AppProps> {
  return function SnapshotApp(props: AppProps) {
    const [mode, setMode] = useState<'app' | 'data'>(Native ? 'app' : 'data')
    const [notice, setNotice] = useState(Native ? '' : 'This service opens in the snapshot data browser. All stored fields are available.')
    const [recordNotice, setRecordNotice] = useState(snapshotRecordErrors.get(service) || '')
    useEffect(() => {
      const readRetainedNotice = () => {
        const warnings = unavailableSnapshotReads.get(service)
        if (warnings?.size) setNotice(`Some snapshot lookups could not be completed: ${[...warnings.keys()].join(', ')}. All stored fields remain available in Snapshot data.`)
      }
      const onUnavailable = (event: Event) => {
        const detail = (event as CustomEvent).detail
        if (detail.service === service) readRetainedNotice()
      }
      window.addEventListener('snapshot-tool-unavailable', onUnavailable)
      const onRecordUnavailable = () => setRecordNotice(snapshotRecordErrors.get(service) || '')
      window.addEventListener('snapshot-record-unavailable', onRecordUnavailable)
      // Child mount effects may issue reads before this parent subscribes.
      readRetainedNotice()
      onRecordUnavailable()
      return () => {
        window.removeEventListener('snapshot-tool-unavailable', onUnavailable)
        window.removeEventListener('snapshot-record-unavailable', onRecordUnavailable)
      }
    }, [])
    return <div className="snapshot-app-wrapper"><div className="snapshot-app-tabs">{Native && <button aria-pressed={mode === 'app'} onClick={() => setMode('app')}>App</button>}<button aria-pressed={mode === 'data'} onClick={() => setMode('data')}>Snapshot data</button><span>Read-only · {service}</span></div>{notice && <p className="snapshot-app-notice">{notice}</p>}{recordNotice && <p className="snapshot-app-notice snapshot-record-notice" role="status">{recordNotice}</p>}<div className="snapshot-native-content">{mode === 'app' && Native ? <NativeBoundary service={service} onError={() => { setMode('data'); setNotice('The native app could not render this snapshot. All stored data remains available below.') }}><Native {...props} /></NativeBoundary> : <SnapshotInspector service={service} />}</div></div>
  }
}
