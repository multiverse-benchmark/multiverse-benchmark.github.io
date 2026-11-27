import { useState, useEffect, useRef } from 'react'
import { Desktop } from './components/Desktop'
import { AppRegistry, type AppManifest } from './AppRegistry'
import { ThemeProvider } from './contexts/ThemeContext'
import { ReadOnlyContext } from './contexts/ReadOnlyContext'

export const DATABASE_UPLOADED_EVENT = 'database-uploaded'

function filterApps(apps: AppManifest[], allowedServices: Set<string> | null): AppManifest[] {
  if (!allowedServices) return apps
  return apps.filter(app => allowedServices.has(app.backendService))
}

function App() {
  const [apps, setApps] = useState<AppManifest[]>([])
  const [loading, setLoading] = useState(true)
  const [readOnly, setReadOnly] = useState(true)
  const allowedServicesRef = useRef<Set<string> | null>(null)
  const uploadFilterRef = useRef<Set<string> | null>(null)

  useEffect(() => {
    const loadApps = async () => {
      try {
        try {
          const res = await fetch('./api/config')
          if (res.ok) {
            const config = await res.json()
            setReadOnly(config.read_only !== false)
          }
        } catch {
          // Configuration failure leaves the viewer read-only.
        }
        const registry = AppRegistry.getInstance()
        await registry.discoverApps()

        // Fetch loaded backend services to filter the app list
        try {
          const res = await fetch('./api/services')
          if (res.ok) {
            const data = await res.json()
            const loadedServices = new Set<string>(
              (data.services || []).map((s: { name: string }) => s.name)
            )
            if (loadedServices.size > 0) {
              allowedServicesRef.current = loadedServices
            }
          }
        } catch {
          // Backend unavailable — show all discovered apps as fallback
          console.warn('Could not fetch backend services, showing all apps')
        }

        setApps(filterApps(registry.getApps(), allowedServicesRef.current))
      } catch (error) {
        console.error('Failed to discover apps:', error)
      } finally {
        setLoading(false)
      }
    }
    loadApps()

    // Listen for badge updates and refresh apps list
    const handleBadgeUpdate = () => {
      const registry = AppRegistry.getInstance()
      const activeFilter = uploadFilterRef.current ?? allowedServicesRef.current
      const updatedApps = filterApps(registry.getApps(), activeFilter)
      setApps([...updatedApps])
    }
    window.addEventListener('app-badge-updated', handleBadgeUpdate)

    // Listen for database upload events to filter the dock
    const handleDatabaseUploaded = (e: Event) => {
      const detail = (e as CustomEvent<{ loadedApps: string[] }>).detail
      const uploadedSet = new Set(detail.loadedApps)
      uploadFilterRef.current = uploadedSet

      // Also update allowedServices to include the uploaded apps
      // (they may have been dynamically loaded on the backend)
      if (allowedServicesRef.current) {
        for (const app of detail.loadedApps) {
          allowedServicesRef.current.add(app)
        }
      }

      const registry = AppRegistry.getInstance()
      setApps(filterApps(registry.getApps(), uploadedSet))
    }
    window.addEventListener(DATABASE_UPLOADED_EVENT, handleDatabaseUploaded)

    return () => {
      window.removeEventListener('app-badge-updated', handleBadgeUpdate)
      window.removeEventListener(DATABASE_UPLOADED_EVENT, handleDatabaseUploaded)
    }
  }, [])

  if (loading) {
    return (
      <ThemeProvider>
        <div className="flex flex-col items-center justify-center h-screen bg-mac-primary gap-4">
          <div className="w-10 h-10 border-4 border-mac-tertiary border-t-accent-mac rounded-full animate-spin" />
          <p className="text-mac-secondary">Loading apps...</p>
        </div>
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider>
      <ReadOnlyContext.Provider value={readOnly}>
        <Desktop apps={apps} />
      </ReadOnlyContext.Provider>
    </ThemeProvider>
  )
}

export default App
