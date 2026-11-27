import type { ComponentType, ReactNode } from 'react'
import { wrapSnapshotApp } from './components/SnapshotInspector'
import { snapshot } from './snapshotBackend'
import { supportedNativeServices } from './snapshotReadTools'

export interface AppManifest {
  id: string
  name: string
  icon: string
  iconBackground?: string  // CSS gradient or color for the dock icon background
  description?: string
  backendService: string
  badge?: number  // Badge count to display on dock icon
  defaultWindow?: {
    width: number
    height: number
  }
}

export interface LoadedApp extends AppManifest {
  component: ComponentType<AppProps>
}

export interface OpenWindowConfig {
  id: string
  title: string
  content: ReactNode
  width?: number
  height?: number
}

export interface AppProps {
  onClose: () => void
  setRefreshHandler?: (handler: (() => void) | null) => void  // Register refresh button click handler
  openWindow?: (config: OpenWindowConfig) => void  // Open a new window with custom content
  // Note: Admin functionality is now handled by Desktop.tsx, not individual apps
}

// App module loaders - dynamically import app components
// This map is populated by the discovery mechanism
const appLoaders: Record<string, () => Promise<{ default: ComponentType<AppProps> }>> = {}

// Register app loaders from gui/apps/*/frontend
// Uses Vite's import.meta.glob for dynamic discovery
const appModules = import.meta.glob<{ default: ComponentType<AppProps> }>(
  '../../apps/*/frontend/App.tsx'
)

const manifestModules = import.meta.glob<AppManifest>(
  '../../apps/*/frontend/manifest.json',
  { eager: true, import: 'default' }
)

export class AppRegistry {
  private static instance: AppRegistry
  private apps: Map<string, AppManifest> = new Map()
  private loadedComponents: Map<string, ComponentType<AppProps>> = new Map()

  private constructor() {}

  static getInstance(): AppRegistry {
    if (!AppRegistry.instance) {
      AppRegistry.instance = new AppRegistry()
    }
    return AppRegistry.instance
  }

  async discoverApps(): Promise<void> {

    // Load manifests from all apps
    for (const [path, manifest] of Object.entries(manifestModules)) {
      if (manifest && manifest.id) {
        // Badges are derived only by the currently loaded snapshot app.
        this.apps.set(manifest.id, { ...manifest, badge: undefined })

        // Register the corresponding app loader
        const appPath = path.replace('manifest.json', 'App.tsx')
        if (appModules[appPath]) {
          appLoaders[manifest.id] = appModules[appPath]
        }
      }
    }

    for (const service of Object.keys(snapshot.data)) {
      if (!this.apps.has(service)) this.apps.set(service, { id: service, name: service.replaceAll('_', ' '), icon: '▤', backendService: service, defaultWindow: { width: 900, height: 650 } })
    }
  }

  getApps(): AppManifest[] {
    return Array.from(this.apps.values())
  }

  getApp(id: string): AppManifest | undefined {
    return this.apps.get(id)
  }

  async loadAppComponent(id: string): Promise<ComponentType<AppProps> | null> {
    // Return cached component if already loaded
    if (this.loadedComponents.has(id)) {
      return this.loadedComponents.get(id)!
    }

    // Load the component
    const loader = appLoaders[id]
    if (!loader || !supportedNativeServices.includes(id)) {
      const component = wrapSnapshotApp(id, null)
      this.loadedComponents.set(id, component)
      return component
    }

    try {
      const module = await loader()
      const component = wrapSnapshotApp(id, module.default)
      this.loadedComponents.set(id, component)
      return component
    } catch (error) {
      console.error(`Failed to load app component: ${id}`, error)
      return null
    }
  }

  setBadge(id: string, count: number | undefined): void {
    const app = this.apps.get(id)
    if (app) {
      app.badge = count
      this.apps.set(id, { ...app })
    }
  }
}
