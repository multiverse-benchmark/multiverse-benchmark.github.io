import { useState, useEffect, useCallback } from 'react'
import { BACKEND_STATE_CHANGED_EVENT } from '../hooks/useBackendAPI'

const DISMISSED_KEY = 'mutating-action-warning-dismissed'

const READ_ONLY_PREFIXES = ['get_', 'list_', 'search_', 'show_', 'find_', 'lookup_', 'info', 'identity', 'current_']
const READ_ONLY_SUFFIXES = ['_info', '_list', '_history', '_members', '_replies', '_conversations']

function isMutatingAction(toolName: string): boolean {
  const lowerTool = toolName.toLowerCase()
  for (const prefix of READ_ONLY_PREFIXES) {
    if (lowerTool.startsWith(prefix)) return false
  }
  for (const suffix of READ_ONLY_SUFFIXES) {
    if (lowerTool.endsWith(suffix)) return false
  }
  return true
}

export function MutationWarning() {
  const [enabled, setEnabled] = useState(false)
  const [visible, setVisible] = useState(false)

  // Fetch feature flag from backend
  useEffect(() => {
    fetch('./api/config')
      .then(res => res.json())
      .then(data => { setEnabled(!!data.mutation_warning_enabled) })
      .catch(() => {})
  }, [])

  // Listen for mutating actions
  useEffect(() => {
    if (!enabled) return

    const handle = (e: Event) => {
      const toolName = (e as CustomEvent).detail?.toolName
      if (toolName && isMutatingAction(toolName) && !sessionStorage.getItem(DISMISSED_KEY)) {
        setVisible(true)
      }
    }
    window.addEventListener(BACKEND_STATE_CHANGED_EVENT, handle)
    return () => window.removeEventListener(BACKEND_STATE_CHANGED_EVENT, handle)
  }, [enabled])

  const dismiss = useCallback(() => {
    setVisible(false)
    sessionStorage.setItem(DISMISSED_KEY, '1')
  }, [])

  if (!visible) return null

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[9999] animate-slide-down">
      <div className="flex items-center gap-3 px-4 py-3 bg-[var(--warning-color)] text-white rounded-xl shadow-lg max-w-lg">
        <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-sm font-medium">
          State changes are scoped to this playground session and won't affect annotation data.
        </span>
        <button
          onClick={dismiss}
          className="p-1 hover:bg-white/20 rounded transition-colors flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
