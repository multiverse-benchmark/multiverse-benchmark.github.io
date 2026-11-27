export interface DriveFile {
  id: string
  name: string
  mimeType: string
  createdTime?: string
  modifiedTime?: string
  size?: string | number
  trashed?: boolean
  parents?: string[]
  thumbnailLink?: string
  iconLink?: string
  webViewLink?: string
  driveId?: string
  owners?: Array<string | {
    displayName?: string
    emailAddress?: string
  }>
  lastModifyingUser?: {
    displayName?: string
    emailAddress?: string
  }
  description?: string
  labels?: Array<{
    id: string
    kind?: string
    revisionId?: string
    fields?: Record<string, any>
  }>
  labelInfo?: Array<{
    id: string
    name?: string
  }> | {
    labels?: Array<{
      id: string
      revisionId?: string
      fields?: Record<string, any>
    }>
  }
}

export interface SharedDrive {
  id: string
  name: string
  hidden?: boolean
  createdTime?: string
  restrictions?: Record<string, boolean>
  themeId?: string
}

export interface Breadcrumb {
  id: string | null
  name: string
}
