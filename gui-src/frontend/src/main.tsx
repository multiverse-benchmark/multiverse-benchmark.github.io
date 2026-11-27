import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { initTimeOverride } from './timeOverride'
import { installSnapshotBackend } from './snapshotBackend'
import './snapshot.css'

// Authored fixtures can name image URLs without shipping their bytes. Show an
// intentional local placeholder; the original URL remains in Snapshot data.
const imagePlaceholder = new URL('./icons/snapshot-image.svg', location.href).href
const displaySnapshotImage = (image: HTMLImageElement) => {
  if (!image.getAttribute('src') || image.src === imagePlaceholder) return
  const source = new URL(image.src, location.href)
  if (!['data:', 'blob:'].includes(source.protocol) && source.origin !== location.origin) {
    image.dataset.snapshotOriginalSrc = image.src
    image.src = imagePlaceholder
  }
}
new MutationObserver(records => {
  for (const record of records) {
    if (record.type === 'attributes' && record.target instanceof HTMLImageElement) displaySnapshotImage(record.target)
    for (const node of record.addedNodes) if (node instanceof Element) {
      if (node instanceof HTMLImageElement) displaySnapshotImage(node)
      node.querySelectorAll('img').forEach(displaySnapshotImage)
    }
  }
}).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] })
document.addEventListener('error', event => {
  if (event.target instanceof HTMLImageElement && event.target.src !== imagePlaceholder) {
    event.target.dataset.snapshotOriginalSrc = event.target.src
    event.target.src = imagePlaceholder
  }
}, true)

// Patch Date before React renders so every component sees the overridden time.
installSnapshotBackend().then(initTimeOverride).then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}).catch(error => {
  const root = document.getElementById('root')!
  root.replaceChildren()
  const message = document.createElement('p')
  message.textContent = error instanceof Error ? error.message : 'The snapshot desktop could not load.'
  message.style.cssText = 'padding:48px;font:16px/1.7 system-ui;color:#243c2d;background:#f4f7ef;min-height:100vh'
  root.append(message)
})
