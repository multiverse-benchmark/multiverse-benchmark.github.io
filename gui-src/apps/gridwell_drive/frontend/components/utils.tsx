import type { DriveFile } from './types'

export const isFolder = (file: DriveFile) => file.mimeType === 'application/vnd.gridwell-apps.folder'

export const isGridwellApp = (file: DriveFile) =>
  file.mimeType === 'application/vnd.gridwell-apps.document' ||
  file.mimeType === 'application/vnd.gridwell-apps.spreadsheet' ||
  file.mimeType === 'application/vnd.gridwell-apps.presentation'

export type GridwellAppInfo = {
  appId: 'gridwell_docs' | 'gridwell_sheets' | 'gridwell_slides'
  appName: string
  color: string
}

export const getGridwellAppInfo = (mimeType: string): GridwellAppInfo | null => {
  switch (mimeType) {
    case 'application/vnd.gridwell-apps.document':
      return { appId: 'gridwell_docs', appName: 'GridwellDocs', color: '#0D9488' }
    case 'application/vnd.gridwell-apps.spreadsheet':
      return { appId: 'gridwell_sheets', appName: 'GridwellSheets', color: '#059669' }
    case 'application/vnd.gridwell-apps.presentation':
      return { appId: 'gridwell_slides', appName: 'GridwellSlides', color: '#F59E0B' }
    default:
      return null
  }
}

export const getOwnerEmail = (owner: string | { displayName?: string; emailAddress?: string }): string => {
  if (typeof owner === 'string') return owner
  return owner.emailAddress || owner.displayName || 'Unknown'
}

export const getFileLabels = (file: DriveFile): Array<{ id: string; fields?: Record<string, any> }> => {
  if (file.labels && Array.isArray(file.labels) && file.labels.length > 0) {
    return file.labels
  }
  if (file.labelInfo) {
    if (Array.isArray(file.labelInfo)) {
      return file.labelInfo
    }
    if (file.labelInfo.labels && Array.isArray(file.labelInfo.labels)) {
      return file.labelInfo.labels
    }
  }
  return []
}

export const formatFileSize = (bytes: string | number | undefined | null) => {
  if (bytes === undefined || bytes === null || bytes === '') return 'Unknown'
  const num = typeof bytes === 'number' ? bytes : parseInt(bytes)
  if (isNaN(num)) return 'Unknown'
  if (num < 1024) return `${num} B`
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`
  if (num < 1024 * 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(1)} MB`
  return `${(num / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export const formatDate = (dateString: string | undefined) => {
  if (!dateString) return 'Unknown'
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export const getFileType = (mimeType: string) => {
  if (mimeType === 'application/vnd.gridwell-apps.folder') return 'Folder'
  if (mimeType === 'application/vnd.gridwell-apps.document') return 'GridwellDocs'
  if (mimeType === 'application/vnd.gridwell-apps.spreadsheet') return 'GridwellSheets'
  if (mimeType === 'application/vnd.gridwell-apps.presentation') return 'GridwellSlides'
  if (mimeType.startsWith('image/')) return 'Image'
  if (mimeType.startsWith('video/')) return 'Video'
  if (mimeType.startsWith('audio/')) return 'Audio'
  if (mimeType === 'application/pdf') return 'PDF'
  if (mimeType.includes('zip')) return 'Archive'
  return 'File'
}

export const GridwellAppIconPath = ({ mimeType }: { mimeType: string }) => {
  if (mimeType === 'application/vnd.gridwell-apps.document')
    return <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20M9,13V15H15V13H9M9,16V18H13V16H9Z" />
  if (mimeType === 'application/vnd.gridwell-apps.spreadsheet')
    return <path d="M19,11H13V5H11V11H5V13H11V19H13V13H19V11M2,2V22H22V2H2M20,20H4V4H20V20Z" />
  if (mimeType === 'application/vnd.gridwell-apps.presentation')
    return <path d="M13,9V3.5L18.5,9M6,2C4.89,2 4,2.89 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2H6M9,14V19H6V14H9M14,13V19H11V13H14M19,12V19H16V12H19Z" />
  return null
}
