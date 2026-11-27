import type { DriveFile } from './types'
import { FileCard, type FileCardActions } from './FileCard'

interface FileGridProps {
  files: DriveFile[]
  loading: boolean
  mode: 'drive' | 'trash'
  emptyTitle: string
  emptyDescription: string
  actions: FileCardActions
  canOpenInApp: boolean
  openMenuFileId: string | null
  setOpenMenuFileId: (id: string | null) => void
  downloading: string | null
  restoring?: string | null
}

export function FileGrid({
  files,
  loading,
  mode,
  emptyTitle,
  emptyDescription,
  actions,
  canOpenInApp,
  openMenuFileId,
  setOpenMenuFileId,
  downloading,
  restoring,
}: FileGridProps) {
  if (loading) {
    return (
      <div className="flex flex-wrap gap-3 md:gap-4">
        {Array(8).fill(0).map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="w-20 h-20 md:w-24 md:h-24 bg-gray-200 rounded-xl mx-auto" />
            <div className="w-16 h-3 bg-gray-200 rounded mt-2 mx-auto" />
          </div>
        ))}
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <div className="text-center py-32">
        <div className="w-32 h-32 bg-gray-200 rounded-2xl mx-auto mb-8 flex items-center justify-center">
          <svg className="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2 2z" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-[#202124] mb-2">{emptyTitle}</h3>
        <p className="text-[#5f6368] mb-8 max-w-sm mx-auto">{emptyDescription}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-3 md:gap-4">
      {files.map(file => (
        <FileCard
          key={file.id}
          file={file}
          mode={mode}
          actions={actions}
          canOpenInApp={canOpenInApp}
          openMenuFileId={openMenuFileId}
          setOpenMenuFileId={setOpenMenuFileId}
          downloading={downloading}
          restoring={restoring}
        />
      ))}
    </div>
  )
}
