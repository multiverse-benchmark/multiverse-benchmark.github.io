import { useEffect, useRef } from 'react'
import { AppRegistry } from '../AppRegistry'

/**
 * Hook for apps to set their badge count on the dock icon
 * @param appId - The app ID from manifest
 * @param count - The badge count (undefined or 0 to hide badge)
 */
export function useBadge(appId: string, count: number | undefined) {
  const prevCountRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    // Only update if count has changed
    if (prevCountRef.current !== count) {
      const registry = AppRegistry.getInstance()
      registry.setBadge(appId, count)
      prevCountRef.current = count

      // Dispatch custom event to notify Desktop to re-render
      window.dispatchEvent(new CustomEvent('app-badge-updated', {
        detail: { appId, count }
      }))
    }
  }, [appId, count])
}
