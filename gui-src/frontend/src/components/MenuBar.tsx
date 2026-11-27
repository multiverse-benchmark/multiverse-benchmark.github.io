import { useState } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import { snapshot, snapshotParams, snapshotPhase, snapshotDataPath, taskId, taskTitle, taskTime, demoId, isIllustrativeDemo } from '../snapshotBackend'

export function MenuBar() {
  const [details, setDetails] = useState(false)
  const { theme, toggleTheme } = useTheme()
  const link = (phase: string) => {
    const params = new URLSearchParams(snapshotParams)
    params.set('phase', phase)
    return `?${params}`
  }
  const caveatCount = (snapshot.reconstruction?.beforeValueMismatches?.length || 0) + (snapshot.reconstruction?.createdPaths?.length || 0) + (snapshot.reconstruction?.warnings?.length || 0) + (snapshot.warnings?.length || 0) + Object.keys(snapshot.unavailableServices || {}).length
  return <div className="snapshot-menubar bg-mac-menubar border-b border-mac">
    <strong>MultiVerse {isIllustrativeDemo ? 'Demo' : 'Desktop'}</strong>
    <nav className="snapshot-phase-tabs" aria-label="Desktop snapshot phase"><a href={link('initial')} onClick={event => { event.currentTarget.href = link('initial') }} aria-current={snapshotPhase === 'initial' ? 'page' : undefined}>Initial</a><a href={link('final')} onClick={event => { event.currentTarget.href = link('final') }} aria-current={snapshotPhase === 'final' ? 'page' : undefined}>Final <span>· {isIllustrativeDemo ? 'demo replay' : 'reconstructed'}</span></a></nav>
    <div className="snapshot-menu-actions"><button onClick={() => setDetails(value => !value)} aria-expanded={details} aria-label="Snapshot details">ⓘ <span>Snapshot details{caveatCount ? ` (${caveatCount})` : ''}</span></button><button onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>{theme === 'dark' ? '☼' : '☾'}</button></div>
    {details && <aside className="snapshot-details" role="region" aria-label="Snapshot provenance"><div className="snapshot-details-heading"><strong>About this snapshot</strong><button onClick={() => setDetails(false)} aria-label="Close snapshot details">×</button></div><h2>{taskTitle}</h2><p>{snapshot.reason}</p><p><strong>{snapshotPhase === 'initial' ? 'Initial state' : isIllustrativeDemo ? 'Replayed illustrative final state' : 'Reconstructed reference state'}</strong> · Read-only. No simulator or agent is executing in this desktop.</p>{taskTime && <p>Authored task time: <code>{taskTime}</code></p>}{caveatCount > 0 && <details><summary>{caveatCount} reconstruction / availability notes</summary><pre>{JSON.stringify({ warnings: snapshot.warnings, reconstruction: snapshot.reconstruction, unavailableServices: snapshot.unavailableServices }, null, 2)}</pre></details>}<small>{isIllustrativeDemo ? `Illustrative demo ${demoId} · outside the validation cohort` : `Task ${taskId}`}</small><a href={snapshotDataPath} download>Download snapshot JSON (.gz)</a></aside>}
  </div>
}
