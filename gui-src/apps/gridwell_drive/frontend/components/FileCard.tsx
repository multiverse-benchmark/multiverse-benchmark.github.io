import type { DriveFile } from './types'
import {
  isFolder,
  isGridwellApp,
  getGridwellAppInfo,
  getFileType,
  getFileLabels,
  formatFileSize,
  GridwellAppIconPath,
} from './utils'

export interface FileCardActions {
  onViewInfo: (file: DriveFile) => void
  onRename: (file: DriveFile) => void
  onCopy: (file: DriveFile) => void
  onMove: (file: DriveFile) => void
  onShare: (file: DriveFile) => void
  onComments: (file: DriveFile) => void
  onRevisions: (file: DriveFile) => void
  onLabels: (file: DriveFile) => void
  onUpdateContent: (file: DriveFile) => void
  onExport: (file: DriveFile) => void
  onWatch: (file: DriveFile) => void
  onTrash: (file: DriveFile) => void
  onDownload: (file: DriveFile) => void
  onRestore?: (file: DriveFile) => void
  onDeleteForever?: (file: DriveFile) => void
  onNavigateFolder?: (file: DriveFile) => void
  onOpenInApp?: (file: DriveFile) => void
}

interface FileCardProps {
  file: DriveFile
  mode: 'drive' | 'trash'
  actions: FileCardActions
  canOpenInApp: boolean
  openMenuFileId: string | null
  setOpenMenuFileId: (id: string | null) => void
  downloading: string | null
  restoring?: string | null
}

export function FileCard({
  file,
  mode,
  actions,
  canOpenInApp,
  openMenuFileId,
  setOpenMenuFileId,
  downloading,
  restoring,
}: FileCardProps) {
  const folder = isFolder(file)
  const gridwellApp = isGridwellApp(file)
  const appInfo = gridwellApp ? getGridwellAppInfo(file.mimeType) : null
  const labels = getFileLabels(file)

  const handleTileClick = () => {
    if (mode !== 'drive') return
    if (folder) {
      actions.onNavigateFolder?.(file)
    } else if (gridwellApp) {
      actions.onOpenInApp?.(file)
    }
  }

  return (
    <div className="group w-24 md:w-28 lg:w-32">
      <div
        onClick={handleTileClick}
        className={`w-24 h-24 md:w-28 md:h-28 lg:w-32 lg:h-32 rounded-xl md:rounded-2xl flex flex-col items-center justify-center shadow-md hover:shadow-xl transition-all duration-200 p-2 md:p-3 relative overflow-visible ${
          folder
            ? 'bg-gradient-to-br from-[#0D9488] to-[#0D9488] text-white cursor-pointer'
            : gridwellApp && mode === 'drive'
              ? 'bg-white border-2 cursor-pointer hover:shadow-lg'
              : 'bg-white border border-[#e0e0e0]'
        } ${mode === 'trash' ? 'opacity-60 border-orange-200 cursor-default' : ''}`}
        style={gridwellApp && mode !== 'trash' ? { borderColor: appInfo?.color } : undefined}
      >
        {folder && (
          <div className="absolute top-0 right-0 w-10 h-6 md:w-14 md:h-8 lg:w-16 lg:h-10 bg-white/90 rounded-bl-xl md:rounded-bl-2xl shadow-md" />
        )}

        {mode === 'trash' && (
          <div className="absolute inset-0 bg-black/20 rounded-xl md:rounded-2xl flex items-center justify-center">
            <svg className="w-5 h-5 md:w-6 md:h-6 lg:w-8 lg:h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
        )}

        {file.thumbnailLink && !folder ? (
          <img src={file.thumbnailLink} alt={file.name} className="w-full h-full object-cover rounded-lg" />
        ) : folder ? (
          <svg className="w-8 h-8 md:w-10 md:h-10 lg:w-12 lg:h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
          </svg>
        ) : gridwellApp && appInfo ? (
          <div className="flex flex-col items-center">
            <svg className="w-8 h-8 md:w-10 md:h-10 lg:w-12 lg:h-12" viewBox="0 0 24 24" fill={appInfo.color}>
              <GridwellAppIconPath mimeType={file.mimeType} />
            </svg>
          </div>
        ) : (
          <svg className={`w-8 h-8 md:w-10 md:h-10 lg:w-12 lg:h-12 ${mode === 'trash' ? 'text-white' : 'text-[#5f6368]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        )}

        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {mode === 'drive' ? (
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setOpenMenuFileId(openMenuFileId === file.id ? null : file.id)
                }}
                className="p-1.5 bg-white/90 hover:bg-white rounded-full shadow-lg border border-gray-200 w-9 h-9 flex items-center justify-center"
                title="More actions"
              >
                <svg className="w-4 h-4 text-[#5f6368]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                </svg>
              </button>

              {openMenuFileId === file.id && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={(e) => { e.stopPropagation(); setOpenMenuFileId(null) }}
                  />
                  <div className="absolute left-0 top-10 z-50 bg-white rounded-lg shadow-xl border border-gray-200 py-2 min-w-[200px]">
                    {gridwellApp && canOpenInApp && appInfo && actions.onOpenInApp && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenMenuFileId(null)
                            actions.onOpenInApp!(file)
                          }}
                          className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center space-x-3 text-sm font-medium"
                          style={{ color: appInfo.color }}
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill={appInfo.color}>
                            <path d="M19 19H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z" />
                          </svg>
                          <span>Open with {appInfo.appName}</span>
                        </button>
                        <div className="border-t border-gray-100 my-1" />
                      </>
                    )}
                    <MenuItem
                      label="View info"
                      color="text-purple-500"
                      onClick={() => { setOpenMenuFileId(null); actions.onViewInfo(file) }}
                      iconPath="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                    <MenuItem
                      label="Rename"
                      color="text-teal-500"
                      onClick={() => { setOpenMenuFileId(null); actions.onRename(file) }}
                      iconPath="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                    />
                    {!folder && (
                      <MenuItem
                        label="Make a copy"
                        color="text-green-500"
                        onClick={() => { setOpenMenuFileId(null); actions.onCopy(file) }}
                        iconPath="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    )}
                    <MenuItem
                      label="Move to folder"
                      color="text-teal-500"
                      onClick={() => { setOpenMenuFileId(null); actions.onMove(file) }}
                      iconPath="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                    />
                    <MenuItem
                      label="Share"
                      color="text-orange-500"
                      onClick={() => { setOpenMenuFileId(null); actions.onShare(file) }}
                      iconPath="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                    />
                    {!folder && (
                      <MenuItem
                        label="Comments"
                        color="text-teal-500"
                        onClick={() => { setOpenMenuFileId(null); actions.onComments(file) }}
                        iconPath="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
                      />
                    )}
                    {!folder && (
                      <MenuItem
                        label="Revisions"
                        color="text-amber-500"
                        onClick={() => { setOpenMenuFileId(null); actions.onRevisions(file) }}
                        iconPath="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    )}
                    {!folder && (
                      <MenuItem
                        label="Labels"
                        color="text-pink-500"
                        onClick={() => { setOpenMenuFileId(null); actions.onLabels(file) }}
                        iconPath="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                      />
                    )}
                    {!folder && (
                      <MenuItem
                        label="Update Content"
                        color="text-cyan-500"
                        onClick={() => { setOpenMenuFileId(null); actions.onUpdateContent(file) }}
                        iconPath="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    )}
                    {!folder && file.mimeType.includes('vnd.gridwell-apps') && (
                      <MenuItem
                        label="Export"
                        color="text-emerald-500"
                        onClick={() => { setOpenMenuFileId(null); actions.onExport(file) }}
                        iconPath="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    )}
                    {!folder && (
                      <MenuItem
                        label="Watch File"
                        color="text-violet-500"
                        onClick={() => { setOpenMenuFileId(null); actions.onWatch(file) }}
                        iconPath="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                      />
                    )}

                    <div className="border-t border-gray-200 my-2" />

                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenMenuFileId(null)
                        actions.onTrash(file)
                      }}
                      className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center space-x-3 text-sm text-red-600"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      <span>Move to trash</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); actions.onRestore?.(file) }}
                disabled={restoring === file.id}
                className="p-1.5 bg-white/90 hover:bg-white rounded-full shadow-lg border border-gray-200 w-9 h-9 flex items-center justify-center disabled:opacity-50"
                title="Restore"
              >
                {restoring === file.id ? (
                  <svg className="w-4 h-4 animate-spin text-green-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
              </button>

              <button
                onClick={(e) => { e.stopPropagation(); actions.onDeleteForever?.(file) }}
                className="p-1.5 bg-white/90 hover:bg-white rounded-full shadow-lg border border-gray-200 w-9 h-9 flex items-center justify-center"
                title="Delete forever"
              >
                <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            </>
          )}
        </div>

        {mode === 'drive' && !folder && (
          <button
            onClick={(e) => { e.stopPropagation(); actions.onDownload(file) }}
            disabled={downloading === file.id}
            className="absolute bottom-2 right-2 p-2 rounded-full shadow-lg w-10 h-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
            title="Download"
          >
            {downloading === file.id ? (
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="green" strokeWidth="4" />
                <path className="opacity-75" fill="green" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="green" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            )}
          </button>
        )}
      </div>

      <p className="mt-1.5 md:mt-2 text-xs md:text-sm text-[#202124] font-medium px-1 text-center w-full break-words">
        {file.name}
        <span style={{ display: 'block', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>
          [{file.id}]
        </span>
      </p>
      {!folder && (
        <p
          className="text-[10px] md:text-xs mt-0.5 px-1 text-center w-full break-words"
          style={gridwellApp ? { color: appInfo?.color } : { color: '#5f6368' }}
        >
          {getFileType(file.mimeType)}{file.size ? ` - ${formatFileSize(file.size)}` : ''}
        </p>
      )}
      {labels.length > 0 && (
        <div className="flex flex-wrap justify-center gap-0.5 mt-0.5 px-1">
          {labels.map(label => (
            <span key={label.id} className="text-[9px] px-1 py-0.5 bg-pink-100 text-pink-700 rounded truncate max-w-full">
              {label.id}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

interface MenuItemProps {
  label: string
  color: string
  onClick: () => void
  iconPath: string
}

function MenuItem({ label, color, onClick, iconPath }: MenuItemProps) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center space-x-3 text-sm text-gray-800"
    >
      <svg className={`w-4 h-4 ${color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath} />
      </svg>
      <span>{label}</span>
    </button>
  )
}
