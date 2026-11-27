import { useState, useCallback, useEffect, useRef, type ComponentType, type ReactNode } from 'react'
import { AppRegistry, type AppManifest, type AppProps, type OpenWindowConfig } from '../AppRegistry'
import { Window } from './Window'
import { Dock } from './Dock'
import { MenuBar } from './MenuBar'
import { MutationWarning } from './MutationWarning'
import { useReadOnly } from '../contexts/ReadOnlyContext'
import { snapshotParams } from '../snapshotBackend'

// Dynamic import for AdminPanel - makes admin module optional
// Uses import.meta.glob which handles missing files gracefully at build time
type AdminPanelComponent = React.ComponentType<{
  serviceName: string
  onClose: () => void
  onRefreshApp?: () => void
}>

// Use Vite's glob import to optionally load admin module
// This won't fail at build time if the admin directory doesn't exist
const adminModules = import.meta.glob<{ AdminPanel: AdminPanelComponent }>('./admin/index.ts', { eager: false })

let AdminPanelModule: { AdminPanel: AdminPanelComponent } | null = null
let adminModuleLoaded = false

async function loadAdminModule(): Promise<AdminPanelComponent | null> {
  if (adminModuleLoaded) {
    return AdminPanelModule?.AdminPanel || null
  }

  const adminPath = './admin/index.ts'
  if (adminPath in adminModules) {
    try {
      const module = await adminModules[adminPath]()
      AdminPanelModule = module
      adminModuleLoaded = true
      return AdminPanelModule.AdminPanel
    } catch (e) {
      // Admin module failed to load
      adminModuleLoaded = true
      return null
    }
  } else {
    // Admin module not available - this is expected if admin directory is removed
    adminModuleLoaded = true
    return null
  }
}

interface OpenWindow {
  id: string
  appId: string
  title: string
  component: ComponentType<AppProps> | null  // null for custom content windows
  customContent?: ReactNode  // For windows opened via openWindow
  position: { x: number; y: number }
  size: { width: number; height: number }
  zIndex: number
  refreshHandler?: (() => void) | null
  // Note: adminHandler is now managed by Desktop, not by individual apps
}

// Layout constants
const MENU_BAR_HEIGHT = 32 // h-7
const DOCK_RESERVED_HEIGHT = 80 // dock + bottom margin
const WINDOW_MARGIN = 20

function getWindowGeometryKey(appId: string) {
  return `window-geometry-${appId}`
}

function saveWindowGeometry(appId: string, geo: { x: number; y: number; width: number; height: number }) {
  sessionStorage.setItem(getWindowGeometryKey(appId), JSON.stringify(geo))
}

function loadWindowGeometry(appId: string): { x: number; y: number; width: number; height: number } | null {
  const raw = sessionStorage.getItem(getWindowGeometryKey(appId))
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function clampWindowGeometry(
  desiredWidth: number,
  desiredHeight: number,
  opts?: { offsetX?: number; offsetY?: number }
): { x: number; y: number; width: number; height: number } {
  const availableWidth = window.innerWidth - WINDOW_MARGIN * 2
  const availableHeight = window.innerHeight - MENU_BAR_HEIGHT - DOCK_RESERVED_HEIGHT - WINDOW_MARGIN * 2
  const width = Math.min(desiredWidth, availableWidth)
  const height = Math.min(desiredHeight, availableHeight)
  const offsetX = opts?.offsetX ?? (Math.random() * 60 - 30)
  const offsetY = opts?.offsetY ?? (Math.random() * 60 - 30)
  const x = Math.max(WINDOW_MARGIN, Math.min(
    window.innerWidth - width - WINDOW_MARGIN,
    (window.innerWidth - width) / 2 + offsetX,
  ))
  const y = Math.max(WINDOW_MARGIN, Math.min(
    window.innerHeight - MENU_BAR_HEIGHT - DOCK_RESERVED_HEIGHT - height - WINDOW_MARGIN,
    (window.innerHeight - MENU_BAR_HEIGHT - DOCK_RESERVED_HEIGHT - height) / 2 + offsetY,
  ))
  return { x, y, width, height }
}

interface DesktopProps {
  apps: AppManifest[]
}

export function Desktop({ apps }: DesktopProps) {
  const readOnly = useReadOnly()
  const [windows, setWindows] = useState<OpenWindow[]>([])
  const [nextZIndex, setNextZIndex] = useState(1)
  const [adminAvailable, setAdminAvailable] = useState(false)
  const [AdminPanel, setAdminPanel] = useState<AdminPanelComponent | null>(null)
  const [, forceUpdate] = useState({})

  // Keep a ref to the latest windows state so admin panel callbacks can
  // dynamically look up the current refresh handler (avoids stale closures).
  const windowsRef = useRef(windows)
  windowsRef.current = windows

  // Check if admin module is available on mount
  useEffect(() => {
    if (readOnly) return
    loadAdminModule().then((panel) => {
      if (panel) {
        setAdminAvailable(true)
        setAdminPanel(() => panel)
      }
    })
  }, [readOnly])

  // Listen for badge updates and refresh apps list from registry
  useEffect(() => {
    const handleBadgeUpdate = () => {
      // Force Desktop to re-render which will cause Dock to get fresh apps with updated badges
      forceUpdate({})
    }
    window.addEventListener('app-badge-updated', handleBadgeUpdate)
    return () => window.removeEventListener('app-badge-updated', handleBadgeUpdate)
  }, [])

  // Close windows for apps that are no longer in the apps list
  useEffect(() => {
    const appIds = new Set(apps.map(a => a.id))
    setWindows(prev => {
      const filtered = prev.filter(w => {
        // Keep custom/admin windows (no component) and windows whose app is still in the list
        if (!w.component) return true
        return appIds.has(w.appId)
      })
      return filtered.length !== prev.length ? filtered : prev
    })
  }, [apps])

  const openApp = useCallback(async (app: AppManifest) => {
    if (snapshotParams.get('app') !== app.id) {
      snapshotParams.delete('record')
      snapshotParams.delete('view')
    }
    snapshotParams.set('app', app.id)
    history.replaceState(null, '', `?${snapshotParams}`)
    // Check if app is already open
    const existingWindow = windows.find(w => w.appId === app.id)
    if (existingWindow) {
      // Bring to front
      bringToFront(existingWindow.id)
      return
    }

    // Load the app component
    const registry = AppRegistry.getInstance()
    const component = await registry.loadAppComponent(app.id)

    if (!component) {
      console.error(`Failed to load app: ${app.id}`)
      return
    }

    // Use saved geometry if available, otherwise clamp to fit viewport
    const saved = loadWindowGeometry(app.id)
    const geo = clampWindowGeometry(
      saved?.width || app.defaultWindow?.width || 800,
      saved?.height || app.defaultWindow?.height || 600,
      { offsetX: 0, offsetY: 0 },
    )

    const newWindow: OpenWindow = {
      id: `${app.id}-${Date.now()}`,
      appId: app.id,
      title: app.name,
      component,
      position: { x: geo.x, y: geo.y },
      size: { width: geo.width, height: geo.height },
      zIndex: nextZIndex,
    }

    setWindows(prev => [...prev, newWindow])
    setNextZIndex(prev => prev + 1)
  }, [windows, nextZIndex])

  const initialAppOpened = useRef(false)
  useEffect(() => {
    if (initialAppOpened.current || !apps.length) return
    initialAppOpened.current = true
    const requested = snapshotParams.get('app')
    const first = apps.find(app => app.id === requested) || ['gridwell_mail', 'slick', 'gridwell_calendar', 'gridwell_drive'].map(id => apps.find(app => app.id === id)).find(Boolean) || apps[0]
    void openApp(first)
  }, [apps, openApp])

  const closeWindow = useCallback((windowId: string) => {
    setWindows(prev => prev.filter(w => w.id !== windowId))
  }, [])

  const bringToFront = useCallback((windowId: string) => {
    setWindows(prev =>
      prev.map(w =>
        w.id === windowId ? { ...w, zIndex: nextZIndex } : w
      )
    )
    setNextZIndex(prev => prev + 1)
  }, [nextZIndex])

  const updateWindowPosition = useCallback((windowId: string, position: { x: number; y: number }) => {
    setWindows(prev => {
      const updated = prev.map(w =>
        w.id === windowId ? { ...w, position } : w
      )
      const win = updated.find(w => w.id === windowId)
      if (win) {
        saveWindowGeometry(win.appId, { ...position, width: win.size.width, height: win.size.height })
      }
      return updated
    })
  }, [])

  const updateWindowSize = useCallback((windowId: string, size: { width: number; height: number }) => {
    setWindows(prev => {
      const updated = prev.map(w =>
        w.id === windowId ? { ...w, size } : w
      )
      const win = updated.find(w => w.id === windowId)
      if (win) {
        saveWindowGeometry(win.appId, { x: win.position.x, y: win.position.y, ...size })
      }
      return updated
    })
  }, [])

  const setWindowRefreshHandler = useCallback((windowId: string, handler: (() => void) | null) => {
    setWindows(prev =>
      prev.map(w =>
        w.id === windowId ? { ...w, refreshHandler: handler } : w
      )
    )
  }, [])

  // Open admin window for a specific service
  const openAdminWindow = useCallback((serviceName: string, appTitle: string) => {
    if (!AdminPanel) return

    const adminWindowId = `${serviceName}-admin`

    // Check if admin window already exists
    const existingWindow = windowsRef.current.find(w => w.id === adminWindowId)
    if (existingWindow) {
      bringToFront(existingWindow.id)
      return
    }

    const saved = loadWindowGeometry(adminWindowId)
    const geo = saved ?? clampWindowGeometry(700, 600, { offsetX: window.innerWidth * 0.1, offsetY: 0 })

    // Use a dynamic lookup for the refresh handler so it's never stale.
    // windowsRef.current always reflects the latest windows state.
    const dynamicRefresh = () => {
      const parentWin = windowsRef.current.find(
        w => w.appId === serviceName && w.component !== null
      )
      parentWin?.refreshHandler?.()
    }

    const newWindow: OpenWindow = {
      id: adminWindowId,
      appId: adminWindowId,
      title: `${appTitle} Admin`,
      component: null,
      customContent: <AdminPanel serviceName={serviceName} onClose={() => closeWindow(adminWindowId)} onRefreshApp={dynamicRefresh} />,
      position: { x: geo.x, y: geo.y },
      size: { width: geo.width, height: geo.height },
      zIndex: nextZIndex,
    }

    setWindows(prev => [...prev, newWindow])
    setNextZIndex(prev => prev + 1)
  }, [AdminPanel, nextZIndex])

  const openCustomWindow = useCallback((config: OpenWindowConfig) => {
    // Check if window with this id already exists
    const existingWindow = windows.find(w => w.id === config.id)
    if (existingWindow) {
      bringToFront(existingWindow.id)
      return
    }

    const saved = loadWindowGeometry(config.id)
    const geo = saved ?? clampWindowGeometry(
      config.width || 500,
      config.height || 600,
      { offsetX: window.innerWidth * 0.1, offsetY: 0 },
    )

    const newWindow: OpenWindow = {
      id: config.id,
      appId: config.id,
      title: config.title,
      component: null,
      customContent: config.content,
      position: { x: geo.x, y: geo.y },
      size: { width: geo.width, height: geo.height },
      zIndex: nextZIndex,
    }

    setWindows(prev => [...prev, newWindow])
    setNextZIndex(prev => prev + 1)
  }, [windows, nextZIndex])

  return (
    <div className="relative h-full w-full flex flex-col" style={{ background: 'var(--bg-desktop)' }}>
      {/* Menu bar at the top */}
      <MenuBar />

      {/* Desktop area */}
      <div className="relative flex-1">
        {windows.map(win => {
          // Create admin handler for app windows (not custom content windows)
          // The service name is derived from the appId (e.g., 'slick' -> 'slick')
          const adminHandler = !readOnly && adminAvailable && win.component
            ? () => openAdminWindow(win.appId, win.title)
            : undefined

          return (
            <Window
              key={win.id}
              appId={win.appId}
              title={win.title}
              position={win.position}
              size={win.size}
              zIndex={win.zIndex}
              onClose={() => closeWindow(win.id)}
              onFocus={() => bringToFront(win.id)}
              onMove={(pos) => updateWindowPosition(win.id, pos)}
              onResize={(size) => updateWindowSize(win.id, size)}
              onRefreshClick={win.refreshHandler || undefined}
              onAdminClick={adminHandler}
            >
              {win.customContent ? (
                win.customContent
              ) : win.component ? (
                <win.component
                  onClose={() => closeWindow(win.id)}
                  setRefreshHandler={(handler) => setWindowRefreshHandler(win.id, handler)}
                  openWindow={openCustomWindow}
                />
              ) : null}
            </Window>
          )
        })}

        {/* Dock at the bottom */}
        <Dock apps={apps} onAppClick={openApp} />

        {!readOnly && <MutationWarning />}
      </div>
    </div>
  )
}
