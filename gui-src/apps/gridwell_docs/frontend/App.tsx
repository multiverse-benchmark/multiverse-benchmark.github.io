import { useState, useEffect, useCallback, useRef } from 'react'
import { useBackendAPI } from '@shared/hooks/useBackendAPI'
import { MessageSquare, X, Send, Trash2, Check, Edit2, Reply as ReplyIcon, MoreVertical, Filter, User } from 'lucide-react'

const APP_NAME = "GridwellDocs";

// Helpers
const getAvatarColor = (name: string = '') => {
  const colors = [
    'bg-red-100 text-red-600 border-red-200',
    'bg-green-100 text-green-600 border-green-200',
    'bg-teal-100 text-teal-600 border-teal-200',
    'bg-amber-100 text-amber-600 border-amber-200',
    'bg-purple-100 text-purple-600 border-purple-200', 
    'bg-pink-100 text-pink-600 border-pink-200',
    'bg-teal-100 text-teal-600 border-teal-200',
    'bg-cyan-100 text-cyan-600 border-cyan-200'
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

const timeAgo = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "y";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "mo";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m";
    return "now";
}

interface Document {
  id: string
  name: string
  mimeType: string
  createdTime: string
  modifiedTime: string
  starred: boolean
  size: string
  owners: string[]
  content: ContentElement[]
  permissions?: any[]
  namedRanges?: any
  suggestionsViewMode?: string
  documentStyle?: any
  revisions?: any[]
}

interface ContentElement {
  elementId: string
  text?: string
  paragraph?: {
    elements?: TextElement[]
    paragraphStyle?: {
      namedStyleType?: string
      alignment?: string
    }
  }
  table?: {
    rows: number
    columns: number
    tableRows: TableRow[]
  }
  sectionBreak?: {
    sectionStyle?: unknown
  }
}

interface TextElement {
  elementId?: string
  textRun?: {
    content: string
    textStyle?: TextStyle
  }
}

interface TextStyle {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  fontSize?: {
    magnitude?: number
    unit?: string
  }
  foregroundColor?: {
    color?: {
      rgbColor?: {
        red?: number
        green?: number
        blue?: number
      }
    }
  }
}

interface TableRow {
  tableCells: TableCell[]
}

interface TableCell {
  content: ContentElement[]
}

interface Reply {
  id: string
  content: string
  author: { displayName?: string; emailAddress?: string; photoLink?: string; me?: boolean }
  createdTime: string
}

interface Comment {
  id: string
  content: string
  author: { displayName?: string; emailAddress?: string; photoLink?: string; me?: boolean }
  createdTime: string
  resolved: boolean
  replies: Reply[]
  quotedFileContent?: { value?: string }
}

interface AppProps {
  onClose: () => void
  setRefreshHandler?: (handler: (() => void) | null) => void
  initialFileId?: string
}

type View = 'list' | 'editor'

// Constants
const PAGE_SIZES: Record<string, { width: number; height: number; name: string }> = {
  'LETTER': { width: 612, height: 792, name: 'Letter (8.5" x 11")' },
  'TABLOID': { width: 792, height: 1224, name: 'Tabloid (11" x 17")' },
  'LEGAL': { width: 612, height: 1008, name: 'Legal (8.5" x 14")' },
  'A3': { width: 841.9, height: 1190.6, name: 'A3 (29.7cm x 42cm)' },
  'A4': { width: 595.3, height: 841.9, name: 'A4 (21cm x 29.7cm)' },
  'A5': { width: 419.5, height: 595.3, name: 'A5 (14.8cm x 21cm)' },
}

// Helper to persist starred state in localStorage since backend API doesn't support starred field updates
const STARRED_STORAGE_KEY = 'gridwell_docs_starred_ids'
const getStarredIds = (): Set<string> => {
  try {
    const stored = localStorage.getItem(STARRED_STORAGE_KEY)
    return stored ? new Set(JSON.parse(stored)) : new Set()
  } catch { return new Set() }
}
const saveStarredIds = (ids: Set<string>) => {
  try { localStorage.setItem(STARRED_STORAGE_KEY, JSON.stringify([...ids])) } catch { /* storage full or unavailable */ }
}

export default function GridwellDocsApp({ setRefreshHandler, initialFileId }: AppProps) {
  const [view, setView] = useState<View>('list')
  const [documents, setDocuments] = useState<Document[]>([])
  const [currentDocument, setCurrentDocument] = useState<Document | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newDocTitle, setNewDocTitle] = useState('')
  const [editorHtml, setEditorHtml] = useState('')
  const [isBold, setIsBold] = useState(false)
  const [isItalic, setIsItalic] = useState(false)
  const [isUnderline, setIsUnderline] = useState(false)
  const [isStrikethrough, setIsStrikethrough] = useState(false)
  const [fontSize, setFontSize] = useState('11')
  const [fontColor, setFontColor] = useState('#000000')
  const [fontFamily, setFontFamily] = useState('Arial')
  const [headingStyle, setHeadingStyle] = useState('normal')
  const [alignment, setAlignment] = useState('left')
  const [showTableDialog, setShowTableDialog] = useState(false)
  const [tableRows, setTableRows] = useState('3')
  const [tableCols, setTableCols] = useState('3')
  const [showLinkDialog, setShowLinkDialog] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkText, setLinkText] = useState('')
  const [showFindReplaceDialog, setShowFindReplaceDialog] = useState(false)
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [showImageDialog, setShowImageDialog] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [showEquationDialog, setShowEquationDialog] = useState(false)
  const [equationLatex, setEquationLatex] = useState('')
  const [showChartDialog, setShowChartDialog] = useState(false)
  const [chartType, setChartType] = useState('bar')
  const [chartData, setChartData] = useState('')
  const [chartTitle, setChartTitle] = useState('')
  const [headerHtml, setHeaderHtml] = useState('')
  const [footerHtml, setFooterHtml] = useState('')
  const [showHeader, setShowHeader] = useState(false)
  const [showFooter, setShowFooter] = useState(false)
  const [pages, setPages] = useState<string[]>(['<p><br></p>'])
  const [showDocStyleDialog, setShowDocStyleDialog] = useState(false)
  const [showDetailsDialog, setShowDetailsDialog] = useState(false)
  const [showWordCountDialog, setShowWordCountDialog] = useState(false)
  const [showWordCount, setShowWordCount] = useState(false)
  const [wordCountTick, setWordCountTick] = useState(0)
  const [pageMarginTop, setPageMarginTop] = useState('1')
  const [spellCheck, setSpellCheck] = useState(true)
  const [pageMarginRight, setPageMarginRight] = useState('1')
  const [pageMarginBottom, setPageMarginBottom] = useState('1')
  const [pageMarginLeft, setPageMarginLeft] = useState('1')
  const [pageBackground, setPageBackground] = useState('#ffffff')
  const [pageOrientation, setPageOrientation] = useState<'portrait' | 'landscape'>('portrait')
  const [pageSizeName, setPageSizeName] = useState('LETTER')
  const [displayMode, setDisplayMode] = useState<'grid' | 'table'>('grid')
  const [sortBy, setSortBy] = useState('modifiedTime desc')
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(100)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error' | null>(null)
  
  // Comments State
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [loadingComments, setLoadingComments] = useState(false)
  const [newCommentContent, setNewCommentContent] = useState('')
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editCommentContent, setEditCommentContent] = useState('')
  const [replyTexts, setReplyTexts] = useState<{[commentId: string]: string}>({})

  // Sharing/Permissions State
  const [showSharingDialog, setShowSharingDialog] = useState(false)
  const [permissions, setPermissions] = useState<any[]>([])
  const [loadingPermissions, setLoadingPermissions] = useState(false)
  const [newShareEmail, setNewShareEmail] = useState('')
  const [newShareRole, setNewShareRole] = useState('reader')

  // Revision History State
  const [showRevisionHistory, setShowRevisionHistory] = useState(false)
  const [revisions, setRevisions] = useState<any[]>([])
  const [loadingRevisions, setLoadingRevisions] = useState(false)

  // Suggested Edits State
  const [showSuggestedEdits, setShowSuggestedEdits] = useState(false)
  const [suggestionsViewMode, setSuggestionsViewMode] = useState('DEFAULT_FOR_CURRENT_ACCESS')

  // Named Ranges State
  const [showNamedRanges, setShowNamedRanges] = useState(false)
  const [namedRanges, setNamedRanges] = useState<{name: string, ranges: any[]}[]>([])

  // Full Screen State
  const [isFullScreen, setIsFullScreen] = useState(false)
  const fullScreenContainerRef = useRef<HTMLDivElement>(null)

  // Sync fullscreen state with browser Fullscreen API events + Escape key fallback
  useEffect(() => {
    const onFullScreenChange = () => {
      if (!document.fullscreenElement) {
        setIsFullScreen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) {
        setIsFullScreen(false)
      }
    }
    document.addEventListener('fullscreenchange', onFullScreenChange)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('fullscreenchange', onFullScreenChange)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const toggleFullScreen = useCallback(() => {
    if (!isFullScreen) {
      const el = fullScreenContainerRef.current
      if (el && el.requestFullscreen) {
        el.requestFullscreen().catch(() => {
          // Fallback: just toggle CSS-based full screen
        })
      }
      setIsFullScreen(true)
    } else {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {})
      }
      setIsFullScreen(false)
    }
  }, [isFullScreen])

  // Save Queue Refs
  const isSavingRef = useRef(false)
  const hasPendingSaveRef = useRef(false)
  const currentDocumentRef = useRef<Document | null>(null)

  // Sync ref with state
  useEffect(() => {
    currentDocumentRef.current = currentDocument
  }, [currentDocument])
  
  // Table Selection State
  const [isTableSelected, setIsTableSelected] = useState(false)

  // Monitor selection to detect if inside table
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0) {
        setIsTableSelected(false)
        return
      }

      let node = selection.anchorNode
      let foundTable = false
      
      // Traverse up to find table
      while (node && node !== document.body) {
        if (node.nodeName === 'TD' || node.nodeName === 'TH' || node.nodeName === 'TABLE') {
          foundTable = true
          break
        }
        node = node.parentNode
      }
      
      setIsTableSelected(foundTable)
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
    }
  }, [])
  
  // Ruler State
  const [showRuler, setShowRuler] = useState(true)
  const rulerRef = useRef<HTMLDivElement>(null)
  const [draggingMargin, setDraggingMargin] = useState<'left' | 'right' | null>(null)
  
  // Placeholder State
  const [isFirstPageEmpty, setIsFirstPageEmpty] = useState(true)

  // Document Outline State
  const [showOutline, setShowOutline] = useState(false)
  const [outlineHeadings, setOutlineHeadings] = useState<{id: string, text: string, level: number}[]>([])

  const updateHeadings = useCallback(() => {
    // We update headings even if outline is hidden so that it's ready when opened, 
    // but we can debounce or throttle if performance is an issue.
    // For now, let's only update if we think it's useful or if outline is open.
    if (!showOutline) return

    const newHeadings: {id: string, text: string, level: number}[] = []
    
    pageRefs.current.forEach((page, pageIndex) => {
      if (!page) return
      const headers = page.querySelectorAll('h1, h2, h3, h4, h5, h6')
      headers.forEach((header, headerIndex) => {
        const text = header.textContent || ''
        if (!text.trim()) return
        
        // Ensure ID for navigation
        if (!header.id) {
            header.id = `heading-${pageIndex}-${headerIndex}-${Math.random().toString(36).slice(2, 11)}`
        }
        
        const tagName = header.tagName.toLowerCase()
        const level = parseInt(tagName.replace('h', ''))
        
        newHeadings.push({
            id: header.id,
            text: text,
            level: level
        })
      })
    })
    
    // Only update if changed to avoid re-renders (simple check)
    setOutlineHeadings(prev => {
        if (prev.length !== newHeadings.length) return newHeadings
        const differs = prev.some((h, i) => h.text !== newHeadings[i].text || h.id !== newHeadings[i].id)
        return differs ? newHeadings : prev
    })
  }, [showOutline])

  // Update headings when showOutline changes
  useEffect(() => {
      if (showOutline) {
          updateHeadings()
      }
  }, [showOutline, updateHeadings])

  // Ruler Drag Logic
  useEffect(() => {
    const handleUp = () => setDraggingMargin(null)
    
    const handleMove = (e: MouseEvent) => {
      if (!draggingMargin || !rulerRef.current) return

      const rect = rulerRef.current.getBoundingClientRect()
      const pixelsPerInch = 96 // Approximation for CSS inches
      
      // Calculate cursor position in inches relative to ruler start
      let pxPos = e.clientX - rect.left
      let inchPos = pxPos / pixelsPerInch
      
      const pageWidthInches = (pageOrientation === 'landscape' ? PAGE_SIZES[pageSizeName].height : PAGE_SIZES[pageSizeName].width) / 72

      // Clamp to ruler bounds
      inchPos = Math.max(0, Math.min(pageWidthInches, inchPos))
      
      // Snap to 1/8 inch (0.125)
      // inchPos = Math.round(inchPos * 8) / 8

      if (draggingMargin === 'left') {
        const rightMarginVal = parseFloat(pageMarginRight) || 0
        // Prevent crossing right margin (min 1 inch width)
        const maxLeft = pageWidthInches - rightMarginVal - 1
        const newLeft = Math.min(inchPos, maxLeft)
        setPageMarginLeft(newLeft.toFixed(2))
      } else {
        // Dragging right margin
        // Position relative to right edge is pageWidthInches - position
        const leftMarginVal = parseFloat(pageMarginLeft) || 0
        let newRight = pageWidthInches - inchPos
        
        // Prevent crossing left margin
        const maxRight = pageWidthInches - leftMarginVal - 1
        newRight = Math.min(newRight, maxRight)
        setPageMarginRight(newRight.toFixed(2))
      }
    }

    if (draggingMargin) {
      window.addEventListener('mouseup', handleUp)
      window.addEventListener('mousemove', handleMove)
    }

    return () => {
      window.removeEventListener('mouseup', handleUp)
      window.removeEventListener('mousemove', handleMove)
    }
  }, [draggingMargin, pageMarginLeft, pageMarginRight, pageSizeName, pageOrientation])

  // Editor Menu Bar State
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  
  // Column resizing state
  const [columnWidths, setColumnWidths] = useState({
    name: 450,
    owner: 200,
    modified: 200,
    size: 120
  })

  // Column resizing handler
  const handleColumnResize = (columnKey: keyof typeof columnWidths) => (e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.pageX
    const startWidth = columnWidths[columnKey]

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const diff = moveEvent.pageX - startX
      setColumnWidths(prev => ({
        ...prev,
        [columnKey]: Math.max(100, startWidth + diff)
      }))
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'col-resize'
  }

  // Calculate total table width for fixed layout
  const totalTableWidth = columnWidths.name + columnWidths.owner + columnWidths.modified + columnWidths.size + 80 // +80 for padding/actions

  const { callTool: callGridwellDocs } = useBackendAPI('gridwell_docs')
  const { callTool: callDrive } = useBackendAPI('gridwell_drive')

  const editorRef = useRef<HTMLDivElement | null>(null)
  
  // Comments Handlers
  const fetchComments = async () => {
    if (!currentDocument?.id) return
    setLoadingComments(true)
    try {
      const response = await callDrive('list_comments', { fileId: currentDocument.id })
      if (response && response.comments) {
        setComments(response.comments)
      }
    } catch (e) {
      console.error('Failed to load comments', e)
    } finally {
      setLoadingComments(false)
    }
  }

  useEffect(() => {
    if (showComments && currentDocument?.id) {
      fetchComments()
    }
  }, [showComments, currentDocument?.id])

  const handleCreateComment = async () => {
    if (!newCommentContent.trim() || !currentDocument?.id) return
    try {
      await callDrive('create_file_comment', { 
        fileId: currentDocument.id, 
        content: newCommentContent
      })
      setNewCommentContent('')
      fetchComments()
    } catch (e: any) {
      console.error('Failed to create comment', e)
      alert(`Failed to create comment: ${e.message || 'Unknown error'}`)
    }
  }

  const handleDeleteComment = async (commentId: string) => {
      if (!currentDocument?.id) return
      if (!confirm('Delete this comment?')) return
      try {
          await callDrive('delete_file_comment', { fileId: currentDocument.id, commentId })
          fetchComments()
      } catch (e: any) {
          console.error(e)
          alert(`Failed to delete comment: ${e.message}`)
      }
  }

  const startEditing = (comment: Comment) => {
    setEditingCommentId(comment.id)
    setEditCommentContent(comment.content)
  }

  const cancelEditing = () => {
    setEditingCommentId(null)
    setEditCommentContent('')
  }

  const handleUpdateComment = async (commentId: string) => {
    if (!editCommentContent.trim() || !currentDocument?.id) return
    try {
      await callDrive('update_file_comment', {
        fileId: currentDocument.id,
        commentId,
        body: { content: editCommentContent }
      })
      setEditingCommentId(null)
      fetchComments()
    } catch (e: any) {
      console.error('Failed to update comment', e)
      alert(`Failed to update comment: ${e.message}`)
    }
  }

   const handleResolveComment = async (commentId: string) => {
      if (!currentDocument?.id) return
      try {
         await callDrive('update_file_comment', {
             fileId: currentDocument.id,
             commentId,
             body: { resolved: true }
         })
         fetchComments()
      } catch (e) {
          console.error(e)
      }
   }

   const handleCreateReply = async (commentId: string) => {
     const text = replyTexts[commentId]?.trim()
     if (!text || !currentDocument?.id) return
     try {
       await callDrive('create_comment_reply', {
         fileId: currentDocument.id,
         commentId,
         body: { content: text }
       })
       setReplyTexts(prev => ({ ...prev, [commentId]: '' }))
       fetchComments()
     } catch (e: any) {
       console.error('Failed to create reply', e)
       alert(`Failed to add reply: ${e.message || 'Unknown error'}`)
     }
   }

  // Permissions Handlers
  const fetchPermissions = async () => {
    if (!currentDocument?.id) return
    setLoadingPermissions(true)
    try {
      const response = await callDrive('list_permissions', { fileId: currentDocument.id })
      if (response && response.permissions) {
        setPermissions(response.permissions)
      }
    } catch (e) {
      console.error('Failed to load permissions', e)
    } finally {
      setLoadingPermissions(false)
    }
  }

  useEffect(() => {
    if (showSharingDialog && currentDocument?.id) {
      fetchPermissions()
    }
  }, [showSharingDialog, currentDocument?.id])

  const handleShareDocument = async () => {
    if (!newShareEmail.trim() || !currentDocument?.id) return
    try {
      await callDrive('create_permission', {
        fileId: currentDocument.id,
        body: { type: 'user', role: newShareRole, emailAddress: newShareEmail }
      })
      setNewShareEmail('')
      fetchPermissions()
    } catch (e: any) {
      console.error('Failed to share', e)
      alert(`Failed to share: ${e.message || 'Unknown error'}`)
    }
  }

  const handleRemovePermission = async (permissionId: string) => {
    if (!currentDocument?.id) return
    try {
      await callDrive('delete_permission', { fileId: currentDocument.id, permissionId })
      fetchPermissions()
    } catch (e: any) {
      console.error('Failed to remove permission', e)
    }
  }

  // Revision History Handlers
  const fetchRevisions = async () => {
    if (!currentDocument?.id) return
    setLoadingRevisions(true)
    try {
      const response = await callDrive('list_file_revisions', { file_id: currentDocument.id })
      if (response && response.revisions) {
        setRevisions(response.revisions)
      }
    } catch (e) {
      console.error('Failed to load revisions', e)
    } finally {
      setLoadingRevisions(false)
    }
  }

  useEffect(() => {
    if (showRevisionHistory && currentDocument?.id) {
      fetchRevisions()
    }
  }, [showRevisionHistory, currentDocument?.id])

  const titleInputRef = useRef<HTMLInputElement>(null)
  const pageRefs = useRef<(HTMLDivElement | null)[]>([])
  const isLoadingDocument = useRef(false)
  const savedRange = useRef<Range | null>(null)
  
  // Pagination State
  const pendingMoveRef = useRef<{ fromIndex: number, nodes: Node[] } | null>(null)

  useEffect(() => {
    // Handle pending content moves (pagination)
    if (pendingMoveRef.current) {
        const { fromIndex, nodes } = pendingMoveRef.current
        const targetPage = pageRefs.current[fromIndex + 1]
        
        if (targetPage) {
            // Restore nodes to target page - careful not to duplicate if re-running
            // We assume nodes were removed from DOM, they are in fragment or just detached
            if (targetPage.firstChild) {
                nodes.forEach(node => targetPage.insertBefore(node, targetPage.firstChild))
            } else {
                nodes.forEach(node => targetPage.appendChild(node))
            }
            
            // Try to restore cursor to the end of moved content
            const selection = window.getSelection()
            if (selection && nodes.length > 0) {
                 const lastNode = nodes[nodes.length - 1]
                 // If text node, go to end. If element, go inside end?
                 const range = document.createRange()
                 range.selectNodeContents(lastNode)
                 range.collapse(false)
                 selection.removeAllRanges()
                 selection.addRange(range)
            }
            
            pendingMoveRef.current = null
        }
    }
  }, [pages.length])

  // Table column resizing
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.classList.contains('column-resizer')) return
      
      e.preventDefault()
      e.stopPropagation()
      
      const td = target.parentElement as HTMLTableCellElement
      const table = td?.closest('table') as HTMLTableElement
      const tr = td?.parentElement as HTMLTableRowElement
      
      if (!table || !td || !tr) return
      
      const colIndex = Array.from(tr.children).indexOf(td)
      const startX = e.pageX
      const startWidth = td.offsetWidth
      
      // Get current table width
      const tableStartWidth = table.offsetWidth
      
      document.body.style.cursor = 'col-resize'
      
      const onMouseMove = (moveEvent: MouseEvent) => {
        moveEvent.preventDefault()
        const diff = moveEvent.pageX - startX
        const newWidth = Math.max(50, startWidth + diff)
        
        // Update table width to accommodate the change
        const newTableWidth = tableStartWidth + diff
        table.style.width = `${newTableWidth}px`
        
        // Update all cells in this column across all rows
        const rows = table.querySelectorAll('tr')
        rows.forEach(row => {
          const cell = row.children[colIndex] as HTMLElement
          if (cell) {
            cell.style.width = `${newWidth}px`
            cell.style.minWidth = `${newWidth}px`
          }
        })
      }
      
      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        document.body.style.cursor = ''
      }
      
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    }
    
    document.addEventListener('mousedown', handleMouseDown, true)
    
    return () => {
      document.removeEventListener('mousedown', handleMouseDown, true)
    }
  }, [])

  // Sync pages when document is loaded
  useEffect(() => {
    if (isLoadingDocument.current && pages.length > 0) {
      pages.forEach((pageContent: string, index: number) => {
        const pageRef = pageRefs.current[index]
        if (pageRef) {
          pageRef.innerHTML = pageContent
        }
      })
      isLoadingDocument.current = false
    }
  }, [pages])

  // Load documents from GridwellDrive (shared database)
  const loadDocuments = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Get all files from GridwellDrive and filter for GridwellDocs
      const result = await callDrive('list_user_files', {
        q: "mimeType = 'application/vnd.gridwell-apps.document' and trashed = false",
        orderBy: sortBy,
        pageSize: 1000,
        fields: 'files(id, name, mimeType, createdTime, modifiedTime, starred, size, owners)'
      })

      const docsWithContent = await Promise.all((result.files || []).map(async (file: any) => {
        let content = []
        try {
          const doc = await callGridwellDocs('get_document', { documentId: file.id })
          content = doc.content || []
        } catch (e) {
          // Fallback to GridwellDrive get_file for documents with domain-type permissions
          try {
            const driveFile = await callDrive('get_file_metadata_or_content', { fileId: file.id })
            content = driveFile.content || []
          } catch (e2) {
            console.warn(`Failed to load content for document ${file.id}`, e2)
          }
        }

        return {
          id: file.id,
          name: file.name || 'Untitled document',
          mimeType: file.mimeType,
          createdTime: file.createdTime,
          modifiedTime: file.modifiedTime,
          starred: file.starred || false,
          size: file.size || '0',
          owners: file.owners || [],
          content: content
        }
      }))

      // Apply starred state from localStorage since backend doesn't return it
      const starredIds = getStarredIds()
      const docsWithStarred = docsWithContent.map(doc => ({
        ...doc,
        starred: starredIds.has(doc.id)
      }))
      setDocuments(docsWithStarred)
    } catch (err: any) {
      console.error('Failed to load documents:', err)
      setError(err instanceof Error ? err.message : 'Failed to load documents')
    } finally {
      setLoading(false)
    }
  }, [callDrive, callGridwellDocs, sortBy])

  // Stable ref for loadDocuments to prevent re-render loops
  const loadDocumentsRef = useRef(loadDocuments)
  useEffect(() => {
    loadDocumentsRef.current = loadDocuments
  }, [loadDocuments])

  // Register refresh handler using stable ref
  useEffect(() => {
    if (!setRefreshHandler) return
    setRefreshHandler(() => loadDocumentsRef.current())
    return () => {
      if (setRefreshHandler) setRefreshHandler(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load initial documents
  useEffect(() => {
    loadDocuments()
  }, [loadDocuments])

  // Auto-open document if initialFileId is provided (from GridwellDrive cross-app navigation)
  const initialFileIdRef = useRef(initialFileId)
  useEffect(() => {
    if (initialFileIdRef.current && !loading && documents.length > 0 && !currentDocument) {
      openDocument(initialFileIdRef.current)
      initialFileIdRef.current = undefined
    }
  }, [loading, documents])

  // Create new document
  const createDocument = async () => {
    if (!newDocTitle.trim()) {
      setNewDocTitle('Untitled document')
    }

    try {
      const result = await callGridwellDocs('create_document', {
        title: newDocTitle.trim() || 'Untitled document'
      })

      setShowCreateDialog(false)
      setNewDocTitle('')
      await loadDocuments()

      // Open the newly created document
      if (result?.id) {
        openDocument(result.id)
      }
    } catch (err) {
      console.error('Failed to create document:', err)
      setError(err instanceof Error ? err.message : 'Failed to create document')
    }
  }

  // Open document in editor
  const openDocument = async (docId: string) => {
    setLoading(true)
    try {
      let result: any
      try {
        result = await callGridwellDocs('get_document', {
          documentId: docId
        })
      } catch (docErr: any) {
        // If get_document fails (e.g. due to domain-type permissions missing emailAddress),
        // fall back to GridwellDrive's get_file which has more lenient permission validation
        console.warn('get_document failed, falling back to GridwellDrive get_file:', docErr.message)
        const driveFile = await callDrive('get_file_metadata_or_content', { fileId: docId })
        // Sanitize permissions: ensure emailAddress exists on all entries (domain-type may lack it)
        if (driveFile.permissions) {
          driveFile.permissions = driveFile.permissions.map((p: any) => ({
            ...p,
            emailAddress: p.emailAddress || p.domain || ''
          }))
        }
        result = driveFile
      }

      setCurrentDocument(result)

      // Load named ranges
      if (result.namedRanges) {
        const ranges = Object.entries(result.namedRanges).map(([name, data]: [string, any]) => ({
          name,
          ranges: data?.namedRanges || data?.ranges || []
        }))
        setNamedRanges(ranges)
      } else {
        setNamedRanges([])
      }

      // Parse Document Style
      if (result.documentStyle) {
        const style = result.documentStyle
        
        // Background Color
        if (style.background?.color?.rgbColor) {
           const { red, green, blue } = style.background.color.rgbColor
           const toHex = (c: number) => {
             const hex = Math.round((c || 0) * 255).toString(16)
             return hex.length === 1 ? '0' + hex : hex
           }
           setPageBackground(`#${toHex(red)}${toHex(green)}${toHex(blue)}`)
        } else {
           setPageBackground('#ffffff')
        }

        // Margins (PT to Inches - standard 72 DPI for PDF/Print, but check API)
        const ptToInch = (pt: number) => (pt / 72).toFixed(2)
        if (style.marginTop?.unit === 'PT') setPageMarginTop(ptToInch(style.marginTop.magnitude))
        if (style.marginRight?.unit === 'PT') setPageMarginRight(ptToInch(style.marginRight.magnitude))
        if (style.marginBottom?.unit === 'PT') setPageMarginBottom(ptToInch(style.marginBottom.magnitude))
        if (style.marginLeft?.unit === 'PT') setPageMarginLeft(ptToInch(style.marginLeft.magnitude))

        // Page Size & Orientation
        if (style.pageSize) {
             const w = style.pageSize.width?.magnitude || 612
             const h = style.pageSize.height?.magnitude || 792
             
             // Check orientation
             if (w > h) {
                 setPageOrientation('landscape')
                 // Find matching size (swap w/h back to find key)
                 const match = Object.entries(PAGE_SIZES).find(([_, s]) => 
                    Math.abs(s.width - h) < 1 && Math.abs(s.height - w) < 1
                 )
                 setPageSizeName(match ? match[0] : 'CUSTOM')
             } else {
                 setPageOrientation('portrait')
                 const match = Object.entries(PAGE_SIZES).find(([_, s]) => 
                    Math.abs(s.width - w) < 1 && Math.abs(s.height - h) < 1
                 )
                 setPageSizeName(match ? match[0] : 'CUSTOM')
             }
        }
      } else {
        // Defaults
        setPageBackground('#ffffff')
        setPageMarginTop('1')
        setPageMarginRight('1')
        setPageMarginBottom('1')
        setPageMarginLeft('1')
        setPageOrientation('portrait')
        setPageSizeName('LETTER')
      }

      // Extract stored content from document
      const htmlContent = contentToHtml(result.content || [])
      const normalized = htmlContent ? sanitizeHtml(htmlContent) : ''
      isLoadingDocument.current = true
      setEditorHtml(normalized)
      setPages([normalized])
      
      // Init placeholder state
      setIsFirstPageEmpty(normalized === '' || normalized === '<p><br></p>')

      // Reset formatting state
      setIsBold(false)
      setIsItalic(false)
      setIsUnderline(false)
      setIsStrikethrough(false)
      setFontSize('11')
      setFontColor('#000000')
      setFontFamily('Arial')
      setAlignment('left')

      setView('editor')
    } catch (err) {
      console.error('Failed to load document:', err)
      setError(err instanceof Error ? err.message : 'Failed to load document')
    } finally {
      setLoading(false)
    }
  }

  // Delete document (move to trash)
  const deleteDocument = async (e: React.MouseEvent, docId: string) => {
    e.stopPropagation() // Prevent opening the document
    if (!window.confirm('Are you sure you want to move this document to trash?')) {
      return
    }

    setLoading(true)
    try {
      await callDrive('update_file_metadata_or_content', {
        fileId: docId,
        body: { trashed: true }
      })
      await loadDocuments()
    } catch (err) {
      console.error('Failed to delete document:', err)
      alert(err instanceof Error ? err.message : 'Failed to delete document')
    } finally {
      setLoading(false)
    }
  }

  // Convert structured content to HTML
  const contentToHtml = (content: ContentElement[]): string => {
    if (!content || content.length === 0) return ''

    const escapeHtml = (text: string) => text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

    const renderTextElement = (el: TextElement): string => {
      if (!el.textRun) return ''
      const text = el.textRun.content
      if (!text) return ''

      let html = escapeHtml(text).replace(/\n/g, '<br>')
      const style = el.textRun.textStyle
      if (!style) return html

      const styles: string[] = []
      if (style.bold) styles.push('font-weight: bold')
      if (style.italic) styles.push('font-style: italic')
      if (style.underline) styles.push('text-decoration: underline')
      if (style.strikethrough) styles.push('text-decoration: line-through')
      if (style.fontSize?.magnitude) styles.push(`font-size: ${style.fontSize.magnitude}pt`)
      if (style.foregroundColor?.color?.rgbColor) {
        const { red = 0, green = 0, blue = 0 } = style.foregroundColor.color.rgbColor
        const toHex = (c: number) => Math.round(c * 255).toString(16).padStart(2, '0')
        styles.push(`color: #${toHex(red)}${toHex(green)}${toHex(blue)}`)
      }

      if (styles.length > 0) {
        html = `<span style="${styles.join('; ')}">${html}</span>`
      }
      return html
    }

    const renderElements = (elements: ContentElement[]): string => {
      let html = ''
      for (const el of elements) {
        if (el.text) {
          html += `<p>${escapeHtml(el.text)}</p>`
        }
        if (el.paragraph) {
          const pStyle = el.paragraph.paragraphStyle
          const namedStyle = pStyle?.namedStyleType || ''
          const align = pStyle?.alignment ? `text-align: ${pStyle.alignment.toLowerCase()}` : ''

          const innerHtml = (el.paragraph.elements || []).map(renderTextElement).join('')

          const headingMap: Record<string, string> = {
            'HEADING_1': 'h1', 'HEADING_2': 'h2', 'HEADING_3': 'h3',
            'HEADING_4': 'h4', 'HEADING_5': 'h5', 'HEADING_6': 'h6'
          }

          const tag = headingMap[namedStyle] || 'p'
          const styleAttr = align ? ` style="${align}"` : ''
          html += `<${tag}${styleAttr}>${innerHtml || '<br>'}</${tag}>`
        }
        if (el.table?.tableRows) {
          html += '<table border="1" style="border-collapse: collapse; width: 100%;">'
          for (const row of el.table.tableRows) {
            html += '<tr>'
            for (const cell of row.tableCells) {
              html += '<td style="border: 1px solid #ccc; padding: 8px;">'
              html += renderElements(cell.content || [])
              html += '</td>'
            }
            html += '</tr>'
          }
          html += '</table>'
        }
      }
      return html
    }

    return renderElements(content)
  }

  // Extract stored content from document content
  const extractTextFromContent = (content: ContentElement[]): string => {
    const extractFromElements = (elements: ContentElement[]): string => {
      let text = ''
      for (const element of elements) {
        if (element.text) {
          text += element.text
        }
        if (element.paragraph?.elements) {
          for (const textEl of element.paragraph.elements) {
            if (textEl.textRun?.content) {
              text += textEl.textRun.content
            }
          }
        }
        if (element.table?.tableRows) {
          for (const row of element.table.tableRows) {
            for (const cell of row.tableCells) {
              text += extractFromElements(cell.content || [])
            }
          }
        }
      }
      return text
    }

    return extractFromElements(content || [])
  }

  const sanitizeHtml = (rawHtml: string) => {
    const parser = new DOMParser()
    const doc = parser.parseFromString(rawHtml, 'text/html')
    const allowedTags = new Set([
      'B',
      'STRONG',
      'I',
      'EM',
      'U',
      'SPAN',
      'DIV',
      'P',
      'BR',
      'UL',
      'OL',
      'LI',
      'FONT',
      'A',
      'IMG',
      'TABLE',
      'TR',
      'TD',
      'TH',
      'TBODY',
      'THEAD',
      'H1',
      'H2',
      'H3',
      'H4',
      'H5',
      'H6'
    ])
    const allowedStyleProps = new Set([
      'color',
      'font-size',
      'font-weight',
      'font-style',
      'text-decoration',
      'font-family',
      'cursor',
      'max-width',
      'height',
      'border',
      'border-collapse',
      'padding',
      'min-width',
      'margin-left',
      'page-break-after',
      'margin',
      'text-align',
      'border-top',
      'padding-top',
      'background-color',
      'list-style-type',
      'padding-left',
      'margin-bottom'
    ])

    const sanitizeNode = (node: Element) => {
      const children = Array.from(node.children)
      for (const child of children) {
        if (!allowedTags.has(child.tagName)) {
          const parent = child.parentNode
          while (child.firstChild) {
            parent?.insertBefore(child.firstChild, child)
          }
          child.remove()
          continue
        }

        const attributes = Array.from(child.attributes)
        for (const attr of attributes) {
          if (attr.name === 'style') {
            const safeStyles: string[] = []
            for (const rule of attr.value.split(';')) {
              const [propRaw, valueRaw] = rule.split(':')
              if (!propRaw || !valueRaw) continue
              const prop = propRaw.trim().toLowerCase()
              const value = valueRaw.trim()
              if (allowedStyleProps.has(prop)) {
                safeStyles.push(`${prop}: ${value}`)
              }
            }
            if (safeStyles.length > 0) {
              child.setAttribute('style', safeStyles.join('; '))
            } else {
              child.removeAttribute('style')
            }
            continue
          }

          if (attr.name !== 'color' && attr.name !== 'size' && attr.name !== 'face' && 
              attr.name !== 'href' && attr.name !== 'target' && attr.name !== 'rel' &&
              attr.name !== 'src' && attr.name !== 'alt' && attr.name !== 'width' && 
              attr.name !== 'height' && attr.name !== 'border' && attr.name !== 'cellpadding' &&
              attr.name !== 'cellspacing' && attr.name !== 'colspan' && attr.name !== 'rowspan' && 
              attr.name !== 'id') {
            child.removeAttribute(attr.name)
          }
        }

        sanitizeNode(child)
      }
    }

    if (doc.body) {
      sanitizeNode(doc.body)
    }

    return doc.body.innerHTML
  }

  const normalizeEditorHtml = (contentText: string) => {
    const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(contentText)
    if (looksLikeHtml) {
      return sanitizeHtml(contentText)
    }

    const escaped = contentText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br />')
    return escaped
  }

  const getContentLength = (content: ContentElement[] | undefined) => {
    return content ? content.length : 0
  }

  const normalizeColorValue = (value: string) => {
    const rgbMatch = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
    if (!rgbMatch) return value
    const toHex = (channel: string) => {
      const number = Math.max(0, Math.min(255, parseInt(channel, 10)))
      return number.toString(16).padStart(2, '0')
    }
    return `#${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`
  }

  const updateFormattingState = () => {
    if (pageRefs.current.length === 0) return
    setIsBold(document.queryCommandState('bold'))
    setIsItalic(document.queryCommandState('italic'))
    setIsUnderline(document.queryCommandState('underline'))
    setIsStrikethrough(document.queryCommandState('strikethrough'))
    
    const sizeValue = document.queryCommandValue('fontSize')
    const colorValue = document.queryCommandValue('foreColor')
    const fontValue = document.queryCommandValue('fontName')
    const blockValue = document.queryCommandValue('formatBlock')
    const alignValue = document.queryCommandValue('justifyLeft') ? 'left' : 
                       document.queryCommandValue('justifyCenter') ? 'center' :
                       document.queryCommandValue('justifyRight') ? 'right' :
                       document.queryCommandValue('justifyFull') ? 'justify' : 'left'
    
    if (sizeValue) {
      const sizeMap: Record<string, string> = {
        '1': '8',
        '2': '10',
        '3': '11',
        '4': '12',
        '5': '14',
        '6': '18',
        '7': '24'
      }
      setFontSize(sizeMap[sizeValue] || fontSize)
    }
    if (typeof colorValue === 'string' && colorValue) {
      setFontColor(normalizeColorValue(colorValue))
    }
    if (typeof fontValue === 'string' && fontValue) {
      setFontFamily(fontValue.replace(/['"]/g, ''))
    }
    if (typeof blockValue === 'string' && blockValue) {
      if (['h1','h2','h3','h4','h5','h6'].includes(blockValue.toLowerCase())) {
        setHeadingStyle(blockValue.toLowerCase())
      } else {
        setHeadingStyle('normal')
      }
    }
    setAlignment(alignValue)
  }

  const applyCommand = (command: string, value?: string) => {
    const selection = window.getSelection()
    if (!selection) return

    // Find which page the cursor is in
    let currentPage = null
    for (let i = 0; i < pageRefs.current.length; i++) {
      const pageEl = pageRefs.current[i]
      if (pageEl && (pageEl.contains(selection.anchorNode) || pageEl === document.activeElement)) {
        currentPage = pageEl
        break
      }
    }

    if (!currentPage) {
      // If no page found, use the first page
      currentPage = pageRefs.current[0]
    }

    if (!currentPage) return

    // Save selection before focus (focus can clear it)
    const savedSelRange = selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null

    currentPage.focus()

    // Restore selection after focus (focus may have cleared it)
    if (savedSelRange) {
      try {
        selection.removeAllRanges()
        selection.addRange(savedSelRange)
      } catch (_) { /* range may reference detached nodes */ }
    }

    document.execCommand('styleWithCSS', false, 'true')
    document.execCommand(command, false, value)
    updateFormattingState()
  }

  // Apply capitalization
  const applyCapitalization = (type: 'uppercase' | 'lowercase' | 'titlecase') => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return
    
    const range = selection.getRangeAt(0)
    const fragment = range.cloneContents()
    
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE && node.nodeValue) {
        if (type === 'uppercase') {
          node.nodeValue = node.nodeValue.toUpperCase()
        } else if (type === 'lowercase') {
          node.nodeValue = node.nodeValue.toLowerCase()
        } else if (type === 'titlecase') {
          node.nodeValue = node.nodeValue.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
        }
      } else {
        node.childNodes.forEach(walk)
      }
    }
    
    walk(fragment)
    
    const div = document.createElement('div')
    div.appendChild(fragment)
    document.execCommand('insertHTML', false, div.innerHTML)
  }

  // Insert table
  const insertTable = async () => {
    const rows = parseInt(tableRows) || 3
    const cols = parseInt(tableCols) || 3

    // Call backend insertTable operation
    if (currentDocument?.id) {
      try {
        await callGridwellDocs('batch_update_document', {
          documentId: currentDocument.id,
          requests: [{
            insertTable: {
              rows,
              columns: cols,
              location: { index: 1 }
            }
          }]
        })
      } catch (e) {
        console.error('Backend insertTable failed', e)
      }
    }

    const colWidth = Math.floor(100 / cols)

    let tableHtml = '<table border="1" style="border-collapse: collapse; width: 100%;">'

    for (let i = 0; i < rows; i++) {
      tableHtml += '<tr>'
      for (let j = 0; j < cols; j++) {
        tableHtml += `<td style="border: 1px solid #ccc; padding: 8px; min-width: 50px; width: ${colWidth}%; position: relative;">`
        tableHtml += '&nbsp;'
        // Add resizer handle to all columns
        tableHtml += '<div class="column-resizer" contenteditable="false" style="position: absolute; top: 0; right: -3px; width: 6px; height: 100%; cursor: col-resize; z-index: 10;"></div>'
        tableHtml += '</td>'
      }
      tableHtml += '</tr>'
    }
    tableHtml += '</table><p><br></p>'

    applyCommand('insertHTML', tableHtml)
    setShowTableDialog(false)
    setTableRows('3')
    setTableCols('3')
  }

  // Insert list
  const insertList = (type: 'ul' | 'ol') => {
    const selection = window.getSelection()
    if (!selection) return
    
    // Find which page the cursor is in
    let currentPage = null
    for (let i = 0; i < pageRefs.current.length; i++) {
      const pageEl = pageRefs.current[i]
      if (pageEl && pageEl.contains(selection.anchorNode)) {
        currentPage = pageEl
        break
      }
    }
    
    if (!currentPage) {
      currentPage = pageRefs.current[0]
    }
    
    if (!currentPage) return
    
    currentPage.focus()
    
    // Get selected text if any
    const selectedText = selection.toString().trim()
    
    // Use native execCommand for proper list behavior
    const command = type === 'ul' ? 'insertUnorderedList' : 'insertOrderedList'
    
    if (selectedText) {
      // If there's selected text, convert it to list
      document.execCommand(command, false, undefined)
    } else {
      // If no selection, just toggle list at cursor position
      document.execCommand(command, false, undefined)
    }
  }

  // Insert link
  const insertLink = () => {
    if (!linkUrl.trim()) return
    
    // Restore the saved range
    if (savedRange.current) {
      const selection = window.getSelection()
      if (selection) {
        selection.removeAllRanges()
        selection.addRange(savedRange.current)
      }
    }
    
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return
    
    // Find which page the cursor is in
    let currentPage = null
    for (let i = 0; i < pageRefs.current.length; i++) {
      const pageEl = pageRefs.current[i]
      if (pageEl && (pageEl.contains(selection.anchorNode) || pageEl === document.activeElement)) {
        currentPage = pageEl
        break
      }
    }
    
    if (!currentPage && pageRefs.current[0]) {
      currentPage = pageRefs.current[0]
    }
    
    if (!currentPage) return
    currentPage.focus()
    
    const url = linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`
    const displayText = linkText.trim() || selection.toString() || url
    
    // Create styled link HTML
    const linkHtml = `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: #0F766E; text-decoration: underline; cursor: pointer;">${displayText}</a>`
    
    document.execCommand('insertHTML', false, linkHtml)
    
    setShowLinkDialog(false)
    setLinkUrl('')
    setLinkText('')
    savedRange.current = null
  }

  // Insert image
  const insertImage = () => {
    if (!imageUrl.trim()) return
    
    // Restore the saved range
    if (savedRange.current) {
      const selection = window.getSelection()
      if (selection) {
        selection.removeAllRanges()
        selection.addRange(savedRange.current)
      }
    }
    
    const imgHtml = `<img src="${imageUrl}" style="max-width: 100%; height: auto;" />`
    applyCommand('insertHTML', imgHtml)
    
    setShowImageDialog(false)
    setImageUrl('')
    savedRange.current = null
  }

  // Insert Chart
  const insertChart = () => {
    const titleToUse = chartTitle.trim() || 'My Chart'
    const dataToUse = chartData.trim() || 'Label, Value\nA, 10\nB, 20\nC, 15'

    // Basic CSV parser
    const rows = dataToUse.split('\n').map(row => row.split(',').map(c => c.trim()))
    const labels = rows.map(r => r[0])
    const values = rows.map(r => parseFloat(r[1]) || 0)
    
    // Remove header if it looks like a header
    if (isNaN(values[0]) && rows.length > 1) {
        labels.shift()
        values.shift()
    }

    const canvas = document.createElement('canvas')
    canvas.width = 600
    canvas.height = 400
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Background
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    
    // Title
    ctx.fillStyle = '#000000'
    ctx.font = 'bold 20px Arial'
    ctx.textAlign = 'center'
    ctx.fillText(titleToUse, canvas.width / 2, 30)

    const colors = ['#0D9488', '#E11D48', '#F59E0B', '#059669', '#AB47BC', '#00ACC1', '#FF7043', '#9E9D24']
    
    const padding = 50
    const chartWidth = canvas.width - (padding * 2)
    const chartHeight = canvas.height - (padding * 2) - 30 // allow for title

    if (chartType === 'bar') {
        const barWidth = (chartWidth / values.length) * 0.7
        const spacing = (chartWidth / values.length) * 0.3
        const maxValue = Math.max(...values, 1)

        values.forEach((val, i) => {
             const h = (val / maxValue) * chartHeight
             const x = padding + (i * (barWidth + spacing)) + (spacing / 2)
             const y = canvas.height - padding - h
             
             ctx.fillStyle = colors[i % colors.length]
             ctx.fillRect(x, y, barWidth, h)
             
             // Label
             ctx.fillStyle = '#666'
             ctx.font = '12px Arial'
             ctx.textAlign = 'center'
             ctx.fillText(labels[i], x + barWidth/2, canvas.height - padding + 15)
             
             // Value
             ctx.fillStyle = '#333'
             ctx.fillText(val.toString(), x + barWidth/2, y - 5)
        })
        
        // Axis lines
        ctx.strokeStyle = '#ccc'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(padding, canvas.height - padding)
        ctx.lineTo(canvas.width - padding, canvas.height - padding) // X
        ctx.moveTo(padding, canvas.height - padding)
        ctx.lineTo(padding, canvas.height - padding - chartHeight) // Y
        ctx.stroke()

    } else if (chartType === 'pie') {
        const total = values.reduce((a, b) => a + b, 0)
        let startAngle = 0
        const radius = Math.min(chartWidth, chartHeight) / 2
        const cx = canvas.width / 2
        const cy = (canvas.height / 2) + 15

        values.forEach((val, i) => {
            const sliceAngle = (val / total) * 2 * Math.PI
            
            ctx.beginPath()
            ctx.moveTo(cx, cy)
            ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle)
            ctx.closePath()
            
            ctx.fillStyle = colors[i % colors.length]
            ctx.fill()
            
            // Label (simple placement)
            const midAngle = startAngle + sliceAngle / 2
            const lx = cx + Math.cos(midAngle) * (radius + 20)
            const ly = cy + Math.sin(midAngle) * (radius + 20)
            
            ctx.fillStyle = '#333'
            ctx.textAlign = midAngle > Math.PI/2 && midAngle < 3*Math.PI/2 ? 'right' : 'left'
            ctx.textBaseline = 'middle'
            ctx.font = '12px Arial'
            ctx.fillText(`${labels[i]}`, lx, ly)

            startAngle += sliceAngle
        })

    } else if (chartType === 'line') {
        const maxValue = Math.max(...values, 1)
        const stepX = chartWidth / Math.max(1, values.length - 1)
        
        // Draw grid
        ctx.strokeStyle = '#eee'
        ctx.lineWidth = 1
        ctx.beginPath()
        for(let i=0; i<=5; i++) {
             const y = canvas.height - padding - (i * chartHeight/5)
             ctx.moveTo(padding, y)
             ctx.lineTo(canvas.width - padding, y)
        }
        ctx.stroke()

        // Draw Line
        ctx.strokeStyle = '#0D9488'
        ctx.lineWidth = 3
        ctx.beginPath()
        values.forEach((val, i) => {
            const x = padding + (i * stepX)
            const y = canvas.height - padding - ((val / maxValue) * chartHeight)
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
        })
        ctx.stroke()
        
        // Draw Points & Labels
        values.forEach((val, i) => {
             const x = padding + (i * stepX)
             const y = canvas.height - padding - ((val / maxValue) * chartHeight)
             
             ctx.fillStyle = '#fff'
             ctx.strokeStyle = '#0D9488'
             ctx.lineWidth = 2
             ctx.beginPath()
             ctx.arc(x, y, 4, 0, Math.PI*2)
             ctx.fill()
             ctx.stroke()

             ctx.fillStyle = '#666'
             ctx.font = '12px Arial'
             ctx.textAlign = 'center'
             ctx.fillText(labels[i], x, canvas.height - padding + 15)
        })

         // Axis lines
        ctx.strokeStyle = '#ccc'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(padding, canvas.height - padding)
        ctx.lineTo(canvas.width - padding, canvas.height - padding) // X
        ctx.moveTo(padding, canvas.height - padding)
        ctx.lineTo(padding, canvas.height - padding - chartHeight) // Y
        ctx.stroke()
    }

    const dataUrl = canvas.toDataURL('image/png')
    
    // Restore range
    if (savedRange.current) {
        const selection = window.getSelection()
        if (selection) {
            selection.removeAllRanges()
            selection.addRange(savedRange.current)
        }
    }

    const imgHtml = `<img src="${dataUrl}" alt="${chartTitle}" style="max-width: 100%; border: 1px solid #ddd;" />`
    applyCommand('insertHTML', imgHtml)
    
    setShowChartDialog(false)
    savedRange.current = null
  }

  // Insert equation
  const insertEquation = () => {
    if (!equationLatex.trim()) return
    
    // Restore the saved range
    if (savedRange.current) {
      const selection = window.getSelection()
      if (selection) {
        selection.removeAllRanges()
        selection.addRange(savedRange.current)
      }
    }
    
    const encodedLatex = encodeURIComponent(equationLatex)
    const imgUrl = `https://latex.codecogs.com/svg.latex?${encodedLatex}`
    const imgHtml = `<img src="${imgUrl}" alt="${equationLatex}" style="vertical-align: middle; padding: 0 2px;" data-latex="${equationLatex.replace(/"/g, '&quot;')}" />`
    
    applyCommand('insertHTML', imgHtml)
    
    setShowEquationDialog(false)
    setEquationLatex('')
    savedRange.current = null
  }

  // Insert page break
  const insertPageBreak = () => {
    // Restore selection if available
    if (savedRange.current) {
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(savedRange.current)
    }

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return
    
    // Find which page the cursor is in
    let currentPageIndex = -1
    for (let i = 0; i < pageRefs.current.length; i++) {
      const pageEl = pageRefs.current[i]
      if (pageEl && pageEl.contains(selection.anchorNode)) {
        currentPageIndex = i
        break
      }
    }
    
    if (currentPageIndex === -1) return
    
    const currentPage = pageRefs.current[currentPageIndex]
    if (!currentPage) return
    
    try {
      const range = selection.getRangeAt(0)
      
      // Get content before and after cursor
      const beforeRange = document.createRange()
      beforeRange.selectNodeContents(currentPage)
      beforeRange.setEnd(range.startContainer, range.startOffset)
      
      const afterRange = document.createRange()
      afterRange.selectNodeContents(currentPage)
      afterRange.setStart(range.endContainer, range.endOffset)
      
      const beforeContent = beforeRange.cloneContents()
      const afterContent = afterRange.cloneContents()
      
      const beforeDiv = document.createElement('div')
      beforeDiv.appendChild(beforeContent)
      const beforeHtml = beforeDiv.innerHTML || '<p><br></p>'
      
      const afterDiv = document.createElement('div')
      afterDiv.appendChild(afterContent)
      const afterHtml = afterDiv.innerHTML || '<p><br></p>'
      
      // Update pages
      const newPages = [...pages]
      newPages[currentPageIndex] = beforeHtml
      newPages.splice(currentPageIndex + 1, 0, afterHtml)
      setPages(newPages)
      
      // Focus the new page after a short delay
      setTimeout(() => {
        const nextPage = pageRefs.current[currentPageIndex + 1]
        if (nextPage) {
          nextPage.focus()
          const newRange = document.createRange()
          const newSelection = window.getSelection()
          newRange.setStart(nextPage, 0)
          newRange.collapse(true)
          newSelection?.removeAllRanges()
          newSelection?.addRange(newRange)
        }
      }, 10)
    } catch (error) {
      console.error('Error inserting page break:', error)
    }
  }

  // Insert section break
  const insertSectionBreak = () => {
    // Restore selection if available
    if (savedRange.current) {
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(savedRange.current)
    }

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
        return
    }
    
    // Find which page the cursor is in
    let currentPageIndex = -1
    for (let i = 0; i < pageRefs.current.length; i++) {
      const pageEl = pageRefs.current[i]
      if (pageEl && pageEl.contains(selection.anchorNode)) {
        currentPageIndex = i
        break
      }
    }
    
    if (currentPageIndex === -1) return
    
    const currentPage = pageRefs.current[currentPageIndex]
    if (!currentPage) return
    
    currentPage.focus()
    
    const breakHtml = '<div class="page-break" contenteditable="false" style="border-top: 2px dashed #0D9488; margin: 30px 0; user-select: none; display: flex; justify-content: center; position: relative;"><span style="background: white; padding: 0 10px; color: #0D9488; font-size: 12px; margin-top: -10px;">Section Break (continuous)</span></div><p><br></p>'
    
    document.execCommand('insertHTML', false, breakHtml)
  }

  // --- Table of Contents Logic ---

  const scanHeadings = () => {
    const headings: {id: string, text: string, level: number}[] = []
    let hasDomChanges = false
    
    pageRefs.current.forEach((page, pageIndex) => {
      if (!page) return
      const headers = page.querySelectorAll('h1, h2, h3, h4, h5, h6')
      headers.forEach((header, headerIndex) => {
        const text = header.textContent || ''
        if (!text.trim()) return
        
        if (!header.id) {
            header.id = `heading-${pageIndex}-${headerIndex}-${Math.random().toString(36).slice(2, 11)}`
            hasDomChanges = true
        }
        
        const tagName = header.tagName.toLowerCase()
        const level = parseInt(tagName.replace('h', ''))
        
        headings.push({ id: header.id, text, level })
      })
    })
    return { headings, hasDomChanges }
  }

  const generateTocInnerHtml = (headings: {id: string, text: string, level: number}[]) => {
    if (headings.length === 0) return '<p style="color: #666; font-style: italic; padding: 8px;">No headings found.</p>'

    const minLevel = Math.min(...headings.map(h => h.level))
    let html = '<ul style="list-style-type: none; padding-left: 0; margin: 0;">'
    headings.forEach(h => {
        // Normalize indentation
        const indent = Math.max(0, h.level - minLevel) * 12
        // Professional styling
        html += `<li style="margin-bottom: 2px;">`
        html += `<a href="#${h.id}" onclick="event.preventDefault(); const el = document.getElementById('${h.id}'); if(el) el.scrollIntoView({behavior: 'smooth', block: 'start'});" style="text-decoration: none; color: #444746; font-size: 14px; display: block; padding: 4px 0 4px ${indent}px; border-radius: 4px; transition: background 0.1s;" onmouseover="this.style.backgroundColor='#f1f3f4'; this.style.color='#202124'" onmouseout="this.style.backgroundColor='transparent'; this.style.color='#444746'">${h.text}</a>`
        html += '</li>'
    })
    html += '</ul>'
    return html
  }

  // Register global refresh handler
  useEffect(() => {
    (window as any).refreshTableOfContents = (btn: HTMLElement) => {
        const { headings, hasDomChanges } = scanHeadings();
        if (hasDomChanges) {
             const newPages = pageRefs.current.map(p => p?.innerHTML || '')
             setPages(newPages)
        }
        
        const container = btn.closest('.toc-container');
        if (container) {
            const listContainer = container.querySelector('.toc-list-container');
            if (listContainer) {
                listContainer.innerHTML = generateTocInnerHtml(headings);
                // Trigger state update to persist changes
                const newPages = pageRefs.current.map(p => p?.innerHTML || '')
                setPages(newPages)
            }
        }
    };
    return () => { (window as any).refreshTableOfContents = null; }
  }) 

  // Insert Table of Contents
  const insertTableOfContents = () => {
    const { headings, hasDomChanges } = scanHeadings()

    if (headings.length === 0) {
        alert("No headings found. Add some Headings (Format > Paragraph styles) to generate a TOC.")
        return
    }

    if (hasDomChanges) {
        const newPages = pageRefs.current.map(p => p?.innerHTML || '')
        setPages(newPages)
    }

    // Build Container HTML
    let tocHtml = '<div contenteditable="false" class="toc-container" style="background: #fff; padding: 12px 16px; border-radius: 8px; border: 1px solid #dadce0; margin: 12px 0; max-width: 600px; box-shadow: 0 1px 2px rgba(60,64,67,0.1);">'
    
    // Header
    tocHtml += '<div class="toc-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 1px solid #f1f3f4; padding-bottom: 8px;">'
    tocHtml += '<span style="font-weight: 500; color: #202124; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Table of Contents</span>'
    // Refresh Button (Using unicode icon ↻)
    tocHtml += `<button title="Update Table of Contents" onclick="window.refreshTableOfContents && window.refreshTableOfContents(this)" style="background: none; border: none; cursor: pointer; color: #5f6368; font-size: 18px; line-height: 1; padding: 4px; border-radius: 50%;" onmouseover="this.style.backgroundColor='#f1f3f4'; this.style.color='#202124'" onmouseout="this.style.backgroundColor='transparent'; this.style.color='#5f6368'">↻</button>`
    tocHtml += '</div>'
    
    // List
    tocHtml += `<div class="toc-list-container">`
    tocHtml += generateTocInnerHtml(headings)
    tocHtml += '</div>'
    
    tocHtml += '</div><p><br></p>'

    // 3. Insert at cursor
    if (savedRange.current) {
      const selection = window.getSelection()
      if (selection) {
        selection.removeAllRanges()
        selection.addRange(savedRange.current)
      }
    }
    
    document.execCommand('insertHTML', false, tocHtml)
    savedRange.current = null
  }

  // --- Version History Logic ---

  // Apply heading style
  const applyHeadingStyle = (style: string) => {
    if (style === 'normal') {
      applyCommand('formatBlock', '<p>')
    } else {
      applyCommand('formatBlock', `<${style}>`)
    }
  }

  // Find and replace - iterate over text nodes only to avoid corrupting markup
  const findAndReplace = async () => {
    if (!findText) return

    // Call backend replaceAllText if document is saved
    if (currentDocument?.id) {
      try {
        await callGridwellDocs('batch_update_document', {
          documentId: currentDocument.id,
          requests: [{
            replaceAllText: {
              containsText: { text: findText, matchCase: false },
              replaceText: replaceText
            }
          }]
        })
      } catch (e) {
        console.error('Backend replaceAllText failed', e)
      }
    }

    // Also update DOM text nodes directly (safe, never touches tags/attributes)
    const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(escaped, 'gi')

    pageRefs.current.forEach((pageRef: HTMLDivElement | null) => {
      if (!pageRef) return
      const walker = document.createTreeWalker(pageRef, NodeFilter.SHOW_TEXT)
      const textNodes: Text[] = []
      while (walker.nextNode()) textNodes.push(walker.currentNode as Text)
      for (const node of textNodes) {
        if (regex.test(node.nodeValue || '')) {
          node.nodeValue = (node.nodeValue || '').replace(regex, replaceText)
        }
      }
    })

    setShowFindReplaceDialog(false)
    setFindText('')
    setReplaceText('')
  }

  const getAllText = () => {
    return pageRefs.current
      .filter((el): el is HTMLDivElement => el !== null)
      .map(el => el.innerText)
      .join('\n');
  };

  // Add table row below
  const addTableRowBelow = () => {
    const selection = window.getSelection()
    if (!selection) return
    
    let node = selection.anchorNode
    while (node && node.nodeName !== 'TR') {
      node = node.parentNode
    }
    
    if (node && node.nodeName === 'TR') {
      const tr = node as HTMLTableRowElement
      const newRow = tr.cloneNode(true) as HTMLTableRowElement
      newRow.querySelectorAll('td').forEach(td => td.innerHTML = '&nbsp;')
      tr.parentNode?.insertBefore(newRow, tr.nextSibling)
    }
  }

  // Add table row above
  const addTableRowAbove = () => {
    const selection = window.getSelection()
    if (!selection) return
    
    let node = selection.anchorNode
    while (node && node.nodeName !== 'TR') {
      node = node.parentNode
    }
    
    if (node && node.nodeName === 'TR') {
      const tr = node as HTMLTableRowElement
      const newRow = tr.cloneNode(true) as HTMLTableRowElement
      newRow.querySelectorAll('td').forEach(td => td.innerHTML = '&nbsp;')
      tr.parentNode?.insertBefore(newRow, tr)
    }
  }

  // Delete table row
  const deleteTableRow = () => {
    const selection = window.getSelection()
    if (!selection) return
    
    let node = selection.anchorNode
    while (node && node.nodeName !== 'TR') {
      node = node.parentNode
    }
    
    if (node && node.nodeName === 'TR') {
      node.parentNode?.removeChild(node)
    }
  }

  // Add table column right
  const addTableColumnRight = () => {
    const selection = window.getSelection()
    if (!selection) return
    
    let node = selection.anchorNode
    while (node && node.nodeName !== 'TD' && node.nodeName !== 'TH') {
      node = node.parentNode
    }
    
    if (node && (node.nodeName === 'TD' || node.nodeName === 'TH')) {
      const cell = node as HTMLTableCellElement
      const cellIndex = cell.cellIndex
      const table = cell.closest('table')
      
      if (table) {
        const rows = table.querySelectorAll('tr')
        rows.forEach(row => {
          const newCell = document.createElement('td')
          newCell.innerHTML = '&nbsp;'
          newCell.style.border = '1px solid #ccc'
          newCell.style.padding = '8px'
          newCell.style.minWidth = '50px'
          newCell.style.position = 'relative'
          
          // Add resizer handle
          const resizer = document.createElement('div')
          resizer.className = 'column-resizer'
          resizer.contentEditable = 'false'
          resizer.style.cssText = 'position: absolute; top: 0; right: -3px; width: 6px; height: 100%; cursor: col-resize; z-index: 10;'
          newCell.appendChild(resizer)
          
          if (row.cells[cellIndex]) {
            row.insertBefore(newCell, row.cells[cellIndex].nextSibling)
          } else {
            row.appendChild(newCell)
          }
        })
      }
    }
  }

  // Add table column left
  const addTableColumnLeft = () => {
    const selection = window.getSelection()
    if (!selection) return
    
    let node = selection.anchorNode
    while (node && node.nodeName !== 'TD' && node.nodeName !== 'TH') {
      node = node.parentNode
    }
    
    if (node && (node.nodeName === 'TD' || node.nodeName === 'TH')) {
      const cell = node as HTMLTableCellElement
      const cellIndex = cell.cellIndex
      const table = cell.closest('table')
      
      if (table) {
        const rows = table.querySelectorAll('tr')
        rows.forEach(row => {
          const newCell = document.createElement('td')
          newCell.innerHTML = '&nbsp;'
          newCell.style.border = '1px solid #ccc'
          newCell.style.padding = '8px'
          newCell.style.minWidth = '50px'
          newCell.style.position = 'relative'
          
          // Add resizer handle
          const resizer = document.createElement('div')
          resizer.className = 'column-resizer'
          resizer.contentEditable = 'false'
          resizer.style.cssText = 'position: absolute; top: 0; right: -3px; width: 6px; height: 100%; cursor: col-resize; z-index: 10;'
          newCell.appendChild(resizer)
          
          if (row.cells[cellIndex]) {
            row.insertBefore(newCell, row.cells[cellIndex])
          } else {
            row.appendChild(newCell)
          }
        })
      }
    }
  }

  // Delete table column
  const deleteTableColumn = () => {
    const selection = window.getSelection()
    if (!selection) return
    
    let node = selection.anchorNode
    while (node && node.nodeName !== 'TD' && node.nodeName !== 'TH') {
      node = node.parentNode
    }
    
    if (node && (node.nodeName === 'TD' || node.nodeName === 'TH')) {
      const cell = node as HTMLTableCellElement
      const cellIndex = cell.cellIndex
      const table = cell.closest('table')
      
      if (table) {
        const rows = table.querySelectorAll('tr')
        rows.forEach(row => {
          if (row.cells[cellIndex]) {
            row.deleteCell(cellIndex)
          }
        })
      }
    }
  }

  // Delete table
  const deleteTable = () => {
    const selection = window.getSelection()
    if (!selection) return
    
    let node = selection.anchorNode
    while (node && node.nodeName !== 'TABLE') {
      node = node.parentNode
    }
    
    if (node && node.nodeName === 'TABLE') {
        const table = node as HTMLTableElement
        table.remove()
        setIsTableSelected(false)
    }
  }

  // Save document changes
  const saveDocument = async (isAutosave = false) => {
    if (isSavingRef.current) {
      hasPendingSaveRef.current = true
      return
    }

    const docToSave = currentDocumentRef.current
    if (!docToSave) return

    isSavingRef.current = true
    setSaveStatus('saving')

    try {
      // Get the current content from all pages as plain text (not HTML)
      // Previously extracted innerHTML (HTML) and sent it as text,
      // causing content to be stored with HTML markup that gets double-encoded on reload
      const currentText = extractTextFromContent(docToSave.content || [])
      const allPagesText = pageRefs.current.map((ref: HTMLDivElement | null) => ref?.innerText || '').join('\n')

      // Calculate the difference and create batch update requests
      const requests = []

      // If content changed, replace all text
      // Normalize whitespace for comparison to avoid false positives
      const normalizedCurrent = currentText.replace(/\r\n/g, '\n').trim()
      const normalizedEditor = allPagesText.replace(/\r\n/g, '\n').trim()
      if (normalizedCurrent !== normalizedEditor) {
        const contentLength = getContentLength(docToSave.content)

        if (contentLength > 0) {
          requests.push({
            deleteContentRange: {
              range: {
                startIndex: 0,
                endIndex: contentLength
              }
            }
          })
        }

        if (normalizedEditor.length > 0) {
          requests.push({
            insertText: {
              location: {
                index: 0
              },
              text: allPagesText
            }
          })
        }
      }

      if (requests.length > 0) {
        await callGridwellDocs('batch_update_document', {
          documentId: docToSave.id,
          requests: requests
        })
      }

      // Reload the document to get updated content ONLY if not autosave
      // Autosave should be silent to avoid cursor jumps/flickering
      if (isAutosave !== true) {
        await openDocument(docToSave.id)
        await loadDocuments()
      } else {
        // Silent update for autosave:
        // We MUST update currentDocument state so the next save has the correct base for diffing.
        const result = await callGridwellDocs('get_document', { documentId: docToSave.id })
        
        setCurrentDocument(result)
        currentDocumentRef.current = result
        // do not setEditorHtml or setPages, preserving cursor/focus
      }
      setSaveStatus('saved')
    } catch (err) {
      console.error('Failed to save document:', err)
      setSaveStatus('error')
      if (isAutosave !== true) {
         setError(err instanceof Error ? err.message : 'Failed to save document')
      }
    } finally {
      isSavingRef.current = false
      if (hasPendingSaveRef.current) {
        hasPendingSaveRef.current = false
        saveDocument(true)
      }
    }
  }

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const checkPagination = useCallback(() => {
    const pageHeightPt = (pageOrientation === 'landscape' ? PAGE_SIZES[pageSizeName].width : PAGE_SIZES[pageSizeName].height)
    const pageHeightInch = pageHeightPt / 72
    const marginBottomInch = parseFloat(pageMarginBottom)
    const marginTopInch = parseFloat(pageMarginTop)
    
    // Allowed height in pixels (approx 96 DPI). Buffer of 20px for safety.
    const allowedHeightPx = (pageHeightInch - marginTopInch - marginBottomInch) * 96 - 20
    
    for (let i = 0; i < pageRefs.current.length; i++) {
        const pageEl = pageRefs.current[i]
        if (!pageEl) continue
        
        // Check if content overflows
        // We assume 1 inch = 96px for screen display consistency
        const pageRect = pageEl.getBoundingClientRect()
        const pageTop = pageRect.top
        
        const children = Array.from(pageEl.children)
        if (children.length === 0) continue
        
        let overflowIndex = -1
        
        // Find the first element that crosses the boundary
        for (let j = 0; j < children.length; j++) {
            const child = children[j] as HTMLElement
            // Get bottom relative to page content area
            const childBottomRel = child.getBoundingClientRect().bottom - pageTop
            
            if (childBottomRel > allowedHeightPx) {
                overflowIndex = j
                break
            }
        }
        
        // If we found overflow
        if (overflowIndex !== -1) {
            const overflowNodes = children.slice(overflowIndex)
            
            // 1. Remove from current page
            overflowNodes.forEach(node => {
                if (node.parentNode === pageEl) pageEl.removeChild(node)
            })
            
            // 2. Move to next page or create new one
            if (i < pageRefs.current.length - 1) {
                // Next page exists
                const nextPage = pageRefs.current[i + 1]
                if (nextPage) {
                   if (nextPage.firstChild) {
                       overflowNodes.forEach(n => nextPage.insertBefore(n, nextPage.firstChild))
                       // We modified next page, so we need to re-check it in next iteration?
                       // The loop continues to i+1, so it will be checked.
                   } else {
                       overflowNodes.forEach(n => nextPage.appendChild(n))
                   }
                }
            } else {
                // Create new page
                pendingMoveRef.current = { fromIndex: i, nodes: overflowNodes }
                // We must update state to trigger render of new page
                // We use function update to ensure we use latest state if stale
                setPages(prev => [...prev, '<p><br></p>'])
                return // Stop checking, let render cycle happen
            }
        }
    }
  }, [pageOrientation, pageSizeName, pageMarginTop, pageMarginBottom, pageRefs])

  const handleInput = () => {
    // Check for placeholder visibility
    if (pageRefs.current[0]) {
       const text = pageRefs.current[0].innerText.replace(/\n/g, '').trim()
       const hasMedia = pageRefs.current[0].querySelectorAll('img, table, hr').length > 0
       setIsFirstPageEmpty(text === '' && !hasMedia)
    }

    checkPagination()

    if (showWordCount) {
        setWordCountTick(t => t + 1)
    }
    
    if (showOutline) {
        updateHeadings()
    }

    if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
    }
    
    saveTimeoutRef.current = setTimeout(() => {
        saveDocument(true)
    }, 2000)
  }

  const applyPageSetup = async () => {
    if (!currentDocument) return

    try {
        // Get Base Dimensions from PAGE_SIZES
        const baseSize = PAGE_SIZES[pageSizeName] || PAGE_SIZES['LETTER']
        let widthPoints = baseSize.width
        let heightPoints = baseSize.height

        // Apply Orientation
        if (pageOrientation === 'landscape') {
            const temp = widthPoints
            widthPoints = heightPoints
            heightPoints = temp
        }

        // Convert Margins to Points (1 inch = 72 pt)
        const mt = parseFloat(pageMarginTop) * 72
        const mb = parseFloat(pageMarginBottom) * 72
        const ml = parseFloat(pageMarginLeft) * 72
        const mr = parseFloat(pageMarginRight) * 72

        // Convert Hex Background to RGB (0-1)
        const r = parseInt(pageBackground.slice(1, 3), 16) / 255
        const g = parseInt(pageBackground.slice(3, 5), 16) / 255
        const b = parseInt(pageBackground.slice(5, 7), 16) / 255

        const request = {
            updateDocumentStyle: {
                documentStyle: {
                    pageSize: {
                        width: { magnitude: widthPoints, unit: 'PT' },
                        height: { magnitude: heightPoints, unit: 'PT' }
                    },
                    marginTop: { magnitude: mt, unit: 'PT' },
                    marginBottom: { magnitude: mb, unit: 'PT' },
                    marginLeft: { magnitude: ml, unit: 'PT' },
                    marginRight: { magnitude: mr, unit: 'PT' },
                    background: {
                        color: {
                            rgbColor: { red: r, green: g, blue: b }
                        }
                    }
                }
            }
        }

        await callGridwellDocs('batch_update_document', {
            documentId: currentDocument.id,
            requests: [request]
        })
        
        setShowDocStyleDialog(false)
        // Refresh to ensure sync
        await openDocument(currentDocument.id)
    } catch (err) {
        console.error('Failed to update page setup:', err)
        alert('Failed to update page setup')
    }
  }


  const handleRename = async () => {
    if (!currentDocument) return
    try {
      await callDrive('update_file_metadata_or_content', {
        fileId: currentDocument.id,
        body: { name: currentDocument.name }
      })
      
      // Update document in list
      setDocuments(documents.map(d => 
        d.id === currentDocument.id ? { ...d, name: currentDocument.name } : d
      ))
    } catch (err) {
      console.error('Failed to rename document:', err)
    }
  }



  const handleMoveToTrash = async () => {
     if (!currentDocument) return
     if (!confirm('Are you sure you want to move this document to trash?')) return
     
     try {
       await callDrive('update_file_metadata_or_content', {
         fileId: currentDocument.id,
         body: { trashed: true }
       })
       backToList()
       await loadDocuments()
     } catch (err) {
       console.error('Failed to move to trash:', err)
       alert('Failed to move to trash')
     }
  }

  const handleNewDocument = () => {
    setView('list')
    setShowCreateDialog(true)
    setNewDocTitle('Untitled document')
  }

  // Toggle star state locally and persist to localStorage
  const toggleStar = (e: React.MouseEvent, docId: string, currentStarred: boolean) => {
    e.stopPropagation()
    const newStarred = !currentStarred
    setDocuments(prev => prev.map(d => d.id === docId ? { ...d, starred: newStarred } : d))
    const starredIds = getStarredIds()
    if (newStarred) { starredIds.add(docId) } else { starredIds.delete(docId) }
    saveStarredIds(starredIds)
  }

  // Back to document list
  const backToList = () => {
    setView('list')
    setCurrentDocument(null)
    isLoadingDocument.current = true
    setEditorHtml('')
    setPages(['<p><br></p>'])
    setIsBold(false)
    setIsItalic(false)
    setIsUnderline(false)
    setIsStrikethrough(false)
    setFontSize('11')
    setFontColor('#000000')
    setFontFamily('Arial')
    setAlignment('left')
  }

  // Format file size
  const formatSize = (sizeStr: string, element: Document) => {
    let size = parseInt(sizeStr || '0', 10)
    
    // If backend reports 0 size but we have content, calculate size locally
    // This handles cases where backend simulation doesn't update size automatically
    if (size === 0 && element.content) {
        // Simple approximation of text size
        const calculateContentSize = (items: any[]): number => {
            let s = 0;
            if (!items) return 0;
            
            for (const item of items) {
                if (item.text) {
                    s += new TextEncoder().encode(item.text).length;
                }
                if (item.table && item.table.tableRows) {
                    for (const row of item.table.tableRows) {
                        if (row.tableCells) {
                            for (const cell of row.tableCells) {
                                if (cell.content) {
                                    s += calculateContentSize(cell.content);
                                }
                            }
                        }
                    }
                }
            }
            return s;
        };
        
        size = calculateContentSize(element.content);
    }
    
    if (size === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(size) / Math.log(k))
    return parseFloat((size / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  // Format timestamp
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    })
  }

  const getPreviewHtml = (content: ContentElement[]) => {
    const html = contentToHtml(content || [])
    if (!html.trim()) {
      return '<span class="text-gray-400">Start typing to see a preview.</span>'
    }
    return sanitizeHtml(html)
  }

  if (loading && documents.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-4 border-[#0D9488]/30 border-t-[#0D9488] rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-white gap-4">
        <p className="text-red-600">{error}</p>
        <button
          className="px-4 py-2 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded transition-colors font-medium"
          onClick={loadDocuments}
        >
          Retry
        </button>
      </div>
    )
  }

  // Document List View
  if (view === 'list') {
    return (
      <div className="h-full flex flex-col bg-[#f8f9fa]">
        {/* Header */}
        <div className="min-w-80 h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 ">
          <div className="flex items-center gap-3">
              <img src="./icons/gridwell_docs.svg" alt={APP_NAME} className="w-11 h-11" />
              <h1 className="text-xl font-normal text-gray-800">{APP_NAME}</h1>
          </div>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="px-4 py-2 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg transition-colors font-medium flex items-center gap-2"
          >
            <span className="text-lg">+</span>
            New Document
          </button>
        </div>

        {/* Create Dialog */}
        {showCreateDialog && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-96">
              <h2 className="text-xl font-medium text-gray-800 mb-4">Create new document</h2>
              <input
                type="text"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0D9488] focus:border-transparent"
                placeholder="Untitled document"
                value={newDocTitle}
                onChange={(e) => setNewDocTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') createDocument()
                  if (e.key === 'Escape') setShowCreateDialog(false)
                }}
                autoFocus
              />
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => {
                    setShowCreateDialog(false)
                    setNewDocTitle('')
                  }}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={createDocument}
                  className="px-4 py-2 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg transition-colors"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Document List */}
        <div className="flex-1 overflow-y-auto p-6">
          {documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                <span className="text-5xl">📄</span>
              </div>
              <p className="text-lg mb-2">No documents yet</p>
              <p className="text-sm text-gray-400">Create your first document to get started</p>
            </div>
          ) : (
            <div className="max-w-6xl mx-auto">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm uppercase tracking-wide text-gray-500">Recent documents</div>
                  <div className="text-sm text-gray-600">
                    {documents.length} {documents.length === 1 ? 'document' : 'documents'}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <button
                      onClick={() => setShowSortMenu(!showSortMenu)}
                      className="flex items-center gap-2 px-3 py-2.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700"
                      title="Sort documents"
                    >
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                      </svg>
                      <span>Sort</span>
                    </button>
                    {showSortMenu && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowSortMenu(false)}></div>
                        <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-100 z-20 py-1">
                          <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Sort by</div>
                          {[
                            { value: 'modifiedTime desc', label: 'Last modified (Newest first)' },
                            { value: 'modifiedTime', label: 'Last modified (Oldest first)' },
                            { value: 'name_natural', label: 'Name (A to Z)' },
                            { value: 'name_natural desc', label: 'Name (Z to A)' },
                          ].map((option) => (
                            <button
                              key={option.value}
                              onClick={() => {
                                setSortBy(option.value)
                                setShowSortMenu(false)
                              }}
                              className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between group hover:bg-gray-50 ${
                                sortBy === option.value ? 'text-[#0D9488] bg-teal-50' : 'text-gray-700'
                              }`}
                            >
                              <span>{option.label}</span>
                              {sortBy === option.value && (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 p-1">
                  <button
                    onClick={() => setDisplayMode('grid')}
                    className={`p-1.5 rounded-md transition-colors ${
                      displayMode === 'grid' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-700'
                    }`}
                    title="Grid view"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setDisplayMode('table')}
                    className={`p-1.5 rounded-md transition-colors ${
                      displayMode === 'table' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-700'
                    }`}
                    title="List view"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </button>
                </div>
                </div>
              </div>
              {displayMode === 'grid' ? (
              <div className="flex flex-wrap gap-4">
                {documents.map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => openDocument(doc.id)}
                    className="flex flex-col bg-white hover:border-teal-500 border rounded-md transition-all text-left group w-[220px] "
                  >
                    <div className="h-60 bg-gray-100 flex items-center justify-center rounded-md">
                      <div className="h-full bg-gray-50 shadow-sm overflow-hidden rounded-md">
                        <div
                          className="pointer-events-none origin-top-left"
                          style={{
                            width: '8.5in',
                            height: '12in',
                            transform: 'scale(0.247)'
                          }}
                        >
                          <div
                            className="text-gray-800"
                            style={{
                              fontFamily: 'Arial, sans-serif',
                              fontSize: '11pt',
                              lineHeight: '1.5',
                              padding: '0.8in'
                            }}
                            dangerouslySetInnerHTML={{ __html: getPreviewHtml(doc.content) }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="p-3 border-t border-gray-200">
                      <div className="flex items-center justify-between">
                         <div className="font-medium text-gray-900 truncate group-hover:text-[#0D9488] transition-colors flex-1" title={doc.name}>
                          {doc.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{doc.id}]</span>
                        </div>
                        <div className="flex items-center">
                          <button
                            onClick={(e) => toggleStar(e, doc.id, doc.starred)}
                            className="flex-shrink-0 ml-1 hover:scale-110 transition-transform"
                            title={doc.starred ? 'Remove star' : 'Add star'}
                          >
                            {doc.starred ? (
                              <span className="text-yellow-400 text-lg">★</span>
                            ) : (
                              <span className="text-gray-300 text-lg opacity-0 group-hover:opacity-100 transition-opacity">☆</span>
                            )}
                          </button>
                          <button
                            onClick={(e) => deleteDocument(e, doc.id)}
                            className="ml-2 p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-all"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      
                      <div className="text-sm text-gray-500 mt-1 flex items-center gap-2">
                        <img src="./icons/gridwell_docs.svg" alt="" className="w-4 h-4" />
                        <span>{formatDate(doc.modifiedTime)}</span>
                      </div>
                       <div className="flex items-center justify-between text-xs text-gray-400 mt-2 border-t border-gray-100 pt-1">
                          <span>{doc.owners && doc.owners.length > 0 ? doc.owners[0] : 'me'}</span>
                          <span>{formatSize(doc.size, doc)}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              ) : (
                <div className="bg-white border rounded-lg overflow-hidden overflow-x-auto">
                  <table 
                    className="text-left hidden md:table table-fixed"
                    style={{ minWidth: '100%', width: totalTableWidth }}
                  >
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th style={{ width: columnWidths.name }} className="relative px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Name
                          <div
                            className="absolute right-0 top-0 bottom-0 w-4 cursor-col-resize hover:bg-teal-400/20 z-10 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center translate-x-1/2"
                            onMouseDown={handleColumnResize('name')}
                          >
                             <div className="w-[1px] h-4 bg-gray-400"></div>
                          </div>
                        </th>
                        <th style={{ width: columnWidths.owner }} className="relative px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Owner
                          <div
                            className="absolute right-0 top-0 bottom-0 w-4 cursor-col-resize hover:bg-teal-400/20 z-10 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center translate-x-1/2"
                            onMouseDown={handleColumnResize('owner')}
                          >
                             <div className="w-[1px] h-4 bg-gray-400"></div>
                          </div>
                        </th>
                        <th style={{ width: columnWidths.modified }} className="relative px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Last Modified
                          <div
                            className="absolute right-0 top-0 bottom-0 w-4 cursor-col-resize hover:bg-teal-400/20 z-10 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center translate-x-1/2"
                            onMouseDown={handleColumnResize('modified')}
                          >
                             <div className="w-[1px] h-4 bg-gray-400"></div>
                          </div>
                        </th>
                        <th style={{ width: columnWidths.size }} className="relative px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Size
                          <div
                            className="absolute right-0 top-0 bottom-0 w-4 cursor-col-resize hover:bg-teal-400/20 z-10 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center translate-x-1/2"
                            onMouseDown={handleColumnResize('size')}
                          >
                             <div className="w-[1px] h-4 bg-gray-400"></div>
                          </div>
                        </th>
                        <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {documents.map((doc) => (
                        <tr key={doc.id} className="hover:bg-gray-50 transition-colors group cursor-pointer" onClick={() => openDocument(doc.id)}>
                          <td className="px-6 py-4 whitespace-nowrap overflow-hidden">
                            <div className="flex items-center gap-3">
                              {/* Star icon */}
                              <button
                                onClick={(e) => toggleStar(e, doc.id, doc.starred)}
                                className="hover:scale-110 transition-transform"
                                title={doc.starred ? 'Remove star' : 'Add star'}
                              >
                                {doc.starred ? (
                                  <span className="text-yellow-400 text-lg">★</span>
                                ) : (
                                  <span className="text-gray-300 text-lg">☆</span>
                                )}
                              </button>
                              <img src="./icons/gridwell_docs.svg" alt="" className="w-5 h-5 flex-shrink-0" />
                              <span className="font-medium text-gray-900 group-hover:text-[#0D9488] transition-colors overflow-hidden text-ellipsis truncate">{doc.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{doc.id}]</span></span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 overflow-hidden truncate">
                             {doc.owners && doc.owners.length > 0 ? doc.owners.join(', ') : 'me'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 overflow-hidden truncate">
                            {formatDate(doc.modifiedTime)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 overflow-hidden truncate">
                            {formatSize(doc.size, doc)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded transition-colors"
                                onClick={(e) => deleteDocument(e, doc.id)}
                                title="Delete"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {/* Mobile list view */}
                  <div className="md:hidden divide-y divide-gray-200">
                    {documents.map((doc) => (
                      <div key={doc.id} className="p-4 hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer" onClick={() => openDocument(doc.id)}>
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3 overflow-hidden">
                            <img src="./icons/gridwell_docs.svg" alt="" className="w-8 h-8 flex-shrink-0" />
                            <div className="min-w-0">
                              <div className="font-medium text-gray-900 truncate">{doc.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{doc.id}]</span></div>
                              <div className="text-xs text-gray-500 mt-0.5">Modified {formatDate(doc.modifiedTime)}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Document Editor View
  return (
    <div ref={fullScreenContainerRef} className={`h-full flex flex-col bg-[#f9fbfd]${isFullScreen ? ' fixed inset-0 z-[9999]' : ''}`}>
      {/* Header - hidden in full screen mode */}
      <div className="bg-white print:hidden" style={isFullScreen ? { display: 'none' } : undefined}>
        {/* Top Navigation Bar */}
        <div className="flex items-center px-4 pt-3 pb-1 gap-4">
          {/* Home / Icon */}
          <button
            onClick={backToList}
            className="flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-teal-500 rounded"
            title="Back to documents"
          >
            <img src="./icons/gridwell_docs.svg" alt={APP_NAME} className="w-10 h-10" />
          </button>

          {/* Title & Menu Container */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex items-center gap-2">
              <input
                ref={titleInputRef}
                type="text"
                className="font-normal text-lg text-gray-800 border border-transparent hover:border-gray-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-200 rounded px-1.5 py-0.5 w-64 transition-all"
                value={currentDocument?.name || ''}
                onChange={(e) => currentDocument && setCurrentDocument({...currentDocument, name: e.target.value})}
                onBlur={handleRename}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                placeholder="Untitled document"
                title="Rename document"
              />
              {currentDocument?.id && <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{currentDocument.id}]</span>}
            </div>
            
            {/* Menu Bar */}
            <div className="flex items-center gap-1 text-[13px] font-medium text-gray-600 select-none relative -ml-2" onMouseLeave={() => setActiveMenu(null)}>
              {/* File Menu */}
              <div className="relative">
                <button 
                  className={`hover:bg-gray-100 rounded-[4px] px-2 py-0.5 transition-colors ${activeMenu === 'file' ? 'bg-gray-100 text-gray-900' : ''}`}
                  onMouseEnter={() => activeMenu && setActiveMenu('file')}
                  onClick={() => setActiveMenu(activeMenu === 'file' ? null : 'file')}
                >
                  File
                </button>
                {activeMenu === 'file' && (
                  <div className="absolute top-full left-0 mt-0.5 w-64 bg-white rounded shadow-[0_2px_8px_rgba(0,0,0,0.2)] border border-gray-200 py-1.5 z-50">
                    <button 
                      onClick={() => { handleNewDocument(); setActiveMenu(null); }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                      <img src="./icons/gridwell_docs.svg" alt="" className="w-4 h-4" />
                      New document
                    </button>
                    <button 
                      onClick={() => { 
                          setActiveMenu(null); 
                          setTimeout(() => {
                              titleInputRef.current?.focus();
                              titleInputRef.current?.select();
                          }, 100);
                      }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                       <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      Rename
                    </button>
                    <button 
                      onClick={() => { handleMoveToTrash(); setActiveMenu(null); }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      Move to trash
                    </button>
                    <hr className="my-1.5 border-gray-200" />
                    <button
                      onClick={() => { setShowRevisionHistory(true); setActiveMenu(null); }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      Version history
                    </button>
                    <button
                      onClick={() => { setShowDetailsDialog(true); setActiveMenu(null); }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      Details
                    </button>
                  </div>
                )}
              </div>


              {/* Edit Menu */}
              <div className="relative">
                <button 
                  className={`hover:bg-gray-100 rounded-[4px] px-2 py-0.5 transition-colors ${activeMenu === 'edit' ? 'bg-gray-100 text-gray-900' : ''}`}
                  onMouseEnter={() => activeMenu && setActiveMenu('edit')}
                  onClick={() => setActiveMenu(activeMenu === 'edit' ? null : 'edit')}
                >
                  Edit
                </button>
                {activeMenu === 'edit' && (
                  <div className="absolute top-full left-0 mt-0.5 w-64 bg-white rounded shadow-[0_2px_8px_rgba(0,0,0,0.2)] border border-gray-200 py-1.5 z-50">
                    <button 
                      onClick={() => { document.execCommand('undo'); setActiveMenu(null); }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                      Undo <span className="ml-auto text-xs text-gray-400">Ctrl+Z</span>
                    </button>
                    <button 
                      onClick={() => { document.execCommand('redo'); setActiveMenu(null); }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" /></svg>
                      Redo <span className="ml-auto text-xs text-gray-400">Ctrl+Y</span>
                    </button>
                    <hr className="my-1.5 border-gray-200" />
                    <button 
                      onClick={() => { document.execCommand('cut'); setActiveMenu(null); }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" /></svg>
                      Cut <span className="ml-auto text-xs text-gray-400">Ctrl+X</span>
                    </button>
                    <button 
                      onClick={() => { document.execCommand('copy'); setActiveMenu(null); }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                      Copy <span className="ml-auto text-xs text-gray-400">Ctrl+C</span>
                    </button>
                    <button 
                      onClick={() => { 
                        navigator.clipboard.readText()
                          .then(text => document.execCommand('insertText', false, text))
                          .catch(() => alert('Please use Ctrl+V to paste')); 
                        setActiveMenu(null); 
                      }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                      Paste <span className="ml-auto text-xs text-gray-400">Ctrl+V</span>
                    </button>
                    <button 
                      onClick={() => { document.execCommand('selectAll'); setActiveMenu(null); }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                      <span className="w-4 h-4"></span>
                      Select all <span className="ml-auto text-xs text-gray-400">Ctrl+A</span>
                    </button>
                    <hr className="my-1.5 border-gray-200" />
                    <button 
                      onClick={() => { setShowFindReplaceDialog(true); setActiveMenu(null); }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                      Find and replace <span className="ml-auto text-xs text-gray-400">Ctrl+H</span>
                    </button>
                  </div>
                )}
              </div>

              {/* View Menu */}
              <div className="relative">
                <button 
                  className={`hover:bg-gray-100 rounded-[4px] px-2 py-0.5 transition-colors ${activeMenu === 'view' ? 'bg-gray-100 text-gray-900' : ''}`}
                  onMouseEnter={() => activeMenu && setActiveMenu('view')}
                  onClick={() => setActiveMenu(activeMenu === 'view' ? null : 'view')}
                >
                  View
                </button>
                {activeMenu === 'view' && (
                  <div className="absolute top-full left-0 mt-0.5 w-64 bg-white rounded shadow-[0_2px_8px_rgba(0,0,0,0.2)] border border-gray-200 py-1.5 z-50">
                    <button 
                      onClick={() => { setShowRuler(!showRuler); setActiveMenu(null); }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                      <span className="w-4 flex justify-center">{showRuler && '✓'}</span>
                      Show ruler
                    </button>
                    <button 
                      onClick={() => { setShowOutline(!showOutline); setActiveMenu(null); }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                      <span className="w-4 flex justify-center">{showOutline && '✓'}</span>
                      Show outline
                    </button>
                    <button
                      onClick={() => { setShowComments(!showComments); setActiveMenu(null); }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                      <span className="w-4 flex justify-center">{showComments && '✓'}</span>
                      Show comments
                    </button>
                    <button
                      onClick={() => { setShowSuggestedEdits(!showSuggestedEdits); setActiveMenu(null); }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                      <span className="w-4 flex justify-center">{showSuggestedEdits && '✓'}</span>
                      Show suggested edits
                    </button>
                    <button
                      onClick={() => { setShowNamedRanges(!showNamedRanges); setActiveMenu(null); }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                      <span className="w-4 flex justify-center">{showNamedRanges && '✓'}</span>
                      Show named ranges
                    </button>

                    <hr className="my-1.5 border-gray-200" />
                    
                    <button
                      onClick={() => {
                          toggleFullScreen();
                          setActiveMenu(null);
                      }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                      {isFullScreen ? 'Exit full screen' : 'Full screen'}
                    </button>

                     <button 
                      onClick={() => { setShowDocStyleDialog(true); setActiveMenu(null); }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                      <span className="w-4"></span>
                      Page setup
                    </button>
                  </div>
                )}
              </div>


              {/* Insert Menu */}
              <div className="relative">
                <button 
                  className={`hover:bg-gray-100 rounded-[4px] px-2 py-0.5 transition-colors ${activeMenu === 'insert' ? 'bg-gray-100 text-gray-900' : ''}`}
                  onMouseEnter={() => activeMenu && setActiveMenu('insert')}
                  onMouseDown={() => {
                    const selection = window.getSelection();
                    if (selection && selection.rangeCount > 0) {
                        savedRange.current = selection.getRangeAt(0);
                    }
                  }}
                  onClick={() => setActiveMenu(activeMenu === 'insert' ? null : 'insert')}
                >
                  Insert
                </button>
                {activeMenu === 'insert' && (
                  <div className="absolute top-full left-0 mt-0.5 w-64 bg-white rounded shadow-[0_2px_8px_rgba(0,0,0,0.2)] border border-gray-200 py-1.5 z-50">
                     <button 
                      onClick={() => { 
                        const selection = window.getSelection();
                        if (selection && selection.rangeCount > 0) {
                            savedRange.current = selection.getRangeAt(0);
                        }
                        setShowImageDialog(true); 
                        setActiveMenu(null); 
                      }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      Image
                    </button>
                    <button 
                      onClick={() => { 
                        const selection = window.getSelection();
                        if (selection && selection.rangeCount > 0) {
                            savedRange.current = selection.getRangeAt(0);
                        }
                        setShowEquationDialog(true); 
                        setActiveMenu(null); 
                      }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                       <span className="w-4 h-4 flex items-center justify-center font-serif italic font-bold text-gray-500">∑</span>
                      Equation
                    </button>
                    <button 
                      onClick={() => { 
                        const selection = window.getSelection();
                        if (selection && selection.rangeCount > 0) {
                            savedRange.current = selection.getRangeAt(0);
                        }
                        setShowTableDialog(true); 
                        setActiveMenu(null); 
                      }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                      <span className="w-4 h-4 flex items-center justify-center font-bold text-gray-500">⊞</span>
                      Table
                    </button>
                    <button 
                      onClick={() => { 
                        const selection = window.getSelection();
                        if (selection && selection.rangeCount > 0) {
                            savedRange.current = selection.getRangeAt(0);
                        }
                        setShowChartDialog(true);
                        setActiveMenu(null); 
                      }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                      Chart
                    </button>
                    <hr className="my-1.5 border-gray-200" />
                    
                    {/* Headers & Footers Submenu */}
                    <div className="relative group">
                       <button className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center justify-between text-sm text-gray-700">
                           <div className="flex items-center gap-3">
                               <span className="w-4 h-4 flex items-center justify-center text-gray-400">H</span>
                               Headers & footers
                           </div>
                           <svg className="w-4 h-4 text-gray-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                       </button>
                       <div className="absolute left-full top-0 w-40 bg-white rounded shadow-[0_2px_8px_rgba(0,0,0,0.2)] border border-gray-200 py-1 hidden group-hover:block ml-0.5">
                           <button 
                             onClick={() => { setShowHeader(true); setActiveMenu(null); }}
                             className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                           >
                             Header
                           </button>
                           <button 
                             onClick={() => { setShowFooter(true); setActiveMenu(null); }}
                             className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                           >
                             Footer
                           </button>
                       </div>
                    </div>

                    {/* Break Submenu */}
                    <div className="relative group">
                       <button className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center justify-between text-sm text-gray-700">
                           <div className="flex items-center gap-3">
                               <span className="w-4 h-4 flex items-center justify-center text-gray-400">↵</span>
                               Break
                           </div>
                           <svg className="w-4 h-4 text-gray-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                       </button>
                       <div className="absolute left-full top-0 w-52 bg-white rounded shadow-[0_2px_8px_rgba(0,0,0,0.2)] border border-gray-200 py-1 hidden group-hover:block ml-0.5">
                           <button 
                             onClick={() => { insertPageBreak(); setActiveMenu(null); }}
                             className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                           >
                             Page break <span className="ml-auto text-xs text-gray-400">Ctrl+Enter</span>
                           </button>
                           <button 
                             onClick={() => { insertSectionBreak(); setActiveMenu(null); }}
                             className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                           >
                             Section break (continuous)
                           </button>
                       </div>
                    </div>

                    <button 
                      onClick={() => { document.execCommand('insertHorizontalRule'); setActiveMenu(null); }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                      <span className="w-4 h-4 flex items-center justify-center font-bold text-gray-500">—</span>
                      Horizontal line
                    </button>
                     <button 
                      onClick={() => { 
                        const selection = window.getSelection();
                        if (selection && selection.rangeCount > 0) {
                            savedRange.current = selection.getRangeAt(0);
                        }
                        setActiveMenu(null); 
                        setShowLinkDialog(true); 
                      }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                       <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                      Link <span className="ml-auto text-xs text-gray-400">Ctrl+K</span>
                    </button>
                    
                    <button 
                      onClick={() => { 
                          const selection = window.getSelection();
                          if (selection && selection.rangeCount > 0) {
                              savedRange.current = selection.getRangeAt(0);
                          }
                          insertTableOfContents(); 
                          setActiveMenu(null); 
                      }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>
                      Table of contents
                    </button>

                     <button 
                         // Special char requires more complex dialog, maybe later
                      onClick={() => { 
                          const char = prompt("Enter character to insert:");
                          if (char) document.execCommand('insertText', false, char);
                          setActiveMenu(null); 
                      }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                       <span className="w-4 h-4 flex items-center justify-center text-gray-500">Ω</span>
                      Special characters
                    </button>
                  </div>
                )}
              </div>


               {/* Format Menu */}
               <div className="relative">
                <button 
                  className={`hover:bg-gray-100 rounded-[4px] px-2 py-0.5 transition-colors ${activeMenu === 'format' ? 'bg-gray-100 text-gray-900' : ''}`}
                  onMouseEnter={() => activeMenu && setActiveMenu('format')}
                  onClick={() => setActiveMenu(activeMenu === 'format' ? null : 'format')}
                >
                  Format
                </button>
                {activeMenu === 'format' && (
                  <div className="absolute top-full left-0 mt-0.5 w-64 bg-white rounded shadow-[0_2px_8px_rgba(0,0,0,0.2)] border border-gray-200 py-1.5 z-50">
                    <div className="px-4 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Text</div>
                    <button 
                      onClick={() => { document.execCommand('bold'); setActiveMenu(null); }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                      <span className="font-bold w-4 text-center">B</span>
                      Bold <span className="ml-auto text-xs text-gray-400">Ctrl+B</span>
                    </button>
                    <button 
                      onClick={() => { document.execCommand('italic'); setActiveMenu(null); }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                      <span className="italic w-4 text-center font-serif">I</span>
                      Italic <span className="ml-auto text-xs text-gray-400">Ctrl+I</span>
                    </button>
                    <button 
                      onClick={() => { document.execCommand('underline'); setActiveMenu(null); }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                      <span className="underline w-4 text-center">U</span>
                      Underline <span className="ml-auto text-xs text-gray-400">Ctrl+U</span>
                    </button>
                    <button 
                      onClick={() => { document.execCommand('strikethrough'); setActiveMenu(null); }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                      <span className="line-through w-4 text-center">S</span>
                      Strikethrough
                    </button>
                    <button 
                      onClick={() => { document.execCommand('superscript'); setActiveMenu(null); }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                      <span className="w-4 text-center text-xs">x²</span>
                      Superscript
                    </button>
                    <button 
                      onClick={() => { document.execCommand('subscript'); setActiveMenu(null); }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                      <span className="w-4 text-center text-xs">x₂</span>
                      Subscript
                    </button>

                    <div className="relative group">
                        <button 
                          className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center justify-between text-sm text-gray-700"
                        >
                          <div className="flex items-center gap-3">
                              <span className="w-4 text-center text-xs font-bold">Aa</span>
                              Capitalization
                          </div>
                          <svg className="w-4 h-4 text-gray-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                        </button>
                        <div className="absolute left-full top-0 w-40 bg-white rounded shadow-[0_2px_8px_rgba(0,0,0,0.2)] border border-gray-200 py-1 hidden group-hover:block ml-0.5">
                            <button 
                              onClick={() => { applyCapitalization('lowercase'); setActiveMenu(null); }}
                              className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                            >
                              lowercase
                            </button>
                             <button 
                              onClick={() => { applyCapitalization('uppercase'); setActiveMenu(null); }}
                              className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                            >
                              UPPERCASE
                            </button>
                             <button 
                              onClick={() => { applyCapitalization('titlecase'); setActiveMenu(null); }}
                              className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                            >
                              Title Case
                            </button>
                        </div>
                    </div>
                    
                    <hr className="my-1.5 border-gray-200" />
                    <div className="px-4 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Align</div>
                    
                    <button 
                      onClick={() => { document.execCommand('justifyLeft'); setActiveMenu(null); }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h16" /></svg>
                      Left
                    </button>
                    <button 
                      onClick={() => { document.execCommand('justifyCenter'); setActiveMenu(null); }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M7 12h10M4 18h16" /></svg>
                      Center
                    </button>
                    <button 
                      onClick={() => { document.execCommand('justifyRight'); setActiveMenu(null); }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M10 12h10M4 18h16" /></svg>
                      Right
                    </button>
                     <button 
                      onClick={() => { document.execCommand('justifyFull'); setActiveMenu(null); }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                      Justify
                    </button>

                    <hr className="my-1.5 border-gray-200" />
                     <button 
                      onClick={() => { document.execCommand('removeFormat'); setActiveMenu(null); }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                       <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                      Clear formatting
                    </button>
                  </div>
                )}
              </div>

               {/* Table Menu */}
               <div className="relative">
                <button 
                  className={`hover:bg-gray-100 rounded-[4px] px-2 py-0.5 transition-colors ${activeMenu === 'table' ? 'bg-gray-100 text-gray-900' : ''}`}
                  onMouseEnter={() => activeMenu && setActiveMenu('table')}
                  onClick={() => setActiveMenu(activeMenu === 'table' ? null : 'table')}
                >
                  Table
                </button>
                {activeMenu === 'table' && (
                  <div className="absolute top-full left-0 mt-0.5 w-64 bg-white rounded shadow-[0_2px_8px_rgba(0,0,0,0.2)] border border-gray-200 py-1.5 z-50">
                     <button 
                      onClick={() => { setShowTableDialog(true); setActiveMenu(null); }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                      <span className="w-4 h-4 flex items-center justify-center">⊞</span>
                      Insert table
                    </button>
                    
                    <hr className="my-1.5 border-gray-200" />
                    
                    <div className={!isTableSelected ? "opacity-50 pointer-events-none" : ""}>
                      <button 
                        onClick={() => { addTableRowAbove(); setActiveMenu(null); }}
                        className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                      >
                         <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                        Insert row above
                      </button>
                      <button 
                        onClick={() => { addTableRowBelow(); setActiveMenu(null); }}
                        className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                      >
                         <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                        Insert row below
                      </button>
                      <button 
                        onClick={() => { addTableColumnLeft(); setActiveMenu(null); }}
                        className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                      >
                         <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        Insert column left
                      </button>
                      <button 
                        onClick={() => { addTableColumnRight(); setActiveMenu(null); }}
                        className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                      >
                         <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                        Insert column right
                      </button>
                      
                      <hr className="my-1.5 border-gray-200" />
                      
                      <button 
                        onClick={() => { deleteTableRow(); setActiveMenu(null); }}
                        className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                      >
                         <span className="w-4 h-4"></span>
                        Delete row
                      </button>
                      <button 
                        onClick={() => { deleteTableColumn(); setActiveMenu(null); }}
                        className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                      >
                         <span className="w-4 h-4"></span>
                        Delete column
                      </button>
                      <button 
                        onClick={() => { deleteTable(); setActiveMenu(null); }}
                        className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                      >
                         <span className="w-4 h-4"></span>
                        Delete table
                      </button>
                    </div>
                  </div>
                )}
              </div>

               {/* Tools Menu */}
               <div className="relative">
                <button 
                  className={`hover:bg-gray-100 rounded-[4px] px-2 py-0.5 transition-colors ${activeMenu === 'tools' ? 'bg-gray-100 text-gray-900' : ''}`}
                  onMouseEnter={() => activeMenu && setActiveMenu('tools')}
                  onClick={() => setActiveMenu(activeMenu === 'tools' ? null : 'tools')}
                >
                  Tools
                </button>
                {activeMenu === 'tools' && (
                  <div className="absolute top-full left-0 mt-0.5 w-64 bg-white rounded shadow-[0_2px_8px_rgba(0,0,0,0.2)] border border-gray-200 py-1.5 z-50">
                     <button 
                      onClick={() => { setShowWordCountDialog(true); setActiveMenu(null); }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      Word count <span className="ml-auto text-xs text-gray-400">Ctrl+Shift+C</span>
                    </button>

                    <button 
                      onClick={() => { setSpellCheck(!spellCheck); setActiveMenu(null); }}
                      className="w-full text-left px-4 py-1.5 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
                    >
                      <span className="w-4 h-4 flex items-center justify-center text-gray-600">{spellCheck ? '✓' : ''}</span>
                      Spelling and grammar check
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          

          <div className="flex items-center gap-2">
            <div className="text-xs text-gray-400 min-w-[30px] text-right">
                {saveStatus === 'saving' && <span className="flex items-center gap-1">Saving...</span>}
                {saveStatus === 'saved' && <span className="flex items-center gap-1" title="Saved to Drive"><svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" /></svg></span>}
                {saveStatus === 'error' && <span className="text-red-500">Error</span>}
            </div>
            
            <button
               onClick={() => setShowComments(!showComments)}
               className={`p-2 rounded-full transition-colors ${showComments ? 'bg-teal-100 text-teal-600' : 'hover:bg-gray-100 text-gray-600'}`}
               title="Open comments"
            >
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
               </svg>
            </button>
            <button
               onClick={() => setShowSharingDialog(true)}
               className="h-9 px-4 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-full font-medium text-sm transition-colors flex items-center gap-2"
               title="Share"
            >
               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
               Share
            </button>
            <button
                onClick={() => saveDocument(false)}
                className="h-9 px-4 bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 rounded font-medium text-sm shadow-sm transition-colors flex items-center gap-2"
                title="Save now"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                Save
            </button>
          </div>

        </div>
      </div>

        {/* Formatting Toolbar - hidden in full screen mode */}
        <div className="mx-auto my-1 px-2 h-[38px] w-fit max-w-[calc(100%-16px)] bg-[#F0FDFA] rounded-[19px] flex items-center gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] shadow-sm" style={isFullScreen ? { display: 'none' } : undefined}>
          
          {/* Undo/Redo */}
          <div className="flex items-center gap-0.5">
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => document.execCommand('undo')}
              className="w-7 h-7 flex items-center justify-center hover:bg-gray-200 rounded text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent"
              title="Undo (Ctrl+Z)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
              </svg>
            </button>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => document.execCommand('redo')}
              className="w-7 h-7 flex items-center justify-center hover:bg-gray-200 rounded text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent"
              title="Redo (Ctrl+Y)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m15 15 6-6m0 0-6-6m6 6H9a6 6 0 0 0 0 12h3" />
              </svg>
            </button>
          </div>

          {/* Zoom Selector */}
          <div className="relative flex items-center">
             <select
                 className="h-7 pl-2 pr-1 rounded hover:bg-gray-200 bg-transparent text-sm text-gray-700 font-medium appearance-none cursor-pointer focus:outline-none focus:bg-gray-200"
                 value={zoomLevel}
                 onChange={(e) => setZoomLevel(Number(e.target.value))}
                 title="Zoom"
                 style={{ textAlignLast: 'center' }}
             >
                {[50, 75, 100, 125, 150, 200].map(z => (
                   <option key={z} value={z}>{z}%</option>
                ))}
             </select>
             {/* Custom arrow to match style */}
             <div className="pointer-events-none absolute right-1 flex items-center text-gray-500">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
             </div>
          </div>

          <div className="w-px h-4 bg-gray-300 mx-0.5" />

          {/* Style/Heading selector */}
          <select
            className="h-7 px-1 rounded hover:bg-gray-200 bg-transparent text-sm text-gray-800 font-medium border-none focus:ring-0 cursor-pointer w-[110px]"
            value={headingStyle}
            onChange={(e) => applyHeadingStyle(e.target.value)}
            title="Paragraph style"
          >
            <option value="normal">Normal text</option>
            <option value="h1">Heading 1</option>
            <option value="h2">Heading 2</option>
            <option value="h3">Heading 3</option>
            <option value="h4">Heading 4</option>
            <option value="h5">Heading 5</option>
            <option value="h6">Heading 6</option>
          </select>

          <div className="w-px h-4 bg-gray-300 mx-0.5" />

          {/* Font family */}
          <select
            className="h-7 px-1 rounded hover:bg-gray-200 bg-transparent text-sm text-gray-800 font-medium border-none focus:ring-0 cursor-pointer w-[100px]"
            value={fontFamily}
            onChange={(e) => {
              setFontFamily(e.target.value)
              applyCommand('fontName', e.target.value)
            }}
            title="Font family"
          >
            <option value="Arial">Arial</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Courier New">Courier New</option>
            <option value="Georgia">Georgia</option>
            <option value="Verdana">Verdana</option>
            <option value="Comic Sans MS">Comic Sans MS</option>
            <option value="Impact">Impact</option>
          </select>

          <div className="w-px h-4 bg-gray-300 mx-0.5" />

          {/* Font size */}
          <div className="flex items-center gap-0.5 h-7">
            <button
              onClick={() => {
                const sizes = ['8', '10', '11', '12', '14', '18', '24']
                const currentIndex = sizes.indexOf(fontSize)
                if (currentIndex > 0) {
                  const newSize = sizes[currentIndex - 1]
                  setFontSize(newSize)
                  const fontMap: Record<string, string> = { '8': '1', '10': '2', '11': '3', '12': '4', '14': '5', '18': '6', '24': '7' }
                  applyCommand('fontSize', fontMap[newSize])
                }
              }}
              className="w-6 h-6 flex items-center justify-center hover:bg-gray-200 rounded text-gray-700 font-medium text-lg"
              title="Decrease font size"
            >
              -
            </button>
            <input
              type="text"
              className="w-8 h-6 text-center text-sm text-gray-900 bg-transparent border border-gray-300 rounded hover:border-gray-400 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-colors p-0"
              value={fontSize}
              onChange={(e) => {
                 const newSize = e.target.value
                 setFontSize(newSize)
                 const fontMap: Record<string, string> = { '8': '1', '10': '2', '11': '3', '12': '4', '14': '5', '18': '6', '24': '7' }
                 if (fontMap[newSize]) {
                    applyCommand('fontSize', fontMap[newSize])
                 }
              }}
              title="Font size"
            />
            <button
              onClick={() => {
                const sizes = ['8', '10', '11', '12', '14', '18', '24']
                const currentIndex = sizes.indexOf(fontSize)
                if (currentIndex < sizes.length - 1 && currentIndex !== -1) {
                  const newSize = sizes[currentIndex + 1]
                  setFontSize(newSize)
                  const fontMap: Record<string, string> = { '8': '1', '10': '2', '11': '3', '12': '4', '14': '5', '18': '6', '24': '7' }
                  applyCommand('fontSize', fontMap[newSize])
                }
              }}
              className="w-6 h-6 flex items-center justify-center hover:bg-gray-200 rounded text-gray-700 font-medium text-lg"
              title="Increase font size"
            >
              +
            </button>
          </div>

          <div className="w-px h-4 bg-gray-300 mx-0.5" />

          {/* Text formatting - B I U S */}
          <div className="flex items-center gap-0.5">
              <button
                onClick={() => applyCommand('bold')}
                className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
                  isBold ? 'bg-teal-100 text-teal-800' : 'hover:bg-gray-200 text-gray-700'
                }`}
                title="Bold (Ctrl+B)"
              >
                <span className="font-bold">B</span>
              </button>
              <button
                onClick={() => applyCommand('italic')}
                className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
                  isItalic ? 'bg-teal-100 text-teal-800' : 'hover:bg-gray-200 text-gray-700'
                }`}
                title="Italic (Ctrl+I)"
              >
                <span className="italic font-serif">I</span>
              </button>
              <button
                onClick={() => applyCommand('underline')}
                className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
                  isUnderline ? 'bg-teal-100 text-teal-800' : 'hover:bg-gray-200 text-gray-700'
                }`}
                title="Underline (Ctrl+U)"
              >
                <span className="underline font-medium">U</span>
              </button>
              <button
                onClick={() => applyCommand('strikethrough')}
                className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
                    isStrikethrough ? 'bg-teal-100 text-teal-800' : 'hover:bg-gray-200 text-gray-700'
                }`}
                title="Strikethrough"
              >
                <span className="line-through font-medium">S</span>
              </button>
              
              {/* Font Color Pill */}
              <div className="relative group ml-0.5">
                <button
                onMouseDown={() => {
                  // Save selection before color picker opens (it steals focus)
                  const selection = window.getSelection()
                  if (selection && selection.rangeCount > 0) {
                    savedRange.current = selection.getRangeAt(0).cloneRange()
                  }
                }}
                onClick={() => document.getElementById('textColorPicker')?.click()}
                className="w-7 h-7 flex flex-col items-center justify-center rounded hover:bg-gray-200"
                title="Text color"
                >
                    <span className="font-bold text-gray-700 border-b-[3px]" style={{ borderColor: fontColor }}>A</span>
                </button>
                <input
                id="textColorPicker"
                type="color"
                className="absolute opacity-0 pointer-events-none"
                value={fontColor}
              onChange={(e) => {
                const nextColor = e.target.value
                setFontColor(nextColor)
                // Restore saved selection before applying color
                if (savedRange.current) {
                  const selection = window.getSelection()
                  if (selection) {
                    selection.removeAllRanges()
                    selection.addRange(savedRange.current)
                  }
                }
                applyCommand('foreColor', nextColor)
                savedRange.current = null
              }}
            />
          </div>

          <div className="w-px h-4 bg-gray-300 mx-0.5" />

          {/* Text alignment */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => applyCommand('justifyLeft')}
              className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
                alignment === 'left' ? 'bg-teal-100 text-teal-800' : 'hover:bg-gray-200 text-gray-700'
              }`}
              title="Align left"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 6h16v2H4V6zm0 5h10v2H4v-2zm0 5h16v2H4v-2z" />
              </svg>
            </button>
            <button
              onClick={() => applyCommand('justifyCenter')}
              className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
                alignment === 'center' ? 'bg-teal-100 text-teal-800' : 'hover:bg-gray-200 text-gray-700'
              }`}
              title="Align center"
            >
               <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 6h16v2H4V6zm3 5h10v2H7v-2zm-3 5h16v2H4v-2z" />
              </svg>
            </button>
            <button
              onClick={() => applyCommand('justifyRight')}
              className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
                alignment === 'right' ? 'bg-teal-100 text-teal-800' : 'hover:bg-gray-200 text-gray-700'
              }`}
              title="Align right"
            >
               <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 6h16v2H4V6zm7 5h9v2H11v-2zm-7 5h16v2H4v-2z" />
              </svg>
            </button>
            <button
              onClick={() => applyCommand('justifyFull')}
              className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
                alignment === 'justify' ? 'bg-teal-100 text-teal-800' : 'hover:bg-gray-200 text-gray-700'
              }`}
              title="Justify"
            >
               <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z" />
              </svg>
            </button>
          </div>

          <div className="w-px h-4 bg-gray-300 mx-0.5" />

          {/* Lists */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => insertList('ul')}
              className="w-7 h-7 flex items-center justify-center rounded transition-colors hover:bg-gray-200 text-gray-700"
              title="Bulleted list"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 6h2v2H4V6zm0 5h2v2H4v-2zm0 5h2v2H4v-2zm4-5h12v2H8v-2zm0 5h12v2H8v-2zm0-10h12v2H8V6z" />
              </svg>
            </button>
            <button
              onClick={() => insertList('ol')}
              className="w-7 h-7 flex items-center justify-center rounded transition-colors hover:bg-gray-200 text-gray-700"
              title="Numbered list"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5 6h2v2H5V6zm0 5h2v2H5v-2zm0 5h2v2H5v-2zm4-5h11v2H9v-2zm0 5h11v2H9v-2zm0-10h11v2H9V6z" />
              </svg>
            </button>
          </div>

          <div className="w-px h-4 bg-gray-300 mx-0.5 opacity-50" />

          {/* Insert menu */}
          <button
            onClick={() => setShowLinkDialog(true)}
            className="w-7 h-7 flex items-center justify-center rounded transition-colors hover:bg-gray-200 text-gray-700"
            title="Insert link (Ctrl+K)"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
            </svg>
          </button>
          
          <button
            onClick={() => setShowImageDialog(true)}
            className="w-7 h-7 flex items-center justify-center rounded transition-colors hover:bg-gray-200 text-gray-700"
            title="Insert image"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
            </svg>
          </button>

          <button
            onClick={() => setShowTableDialog(true)}
            className="w-7 h-7 flex items-center justify-center rounded transition-colors hover:bg-gray-200 text-gray-700"
            title="Insert table"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM8 20H4v-4h4v4zm0-6H4v-4h4v4zm0-6H4V4h4v4zm6 12h-4v-4h4v4zm0-6h-4v-4h4v4zm0-6h-4V4h4v4zm6 12h-4v-4h4v4zm0-6h-4v-4h4v4zm0-6h-4V4h4v4z"/>
            </svg>
          </button>

          <div className="w-px h-4 bg-gray-300 mx-0.5 opacity-50" />

          {/* Breaks */}
          <button
            onClick={insertPageBreak}
            className="w-7 h-7 flex items-center justify-center rounded transition-colors hover:bg-gray-200 text-gray-700"
            title="Page break"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
            </svg>
          </button>
          
          <div className="w-px h-4 bg-gray-300 mx-0.5 opacity-50" />

          {/* Find & Replace */}
          <button
            onClick={() => setShowFindReplaceDialog(true)}
            className="w-7 h-7 flex items-center justify-center rounded transition-colors hover:bg-gray-200 text-gray-700"
            title="Find and replace (Ctrl+H)"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11 6c1.38 0 2.63.56 3.54 1.46L12 10h6V4l-2.05 2.05C14.68 4.78 12.93 4 11 4c-3.53 0-6.43 2.61-6.92 6H6.1c.46-1.91 2.17-3.35 4.9-3.35zm5.64 9.14c.66.9 1.12 2.25 1.25 4.86h-2.03c-.11-1.2-.42-2.14-1.25-2.86-.96-.86-2.18-1-2.91-1h-6.8v-2h6.8c1.61 0 3.39.46 4.94 1z"/>
            </svg>
          </button>
        </div>

        {/* Table Modification Toolbar (shown when cursor is in table) */}
      </div>

      {/* Insert Table Dialog */}
      {showTableDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-96">
            <h2 className="text-xl font-medium text-gray-800 mb-4">Insert Table</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Rows</label>
                <input
                  type="number"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
                  value={tableRows}
                  onChange={(e) => setTableRows(e.target.value)}
                  min="1"
                  max="20"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Columns</label>
                <input
                  type="number"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
                  value={tableCols}
                  onChange={(e) => setTableCols(e.target.value)}
                  min="1"
                  max="20"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowTableDialog(false)
                  setTableRows('3')
                  setTableCols('3')
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={insertTable}
                className="px-4 py-2 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg transition-colors"
              >
                Insert
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Insert Link Dialog */}
      {showLinkDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-96">
            <h2 className="text-xl font-medium text-gray-800 mb-4">Insert Link</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">URL</label>
                <input
                  type="text"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
                  placeholder="https://example.com"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Display Text (optional)</label>
                <input
                  type="text"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
                  placeholder="Link text"
                  value={linkText}
                  onChange={(e) => setLinkText(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowLinkDialog(false)
                  setLinkUrl('')
                  setLinkText('')
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={insertLink}
                className="px-4 py-2 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg transition-colors"
              >
                Insert
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Insert Image Dialog */}
      {showImageDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-96">
            <h2 className="text-xl font-medium text-gray-800 mb-4">Insert Image</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Image URL</label>
                <input
                  type="text"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
                  placeholder="https://example.com/image.jpg"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowImageDialog(false)
                  setImageUrl('')
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={insertImage}
                className="px-4 py-2 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg transition-colors"
              >
                Insert
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Insert Equation Dialog */}
      {showEquationDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-[500px]">
            <h2 className="text-xl font-medium text-gray-800 mb-4">Insert Equation</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">LaTeX Equation</label>
                <div className="flex gap-2 mb-2 flex-wrap text-sm">
                   {[
                       { tex: '\\frac{a}{b}', label: 'a/b' },
                       { tex: '\\sqrt{x}', label: '√' },
                       { tex: 'x^2', label: 'x²' },
                       { tex: '\\sum', label: '∑' },
                       { tex: '\\int', label: '∫' },
                       { tex: '\\pi', label: 'π' },
                       { tex: '\\theta', label: 'θ' },
                       { tex: '\\alpha', label: 'α' },
                       { tex: '\\infty', label: '∞' },
                       { tex: '\\neq', label: '≠' },
                       { tex: '\\leq', label: '≤' },
                       { tex: '\\geq', label: '≥' },
                       { tex: '\\pm', label: '±' },
                       { tex: '\\times', label: '×' }
                   ].map(item => (
                       <button 
                          key={item.label}
                          onClick={() => setEquationLatex(prev => prev + item.tex + ' ')}
                          className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-700 font-medium text-sm min-w-[24px]"
                          title={item.tex}
                       >
                          {item.label}
                       </button>
                   ))}
                </div>
                <textarea
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 font-mono text-sm h-24 focus:outline-none focus:ring-2 focus:ring-[#0D9488] focus:border-transparent resize-none"
                  placeholder="e.g. E = mc^2"
                  value={equationLatex}
                  onChange={(e) => setEquationLatex(e.target.value)}
                  autoFocus
                />
              </div>
              
              {/* Preview */}
              {equationLatex && (
                  <div className="bg-gray-50 p-4 rounded-lg flex items-center justify-center min-h-[60px] border border-gray-200 overflow-hidden">
                      <img 
                          src={`https://latex.codecogs.com/svg.latex?${encodeURIComponent(equationLatex)}`} 
                          alt="Preview" 
                          style={{maxHeight: '50px', maxWidth: '100%'}}
                          onError={(e) => e.currentTarget.style.display = 'none'}
                          onLoad={(e) => e.currentTarget.style.display = 'block'}
                      />
                  </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowEquationDialog(false)
                  setEquationLatex('')
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={insertEquation}
                className="px-4 py-2 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg transition-colors"
              >
                Insert
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Details Dialog */}
      {showDetailsDialog && currentDocument && (
        <div className="fixed inset-0 bg-black/50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
          <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full mx-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Document Details</h3>
              <button 
                onClick={() => setShowDetailsDialog(false)}
                className="text-gray-400 hover:text-gray-500 p-1 rounded-full hover:bg-gray-100 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4">
                <div className="bg-teal-50 p-3 rounded-lg">
                  <img src="./icons/gridwell_docs.svg" alt="" className="w-8 h-8" />
                </div>
                <div>
                   <div className="font-medium text-gray-900">{currentDocument.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{currentDocument.id}]</span></div>
                   <div className="text-sm text-gray-500">{currentDocument.mimeType}</div>
                </div>
              </div>
              
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="text-gray-500 font-medium">Type</div>
                  <div className="col-span-2 text-gray-900">{APP_NAME}</div>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="text-gray-500 font-medium">Size</div>
                  <div className="col-span-2 text-gray-900">{formatSize(currentDocument.size, currentDocument)}</div>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="text-gray-500 font-medium">Owner</div>
                  <div className="col-span-2 text-gray-900">{currentDocument.owners.join(', ') || 'Me'}</div>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="text-gray-500 font-medium">Modified</div>
                  <div className="col-span-2 text-gray-900">{formatDate(currentDocument.modifiedTime)}</div>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="text-gray-500 font-medium">Created</div>
                  <div className="col-span-2 text-gray-900">{formatDate(currentDocument.createdTime)}</div>
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-gray-50 rounded-b-xl border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setShowDetailsDialog(false)}
                className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Style Dialog */}
      {showDocStyleDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-[450px]">
            <h2 className="text-xl font-medium text-gray-800 mb-6">Page setup</h2>
            <div className="space-y-6">
              
              {/* Orientation */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Orientation</label>
                <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input 
                            type="radio" 
                            name="orientation" 
                            checked={pageOrientation === 'portrait'} 
                            onChange={() => setPageOrientation('portrait')}
                        />
                        <span className="text-sm text-gray-700">Portrait</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input 
                            type="radio" 
                            name="orientation" 
                            checked={pageOrientation === 'landscape'} 
                            onChange={() => setPageOrientation('landscape')}
                        />
                        <span className="text-sm text-gray-700">Landscape</span>
                    </label>
                </div>
              </div>

              {/* Paper Size */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Paper size</label>
                <select 
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm text-gray-900"
                    value={pageSizeName}
                    onChange={(e) => setPageSizeName(e.target.value)}
                >
                    {Object.entries(PAGE_SIZES).map(([key, size]) => (
                        <option key={key} value={key}>{size.name}</option>
                    ))}
                    {!PAGE_SIZES[pageSizeName] && <option value="CUSTOM">Custom</option>}
                </select>
              </div>

              {/* Page Background Color */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Page color</label>
                <div className="flex items-center gap-2">
                  <div className="relative">
                      <input
                        type="color"
                        className="w-8 h-8 rounded border border-gray-300 cursor-pointer p-0 overflow-hidden"
                        value={pageBackground}
                        onChange={(e) => setPageBackground(e.target.value)}
                      />
                  </div>
                  <span className="text-sm text-gray-600 uppercase">{pageBackground}</span>
                </div>
              </div>

              {/* Margins */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Margins (inches)</label>
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Top</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900"
                      value={pageMarginTop}
                      onChange={(e) => setPageMarginTop(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Bottom</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900"
                      value={pageMarginBottom}
                      onChange={(e) => setPageMarginBottom(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Left</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900"
                      value={pageMarginLeft}
                      onChange={(e) => setPageMarginLeft(e.target.value)}
                    />
                  </div>
                   <div>
                    <label className="block text-xs text-gray-500 mb-1">Right</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900"
                      value={pageMarginRight}
                      onChange={(e) => setPageMarginRight(e.target.value)}
                    />
                  </div>
                </div>
              </div>

            </div>
            <div className="flex justify-end gap-3 mt-8">
              <button
                onClick={() => setShowDocStyleDialog(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded font-medium transition-colors text-sm"
              >
                Cancel
              </button>
               <button
                onClick={applyPageSetup}
                className="px-6 py-2 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded font-medium transition-colors text-sm shadow-sm"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Find & Replace Dialog */}
      {showFindReplaceDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-96">
            <h2 className="text-xl font-medium text-gray-800 mb-4">Find and Replace</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Find</label>
                <input
                  type="text"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
                  placeholder="Text to find"
                  value={findText}
                  onChange={(e) => setFindText(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Replace with</label>
                <input
                  type="text"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
                  placeholder="Replacement text"
                  value={replaceText}
                  onChange={(e) => setReplaceText(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowFindReplaceDialog(false)
                  setFindText('')
                  setReplaceText('')
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={findAndReplace}
                className="px-4 py-2 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg transition-colors"
              >
                Replace All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Word Count Dialog */}
      {showWordCountDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-80">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Word count</h2>
            <div className="space-y-3 mb-6">
              <div className="flex justify-between items-center">
                 <span className="text-gray-600">Words</span>
                 <span className="text-gray-900 font-medium">
                    {getAllText().trim().split(/\s+/).filter(w => w.length > 0).length}
                 </span>
              </div>
              <div className="flex justify-between items-center">
                 <span className="text-gray-600">Characters</span>
                 <span className="text-gray-900 font-medium">
                    {getAllText().replace(/\n/g, ' ').length}
                 </span>
              </div>
              <div className="flex justify-between items-center">
                 <span className="text-gray-600">Characters excluding spaces</span>
                 <span className="text-gray-900 font-medium">
                    {getAllText().replace(/\s/g, '').length}
                 </span>
              </div>
            </div>
            
             <div className="flex items-center gap-2 mb-6">
                 <input 
                    type="checkbox" 
                    id="display-word-count" 
                    className="w-4 h-4 text-teal-600 rounded border-gray-300 focus:ring-teal-500" 
                    checked={showWordCount}
                    onChange={(e) => setShowWordCount(e.target.checked)}
                 />
                 <label htmlFor="display-word-count" className="text-sm text-gray-700 select-none">Display word count while typing</label>
              </div>

            <div className="flex justify-end">
              <button
                onClick={() => setShowWordCountDialog(false)}
                className="px-6 py-2 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded font-medium transition-colors text-sm shadow-sm"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chart Dialog */}
      {showChartDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={(e) => e.stopPropagation()}>
          <div className="bg-white rounded-lg shadow-xl p-6 w-[500px] flex flex-col gap-4">
            <h2 className="text-xl font-medium text-gray-800">Insert Chart</h2>
            
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Chart Type</label>
                <select 
                    value={chartType} 
                    onChange={(e) => setChartType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900"
                >
                    <option value="bar">Bar Chart</option>
                    <option value="pie">Pie Chart</option>
                    <option value="line">Line Chart</option>
                </select>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Chart Title</label>
                <input 
                    type="text" 
                    value={chartTitle}
                    onChange={(e) => setChartTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900"
                    placeholder="My Chart"
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data (CSV: Label, Value)</label>
                <textarea 
                    value={chartData}
                    onChange={(e) => setChartData(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-teal-500 focus:border-teal-500 h-32 font-mono text-sm text-gray-900"
                    placeholder={'Label, Value\nA, 10\nB, 20\nC, 15'}
                />
                <p className="text-xs text-gray-500 mt-1">First row can be header. Subsequent rows: Label, Number.</p>
            </div>

            <div className="flex justify-end gap-2 mt-2">
              <button
                onClick={() => setShowChartDialog(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={insertChart}
                className="px-4 py-2 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded transition-colors font-medium"
              >
                Insert
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Editor Main Layout */}

      {/* Floating exit button for full screen mode */}
      {isFullScreen && (
        <button
          onClick={toggleFullScreen}
          className="fixed top-4 right-4 z-[10000] bg-gray-800 text-white px-3 py-1.5 rounded-lg shadow-lg hover:bg-gray-700 text-sm flex items-center gap-2 opacity-80 hover:opacity-100 transition-opacity"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          Exit full screen
        </button>
      )}

      <div className="flex flex-1 overflow-hidden relative">
        {/* Outline Sidebar */}
        {showOutline && (
            <div className="w-[300px] bg-white border-r border-gray-200 h-full overflow-y-auto flex-shrink-0 hidden lg:block z-30 print:hidden relative transition-all duration-300">
               <div className="px-4 py-4 sticky top-0 bg-white/95 backdrop-blur-sm z-10 border-b border-gray-100 mb-2">
                 <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>
                    Outline
                 </h2>
               </div>
               <div className="px-3 pb-10">
                  {outlineHeadings.length === 0 ? (
                    <div className="text-sm text-gray-400 italic px-2 py-8 flex flex-col items-center text-center gap-3">
                        <span className="text-3xl opacity-20">📑</span>
                        <span>Headings you add to the document will appear here.</span>
                    </div>
                  ) : (
                    <ul className="space-y-0.5">
                       {outlineHeadings.map((h, i) => (
                          <li key={`${h.id}-${i}`}>
                             <button 
                                onClick={() => {
                                  const el = document.getElementById(h.id)
                                  if (el) {
                                      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                                       // Highlight effect
                                       const originalTransition = el.style.transition
                                       const originalBg = el.style.backgroundColor
                                       
                                       el.style.transition = 'background-color 0.5s ease'
                                       el.style.backgroundColor = '#F0FDFA' // Light blue highlight
                                       
                                       setTimeout(() => {
                                            el.style.backgroundColor = originalBg
                                            setTimeout(() => {
                                                el.style.transition = originalTransition
                                            }, 500)
                                       }, 1500)
                                  }
                                }}
                                className="text-left w-full text-[13px] text-gray-600 hover:text-teal-700 hover:bg-teal-50 py-1.5 px-2 rounded truncate transition-colors flex items-center group/item"
                                style={{ paddingLeft: `${Math.max(0, h.level - 1) * 12 + 8}px` }}
                                title={h.text}
                             >
                                <span className={`mr-2 flex-shrink-0 ${h.level <= 2 ? 'font-medium text-gray-400 group-hover/item:text-teal-400' : 'text-transparent'} w-2`}>
                                    {h.level <= 2 ? '•' : ''}
                                </span>
                                <span className={`truncate ${h.level === 1 ? 'font-medium text-gray-800' : ''}`}>{h.text}</span>
                             </button>
                          </li>
                       ))}
                    </ul>
                  )}
               </div>
            </div>
        )}

      <div className="flex-1 overflow-auto bg-[#f8f9fa] print:p-0 relative">
        <div className="min-w-full inline-flex flex-col items-center">
            {/* Sticky Ruler */}
            {showRuler && (
            <div className="sticky top-0 z-20 h-6 flex justify-center bg-[#f8f9fa] border-b border-gray-300 select-none print:hidden mb-8 w-full">
                <div 
                    ref={rulerRef} 
                    className="relative h-full bg-white flex-shrink-0" 
                    style={{ 
                        width: `${(pageOrientation === 'landscape' ? PAGE_SIZES[pageSizeName].height : PAGE_SIZES[pageSizeName].width) / 72}in`,
                        // @ts-ignore
                        zoom: zoomLevel / 100
                    }}
                >
                {/* Ticks */}
                {Array.from({ length: Math.ceil(((pageOrientation === 'landscape' ? PAGE_SIZES[pageSizeName].height : PAGE_SIZES[pageSizeName].width) / 72) * 8) + 1 }).map((_, i) => {
                    const isInch = i % 8 === 0
                    const isHalf = i % 4 === 0
                    const height = isInch ? 'h-2.5' : (isHalf ? 'h-1.5' : 'h-1')
                    const number = i / 8
                    const pageWidthInches = (pageOrientation === 'landscape' ? PAGE_SIZES[pageSizeName].height : PAGE_SIZES[pageSizeName].width) / 72
                    
                    return (
                    <div 
                        key={i} 
                        className={`absolute top-0 w-px bg-gray-400 ${height}`}
                        style={{ left: `${i * 0.125}in` }}
                    >
                        {isInch && number > 0 && number < pageWidthInches && (
                        <span className="absolute top-2 -translate-x-1/2 text-[9px] text-gray-500 font-sans">{number}</span>
                        )}
                    </div>
                    )
                })}
                
                {/* Margin Indicators */}
                {/* Left Indent (Triangle Up) */}
                <div 
                    className="absolute top-0 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[8px] border-b-teal-500 cursor-ew-resize hover:scale-110 transition-transform z-20" 
                    style={{ left: `calc(${pageMarginLeft}in - 6px)` }} 
                    title="Left Indent"
                    onMouseDown={(e) => { e.preventDefault(); setDraggingMargin('left'); }}
                />

                {/* Right Margin */}
                <div 
                    className="absolute top-0 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[8px] border-b-teal-500 cursor-ew-resize hover:scale-110 transition-transform z-20" 
                    style={{ right: `calc(${pageMarginRight}in - 6px)` }} 
                    title="Right Indent"
                    onMouseDown={(e) => { e.preventDefault(); setDraggingMargin('right'); }}
                />
                </div>
            </div>
            )}

            <div 
                className="p-8 pt-0 flex flex-col items-center transition-transform duration-200"
                style={{ 
                    transform: `scale(${zoomLevel / 100})`,
                    transformOrigin: 'top center'
                }}
            >
            <style>{`
            [contenteditable="true"] ul {
                list-style-type: disc;
                padding-left: 40px;
                margin: 10px 0;
            }
            [contenteditable="true"] ol {
                list-style-type: decimal;
                padding-left: 40px;
                margin: 10px 0;
            }
            [contenteditable="true"] li {
                margin-bottom: 5px;
                color: inherit;
            }
            [contenteditable="true"] a {
                color: #0F766E;
                text-decoration: underline;
                cursor: pointer;
            }
            .page-break {
                position: relative;
                user-select: none;
            }
            [contenteditable="true"] table {
                border-collapse: collapse;
            }
            [contenteditable="true"] td,
            [contenteditable="true"] th {
                border: 1px solid #ccc;
                padding: 8px;
                min-width: 50px;
                position: relative;
                word-wrap: break-word;
                word-break: break-word; /* Ensure compatibility */
                overflow-wrap: break-word; /* Standard property */
                white-space: normal;
                color: #202124 !important; /* Force dark gray */
            }
            [contenteditable="true"] td *,
            [contenteditable="true"] th * {
                color: inherit;
            }
            [contenteditable="true"] p, [contenteditable="true"] span, [contenteditable="true"] div, [contenteditable="true"] li {
                color: #202124; /* Ensure almost black for text */
            }
            [contenteditable="true"] a {
                color: #0F766E !important;
            }
            [contenteditable="true"] td:hover,
            [contenteditable="true"] th:hover {
                outline: 2px solid #0D9488;
                outline-offset: -1px;
            }
            .column-resizer {
                position: absolute;
                top: 0;
                right: -3px;
                width: 6px;
                height: 100%;
                cursor: col-resize;
                z-index: 10;
                user-select: none;
            }
            .column-resizer:hover {
                background-color: #0D9488;
            }
            /* Placeholder style */
            .has-placeholder::before {
                content: attr(data-placeholder);
                color: #9ca3af; /* text-gray-400 */
                position: absolute;
                top: 0;
                left: 0;
                pointer-events: none;
                padding: inherit; /* Align with text padding */
            }
            /* Print Layout Header/Footer Helper */
            .document-page-header {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 0.5in;
                pointer-events: none;
                /* Ensure it doesn't block text selection unless hovered */
            }
            .document-editor h1 { font-size: 2em; font-weight: bold; margin-top: 0.67em; margin-bottom: 0.67em; }
            .document-editor h2 { font-size: 1.5em; font-weight: bold; margin-top: 0.83em; margin-bottom: 0.83em; }
            .document-editor h3 { font-size: 1.17em; font-weight: bold; margin-top: 1em; margin-bottom: 1em; }
            .document-editor h4 { font-size: 1em; font-weight: bold; margin-top: 1.33em; margin-bottom: 1.33em; }
            .document-editor h5 { font-size: 0.83em; font-weight: bold; margin-top: 1.67em; margin-bottom: 1.67em; }
            .document-editor h6 { font-size: 0.67em; font-weight: bold; margin-top: 2.33em; margin-bottom: 2.33em; }
            `}</style>
            {pages.map((pageContent, index) => (
            <div
                key={index}
                className="flex-shrink-0 shadow-lg mb-8 relative print:shadow-none print:mb-0 bg-white group/page"
                style={{
                width: `${(pageOrientation === 'landscape' ? PAGE_SIZES[pageSizeName].height : PAGE_SIZES[pageSizeName].width) / 72}in`,
                minHeight: `${(pageOrientation === 'landscape' ? PAGE_SIZES[pageSizeName].width : PAGE_SIZES[pageSizeName].height) / 72}in`,
                padding: `${pageMarginTop}in ${pageMarginRight}in ${pageMarginBottom}in ${pageMarginLeft}in`,
                backgroundColor: pageBackground
                }}
            >
                {/* Header Area */}
                <div 
                    className="absolute left-0 right-0 z-10 print:z-0"
                    style={{ top: '0.25in', height: '0.5in', paddingLeft: `${pageMarginLeft}in`, paddingRight: `${pageMarginRight}in` }}
                >
                    <div
                        key={`header-${index}`}
                        className={`w-full h-full outline-none overflow-hidden text-sm text-gray-600 ${showHeader ? 'border border-dashed border-gray-300 hover:border-teal-400 bg-white/50 cursor-text' : 'border border-transparent'}`}
                        contentEditable={showHeader}
                        suppressContentEditableWarning
                        ref={(el) => {
                            if (el && el.innerHTML !== headerHtml && document.activeElement !== el) {
                                el.innerHTML = headerHtml || '';
                            }
                        }}
                        onBlur={(e) => setHeaderHtml(e.currentTarget.innerHTML)}
                    />
                    {showHeader && (
                       <div className="absolute top-full left-0 ml-[1in] bg-teal-500 text-white text-[10px] px-2 py-0.5 rounded-b shadow-sm z-20 pointer-events-none print:hidden">
                          Header
                       </div>
                    )}
                </div>

                {/* Main Content */}
                <div
                ref={el => pageRefs.current[index] = el}
                className={`document-editor w-full focus:outline-none leading-relaxed relative z-0 ${index === 0 && isFirstPageEmpty ? 'has-placeholder' : ''}`}
                style={{
                    fontFamily: 'Arial, sans-serif',
                    fontSize: '11pt',
                    minHeight: '9in',
                    color: '#202124'
                }}
                contentEditable
                suppressContentEditableWarning
                onInput={handleInput}
                onKeyUp={updateFormattingState}
                onMouseUp={updateFormattingState}
                onFocus={() => {
                   if (showHeader) setShowHeader(false);
                   if (showFooter) setShowFooter(false);
                }}
                data-placeholder={index === 0 && (!pages[0] || pages[0] === '<p><br></p>' || pages[0].trim() === '') ? "Start typing..." : ""}
                role="textbox"
                aria-label={`Page ${index + 1}`}
                spellCheck={spellCheck}
                />

                {/* Footer Area */}
                <div 
                    className="absolute left-0 right-0 z-10 print:z-0"
                    style={{ bottom: '0.25in', height: '0.5in', paddingLeft: `${pageMarginLeft}in`, paddingRight: `${pageMarginRight}in` }}
                >
                    <div
                        key={`footer-${index}`}
                        className={`w-full h-full outline-none overflow-hidden text-sm text-gray-600 ${showFooter ? 'border border-dashed border-gray-300 hover:border-teal-400 bg-white/50 cursor-text' : 'border border-transparent'}`}
                        contentEditable={showFooter}
                        suppressContentEditableWarning
                        ref={(el) => {
                            if (el && el.innerHTML !== footerHtml && document.activeElement !== el) {
                                el.innerHTML = footerHtml || '';
                            }
                        }}
                        onBlur={(e) => setFooterHtml(e.currentTarget.innerHTML)}
                    />
                    {showFooter && (
                       <div className="absolute bottom-full left-0 ml-[1in] bg-teal-500 text-white text-[10px] px-2 py-0.5 rounded-t shadow-sm z-20 pointer-events-none print:hidden">
                          Footer
                       </div>
                    )}
                </div>
            </div>
            ))}
            </div>
            {/* End of content wrapper */}

            {/* Sharing Dialog */}
            {showSharingDialog && (
              <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg shadow-xl w-[480px] max-h-[600px] flex flex-col">
                  <div className="flex justify-between items-center p-5 border-b border-gray-200">
                    <h3 className="text-lg font-medium text-gray-800">Share "{currentDocument?.name}"</h3>
                    <button onClick={() => setShowSharingDialog(false)} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-full"><X className="w-5 h-5" /></button>
                  </div>
                  <div className="p-5 border-b border-gray-200">
                    <div className="flex gap-2">
                      <input
                        type="email"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                        placeholder="Add people by email"
                        value={newShareEmail}
                        onChange={(e) => setNewShareEmail(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleShareDocument()}
                      />
                      <select
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                        value={newShareRole}
                        onChange={(e) => setNewShareRole(e.target.value)}
                      >
                        <option value="reader">Viewer</option>
                        <option value="commenter">Commenter</option>
                        <option value="writer">Editor</option>
                      </select>
                      <button
                        onClick={handleShareDocument}
                        disabled={!newShareEmail.trim()}
                        className="px-4 py-2 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg text-sm font-medium disabled:opacity-50"
                      >Share</button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-5">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">People with access</h4>
                    {loadingPermissions ? (
                      <div className="flex justify-center py-6"><div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"></div></div>
                    ) : permissions.length === 0 ? (
                      <p className="text-sm text-gray-500">No permissions found</p>
                    ) : (
                      <div className="space-y-3">
                        {permissions.map((perm: any) => (
                          <div key={perm.id} className="flex items-center justify-between py-2">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${getAvatarColor(perm.emailAddress || perm.displayName || '')}`}>
                                {(perm.emailAddress || perm.displayName || '?')[0]?.toUpperCase()}
                              </div>
                              <div>
                                <div className="text-sm font-medium text-gray-800">{perm.displayName || perm.emailAddress || 'Unknown'}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{perm.id}]</span></div>
                                {perm.emailAddress && <div className="text-xs text-gray-500">{perm.emailAddress}</div>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500 capitalize">{perm.role}</span>
                              {perm.role !== 'owner' && (
                                <button onClick={() => handleRemovePermission(perm.id)} className="p-1 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded"><X className="w-4 h-4" /></button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Revision History Panel */}
            {showRevisionHistory && (
              <div className="fixed right-0 top-[108px] bottom-0 w-[360px] bg-[#f9fbfd] border-l border-gray-200 shadow-xl overflow-hidden z-40 flex flex-col">
                <div className="flex-none p-4 bg-white border-b border-gray-100 flex justify-between items-center shadow-sm">
                  <h3 className="font-semibold text-gray-800 text-lg">Version history</h3>
                  <button onClick={() => setShowRevisionHistory(false)} className="text-gray-400 hover:text-gray-600 p-1.5 hover:bg-gray-100 rounded-full"><X className="w-5 h-5" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {loadingRevisions ? (
                    <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"></div></div>
                  ) : revisions.length === 0 ? (
                    <div className="text-center py-10 text-gray-500">
                      <p className="text-sm">No revision history available</p>
                    </div>
                  ) : (
                    revisions.map((rev: any, idx: number) => (
                      <div key={rev.id || idx} className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-sm transition-shadow">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-sm font-medium text-gray-800">Revision {idx + 1}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{rev.id}]</span></span>
                          <span className="text-xs text-gray-500">{rev.modifiedTime ? new Date(rev.modifiedTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</span>
                        </div>
                        {rev.originalFilename && <p className="text-xs text-gray-500 mb-1">{rev.originalFilename}</p>}
                        {rev.size && <p className="text-xs text-gray-400">{Math.round(parseInt(rev.size) / 1024)} KB</p>}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Suggested Edits Panel */}
            {showSuggestedEdits && (
              <div className="fixed right-0 top-[108px] bottom-0 w-[360px] bg-[#f9fbfd] border-l border-gray-200 shadow-xl overflow-hidden z-40 flex flex-col">
                <div className="flex-none p-4 bg-white border-b border-gray-100 flex justify-between items-center shadow-sm">
                  <h3 className="font-semibold text-gray-800 text-lg">Suggested edits</h3>
                  <button onClick={() => setShowSuggestedEdits(false)} className="text-gray-400 hover:text-gray-600 p-1.5 hover:bg-gray-100 rounded-full"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-4 border-b border-gray-200 bg-white">
                  <label className="text-xs font-medium text-gray-600 mb-2 block">View mode</label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    value={suggestionsViewMode}
                    onChange={(e) => setSuggestionsViewMode(e.target.value)}
                  >
                    <option value="DEFAULT_FOR_CURRENT_ACCESS">Default</option>
                    <option value="SUGGESTIONS_INLINE">Suggestions inline</option>
                    <option value="PREVIEW_SUGGESTIONS_ACCEPTED">Preview accepted</option>
                    <option value="PREVIEW_WITHOUT_SUGGESTIONS">Preview without suggestions</option>
                  </select>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="text-center py-10 text-gray-500">
                    <p className="text-sm">No suggested edits</p>
                    <p className="text-xs text-gray-400 mt-1">Suggestions will appear here when collaborators suggest changes.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Named Ranges Panel */}
            {showNamedRanges && (
              <div className="fixed right-0 top-[108px] bottom-0 w-[360px] bg-[#f9fbfd] border-l border-gray-200 shadow-xl overflow-hidden z-40 flex flex-col">
                <div className="flex-none p-4 bg-white border-b border-gray-100 flex justify-between items-center shadow-sm">
                  <h3 className="font-semibold text-gray-800 text-lg">Named ranges</h3>
                  <button onClick={() => setShowNamedRanges(false)} className="text-gray-400 hover:text-gray-600 p-1.5 hover:bg-gray-100 rounded-full"><X className="w-5 h-5" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  {namedRanges.length === 0 ? (
                    <div className="text-center py-10 text-gray-500">
                      <p className="text-sm">No named ranges</p>
                      <p className="text-xs text-gray-400 mt-1">Named ranges are bookmarked sections of a document that can be referenced by name.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {namedRanges.map((nr, idx) => (
                        <div key={idx} className="bg-white rounded-lg border border-gray-200 p-3">
                          <div className="text-sm font-medium text-gray-800">{nr.name}</div>
                          <div className="text-xs text-gray-500 mt-1">{nr.ranges.length} range{nr.ranges.length !== 1 ? 's' : ''}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Comments Sidebar */}
            {showComments && (
              <div className="fixed right-0 top-[108px] bottom-0 w-[360px] bg-[#f9fbfd] border-l border-gray-200 shadow-xl overflow-hidden z-40 flex flex-col font-sans transition-all duration-300 ease-in-out">
                
                {/* Header */}
                <div className="flex-none p-4 bg-white border-b border-gray-100 flex justify-between items-center shadow-sm z-10">
                   <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-gray-800 text-lg">Comments</h3>
                   </div>
                   <button onClick={() => setShowComments(false)} className="text-gray-400 hover:text-gray-600 p-1.5 hover:bg-gray-100 rounded-full transition-colors">
                      <X className="w-5 h-5" />
                   </button>
                </div>
                
                {/* List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-5 bg-[#f9fbfd]">
                  {loadingComments ? (
                     <div className="flex flex-col items-center justify-center h-40 gap-3">
                        <div className="w-8 h-8 border-3 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-sm text-gray-500">Loading discussion...</span>
                     </div>
                  ) : comments.filter(c => !c.resolved).length === 0 ? (
                    <div className="flex flex-col items-center justify-center mt-20 text-center px-6">
                      <div className="w-16 h-16 bg-teal-50 text-teal-300 rounded-full flex items-center justify-center mb-4">
                         <MessageSquare className="w-8 h-8" />
                      </div>
                      <h4 className="text-gray-800 font-medium mb-1">No comments yet</h4>
                      <p className="text-sm text-gray-500">
                        Start a conversation by adding a comment.
                      </p>
                    </div>
                  ) : (
                    comments
                      .filter(c => !c.resolved)
                      .map(comment => (
                      <div key={comment.id} className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md p-4 transition-all duration-200 group relative">
                        {/* Card Header */}
                        <div className="flex justify-between items-start mb-3">
                           <div className="flex items-center gap-3">
                             <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shadow-sm border ${getAvatarColor(comment.author?.displayName)}`}>
                               {comment.author?.displayName?.[0]?.toUpperCase() || <User className="w-4 h-4" />}
                             </div>
                             <div>
                               <div className="text-sm font-bold text-gray-900 tracking-tight">{comment.author?.displayName || 'Unknown User'}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{comment.id}]</span></div>
                               <div className="text-[11px] font-medium text-gray-400">{timeAgo(comment.createdTime)}</div>
                             </div>
                           </div>
                           
                           {/* Actions Toolbar - Dynamic visibility */}
                           {editingCommentId !== comment.id && (
                             <div className="flex items-center bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden opacity-0 group-hover:opacity-100 transition-all duration-200 transform translate-x-1 group-hover:translate-x-0">
                                <button onClick={() => handleResolveComment(comment.id)} className="p-1.5 hover:bg-green-50 text-gray-400 hover:text-green-600 transition-colors border-r border-gray-50" title="Resolve">
                                    <Check className="w-4 h-4" />
                                </button>
                                <button onClick={() => startEditing(comment)} className="p-1.5 hover:bg-teal-50 text-gray-400 hover:text-teal-600 transition-colors border-r border-gray-50" title="Edit">
                                    <Edit2 className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleDeleteComment(comment.id)} className="p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors" title="Delete">
                                   <Trash2 className="w-4 h-4" />
                                </button>
                             </div>
                           )}
                        </div>
                        
                        {/* Edit Mode vs View Mode */}
                        {editingCommentId === comment.id ? (
                          <div className="animate-in fade-in zoom-in-95 duration-200">
                            <textarea 
                              className="w-full border border-teal-400 rounded-lg p-3 text-sm focus:ring-4 focus:ring-teal-50 outline-none text-gray-800 resize-none min-h-[80px]"
                              value={editCommentContent}
                              onChange={(e) => setEditCommentContent(e.target.value)}
                              autoFocus
                              placeholder="Update your thought..."
                            />
                            <div className="flex justify-end gap-2 mt-3">
                               <button onClick={cancelEditing} className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-md transition-colors">Cancel</button>
                               <button onClick={() => handleUpdateComment(comment.id)} className="px-4 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-md shadow-sm transition-all hover:shadow">Save Changes</button>
                            </div>
                          </div>
                        ) : (
                          <div className="pl-1">
                            {/* Quoted Content Preview */}
                            {comment.quotedFileContent?.value && (
                               <div className="relative mb-3 pl-3 py-1">
                                 <div className="absolute left-0 top-0 bottom-0 w-1 bg-yellow-400 rounded-full"></div>
                                 <p className="text-sm text-gray-500 italic line-clamp-2 hover:line-clamp-None transition-all cursor-default font-serif bg-yellow-50/50 p-1 rounded">
                                   "{comment.quotedFileContent.value}"
                                 </p>
                               </div>
                            )}
                            
                            <div className="text-[14px] text-gray-800 whitespace-pre-wrap leading-relaxed min-h-[1.5em]">
                              {comment.content}
                            </div>
                          </div>
                        )}
                        
                        {/* Replies Section */}
                        {comment.replies && comment.replies.length > 0 && (
                          <div className="mt-4 pt-3 space-y-3 relative">
                            {/* Connector Line */}
                             <div className="absolute left-[17px] top-0 bottom-4 w-px bg-gray-200 -z-10"></div>
                             
                            {comment.replies.map(reply => (
                               <div key={reply.id} className="flex gap-3 relative animate-in slide-in-from-left-2 duration-300">
                                  <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold border-2 border-white ring-1 ring-gray-100 ml-1 ${getAvatarColor(reply.author?.displayName)}`}>
                                    {reply.author?.displayName?.[0]?.toUpperCase() || 'U'}
                                  </div>
                                  <div className="flex-1 bg-gray-50/80 rounded-xl p-3 border border-gray-100 hover:border-gray-200 transition-colors">
                                      <div className="flex justify-between items-center mb-1">
                                          <span className="text-xs font-bold text-gray-900">{reply.author?.displayName}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{reply.id}]</span></span>
                                          <span className="text-[10px] font-medium text-gray-400">{timeAgo(reply.createdTime)}</span>
                                      </div>
                                      <p className="text-sm text-gray-700 leading-snug">{reply.content}</p>
                                  </div>
                               </div>
                            ))}
                          </div>
                        )}

                        {/* Reply Input */}
                        <div className="mt-3 flex items-center gap-2">
                          <ReplyIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <input
                            type="text"
                            className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:bg-white focus:border-teal-400 outline-none placeholder-gray-400 text-gray-800 transition-colors"
                            placeholder="Reply..."
                            value={replyTexts[comment.id] || ''}
                            onChange={(e) => setReplyTexts(prev => ({ ...prev, [comment.id]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                handleCreateReply(comment.id)
                              }
                            }}
                          />
                          <button
                            onClick={() => handleCreateReply(comment.id)}
                            disabled={!replyTexts[comment.id]?.trim()}
                            className="p-1.5 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Send reply"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                
                {/* Compose Box */}
                <div className="p-4 bg-white border-t border-gray-200 shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.05)] z-20">
                    <div className="flex gap-2 items-end group focus-within:ring-2 focus-within:ring-teal-100 rounded-xl transition-all">
                      <textarea
                        className="flex-1 bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm focus:bg-white focus:border-teal-400 outline-none resize-none min-h-[50px] max-h-[150px] placeholder-gray-400 text-gray-800 transition-colors"
                        rows={1}
                        placeholder="Add a comment..."
                        value={newCommentContent}
                        onChange={(e) => {
                            setNewCommentContent(e.target.value);
                            e.target.style.height = 'auto'; // reset height
                            e.target.style.height = `${e.target.scrollHeight}px`; // set new height
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            handleCreateComment()
                          }
                        }}
                      />
                      <button
                        onClick={handleCreateComment}
                        disabled={!newCommentContent.trim()}
                        className="flex-none h-[46px] w-[46px] flex items-center justify-center bg-teal-600 hover:bg-teal-700 text-white rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg active:scale-95"
                      >
                        <Send className="w-5 h-5 ml-0.5" />
                      </button>
                    </div>
                    <div className="text-[10px] text-gray-400 mt-2 text-center opacity-0 group-hover:opacity-100 transition-opacity">
                        Press <b>Enter</b> to post
                    </div>
                  </div>
              </div>
            )}
        </div>
      </div>
      </div>

      {showWordCount && (
        <div 
            className="fixed bottom-6 left-6 z-[60] bg-white rounded-full shadow-lg border border-gray-200 px-4 py-2 flex items-center gap-3 cursor-pointer hover:bg-gray-50 transition-all select-none"
            onClick={() => setShowWordCountDialog(true)}
        >
            <span className="text-gray-700 font-medium text-sm">
                {getAllText().trim().split(/\s+/).filter(w => w.length > 0).length} words
            </span>
            <div className="w-px h-4 bg-gray-300"></div>
             <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
             </svg>
        </div>
      )}
    </div>
  )
}
