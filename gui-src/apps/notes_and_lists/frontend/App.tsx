import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react'
import { useBackendAPI } from '@shared/hooks/useBackendAPI'

interface Note {
  id: string
  title: string
  content: string
  created_at: string
  updated_at: string
  content_history?: string[]
}

interface ListItem {
  id: string
  content: string
  completed: boolean
  created_at: string
  updated_at: string
}

interface List {
  id: string
  title: string
  items: Record<string, ListItem>
  created_at: string
  updated_at: string
  item_history?: Record<string, string[]>
}

type View = 'notes' | 'lists'
type EditorMode = null | { type: 'note', id: string | null } | { type: 'list', id: string | null }

interface OpenWindowConfig {
  id: string
  title: string
  content: React.ReactNode
  width?: number
  height?: number
}

// Undo operation types
type UndoOperationType = 
  | 'create_note' 
  | 'create_list' 
  | 'delete_note' 
  | 'delete_list' 
  | 'update_note' 
  | 'update_note_title'
  | 'update_list_title'
  | 'add_list_item'
  | 'delete_list_item'
  | 'update_list_item'

interface UndoableOperation {
  id: string
  type: UndoOperationType
  timestamp: string
  description: string
  // Data needed to reverse the operation
  targetId: string
  targetTitle?: string
  previousData?: any
}

const HighlightedText = memo(({ text, highlights, className }: { text: string; highlights: string[]; className?: string }) => {
    if (!highlights.length || !text) {
        return <span className={className}>{text}</span>;
    }
    // Escape special regex chars and sort by length (desc) to match longest terms first
    const sortedHighlights = [...highlights].sort((a, b) => b.length - a.length);
    const escapedHighlights = sortedHighlights.map(h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const regex = new RegExp(`(${escapedHighlights})`, 'gi');
    const parts = text.split(regex);
    return (
        <span className={className}>
            {parts.map((part, i) =>
                sortedHighlights.some(h => h.toLowerCase() === part.toLowerCase())
                ? <span key={i} className="bg-yellow-200 text-slate-900 font-medium rounded-sm px-0.5">{part}</span>
                : part
            )}
        </span>
    );
})

const stripMarkdown = (text: string) => {
    if (!text) return '';
    return text
      .replace(/^#+\s+/gm, '') // Remove headers
      .replace(/(\*\*|__)(.*?)\1/g, '$2') // Remove bold
      .replace(/(\*|_)(.*?)\1/g, '$2') // Remove italic
      .replace(/^>\s+/gm, '') // Remove blockquotes
      .replace(/`([^`]+)`/g, '$1') // Remove inline code
      .replace(/^\s*[-+*]\s+/gm, '') // Remove list bullets
      .replace(/^\d+\.\s+/gm, '') // Remove number bullets
      .replace(/\n+/g, ' ') // Replace newlines with spaces
      .trim();
}

// Basic Markdown Renderer to avoid external dependencies
const SimpleMarkdown = ({ content }: { content: string }) => {
  if (!content) return null;
  
  const renderLine = (line: string, idx: number) => {
      // Headers
      if (line.startsWith('# ')) return <h1 key={idx} className="text-3xl font-extrabold mt-6 mb-4 text-slate-900 border-b border-slate-200 pb-2">{renderInline(line.slice(2))}</h1>;
      if (line.startsWith('## ')) return <h2 key={idx} className="text-2xl font-bold mt-5 mb-3 text-slate-800">{renderInline(line.slice(3))}</h2>;
      if (line.startsWith('### ')) return <h3 key={idx} className="text-xl font-semibold mt-4 mb-2 text-slate-800">{renderInline(line.slice(4))}</h3>;
      
      // List items
      if (line.trim().startsWith('- ')) {
          return (
            <div key={idx} className="flex gap-2 ml-4 mb-1">
                <span className="text-slate-400 mt-1.5">•</span>
                <span className="text-slate-700">{renderInline(line.trim().slice(2))}</span>
            </div>
          );
      }
      
      // Numerical List items (simple check)
      if (/^\d+\.\s/.test(line.trim())) {
           const match = line.trim().match(/^(\d+)\.\s(.*)/);
           if (match) {
               return (
                <div key={idx} className="flex gap-2 ml-4 mb-1">
                    <span className="text-slate-400 font-mono text-sm mt-0.5">{match[1]}.</span>
                    <span className="text-slate-700">{renderInline(match[2])}</span>
                </div>
               )
           }
      }

      // Blockquotes
      if (line.startsWith('> ')) {
          return <div key={idx} className="border-l-4 border-slate-300 pl-4 py-1 my-2 text-slate-600 italic">{renderInline(line.slice(2))}</div>
      }

      // Empty lines
      if (!line.trim()) return <div key={idx} className="h-4"></div>

      // Default Paragraph
      return <p key={idx} className="mb-2 text-slate-700 leading-relaxed">{renderInline(line)}</p>
  };

  const renderInline = (text: string) => {
      // Bold: **text**
      const parts = text.split(/(\*\*.*?\*\*)/g);
      return parts.map((part, i) => {
          if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={i} className="font-semibold text-slate-900">{part.slice(2, -2)}</strong>
          }
           // Basic Italic: *text* (very simple, might flake on complex cases but okay for simple notes)
          const italicParts = part.split(/(\*.*?\*)/g);
          return italicParts.map((subPart, j) => {
              if (subPart.startsWith('*') && subPart.endsWith('*') && subPart.length > 2) {
                  return <em key={`${i}-${j}`} className="italic">{subPart.slice(1, -1)}</em>
              }
              // Inline code: `text`
              const codeParts = subPart.split(/(`.*?`)/g);
              return codeParts.map((subSubPart, k) => {
                  if (subSubPart.startsWith('`') && subSubPart.endsWith('`')) {
                      return <code key={`${i}-${j}-${k}`} className="bg-slate-100 px-1 py-0.5 rounded text-sm font-mono text-slate-800 border border-slate-200">{subSubPart.slice(1, -1)}</code>
                  }
                  return subSubPart;
              });
          });
      }).flat().flat();
  };

  return <div className="markdown-preview">{content.split('\n').map((line, i) => renderLine(line, i))}</div>
}

interface AppProps {
  onClose: () => void
  setRefreshHandler?: (handler: (() => void) | null) => void
  openWindow?: (config: OpenWindowConfig) => void
}

export default function NotesAndListsApp({ setRefreshHandler }: AppProps) {
  const [view, setView] = useState<View>('notes')
  const [notes, setNotes] = useState<Note[]>([])
  const [lists, setLists] = useState<List[]>([])
  const [loading, setLoading] = useState(true)
  const loadingRef = useRef(loading)
  loadingRef.current = loading
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [editorMode, setEditorMode] = useState<EditorMode>(null)
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [selectedListId, setSelectedListId] = useState<string | null>(null)
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeTitle, setComposeTitle] = useState('')
  const [composeContent, setComposeContent] = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [openNoteIds, setOpenNoteIds] = useState<string[]>([])
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [deleteConfirmNoteId, setDeleteConfirmNoteId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, { title: string; content: string }>>({})
  const [openListIds, setOpenListIds] = useState<string[]>([])
  const [activeListId, setActiveListId] = useState<string | null>(null)
  const [editingListId, setEditingListId] = useState<string | null>(null)
  const [listDrafts, setListDrafts] = useState<Record<string, { title: string; items: string[] }>>({})
  const [listEditTitle, setListEditTitle] = useState('')
  const [listNewItemInput, setListNewItemInput] = useState('')
  const [listDraftItems, setListDraftItems] = useState<string[]>([])
  const [deletedListItemIds, setDeletedListItemIds] = useState<string[]>([])
  const [originalListItems, setOriginalListItems] = useState<Record<string, any> | null>(null)
  
  // Sort State
  type SortOption = 'DATE_DESC' | 'DATE_ASC' | 'NAME_ASC' | 'NAME_DESC';
  type ViewMode = 'expanded' | 'compact' | 'minimal';
  
  const [sortOption, setSortOption] = useState<SortOption>('DATE_DESC');
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try { return (localStorage.getItem('multiverse_notes_view_mode') as ViewMode) || 'expanded'; } catch { return 'expanded'; }
  });
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);

  useEffect(() => { localStorage.setItem('multiverse_notes_view_mode', viewMode); }, [viewMode]);

  // Sidebar Resize Logic
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const stored = localStorage.getItem('multiverse_notes_sidebar_width');
      return stored ? parseInt(stored) : 384;
    } catch { return 384; }
  }); // Default to w-96 (24rem * 16px)
  
  useEffect(() => { localStorage.setItem('multiverse_notes_sidebar_width', sidebarWidth.toString()); }, [sidebarWidth]);

  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Tab bar scroll refs and state
  const noteTabBarRef = useRef<HTMLDivElement>(null);
  const listTabBarRef = useRef<HTMLDivElement>(null);
  const [noteTabScroll, setNoteTabScroll] = useState({ canScrollLeft: false, canScrollRight: false });
  const [listTabScroll, setListTabScroll] = useState({ canScrollLeft: false, canScrollRight: false });

  const updateTabScrollState = useCallback((ref: React.RefObject<HTMLDivElement | null>, setter: typeof setNoteTabScroll) => {
    const el = ref.current;
    if (!el) return;
    requestAnimationFrame(() => {
      const canScrollLeft = el.scrollLeft > 0;
      const canScrollRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setter(prev => {
        if (prev.canScrollLeft === canScrollLeft && prev.canScrollRight === canScrollRight) return prev;
        return { canScrollLeft, canScrollRight };
      });
    });
  }, []);

  const scrollTabs = useCallback((ref: React.RefObject<HTMLDivElement | null>, direction: 'left' | 'right') => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: direction === 'left' ? -200 : 200, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    updateTabScrollState(noteTabBarRef, setNoteTabScroll);
  }, [openNoteIds, updateTabScrollState]);

  useEffect(() => {
    updateTabScrollState(listTabBarRef, setListTabScroll);
  }, [openListIds, updateTabScrollState]);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizingSidebar(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizingSidebar(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  const resize = useCallback((mouseMoveEvent: MouseEvent) => {
    if (isResizingSidebar && sidebarRef.current) {
        const sidebarRect = sidebarRef.current.getBoundingClientRect();
        // Calculate relative width (clientX is viewport x, sidebarRect.left is sidebar's starting x)
        const newWidthRaw = mouseMoveEvent.clientX - sidebarRect.left;

        // Simple constraints: min 260px, max 800px
        const newWidth = Math.max(260, Math.min(800, newWidthRaw));
        setSidebarWidth(newWidth);
    }
  }, [isResizingSidebar]);

  useEffect(() => {
    if (isResizingSidebar) {
        window.addEventListener("mousemove", resize);
        window.addEventListener("mouseup", stopResizing);
    }
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [isResizingSidebar, resize, stopResizing]);


  
  // Advanced Search State
  const [isAdvancedSearch, setIsAdvancedSearch] = useState(false)
  const [isBulkAddOpen, setIsBulkAddOpen] = useState(false)
  const [queryExpansion, setQueryExpansion] = useState('')
  const [enableQueryExpansion, setEnableQueryExpansion] = useState(true)
  const [enableCaseSensitive, setEnableCaseSensitive] = useState(false)
  const [searchResults, setSearchResults] = useState<{ notes: Note[], lists: List[] } | null>(null)
  
  // Debounce Search
  useEffect(() => {
    const timer = setTimeout(() => {
        if (searchQuery.trim() || queryExpansion.trim()) {
            performSearch();
        } else if (!loadingRef.current) {
            // Only reload if we are not already loading (to prevent initial double load)
             // and if we cleared the search
             loadData(true);
        }
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [searchQuery, queryExpansion, enableQueryExpansion, enableCaseSensitive]);

  // Undo State
  const [isUndoOpen, setIsUndoOpen] = useState(false)
  const [undoOperations, setUndoOperations] = useState<UndoableOperation[]>(() => {
    try {
      const stored = localStorage.getItem('multiverse_notes_undo_operations');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  })
  const MAX_UNDO_OPERATIONS = 20
  const MAX_UNDO_STORAGE_BYTES = 1024 * 1024 // ~1MB limit to avoid localStorage quota issues

  // Persist undo operations with size limit
  useEffect(() => {
    try {
      let ops = undoOperations
      let serialized = JSON.stringify(ops)

      // Trim oldest operations if storage exceeds size limit
      while (serialized.length > MAX_UNDO_STORAGE_BYTES && ops.length > 0) {
        ops = ops.slice(0, -1)
        serialized = JSON.stringify(ops)
      }

      localStorage.setItem('multiverse_notes_undo_operations', serialized)

      // Keep in-memory state consistent with what we stored
      if (ops.length !== undoOperations.length) {
        setUndoOperations(ops)
      }
    } catch {
      // Silently handle localStorage errors (e.g., QuotaExceededError)
    }
  }, [undoOperations]);

  // Helper to add an undoable operation
  const addUndoOperation = useCallback((op: Omit<UndoableOperation, 'id' | 'timestamp'>) => {
    const newOp: UndoableOperation = {
      ...op,
      id: `undo_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      timestamp: new Date().toISOString(),
    };
    setUndoOperations(prev => [newOp, ...prev].slice(0, MAX_UNDO_OPERATIONS));
  }, []);

  const searchHighlights = useMemo(() => {
      if (!enableQueryExpansion) {
        return searchQuery.trim() ? [searchQuery.trim()] : []
      }
      const terms = [searchQuery.trim()];
      if (queryExpansion) {
          terms.push(...queryExpansion.split(',').map(s => s.trim()));
      }
      // Also include query split by comma if expansion is enabled
       if (searchQuery.includes(',')) {
         terms.push(...searchQuery.split(',').map(s => s.trim()))
       }
      return terms.filter(s => s.length > 0);
  }, [searchQuery, queryExpansion, enableQueryExpansion]);

  const loadDataRef = useRef<(silent?: boolean, hint?: 'ANY' | 'NOTE' | 'LIST') => void>(() => {})

  const api = useBackendAPI('notes_and_lists')

  // Stable callback for refreshing the app (always full refresh)
  const refreshApp = useCallback(() => {
    loadDataRef.current(false, 'ANY')
  }, [])

  // Register refresh handler - use a ref to avoid re-render loops from unstable setRefreshHandler identity
  const setRefreshHandlerRef = useRef(setRefreshHandler)
  useEffect(() => {
    setRefreshHandlerRef.current = setRefreshHandler
  }, [setRefreshHandler])

  useEffect(() => {
    const handler = setRefreshHandlerRef.current
    if (handler) {
      handler(() => {
        refreshApp()
      })
    }
    return () => {
      const cleanup = setRefreshHandlerRef.current
      if (cleanup) cleanup(null)
    }
  }, [refreshApp])

  const loadData = useCallback(async (silent = false, hint: 'ANY' | 'NOTE' | 'LIST' = 'ANY') => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const result = await api.callTool<{
        notes?: Record<string, Note>
        lists?: Record<string, List>
      }>('show_all', { hint })

      const notesObj = result?.notes || {}
      const listsObj = result?.lists || {}

      processAndSetData(notesObj, listsObj, hint)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [api.callTool])

  // Keep the ref always up to date
  useEffect(() => {
    loadDataRef.current = loadData
  }, [loadData])

  // Load initial data
  useEffect(() => {
    loadData()
  }, [])

  const processAndSetData = (notesObj: any, listsObj: any, hint: 'ANY' | 'NOTE' | 'LIST' = 'ANY') => {
      // Decode completion status and order from item content
      const decodedLists = Object.values(listsObj).map((list: any) => {
        const decodedItems: Record<string, ListItem> = {}
        const itemsWithOrder: Array<[string, ListItem, number | null]> = []
        
        for (const [itemId, item] of Object.entries(list.items as Record<string, any>)) {
          // First decode order
          const { order, displayContent: contentAfterOrder } = decodeOrderFromContent(item.content)
          // Then decode completion status from the remaining content
          const { completed, displayContent } = decodeItemContent(contentAfterOrder)
          
          decodedItems[itemId] = {
            ...item,
            content: displayContent,
            completed: completed || item.completed,
          }
          itemsWithOrder.push([itemId, decodedItems[itemId], order])
        }
        
        // Sort by order if any items have order information
        const hasOrderInfo = itemsWithOrder.some(([, , order]) => order !== null)
        if (hasOrderInfo) {
          itemsWithOrder.sort((a, b) => {
            const orderA = a[2] ?? Number.MAX_VALUE
            const orderB = b[2] ?? Number.MAX_VALUE
            return orderA - orderB
          })
          
          // Rebuild decodedItems in the new order
          const orderedItems: Record<string, ListItem> = {}
          for (const [itemId, item] of itemsWithOrder) {
            orderedItems[itemId] = item
          }
          return {
            ...list,
            items: orderedItems,
          } as List
        }
        
        return {
          ...list,
          items: decodedItems,
        } as List
      })

      if (hint === 'ANY' || hint === 'NOTE') {
        setNotes(Object.values(notesObj) as Note[])
      }
      if (hint === 'ANY' || hint === 'LIST') {
        setLists(decodedLists)
      }
  }

  const performSearch = async () => {
      const trimmedQuery = searchQuery.trim();
      if (!trimmedQuery) {
          loadData() // Reset to show all
          return
      }
      setLoading(true)
      try {
          // Prepare search terms
          let allTerms: string[] = []
          if (enableQueryExpansion) {
             allTerms = trimmedQuery.split(',').map(s => s.trim()).filter(s => s);
          } else {
             allTerms = [trimmedQuery];
          }
          
          let combinedNotesObj: Record<string, Note> = {}
          let combinedListsObj: Record<string, List> = {}

          // Execute searches in parallel: Fuzzy Search, show_notes_and_lists, AND Exact ID Lookup
          const searchPromises = allTerms.map(term => api.callTool<{ notes?: Note[], lists?: List[] }>('search_notes_and_lists', {
              query: term
          }))

          // Also use show_notes_and_lists for query-based filtered display
          const showFilteredPromise = api.callTool<{ notes?: Note[], lists?: List[] }>('show_notes_and_lists', {
              query: trimmedQuery
          }).catch(() => null);

          // Optimize: Only check for ID if it looks like one (no spaces) to save backend processing
          // and checks if it's the specific term (not other comma separated values)
          const idLookupPromises = allTerms.map(term => {
              const isPotentialId = term.length > 0 && !term.includes(' ');
              return isPotentialId ? api.callTool<{ notes?: Note[], lists?: List[] }>('get_notes_and_lists', { item_ids: [term] })
                .catch(() => null) : Promise.resolve(null);
          });

          const [fuzzyResults, idResults, showFilteredResult] = await Promise.all([
              Promise.all(searchPromises),
              Promise.all(idLookupPromises),
              showFilteredPromise,
          ]);

          // Process Fuzzy Results
          fuzzyResults.forEach(result => {
              if (result) {
                 const notesList = result.notes || []
                 const listsList = result.lists || []
                 notesList.forEach((note: any) => combinedNotesObj[note.id] = note)
                 listsList.forEach((list: any) => combinedListsObj[list.id] = list)
              }
          })

          // Process ID Results
          idResults.forEach(idResult => {
            if (idResult) {
                const foundNotes = idResult.notes || [];
                const foundLists = idResult.lists || [];

                foundNotes.forEach((note: any) => combinedNotesObj[note.id] = note);
                foundLists.forEach((list: any) => combinedListsObj[list.id] = list);
             }
          });

          // Process show_notes_and_lists results
          if (showFilteredResult) {
            const filteredNotes = showFilteredResult.notes || [];
            const filteredLists = showFilteredResult.lists || [];
            filteredNotes.forEach((note: any) => combinedNotesObj[note.id] = note);
            filteredLists.forEach((list: any) => combinedListsObj[list.id] = list);
          }

          // Apply Client-Side Case Sensitivity Filter if enabled
          if (enableCaseSensitive) {
             const keepNoteIds = new Set<string>();
             Object.values(combinedNotesObj).forEach(note => {
                 const matches = allTerms.some(term => 
                     note.title.includes(term) || note.content.includes(term)
                 );
                 if (matches) keepNoteIds.add(note.id);
             });
             combinedNotesObj = Object.fromEntries(
                 Object.entries(combinedNotesObj).filter(([id]) => keepNoteIds.has(id))
             );

             const keepListIds = new Set<string>();
             Object.values(combinedListsObj).forEach(list => {
                 const matchesTitle = list.title && allTerms.some(term => list.title!.includes(term));
                 const matchesItems = list.items && Object.values(list.items).some((item: any) => 
                     allTerms.some(term => item.content.includes(term))
                 );
                 if (matchesTitle || matchesItems) keepListIds.add(list.id);
             });
             combinedListsObj = Object.fromEntries(
                 Object.entries(combinedListsObj).filter(([id]) => keepListIds.has(id))
             );
          }
          
          processAndSetData(combinedNotesObj, combinedListsObj)
          
      } catch (err) {
          setError(err instanceof Error ? err.message : 'Search failed')
      } finally {
          setLoading(false)
      }
  }

  const handleUndoOperation = async (operation: UndoableOperation) => {
    try {
      // Call the backend undo API to record the undo action
      await api.callTool('undo', { undo_operation_ids: [operation.id] }).catch(() => {
        // Backend undo may fail if operation wasn't tracked server-side; proceed with client-side undo
      });

      switch (operation.type) {
        case 'create_note':
          // Undo create = delete the note
          await api.callTool('delete_notes_and_lists', { item_id: operation.targetId });
          setNotes(prev => prev.filter(n => n.id !== operation.targetId));
          closeNoteTab(operation.targetId);
          break;
          
        case 'create_list':
          // Undo create = delete the list
          await api.callTool('delete_notes_and_lists', { item_id: operation.targetId });
          setLists(prev => prev.filter(l => l.id !== operation.targetId));
          closeListTab(operation.targetId);
          break;
          
        case 'delete_note':
          // Undo delete = recreate the note with previous data
          if (operation.previousData) {
            const result = await api.callTool<any>('create_note', {
              title: operation.previousData.title || 'Restored Note',
              text_content: operation.previousData.content || '',
            });
            if (result?.id) {
              loadData(true);
            }
          }
          break;
          
        case 'delete_list':
          // Undo delete = recreate the list with previous data
          if (operation.previousData) {
            const result = await api.callTool<any>('create_list', {
              list_name: operation.previousData.title || 'Restored List',
            });
            if (result?.id) {
              // Re-add items if they existed
              if (operation.previousData.items) {
                for (const item of Object.values(operation.previousData.items) as any[]) {
                  await api.callTool('add_to_list', {
                    list_id: result.id,
                    elements_to_add: [item.content],
                  });
                }
              }
              loadData(true);
            }
          }
          break;
          
        case 'update_note':
        case 'update_note_title':
          // Undo update = restore previous content/title
          if (operation.previousData) {
            await api.callTool('update_note', {
              note_id: operation.targetId,
              text_content: operation.previousData.content,
              update_type: 'REPLACE',
            });
            if (operation.previousData.title) {
              await api.callTool('update_title', {
                item_id: operation.targetId,
                updated_title: operation.previousData.title,
              });
            }
            loadData(true);
          }
          break;
          
        case 'update_list_title':
          // Undo title update = restore previous title
          if (operation.previousData?.title) {
            await api.callTool('update_title', {
              item_id: operation.targetId,
              updated_title: operation.previousData.title,
            });
            loadData(true);
          }
          break;
          
        case 'add_list_item':
          // Undo add = delete the item
          await api.callTool('delete_list_item', {
            list_id: operation.previousData?.listId,
            elements_to_delete: [operation.targetId],
          });
          loadData(true);
          break;
          
        case 'delete_list_item':
          // Undo delete = re-add the item
          if (operation.previousData) {
            await api.callTool('add_to_list', {
              list_id: operation.previousData.listId,
              elements_to_add: [operation.previousData.content],
            });
            loadData(true);
          }
          break;
          
        case 'update_list_item':
          // Undo update = restore previous content
          if (operation.previousData) {
            await api.callTool('update_list_item', {
              list_id: operation.previousData.listId,
              list_item_id: operation.targetId,
              updated_element: operation.previousData.content,
            });
            loadData(true);
          }
          break;
      }
      
      // Remove the undone operation from the list
      setUndoOperations(prev => prev.filter(op => op.id !== operation.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Undo failed');
      throw err;
    }
  }

  const handleRestoreNoteVersion = async (noteId: string, content: string) => {
    try {
      await api.callTool('update_note', {
        note_id: noteId,
        text_content: content,
        update_type: 'REPLACE',
      })
      loadData(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed')
    }
  }



  // Helper functions for encoding/decoding completion status in content
  const COMPLETED_PREFIX = '[COMPLETED] '

  const encodeItemContent = (content: string, completed: boolean): string => {
    // Remove existing prefix if present
    const cleanContent = content.startsWith(COMPLETED_PREFIX)
      ? content.slice(COMPLETED_PREFIX.length)
      : content
    
    // Add prefix if completed
    return completed ? COMPLETED_PREFIX + cleanContent : cleanContent
  }

  const decodeItemContent = (content: string): { completed: boolean; displayContent: string } => {
    if (content.startsWith(COMPLETED_PREFIX)) {
      return {
        completed: true,
        displayContent: content.slice(COMPLETED_PREFIX.length),
      }
    }
    return {
      completed: false,
      displayContent: content,
    }
  }

  // Helper functions for encoding/decoding order in content
  const ORDER_PREFIX_REGEX = /^\[#(\d+)\]\s*/
  
  const encodeOrderInContent = (content: string, order: number): string => {
    // Remove existing order prefix if present (may be at the start if already encoded)
    const cleanContent = content.replace(ORDER_PREFIX_REGEX, '')
    // Add new order prefix at the start (this puts it before [COMPLETED] if present)
    return `[#${order}] ${cleanContent}`
  }

  const decodeOrderFromContent = (content: string): { order: number | null; displayContent: string } => {
    const match = content.match(ORDER_PREFIX_REGEX)
    if (match) {
      return {
        order: parseInt(match[1], 10),
        displayContent: content.replace(ORDER_PREFIX_REGEX, ''),
      }
    }
    return {
      order: null,
      displayContent: content,
    }
  }

  // Use state data directly - search is handled by backend
  const filteredNotes = useMemo(() => {
     let result = [...notes];
     // Sort
     return result.sort((a, b) => {
         switch (sortOption) {
             case 'NAME_ASC': return (a.title || '').localeCompare(b.title || '');
             case 'NAME_DESC': return (b.title || '').localeCompare(a.title || '');
             case 'DATE_ASC': return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
             case 'DATE_DESC': return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
             default: return 0;
         }
     });
  }, [notes, searchQuery, sortOption]);

  const filteredLists = useMemo(() => {
     let result = [...lists];
     // Sort
     return result.sort((a, b) => {
         switch (sortOption) {
             case 'NAME_ASC': return (a.title || '').localeCompare(b.title || '');
             case 'NAME_DESC': return (b.title || '').localeCompare(a.title || '');
             case 'DATE_ASC': return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
             case 'DATE_DESC': return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
             default: return 0;
         }
     });
  }, [lists, searchQuery, sortOption]);


  const handleCreateNote = async () => {
    // Create a temporary draft note with a unique ID
    const tempId = `draft_${Date.now()}`
    // Add to drafts with empty title and content (just placeholders)
    setDrafts({ ...drafts, [tempId]: { title: '', content: '' } })
    // Set edit state to empty (will use placeholders)
    setEditTitle('')
    setEditContent('')
    setOpenNoteIds([...openNoteIds, tempId])
    setActiveNoteId(tempId)
    setEditingNoteId(tempId)
    // Close the composer panel to show the draft tab instead
    setComposeOpen(false)
    setShowEmojiPicker(false)
  }

  const saveDraftNote = async () => {
    if (!activeNoteId || !activeNoteId.startsWith('draft_')) return

    try {
      // Prepare content: if empty, use a placeholder default value
      const contentToSave = editContent.trim() || '(No content)'
      
      const result = await api.callTool<any>('create_note', {
        title: editTitle.trim() || 'Title',
        text_content: contentToSave,
      })
      if (result?.id) {
        // Backend returns the note object with id, title, content, created_at, updated_at, content_history
        const newNote = result
        setNotes([...notes, newNote])

        // Track undo operation
        addUndoOperation({
          type: 'create_note',
          description: `Created note "${newNote.title}"`,
          targetId: newNote.id,
          targetTitle: newNote.title,
        })

        // Remove draft from drafts object and replace tab
        const newDrafts = { ...drafts }
        delete newDrafts[activeNoteId]
        setDrafts(newDrafts)
        
        const newOpenIds = openNoteIds.map((id) => (id === activeNoteId ? newNote.id : id))
        setOpenNoteIds(newOpenIds)
        setActiveNoteId(newNote.id)
        setEditTitle('')
        setEditContent('')
        setEditingNoteId(null)
        setError(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save note')
    }
  }

  const closeDraftNote = (draftId: string) => {
    // Remove draft from drafts and from open tabs
    const newDrafts = { ...drafts }
    delete newDrafts[draftId]
    setDrafts(newDrafts)
    closeNoteTab(draftId)
  }

  const handleComposeCreate = async () => {
    if (!composeTitle.trim() && !composeContent.trim()) {
      setError('Please add a title or content for your note')
      return
    }

    try {
      const result = await api.callTool<any>('create_note', {
        title: composeTitle.trim() || 'Title',
        text_content: composeContent.trim(),
      })
      if (result?.id) {
        const newNote = result
        setNotes([...notes, newNote])
        
        // Track undo operation
        addUndoOperation({
          type: 'create_note',
          description: `Created note "${newNote.title}"`,
          targetId: newNote.id,
          targetTitle: newNote.title,
        })
        
        setComposeTitle('')
        setComposeContent('')
        setComposeOpen(false)
        setShowEmojiPicker(false)
        setError(null)
        // Open the new note in a tab
        openNoteTab(newNote.id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create note')
    }
  }

  const handleAddEmoji = (emoji: string) => {
    setComposeContent(composeContent + emoji)
  }

  const handleCancelCompose = () => {
    setComposeTitle('')
    setComposeContent('')
    setComposeOpen(false)
    setShowEmojiPicker(false)
  }

  const openNoteTab = (noteId: string) => {
    if (!openNoteIds.includes(noteId)) {
      setOpenNoteIds([...openNoteIds, noteId])
    }
    setActiveNoteId(noteId)
    const note = notes.find((n) => n.id === noteId)
    if (note && editingNoteId !== noteId) {
      setEditTitle(note.title)
      setEditContent(note.content)
    }
  }

  const closeNoteTab = (noteId: string) => {
    const newOpenIds = openNoteIds.filter((id) => id !== noteId)
    setOpenNoteIds(newOpenIds)
    if (activeNoteId === noteId) {
      setActiveNoteId(newOpenIds.length > 0 ? newOpenIds[newOpenIds.length - 1] : null)
    }
    if (editingNoteId === noteId) {
      setEditingNoteId(null)
    }
  }

  const startEditingNote = (noteId: string) => {
    const note = notes.find((n) => n.id === noteId)
    if (note) {
      setEditTitle(note.title)
      setEditContent(note.content)
      setEditingNoteId(noteId)
    }
  }

  const saveEditingNote = async (noteId: string) => {
    try {
      const originalNote = notes.find(n => n.id === noteId);
      
      // Update title using update_title API
      await api.callTool<any>('update_title', {
        item_id: noteId,
        updated_title: editTitle.trim() || 'Title',
      })

      const newContent = editContent;
      
      // Check if this is a pure append operation
      if (originalNote && originalNote.content && newContent.startsWith(originalNote.content) && newContent.length > originalNote.content.length) {
          const textToAppend = newContent.substring(originalNote.content.length);
          await api.callTool<any>('append_to_note', {
              note_id: noteId,
              text_content: textToAppend
          });
      } else {
          // Update content using update_note API with REPLACE update type
          await api.callTool<any>('update_note', {
            note_id: noteId,
            text_content: newContent,
            update_type: 'REPLACE',
          })
      }

      // Track undo operation
      if (originalNote) {
        addUndoOperation({
          type: 'update_note',
          description: `Updated note "${originalNote.title}"`,
          targetId: noteId,
          targetTitle: originalNote.title,
          previousData: {
            title: originalNote.title,
            content: originalNote.content,
          },
        })
      }

      // Merge both results and refresh the notes list
      const updatedNote = {
        id: noteId,
        title: editTitle.trim() || 'Title',
        content: newContent,
      }
      setNotes(notes.map((n) => (n.id === noteId ? { ...n, ...updatedNote } : n)))
      setEditingNoteId(null)
      setError(null)
      loadData(true) // Refresh to capture history changes
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update note')
    }
  }

  const confirmDeleteNote = async () => {
    if (!deleteConfirmNoteId) return
    const noteToDelete = notes.find(n => n.id === deleteConfirmNoteId)
    try {
      await api.callTool('delete_notes_and_lists', {
        item_id: deleteConfirmNoteId,
      })
      
      // Track undo operation before deleting
      if (noteToDelete) {
        addUndoOperation({
          type: 'delete_note',
          description: `Deleted note "${noteToDelete.title}"`,
          targetId: deleteConfirmNoteId,
          targetTitle: noteToDelete.title,
          previousData: {
            title: noteToDelete.title,
            content: noteToDelete.content,
          },
        })
      }
      
      setNotes(notes.filter((n) => n.id !== deleteConfirmNoteId))
      closeNoteTab(deleteConfirmNoteId)
      setDeleteConfirmNoteId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete note')
    }
  }

  const handleUpdateNote = async (noteId: string, title: string, content: string) => {
    try {
      const originalNote = notes.find(n => n.id === noteId)
      const result = await api.callTool<any>('update_note', {
        note_id: noteId,
        text_content: content,
        update_type: 'replace',
      })
      if (result?.note || result) {
        const updatedNote = result?.note || result
        
        // Track undo operation
        if (originalNote) {
          addUndoOperation({
            type: 'update_note',
            description: `Updated note "${originalNote.title}"`,
            targetId: noteId,
            targetTitle: originalNote.title,
            previousData: {
              title: originalNote.title,
              content: originalNote.content,
            },
          })
        }
        
        setNotes(notes.map((n) => (n.id === noteId ? { ...n, ...updatedNote } : n)))
        setSelectedNoteId(noteId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update note')
    }
  }

  const handleDeleteNote = async (noteId: string) => {
    const noteToDelete = notes.find(n => n.id === noteId)
    try {
      await api.callTool('delete_notes_and_lists', {
        item_id: noteId,
      })
      
      // Track undo operation
      if (noteToDelete) {
        addUndoOperation({
          type: 'delete_note',
          description: `Deleted note "${noteToDelete.title}"`,
          targetId: noteId,
          targetTitle: noteToDelete.title,
          previousData: {
            title: noteToDelete.title,
            content: noteToDelete.content,
          },
        })
      }
      
      setNotes(notes.filter((n) => n.id !== noteId))
      if (selectedNoteId === noteId) {
        setSelectedNoteId(null)
        setEditorMode(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete note')
    }
  }

  const handleCreateList = async () => {
    try {
      const result = await api.callTool<any>('create_list', {
        list_name: 'New List',
      })
      if (result?.list || result?.id) {
        const newList = result?.list || result
        
        // Decode completion status and order from items if present
        if (newList.items) {
          const decodedItems: Record<string, ListItem> = {}
          for (const [itemId, item] of Object.entries(newList.items)) {
            const { order, displayContent: contentAfterOrder } = decodeOrderFromContent((item as any).content)
            const { completed, displayContent } = decodeItemContent(contentAfterOrder)
            decodedItems[itemId] = {
              ...(item as any),
              content: displayContent,
              completed: completed,
            }
          }
          newList.items = decodedItems
        }
        
        // Track undo operation
        addUndoOperation({
          type: 'create_list',
          description: `Created list "${newList.title}"`,
          targetId: newList.id,
          targetTitle: newList.title,
        })
        
        setLists([...lists, newList])
        setSelectedListId(newList.id)
        setEditorMode({ type: 'list', id: newList.id })
        setView('lists')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create list')
    }
  }

  const handleUpdateListTitle = async (listId: string, title: string) => {
    try {
      const originalList = lists.find(l => l.id === listId)
      const result = await api.callTool<any>('update_title', {
        item_id: listId,
        updated_title: title,
      })
      if (result?.list || result) {
        const updatedList = result?.list || result
        
        // Track undo operation
        if (originalList) {
          addUndoOperation({
            type: 'update_list_title',
            description: `Renamed list "${originalList.title}" to "${title}"`,
            targetId: listId,
            targetTitle: originalList.title,
            previousData: {
              title: originalList.title,
            },
          })
        }
        
        setLists(lists.map((l) => (l.id === listId ? { ...l, title: updatedList.title || title } : l)))
        setSelectedListId(listId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update list')
    }
  }

  const handleDeleteList = async (listId: string) => {
    const listToDelete = lists.find(l => l.id === listId)
    try {
      await api.callTool('delete_notes_and_lists', {
        item_id: listId,
      })
      
      // Track undo operation
      if (listToDelete) {
        addUndoOperation({
          type: 'delete_list',
          description: `Deleted list "${listToDelete.title}"`,
          targetId: listId,
          targetTitle: listToDelete.title,
          previousData: {
            title: listToDelete.title,
            items: listToDelete.items,
          },
        })
      }
      
      setLists(lists.filter((l) => l.id !== listId))
      if (selectedListId === listId) {
        setSelectedListId(null)
        setEditorMode(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete list')
    }
  }

  const handleCreateListItem = async (listId: string, content: string) => {
    try {
      const result = await api.callTool<any>('add_to_list', {
        list_id: listId,
        elements_to_add: [content],
      })
      if (result?.lists?.[0] || result?.list) {
        const updatedList = result?.lists?.[0] || result?.list
        
        // Decode completion status and order from item content
        const decodedItems: Record<string, ListItem> = {}
        for (const [itemId, item] of Object.entries(updatedList.items || {})) {
          const { order, displayContent: contentAfterOrder } = decodeOrderFromContent((item as any).content)
          const { completed, displayContent } = decodeItemContent(contentAfterOrder)
          decodedItems[itemId] = {
            ...(item as any),
            content: displayContent,
            completed: completed,
          }
        }
        
        const updatedLists = lists.map((l) => {
          if (l.id === listId) {
            return {
              ...l,
              items: decodedItems || l.items,
            }
          }
          return l
        })
        setLists(updatedLists)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create list item')
    }
  }

  const handleUpdateListItem = async (listId: string, itemId: string, content: string, completed: boolean) => {
    try {
      // Encode completion status into content for backend persistence
      const encodedContent = encodeItemContent(content, completed)
      
      // Call backend to update the item with encoded content
      await api.callTool<any>('update_list_item', {
        list_id: listId,
        list_item_id: itemId,
        updated_element: encodedContent,
      })

      // Update local state with the new completion status and display content
      const updatedLists = lists.map((l) => {
        if (l.id === listId) {
          return {
            ...l,
            items: {
              ...l.items,
              [itemId]: {
                ...l.items[itemId],
                content: content,
                completed: completed,
              },
            },
          }
        }
        return l
      })
      setLists(updatedLists)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update list item')
    }
  }

  const handleDeleteListItem = (listId: string, itemId: string) => {
    try {
      // Record undo operation before deleting
      const list = lists.find((l) => l.id === listId)
      const deletedItem = list?.items[itemId]
      if (deletedItem) {
        addUndoOperation({
          type: 'delete_list_item',
          targetId: itemId,
          description: `Delete list item "${deletedItem.content}"`,
          previousData: {
            listId,
            content: deletedItem.content,
          },
        })
      }

      // Track the deleted item ID
      setDeletedListItemIds((prev) => [...prev, itemId])

      // Update local state - remove the item
      const updatedLists = lists.map((l) => {
        if (l.id === listId) {
          const newItems = { ...l.items }
          delete newItems[itemId]
          return {
            ...l,
            items: newItems,
          }
        }
        return l
      })
      setLists(updatedLists)
      
      // Mark the list as being edited so Save button appears
      if (editingListId !== listId) {
        setEditingListId(listId)
        // Store original items for comparison on save
        const listToEdit = lists.find((l) => l.id === listId)
        if (listToEdit) {
          setOriginalListItems({ ...listToEdit.items })
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete list item')
    }
  }

  const handleReorderItems = async (listId: string, itemIds: string[]) => {
    try {
      // For now, we'll skip reordering as the API might not support it
      // This can be implemented if the backend supports it
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder items')
    }
  }

  // List Tab Handlers (mirroring note handlers)
  const handleCreateDraftList = () => {
    const tempId = `draft_list_${Date.now()}`
    setListDrafts({ ...listDrafts, [tempId]: { title: '', items: [] } })
    setOpenListIds([...openListIds, tempId])
    setActiveListId(tempId)
    setEditingListId(tempId)
    setListEditTitle('')
    setListDraftItems([])
  }

  const saveDraftList = async () => {
    if (!activeListId || !activeListId.startsWith('draft_list_')) return

    try {
      const result = await api.callTool<any>('create_list', {
        list_name: listEditTitle.trim() || 'Title',
      })
      if (result?.list || result?.id) {
        let newList = result?.list || result
        
        // Add draft items if any
        if (listDraftItems.length > 0) {
          const itemsToAdd = listDraftItems.filter((item) => item.trim())
          if (itemsToAdd.length > 0) {
            await api.callTool<any>('add_to_list', {
              list_id: newList.id,
              elements_to_add: itemsToAdd,
            })
          }
        }

        // Reload all lists to ensure we have the complete data
        const reloadResult = await api.callTool<{
          notes?: Record<string, Note>
          lists?: Record<string, List>
        }>('show_all', { hint: 'ANY' })
        
        if (reloadResult?.lists) {
          // Decode completion status and order from item content
          const decodedLists = Object.values(reloadResult.lists).map((list: any) => {
            const decodedItems: Record<string, ListItem> = {}
            for (const [itemId, item] of Object.entries(list.items)) {
              const { order, displayContent: contentAfterOrder } = decodeOrderFromContent((item as any).content)
              const { completed, displayContent } = decodeItemContent(contentAfterOrder)
              decodedItems[itemId] = {
                ...(item as any),
                content: displayContent,
                completed: completed,
              }
            }
            return {
              ...list,
              items: decodedItems,
            }
          })
          setLists(decodedLists)
        }

        // Remove draft from drafts object and replace tab
        const newDrafts = { ...listDrafts }
        delete newDrafts[activeListId]
        setListDrafts(newDrafts)

        // Replace draft ID with real ID in openListIds
        setOpenListIds(openListIds.map((id) => (id === activeListId ? newList.id : id)))
        setActiveListId(newList.id)
        setEditingListId(null)
        
        // Clear draft items
        setListDraftItems([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save list')
    }
  }

  const closeDraftList = (draftId: string) => {
    const newDrafts = { ...listDrafts }
    delete newDrafts[draftId]
    setListDrafts(newDrafts)
    setOpenListIds(openListIds.filter((id) => id !== draftId))
    if (activeListId === draftId) {
      setActiveListId(openListIds.filter((id) => id !== draftId)[0] || null)
    }
  }

  const openListTab = (listId: string) => {
    if (!openListIds.includes(listId)) {
      setOpenListIds([...openListIds, listId])
    }
    setActiveListId(listId)
    setEditingListId(null)
    setListEditTitle('')
    setListDraftItems([])
  }

  const closeListTab = (listId: string) => {
    setOpenListIds(openListIds.filter((id) => id !== listId))
    if (activeListId === listId) {
      setActiveListId(openListIds.filter((id) => id !== listId)[0] || null)
    }
  }

  const startEditingList = (listId: string) => {
    const list = lists.find((l) => l.id === listId)
    if (list) {
      setEditingListId(listId)
      setListEditTitle(list.title)
      setListDraftItems([])
    }
  }

  const saveEditingList = async (listId: string, itemOrder: string[] = []) => {
    if (!editingListId) return

    try {
      // Update title if changed
      if (listEditTitle.trim()) {
        await api.callTool<any>('update_title', {
          item_id: listId,
          updated_title: listEditTitle.trim(),
        })
      }

      // Add any new draft items
      if (listDraftItems.length > 0) {
        const itemsToAdd = listDraftItems.filter((item) => item.trim())
        if (itemsToAdd.length > 0) {
          await api.callTool<any>('add_to_list', {
            list_id: listId,
            elements_to_add: itemsToAdd,
          })
        }
      }

      // Delete items that were removed
      if (deletedListItemIds.length > 0) {
        await api.callTool<any>('delete_list_item', {
          list_id: listId,
          elements_to_delete: deletedListItemIds,
        })
      }

      // Reload the entire data to get new item IDs from newly added items
      let freshResult = await api.callTool<{
        notes?: Record<string, Note>
        lists?: Record<string, List>
      }>('show_all', { hint: 'ANY' })

      const freshList = freshResult?.lists ? Object.values(freshResult.lists).find((l: any) => l.id === listId) : null
      
      if (freshList) {
        // Build the complete item order including both existing ordered items and new items
        let finalItemOrder: string[] = []
        
        // If we have explicit order, use it for existing items, then append new items at the end
        if (itemOrder.length > 0) {
          finalItemOrder = [...itemOrder]
          // Add any new items (those not in itemOrder) to the end
          const newItems = Object.keys(freshList.items).filter((id) => !itemOrder.includes(id))
          finalItemOrder = [...finalItemOrder, ...newItems]
        } else {
          // If no explicit order, use all items
          finalItemOrder = Object.keys(freshList.items)
        }

        // Persist the new item order by updating each item with its order encoded
        if (finalItemOrder.length > 0) {
          // Update each item with its new order
          for (let i = 0; i < finalItemOrder.length; i++) {
            const itemId = finalItemOrder[i]
            const item = freshList.items[itemId]
            if (item) {
              // First decode any existing completion status from the content
              const { completed, displayContent } = decodeItemContent(item.content)
              // Encode completion status first (using decoded value), then order (order must be at start for regex matching)
              const completionEncodedContent = encodeItemContent(displayContent, completed)
              const orderEncodedContent = encodeOrderInContent(completionEncodedContent, i)
              
              // Update the item with the encoded content
              await api.callTool<any>('update_list_item', {
                list_id: listId,
                list_item_id: itemId,
                updated_element: orderEncodedContent,
              })
            }
          }
        }
      }

      // Reload the lists to get updated data from backend with all order encodings applied
      const result = await api.callTool<{
        notes?: Record<string, Note>
        lists?: Record<string, List>
      }>('show_all', { hint: 'ANY' })
      
      if (result?.lists) {
        // Decode completion status and order from item content
        const decodedLists = Object.values(result.lists).map((list: any) => {
          const decodedItems: Record<string, ListItem> = {}
          const itemsWithOrder: Array<[string, ListItem, number | null]> = []
          
          for (const [itemId, item] of Object.entries(list.items)) {
            // First decode order
            const { order, displayContent: contentAfterOrder } = decodeOrderFromContent((item as any).content)
            // Then decode completion status from the remaining content
            const { completed, displayContent } = decodeItemContent(contentAfterOrder)
            
            decodedItems[itemId] = {
              ...(item as any),
              content: displayContent,
              completed: completed,
            }
            itemsWithOrder.push([itemId, decodedItems[itemId], order])
          }
          
          // Sort by order if any items have order information
          const hasOrderInfo = itemsWithOrder.some(([, , order]) => order !== null)
          if (hasOrderInfo) {
            itemsWithOrder.sort((a, b) => {
              const orderA = a[2] ?? Number.MAX_VALUE
              const orderB = b[2] ?? Number.MAX_VALUE
              return orderA - orderB
            })
            
            // Rebuild decodedItems in the new order
            const orderedItems: Record<string, ListItem> = {}
            for (const [itemId, item] of itemsWithOrder) {
              orderedItems[itemId] = item
            }
            return {
              ...list,
              items: orderedItems,
            }
          }
          
          return {
            ...list,
            items: decodedItems,
          }
        })
        setLists(decodedLists)
      }

      setEditingListId(null)
      setListEditTitle('')
      setDeletedListItemIds([])
      setOriginalListItems(null)
      setListDraftItems([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save list')
    }
  }

  const addDraftListItem = (content: string) => {
    if (content.trim()) {
      // Always add to draft items while editing
      setListDraftItems([...listDraftItems, content.trim()])
      setListNewItemInput('')
    }
  }

  const handleBulkAdd = async (data: { query?: string, listId?: string, items: string[], isBulk?: boolean, queryExpansion?: string[] }) => {
    const { query, listId, items, isBulk, queryExpansion } = data;
    if ((!query?.trim() && !listId) || items.length === 0) {
      return;
    }

    // Handle draft lists locally
    if (listId && listId.startsWith('draft_')) {
        setListDraftItems(prev => [...prev, ...items]);
        setIsBulkAddOpen(false);
        return;
    }

    setLoading(true);
    try {
        if (listId) {
             await api.callTool<any>('add_to_list', {
                list_id: listId,
                elements_to_add: items
            });
        } else if (query) {
            
            // First search to check if we should add to existing or create new
            // We do this manually because backend add_to_list logic can be too aggressive with fuzzy matching,
            // preventing creation of new lists that have similar-sounding existing lists.
            let shouldCreate = false;
            let targetListId: string | null = null;
            
            if (!isBulk && (!queryExpansion || queryExpansion.length === 0)) {
                const searchRes = await api.callTool<any>('search_notes_and_lists', { query });
                const foundLists = searchRes?.lists || [];
                
                // Check for exact match (case-insensitive)
                const exactMatch = foundLists.find((l: any) => l.title?.toLowerCase().trim() === query.toLowerCase().trim());
                
                if (exactMatch) {
                    targetListId = exactMatch.id;
                } else {
                    shouldCreate = true;
                }
            }
            
            if (targetListId) {
                 await api.callTool<any>('add_to_list', {
                    list_id: targetListId,
                    elements_to_add: items
                });
            } else if (shouldCreate) {
                 await api.callTool<any>('create_list', {
                    list_name: query,
                    elements_to_add: items
                 });
            } else {
                // Fallback for bulk mode or if logic above implies standard behavior
                await api.callTool<any>('add_to_list', {
                    query: query,
                    elements_to_add: items,
                    is_bulk_mutation: !!isBulk,
                    query_expansion: queryExpansion,
                    list_name: query 
                });
            }
        }
        
        loadData(); // Refresh all data
        setIsBulkAddOpen(false);
    } catch (err) {
        console.error('handleBulkAdd error:', err);
        setError(err instanceof Error ? err.message : 'Bulk add failed');
    } finally {
        setLoading(false);
    }
  }

  return (
    <div className="h-full w-full flex flex-col bg-slate-50 overflow-hidden">
      <style>{`
        .tab-bar-scroll::-webkit-scrollbar { display: none; }
        .tab-bar-scroll { scrollbar-width: none; -ms-overflow-style: none; }
      `}</style>
      {/* Top Toolbar */}
      <div className="bg-white border-b border-blue-200 px-6 py-4 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <img src="./icons/notes_and_lists.svg" alt="Notes & Lists" className="w-6 h-6" />
          <h1 className="text-xl font-semibold text-slate-800">Notes & Lists</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Undo Button */}
           <button
             onClick={() => setIsUndoOpen(true)}
             className="p-1 text-slate-500 hover:bg-slate-100 rounded mr-2 relative"
             title={undoOperations.length > 0 ? `Undo (${undoOperations.length} available)` : "Undo - No recent operations"}
           >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              {undoOperations.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center">
                  {undoOperations.length > 9 ? '9+' : undoOperations.length}
                </span>
              )}
           </button>
          
          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold text-sm">
            U
          </div>
        </div>
      </div>
      
      <UndoDialog 
            isOpen={isUndoOpen} 
            onClose={() => setIsUndoOpen(false)} 
            operations={undoOperations}
            onUndo={handleUndoOperation}
            onClearAll={() => setUndoOperations([])}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Unified Sidebar */}
        <div 
          ref={sidebarRef}
          className="bg-white border-r border-blue-200 flex flex-col relative shrink-0"
          style={{ width: sidebarWidth }}
        >
          {/* Resizer Handle */}
          <div
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 active:bg-blue-600 transition-colors z-50 opacity-0 hover:opacity-100 active:opacity-100"
            style={{ transform: 'translateX(50%)' }}
            onMouseDown={startResizing}
          />

          {/* Row 1: App Switcher */}
          <div className="grid grid-cols-2 p-2 gap-2 border-b border-blue-100">
             <button
                onClick={() => { 
                    setView('notes')
                    loadData(false, 'NOTE')
                }}
                className={`px-4 py-2 rounded-lg font-medium text-center transition-colors ${
                  view === 'notes' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                Notes
              </button>
              <button
                onClick={() => {
                    setView('lists')
                    loadData(false, 'LIST')
                }}
                className={`px-4 py-2 rounded-lg font-medium text-center transition-colors ${
                  view === 'lists' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                Lists
              </button>
            </div>

            {/* Row 2: Actions & Search (Merged) */}
            <div className="flex items-center p-2 gap-2 border-b border-blue-100 bg-white relative z-10">
                {/* 2a. View & Sort (Left) */}
                <div className="flex gap-1">
                    {/* View Options */}
                    <div className="relative">
                        <button 
                            onClick={() => setIsViewMenuOpen(!isViewMenuOpen)}
                            className={`flex items-center justify-center w-8 h-8 transition-colors rounded-md border shadow-sm ${isViewMenuOpen ? 'bg-slate-200 border-slate-300' : 'bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-700 border-slate-200'}`}
                            title="View Options"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                        </button>
                        {isViewMenuOpen && (
                            <>
                            <div className="fixed inset-0 z-10" onClick={() => setIsViewMenuOpen(false)}></div>
                            <div className="absolute left-0 top-full mt-1 w-40 bg-white border border-slate-200 shadow-xl rounded-lg z-20 py-1 overflow-hidden">
                                {[
                                    { label: 'Expanded', value: 'expanded', icon: 'M4 6h16M4 12h16M4 18h16' },
                                    { label: 'Compact', value: 'compact', icon: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
                                    { label: 'List Only', value: 'minimal', icon: 'M4 6h16M4 10h16M4 14h16' },
                                ].map(opt => (
                                    <button
                                        key={opt.value}
                                        onClick={() => { setViewMode(opt.value as any); setIsViewMenuOpen(false); }}
                                        className={`w-full text-left px-4 py-2 text-xs flex items-center gap-2 group ${viewMode === opt.value ? 'bg-blue-50 text-blue-600 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}
                                    >
                                        <svg className="w-4 h-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={opt.icon} /></svg>
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                            </>
                        )}
                    </div>

                    {/* Sort */}
                    <div className="relative">
                        <button 
                            onClick={() => setIsSortMenuOpen(!isSortMenuOpen)}
                            className={`flex items-center justify-center w-8 h-8 transition-colors rounded-md border shadow-sm ${isSortMenuOpen ? 'bg-slate-200 border-slate-300' : 'bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-700 border-slate-200'}`}
                            title="Sort Items"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" /></svg>
                        </button>
                        {isSortMenuOpen && (
                            <>
                            <div className="fixed inset-0 z-10" onClick={() => setIsSortMenuOpen(false)}></div>
                            <div className="absolute left-0 top-full mt-1 w-40 bg-white border border-slate-200 shadow-xl rounded-lg z-20 py-1 overflow-hidden">
                                {[
                                    { label: 'Date (Newest)', value: 'DATE_DESC' },
                                    { label: 'Date (Oldest)', value: 'DATE_ASC' },
                                    { label: 'Name (A-Z)', value: 'NAME_ASC' },
                                    { label: 'Name (Z-A)', value: 'NAME_DESC' },
                                ].map(opt => (
                                    <button
                                        key={opt.value}
                                        onClick={() => { setSortOption(opt.value as any); setIsSortMenuOpen(false); }}
                                        className={`w-full text-left px-4 py-2 text-xs flex items-center justify-between group ${sortOption === opt.value ? 'bg-blue-50 text-blue-600 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}
                                    >
                                        {opt.label}
                                        {sortOption === opt.value && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                                    </button>
                                ))}
                            </div>
                            </>
                        )}
                    </div>
                </div>

                {/* 2b. Search Bar (Flex Filled - Center) */}
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchQuery}
                    onKeyPress={(e) => {
                        if (e.key === 'Enter') performSearch()
                    }}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-16 py-1.5 bg-slate-100 text-slate-800 placeholder-slate-400 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all border border-transparent focus:border-blue-300"
                  />
                  <svg className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                       <button 
                          onClick={() => setEnableCaseSensitive(!enableCaseSensitive)}
                          className={`p-1 rounded hover:bg-slate-200 transition-colors ${enableCaseSensitive ? 'text-blue-600 font-bold' : 'text-slate-400'}`}
                          title="Match Case"
                        >
                           <span className="text-xs">Aa</span>
                        </button>
                       <button 
                          onClick={() => setEnableQueryExpansion(!enableQueryExpansion)}
                          className={`p-1 rounded hover:bg-slate-200 transition-colors ${enableQueryExpansion ? 'text-blue-600' : 'text-slate-400'}`}
                          title="List Search"
                        >
                           <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                        </button>
                  </div>
                </div>

                 {/* 2c. Action Buttons (Right) */}
                 <div className="flex items-center gap-1">
                    {/* Show All button - resets search and loads everything */}
                    {searchQuery.trim() && (
                      <button
                        onClick={async () => {
                          setSearchQuery('')
                          setLoading(true)
                          try {
                            const result = await api.callTool<{ notes?: Record<string, Note>; lists?: Record<string, List> }>('show_all', { hint: 'ANY' })
                            processAndSetData(result?.notes || {}, result?.lists || {})
                          } catch (err) {
                            setError(err instanceof Error ? err.message : 'Failed to load data')
                          } finally {
                            setLoading(false)
                          }
                        }}
                        className="flex items-center justify-center w-8 h-8 bg-white hover:bg-slate-50 text-blue-500 hover:text-blue-700 rounded-md transition-colors border border-slate-200 shadow-sm"
                        title="Show All"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                      </button>
                    )}
                    <button
                       onClick={() => view === 'notes' ? handleCreateNote() : handleCreateDraftList()}
                       className="flex items-center justify-center w-8 h-8 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-700 rounded-md transition-colors border border-slate-200 shadow-sm"
                       title={view === 'notes' ? "New Note" : "New List"}
                    >
                         <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    </button>
                 </div>
            </div>


          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {loading ? (
              <div className="p-6 text-center text-slate-500">Loading...</div>
            ) : error ? (
              <div className="p-6 text-center text-red-500">{error}</div>
            ) : view === 'notes' ? (
              <div className="p-4 space-y-4 flex-1 min-h-0 flex flex-col">
                {/* Notes List */}
                <div className="space-y-2 flex-1 min-h-0 overflow-y-auto pr-1">
                  
                  {filteredNotes.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                      <p className="mb-4">No notes here</p>
                      <button
                        onClick={handleCreateNote}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                      >
                        Create your first note
                      </button>
                    </div>
                  ) : (
                    filteredNotes.map((note) => (
                      <div
                        key={note.id}
                        onClick={() => openNoteTab(note.id)}
                        className={`rounded-lg cursor-pointer transition-all border-l-4 border-transparent ${
                          activeNoteId === note.id
                            ? 'bg-blue-100 border-blue-500 shadow-sm'
                            : 'bg-slate-50 hover:bg-slate-100'
                        } ${viewMode === 'minimal' ? 'p-2 flex items-center justify-between' : viewMode === 'compact' ? 'py-2 px-3' : 'p-4'}`}
                      >
                         <h3 className={`text-slate-800 truncate ${viewMode === 'minimal' ? 'text-sm font-medium flex-1' : viewMode === 'compact' ? 'text-sm font-semibold' : 'font-bold'}`}>
                            <HighlightedText text={note.title || 'Untitled'} highlights={searchHighlights} /><span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{note.id}]</span>
                        </h3>
                        {viewMode !== 'minimal' && (
                            <div className={`text-slate-500 ${viewMode === 'compact' ? 'text-xs mt-0.5 truncate' : 'text-sm mt-1 line-clamp-3'}`}>
                                <HighlightedText text={stripMarkdown(note.content || '')} highlights={searchHighlights} />
                            </div>
                        )}
                        <p className={`text-slate-400 ${viewMode === 'minimal' ? 'text-xs' : viewMode === 'compact' ? 'text-[10px] mt-1' : 'text-xs mt-2'}`}>
                          {new Date(note.updated_at).toLocaleDateString()}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col flex-1 min-h-0">
                {/* Actions */}
                <div className="p-4 space-y-2 shrink-0">
                  <button
                    onClick={() => setIsBulkAddOpen(true)}
                    className="w-full px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors text-sm font-medium border border-slate-200"
                  >
                    + Bulk Add items to List(s)
                  </button>
                </div>

                {/* Lists */}
                <div className="p-4 pt-0 space-y-2 flex-1 min-h-0 overflow-y-auto pr-1">

                  {filteredLists.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                      <p className="mb-4">No lists here</p>
                      <button
                        onClick={handleCreateDraftList}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                      >
                        Create your first list
                      </button>
                    </div>
                  ) : (
                    filteredLists.map((list) => (
                      <div
                        key={list.id}
                        onClick={() => openListTab(list.id)}
                        className={`rounded-lg cursor-pointer transition-all ${
                          activeListId === list.id
                            ? 'bg-blue-100 border-l-4 border-blue-500'
                            : 'bg-slate-50 hover:bg-slate-100 border-l-4 border-transparent'
                        } ${viewMode === 'minimal' ? 'p-2 flex items-center justify-between' : viewMode === 'compact' ? 'py-2 px-3' : 'p-3'}`}
                      >
                        <h3 className={`text-slate-800 truncate ${viewMode === 'minimal' ? 'text-sm font-medium flex-1' : viewMode === 'compact' ? 'text-sm font-semibold' : 'font-semibold'}`}>
                             <HighlightedText text={list.title || 'Untitled'} highlights={searchHighlights} /><span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{list.id}]</span>
                        </h3>
                        {viewMode !== 'minimal' && (
                            <p className={`text-slate-500 ${viewMode === 'compact' ? 'text-xs mt-0.5' : 'text-sm mt-1'}`}>
                              {Object.keys(list.items).length} items
                            </p>
                        )}
                        <p className={`text-slate-400 ${viewMode === 'minimal' ? 'text-xs' : viewMode === 'compact' ? 'text-[10px] mt-1' : 'text-xs mt-2'}`}>
                          {new Date(list.updated_at).toLocaleDateString()}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

          {/* Editor Area with Tabs */}
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
            {/* Tab Bar for Notes */}
            {view === 'notes' && openNoteIds.length > 0 && (
              <div className="flex items-center bg-white border-b border-blue-200 relative">
                {noteTabScroll.canScrollLeft && (
                  <button
                    onClick={() => scrollTabs(noteTabBarRef, 'left')}
                    className="shrink-0 px-1 py-2 hover:bg-slate-100 text-slate-500 hover:text-slate-700 z-10"
                    title="Scroll left"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                )}
                <div
                  ref={noteTabBarRef}
                  className="flex items-center gap-1 px-2 pt-2 pb-1 overflow-x-auto tab-bar-scroll flex-1"
                  onScroll={() => updateTabScrollState(noteTabBarRef, setNoteTabScroll)}
                >
                {openNoteIds.map((noteId, index) => {
                  const isDraft = noteId.startsWith('draft_')
                  const note = isDraft ? null : notes.find((n) => n.id === noteId)
                  // Count draft index for display
                  const draftNumber = isDraft ? openNoteIds.filter((id, idx) => id.startsWith('draft_') && idx <= index).length : 0
                  const tabTitle = isDraft ? `Untitled Note #${draftNumber}` : (note?.title || 'Title')

                  return (
                    <div
                      key={noteId}
                      className={`flex items-center gap-2 px-3 py-2 rounded-t-lg border border-b-0 transition-all shrink-0 ${
                        activeNoteId === noteId
                          ? 'bg-white border-blue-200 text-slate-800'
                          : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {isDraft && (
                        <span className="text-xs font-semibold text-orange-500 mr-1">●</span>
                      )}
                      <button
                        onClick={() => setActiveNoteId(noteId)}
                        className="flex-1 truncate max-w-xs text-sm font-medium text-left"
                      >
                        {tabTitle}
                        {isDraft && <span className="text-xs text-orange-500 ml-1">(unsaved)</span>}
                        {!isDraft && <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{noteId}]</span>}
                      </button>
                      <button
                        onClick={() => {
                          if (isDraft) {
                            closeDraftNote(noteId)
                          } else {
                            closeNoteTab(noteId)
                          }
                        }}
                        className="ml-1 p-1 hover:bg-slate-200 rounded transition-colors"
                        title="Close tab"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  )
                })}
                </div>
                {noteTabScroll.canScrollRight && (
                  <button
                    onClick={() => scrollTabs(noteTabBarRef, 'right')}
                    className="shrink-0 px-1 py-2 hover:bg-slate-100 text-slate-500 hover:text-slate-700 z-10"
                    title="Scroll right"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                )}
              </div>
            )}

            {/* Tab Bar for Lists */}
            {view === 'lists' && openListIds.length > 0 && (
              <div className="flex items-center bg-white border-b border-blue-200 relative">
                {listTabScroll.canScrollLeft && (
                  <button
                    onClick={() => scrollTabs(listTabBarRef, 'left')}
                    className="shrink-0 px-1 py-2 hover:bg-slate-100 text-slate-500 hover:text-slate-700 z-10"
                    title="Scroll left"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                )}
                <div
                  ref={listTabBarRef}
                  className="flex items-center gap-1 px-2 pt-2 pb-1 overflow-x-auto tab-bar-scroll flex-1"
                  onScroll={() => updateTabScrollState(listTabBarRef, setListTabScroll)}
                >
                {openListIds.map((listId, index) => {
                  const isDraft = listId.startsWith('draft_list_')
                  const list = isDraft ? null : lists.find((l) => l.id === listId)
                  // Count draft index for display
                  const draftNumber = isDraft ? openListIds.filter((id, idx) => id.startsWith('draft_list_') && idx <= index).length : 0
                  const tabTitle = isDraft ? `Untitled List #${draftNumber}` : (list?.title || 'Title')

                  return (
                    <div
                      key={listId}
                      className={`flex items-center gap-2 px-3 py-2 rounded-t-lg border border-b-0 transition-all shrink-0 ${
                        activeListId === listId
                          ? 'bg-white border-blue-200 text-slate-800'
                          : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {isDraft && (
                        <span className="text-xs font-semibold text-orange-500 mr-1">●</span>
                      )}
                      <button
                        onClick={() => setActiveListId(listId)}
                        className="flex-1 truncate max-w-xs text-sm font-medium text-left"
                      >
                        {tabTitle}
                        {isDraft && <span className="text-xs text-orange-500 ml-1">(unsaved)</span>}
                        {!isDraft && <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{listId}]</span>}
                      </button>
                      <button
                        onClick={() => {
                          if (isDraft) {
                            closeDraftList(listId)
                          } else {
                            closeListTab(listId)
                          }
                        }}
                        className="ml-1 p-1 hover:bg-slate-200 rounded transition-colors"
                        title="Close tab"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  )
                })}
                </div>
                {listTabScroll.canScrollRight && (
                  <button
                    onClick={() => scrollTabs(listTabBarRef, 'right')}
                    className="shrink-0 px-1 py-2 hover:bg-slate-100 text-slate-500 hover:text-slate-700 z-10"
                    title="Scroll right"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                )}
              </div>
            )}

            {/* Tab Content for Notes */}
            {view === 'notes' && activeNoteId ? (
              (() => {
                const isDraft = activeNoteId.startsWith('draft_')
                const actualNote = notes.find((n) => n.id === activeNoteId)
                
                // For draft notes, create a temporary object; for persisted notes, use the real one
                const displayNote = isDraft
                  ? {
                      id: activeNoteId,
                      title: editTitle || 'Title',
                      content: editContent || '',
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    }
                  : actualNote

                return displayNote ? (
                  <NoteTabEditor
                    note={displayNote}
                    isEditing={editingNoteId === activeNoteId}
                    isDraft={isDraft}
                    editTitle={editTitle}
                    editContent={editContent}
                    onEditTitleChange={setEditTitle}
                    onEditContentChange={setEditContent}
                    onStartEdit={() => startEditingNote(activeNoteId)}
                    onSaveEdit={() => {
                      // If this is a draft note, save it to backend; otherwise save existing note
                      if (isDraft) {
                        saveDraftNote()
                      } else {
                        saveEditingNote(activeNoteId)
                      }
                    }}
                    onDeleteClick={() => setDeleteConfirmNoteId(activeNoteId)}
                    onRestore={(content) => handleRestoreNoteVersion(activeNoteId, content)}
                  />

                ) : (
                  <div className="h-full flex items-center justify-center text-slate-400">
                    <div className="text-center">
                      <p>Note not found</p>
                    </div>
                  </div>
                )
              })()
            ) : view === 'lists' && activeListId ? (
              (() => {
                const isDraft = activeListId.startsWith('draft_list_')
                const actualList = lists.find((l) => l.id === activeListId)
                
                // For draft lists, create a temporary object; for persisted lists, use the real one
                const displayList = isDraft
                  ? {
                      id: activeListId,
                      title: listEditTitle || 'Title',
                      items: {},
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    }
                  : actualList

                return displayList ? (
                  <ListTabEditor
                    list={displayList}
                    isEditing={editingListId === activeListId}
                    isDraft={isDraft}
                    editTitle={listEditTitle}
                    draftItems={listDraftItems}
                    onEditTitleChange={setListEditTitle}
                    onAddDraftItem={addDraftListItem}
                    onRemoveDraftItem={(idx) => setListDraftItems(listDraftItems.filter((_, i) => i !== idx))}
                    onStartEdit={() => startEditingList(activeListId)}
                    onSaveEdit={(itemOrder) => {
                      // If this is a draft list, save it to backend; otherwise save existing list
                      if (isDraft) {
                        saveDraftList()
                      } else {
                        saveEditingList(activeListId, itemOrder)
                      }
                    }}
                    onDeleteClick={() => setDeleteConfirmNoteId(activeListId)}
                    onDeleteItem={(itemId) => handleDeleteListItem(activeListId, itemId)}
                    onUpdateItem={(itemId, content, completed) => handleUpdateListItem(activeListId, itemId, content, completed)}
                    decodeOrderFromContent={decodeOrderFromContent}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-400">
                    <div className="text-center">
                      <p>List not found</p>
                    </div>
                  </div>
                )
              })()
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400">
                <div className="text-center">
                  {view === 'notes' ? (
                    <>
                      <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p>Select a note to view or edit</p>
                    </>
                  ) : (
                    <>
                      <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p>Select a list to view or edit</p>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirmNoteId && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-6 max-w-sm">
                  <h3 className="text-lg font-semibold text-slate-800 mb-2">
                    Delete {view === 'notes' ? 'Note' : 'List'}?
                  </h3>
                  <p className="text-slate-600 mb-6">
                    This action cannot be undone. The {view === 'notes' ? 'note' : 'list'} will be permanently deleted.
                  </p>
                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={() => setDeleteConfirmNoteId(null)}
                      className="px-4 py-2 text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        if (view === 'notes') {
                          confirmDeleteNote()
                        } else {
                          // Delete list
                          handleDeleteList(deleteConfirmNoteId)
                          setDeleteConfirmNoteId(null)
                        }
                      }}
                      className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            <BulkAddModal 
                isOpen={isBulkAddOpen} 
                onClose={() => setIsBulkAddOpen(false)} 
                onAdd={handleBulkAdd} 
                activeListId={activeListId}
                activeListTitle={activeListId ? lists.find(l => l.id === activeListId)?.title : undefined}
            />
          </div>
      </div>
    </div>
  )
}


// Note Tab Editor Component
interface NoteTabEditorProps {
  note: Note
  isEditing: boolean
  isDraft: boolean
  editTitle: string
  editContent: string
  onEditTitleChange: (title: string) => void
  onEditContentChange: (content: string) => void
  onStartEdit: () => void
  onSaveEdit: () => void
  onDeleteClick: () => void
  onRestore?: (content: string) => void
}

function NoteTabEditor({
  note,
  isEditing,
  isDraft,
  editTitle,
  editContent,
  onEditTitleChange,
  onEditContentChange,
  onStartEdit,
  onSaveEdit,
  onDeleteClick,
  onRestore
}: NoteTabEditorProps) {
  const [showHistory, setShowHistory] = useState(false)

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden">
      {/* Header with Action Buttons */}
      <div className="border-b border-blue-100 px-6 py-4 bg-white flex items-center justify-between shrink-0">
        <div className="flex-1 flex items-center gap-3">
          <div className="flex-1">
            {isEditing ? (
              <>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => onEditTitleChange(e.target.value)}
                  placeholder="Title"
                  className="text-2xl font-bold text-slate-800 bg-transparent border-b border-blue-300 focus:outline-none w-full placeholder:text-slate-300"
                />
                <p className="text-sm text-slate-400 mt-4">Editing mode</p>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-slate-800">{note.title}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{note.id}]</span></h1>
                <p className="text-sm text-slate-400 mt-1">
                  Last updated: {new Date(note.updated_at).toLocaleString()}
                </p>
                 {/* Toggle History Button */}
                 {note.content_history && note.content_history.length > 0 && (
                    <button 
                        onClick={() => setShowHistory(!showHistory)}
                        className="text-xs text-blue-500 hover:text-blue-700 mt-1 underline"
                    >
                        {showHistory ? 'Hide History' : 'Show History'}
                    </button>
                 )}
              </>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 ml-4">
          {isEditing ? (
            <button
              onClick={onSaveEdit}
              className="w-10 h-10 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center justify-center"
              title={isDraft ? 'Create note' : 'Save changes'}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </button>
          ) : (
            <button
              onClick={onStartEdit}
              className="w-10 h-10 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center justify-center"
              title="Edit note"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
            </button>
          )}

          <button
            onClick={onDeleteClick}
            className="w-10 h-10 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center justify-center"
            title="Delete note"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
          {/* Main Content */}
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* History Panel */}
            {showHistory && !isEditing && (
                <div className="bg-slate-100 p-4 border-b border-slate-200 overflow-y-auto max-h-48 shrink-0">
                    <h3 className="font-semibold text-slate-600 mb-2">Version History</h3>
                    <div className="space-y-2">
                        {note.content_history?.map((hist, idx) => (
                            <div key={idx} className="bg-white p-2 rounded shadow-sm text-sm text-slate-700 flex justify-between items-start gap-2 group">
                                <div className="flex-1">
                                    <span className="font-mono text-xs text-slate-400 block mb-1">Version {idx + 1}</span>
                                    <div className="whitespace-pre-wrap">{hist}</div>
                                </div>
                                {onRestore && (
                                    <button
                                        onClick={() => onRestore(hist)}
                                        className="text-xs bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-blue-600 px-2 py-1 rounded transition-colors opacity-0 group-hover:opacity-100"
                                        title="Restore this version"
                                    >
                                        Restore
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Content Editor/Viewer */}
            {isEditing ? (
                <textarea
                value={editContent}
                onChange={(e) => onEditContentChange(e.target.value)}
                className="flex-1 px-6 py-4 bg-slate-50 text-slate-800 border-none focus:outline-none resize-none font-mono text-sm"
                placeholder="Start typing to create your note... (Markdown supported)"
                />
            ) : (
                <div className="flex-1 overflow-y-auto px-6 py-4">
                    {note.content ? (
                        <SimpleMarkdown content={note.content} />
                    ) : (
                        <span className="text-slate-400 italic">No content</span>
                    )}
                </div>
            )}
          </div>
      </div>
    </div>
  )
}


// Note Editor Component
interface NoteEditorProps {
  note?: Note
  onUpdate: (id: string, title: string, content: string) => void
  onDelete: (id: string) => void
}

function NoteEditor({ note, onUpdate, onDelete }: NoteEditorProps) {
  const [title, setTitle] = useState(note?.title || '')
  const [content, setContent] = useState(note?.content || '')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setTitle(note?.title || '')
    setContent(note?.content || '')
  }, [note?.id, note?.title, note?.content])

  const handleSave = () => {
    if (note) {
      onUpdate(note.id, title, content)
    }
  }

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle)
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    saveTimeoutRef.current = setTimeout(() => {
      if (note) {
        onUpdate(note.id, newTitle, content)
      }
    }, 1000)
  }

  const handleContentChange = (newContent: string) => {
    setContent(newContent)
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    saveTimeoutRef.current = setTimeout(() => {
      if (note) {
        onUpdate(note.id, title, newContent)
      }
    }, 1000)
  }

  if (!note) return null

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="border-b border-blue-200 px-6 py-4 bg-white flex items-center justify-between">
        <div className="flex-1">
          <input
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            className="text-2xl font-bold text-slate-800 bg-transparent border-none focus:outline-none w-full"
            placeholder="Note title..."
          />
          <p className="text-sm text-slate-400 mt-1">
            Last updated: {new Date(note.updated_at).toLocaleString()}
          </p>
        </div>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="ml-4 p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          title="Delete note"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      <textarea
        value={content}
        onChange={(e) => handleContentChange(e.target.value)}
        className="flex-1 px-6 py-4 bg-slate-50 text-slate-800 border-none focus:outline-none resize-none"
        placeholder="Start typing your note..."
      />

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Delete Note?</h3>
            <p className="text-slate-600 mb-6">This action cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDelete(note.id)
                  setShowDeleteConfirm(false)
                }}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// List Tab Editor Component
interface ListTabEditorProps {
  list?: List
  isEditing: boolean
  isDraft: boolean
  editTitle: string
  draftItems: string[]
  onEditTitleChange: (title: string) => void
  onAddDraftItem: (content: string) => void
  onRemoveDraftItem: (index: number) => void
  onStartEdit: () => void
  onSaveEdit: (itemOrder: string[]) => void
  onDeleteClick: () => void
  onDeleteItem: (itemId: string) => void
  onUpdateItem: (itemId: string, content: string, completed: boolean) => void
  decodeOrderFromContent: (content: string) => { order: number | null; displayContent: string }
}

function ListTabEditor({
  list,
  isEditing,
  isDraft,
  editTitle,
  draftItems,
  onEditTitleChange,
  onAddDraftItem,
  onRemoveDraftItem,
  onStartEdit,
  onSaveEdit,
  onDeleteClick,
  onDeleteItem,
  onUpdateItem,
  decodeOrderFromContent,
}: ListTabEditorProps) {
  const [editingDraftIdx, setEditingDraftIdx] = useState<number | null>(null)
  const [draftInputValue, setDraftInputValue] = useState('')
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingItemValue, setEditingItemValue] = useState('')
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)
  const [itemOrder, setItemOrder] = useState<string[]>([])
  const [showHistoryFor, setShowHistoryFor] = useState<string | null>(null)

  // Initialize item order when list changes
  useEffect(() => {
    if (list) {
      // Create array of items with their order numbers
      const itemsWithOrder = Object.entries(list.items).map(([itemId, item]) => {
        const contentStr = typeof item === 'string' ? item : (item as any).content || ''
        const { order } = decodeOrderFromContent(contentStr)
        return { itemId, order }
      })

      // Sort by order if order information exists, otherwise keep original order
      const hasOrderInfo = itemsWithOrder.some((item) => item.order !== null)
      if (hasOrderInfo) {
        itemsWithOrder.sort((a, b) => {
          // Items with order info come first, sorted by order
          if (a.order !== null && b.order !== null) {
            return a.order - b.order
          }
          // Items without order info come after
          if (a.order !== null) return -1
          if (b.order !== null) return 1
          return 0
        })
      }

      setItemOrder(itemsWithOrder.map((item) => item.itemId))
    }
  }, [list?.id, Object.keys(list?.items || {}).length])

  const handleDragStart = (itemId: string) => {
    setDraggedItemId(itemId)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (targetItemId: string) => {
    if (!draggedItemId || draggedItemId === targetItemId) return

    const draggedIndex = itemOrder.indexOf(draggedItemId)
    const targetIndex = itemOrder.indexOf(targetItemId)

    if (draggedIndex === -1 || targetIndex === -1) return

    const newOrder = [...itemOrder]
    newOrder.splice(draggedIndex, 1)
    newOrder.splice(targetIndex, 0, draggedItemId)

    setItemOrder(newOrder)
    setDraggedItemId(null)
  }

  const sortItemsAlphabeticallyAsc = () => {
    if (!list) return
    const sorted = Object.keys(list.items).sort((a, b) => {
      const contentA = list.items[a].content.toLowerCase()
      const contentB = list.items[b].content.toLowerCase()
      return contentA.localeCompare(contentB)
    })
    setItemOrder(sorted)
  }

  const sortItemsAlphabeticallyDesc = () => {
    if (!list) return
    const sorted = Object.keys(list.items).sort((a, b) => {
      const contentA = list.items[a].content.toLowerCase()
      const contentB = list.items[b].content.toLowerCase()
      return contentB.localeCompare(contentA)
    })
    setItemOrder(sorted)
  }

  const sortItemsIncompleteFirst = () => {
    if (!list) return
    const sorted = Object.keys(list.items).sort((a, b) => {
      const completedA = list.items[a].completed
      const completedB = list.items[b].completed
      if (completedA === completedB) return 0
      return completedA ? 1 : -1
    })
    setItemOrder(sorted)
  }

  const sortItemsCompleteFirst = () => {
    if (!list) return
    const sorted = Object.keys(list.items).sort((a, b) => {
      const completedA = list.items[a].completed
      const completedB = list.items[b].completed
      if (completedA === completedB) return 0
      return completedA ? -1 : 1
    })
    setItemOrder(sorted)
  }

  const handleAddNewDraftItem = () => {
    const newIdx = draftItems.length
    setEditingDraftIdx(newIdx)
    setDraftInputValue('')
  }

  const handleSaveDraftItem = (index: number) => {
    const trimmedValue = draftInputValue.trim()
    if (trimmedValue) {
      onAddDraftItem(trimmedValue)
      setEditingDraftIdx(null)
      setDraftInputValue('')
    }
  }

  const handleEditItem = (itemId: string, currentContent: string) => {
    setEditingItemId(itemId)
    setEditingItemValue(currentContent)
  }

  const handleSaveItemEdit = (itemId: string, completed: boolean) => {
    const trimmedValue = editingItemValue.trim()
    if (trimmedValue) {
      onUpdateItem(itemId, trimmedValue, completed)
      setEditingItemId(null)
      setEditingItemValue('')
    }
  }

  if (!list && !isDraft) return null

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header with Action Buttons */}
      <div className="border-b border-blue-100 px-6 py-4 bg-white flex items-center justify-between">
        <div className="flex-1 flex items-center gap-3">
          <div className="flex-1">
            {isEditing ? (
              <>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => onEditTitleChange(e.target.value)}
                  placeholder="Title"
                  className="text-2xl font-bold text-slate-800 bg-transparent border-b border-blue-300 focus:outline-none w-full placeholder:text-slate-300"
                />
                <p className="text-sm text-slate-400 mt-4">Editing mode</p>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-slate-800">{list?.title}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{list?.id}]</span></h1>
                {list && (
                  <p className="text-sm text-slate-400 mt-1">
                    {Object.keys(list.items).length} items
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 ml-4">
          {isEditing ? (
            <button
              onClick={() => onSaveEdit(itemOrder)}
              className="w-10 h-10 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center justify-center"
              title={isDraft ? 'Create list' : 'Save changes'}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </button>
          ) : (
            <button
              onClick={onStartEdit}
              className="w-10 h-10 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center justify-center"
              title="Edit list"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
            </button>
          )}

          <button
            onClick={onDeleteClick}
            className="w-10 h-10 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center justify-center"
            title="Delete list"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      {/* Sort Toolbar - Only Show When Editing */}
      {isEditing && list && Object.keys(list.items).length > 0 && (
        <div className="border-b border-blue-100 px-6 py-3 bg-blue-50 flex items-center gap-2">
          <span className="text-sm font-medium text-slate-700">Sort by:</span>
          <button
            onClick={sortItemsAlphabeticallyAsc}
            className="px-3 py-1 text-sm bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-1 text-slate-700"
            title="Sort alphabetically A to Z"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M3 3a1 1 0 000 2h11a1 1 0 100-2H3zM3 7a1 1 0 000 2h5a1 1 0 000-2H3zM3 11a1 1 0 100 2h4a1 1 0 100-2H3zM13 16a1 1 0 102 0v-5.586l1.293 1.293a1 1 0 001.414-1.414l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 101.414 1.414L13 10.414V16z" />
            </svg>
            A-Z
          </button>
          <button
            onClick={sortItemsAlphabeticallyDesc}
            className="px-3 py-1 text-sm bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-1 text-slate-700"
            title="Sort alphabetically Z to A"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M3 3a1 1 0 000 2h11a1 1 0 100-2H3zM3 7a1 1 0 000 2h5a1 1 0 000-2H3zM3 11a1 1 0 100 2h4a1 1 0 100-2H3zM15 13a1 1 0 102 0v-2.586l1.293 1.293a1 1 0 001.414-1.414l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 101.414 1.414L15 11.414V13z" />
            </svg>
            Z-A
          </button>
          <div className="border-r border-slate-300 h-6"></div>
          <button
            onClick={sortItemsIncompleteFirst}
            className="px-3 py-1 text-sm bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-1 text-slate-700"
            title="Incomplete items first"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
            </svg>
            Incomplete
          </button>
          <button
            onClick={sortItemsCompleteFirst}
            className="px-3 py-1 text-sm bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-1 text-slate-700"
            title="Complete items first"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Complete
          </button>
        </div>
      )}

      {/* List Items */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
        {!list || Object.keys(list.items).length === 0 ? (
          draftItems.length === 0 && !isEditing && (
            <div className="text-center py-8 text-slate-400">
              No items yet
            </div>
          )
        ) : (
          itemOrder.map((itemId) => {
            const item = list!.items[itemId]
            if (!item) return null
            
            return editingItemId === itemId ? (
              // Edit mode for existing item
              <div
                key={itemId}
                className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg border-l-4 border-yellow-300"
              >
                <input
                  type="checkbox"
                  checked={item.completed}
                  onChange={(e) => {
                    const newValue = editingItemValue
                    handleSaveItemEdit(itemId, e.target.checked)
                    // Re-enter edit mode with updated checkbox state
                    setEditingItemId(itemId)
                    setEditingItemValue(newValue)
                  }}
                  className="mt-1 w-5 h-5 rounded cursor-pointer accent-yellow-500"
                />
                <input
                  type="text"
                  value={editingItemValue}
                  onChange={(e) => setEditingItemValue(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleSaveItemEdit(itemId, item.completed)
                    }
                  }}
                  autoFocus
                  className="flex-1 px-2 py-1 bg-transparent border-none focus:outline-none text-slate-800 placeholder-slate-400"
                />
                <button
                  type="button"
                  onClick={() => handleSaveItemEdit(itemId, item.completed)}
                  className="p-1 text-green-600 hover:bg-green-50 rounded transition-all flex-shrink-0"
                  title="Save item"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingItemId(null)
                    setEditingItemValue('')
                  }}
                  className="p-1 text-red-600 hover:bg-red-50 rounded transition-all flex-shrink-0"
                  title="Cancel"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            ) : (
                <div key={itemId} className='relative'>
                    {/* View mode for existing item */}
                    <div
                        draggable={isEditing}
                        onDragStart={() => isEditing && handleDragStart(itemId)}
                        onDragOver={handleDragOver}
                        onDrop={() => isEditing && handleDrop(itemId)}
                        className={`flex items-start gap-3 p-3 bg-slate-50 rounded-lg border-l-4 border-blue-200 hover:border-blue-400 group hover:bg-blue-50 transition-all ${
                        isEditing ? 'cursor-grab active:cursor-grabbing' : ''
                        } ${draggedItemId === itemId ? 'opacity-50' : ''}`}
                    >
                        <input
                        type="checkbox"
                        checked={item.completed}
                        onChange={(e) => onUpdateItem(itemId, item.content, e.target.checked)}
                        className="mt-1 w-5 h-5 rounded cursor-pointer accent-blue-500"
                        />
                        <div className="flex-1">
                             <span
                                onClick={() => isEditing && handleEditItem(itemId, item.content)}
                                className={`cursor-pointer block ${
                                    isEditing ? 'hover:bg-yellow-100 hover:rounded px-2 py-1 transition-colors' : ''
                                } ${
                                    item.completed ? 'line-through text-slate-400' : 'text-slate-800'
                                }`}
                                title={isEditing ? 'Click to edit, drag to reorder' : undefined}
                                >
                                {item.content}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{itemId}]</span>
                            </span>
                             {/* Show Item History if available */}
                             {!isEditing && list.item_history && list.item_history[itemId] && list.item_history[itemId].length > 0 && (
                                 <button 
                                    onClick={() => setShowHistoryFor(showHistoryFor === itemId ? null : itemId)}
                                    className='text-xs text-blue-400 hover:text-blue-600 mt-1'
                                >
                                    {showHistoryFor === itemId ? 'Hide History' : 'Show History'}
                                 </button>
                             )}
                        </div>
                       
                        {isEditing && (
                        <>
                            <div className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 cursor-grab active:cursor-grabbing transition-all flex-shrink-0" title="Drag to reorder">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                            </svg>
                            </div>
                            <button
                            onClick={() => handleEditItem(itemId, item.content)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-blue-500 hover:bg-blue-100 rounded transition-all"
                            title="Edit item"
                            >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                            </svg>
                            </button>
                            <button
                            onClick={() => onDeleteItem(itemId)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-red-500 hover:bg-red-50 rounded transition-all"
                            title="Delete item"
                            >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                            </button>
                        </>
                        )}
                    </div>
                     {/* History Panel for Item */}
                     {showHistoryFor === itemId && list.item_history && list.item_history[itemId] && (
                        <div className="ml-8 mt-2 p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs shadow-inner">
                             <div className="flex items-center justify-between mb-2">
                                <strong className="text-slate-700">Previous Versions</strong>
                                <span className="text-slate-400">({list.item_history[itemId].length})</span>
                             </div>
                             <div className='flex flex-col gap-2'>
                                {[...list.item_history[itemId]].reverse().map((hist, idx) => (
                                    <div key={idx} className="flex items-center justify-between bg-white p-2 rounded border border-slate-200 group hover:border-blue-300 transition-colors">
                                        <span className="text-slate-600 truncate flex-1 mr-2" title={hist}>{hist}</span>
                                        <button
                                            onClick={() => onUpdateItem(itemId, hist, item.completed)}
                                            className="px-2 py-1 text-[10px] font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 opacity-0 group-hover:opacity-100 transition-opacity"
                                            title="Restore this version"
                                        >
                                            Restore
                                        </button>
                                    </div>
                                ))}
                             </div>
                        </div>
                     )}
                </div>
            )
          })
        )}

        {/* Draft Items Display - Inline Editing */}
        {draftItems.map((item, idx) => (
          <div
            key={`draft-${idx}`}
            className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg border-l-4 border-yellow-200 group"
          >
            <input
              type="checkbox"
              disabled
              className="mt-1 w-5 h-5 rounded cursor-pointer accent-yellow-500"
            />
            <span className="flex-1 text-slate-800">{item}</span>
            {isEditing && (
              <button
                type="button"
                onClick={() => onRemoveDraftItem(idx)}
                className="opacity-0 group-hover:opacity-100 p-1 text-red-500 hover:bg-red-50 rounded transition-all flex-shrink-0"
                title="Delete item"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>
        ))}

        {/* Add New Item - Only Show Button When Editing */}
        {isEditing && editingDraftIdx === null && (
          <button
            onClick={handleAddNewDraftItem}
            className="w-full flex items-center justify-center gap-2 p-3 bg-blue-50 border-2 border-dashed border-blue-300 rounded-lg text-blue-600 hover:bg-blue-100 hover:border-blue-400 transition-all font-medium"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add item
          </button>
        )}

        {/* New Item Input - Show When Creating */}
        {isEditing && editingDraftIdx !== null && (
          <div className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg border-l-4 border-yellow-300">
            <input
              type="checkbox"
              disabled
              className="mt-1 w-5 h-5 rounded cursor-pointer accent-yellow-500"
            />
            <input
              type="text"
              value={draftInputValue}
              onChange={(e) => setDraftInputValue(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSaveDraftItem(editingDraftIdx)
                }
              }}
              autoFocus
              placeholder="Enter item text..."
              className="flex-1 px-2 py-1 bg-transparent border-none focus:outline-none text-slate-900 placeholder-slate-500"
            />
            <button
              type="button"
              onClick={() => handleSaveDraftItem(editingDraftIdx || 0)}
              className="p-1 text-green-600 hover:bg-green-50 rounded transition-all flex-shrink-0"
              title="Save item"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingDraftIdx(null)
                setDraftInputValue('')
              }}
              className="p-1 text-red-600 hover:bg-red-50 rounded transition-all flex-shrink-0"
              title="Cancel"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// List Editor Component
interface ListEditorProps {
  list?: List
  onUpdateTitle: (id: string, title: string) => void
  onDelete: (id: string) => void
  onCreateItem: (id: string, content: string) => void
  onUpdateItem: (listId: string, itemId: string, content: string, completed: boolean) => void
  onDeleteItem: (listId: string, itemId: string) => void
  onReorderItems: (listId: string, itemIds: string[]) => void
}

function ListEditor({
  list,
  onUpdateTitle,
  onDelete,
  onCreateItem,
  onUpdateItem,
  onDeleteItem,
  onReorderItems,
}: ListEditorProps) {
  const [title, setTitle] = useState(list?.title || '')
  const [newItemInput, setNewItemInput] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setTitle(list?.title || '')
  }, [list?.id, list?.title])

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle)
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    saveTimeoutRef.current = setTimeout(() => {
      if (list) {
        onUpdateTitle(list.id, newTitle)
      }
    }, 1000)
  }

  const handleAddItem = () => {
    if (newItemInput.trim() && list) {
      onCreateItem(list.id, newItemInput.trim())
      setNewItemInput('')
    }
  }

  const handleDragStart = (itemId: string) => {
    setDraggedItemId(itemId)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (targetItemId: string) => {
    if (!draggedItemId || !list || draggedItemId === targetItemId) return

    const items = Object.keys(list.items)
    const draggedIndex = items.indexOf(draggedItemId)
    const targetIndex = items.indexOf(targetItemId)

    if (draggedIndex === -1 || targetIndex === -1) return

    const newItems = [...items]
    newItems.splice(draggedIndex, 1)
    newItems.splice(targetIndex, 0, draggedItemId)

    onReorderItems(list.id, newItems)
    setDraggedItemId(null)
  }

  if (!list) return null

  const itemsArray = Object.entries(list.items)

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="border-b border-blue-200 px-6 py-4 bg-white flex items-center justify-between">
        <div className="flex-1">
          <input
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            className="text-2xl font-bold text-slate-800 bg-transparent border-none focus:outline-none w-full"
            placeholder="List title..."
          />
          <p className="text-sm text-slate-400 mt-1">
            {Object.values(list.items).filter((i) => i.completed).length} of{' '}
            {Object.keys(list.items).length} completed
          </p>
        </div>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="ml-4 p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          title="Delete list"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-2">
        {itemsArray.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <p>No items yet. Add one below!</p>
          </div>
        ) : (
          itemsArray.map(([itemId, item]) => (
            <div
              key={itemId}
              draggable
              onDragStart={() => handleDragStart(itemId)}
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(itemId)}
              className="flex items-start gap-3 p-3 bg-white rounded-lg border-l-4 border-blue-200 hover:border-blue-400 group hover:bg-blue-50 transition-all cursor-grab active:cursor-grabbing"
            >
              <input
                type="checkbox"
                checked={item.completed}
                onChange={(e) =>
                  onUpdateItem(list.id, itemId, item.content, e.target.checked)
                }
                className="mt-1 w-5 h-5 rounded cursor-pointer accent-blue-500"
              />
              <div className="flex-1 flex items-center gap-1">
                <input
                  type="text"
                  value={item.content}
                  onChange={(e) =>
                    onUpdateItem(list.id, itemId, e.target.value, item.completed)
                  }
                  className={`flex-1 bg-transparent border-none focus:outline-none ${
                    item.completed
                      ? 'line-through text-slate-400'
                      : 'text-slate-800'
                  }`}
                />
                <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{itemId}]</span>
              </div>
              <button
                onClick={() => onDeleteItem(list.id, itemId)}
                className="opacity-0 group-hover:opacity-100 p-1 text-red-500 hover:bg-red-50 rounded transition-all"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-blue-200 px-6 py-4 bg-white flex gap-2">
        <input
          type="text"
          value={newItemInput}
          onChange={(e) => setNewItemInput(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              handleAddItem()
            }
          }}
          placeholder="Add item..."
          className="flex-1 px-3 py-2 bg-slate-100 text-slate-800 placeholder-slate-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
        />
        <button
          onClick={handleAddItem}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Delete List?</h3>
            <p className="text-slate-600 mb-6">This action cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDelete(list.id)
                  setShowDeleteConfirm(false)
                }}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Note Composer Component
interface NoteComposerProps {
  isOpen: boolean
  title: string
  content: string
  showEmojiPicker: boolean
  onTitleChange: (title: string) => void
  onContentChange: (content: string) => void
  onToggleCompose: () => void
  onToggleEmojiPicker: () => void
  onAddEmoji: (emoji: string) => void
  onCreate: () => void
  onCancel: () => void
}

// Common emoji categories for easy access
const commonEmojis = {
  smileys: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😚', '😙'],
  gestures: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👍', '👎', '✊', '👊', '🤛', '🤜'],
  objects: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '💌', '💢'],
  symbols: ['⭐', '🌟', '✨', '⚡', '🔥', '💥', '✅', '❌', '⭕', '🚀', '🎯', '📌', '📍', '🎓', '🏆', '🎁', '🎉', '🎊', '🎈', '🎀'],
}

function NoteComposer({
  isOpen,
  title,
  content,
  showEmojiPicker,
  onTitleChange,
  onContentChange,
  onToggleCompose,
  onToggleEmojiPicker,
  onAddEmoji,
  onCreate,
  onCancel,
}: NoteComposerProps) {
  if (!isOpen) {
    return (
      <button
        onClick={onToggleCompose}
        className="w-full px-4 py-3 bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-lg hover:from-blue-100 hover:to-blue-150 transition-all text-left text-slate-600 font-medium"
      >
        <svg className="inline-block w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Create a new note...
      </button>
    )
  }

  return (
    <div className="bg-white border border-blue-200 rounded-lg shadow-md p-4 space-y-3">
      {/* Title Input */}
      <input
        type="text"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="Title"
        className="w-full px-3 py-2 text-lg font-semibold bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />

      {/* Content Textarea */}
      <textarea
        value={content}
        onChange={(e) => onContentChange(e.target.value)}
        placeholder="What's on your mind? You can add emojis, format text, and more..."
        className="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none h-28"
      />

      {/* Emoji Picker */}
      {showEmojiPicker && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
          {Object.entries(commonEmojis).map(([category, emojis]) => (
            <div key={category}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 capitalize">{category}</p>
              <div className="flex flex-wrap gap-1">
                {emojis.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => onAddEmoji(emoji)}
                    className="text-lg p-1 hover:bg-white rounded-md transition-colors"
                    title={emoji}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-2 pt-2">
        <button
          onClick={onCreate}
          className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
        >
          Create Note
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-slate-100 text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors font-medium"
        >
          Cancel
        </button>

        {/* Formatting & Attachment Toolbar */}
        <div className="flex items-center gap-1 ml-auto pl-2 border-l border-slate-200">
          <button
            onClick={onToggleEmojiPicker}
            className={`p-2 rounded-lg transition-colors ${
              showEmojiPicker
                ? 'bg-blue-100 text-blue-600'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
            title="Add emoji"
          >
            <span className="text-lg">😊</span>
          </button>

          <button
            disabled
            className="p-2 rounded-lg text-slate-300 cursor-not-allowed"
            title="Image attachment (coming soon)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>

          <button
            disabled
            className="p-2 rounded-lg text-slate-300 cursor-not-allowed"
            title="Attachment (coming soon)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

interface BulkAddModalProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (data: { query?: string, listId?: string, items: string[], isBulk?: boolean, queryExpansion?: string[] }) => void
  activeListId: string | null
  activeListTitle?: string
}

function BulkAddModal({ isOpen, onClose, onAdd, activeListId, activeListTitle }: BulkAddModalProps) {
  const [mode, setMode] = useState<'current' | 'search'>('search')
  const [query, setQuery] = useState('')
  const [synonyms, setSynonyms] = useState('')
  const [itemsText, setItemsText] = useState('')
  const [isBulk, setIsBulk] = useState(false)

  useEffect(() => {
    if (isOpen) {
        setMode(activeListId ? 'current' : 'search')
        setItemsText('')
        setQuery('')
        setSynonyms('')
        setIsBulk(false)
        // Prevent body scroll when modal is open
        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = previousOverflow
        }
    }
  }, [isOpen, activeListId])

  if (!isOpen) return null;

  const handleAdd = () => {
    const items = itemsText.split('\n').filter(s => s.trim());
    const queryExpansion = synonyms.split(',').map(s => s.trim()).filter(s => s);

    if (mode === 'current' && activeListId) {
        onAdd({ listId: activeListId, items })
    } else {
        onAdd({ query, items, isBulk, queryExpansion: queryExpansion.length > 0 ? queryExpansion : undefined })
    }
  }

  const isValid = itemsText.trim().length > 0 && (
      (mode === 'current' && !!activeListId) ||
      (mode === 'search' && query.trim().length > 0)
  )

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Add Items to List(s)</h3>
        
        {/* Mode Selection Tabs */}
        <div className="flex border-b border-slate-200 mb-4">
            <button
                className={`py-2 px-4 font-medium text-sm border-b-2 transition-colors ${
                    mode === 'current' 
                    ? 'border-blue-500 text-blue-600' 
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                } ${!activeListId ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={() => activeListId && setMode('current')}
                disabled={!activeListId}
            >
                Current List
            </button>
            <button
                className={`py-2 px-4 font-medium text-sm border-b-2 transition-colors ${
                    mode === 'search' 
                    ? 'border-blue-500 text-blue-600' 
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
                onClick={() => setMode('search')}
            >
                Find by Name
            </button>
        </div>

        <div className="space-y-4">
            {mode === 'current' ? (
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-sm text-blue-800">
                    Adding items to: <strong>{activeListTitle || 'Untitled List'}</strong>
                </div>
            ) : (
                <>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Target List (Query)</label>
                        <input 
                            type="text" 
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-slate-900 placeholder-slate-500 bg-white"
                            placeholder="Search for list..."
                            autoFocus={mode === 'search'}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Synonyms / Expanded Query (Optional)</label>
                        <input 
                            type="text" 
                            value={synonyms}
                            onChange={e => setSynonyms(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm text-slate-900 placeholder-slate-500 bg-white"
                            placeholder="e.g. groceries, shopping, food (comma separated)"
                        />
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <input 
                            type="checkbox"
                            id="bulk_check"
                            checked={isBulk}
                            onChange={e => setIsBulk(e.target.checked)}
                            className="rounded text-blue-500"
                        />
                        <label htmlFor="bulk_check" className="text-sm text-slate-700">Apply to all matching lists (Bulk Mutation)</label>
                    </div>
                </>
            )}

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Items to Add (one per line)</label>
                <textarea 
                    value={itemsText}
                    onChange={e => setItemsText(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 h-32 font-mono text-sm text-slate-900 placeholder-slate-500 bg-white"
                    placeholder={`Item 1\nItem 2\nItem 3...`}
                    autoFocus={mode === 'current'}
                />
            </div>
        </div>

        <div className="flex gap-3 justify-end mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={!isValid}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            Add Items
          </button>
        </div>
      </div>
    </div>
  )
}

interface UndoDialogProps {
    isOpen: boolean;
    onClose: () => void;
    operations: UndoableOperation[];
    onUndo: (operation: UndoableOperation) => Promise<void>;
    onClearAll: () => void;
}

function UndoDialog({ isOpen, onClose, operations, onUndo, onClearAll }: UndoDialogProps) {
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Prevent body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            const previousOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            return () => {
                document.body.style.overflow = previousOverflow;
            };
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleUndo = async (operation: UndoableOperation) => {
        setLoadingId(operation.id);
        setError(null);
        try {
            await onUndo(operation);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Undo failed');
        } finally {
            setLoadingId(null);
        }
    };

    const formatTime = (timestamp: string) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        return date.toLocaleDateString();
    };

    const getOperationIcon = (type: UndoOperationType) => {
        switch (type) {
            case 'create_note':
            case 'create_list':
                return (
                    <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                );
            case 'delete_note':
            case 'delete_list':
            case 'delete_list_item':
                return (
                    <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                );
            case 'update_note':
            case 'update_note_title':
            case 'update_list_title':
            case 'update_list_item':
                return (
                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                );
            case 'add_list_item':
                return (
                    <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                );
            default:
                return (
                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                );
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-[480px] max-h-[600px] flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-800">Undo Recent Changes</h3>
                        <p className="text-sm text-slate-500 mt-0.5">
                            {operations.length > 0 
                                ? `${operations.length} operation${operations.length > 1 ? 's' : ''} available to undo`
                                : 'No recent operations to undo'}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                
                {/* Operations List */}
                <div className="flex-1 overflow-y-auto px-4 py-3">
                    {error && (
                        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                            {error}
                        </div>
                    )}
                    
                    {operations.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">
                            <svg className="w-12 h-12 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                            <p className="font-medium">No operations to undo</p>
                            <p className="text-sm mt-1">Your recent changes will appear here</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {operations.map((op) => (
                                <div 
                                    key={op.id}
                                    className="flex items-center gap-3 p-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors group"
                                >
                                    <div className="flex-shrink-0">
                                        {getOperationIcon(op.type)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-slate-700 truncate">
                                            {op.description}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            {formatTime(op.timestamp)}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => handleUndo(op)}
                                        disabled={loadingId !== null}
                                        className="flex-shrink-0 px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                                    >
                                        {loadingId === op.id ? (
                                            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                        ) : (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                            </svg>
                                        )}
                                        Undo
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                
                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-200 flex justify-between">
                    {operations.length > 0 && (
                        <button
                            onClick={onClearAll}
                            className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
                        >
                            Clear history
                        </button>
                    )}
                    <div className="flex-1" />
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
