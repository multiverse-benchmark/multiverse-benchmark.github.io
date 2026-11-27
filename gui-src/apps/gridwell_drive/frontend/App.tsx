import { useState, useEffect, useCallback, useRef } from 'react'
import { useBackendAPI } from '@shared/hooks/useBackendAPI'
import type { DriveFile, SharedDrive, Breadcrumb } from './components/types'
import {
  isFolder,
  getGridwellAppInfo,
  getFileType,
  formatFileSize,
  formatDate,
  getOwnerEmail,
} from './components/utils'
import { Breadcrumbs } from './components/Breadcrumbs'
import { FileGrid } from './components/FileGrid'
import { type FileCardActions } from './components/FileCard'
import { SharedDrivesGrid } from './components/SharedDrivesGrid'

const APP_NAME = "GridwellDrive";

interface AppProps {
  onClose: () => void
  setRefreshHandler?: (handler: (() => void) | null) => void
  openWindow?: (config: any) => void
}

interface Permission {
  id: string
  role: string
  type: string
  emailAddress?: string
  displayName?: string
}

interface CommentAuthor {
  displayName?: string
  emailAddress?: string
  photoLink?: string
}

interface Reply {
  id: string
  content: string
  htmlContent?: string
  author?: CommentAuthor
  createdTime?: string
  modifiedTime?: string
  deleted?: boolean
}

interface Comment {
  id: string
  fileId: string
  content: string
  htmlContent?: string
  author?: CommentAuthor
  createdTime?: string
  modifiedTime?: string
  resolved?: boolean
  deleted?: boolean
  replies?: Reply[]
}

interface FileRevision {
  id: string
  modifiedTime?: string
  lastModifyingUser?: { displayName?: string; emailAddress?: string }
  originalFilename?: string
  size?: string
  mimeType?: string
}

interface FileLabel {
  id: string
  revisionId?: string
  fields?: Record<string, { text?: string[]; integer?: number[]; selection?: string[]; user?: string[]; dateString?: string[] }>
}

interface Change {
  changeId?: string
  fileId?: string
  file?: DriveFile
  removed?: boolean
  time?: string
  type?: string
  driveId?: string
  drive?: SharedDrive
}

interface AppInfo {
  id: string
  name: string
  installed?: boolean
  primaryMimeTypes?: string[]
  secondaryMimeTypes?: string[]
  primaryFileExtensions?: string[]
  secondaryFileExtensions?: string[]
}

interface AccountInfo {
  user?: { displayName?: string; emailAddress?: string; photoLink?: string }
  storageQuota?: { limit?: string; usage?: string; usageInDrive?: string; usageInDriveTrash?: string }
  maxUploadSize?: string
  appInstalled?: boolean
  importFormats?: Record<string, string[]>
  exportFormats?: Record<string, string[]>
}

export default function GridwellDriveApp({ onClose, setRefreshHandler, openWindow }: AppProps) {
  const api = useBackendAPI('gridwell_drive')
  const apiRef = useRef(api)
  apiRef.current = api

  const [files, setFiles] = useState<DriveFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newFolderModal, setNewFolderModal] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{ id: string, name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [currentView, setCurrentView] = useState<'drive' | 'trash' | 'shared_drives' | 'changes' | 'account' | 'apps'>('drive')
  const [trashFiles, setTrashFiles] = useState<DriveFile[]>([])
  const [emptyingTrash, setEmptyingTrash] = useState(false)
  const [moveToTrashConfirm, setMoveToTrashConfirm] = useState<{ id: string, name: string } | null>(null)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [renameModal, setRenameModal] = useState<{ id: string, name: string } | null>(null)
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([{ id: null, name: 'My Drive' }])
  const [fileInfoModal, setFileInfoModal] = useState<DriveFile | null>(null)
  const [loadingFileInfo, setLoadingFileInfo] = useState(false)
  const [detailedFileInfo, setDetailedFileInfo] = useState<DriveFile | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [fileTypeFilter, setFileTypeFilter] = useState<string>('all')
  const [ownerFilter, setOwnerFilter] = useState<string>('all')
  const [allFiles, setAllFiles] = useState<DriveFile[]>([])
  const [showFilters, setShowFilters] = useState(false)

  const [showNewMenu, setShowNewMenu] = useState(false)
  const [newFileModal, setNewFileModal] = useState<string | null>(null)
  const [newFileName, setNewFileName] = useState('')
  const [creatingFile, setCreatingFile] = useState(false)

  const [downloading, setDownloading] = useState<string | null>(null)

  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [copyModal, setCopyModal] = useState<DriveFile | null>(null)
  const [copyName, setCopyName] = useState('')
  const [copying, setCopying] = useState(false)

  const [moveModal, setMoveModal] = useState<DriveFile | null>(null)
  const [moveToFolderId, setMoveToFolderId] = useState<string | undefined>(undefined)
  const [moving, setMoving] = useState(false)

  const [openMenuFileId, setOpenMenuFileId] = useState<string | null>(null)

  const [shareModal, setShareModal] = useState<DriveFile | null>(null)
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loadingPermissions, setLoadingPermissions] = useState(false)
  const [newPermissionEmail, setNewPermissionEmail] = useState('')
  const [newPermissionRole, setNewPermissionRole] = useState('reader')
  const [creatingPermission, setCreatingPermission] = useState(false)
  const [deletingPermissionId, setDeletingPermissionId] = useState<string | null>(null)
  const [updatingPermissionId, setUpdatingPermissionId] = useState<string | null>(null)

  const [commentsModal, setCommentsModal] = useState<DriveFile | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [loadingComments, setLoadingComments] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [creatingComment, setCreatingComment] = useState(false)
  const [replyTexts, setReplyTexts] = useState<{[commentId: string]: string}>({})
  const [creatingReplyId, setCreatingReplyId] = useState<string | null>(null)
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null)
  const [deletingReplyId, setDeletingReplyId] = useState<string | null>(null)
  const [expandedComments, setExpandedComments] = useState<{[commentId: string]: boolean}>({})

  // Shared Drives state
  const [sharedDrives, setSharedDrives] = useState<SharedDrive[]>([])
  const [loadingSharedDrives, setLoadingSharedDrives] = useState(false)
  const [newSharedDriveModal, setNewSharedDriveModal] = useState(false)
  const [sharedDriveName, setSharedDriveName] = useState('')
  const [creatingSharedDrive, setCreatingSharedDrive] = useState(false)
  const [editSharedDriveModal, setEditSharedDriveModal] = useState<SharedDrive | null>(null)
  const [editSharedDriveName, setEditSharedDriveName] = useState('')
  const [updatingSharedDrive, setUpdatingSharedDrive] = useState(false)
  const [deletingSharedDriveId, setDeletingSharedDriveId] = useState<string | null>(null)
  const [hidingSharedDriveId, setHidingSharedDriveId] = useState<string | null>(null)
  const [selectedSharedDrive, setSelectedSharedDrive] = useState<SharedDrive | null>(null)
  const [sharedDriveFiles, setSharedDriveFiles] = useState<DriveFile[]>([])
  const [loadingSharedDriveFiles, setLoadingSharedDriveFiles] = useState(false)
  const [sharedDriveFolderId, setSharedDriveFolderId] = useState<string | null>(null)
  const [sharedDriveBreadcrumbs, setSharedDriveBreadcrumbs] = useState<Breadcrumb[]>([])

  // Revisions state
  const [revisionsModal, setRevisionsModal] = useState<DriveFile | null>(null)
  const [revisions, setRevisions] = useState<FileRevision[]>([])
  const [loadingRevisions, setLoadingRevisions] = useState(false)
  const [newRevisionContent, setNewRevisionContent] = useState('')
  const [creatingRevision, setCreatingRevision] = useState(false)
  const [updateContentModal, setUpdateContentModal] = useState<DriveFile | null>(null)
  const [updateContentText, setUpdateContentText] = useState('')
  const [updatingContent, setUpdatingContent] = useState(false)

  // Labels state
  const [labelsModal, setLabelsModal] = useState<DriveFile | null>(null)
  const [fileLabels, setFileLabels] = useState<FileLabel[]>([])
  const [loadingLabels, setLoadingLabels] = useState(false)
  const [modifyLabelId, setModifyLabelId] = useState('')
  const [modifyLabelFieldId, setModifyLabelFieldId] = useState('')
  const [modifyLabelValue, setModifyLabelValue] = useState('')
  const [modifyingLabels, setModifyingLabels] = useState(false)

  // Comment reply editing state
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null)
  const [editReplyText, setEditReplyText] = useState('')
  const [updatingReplyId, setUpdatingReplyId] = useState<string | null>(null)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editCommentText, setEditCommentText] = useState('')
  const [updatingCommentId, setUpdatingCommentId] = useState<string | null>(null)

  // Changes state
  const [changes, setChanges] = useState<Change[]>([])
  const [loadingChanges, setLoadingChanges] = useState(false)
  const [changesPageToken, setChangesPageToken] = useState<string | null>(null)
  const [watchChannelId, setWatchChannelId] = useState('')
  const [watchResourceId, setWatchResourceId] = useState('')

  // Account info state
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null)
  const [loadingAccountInfo, setLoadingAccountInfo] = useState(false)

  // Apps state
  const [installedApps, setInstalledApps] = useState<AppInfo[]>([])
  const [loadingApps, setLoadingApps] = useState(false)

  // Export modal
  const [exportModal, setExportModal] = useState<DriveFile | null>(null)
  const [exportMimeType, setExportMimeType] = useState('application/pdf')
  const [exporting, setExporting] = useState(false)

  // Generate IDs
  const [generatedIds, setGeneratedIds] = useState<string[]>([])
  const [generatingIds, setGeneratingIds] = useState(false)

  const loadFilesRef = useRef<(() => Promise<void>) | null>(null)

  const enrichFilesWithLabels = async (fileList: DriveFile[], setter: React.Dispatch<React.SetStateAction<DriveFile[]>>) => {
    try {
      const labelPromises = fileList
        .filter(f => f.mimeType !== 'application/vnd.gridwell-apps.folder')
        .map(async (file) => {
          try {
            const result = await apiRef.current.callTool('list_file_labels', { fileId: file.id })
            const labels = result.labels || []
            return { id: file.id, labels }
          } catch {
            return { id: file.id, labels: [] }
          }
        })
      const labelResults = await Promise.all(labelPromises)
      const labelMap = new Map<string, any[]>()
      for (const r of labelResults) {
        if (r.labels.length > 0) {
          labelMap.set(r.id, r.labels)
        }
      }
      // Fallback: fetch labels from state API (central labels store)
      if (labelMap.size === 0) {
        try {
          const stateRes = await fetch('./api/services/gridwell_drive/state')
          if (stateRes.ok) {
            const stateWrapper = await stateRes.json()
            const userLabels = stateWrapper?.state?.users?.me?.labels || stateWrapper?.users?.me?.labels || {}
            for (const [labelKey, labelData] of Object.entries(userLabels)) {
              const lbl = labelData as any
              const fileId = lbl?.fileId
              if (fileId && fileList.some(f => f.id === fileId)) {
                const existing = labelMap.get(fileId) || []
                existing.push({ id: lbl.id || labelKey, kind: lbl.kind || 'drive#label', revisionId: lbl.revisionId || '', fields: lbl.fields || {} })
                labelMap.set(fileId, existing)
              }
            }
          }
        } catch {
          // Silently fail - state API fallback is non-critical
        }
      }

      if (labelMap.size > 0) {
        setter(prev => prev.map(f => {
          const labels = labelMap.get(f.id)
          return labels ? { ...f, labels } : f
        }))
      }
    } catch {
      // Silently fail - labels are non-critical
    }
  }

  const loadFiles = useCallback(async () => {
    setLoading(true)
    try {
      setError(null)
      let query = currentView === 'drive' ? "trashed = false" : "trashed = true"

      if (currentView === 'drive' && currentFolderId) {
        query += ` and '${currentFolderId}' in parents`
      }

      if (searchQuery.trim()) {
        query += ` and name contains '${searchQuery.trim()}'`
      }

      if (fileTypeFilter !== 'all') {
        if (fileTypeFilter === 'folder') {
          query += ` and mimeType = 'application/vnd.gridwell-apps.folder'`
        } else if (fileTypeFilter === 'document') {
          query += ` and mimeType = 'application/vnd.gridwell-apps.document'`
        } else if (fileTypeFilter === 'spreadsheet') {
          query += ` and mimeType = 'application/vnd.gridwell-apps.spreadsheet'`
        } else if (fileTypeFilter === 'presentation') {
          query += ` and mimeType = 'application/vnd.gridwell-apps.presentation'`
        } else if (fileTypeFilter === 'pdf') {
          query += ` and mimeType = 'application/pdf'`
        } else if (fileTypeFilter === 'image') {
          query += ` and mimeType contains 'image'`
        } else if (fileTypeFilter === 'video') {
          query += ` and mimeType contains 'video'`
        }
      }

      const params: any = {
        pageSize: 1000,
        q: query,
        fields: "files(kind, id, name, mimeType, createdTime, modifiedTime, trashed, starred, parents, owners, size, description, labelInfo, driveId)"
      }
      // Include shared drive files in trash view
      if (currentView === 'trash') {
        params.includeItemsFromAllDrives = true
        params.supportsAllDrives = true
        params.corpora = 'allDrives'
      }

      const result = await apiRef.current.callTool('list_user_files', params)
      let fileList = Array.isArray(result.files) ? result.files : []

      // At root: show files without parents (root-level files)
      if (currentView === 'drive' && !currentFolderId) {
        fileList = fileList.filter(file => !file.parents || file.parents.length === 0)
      }

      if (ownerFilter !== 'all') {
        fileList = fileList.filter(file =>
          file.owners && file.owners.length > 0 && getOwnerEmail(file.owners[0]) === ownerFilter
        )
      }

      if (currentView === 'drive') {
        setFiles(fileList)
        setAllFiles(fileList)
        // Enrich files with labels
        enrichFilesWithLabels(fileList, setFiles)
      } else {
        setTrashFiles(fileList)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load files'
      console.error('Failed to load files', err)
      setError(msg)
      if (currentView === 'drive') {
        setFiles([])
      } else {
        setTrashFiles([])
      }
    } finally {
      setLoading(false)
    }
  }, [currentView, currentFolderId, searchQuery, fileTypeFilter, ownerFilter])

  loadFilesRef.current = loadFiles

  const refreshApp = useCallback(async () => {
    if (loadFilesRef.current) await loadFilesRef.current()
  }, [])

  const setRefreshHandlerRef = useRef(setRefreshHandler)
  setRefreshHandlerRef.current = setRefreshHandler

  useEffect(() => {
    loadFiles()
  }, [loadFiles])

  useEffect(() => {
    const handler = setRefreshHandlerRef.current
    if (handler) {
      handler(refreshApp)
    }
    return () => {
      const cleanup = setRefreshHandlerRef.current
      if (cleanup) cleanup(null)
    }
  }, [refreshApp])

  // Views are loaded by their sidebar button onClick handlers directly

  const getUniqueOwners = () => {
    const owners = new Set<string>()
    allFiles.forEach(file => {
      if (file.owners && file.owners.length > 0) {
        const email = getOwnerEmail(file.owners[0])
        if (email && email !== 'Unknown') owners.add(email)
      }
    })
    return Array.from(owners)
  }

  const clearFilters = () => {
    setSearchQuery('')
    setFileTypeFilter('all')
    setOwnerFilter('all')
  }

  const openFileInfo = async (file: DriveFile) => {
    setFileInfoModal(file)
    setLoadingFileInfo(true)
    try {
      const result = await apiRef.current.callTool('get_file_metadata_or_content', {
        fileId: file.id,
      })
      setDetailedFileInfo(result)
    } catch (err) {
      console.error('Failed to load file info', err)
      setDetailedFileInfo(file)
    } finally {
      setLoadingFileInfo(false)
    }
  }

  const navigateToFolder = (folder: DriveFile) => {
    setCurrentFolderId(folder.id)
    setBreadcrumbs(prev => [...prev, { id: folder.id, name: folder.name }])
  }

  const navigateToBreadcrumb = (index: number) => {
    const targetBreadcrumb = breadcrumbs[index]
    setCurrentFolderId(targetBreadcrumb.id)
    setBreadcrumbs(prev => prev.slice(0, index + 1))
  }

  const createFolder = async () => {
    if (!folderName.trim()) return
    try {
      const body: any = {
        name: folderName.trim(),
        mimeType: 'application/vnd.gridwell-apps.folder'
      }
      if (currentFolderId) {
        body.parents = [currentFolderId]
      }
      await apiRef.current.callTool('create_file_or_folder', { body })
      setNewFolderModal(false)
      setFolderName('')
      await loadFiles()
    } catch (err: any) {
      console.error('Create folder failed', err)
    }
  }

  const createFile = async () => {
    if (!newFileName.trim() || !newFileModal) return
    setCreatingFile(true)
    try {
      let mimeType
      if (newFileModal === 'doc') {
        mimeType = 'application/vnd.gridwell-apps.document'
      } else if (newFileModal === 'sheet') {
        mimeType = 'application/vnd.gridwell-apps.spreadsheet'
      } else if (newFileModal === 'slides') {
        mimeType = 'application/vnd.gridwell-apps.presentation'
      }

      const body: any = {
        name: newFileName.trim(),
        mimeType: mimeType
      }
      if (currentFolderId) {
        body.parents = [currentFolderId]
      }

      await apiRef.current.callTool('create_file_or_folder', { body })
      setNewFileModal(null)
      setNewFileName('')
      await loadFiles()
    } catch (err: any) {
      console.error('Create file failed', err)
    } finally {
      setCreatingFile(false)
    }
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files
    if (!selectedFiles || selectedFiles.length === 0) return

    setUploading(true)
    const totalFiles = selectedFiles.length

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i]
        setUploadProgress(`Uploading ${i + 1} of ${totalFiles}: ${file.name}`)

        const fileContent = await readFileAsBase64(file)

        const body: any = {
          name: file.name,
          mimeType: file.type || 'application/octet-stream'
        }

        if (currentFolderId) {
          body.parents = [currentFolderId]
        }

        const media_body = {
          mimeType: file.type || 'application/octet-stream',
        }

        const uploadedFile = await apiRef.current.callTool('create_file_or_folder', {
          body,
          media_body
        })

        setFiles(prev => [uploadedFile, ...prev])
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }

      setUploadProgress('')
    } catch (err: any) {
      console.error('Upload failed', err)
      alert('Failed to upload file(s): ' + (err.message || 'Unknown error'))
    } finally {
      setUploading(false)
      setUploadProgress('')
    }
  }

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          const base64 = reader.result.split(',')[1]
          resolve(base64)
        } else {
          reject(new Error('Failed to read file as base64'))
        }
      }
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
  }

  const downloadFile = async (file: DriveFile) => {
    setDownloading(file.id)
    try {
      const isGridwellWorkspaceFile = file.mimeType.includes('vnd.gridwell-apps')
      let content: any
      let fileName = file.name

      if (isGridwellWorkspaceFile) {
        let exportMimeType = 'application/pdf'
        let extension = '.pdf'

        if (file.mimeType.includes('document')) {
          exportMimeType = 'application/pdf'
          extension = '.pdf'
        } else if (file.mimeType.includes('spreadsheet')) {
          exportMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          extension = '.xlsx'
        } else if (file.mimeType.includes('presentation')) {
          exportMimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
          extension = '.pptx'
        }

        if (!fileName.endsWith(extension)) {
          fileName += extension
        }

        content = await apiRef.current.callTool('export_file_content', {
          file_id: file.id,
          target_mime: exportMimeType
        })
      } else {
        content = await apiRef.current.callTool('get_file_content', {
          file_id: file.id
        })
      }

      let blob: Blob
      if (typeof content === 'string') {
        try {
          const binaryString = atob(content)
          const bytes = new Uint8Array(binaryString.length)
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i)
          }
          blob = new Blob([bytes])
        } catch {
          blob = new Blob([content])
        }
      } else {
        blob = new Blob([content])
      }

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: any) {
      console.error('Download failed', err)
      alert('Failed to download file: ' + (err.message || 'Unknown error'))
    } finally {
      setDownloading(null)
    }
  }

  const confirmMoveToTrash = (file: DriveFile) => {
    setMoveToTrashConfirm({ id: file.id, name: file.name })
  }

  const moveToTrash = async () => {
    if (!moveToTrashConfirm) return
    try {
      const body = { trashed: true }
      const params: any = {
        fileId: moveToTrashConfirm.id,
        body
      }
      await apiRef.current.callTool('update_file_metadata_or_content', params)
      setMoveToTrashConfirm(null)
      // Update the shared drive files list immediately
      if (selectedSharedDrive) {
        setSharedDriveFiles(prev => prev.filter(f => f.id !== moveToTrashConfirm.id))
      }
      await loadFiles()
    } catch (err: any) {
      console.error('Move to trash failed', err)
    }
  }

  const restoreFromTrash = async (file: DriveFile) => {
    setRestoring(file.id)
    try {
      const body = { trashed: false }
      await apiRef.current.callTool('update_file_metadata_or_content', {
        fileId: file.id,
        body
      })
      await loadFiles()
    } catch (err: any) {
      console.error('Restore failed', err)
    } finally {
      setRestoring(null)
    }
  }

  const openRenameModal = (file: DriveFile) => {
    setRenameModal({ id: file.id, name: file.name })
    setNewName(file.name)
  }

  const renameFile = async () => {
    if (!renameModal || !newName.trim()) return
    setRenaming(true)
    try {
      const body = { name: newName.trim() }
      const params: any = {
        fileId: renameModal.id,
        body
      }
      await apiRef.current.callTool('update_file_metadata_or_content', params)
      if (currentView === 'shared_drives') {
        setSharedDriveFiles(prev => prev.map(f => f.id === renameModal.id ? { ...f, name: newName.trim() } : f))
      } else if (currentView === 'drive') {
        setFiles(prev => prev.map(f => f.id === renameModal.id ? { ...f, name: newName.trim() } : f))
      } else {
        setTrashFiles(prev => prev.map(f => f.id === renameModal.id ? { ...f, name: newName.trim() } : f))
      }
      setRenameModal(null)
      setNewName('')
    } catch (err: any) {
      console.error('Rename failed', err)
    } finally {
      setRenaming(false)
    }
  }

  const openCopyModal = (file: DriveFile) => {
    setCopyModal(file)
    setCopyName(`Copy of ${file.name}`)
  }

  const handleCopyFile = async () => {
    if (!copyModal) return

    setCopying(true)
    try {
      await apiRef.current.callTool('copy_file', {
        fileId: copyModal.id,
        body: {
          name: copyName.trim() || `Copy of ${copyModal.name}`,
          parents: currentFolderId ? [currentFolderId] : undefined
        }
      })

      setCopyModal(null)
      setCopyName('')
      await loadFiles()
    } catch (err: any) {
      console.error('Failed to copy file:', err)

      // Refresh file list anyway - the copy might have succeeded despite the error
      await loadFiles()

      // Check if this is a validation error (copy succeeded but response validation failed)
      // This happens with GridwellDocs/Sheets/Slides files due to backend validation issues
      const errorMessage = err?.message || String(err)
      if (errorMessage.includes('ValidationError') || errorMessage.includes('validation error')) {
        // Backend validation issue - copy actually succeeded, just close modal
        console.log('Copy succeeded despite validation error')
        setCopyModal(null)
        setCopyName('')
      } else {
        // Real error - show alert
        alert('Failed to copy file')
      }
    } finally {
      setCopying(false)
    }
  }

  const openMoveModal = (file: DriveFile) => {
    setMoveModal(file)
    setMoveToFolderId(undefined)
  }

  const handleMoveFile = async () => {
    if (!moveModal || moveToFolderId === undefined) return

    setMoving(true)
    try {
      // Get current parent folders to remove them
      const currentParents = moveModal.parents || []

      const params: any = {
        fileId: moveModal.id,
        body: {},
        addParents: moveToFolderId || 'root'
      }

      // Only add removeParents if there are parents to remove
      if (currentParents.length > 0) {
        params.removeParents = currentParents.join(',')
      }

      await apiRef.current.callTool('update_file_metadata_or_content', params)

      setMoveModal(null)
      setMoveToFolderId(undefined)
      await loadFiles()
    } catch (err: any) {
      console.error('Failed to move file:', err)
      alert('Failed to move file')
    } finally {
      setMoving(false)
    }
  }

  const openShareModal = async (file: DriveFile) => {
    setShareModal(file)
    setPermissions([])
    setNewPermissionEmail('')
    setNewPermissionRole('reader')
    await loadPermissions(file.id)
  }

  const loadPermissions = async (fileId: string) => {
    setLoadingPermissions(true)
    try {
      const params: any = { fileId }
      if (selectedSharedDrive) params.supportsAllDrives = true
      const result = await apiRef.current.callTool('list_permissions', params)
      const permList = result.permissions || result.items || (Array.isArray(result) ? result : [])
      setPermissions(Array.isArray(permList) ? permList : [])
    } catch (err: any) {
      console.error('Failed to load permissions:', err)
      setPermissions([])
    } finally {
      setLoadingPermissions(false)
    }
  }

  const handleCreatePermission = async () => {
    if (!shareModal || !newPermissionEmail.trim()) return

    // Check for duplicate email in existing permissions (also check owners fallback for null emailAddress)
    const emailToAdd = newPermissionEmail.trim().toLowerCase()
    const existingPermission = permissions.find(p => {
      let permEmail = p.emailAddress?.toLowerCase()
      if (!permEmail && p.role === 'owner' && shareModal.owners?.length > 0) {
        const owner = shareModal.owners[0]
        permEmail = (typeof owner === 'string' ? owner : owner.emailAddress)?.toLowerCase()
      }
      return permEmail === emailToAdd
    })
    if (existingPermission) {
      alert(`User "${newPermissionEmail.trim()}" already has access with role "${existingPermission.role}".`)
      return
    }

    setCreatingPermission(true)
    try {
      const body: any = {
        type: 'user',
        role: newPermissionRole,
        emailAddress: newPermissionEmail.trim()
      }
      const createParams: any = { fileId: shareModal.id, body }
      await apiRef.current.callTool('create_permission', createParams)

      setNewPermissionEmail('')
      setNewPermissionRole('reader')
      await loadPermissions(shareModal.id)
    } catch (err: any) {
      console.error('Failed to create permission:', err)
      alert('Failed to add user')
    } finally {
      setCreatingPermission(false)
    }
  }

  const handleUpdatePermission = async (permissionId: string, newRole: string) => {
    if (!shareModal) return

    setUpdatingPermissionId(permissionId)
    try {
      const params: any = { fileId: shareModal.id, permissionId, body: { role: newRole } }
      await apiRef.current.callTool('update_permission', params)

      await loadPermissions(shareModal.id)
    } catch (err: any) {
      console.error('Failed to update permission:', err)
      alert('Failed to update permission')
    } finally {
      setUpdatingPermissionId(null)
    }
  }

  const handleDeletePermission = async (permissionId: string) => {
    if (!shareModal) return

    if (!confirm('Are you sure you want to remove this user?')) return

    setDeletingPermissionId(permissionId)
    try {
      const params: any = { fileId: shareModal.id, permissionId }
      if (selectedSharedDrive) params.supportsAllDrives = true
      await apiRef.current.callTool('delete_permission', params)

      await loadPermissions(shareModal.id)
    } catch (err: any) {
      console.error('Failed to delete permission:', err)
      alert('Failed to remove user')
    } finally {
      setDeletingPermissionId(null)
    }
  }

  const openCommentsModal = async (file: DriveFile) => {
    setCommentsModal(file)
    setComments([])
    setNewComment('')
    setReplyTexts({})
    setExpandedComments({})
    await loadComments(file.id)
  }

  const loadComments = async (fileId: string) => {
    setLoadingComments(true)
    try {
      const result = await apiRef.current.callTool('list_comments', { fileId })
      setComments(result.comments || [])
    } catch (err: any) {
      console.error('Failed to load comments:', err)
      setComments([])
    } finally {
      setLoadingComments(false)
    }
  }

  const handleCreateComment = async () => {
    if (!commentsModal || !newComment.trim()) return

    setCreatingComment(true)
    try {
      await apiRef.current.callTool('create_file_comment', {
        fileId: commentsModal.id,
        content: newComment.trim()
      })

      setNewComment('')
      await loadComments(commentsModal.id)
    } catch (err: any) {
      console.error('Failed to create comment:', err)
      alert('Failed to add comment')
    } finally {
      setCreatingComment(false)
    }
  }

  const handleCreateReply = async (commentId: string) => {
    if (!commentsModal || !replyTexts[commentId]?.trim()) return

    setCreatingReplyId(commentId)
    try {
      await apiRef.current.callTool('create_comment_reply', {
        fileId: commentsModal.id,
        commentId,
        body: { content: replyTexts[commentId].trim() }
      })

      setReplyTexts(prev => ({ ...prev, [commentId]: '' }))
      await loadComments(commentsModal.id)
    } catch (err: any) {
      console.error('Failed to create reply:', err)
      alert('Failed to add reply')
    } finally {
      setCreatingReplyId(null)
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    if (!commentsModal) return

    if (!confirm('Are you sure you want to delete this comment?')) return

    setDeletingCommentId(commentId)
    try {
      await apiRef.current.callTool('delete_file_comment', {
        fileId: commentsModal.id,
        commentId
      })

      await loadComments(commentsModal.id)
    } catch (err: any) {
      console.error('Failed to delete comment:', err)
      alert('Failed to delete comment')
    } finally {
      setDeletingCommentId(null)
    }
  }

  const handleDeleteReply = async (commentId: string, replyId: string) => {
    if (!commentsModal) return

    if (!confirm('Are you sure you want to delete this reply?')) return

    setDeletingReplyId(replyId)
    try {
      await apiRef.current.callTool('delete_comment_reply', {
        fileId: commentsModal.id,
        commentId,
        replyId
      })

      await loadComments(commentsModal.id)
    } catch (err: any) {
      console.error('Failed to delete reply:', err)
      alert('Failed to delete reply')
    } finally {
      setDeletingReplyId(null)
    }
  }

  const toggleCommentExpand = (commentId: string) => {
    setExpandedComments(prev => ({
      ...prev,
      [commentId]: !prev[commentId]
    }))
  }

  const formatCommentTime = (timeString?: string) => {
    if (!timeString) return ''
    const date = new Date(timeString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const emptyTrash = async () => {
    setEmptyingTrash(true)
    try {
      await apiRef.current.callTool('empty_files_from_trash', {})
      // Reload trash files from backend instead of optimistically clearing
      // This ensures we only remove files the backend actually deleted
      await loadFiles()
    } catch (err: any) {
      console.error('Empty trash failed', err)
    } finally {
      setEmptyingTrash(false)
    }
  }

  const deletePermanently = async () => {
    if (!deleteConfirmModal) return
    setDeleting(true)
    try {
      await apiRef.current.callTool('delete_file_permanently', {
        fileId: deleteConfirmModal.id,
        supportsAllDrives: true
      })
      if (currentView === 'trash') {
        setTrashFiles(prev => prev.filter(f => f.id !== deleteConfirmModal.id))
      } else if (currentView === 'shared_drives') {
        setSharedDriveFiles(prev => prev.filter(f => f.id !== deleteConfirmModal.id))
      } else {
        setFiles(prev => prev.filter(f => f.id !== deleteConfirmModal.id))
      }
      setDeleteConfirmModal(null)
    } catch (err: any) {
      console.error('Delete failed', err)
      alert('Failed to delete: ' + (err?.message || 'Unknown error'))
    } finally {
      setDeleting(false)
    }
  }

  const appImporters: Record<string, () => Promise<{ default: React.ComponentType<any> }>> = {
    'gridwell_docs': () => import('../../gridwell_docs/frontend/App.tsx'),
    'gridwell_sheets': () => import('../../gridwell_sheets/frontend/App.tsx'),
    'gridwell_slides': () => import('../../gridwell_slides/frontend/App.tsx'),
  }

  const openFileInApp = async (file: DriveFile) => {
    if (!openWindow) return
    const appInfo = getGridwellAppInfo(file.mimeType)
    if (!appInfo) return

    try {
      const mod = await appImporters[appInfo.appId]()
      const AppComponent = mod.default
      openWindow({
        id: `${appInfo.appId}-from-drive-${file.id}`,
        title: `${file.name} - ${appInfo.appName}`,
        content: <AppComponent onClose={() => {}} initialFileId={file.id} />,
        width: appInfo.appId === 'gridwell_slides' ? 1200 : 1100,
        height: appInfo.appId === 'gridwell_slides' ? 800 : appInfo.appId === 'gridwell_sheets' ? 700 : 750,
      })
    } catch (err) {
      console.error(`Failed to open ${appInfo.appName}:`, err)
    }
  }

  const getOwnerDisplay = (owner: string | { displayName?: string; emailAddress?: string }): string => {
    if (typeof owner === 'string') return owner
    return owner.displayName || owner.emailAddress || 'Unknown'
  }

  const getFileTypeInfo = (type: string) => {
    switch(type) {
      case 'doc':
        return {
          name: 'GridwellDocs',
          icon: <svg className="w-16 h-16 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20M9,13V15H15V13H9M9,16V18H13V16H9Z" /></svg>,
          bgColor: 'bg-[#0D9488]'
        }
      case 'sheet':
        return {
          name: 'GridwellSheets',
          icon: <svg className="w-16 h-16 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M19,11H15V15H19M19,3A2,2 0 0,1 21,5V19A2,2 0 0,1 19,21H5C3.89,21 3,20.1 3,19V5C3,3.89 3.89,3 5,3H19M19,5H5V19H19V5M13,11H9V15H13V11M19,17H15V21H19V17M13,17H9V21H13V17Z" /></svg>,
          bgColor: 'bg-[#059669]'
        }
      case 'slides':
        return {
          name: 'GridwellSlides',
          icon: <svg className="w-16 h-16 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M13,9H18.5L13,3.5V9M6,2H14L20,8V20A2,2 0 0,1 18,22H6C4.89,22 4,21.1 4,20V4C4,2.89 4.89,2 6,2M15,18V16H6V18H15M18,14V12H6V14H18Z" /></svg>,
          bgColor: 'bg-[#F59E0B]'
        }
      default:
        return {
          name: 'File',
          icon: null,
          bgColor: 'bg-gray-500'
        }
    }
  }

  // === Shared Drives handlers ===
  const loadSharedDrives = async () => {
    setLoadingSharedDrives(true)
    try {
      const result = await apiRef.current.callTool('list_user_shared_drives', { pageSize: 100 })
      setSharedDrives(result.drives || [])
    } catch (err) {
      console.error('Failed to load shared drives', err)
      setSharedDrives([])
    } finally {
      setLoadingSharedDrives(false)
    }
  }

  const handleCreateSharedDrive = async () => {
    if (!sharedDriveName.trim()) return
    setCreatingSharedDrive(true)
    try {
      await apiRef.current.callTool('create_shared_drive', {
        requestId: `req_${Date.now()}`,
        body: { name: sharedDriveName.trim() }
      })
      setSharedDriveName('')
      setNewSharedDriveModal(false)
      await loadSharedDrives()
    } catch (err) {
      console.error('Failed to create shared drive', err)
      alert('Failed to create shared drive')
    } finally {
      setCreatingSharedDrive(false)
    }
  }

  const handleDeleteSharedDrive = async (driveId: string, driveName?: string) => {
    if (!confirm('Delete this shared drive permanently?')) return
    setDeletingSharedDriveId(driveId)
    try {
      await apiRef.current.callTool('delete_shared_drive', { driveId })
      if (selectedSharedDrive?.id === driveId) {
        leaveSharedDrive()
      }
      await loadSharedDrives()
    } catch (err: any) {
      console.error('Failed to delete shared drive', err)
      const errMsg = err?.message || ''
      if (errMsg.includes('permission') || errMsg.includes('organizer') || errMsg.includes('PermissionDenied')) {
        alert(`You don't have permission to delete "${driveName || driveId}". Only the drive owner or an organizer can delete a shared drive.`)
      } else {
        alert('Failed to delete shared drive: ' + (errMsg || 'Unknown error'))
      }
    } finally {
      setDeletingSharedDriveId(null)
    }
  }

  const handleUpdateSharedDrive = async () => {
    if (!editSharedDriveModal || !editSharedDriveName.trim()) return
    setUpdatingSharedDrive(true)
    try {
      await apiRef.current.callTool('update_shared_drive_metadata', {
        driveId: editSharedDriveModal.id,
        body: { name: editSharedDriveName.trim() }
      })
      setEditSharedDriveModal(null)
      await loadSharedDrives()
    } catch (err) {
      console.error('Failed to update shared drive', err)
      alert('Failed to update shared drive')
    } finally {
      setUpdatingSharedDrive(false)
    }
  }

  const handleToggleHideSharedDrive = async (drive: SharedDrive) => {
    setHidingSharedDriveId(drive.id)
    try {
      if (drive.hidden) {
        await apiRef.current.callTool('unhide_shared_drive', { driveId: drive.id })
      } else {
        await apiRef.current.callTool('hide_shared_drive', { driveId: drive.id, body: {} })
      }
      await loadSharedDrives()
    } catch (err) {
      console.error('Failed to toggle hide shared drive', err)
    } finally {
      setHidingSharedDriveId(null)
    }
  }

  const loadSharedDriveFiles = async (drive: SharedDrive, folderId: string | null = null) => {
    setSelectedSharedDrive(drive)
    setSharedDriveFolderId(folderId)
    setLoadingSharedDriveFiles(true)
    try {
      // At the drive root, files have the drive id as parent; inside a folder, files have that folder id as parent.
      const parentId = folderId || drive.id
      const result = await apiRef.current.callTool('list_user_files', {
        corpora: 'drive',
        driveId: drive.id,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        pageSize: 100,
        q: `trashed = false and '${parentId}' in parents`,
        fields: "files(kind, id, name, mimeType, createdTime, modifiedTime, trashed, starred, parents, owners, size, description, labelInfo, driveId)"
      })
      const fileList = Array.isArray(result.files) ? result.files : []
      setSharedDriveFiles(fileList)
      enrichFilesWithLabels(fileList, setSharedDriveFiles)
    } catch (err) {
      console.error('Failed to load shared drive files', err)
      setSharedDriveFiles([])
    } finally {
      setLoadingSharedDriveFiles(false)
    }
  }

  const openSharedDrive = (drive: SharedDrive) => {
    setSharedDriveBreadcrumbs([{ id: null, name: drive.name }])
    loadSharedDriveFiles(drive, null)
  }

  const navigateSharedDriveFolder = (folder: DriveFile) => {
    if (!selectedSharedDrive) return
    setSharedDriveBreadcrumbs(prev => [...prev, { id: folder.id, name: folder.name }])
    loadSharedDriveFiles(selectedSharedDrive, folder.id)
  }

  const navigateSharedDriveBreadcrumb = (index: number) => {
    if (!selectedSharedDrive) return
    const target = sharedDriveBreadcrumbs[index]
    setSharedDriveBreadcrumbs(prev => prev.slice(0, index + 1))
    loadSharedDriveFiles(selectedSharedDrive, target.id)
  }

  const leaveSharedDrive = () => {
    setSelectedSharedDrive(null)
    setSharedDriveFiles([])
    setSharedDriveFolderId(null)
    setSharedDriveBreadcrumbs([])
  }

  // === Revisions handlers ===
  const openRevisionsModal = async (file: DriveFile) => {
    setRevisionsModal(file)
    setRevisions([])
    setNewRevisionContent('')
    setLoadingRevisions(true)
    try {
      const result = await apiRef.current.callTool('list_file_revisions', { file_id: file.id, user_id: 'me' })
      const revList = result.revisions || result.items || (Array.isArray(result) ? result : [])
      setRevisions(Array.isArray(revList) ? revList : [])
    } catch (err) {
      console.error('Failed to load revisions', err)
    } finally {
      setLoadingRevisions(false)
    }
  }

  const handleCreateRevision = async () => {
    if (!revisionsModal || !newRevisionContent.trim()) return
    setCreatingRevision(true)
    try {
      await apiRef.current.callTool('create_file_revision', {
        file_id: revisionsModal.id,
        content: newRevisionContent.trim(),
        user_id: 'me'
      })
      setNewRevisionContent('')
      const result = await apiRef.current.callTool('list_file_revisions', { file_id: revisionsModal.id, user_id: 'me' })
      const revList = result.revisions || result.items || (Array.isArray(result) ? result : [])
      setRevisions(Array.isArray(revList) ? revList : [])
    } catch (err) {
      console.error('Failed to create revision', err)
      alert('Failed to create revision')
    } finally {
      setCreatingRevision(false)
    }
  }

  const handleUpdateContent = async () => {
    if (!updateContentModal || !updateContentText.trim()) return
    // Gridwell Workspace files (Docs, Sheets, Slides) have structured content
    // that update_file_content cannot handle correctly - it corrupts the DB.
    // Only allow content updates for regular files.
    if (updateContentModal.mimeType.includes('vnd.gridwell-apps')) {
      alert('Gridwell Workspace files (Docs, Sheets, Slides) cannot be updated this way. Please open the file in its respective app to edit content.')
      return
    }
    setUpdatingContent(true)
    try {
      await apiRef.current.callTool('update_file_content', {
        file_id: updateContentModal.id,
        new_content: updateContentText.trim(),
        user_id: 'me'
      })
      setUpdateContentModal(null)
      setUpdateContentText('')
      await loadFiles()
    } catch (err) {
      console.error('Failed to update content', err)
      alert('Failed to update file content')
    } finally {
      setUpdatingContent(false)
    }
  }

  // === Labels handlers ===
  const openLabelsModal = async (file: DriveFile) => {
    setLabelsModal(file)
    setFileLabels([])
    setLoadingLabels(true)
    try {
      const result = await apiRef.current.callTool('list_file_labels', { fileId: file.id })
      let labels = result.labels || []
      // Fallback: fetch from state API central labels store
      if (labels.length === 0) {
        try {
          const stateRes = await fetch('./api/services/gridwell_drive/state')
          if (stateRes.ok) {
            const stateWrapper = await stateRes.json()
            const userLabels = stateWrapper?.state?.users?.me?.labels || stateWrapper?.users?.me?.labels || {}
            for (const [labelKey, labelData] of Object.entries(userLabels)) {
              const lbl = labelData as any
              if (lbl?.fileId === file.id) {
                labels.push({ id: lbl.id || labelKey, kind: lbl.kind || 'drive#label', revisionId: lbl.revisionId || '', fields: lbl.fields || {} })
              }
            }
          }
        } catch {
          // Silently fail
        }
      }
      setFileLabels(labels)
    } catch (err) {
      console.error('Failed to load labels', err)
    } finally {
      setLoadingLabels(false)
    }
  }

  const handleModifyLabels = async () => {
    if (!labelsModal || !modifyLabelId.trim()) return
    setModifyingLabels(true)
    try {
      const fieldModifications: Array<Record<string, any>> = []
      if (modifyLabelFieldId.trim() && modifyLabelValue.trim()) {
        fieldModifications.push({
          fieldId: modifyLabelFieldId.trim(),
          setTextValues: [modifyLabelValue.trim()]
        })
      }
      await apiRef.current.callTool('modify_file_labels', {
        fileId: labelsModal.id,
        labelModifications: [{
          labelId: modifyLabelId.trim(),
          fieldModifications: fieldModifications.length > 0 ? fieldModifications : undefined
        }]
      })
      setModifyLabelId('')
      setModifyLabelFieldId('')
      setModifyLabelValue('')
      const result = await apiRef.current.callTool('list_file_labels', { fileId: labelsModal.id })
      setFileLabels(result.labels || [])
    } catch (err) {
      console.error('Failed to modify labels', err)
      alert('Failed to modify labels')
    } finally {
      setModifyingLabels(false)
    }
  }

  // === Comment/Reply editing handlers ===
  const handleUpdateComment = async (commentId: string) => {
    if (!commentsModal || !editCommentText.trim()) return
    setUpdatingCommentId(commentId)
    try {
      await apiRef.current.callTool('update_file_comment', {
        fileId: commentsModal.id,
        commentId,
        body: { content: editCommentText.trim() }
      })
      setEditingCommentId(null)
      setEditCommentText('')
      await loadComments(commentsModal.id)
    } catch (err) {
      console.error('Failed to update comment', err)
      alert('Failed to update comment')
    } finally {
      setUpdatingCommentId(null)
    }
  }

  const handleGetComment = async (commentId: string) => {
    if (!commentsModal) return
    try {
      const result = await apiRef.current.callTool('get_file_comment', {
        fileId: commentsModal.id,
        commentId
      })
      alert(`Comment details:\n\nContent: ${result.content}\nAuthor: ${result.author?.displayName || result.author?.emailAddress || 'Unknown'}\nCreated: ${result.createdTime || 'Unknown'}`)
    } catch (err) {
      console.error('Failed to get comment', err)
    }
  }

  const handleUpdateReply = async (commentId: string, replyId: string) => {
    if (!commentsModal || !editReplyText.trim()) return
    setUpdatingReplyId(replyId)
    try {
      await apiRef.current.callTool('update_comment_reply', {
        fileId: commentsModal.id,
        commentId,
        replyId,
        body: { content: editReplyText.trim() }
      })
      setEditingReplyId(null)
      setEditReplyText('')
      await loadComments(commentsModal.id)
    } catch (err) {
      console.error('Failed to update reply', err)
      alert('Failed to update reply')
    } finally {
      setUpdatingReplyId(null)
    }
  }

  const handleGetReply = async (commentId: string, replyId: string) => {
    if (!commentsModal) return
    try {
      const result = await apiRef.current.callTool('get_comment_reply', {
        fileId: commentsModal.id,
        commentId,
        replyId
      })
      alert(`Reply details:\n\nContent: ${result.content}\nAuthor: ${result.author?.displayName || result.author?.emailAddress || 'Unknown'}\nCreated: ${result.createdTime || 'Unknown'}`)
    } catch (err) {
      console.error('Failed to get reply', err)
    }
  }

  const handleListReplies = async (commentId: string) => {
    if (!commentsModal) return
    try {
      const result = await apiRef.current.callTool('list_comment_replies', {
        fileId: commentsModal.id,
        commentId
      })
      const replies = result.replies || []
      setComments(prev => prev.map(c =>
        c.id === commentId ? { ...c, replies } : c
      ))
      setExpandedComments(prev => ({ ...prev, [commentId]: true }))
    } catch (err) {
      console.error('Failed to list replies', err)
    }
  }

  // === Changes handlers ===
  const loadChanges = async () => {
    setLoadingChanges(true)
    try {
      let token = changesPageToken
      if (!token) {
        const tokenResult = await apiRef.current.callTool('get_changes_start_page_token', {})
        token = tokenResult.startPageToken || tokenResult
        setChangesPageToken(token)
      }
      const result = await apiRef.current.callTool('list_changes', { pageToken: token, pageSize: 100 })
      setChanges(result.changes || [])
      if (result.newStartPageToken) {
        setChangesPageToken(result.newStartPageToken)
      }
    } catch (err) {
      console.error('Failed to load changes', err)
      setChanges([])
    } finally {
      setLoadingChanges(false)
    }
  }

  const handleWatchChanges = async () => {
    try {
      let token = changesPageToken
      if (!token) {
        const tokenResult = await apiRef.current.callTool('get_changes_start_page_token', {})
        token = tokenResult.startPageToken || tokenResult
        setChangesPageToken(token)
      }
      const result = await apiRef.current.callTool('watch_changes', {
        pageToken: token,
        resource: { id: `channel_${Date.now()}`, type: 'web_hook', address: 'https://example.com/webhook' }
      })
      setWatchChannelId(result.id || '')
      setWatchResourceId(result.resourceId || '')
      alert('Watch channel created successfully')
    } catch (err) {
      console.error('Failed to watch changes', err)
      alert('Failed to create watch channel')
    }
  }

  const handleStopChannel = async () => {
    if (!watchChannelId || !watchResourceId) return
    try {
      await apiRef.current.callTool('stop_channel_watch', {
        resource: { id: watchChannelId, resourceId: watchResourceId }
      })
      setWatchChannelId('')
      setWatchResourceId('')
      alert('Watch channel stopped')
    } catch (err) {
      console.error('Failed to stop channel', err)
      alert('Failed to stop channel')
    }
  }

  // === Account info handler ===
  const loadAccountInfo = async () => {
    setLoadingAccountInfo(true)
    try {
      const result = await apiRef.current.callTool('get_drive_account_info', { fields: '*' })
      setAccountInfo(result)
    } catch (err) {
      console.error('Failed to load account info', err)
    } finally {
      setLoadingAccountInfo(false)
    }
  }

  // === Apps handler ===
  const loadInstalledApps = async () => {
    setLoadingApps(true)
    try {
      const result = await apiRef.current.callTool('list_installed_apps', {})
      setInstalledApps(result.items || result.apps || [])
    } catch (err) {
      console.error('Failed to load apps', err)
    } finally {
      setLoadingApps(false)
    }
  }

  // === Export handler ===
  const handleExportFile = async () => {
    if (!exportModal) return
    setExporting(true)
    try {
      await apiRef.current.callTool('export_gridwell_doc', {
        fileId: exportModal.id,
        mimeType: exportMimeType
      })
      alert('Export completed successfully')
      setExportModal(null)
    } catch (err) {
      console.error('Failed to export', err)
      alert('Failed to export file')
    } finally {
      setExporting(false)
    }
  }

  // === Generate IDs handler ===
  const handleGenerateIds = async () => {
    setGeneratingIds(true)
    try {
      const result = await apiRef.current.callTool('generate_file_ids', { count: 5 })
      setGeneratedIds(result.ids || [])
    } catch (err) {
      console.error('Failed to generate IDs', err)
    } finally {
      setGeneratingIds(false)
    }
  }

  // === Subscribe to file changes ===
  const handleSubscribeFileChanges = async (file: DriveFile) => {
    try {
      await apiRef.current.callTool('subscribe_to_file_changes', {
        fileId: file.id,
        body: { id: `sub_${Date.now()}`, type: 'web_hook', address: 'https://example.com/webhook' }
      })
      alert(`Subscribed to changes for "${file.name}"`)
    } catch (err) {
      console.error('Failed to subscribe', err)
      alert('Failed to subscribe to file changes')
    }
  }

  // === Get permission details ===
  const handleGetPermission = async (fileId: string, permissionId: string) => {
    try {
      const result = await apiRef.current.callTool('get_permission', { fileId, permissionId })
      alert(`Permission details:\n\nRole: ${result.role}\nType: ${result.type}\nEmail: ${result.emailAddress || 'N/A'}`)
    } catch (err) {
      console.error('Failed to get permission', err)
    }
  }

  // === Get app details ===
  const handleGetAppDetails = async (appId: string) => {
    try {
      const result = await apiRef.current.callTool('get_app_details', { appId })
      alert(`App: ${result.name || appId}\nInstalled: ${result.installed ? 'Yes' : 'No'}`)
    } catch (err) {
      console.error('Failed to get app details', err)
    }
  }

  // Copy Modal
  if (copyModal) {
    return (
      <div className="flex flex-col h-full bg-white shadow-2xl rounded-2xl overflow-hidden">
        <div className="bg-white border-b border-[#e0e0e0] px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#1a1a1a]">Make a copy</h2>
          <button
            onClick={() => { setCopyModal(null); setCopyName('') }}
            className="p-1 hover:bg-[#f1f3f4] rounded-full"
            disabled={copying}
          >
            <svg className="w-5 h-5 text-[#3c4043] dark:text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 p-6 overflow-y-auto">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#5f6368] mb-2">
                Name
              </label>
              <input
                type="text"
                value={copyName}
                onChange={(e) => setCopyName(e.target.value)}
                className="w-full px-3 py-2 border border-[#dadce0] rounded-lg focus:outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488] text-gray-800"
                placeholder="Enter file name"
                autoFocus
                disabled={copying}
              />
            </div>
            <div className="text-sm text-[#5f6368]">
              The copy will be created in the current folder
            </div>
          </div>
        </div>

        <div className="border-t border-[#e0e0e0] px-6 py-4 flex justify-end space-x-3">
          <button
            onClick={() => { setCopyModal(null); setCopyName('') }}
            className="px-4 py-2 text-[#0D9488] hover:bg-[#F0FDFA] rounded-lg transition-colors"
            disabled={copying}
          >
            Cancel
          </button>
          <button
            onClick={handleCopyFile}
            disabled={copying || !copyName.trim()}
            className="px-4 py-2 bg-[#0D9488] text-white rounded-lg hover:bg-[#0F766E] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {copying ? 'Copying...' : 'Make a copy'}
          </button>
        </div>
      </div>
    )
  }

  // Move Modal
  if (moveModal) {
    const folders = files.filter(f => f.mimeType === 'application/vnd.gridwell-apps.folder')

    return (
      <div className="flex flex-col h-full bg-white shadow-2xl rounded-2xl overflow-hidden">
        <div className="bg-white border-b border-[#e0e0e0] px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#1a1a1a]">Move to folder</h2>
          <button
            onClick={() => { setMoveModal(null); setMoveToFolderId(null) }}
            className="p-1 hover:bg-[#f1f3f4] rounded-full"
            disabled={moving}
          >
            <svg className="w-5 h-5 text-[#3c4043] dark:text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 p-6 overflow-y-auto">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#5f6368] mb-2">
                Select destination folder
              </label>
              <select
                value={moveToFolderId ?? '__none__'}
                onChange={(e) => setMoveToFolderId(e.target.value === '__none__' ? undefined : e.target.value)}
                className="w-full px-3 py-2 border border-[#dadce0] rounded-lg focus:outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488] text-gray-800"
                disabled={moving}
              >
                <option value="__none__">-- Select destination --</option>
                <option value="">My Drive (root)</option>
                {folders.map(folder => (
                  <option key={folder.id} value={folder.id}>
                    📁 {folder.name}
                  </option>
                ))}
              </select>
            </div>
            {folders.length === 0 && (
              <div className="text-sm text-[#5f6368] italic">
                No folders available. Create a folder first to move files.
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-[#e0e0e0] px-6 py-4 flex justify-end space-x-3">
          <button
            onClick={() => { setMoveModal(null); setMoveToFolderId(null) }}
            className="px-4 py-2 text-[#0D9488] hover:bg-[#F0FDFA] rounded-lg transition-colors"
            disabled={moving}
          >
            Cancel
          </button>
          <button
            onClick={handleMoveFile}
            disabled={moving || moveToFolderId === undefined}
            className="px-4 py-2 bg-[#0D9488] text-white rounded-lg hover:bg-[#0F766E] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {moving ? 'Moving...' : 'Move here'}
          </button>
        </div>
      </div>
    )
  }

  // Share Modal
  if (shareModal) {
    const getRoleColor = (role: string) => {
      switch (role) {
        case 'owner':
          return 'text-red-600 bg-red-50'
        case 'writer':
          return 'text-green-600 bg-green-50'
        case 'commenter':
          return 'text-teal-600 bg-teal-50'
        case 'reader':
          return 'text-gray-600 bg-gray-50'
        default:
          return 'text-gray-600 bg-gray-50'
      }
    }

    return (
      <div className="flex flex-col h-full bg-white shadow-2xl rounded-2xl overflow-hidden">
        <div className="bg-white border-b border-[#e0e0e0] px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#1a1a1a]">Share "{shareModal.name}"</h2>
          <button
            onClick={() => { setShareModal(null); setPermissions([]) }}
            className="p-1 hover:bg-[#f1f3f4] rounded-full"
          >
            <svg className="w-5 h-5 text-[#3c4043] dark:text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 p-6 overflow-y-auto">
          <div className="space-y-6">
            {/* Add user form */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-[#5f6368] mb-3">Add people</h3>
              <div className="space-y-3">
                <div>
                  <input
                    type="email"
                    value={newPermissionEmail}
                    onChange={(e) => setNewPermissionEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-[#dadce0] rounded-lg focus:outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488] text-gray-800"
                    placeholder="Enter email address"
                    disabled={creatingPermission}
                  />
                </div>
                <div className="flex items-center space-x-3">
                  <select
                    value={newPermissionRole}
                    onChange={(e) => setNewPermissionRole(e.target.value)}
                    className="flex-1 px-3 py-2 border border-[#dadce0] rounded-lg focus:outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488] text-gray-800"
                    disabled={creatingPermission}
                  >
                    <option value="reader">Reader</option>
                    <option value="commenter">Commenter</option>
                    <option value="writer">Writer</option>
                  </select>
                  <button
                    onClick={handleCreatePermission}
                    disabled={creatingPermission || !newPermissionEmail.trim()}
                    className="px-4 py-2 bg-[#0D9488] text-white rounded-lg hover:bg-[#0F766E] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {creatingPermission ? 'Adding...' : 'Add'}
                  </button>
                </div>
              </div>
            </div>

            {/* Permissions list */}
            <div>
              <h3 className="text-sm font-medium text-[#5f6368] mb-3">People with access</h3>
              {loadingPermissions ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-[#0D9488] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : permissions.length === 0 ? (
                <div className="text-sm text-[#5f6368] italic py-4">
                  No permissions yet. Add users to share this file.
                </div>
              ) : (
                <div className="space-y-2">
                  {permissions.map(permission => {
                    // For owner permissions, use file's owner info if permission email is missing
                    let displayEmail = permission.emailAddress?.trim()
                    if (!displayEmail && permission.role === 'owner' && shareModal.owners && shareModal.owners.length > 0) {
                      // owners is array of strings or array of objects
                      const owner = shareModal.owners[0]
                      displayEmail = typeof owner === 'string' ? owner : owner.emailAddress
                    }
                    displayEmail = displayEmail || 'Unknown'

                    return (
                      <div
                        key={permission.id}
                        className="flex items-center justify-between p-3 bg-white border border-[#dadce0] rounded-lg hover:bg-gray-50"
                      >
                        <div className="flex items-center space-x-3 flex-1">
                          <div className="w-10 h-10 bg-[#0D9488] rounded-full flex items-center justify-center text-white font-medium">
                            {displayEmail[0]?.toUpperCase() || '?'}
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-medium text-[#202124]">
                              {displayEmail}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{permission.id}]</span>
                            </div>
                            <div className={`text-xs px-2 py-1 rounded inline-block mt-1 ${getRoleColor(permission.role)}`}>
                              {permission.role.charAt(0).toUpperCase() + permission.role.slice(1)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                        <button onClick={() => handleGetPermission(shareModal.id, permission.id)} className="p-1 text-[#5f6368] hover:bg-gray-100 rounded" title="View details">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </button>
                        {permission.role !== 'owner' && (
                          <>
                            <select
                              value={permission.role}
                              onChange={(e) => handleUpdatePermission(permission.id, e.target.value)}
                              disabled={updatingPermissionId === permission.id}
                              className="px-2 py-1 text-sm border border-[#dadce0] rounded focus:outline-none focus:border-[#0D9488] text-gray-800"
                            >
                              <option value="reader">Reader</option>
                              <option value="commenter">Commenter</option>
                              <option value="writer">Writer</option>
                            </select>
                            <button
                              onClick={() => handleDeletePermission(permission.id)}
                              disabled={deletingPermissionId === permission.id}
                              className="p-2 text-red-500 hover:bg-red-50 rounded-full disabled:opacity-50"
                              title="Remove"
                            >
                              {deletingPermissionId === permission.id ? (
                                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                              ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              )}
                            </button>
                          </>
                        )}
                        {permission.role === 'owner' && (
                          <span className="text-xs text-[#5f6368]">Owner</span>
                        )}
                      </div>
                    </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-[#e0e0e0] px-6 py-4 flex justify-end">
          <button
            onClick={() => { setShareModal(null); setPermissions([]) }}
            className="px-4 py-2 bg-[#0D9488] text-white rounded-lg hover:bg-[#0F766E] transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  // Comments Modal
  if (commentsModal) {
    return (
      <div className="flex flex-col h-full bg-white shadow-2xl rounded-2xl overflow-hidden">
        <div className="bg-white border-b border-[#e0e0e0] px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#1a1a1a]">Comments on "{commentsModal.name}"</h2>
          <button
            onClick={() => { setCommentsModal(null); setComments([]) }}
            className="p-1 hover:bg-[#f1f3f4] rounded-full"
          >
            <svg className="w-5 h-5 text-[#3c4043] dark:text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 p-6 overflow-y-auto">
          <div className="space-y-6">
            {/* Add comment form */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-[#5f6368] mb-3">Add a comment</h3>
              <div className="space-y-3">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  className="w-full px-3 py-2 border border-[#dadce0] rounded-lg focus:outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488] text-gray-800 resize-none"
                  placeholder="Write a comment..."
                  rows={3}
                  disabled={creatingComment}
                />
                <div className="flex justify-end">
                  <button
                    onClick={handleCreateComment}
                    disabled={creatingComment || !newComment.trim()}
                    className="px-4 py-2 bg-[#0D9488] text-white rounded-lg hover:bg-[#0F766E] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {creatingComment ? 'Adding...' : 'Add comment'}
                  </button>
                </div>
              </div>
            </div>

            {/* Comments list */}
            <div>
              <h3 className="text-sm font-medium text-[#5f6368] mb-3">
                {comments.length > 0 ? `${comments.length} comment${comments.length > 1 ? 's' : ''}` : 'Comments'}
              </h3>
              {loadingComments ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-[#0D9488] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : comments.length === 0 ? (
                <div className="text-sm text-[#5f6368] italic py-4">
                  No comments yet. Be the first to comment!
                </div>
              ) : (
                <div className="space-y-4">
                  {comments.map(comment => (
                    <div
                      key={comment.id}
                      className={`p-4 bg-white border rounded-lg ${comment.resolved ? 'border-green-200 bg-green-50' : 'border-[#dadce0]'}`}
                    >
                      {/* Comment header */}
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-[#0D9488] rounded-full flex items-center justify-center text-white text-sm font-medium">
                            {comment.author?.displayName?.[0]?.toUpperCase() || comment.author?.emailAddress?.[0]?.toUpperCase() || '?'}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-[#202124]">
                              {comment.author?.displayName || comment.author?.emailAddress || 'Unknown'}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{comment.id}]</span>
                            </div>
                            <div className="text-xs text-[#5f6368]">
                              {formatCommentTime(comment.createdTime)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {comment.resolved && (
                            <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded">Resolved</span>
                          )}
                          <button
                            onClick={() => handleDeleteComment(comment.id)}
                            disabled={deletingCommentId === comment.id}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-full disabled:opacity-50"
                            title="Delete comment"
                          >
                            {deletingCommentId === comment.id ? (
                              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Comment content */}
                      <div className="text-sm text-[#202124] mb-3 pl-11">
                        {editingCommentId === comment.id ? (
                          <div className="flex items-center space-x-2">
                            <input value={editCommentText} onChange={e => setEditCommentText(e.target.value)} className="flex-1 px-2 py-1 border border-[#dadce0] rounded text-sm text-gray-800" />
                            <button onClick={() => handleUpdateComment(comment.id)} disabled={updatingCommentId === comment.id} className="px-2 py-1 bg-[#0D9488] text-white text-xs rounded disabled:opacity-50">{updatingCommentId === comment.id ? '...' : 'Save'}</button>
                            <button onClick={() => setEditingCommentId(null)} className="px-2 py-1 text-xs text-[#5f6368] hover:bg-gray-100 rounded">Cancel</button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <span>{comment.content}</span>
                            <div className="flex items-center space-x-1 ml-2">
                              <button onClick={() => { setEditingCommentId(comment.id); setEditCommentText(comment.content) }} className="text-xs text-[#0D9488] hover:underline">Edit</button>
                              <button onClick={() => handleGetComment(comment.id)} className="text-xs text-[#5f6368] hover:underline">Details</button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Replies section */}
                      {comment.replies && comment.replies.length > 0 && (
                        <div className="pl-11 border-l-2 border-gray-200 ml-4">
                          <div className="flex items-center space-x-2 mb-2">
                          <button
                            onClick={() => toggleCommentExpand(comment.id)}
                            className="text-xs text-[#0D9488] hover:underline"
                          >
                            {expandedComments[comment.id]
                              ? `Hide ${comment.replies.length} ${comment.replies.length === 1 ? 'reply' : 'replies'}`
                              : `Show ${comment.replies.length} ${comment.replies.length === 1 ? 'reply' : 'replies'}`}
                          </button>
                          <button onClick={() => handleListReplies(comment.id)} className="text-xs text-[#5f6368] hover:underline">Refresh replies</button>
                          </div>

                          {expandedComments[comment.id] && (
                            <div className="space-y-3 mt-2">
                              {comment.replies.map(reply => (
                                <div key={reply.id} className="p-3 bg-gray-50 rounded-lg">
                                  <div className="flex items-start justify-between mb-1">
                                    <div className="flex items-center space-x-2">
                                      <div className="w-6 h-6 bg-[#5f6368] rounded-full flex items-center justify-center text-white text-xs font-medium">
                                        {reply.author?.displayName?.[0]?.toUpperCase() || reply.author?.emailAddress?.[0]?.toUpperCase() || '?'}
                                      </div>
                                      <div>
                                        <span className="text-xs font-medium text-[#202124]">
                                          {reply.author?.displayName || reply.author?.emailAddress || 'Unknown'}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{reply.id}]</span>
                                        </span>
                                        <span className="text-xs text-[#5f6368] ml-2">
                                          {formatCommentTime(reply.createdTime)}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex items-center space-x-1">
                                      <button onClick={() => handleGetReply(comment.id, reply.id)} className="text-xs text-[#5f6368] hover:underline">Details</button>
                                      <button onClick={() => { setEditingReplyId(reply.id); setEditReplyText(reply.content) }} className="text-xs text-[#0D9488] hover:underline">Edit</button>
                                      <button
                                        onClick={() => handleDeleteReply(comment.id, reply.id)}
                                        disabled={deletingReplyId === reply.id}
                                        className="p-1 text-red-500 hover:bg-red-100 rounded-full disabled:opacity-50"
                                        title="Delete reply"
                                      >
                                        {deletingReplyId === reply.id ? (
                                          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                          </svg>
                                        ) : (
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                          </svg>
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                  {editingReplyId === reply.id ? (
                                    <div className="flex items-center space-x-2 pl-8">
                                      <input value={editReplyText} onChange={e => setEditReplyText(e.target.value)} className="flex-1 px-2 py-1 border border-[#dadce0] rounded text-sm text-gray-800" />
                                      <button onClick={() => handleUpdateReply(comment.id, reply.id)} disabled={updatingReplyId === reply.id} className="px-2 py-1 bg-[#0D9488] text-white text-xs rounded disabled:opacity-50">{updatingReplyId === reply.id ? '...' : 'Save'}</button>
                                      <button onClick={() => setEditingReplyId(null)} className="px-2 py-1 text-xs text-[#5f6368]">Cancel</button>
                                    </div>
                                  ) : (
                                    <div className="text-sm text-[#202124] pl-8">
                                      {reply.content}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Reply form */}
                      <div className="pl-11 mt-3">
                        <div className="flex items-center space-x-2">
                          <input
                            type="text"
                            value={replyTexts[comment.id] || ''}
                            onChange={(e) => setReplyTexts(prev => ({ ...prev, [comment.id]: e.target.value }))}
                            className="flex-1 px-3 py-2 text-sm border border-[#dadce0] rounded-lg focus:outline-none focus:border-[#0D9488] text-gray-800"
                            placeholder="Write a reply..."
                            disabled={creatingReplyId === comment.id}
                          />
                          <button
                            onClick={() => handleCreateReply(comment.id)}
                            disabled={creatingReplyId === comment.id || !replyTexts[comment.id]?.trim()}
                            className="px-3 py-2 bg-[#0D9488] text-white text-sm rounded-lg hover:bg-[#0F766E] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            {creatingReplyId === comment.id ? 'Sending...' : 'Reply'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-[#e0e0e0] px-6 py-4 flex justify-end">
          <button
            onClick={() => { setCommentsModal(null); setComments([]) }}
            className="px-4 py-2 bg-[#0D9488] text-white rounded-lg hover:bg-[#0F766E] transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  if (newFileModal) {
    const fileTypeInfo = getFileTypeInfo(newFileModal)
    return (
      <div className="flex flex-col h-full bg-white shadow-2xl rounded-2xl overflow-hidden">
        <div className="bg-white border-b border-[#e0e0e0] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <svg className="w-6 h-6 text-[#5f6368]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2Z" />
            </svg>
            <div>
              <h2 className="text-lg font-semibold text-[#1a1a1a]">New {fileTypeInfo.name}</h2>
              <p className="text-xs text-[#5f6368]">My Drive</p>
            </div>
          </div>
          <button
            onClick={() => { setNewFileModal(null); setNewFileName('') }}
            className="p-1 hover:bg-[#f1f3f4] rounded-full"
            disabled={creatingFile}
          >
            <svg className="w-5 h-5 text-[#3c4043] dark:text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 p-8">
          <div className="max-w-sm mx-auto space-y-6">
            <div className={`w-24 h-24 ${fileTypeInfo.bgColor} rounded-2xl flex items-center justify-center mx-auto shadow-lg`}>
              {fileTypeInfo.icon}
            </div>

            <div>
              <label className="block text-sm text-[#3c4043] font-medium mb-2">File name</label>
              <input
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createFile()}
                placeholder={`Untitled ${fileTypeInfo.name.toLowerCase()}`}
                className="w-full px-4 py-3 text-black border border-[#dadce0] rounded-lg focus:outline-none focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20 text-lg"
                autoFocus
              />
            </div>

            <button
              onClick={createFile}
              disabled={!newFileName.trim() || creatingFile}
              className="w-full py-3 bg-[#0D9488] text-white rounded-lg hover:bg-[#0F766E] font-medium text-lg shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {creatingFile ? (
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : 'Create'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (fileInfoModal) {
    const info = detailedFileInfo || fileInfoModal
    return (
      <div className="flex flex-col h-full bg-white shadow-2xl rounded-2xl overflow-hidden">
        <div className="bg-white border-b border-[#e0e0e0] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#1a1a1a]">File Information</h2>
              <p className="text-xs text-[#5f6368]">Details and Properties</p>
            </div>
          </div>
          <button
            onClick={() => { setFileInfoModal(null); setDetailedFileInfo(null) }}
            className="p-1 hover:bg-[#f1f3f4] rounded-full"
          >
            <svg className="w-5 h-5 text-[#3c4043] dark:text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 p-8 overflow-y-auto">
          {loadingFileInfo ? (
            <div className="flex items-center justify-center py-32">
              <svg className="w-8 h-8 animate-spin text-[#0D9488]" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="flex justify-center">
                {info.thumbnailLink ? (
                  <img src={info.thumbnailLink} alt={info.name} className="w-48 h-48 object-cover rounded-2xl shadow-lg border border-[#e0e0e0]" />
                ) : (
                  <div className={`w-48 h-48 rounded-2xl flex items-center justify-center shadow-lg ${isFolder(info) ? 'bg-gradient-to-br from-[#0D9488] to-[#0D9488]' : 'bg-white border border-[#e0e0e0]'} relative`}>
                    {isFolder(info) && <div className="absolute top-0 right-0 w-24 h-16 bg-white/90 rounded-bl-2xl shadow-lg"></div>}
                    <svg className={`w-24 h-24 ${isFolder(info) ? 'text-white' : 'text-[#5f6368]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                )}
              </div>

              <div className="text-center">
                <h3 className="text-2xl font-semibold text-[#202124] break-words">{info.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{info.id}]</span></h3>
                <p className="text-sm text-[#5f6368] mt-1">{getFileType(info.mimeType)}</p>
              </div>

              <div className="bg-[#f8f9fa] rounded-xl p-6 space-y-4">
                <h4 className="text-sm font-semibold text-[#202124] uppercase tracking-wide">Properties</h4>
                <div className="grid grid-cols-1 gap-4">
                  <div className="flex items-start justify-between py-2 border-b border-[#e0e0e0]">
                    <span className="text-sm text-[#5f6368] font-medium">Type</span>
                    <span className="text-sm text-[#202124] text-right">{getFileType(info.mimeType)}</span>
                  </div>
                  {!isFolder(info) && (
                    <div className="flex items-start justify-between py-2 border-b border-[#e0e0e0]">
                      <span className="text-sm text-[#5f6368] font-medium">Size</span>
                      <span className="text-sm text-[#202124] text-right">{formatFileSize(info.size)}</span>
                    </div>
                  )}
                  {info.owners && info.owners.length > 0 && (
                    <div className="flex items-start justify-between py-2 border-b border-[#e0e0e0]">
                      <span className="text-sm text-[#5f6368] font-medium">Owner</span>
                      <span className="text-sm text-[#202124] text-right">
                        {getOwnerDisplay(info.owners[0])}
                      </span>
                    </div>
                  )}
                  <div className="flex items-start justify-between py-2 border-b border-[#e0e0e0]">
                    <span className="text-sm text-[#5f6368] font-medium">Modified</span>
                    <span className="text-sm text-[#202124] text-right">{formatDate(info.modifiedTime)}</span>
                  </div>
                  {info.lastModifyingUser && (
                    <div className="flex items-start justify-between py-2 border-b border-[#e0e0e0]">
                      <span className="text-sm text-[#5f6368] font-medium">Modified by</span>
                      <span className="text-sm text-[#202124] text-right">
                        {info.lastModifyingUser.displayName || info.lastModifyingUser.emailAddress || 'Unknown'}
                      </span>
                    </div>
                  )}
                  <div className="flex items-start justify-between py-2 border-b border-[#e0e0e0]">
                    <span className="text-sm text-[#5f6368] font-medium">Created</span>
                    <span className="text-sm text-[#202124] text-right">{formatDate(info.createdTime)}</span>
                  </div>
                  <div className="flex items-start justify-between py-2">
                    <span className="text-sm text-[#5f6368] font-medium">MIME Type</span>
                    <span className="text-xs text-[#5f6368] text-right font-mono max-w-xs break-all">
                      {info.mimeType}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-[#f8f9fa] rounded-xl p-6 space-y-4">
                <h4 className="text-sm font-semibold text-[#202124] uppercase tracking-wide">Metadata</h4>
                <div className="space-y-3">
                  <div>
                    <span className="text-sm text-[#5f6368] font-medium">File ID</span>
                    <p className="text-xs text-[#5f6368] font-mono mt-1 p-2 bg-white rounded border border-[#e0e0e0] break-all">
                      {info.id}
                    </p>
                  </div>
                  {info.webViewLink && (
                    <div>
                      <span className="text-sm text-[#5f6368] font-medium">Link</span>
                      <a
                        href={info.webViewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[#0D9488] hover:underline font-mono mt-1 p-2 bg-white rounded border border-[#e0e0e0] block break-all"
                      >
                        {info.webViewLink}
                      </a>
                    </div>
                  )}
                  {info.description && (
                    <div>
                      <span className="text-sm text-[#5f6368] font-medium">Description</span>
                      <p className="text-sm text-[#202124] mt-1 p-2 bg-white rounded border border-[#e0e0e0]">
                        {info.description}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={() => { setFileInfoModal(null); setDetailedFileInfo(null) }}
                className="w-full py-3 bg-[#0D9488] text-white rounded-lg hover:bg-[#0F766E] font-medium shadow-lg"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (renameModal) {
    return (
      <div className="flex flex-col h-full bg-white shadow-2xl rounded-2xl overflow-hidden">
        <div className="bg-white border-b border-[#e0e0e0] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#1a1a1a]">Rename</h2>
              <p className="text-xs text-[#5f6368]">{currentView === 'drive' ? 'My Drive' : 'Trash'}</p>
            </div>
          </div>
          <button
            onClick={() => { setRenameModal(null); setNewName('') }}
            className="p-1 hover:bg-[#f1f3f4] rounded-full"
            disabled={renaming}
          >
            <svg className="w-5 h-5 text-[#3c4043] dark:text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 p-8">
          <div className="max-w-sm mx-auto space-y-6">
            <div className="w-24 h-24 bg-teal-50 rounded-2xl flex items-center justify-center mx-auto">
              <svg className="w-20 h-20 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </div>

            <div className="text-center">
              <h3 className="text-xl font-semibold text-[#202124] mb-1">{renameModal.name}</h3>
              <p className="text-sm text-[#5f6368] mb-6">Enter a new name for this item</p>
            </div>

            <div>
              <label className="block text-sm text-[#3c4043] font-medium mb-2">New name</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && renameFile()}
                placeholder="Enter new name"
                className="w-full px-4 py-3 text-black border border-[#dadce0] rounded-lg focus:outline-none focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20 text-lg"
                autoFocus
              />
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => { setRenameModal(null); setNewName('') }}
                disabled={renaming}
                className="flex-1 py-3 px-4 border border-[#dadce0] text-[#3c4043] rounded-lg hover:bg-[#f8f9fa] font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={renameFile}
                disabled={!newName.trim() || renaming || newName.trim() === renameModal.name}
                className="flex-1 py-3 px-4 bg-[#0D9488] text-white rounded-lg hover:bg-[#0F766E] font-medium shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {renaming ? (
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : 'Rename'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (moveToTrashConfirm) {
    return (
      <div className="flex flex-col h-full bg-white shadow-2xl rounded-2xl overflow-hidden">
        <div className="bg-white border-b border-[#e0e0e0] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#1a1a1a]">Move to trash?</h2>
              <p className="text-xs text-[#5f6368]">My Drive</p>
            </div>
          </div>
          <button
            onClick={() => setMoveToTrashConfirm(null)}
            className="p-1 hover:bg-[#f1f3f4] rounded-full"
          >
            <svg className="w-5 h-5 text-[#3c4043] dark:text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 p-8">
          <div className="max-w-sm mx-auto space-y-6">
            <div className="w-24 h-24 bg-orange-50 rounded-2xl flex items-center justify-center mx-auto">
              <svg className="w-20 h-20 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>

            <div className="text-center">
              <h3 className="text-xl font-semibold text-[#202124] mb-1">{moveToTrashConfirm.name}</h3>
              <p className="text-sm text-[#5f6368] mb-6">Moved items can be restored from the Trash folder.</p>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => setMoveToTrashConfirm(null)}
                className="flex-1 py-3 px-4 border border-[#dadce0] text-[#3c4043] rounded-lg hover:bg-[#f8f9fa] font-medium"
              >
                Cancel
              </button>
              <button
                onClick={moveToTrash}
                className="flex-1 py-3 px-4 bg-[#0D9488] text-white rounded-lg hover:bg-[#0F766E] font-medium shadow-lg"
              >
                Move to trash
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (deleteConfirmModal) {
    return (
      <div className="flex flex-col h-full bg-white shadow-2xl rounded-2xl overflow-hidden">
        <div className="bg-white border-b border-[#e0e0e0] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#1a1a1a]">Delete forever?</h2>
              <p className="text-xs text-[#5f6368]">{currentView === 'trash' ? 'Trash' : 'My Drive'}</p>
            </div>
          </div>
          <button
            onClick={() => setDeleteConfirmModal(null)}
            className="p-1 hover:bg-[#f1f3f4] rounded-full"
            disabled={deleting}
          >
            <svg className="w-5 h-5 text-[#3c4043] dark:text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 p-8">
          <div className="max-w-sm mx-auto space-y-6">
            <div className="w-24 h-24 bg-red-50 rounded-2xl flex items-center justify-center mx-auto shadow-lg">
              <svg className="w-20 h-20 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>

            <div className="text-center">
              <h3 className="text-xl font-semibold text-[#202124] mb-1">{deleteConfirmModal.name}</h3>
              <p className="text-sm text-[#5f6368] mb-6">
                {currentView === 'trash'
                  ? "Permanently delete this item? It can't be recovered."
                  : "Delete this item forever? It can't be recovered."}
              </p>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => setDeleteConfirmModal(null)}
                disabled={deleting}
                className="flex-1 py-3 px-4 border border-[#dadce0] text-[#3c4043] rounded-lg hover:bg-[#f8f9fa] font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={deletePermanently}
                disabled={deleting}
                className="flex-1 py-3 px-4 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {deleting ? (
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : 'Delete forever'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (newFolderModal) {
    return (
      <div className="flex flex-col h-full bg-white shadow-2xl rounded-2xl overflow-hidden">
        <div className="bg-white border-b border-[#e0e0e0] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <svg className="w-6 h-6 text-[#5f6368]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M22 11.5c0-.8-.7-1.5-1.5-1.5h-9V2.5c0-.8-.7-1.5-1.5-1.5s-1.5.7-1.5 1.5v7h-9c-.8 0-1.5.7-1.5 1.5s.7 1.5 1.5 1.5h9v7c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5v-7h9c.8 0 1.5-.7 1.5-1.5z" />
            </svg>
            <div>
              <h2 className="text-lg font-semibold text-[#1a1a1a]">New folder</h2>
              <p className="text-xs text-[#5f6368]">My Drive</p>
            </div>
          </div>
          <button
            onClick={() => setNewFolderModal(false)}
            className="p-1 hover:bg-[#f1f3f4] rounded-full"
          >
            <svg className="w-5 h-5 text-[#3c4043] dark:text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 p-8">
          <div className="max-w-sm mx-auto space-y-6">
            <div className="w-24 h-24 bg-[#0D9488] rounded-2xl flex items-center justify-center mx-auto shadow-lg relative overflow-hidden">
              <svg className="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <div className="absolute top-0 right-0 w-16 h-10 bg-white rounded-bl-2xl"></div>
            </div>

            <div>
              <label className="block text-sm text-[#3c4043] font-medium mb-2">Folder name</label>
              <input
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createFolder()}
                placeholder="Enter folder name"
                className="w-full px-4 py-3 text-black border border-[#dadce0] rounded-lg focus:outline-none focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20 text-lg"
                autoFocus
              />
            </div>

            <button
              onClick={createFolder}
              disabled={!folderName.trim()}
              className="w-full py-3 bg-[#0D9488] text-white rounded-lg hover:bg-[#0F766E] font-medium text-lg shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create
            </button>
          </div>
        </div>
      </div>
    )
  }

  // === Revisions Modal ===
  if (revisionsModal) {
    return (
      <div className="flex flex-col h-full bg-white shadow-2xl rounded-2xl overflow-hidden">
        <div className="bg-white border-b border-[#e0e0e0] px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#1a1a1a]">Revisions: {revisionsModal.name}</h2>
          <button onClick={() => setRevisionsModal(null)} className="p-1 hover:bg-[#f1f3f4] rounded-full"><svg className="w-5 h-5 text-[#3c4043] dark:text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="mb-6 bg-gray-50 p-4 rounded-lg">
            <h3 className="text-sm font-medium text-[#5f6368] mb-3">Create New Revision</h3>
            <textarea value={newRevisionContent} onChange={e => setNewRevisionContent(e.target.value)} placeholder="Enter content for new revision..." className="w-full px-3 py-2 border border-[#dadce0] rounded-lg text-sm text-gray-800 resize-none" rows={3} />
            <div className="flex justify-end mt-2">
              <button onClick={handleCreateRevision} disabled={creatingRevision || !newRevisionContent.trim()} className="px-4 py-2 bg-[#0D9488] text-white text-sm rounded-lg disabled:opacity-50">{creatingRevision ? 'Creating...' : 'Create Revision'}</button>
            </div>
          </div>
          {loadingRevisions ? (
            <div className="flex items-center justify-center py-8"><div className="w-6 h-6 border-2 border-[#0D9488] border-t-transparent rounded-full animate-spin" /></div>
          ) : (Array.isArray(revisions) && revisions.length > 0) ? (
            <div className="space-y-2">
              {revisions.map((rev, idx) => (
                <div key={rev.id || idx} className="p-4 bg-white border border-[#dadce0] rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-[#202124]">Revision {rev.id || idx + 1}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{rev.id}]</span></div>
                      <div className="text-xs text-[#5f6368]">{rev.modifiedTime ? formatDate(rev.modifiedTime) : 'Unknown date'} {rev.lastModifyingUser?.displayName ? `by ${rev.lastModifyingUser.displayName}` : ''}</div>
                    </div>
                    {rev.size && <span className="text-xs text-[#5f6368]">{formatFileSize(rev.size)}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-[#5f6368]">No revisions found.</div>
          )}
        </div>
      </div>
    )
  }

  // === Update Content Modal ===
  if (updateContentModal) {
    return (
      <div className="flex flex-col h-full bg-white shadow-2xl rounded-2xl overflow-hidden">
        <div className="bg-white border-b border-[#e0e0e0] px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#1a1a1a]">Update Content: {updateContentModal.name}</h2>
          <button onClick={() => setUpdateContentModal(null)} className="p-1 hover:bg-[#f1f3f4] rounded-full"><svg className="w-5 h-5 text-[#3c4043] dark:text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <div className="flex-1 p-6">
          <textarea value={updateContentText} onChange={e => setUpdateContentText(e.target.value)} placeholder="Enter new file content..." className="w-full h-64 px-3 py-2 border border-[#dadce0] rounded-lg text-sm text-gray-800 resize-none font-mono" />
        </div>
        <div className="border-t border-[#e0e0e0] px-6 py-4 flex justify-end space-x-3">
          <button onClick={() => setUpdateContentModal(null)} className="px-4 py-2 text-[#0D9488] hover:bg-[#F0FDFA] rounded-lg">Cancel</button>
          <button onClick={handleUpdateContent} disabled={updatingContent || !updateContentText.trim()} className="px-4 py-2 bg-[#0D9488] text-white rounded-lg disabled:opacity-50">{updatingContent ? 'Updating...' : 'Update Content'}</button>
        </div>
      </div>
    )
  }

  // === Labels Modal ===
  if (labelsModal) {
    return (
      <div className="flex flex-col h-full bg-white shadow-2xl rounded-2xl overflow-hidden">
        <div className="bg-white border-b border-[#e0e0e0] px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#1a1a1a]">Labels: {labelsModal.name}</h2>
          <button onClick={() => setLabelsModal(null)} className="p-1 hover:bg-[#f1f3f4] rounded-full"><svg className="w-5 h-5 text-[#3c4043] dark:text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="mb-6 bg-gray-50 p-4 rounded-lg">
            <h3 className="text-sm font-medium text-[#5f6368] mb-3">Modify Label</h3>
            <div className="space-y-2">
              <input value={modifyLabelId} onChange={e => setModifyLabelId(e.target.value)} placeholder="Label ID" className="w-full px-3 py-2 border border-[#dadce0] rounded-lg text-sm text-gray-800" />
              <div className="flex space-x-2">
                <input value={modifyLabelFieldId} onChange={e => setModifyLabelFieldId(e.target.value)} placeholder="Field ID (optional)" className="flex-1 px-3 py-2 border border-[#dadce0] rounded-lg text-sm text-gray-800" />
                <input value={modifyLabelValue} onChange={e => setModifyLabelValue(e.target.value)} placeholder="Value (optional)" className="flex-1 px-3 py-2 border border-[#dadce0] rounded-lg text-sm text-gray-800" />
              </div>
              <div className="flex justify-end">
                <button onClick={handleModifyLabels} disabled={modifyingLabels || !modifyLabelId.trim()} className="px-4 py-2 bg-[#0D9488] text-white text-sm rounded-lg disabled:opacity-50">{modifyingLabels ? 'Modifying...' : 'Modify Label'}</button>
              </div>
            </div>
          </div>
          {loadingLabels ? (
            <div className="flex items-center justify-center py-8"><div className="w-6 h-6 border-2 border-[#0D9488] border-t-transparent rounded-full animate-spin" /></div>
          ) : fileLabels.length > 0 ? (
            <div className="space-y-2">
              {fileLabels.map((label, idx) => (
                <div key={label.id || idx} className="p-4 bg-white border border-[#dadce0] rounded-lg">
                  <div className="text-sm font-medium text-[#202124]">Label: {label.id}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{label.id}]</span></div>
                  {label.fields && Object.entries(label.fields).map(([fieldId, fieldVal]) => (
                    <div key={fieldId} className="text-xs text-[#5f6368] mt-1">Field "{fieldId}": {JSON.stringify(fieldVal)}</div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-[#5f6368]">No labels on this file.</div>
          )}
        </div>
      </div>
    )
  }

  // === Export Modal ===
  if (exportModal) {
    return (
      <div className="flex flex-col h-full bg-white shadow-2xl rounded-2xl overflow-hidden">
        <div className="bg-white border-b border-[#e0e0e0] px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#1a1a1a]">Export: {exportModal.name}</h2>
          <button onClick={() => setExportModal(null)} className="p-1 hover:bg-[#f1f3f4] rounded-full"><svg className="w-5 h-5 text-[#3c4043] dark:text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <div className="flex-1 p-6">
          <div className="max-w-sm mx-auto space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#5f6368] mb-2">Export Format</label>
              <select value={exportMimeType} onChange={e => setExportMimeType(e.target.value)} className="w-full px-3 py-2 border border-[#dadce0] rounded-lg text-sm text-gray-800">
                <option value="application/pdf">PDF</option>
                <option value="text/plain">Plain Text</option>
                <option value="text/html">HTML</option>
                <option value="application/vnd.openxmlformats-officedocument.wordprocessingml.document">DOCX</option>
                <option value="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">XLSX</option>
                <option value="text/csv">CSV</option>
              </select>
            </div>
          </div>
        </div>
        <div className="border-t border-[#e0e0e0] px-6 py-4 flex justify-end space-x-3">
          <button onClick={() => setExportModal(null)} className="px-4 py-2 text-[#0D9488] hover:bg-[#F0FDFA] rounded-lg">Cancel</button>
          <button onClick={handleExportFile} disabled={exporting} className="px-4 py-2 bg-[#0D9488] text-white rounded-lg disabled:opacity-50">{exporting ? 'Exporting...' : 'Export'}</button>
        </div>
      </div>
    )
  }

  const fileCardActions: FileCardActions = {
    onViewInfo: openFileInfo,
    onRename: openRenameModal,
    onCopy: openCopyModal,
    onMove: openMoveModal,
    onShare: openShareModal,
    onComments: openCommentsModal,
    onRevisions: openRevisionsModal,
    onLabels: openLabelsModal,
    onUpdateContent: (file) => { setUpdateContentModal(file); setUpdateContentText('') },
    onExport: (file) => setExportModal(file),
    onWatch: handleSubscribeFileChanges,
    onTrash: confirmMoveToTrash,
    onDownload: downloadFile,
    onRestore: restoreFromTrash,
    onDeleteForever: (file) => setDeleteConfirmModal({ id: file.id, name: file.name }),
    onNavigateFolder: navigateToFolder,
    onOpenInApp: openFileInApp,
  }


  // === Changes View ===
  if (currentView === 'changes') {
    return (
      <div className="flex flex-col h-full bg-white shadow-2xl rounded-2xl overflow-hidden">
        <div className="bg-white border-b border-[#e0e0e0] px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#1a1a1a]">Change Tracking</h2>
          <div className="flex items-center space-x-2">
            <button onClick={loadChanges} disabled={loadingChanges} className="px-3 py-2 text-sm text-[#0D9488] hover:bg-[#F0FDFA] rounded-lg disabled:opacity-50">{loadingChanges ? 'Loading...' : 'Refresh'}</button>
            <button onClick={handleWatchChanges} className="px-3 py-2 text-sm bg-[#0D9488] text-white rounded-lg hover:bg-[#0F766E]">Watch Changes</button>
            {watchChannelId && (<button onClick={handleStopChannel} className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg">Stop Watch</button>)}
            <button onClick={() => setCurrentView('drive')} className="px-3 py-2 text-[#5f6368] hover:bg-[#f1f3f4] rounded-lg text-sm">Back</button>
          </div>
        </div>
        <div className="flex-1 p-6 overflow-y-auto">
          {watchChannelId && (
            <div className="mb-4 p-3 bg-teal-50 rounded-lg text-sm">
              <span className="font-medium">Active Watch:</span> Channel {watchChannelId} / Resource {watchResourceId}
            </div>
          )}
          {loadingChanges ? (
            <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-[#0D9488] border-t-transparent rounded-full animate-spin" /></div>
          ) : changes.length === 0 ? (
            <div className="text-center py-16 text-[#5f6368]">No changes recorded yet.</div>
          ) : (
            <div className="space-y-2">
              {changes.map((change, idx) => (
                <div key={idx} className="p-4 bg-white border border-[#dadce0] rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-[#202124]">{change.file?.name || change.fileId || 'Unknown file'}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{change.fileId || change.changeId}]</span></div>
                      <div className="text-xs text-[#5f6368]">{change.removed ? 'Removed' : 'Modified'} {change.time ? `at ${formatDate(change.time)}` : ''}</div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${change.removed ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{change.removed ? 'Removed' : 'Changed'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // === Account Info View ===
  if (currentView === 'account') {
    return (
      <div className="flex flex-col h-full bg-white shadow-2xl rounded-2xl overflow-hidden">
        <div className="bg-white border-b border-[#e0e0e0] px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#1a1a1a]">Account Info</h2>
          <div className="flex items-center space-x-2">
            <button onClick={loadAccountInfo} className="px-3 py-2 text-sm text-[#0D9488] hover:bg-[#F0FDFA] rounded-lg">Refresh</button>
            <button onClick={() => setCurrentView('drive')} className="px-3 py-2 text-[#5f6368] hover:bg-[#f1f3f4] rounded-lg text-sm">Back</button>
          </div>
        </div>
        <div className="flex-1 p-6 overflow-y-auto">
          {loadingAccountInfo ? (
            <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-[#0D9488] border-t-transparent rounded-full animate-spin" /></div>
          ) : accountInfo ? (
            <div className="max-w-2xl mx-auto space-y-6">
              {accountInfo.user && (
                <div className="bg-[#f8f9fa] rounded-xl p-6">
                  <h3 className="text-sm font-semibold text-[#202124] uppercase tracking-wide mb-4">User</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between"><span className="text-sm text-[#5f6368]">Name</span><span className="text-sm text-[#202124]">{accountInfo.user.displayName || 'N/A'}</span></div>
                    <div className="flex justify-between"><span className="text-sm text-[#5f6368]">Email</span><span className="text-sm text-[#202124]">{accountInfo.user.emailAddress || 'N/A'}</span></div>
                  </div>
                </div>
              )}
              {accountInfo.storageQuota && (
                <div className="bg-[#f8f9fa] rounded-xl p-6">
                  <h3 className="text-sm font-semibold text-[#202124] uppercase tracking-wide mb-4">Storage</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between"><span className="text-sm text-[#5f6368]">Limit</span><span className="text-sm text-[#202124]">{formatFileSize(accountInfo.storageQuota.limit)}</span></div>
                    <div className="flex justify-between"><span className="text-sm text-[#5f6368]">Usage</span><span className="text-sm text-[#202124]">{formatFileSize(accountInfo.storageQuota.usage)}</span></div>
                    <div className="flex justify-between"><span className="text-sm text-[#5f6368]">Drive Usage</span><span className="text-sm text-[#202124]">{formatFileSize(accountInfo.storageQuota.usageInDrive)}</span></div>
                    <div className="flex justify-between"><span className="text-sm text-[#5f6368]">Trash Usage</span><span className="text-sm text-[#202124]">{formatFileSize(accountInfo.storageQuota.usageInDriveTrash)}</span></div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-16 text-[#5f6368]">Failed to load account info.</div>
          )}
        </div>
      </div>
    )
  }

  // === Apps View ===
  if (currentView === 'apps') {
    return (
      <div className="flex flex-col h-full bg-white shadow-2xl rounded-2xl overflow-hidden">
        <div className="bg-white border-b border-[#e0e0e0] px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#1a1a1a]">Installed Apps</h2>
          <div className="flex items-center space-x-2">
            <button onClick={loadInstalledApps} className="px-3 py-2 text-sm text-[#0D9488] hover:bg-[#F0FDFA] rounded-lg">Refresh</button>
            <button onClick={() => setCurrentView('drive')} className="px-3 py-2 text-[#5f6368] hover:bg-[#f1f3f4] rounded-lg text-sm">Back</button>
          </div>
        </div>
        <div className="flex-1 p-6 overflow-y-auto">
          {loadingApps ? (
            <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-[#0D9488] border-t-transparent rounded-full animate-spin" /></div>
          ) : installedApps.length === 0 ? (
            <div className="text-center py-16 text-[#5f6368]">No installed apps found.</div>
          ) : (
            <div className="space-y-2">
              {installedApps.map(app => (
                <div key={app.id} className="flex items-center justify-between p-4 bg-white border border-[#dadce0] rounded-lg hover:bg-gray-50">
                  <div>
                    <div className="text-sm font-medium text-[#202124]">{app.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{app.id}]</span></div>
                    <div className="text-xs text-[#5f6368]">ID: {app.id}</div>
                  </div>
                  <button onClick={() => handleGetAppDetails(app.id)} className="px-3 py-1 text-sm text-[#0D9488] hover:bg-[#F0FDFA] rounded">Details</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  const currentFiles = currentView === 'drive' ? files : trashFiles
  const viewTitle = (
    currentView === 'drive' ? breadcrumbs[breadcrumbs.length - 1].name :
    currentView === 'trash' ? 'Trash' :
    currentView === 'shared_drives'
      ? (selectedSharedDrive
          ? (sharedDriveBreadcrumbs[sharedDriveBreadcrumbs.length - 1]?.name || selectedSharedDrive.name)
          : 'Shared Drives')
      : ''
  )
  const itemCount = (
    currentView === 'shared_drives'
      ? (selectedSharedDrive ? sharedDriveFiles.length : sharedDrives.length)
      : currentFiles.length
  )
  const uniqueOwners = getUniqueOwners()
  const hasActiveFilters = searchQuery || fileTypeFilter !== 'all' || ownerFilter !== 'all'

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-[#fafbfc] to-[#f1f3f4]">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      {uploading && (
        <div className="fixed top-4 right-4 z-50 bg-white rounded-lg shadow-xl border border-[#e0e0e0] p-4 max-w-sm">
          <div className="flex items-center space-x-3">
            <svg className="w-5 h-5 animate-spin text-[#0D9488]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-[#202124]">Uploading files...</p>
              {uploadProgress && <p className="text-xs text-[#5f6368] mt-1">{uploadProgress}</p>}
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border-b border-[#F0FDFA] px-4 py-2.5 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="35" height="35" role="img" aria-label={APP_NAME}><title>{APP_NAME}</title><path fill="#0F766E" d="M6 14a3 3 0 0 1 3-3h9l4 4h11a3 3 0 0 1 3 3v3H6z"/><path fill="#0D9488" d="M6 19h36v17a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z"/><path fill="#0891B2" d="M30 28a6 6 0 0 0-11.7-1.9A5 5 0 0 0 19 36h12a4 4 0 0 0 .4-7.98A6 6 0 0 0 30 28z"/></svg>
          <div>
            <h1 className="font-medium text-[#202124] text-lg">{viewTitle}</h1>
            <p className="text-xs text-[#5f6368]">{itemCount} items</p>
          </div>
        </div>

        <div className="flex items-center space-x-1">
          {(currentView === 'drive' || currentView === 'trash') && (
            <button
              onClick={() => {
                setCurrentView(currentView === 'drive' ? 'trash' : 'drive')
                if (currentView === 'drive') {
                  setCurrentFolderId(null)
                  setBreadcrumbs([{ id: null, name: 'My Drive' }])
                }
              }}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                currentView === 'trash'
                  ? 'bg-[#0D9488] text-white shadow-md hover:bg-[#0F766E]'
                  : 'text-[#5f6368] hover:bg-[#f1f3f4]'
              }`}
            >
              {currentView === 'drive' ? 'Trash' : 'Back to Drive'}
            </button>
          )}

          {currentView === 'shared_drives' && selectedSharedDrive && (
            <button
              onClick={leaveSharedDrive}
              className="px-4 py-2 text-sm font-medium rounded-lg transition-all text-[#5f6368] hover:bg-[#f1f3f4]"
            >
              Back to Drives
            </button>
          )}

          {currentView === 'shared_drives' && !selectedSharedDrive && (
            <button
              onClick={() => setNewSharedDriveModal(true)}
              className="px-4 py-2 bg-[#0D9488] text-white text-sm font-medium rounded-lg hover:bg-[#0F766E] shadow-md"
            >
              New Drive
            </button>
          )}

          {currentView === 'shared_drives' && (
            <button
              onClick={() => {
                if (selectedSharedDrive) loadSharedDriveFiles(selectedSharedDrive, sharedDriveFolderId)
                else loadSharedDrives()
              }}
              className="px-3 py-2 text-[#5f6368] hover:bg-[#f1f3f4] rounded-lg text-sm"
            >
              Refresh
            </button>
          )}

          {currentView === 'drive' && (
            <div className="relative">
              <button
                onClick={() => setShowNewMenu(!showNewMenu)}
                className="p-2 text-[#5f6368] hover:bg-[#f1f3f4] rounded-full"
                title="New"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </button>

              {showNewMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowNewMenu(false)}></div>
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-[#e0e0e0] py-2 z-20">
                    <button
                      onClick={() => { setNewFileModal('doc'); setShowNewMenu(false) }}
                      className="w-full px-4 py-2.5 text-left hover:bg-[#f8f9fa] flex items-center space-x-3 text-sm"
                    >
                      <div className="w-8 h-8 bg-[#0D9488] rounded flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
                        </svg>
                      </div>
                      <span className="text-[#202124] font-medium">GridwellDocs</span>
                    </button>
                    <button
                      onClick={() => { setNewFileModal('sheet'); setShowNewMenu(false) }}
                      className="w-full px-4 py-2.5 text-left hover:bg-[#f8f9fa] flex items-center space-x-3 text-sm"
                    >
                      <div className="w-8 h-8 bg-[#059669] rounded flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M19,11H15V15H19M19,3A2,2 0 0,1 21,5V19A2,2 0 0,1 19,21H5C3.89,21 3,20.1 3,19V5C3,3.89 3.89,3 5,3H19M19,5H5V19H19V5Z" />
                        </svg>
                      </div>
                      <span className="text-[#202124] font-medium">GridwellSheets</span>
                    </button>
                    <button
                      onClick={() => { setNewFileModal('slides'); setShowNewMenu(false) }}
                      className="w-full px-4 py-2.5 text-left hover:bg-[#f8f9fa] flex items-center space-x-3 text-sm"
                    >
                      <div className="w-8 h-8 bg-[#F59E0B] rounded flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M13,9H18.5L13,3.5V9M6,2H14L20,8V20A2,2 0 0,1 18,22H6C4.89,22 4,21.1 4,20V4C4,2.89 4.89,2 6,2Z" />
                        </svg>
                      </div>
                      <span className="text-[#202124] font-medium">GridwellSlides</span>
                    </button>
                    <div className="border-t border-[#e0e0e0] my-2"></div>
                    <button
                      onClick={() => { setNewFolderModal(true); setShowNewMenu(false) }}
                      className="w-full px-4 py-2.5 text-left hover:bg-[#f8f9fa] flex items-center space-x-3 text-sm"
                    >
                      <div className="w-8 h-8 bg-gray-200 rounded flex items-center justify-center">
                        <svg className="w-5 h-5 text-[#5f6368]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                      </div>
                      <span className="text-[#202124] font-medium">New Folder</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {currentView === 'drive' && (
          <button
            onClick={handleUploadClick}
            disabled={uploading}
            className="p-2 text-[#5f6368] hover:bg-[#f1f3f4] rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
            title="Upload"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </button>)}

          {currentView === 'trash' && (
            <button
              onClick={emptyTrash}
              disabled={emptyingTrash || trashFiles.length === 0}
              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 shadow-md disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap flex items-center space-x-1"
            >
              {emptyingTrash ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Emptying...</span>
                </>
              ) : 'Empty trash'}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-64 bg-white border-r border-[#F0FDFA] flex flex-col">
          <div className="p-4 border-b border-[#F0FDFA]">
            <div className="space-y-1">
              <button
                onClick={() => {
                  setCurrentView('drive')
                  setCurrentFolderId(null)
                  setBreadcrumbs([{ id: null, name: 'My Drive' }])
                }}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all ${
                  currentView === 'drive'
                    ? 'text-[#0D9488] bg-[#F0FDFA]'
                    : 'text-[#3c4043] hover:bg-[#f8f9fa]'
                }`}
              >
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span>My Drive</span>
              </button>
              <button
                onClick={() => setCurrentView('trash')}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all ${
                  currentView === 'trash'
                    ? 'text-[#0D9488] bg-[#F0FDFA]'
                    : 'text-[#5f6368] hover:bg-[#f8f9fa]'
                }`}
              >
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span>Trash</span>
              </button>
              <button
                onClick={() => { setCurrentView('shared_drives'); loadSharedDrives() }}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all ${
                  currentView === 'shared_drives'
                    ? 'text-[#0D9488] bg-[#F0FDFA]'
                    : 'text-[#5f6368] hover:bg-[#f8f9fa]'
                }`}
              >
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Shared Drives</span>
              </button>
              <button
                onClick={() => { setCurrentView('changes'); loadChanges() }}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all ${
                  currentView === 'changes'
                    ? 'text-[#0D9488] bg-[#F0FDFA]'
                    : 'text-[#5f6368] hover:bg-[#f8f9fa]'
                }`}
              >
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Changes</span>
              </button>
              <button
                onClick={() => { setCurrentView('account'); loadAccountInfo() }}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all ${
                  currentView === 'account'
                    ? 'text-[#0D9488] bg-[#F0FDFA]'
                    : 'text-[#5f6368] hover:bg-[#f8f9fa]'
                }`}
              >
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span>Account</span>
              </button>
              <button
                onClick={() => { setCurrentView('apps'); loadInstalledApps() }}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all ${
                  currentView === 'apps'
                    ? 'text-[#0D9488] bg-[#F0FDFA]'
                    : 'text-[#5f6368] hover:bg-[#f8f9fa]'
                }`}
              >
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
                <span>Apps</span>
              </button>
            </div>
            {/* Generate IDs button */}
            <div className="mt-4 pt-4 border-t border-[#F0FDFA]">
              <button
                onClick={handleGenerateIds}
                disabled={generatingIds}
                className="w-full flex items-center space-x-3 px-3 py-2.5 text-sm font-medium rounded-lg text-[#5f6368] hover:bg-[#f8f9fa] transition-all disabled:opacity-50"
              >
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                </svg>
                <span>{generatingIds ? 'Generating...' : 'Generate IDs'}</span>
              </button>
              {generatedIds.length > 0 && (
                <div className="mt-2 px-3 text-xs text-[#5f6368] space-y-1">
                  {generatedIds.map((id, i) => (
                    <div key={i} className="font-mono truncate bg-gray-50 px-2 py-1 rounded">{id}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {currentView === 'drive' && (
            <div className="bg-white border-b border-[#F0FDFA] p-4 space-y-3">
              <div className="flex items-center space-x-3">
                <div className="flex-1 relative">
                  <svg className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-[#5f6368]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search files by name..."
                    className="w-full text-black pl-10 pr-4 py-2 border border-[#dadce0] rounded-lg focus:outline-none focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20 text-sm"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[#5f6368] hover:text-[#202124]"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>

                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`px-4 py-2 border rounded-lg text-sm font-medium transition-all flex items-center space-x-2 ${
                    showFilters || hasActiveFilters
                      ? 'border-[#0D9488] text-[#0D9488] bg-[#F0FDFA]'
                      : 'border-[#dadce0] text-[#5f6368] hover:bg-[#f8f9fa]'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  <span>Filters</span>
                  {hasActiveFilters && (
                    <span className="bg-[#0D9488] text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                      {[searchQuery, fileTypeFilter !== 'all', ownerFilter !== 'all'].filter(Boolean).length}
                    </span>
                  )}
                </button>

                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="px-3 py-2 text-sm text-[#5f6368] hover:text-[#202124] hover:bg-[#f8f9fa] rounded-lg"
                  >
                    Clear all
                  </button>
                )}
              </div>

              {showFilters && (
                <div className="flex items-center space-x-3 pt-2 border-t border-[#F0FDFA]">
                  <div className="flex-1">
                    <label className="block text-xs text-[#5f6368] mb-1 font-medium">File Type</label>
                    <select
                      value={fileTypeFilter}
                      onChange={(e) => setFileTypeFilter(e.target.value)}
                      className="w-full px-3 py-2 text-black border border-[#dadce0] rounded-lg focus:outline-none focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20 text-sm"
                    >
                      <option value="all">All types</option>
                      <option value="folder">Folders</option>
                      <option value="document">GridwellDocs</option>
                      <option value="spreadsheet">GridwellSheets</option>
                      <option value="presentation">GridwellSlides</option>
                      <option value="pdf">PDF</option>
                      <option value="image">Images</option>
                      <option value="video">Videos</option>
                    </select>
                  </div>
                  {uniqueOwners.length > 0 && (
                    <div className="flex-1">
                      <label className="block text-xs text-[#5f6368] mb-1 font-medium">Owner</label>
                      <select
                        value={ownerFilter}
                        onChange={(e) => setOwnerFilter(e.target.value)}
                        className="w-full px-3 py-2 text-black border border-[#dadce0] rounded-lg focus:outline-none focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20 text-sm"
                      >
                        <option value="all">All owners</option>
                        {uniqueOwners.map(owner => (
                          <option key={owner} value={owner}>{owner}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto bg-[#fafbfc]">
            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-red-700">{error}</span>
                  <button onClick={() => { setError(null); loadFiles() }} className="text-sm text-red-600 hover:underline">Retry</button>
                </div>
              </div>
            )}
              <div>
                {currentView === 'drive' && (
                  <Breadcrumbs breadcrumbs={breadcrumbs} onNavigate={navigateToBreadcrumb} />
                )}
                {currentView === 'shared_drives' && selectedSharedDrive && (
                  <Breadcrumbs breadcrumbs={sharedDriveBreadcrumbs} onNavigate={navigateSharedDriveBreadcrumb} />
                )}

                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold text-[#202124]">{viewTitle}</h2>
                    {currentView === 'drive' ? (
                      <p className="text-sm text-[#5f6368]">
                        {hasActiveFilters ? `${itemCount} results` : '15 GB free of 15 GB'}
                      </p>
                    ) : currentView === 'trash' ? (
                      <p className="text-sm text-[#5f6368]">
                        {trashFiles.length === 1 ? '1 item' : `${trashFiles.length} items`} in trash
                      </p>
                    ) : currentView === 'shared_drives' ? (
                      <p className="text-sm text-[#5f6368]">
                        {selectedSharedDrive
                          ? `${sharedDriveFiles.length === 1 ? '1 item' : `${sharedDriveFiles.length} items`}`
                          : `${sharedDrives.length === 1 ? '1 drive' : `${sharedDrives.length} drives`}`}
                      </p>
                    ) : null}
                  </div>
                </div>

                {currentView === 'shared_drives' && newSharedDriveModal && (
                  <div className="mb-6 bg-white border border-[#dadce0] p-4 rounded-lg">
                    <h3 className="text-sm font-medium mb-3 text-[#202124]">Create Shared Drive</h3>
                    <div className="flex space-x-2">
                      <input
                        value={sharedDriveName}
                        onChange={e => setSharedDriveName(e.target.value)}
                        placeholder="Drive name"
                        className="flex-1 px-3 py-2 border border-[#dadce0] rounded-lg text-sm text-gray-800"
                        autoFocus
                      />
                      <button
                        onClick={handleCreateSharedDrive}
                        disabled={creatingSharedDrive || !sharedDriveName.trim()}
                        className="px-4 py-2 bg-[#0D9488] text-white text-sm rounded-lg disabled:opacity-50"
                      >
                        {creatingSharedDrive ? 'Creating...' : 'Create'}
                      </button>
                      <button
                        onClick={() => { setNewSharedDriveModal(false); setSharedDriveName('') }}
                        className="px-3 py-2 text-[#5f6368] hover:bg-[#f1f3f4] rounded-lg text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {currentView === 'shared_drives' && editSharedDriveModal && (
                  <div className="mb-6 bg-teal-50 p-4 rounded-lg">
                    <h3 className="text-sm font-medium mb-3 text-[#202124]">Rename "{editSharedDriveModal.name}"</h3>
                    <div className="flex space-x-2">
                      <input
                        value={editSharedDriveName}
                        onChange={e => setEditSharedDriveName(e.target.value)}
                        className="flex-1 px-3 py-2 border border-[#dadce0] rounded-lg text-sm text-gray-800"
                        autoFocus
                      />
                      <button
                        onClick={handleUpdateSharedDrive}
                        disabled={updatingSharedDrive}
                        className="px-4 py-2 bg-[#0D9488] text-white text-sm rounded-lg disabled:opacity-50"
                      >
                        {updatingSharedDrive ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => setEditSharedDriveModal(null)}
                        className="px-3 py-2 text-[#5f6368] hover:bg-[#f1f3f4] rounded-lg text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {currentView === 'shared_drives' && !selectedSharedDrive ? (
                  <SharedDrivesGrid
                    drives={sharedDrives}
                    loading={loadingSharedDrives}
                    onOpen={openSharedDrive}
                    onEdit={(drive) => { setEditSharedDriveModal(drive); setEditSharedDriveName(drive.name) }}
                    onToggleHide={handleToggleHideSharedDrive}
                    onDelete={(drive) => handleDeleteSharedDrive(drive.id, drive.name)}
                    hidingId={hidingSharedDriveId}
                    deletingId={deletingSharedDriveId}
                  />
                ) : currentView === 'shared_drives' && selectedSharedDrive ? (
                  <FileGrid
                    files={sharedDriveFiles}
                    loading={loadingSharedDriveFiles}
                    mode="drive"
                    emptyTitle={sharedDriveFolderId ? 'This folder is empty' : 'This shared drive is empty'}
                    emptyDescription="No files here yet."
                    actions={{
                      ...fileCardActions,
                      onNavigateFolder: navigateSharedDriveFolder,
                    }}
                    canOpenInApp={!!openWindow}
                    openMenuFileId={openMenuFileId}
                    setOpenMenuFileId={setOpenMenuFileId}
                    downloading={downloading}
                  />
                ) : (
                  <FileGrid
                    files={currentFiles}
                    loading={loading}
                    mode={currentView === 'drive' ? 'drive' : 'trash'}
                    emptyTitle={
                      currentView === 'drive'
                        ? (hasActiveFilters ? 'No files found' : `No files in ${viewTitle}`)
                        : 'Trash is empty'
                    }
                    emptyDescription={
                      currentView === 'drive'
                        ? (hasActiveFilters ? 'Try adjusting your search or filters.' : 'Create a new file or folder to get started.')
                        : 'No deleted files.'
                    }
                    actions={fileCardActions}
                    canOpenInApp={!!openWindow}
                    openMenuFileId={openMenuFileId}
                    setOpenMenuFileId={setOpenMenuFileId}
                    downloading={downloading}
                    restoring={restoring}
                  />
                )}
              </div>
          </div>
        </div>
      </div>
    </div>
  )
}
