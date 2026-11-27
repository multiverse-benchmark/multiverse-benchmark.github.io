import type { SharedDrive } from './types'

interface SharedDrivesGridProps {
  drives: SharedDrive[]
  loading: boolean
  onOpen: (drive: SharedDrive) => void
  onEdit: (drive: SharedDrive) => void
  onToggleHide: (drive: SharedDrive) => void
  onDelete: (drive: SharedDrive) => void
  hidingId: string | null
  deletingId: string | null
}

export function SharedDrivesGrid({
  drives,
  loading,
  onOpen,
  onEdit,
  onToggleHide,
  onDelete,
  hidingId,
  deletingId,
}: SharedDrivesGridProps) {
  if (loading) {
    return (
      <div className="flex flex-wrap gap-3 md:gap-4">
        {Array(6).fill(0).map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="w-28 h-28 md:w-32 md:h-32 bg-gray-200 rounded-2xl mx-auto" />
            <div className="w-20 h-3 bg-gray-200 rounded mt-2 mx-auto" />
          </div>
        ))}
      </div>
    )
  }

  if (drives.length === 0) {
    return (
      <div className="text-center py-32">
        <div className="w-32 h-32 bg-gray-200 rounded-2xl mx-auto mb-8 flex items-center justify-center">
          <svg className="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-[#202124] mb-2">No shared drives</h3>
        <p className="text-[#5f6368] mb-8 max-w-sm mx-auto">Create one to get started.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-4 md:gap-5">
      {drives.map(drive => (
        <div key={drive.id} className="group w-28 md:w-32 lg:w-36">
          <div
            onClick={() => onOpen(drive)}
            className={`w-28 h-28 md:w-32 md:h-32 lg:w-36 lg:h-36 rounded-2xl flex flex-col items-center justify-center shadow-md hover:shadow-xl transition-all duration-200 p-3 relative overflow-visible bg-gradient-to-br from-[#0D9488] to-[#0D9488] text-white cursor-pointer ${drive.hidden ? 'opacity-60' : ''}`}
          >
            <div className="absolute top-0 right-0 w-14 h-8 md:w-16 md:h-10 bg-white/90 rounded-bl-2xl shadow-md flex items-center justify-center pr-2 pb-1">
              <svg className="w-4 h-4 md:w-5 md:h-5 text-[#0D9488]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>

            <svg className="w-10 h-10 md:w-12 md:h-12 lg:w-14 lg:h-14 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
            </svg>

            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="relative">
                <MenuButton
                  drive={drive}
                  onEdit={onEdit}
                  onToggleHide={onToggleHide}
                  onDelete={onDelete}
                  hidingId={hidingId}
                  deletingId={deletingId}
                />
              </div>
            </div>
          </div>

          <p className="mt-2 text-xs md:text-sm text-[#202124] font-medium px-1 text-center w-full break-words">
            {drive.name}
            {drive.hidden && <span className="ml-1 text-[10px] text-[#5f6368]">(hidden)</span>}
            <span style={{ display: 'block', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>
              [{drive.id}]
            </span>
          </p>
        </div>
      ))}
    </div>
  )
}

interface MenuButtonProps {
  drive: SharedDrive
  onEdit: (drive: SharedDrive) => void
  onToggleHide: (drive: SharedDrive) => void
  onDelete: (drive: SharedDrive) => void
  hidingId: string | null
  deletingId: string | null
}

function MenuButton({ drive, onEdit, onToggleHide, onDelete, hidingId, deletingId }: MenuButtonProps) {
  return (
    <details className="relative group/menu">
      <summary
        onClick={(e) => e.stopPropagation()}
        className="list-none p-1.5 bg-white/90 hover:bg-white rounded-full shadow-lg border border-gray-200 w-9 h-9 flex items-center justify-center cursor-pointer"
        title="More actions"
      >
        <svg className="w-4 h-4 text-[#5f6368]" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
        </svg>
      </summary>
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute left-0 top-10 z-50 bg-white rounded-lg shadow-xl border border-gray-200 py-2 min-w-[180px]"
      >
        <button onClick={() => onEdit(drive)} className="w-full px-4 py-2 text-left hover:bg-gray-100 text-sm text-gray-800">Rename</button>
        <button
          onClick={() => onToggleHide(drive)}
          disabled={hidingId === drive.id}
          className="w-full px-4 py-2 text-left hover:bg-gray-100 text-sm text-gray-800 disabled:opacity-50"
        >
          {hidingId === drive.id ? '...' : drive.hidden ? 'Unhide' : 'Hide'}
        </button>
        <div className="border-t border-gray-100 my-1" />
        <button
          onClick={() => onDelete(drive)}
          disabled={deletingId === drive.id}
          className="w-full px-4 py-2 text-left hover:bg-gray-100 text-sm text-red-600 disabled:opacity-50"
        >
          {deletingId === drive.id ? 'Deleting...' : 'Delete'}
        </button>
      </div>
    </details>
  )
}
