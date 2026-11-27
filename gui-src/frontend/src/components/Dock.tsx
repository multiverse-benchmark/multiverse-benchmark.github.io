import type { AppManifest } from '../AppRegistry'

interface DockProps {
  apps: AppManifest[]
  onAppClick: (app: AppManifest) => void
}

export function Dock({ apps, onAppClick }: DockProps) {
  if (apps.length === 0) {
    return (
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-mac-dock backdrop-blur-2xl rounded-2xl px-6 py-3 border border-mac shadow-mac">
        <p className="text-mac-secondary text-sm">No apps discovered</p>
      </div>
    )
  }

  return (
    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-mac-dock backdrop-blur-2xl rounded-2xl px-2 py-1.5 border border-mac shadow-mac flex gap-1">
      {apps.map(app => (
        <button
          key={app.id}
          data-app-id={app.id}
          aria-label={`Open ${app.name}`}
          className="group flex flex-col items-center p-1.5 rounded-xl transition-all"
          onClick={() => onAppClick(app)}
          title={app.description || app.name}
        >
          <div className="relative group-hover:-translate-y-2 transition-all duration-200">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shadow-lg group-hover:shadow-xl overflow-hidden"
              style={{ background: app.iconBackground || 'linear-gradient(to bottom right, #3b82f6, #2563eb)' }}
            >
              {app.icon.startsWith('./') || app.icon.startsWith('/') || app.icon.startsWith('http') ? (
                <img src={app.icon} alt={app.name} className="w-8 h-8 object-contain" />
              ) : (
                app.icon
              )}
            </div>
            {/* Badge counter with smooth 3D styling */}
            {app.badge !== undefined && app.badge > 0 && (
              <div
                className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
                  boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
                }}
              >
                <span className="text-white text-[11px] font-bold leading-none">
                  {app.badge > 99 ? '99+' : app.badge}
                </span>
              </div>
            )}
            {/* Tooltip */}
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-mac-secondary rounded-md text-xs text-mac-primary whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity shadow-mac border border-mac pointer-events-none">
              {app.name}
            </div>
          </div>
          {/* Active indicator dot */}
          <div className="w-1 h-1 rounded-full bg-mac-tertiary mt-1 opacity-0" />
        </button>
      ))}
    </div>
  )
}
