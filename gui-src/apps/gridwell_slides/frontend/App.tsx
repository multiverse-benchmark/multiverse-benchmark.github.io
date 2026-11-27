import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useBackendAPI } from '@shared/hooks/useBackendAPI'
import type {
  ElementGeom,
  PageElement,
  PageSize,
  Presentation,
  Slide,
  ViewMode,
} from './slideTypes'
import {
  getElementText,
  getNaturalSlideSize,
  getSlideBgColor,
  pxToPt,
  rgbColorToString,
  toCssPx,
  toCssPxNum,
} from './slideHelpers'
import SlideView from './components/SlideView'
import SlideToolbar from './components/SlideToolbar'
import type { InsertableShape, TextStylePatch } from './components/SlideToolbar'
import { SHAPE_CATEGORIES } from './slideShapeCatalog'

const APP_NAME = "GridwellSlides"

const STATE_FETCH_TIMEOUT_MS = 30_000
const PAGE_FETCH_BATCH_SIZE = 25

// Build an updateTextStyle batch request that re-applies every populated
// field of `style` to the element's full text range. Returns null when the
// style is missing or has nothing to preserve. Used after delete+insert
// reconstruction (text edit, drag/resize commit, element duplication) so the
// reinserted text keeps the original formatting.
function buildPreservedStyleRequest(objectId: string, style: Record<string, unknown> | undefined | null) {
  if (!style) return null
  const out: Record<string, unknown> = {}
  const fields: string[] = []
  const keys = [
    'bold', 'italic', 'underline', 'strikethrough', 'smallCaps',
    'baselineOffset', 'fontFamily', 'fontSize',
    'foregroundColor', 'backgroundColor',
    'weightedFontFamily', 'link',
  ] as const
  for (const k of keys) {
    const v = style[k]
    if (v === undefined || v === null) continue
    out[k] = v
    fields.push(k)
  }
  if (fields.length === 0) return null
  return {
    updateTextStyle: {
      objectId,
      style: out,
      fields: fields.join(','),
      textRange: { type: 'ALL' },
    },
  }
}

// True for elements that should appear on the canvas (and in thumbnails /
// presenter). The previous coordinate-based check ("hide anything with
// translateX/Y < -50 PT") would erase user shapes the moment a drag pushed
// them past the slide edge. Helper shapes the GUI keeps off-canvas (the
// speaker-notes mirror at id "n_<timestamp>_<rnd>") use a known prefix.
function isUserVisibleElement(el: { objectId: string }): boolean {
  return !el.objectId.startsWith('n_')
}

async function parseJsonSafely(res: Response) {
  const text = await res.text();
  if (!text) return {} as any;
  try {
    return JSON.parse(text);
  } catch {
    const ct = res.headers.get('content-type') || '';
    const preview = text.slice(0, 400);
    throw new Error(`API returned invalid JSON (status ${res.status}, content-type ${ct}). Body: ${preview}`);
  }
}


interface AppProps {
  onClose: () => void
  setRefreshHandler?: (handler: (() => void) | null) => void
  openWindow?: (config: { id: string; title: string; content: React.ReactNode; width?: number; height?: number }) => void
  initialFileId?: string
}

const PRES_PAGE_SIZE = 50

export default function GridwellSlidesApp({ setRefreshHandler, initialFileId }: AppProps) {
  const [presentations, setPresentations] = useState<Presentation[]>([])
  const [currentPresentation, setCurrentPresentation] = useState<Presentation | null>(null)
  const [currentSlideIndex, setCurrentSlideIndex] = useState<number>(0)
  const [viewMode, setViewMode] = useState<ViewMode>('editor')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newPresentationTitle, setNewPresentationTitle] = useState('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [speakerNotes, setSpeakerNotes] = useState<Record<string, string>>({})
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [editingElementText, setEditingElementText] = useState(false)
  const [showElementPropsDialog, setShowElementPropsDialog] = useState(false)
  const [elementPropsDraft, setElementPropsDraft] = useState<{
    width: string; height: string; x: string; y: string; shapeType: string
  }>({ width: '', height: '', x: '', y: '', shapeType: '' })
  const [showAltTextDialog, setShowAltTextDialog] = useState(false)
  const [altTextDraft, setAltTextDraft] = useState({ title: '', description: '' })
  const [presPage, setPresPage] = useState(1)
  const [presenterSlideIndex, setPresenterSlideIndex] = useState(0)

  const currentSlide = currentPresentation?.slides?.[currentSlideIndex]

  const visibleElements = currentSlide?.pageElements?.filter(isUserVisibleElement) || []

  const loadDataRef = useRef<() => void>(() => {})

  const api = useBackendAPI('gridwell_slides')

  // Use ref-based pattern to avoid infinite re-render loop
  // Register refresh handler only once on mount
  const setRefreshHandlerRef = useRef(setRefreshHandler)
  setRefreshHandlerRef.current = setRefreshHandler

  useEffect(() => {
    const handler = () => loadDataRef.current()
    setRefreshHandlerRef.current?.(handler)
    return () => {
      setRefreshHandlerRef.current?.(null)
    }
  }, [])

  // Keep the ref always up to date
  const loadPresentationsRef = useRef(loadPresentations)
  useEffect(() => {
    loadPresentationsRef.current = loadPresentations
    loadDataRef.current = loadPresentations
  })

  // Load initial data
  useEffect(() => {
    loadPresentations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-open presentation if initialFileId is provided (from GridwellDrive cross-app navigation)
  const initialFileIdRef = useRef(initialFileId)
  useEffect(() => {
    if (initialFileIdRef.current && !loading && presentations.length > 0 && !currentPresentation) {
      const target = presentations.find(p => p.presentationId === initialFileIdRef.current)
      if (target) {
        selectPresentation(target)
      }
      initialFileIdRef.current = undefined
    }
  }, [loading, presentations])

  // Load presentations from backend state
  async function loadPresentations() {
    setLoading(true)
    setError(null)
    try {
      // Use AbortController with timeout to prevent indefinite hangs
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), STATE_FETCH_TIMEOUT_MS)

      const response = await fetch('./api/services/gridwell_slides/state', {
        signal: controller.signal,
      })
      clearTimeout(timeout)
      const data = await parseJsonSafely(response)

      const state = data?.state || {}
      const presentationsList: Presentation[] = []

      if (state.users) {
        for (const userId of Object.keys(state.users)) {
          const userData = state.users[userId]
          if (userData?.files) {
            for (const fileId of Object.keys(userData.files)) {
              const file = userData.files[fileId]
              if (file?.mimeType === 'application/vnd.gridwell-apps.presentation') {
                const presentationId = file.presentationId || file.id || fileId

                // Store only minimal slide data for listing.
                // Full details are loaded on-demand when a presentation is selected.
                const slides = Array.isArray(file.slides)
                  ? file.slides.map((s: Record<string, unknown>): Slide => ({ objectId: String(s.objectId) }))
                  : []
                presentationsList.push({
                  presentationId,
                  title: file.title || file.name || 'Untitled Presentation',
                  slides,
                  revisionId: file.revisionId,
                })
              }
            }
          }
        }
      }

      setPresentations(presentationsList)

      // If we have a current presentation, refresh it
      if (currentPresentation) {
        await loadPresentation(currentPresentation.presentationId)
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Loading timed out. The database may be too large. Try refreshing.')
      } else {
        setError(err instanceof Error ? err?.message : 'Failed to load presentations')
      }
    } finally {
      setLoading(false)
    }
  }

  // Load a specific presentation with full page details
  const loadPresentation = async (presentationId: string) => {
    try {
      const result = await api.callTool<Presentation>('get_presentation', {
        presentationId,
      })

      // Enrich slides with full page data including pageElements
      if (result.slides) {
        // Batch page detail fetches in chunks to avoid overwhelming
        // the server with too many simultaneous requests for large presentations
        const BATCH_SIZE = PAGE_FETCH_BATCH_SIZE
        const enrichedSlides: Slide[] = []
        for (let i = 0; i < result.slides.length; i += BATCH_SIZE) {
          const batch = result.slides.slice(i, i + BATCH_SIZE)
          const batchResults = await Promise.all(
            batch.map(async (slide) => {
              try {
                const pageDetail = await api.callTool<Slide>('get_page', {
                  presentationId,
                  pageObjectId: slide.objectId,
                })
                return { ...slide, ...pageDetail }
              } catch {
                return slide
              }
            })
          )
          enrichedSlides.push(...batchResults)
        }
        result.slides = enrichedSlides

        // Load speaker notes from notesPage.pageElements (not slide.pageElements)
        const notesMap = extractSpeakerNotes(enrichedSlides)
        setSpeakerNotes(prev => ({ ...prev, ...notesMap }))
      }

      applyPresentationResult(result, presentationId)
    } catch (err) {
      setError(err instanceof Error ? err?.message : 'Failed to load presentation')
    }
  }

  // Create a new presentation
  const createPresentation = async () => {
    if (!newPresentationTitle.trim()) {
      setError('Please enter a presentation title')
      return
    }

    setCreating(true)
    setError(null)
    try {
      const result = await api.callTool<Presentation>('create_presentation', {
        request: {
          title: newPresentationTitle.trim(),
          slides: [{ pageType: 'SLIDE' as const }]
        },
      })

      const title = newPresentationTitle.trim()
      setNewPresentationTitle('')
      setShowCreateDialog(false)

      setPresentations(prev => [...prev, {
        presentationId: result.presentationId,
        title: result.title || title,
        slides: result.slides || [],
        revisionId: result.revisionId,
      }])

      await loadPresentation(result.presentationId)
      setCurrentSlideIndex(0)
    } catch (err) {
      setError(err instanceof Error ? err?.message : 'Failed to create presentation')
    } finally {
      setCreating(false)
    }
  }

  // Rename presentation via state API since create_presentation
  // rejects duplicate IDs and batch_update has no title update operation
  const renamePresentation = async (newTitleArg?: string) => {
    if (!currentPresentation) return
    const newTitle = (newTitleArg ?? titleDraft).trim()
    if (!newTitle) return
    setEditingTitle(false)

    try {
      // Fetch current state, update the title, and PUT it back
      const stateRes = await fetch('./api/services/gridwell_slides/state')
      const stateData = await parseJsonSafely(stateRes)
      const state = stateData?.state
      if (!state?.users) throw new Error('Invalid state')

      // Find the file entry for this presentation and update its title
      let found = false
      for (const userId of Object.keys(state.users)) {
        const files = state.users[userId]?.files
        if (!files) continue
        for (const fileId of Object.keys(files)) {
          const file = files[fileId]
          if (file?.presentationId === currentPresentation.presentationId ||
              fileId === currentPresentation.presentationId) {
            file.title = newTitle
            file.name = newTitle
            found = true
            break
          }
        }
        if (found) break
      }

      if (!found) throw new Error('Presentation not found in state')

      const putRes = await fetch('./api/services/gridwell_slides/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state }),
      })
      if (!putRes.ok) throw new Error('Failed to update state')

      // Update local state
      setCurrentPresentation(prev => prev ? { ...prev, title: newTitle } : null)
      setPresentations(prev => prev.map(p =>
        p.presentationId === currentPresentation.presentationId
          ? { ...p, title: newTitle }
          : p
      ))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename presentation')
      // Still update local state for immediate feedback
      setCurrentPresentation(prev => prev ? { ...prev, title: newTitle } : null)
      setPresentations(prev => prev.map(p =>
        p.presentationId === currentPresentation.presentationId
          ? { ...p, title: newTitle }
          : p
      ))
    }
  }

  // Select a presentation
  const selectPresentation = async (presentation: Presentation) => {
    await loadPresentation(presentation.presentationId)
    setCurrentSlideIndex(0)
    setSelectedElementId(null)
  }

  // Navigate slides
  const goToSlide = (index: number) => {
    if (currentPresentation?.slides && index >= 0 && index < currentPresentation.slides.length) {
      setCurrentSlideIndex(index)
      setSelectedElementId(null)
      setEditingElementText(false)
    }
  }

  const nextSlide = () => {
    if (currentPresentation?.slides) {
      goToSlide(currentSlideIndex + 1)
    }
  }

  const previousSlide = () => {
    goToSlide(currentSlideIndex - 1)
  }

  // Shared helpers to avoid duplication between loadPresentation and refreshSlides

  // Extract speaker notes from a set of slides
  const extractSpeakerNotes = (slides: Slide[]) => {
    const notesMap: Record<string, string> = {}
    for (const slide of slides) {
      const notesPage = slide.slideProperties?.notesPage
      const notesObjId = notesPage?.notesProperties?.speakerNotesObjectId
      if (notesObjId && notesPage?.pageElements) {
        const notesElement = notesPage.pageElements.find(el => el.objectId === notesObjId)
        if (notesElement) {
          notesMap[slide.objectId] = getElementText(notesElement)
        }
      }
      if (!notesMap[slide.objectId] && notesPage?.pageElements) {
        const notesText = notesPage.pageElements
          .map(el => getElementText(el))
          .filter(t => t.trim())
          .join('\n')
        if (notesText) {
          notesMap[slide.objectId] = notesText
        }
      }
    }
    return notesMap
  }

  // Apply a loaded/refreshed presentation result to component state
  const applyPresentationResult = (result: Presentation, presentationId: string) => {
    setCurrentPresentation(result)
    if (result.slides && result.slides.length > 0 && currentSlideIndex >= result.slides.length) {
      setCurrentSlideIndex(0)
    }
    setPresentations(prev => prev.map(pres =>
      pres.presentationId === presentationId
        ? { ...pres, slides: result.slides, title: result.title || pres.title }
        : pres
    ))
  }

  // Lightweight refresh that re-fetches only specific slides.
  // When slideStructureChanged is false, skips the get_presentation call entirely
  // and only re-fetches page details for the given slide IDs.
  const refreshSlides = async (presentationId: string, slideObjectIds: string[], slideStructureChanged = false) => {
    try {
      if (!slideStructureChanged && slideObjectIds.length > 0 && currentPresentation?.slides) {
        // Fast path: slide list unchanged, just re-fetch the affected pages
        const refreshedPages = await Promise.all(
          slideObjectIds.map(async (id) => {
            try {
              return await api.callTool<Slide>('get_page', { presentationId, pageObjectId: id })
            } catch {
              return null
            }
          })
        )
        const pageMap = new Map<string, Slide>()
        for (let i = 0; i < slideObjectIds.length; i++) {
          if (refreshedPages[i]) pageMap.set(slideObjectIds[i], refreshedPages[i]!)
        }

        const updatedSlides = currentPresentation.slides.map(slide =>
          pageMap.has(slide.objectId) ? { ...slide, ...pageMap.get(slide.objectId)! } : slide
        )
        const result = { ...currentPresentation, slides: updatedSlides }

        const notesMap = extractSpeakerNotes(updatedSlides.filter(s => pageMap.has(s.objectId)))
        if (Object.keys(notesMap).length > 0) {
          setSpeakerNotes(prev => ({ ...prev, ...notesMap }))
        }

        applyPresentationResult(result, presentationId)
        return
      }

      // Full path: slide structure may have changed, fetch presentation then targeted pages
      const result = await api.callTool<Presentation>('get_presentation', { presentationId })

      if (result.slides) {
        const existingSlideMap = new Map<string, Slide>()
        for (const s of currentPresentation?.slides || []) {
          existingSlideMap.set(s.objectId, s)
        }

        // Determine which slides need re-fetching
        const toFetch = result.slides.filter(slide =>
          slideObjectIds.includes(slide.objectId) || !existingSlideMap.has(slide.objectId)
        )

        // Fetch in parallel (matching loadPresentation's strategy)
        const fetchedPages = await Promise.all(
          toFetch.map(async (slide) => {
            try {
              const pageDetail = await api.callTool<Slide>('get_page', { presentationId, pageObjectId: slide.objectId })
              return { ...slide, ...pageDetail }
            } catch {
              return slide
            }
          })
        )
        const fetchedMap = new Map<string, Slide>()
        for (const s of fetchedPages) fetchedMap.set(s.objectId, s)

        const enrichedSlides = result.slides.map(slide =>
          fetchedMap.has(slide.objectId) ? fetchedMap.get(slide.objectId)! :
          existingSlideMap.get(slide.objectId)!
        )
        result.slides = enrichedSlides

        const refreshedSlides = enrichedSlides.filter(s => fetchedMap.has(s.objectId))
        const notesMap = extractSpeakerNotes(refreshedSlides)
        if (Object.keys(notesMap).length > 0) {
          setSpeakerNotes(prev => ({ ...prev, ...notesMap }))
        }
      }

      applyPresentationResult(result, presentationId)
    } catch (err) {
      setError(err instanceof Error ? err?.message : 'Failed to load presentation')
    }
  }

  // Batch update helper
  // Accept optional list of affected slide IDs to do a targeted
  // refresh instead of reloading every slide in the presentation.
  const batchUpdate = async (requests: unknown[], affectedSlideIds?: string[], slideStructureChanged = false) => {
    if (!currentPresentation) return

    try {
      await api.callTool('batch_update_presentation', {
        presentationId: currentPresentation.presentationId,
        requests,
      })
      if (affectedSlideIds !== undefined) {
        await refreshSlides(currentPresentation.presentationId, affectedSlideIds, slideStructureChanged)
      } else {
        await loadPresentation(currentPresentation.presentationId)
      }
    } catch (err) {
      setError(err instanceof Error ? err?.message : 'Failed to update presentation')
    }
  }

  // Create a new slide with the given predefined layout. Layout values must
  // be one of PREDEFINED_LAYOUTS — they map to backend's PredefinedLayout enum.
  const createSlide = async (predefinedLayout: string = 'BLANK') => {
    if (!currentPresentation) return

    const slideCount = currentPresentation.slides?.length || 0
    const insertAt = slideCount === 0 ? 0 : currentSlideIndex + 1

    await batchUpdate([
      {
        createSlide: {
          insertionIndex: insertAt,
          slideLayoutReference: { predefinedLayout },
        },
      },
    ], [], true)
    setCurrentSlideIndex(insertAt)
  }

  // Delete current slide (already calls backend via batchUpdate)
  const deleteSlide = async () => {
    if (!currentPresentation?.slides || currentPresentation.slides.length <= 1) {
      setError('Cannot delete the last slide')
      return
    }

    const slide = currentPresentation.slides[currentSlideIndex]
    if (!slide) return

    const newIndex = currentSlideIndex >= currentPresentation.slides.length - 1
      ? currentSlideIndex - 1
      : currentSlideIndex

    await batchUpdate([
      {
        deleteObject: {
          objectId: slide.objectId,
        },
      },
    ], [], true) // structure changed, existing slides reused from cache

    setCurrentSlideIndex(newIndex)
  }

  // Duplicate slide - copy formatting (text style, fill color) from source slide
  const duplicateSlide = async () => {
    if (!currentPresentation?.slides) return

    const slide = currentPresentation.slides[currentSlideIndex]
    if (!slide) return

    // Create a new blank slide and copy elements with formatting
    const newSlideId = `slide_copy_${Date.now()}`
    const requests: unknown[] = [
      {
        createSlide: {
          objectId: newSlideId,
          insertionIndex: currentSlideIndex + 1,
          slideLayoutReference: {
            predefinedLayout: 'BLANK',
          },
        },
      },
    ]

    // Copy each page element from the original slide
    if (slide.pageElements) {
      for (const element of slide.pageElements) {
        if (!isUserVisibleElement(element)) continue
        if (element.shape) {
          const copiedObjectId = `cp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
          requests.push({
            createShape: {
              objectId: copiedObjectId,
              shapeType: element.shape.shapeType || 'TEXT_BOX',
              elementProperties: {
                pageObjectId: newSlideId,
                size: element.size,
                transform: element.transform,
              },
            },
          })
          const textContent = getElementText(element)
          if (textContent) {
            requests.push({
              insertText: {
                objectId: copiedObjectId,
                text: textContent,
                insertionIndex: 0,
              },
            })

            // Copy text formatting (color, bold, italic, etc.)
            const firstTextEl = element.shape.text?.textElements?.[0]?.textRun?.style
            if (firstTextEl) {
              const styleUpdate: Record<string, unknown> = {}
              const fields: string[] = []
              if (firstTextEl.bold != null) { styleUpdate.bold = firstTextEl.bold; fields.push('bold') }
              if (firstTextEl.italic != null) { styleUpdate.italic = firstTextEl.italic; fields.push('italic') }
              if (firstTextEl.underline != null) { styleUpdate.underline = firstTextEl.underline; fields.push('underline') }
              if (firstTextEl.fontFamily) { styleUpdate.fontFamily = firstTextEl.fontFamily; fields.push('fontFamily') }
              if (firstTextEl.fontSize) { styleUpdate.fontSize = firstTextEl.fontSize; fields.push('fontSize') }
              if (firstTextEl.foregroundColor) { styleUpdate.foregroundColor = firstTextEl.foregroundColor; fields.push('foregroundColor') }
              if (fields.length > 0) {
                requests.push({
                  updateTextStyle: {
                    objectId: copiedObjectId,
                    style: styleUpdate,
                    textRange: { type: 'ALL' },
                    fields: fields.join(','),
                  },
                })
              }
            }
          }
        }
      }
    }

    // Send the batch request without refreshing yet (bg color copy comes next)
    try {
      await api.callTool('batch_update_presentation', {
        presentationId: currentPresentation.presentationId,
        requests,
      })
    } catch (err) {
      setError(err instanceof Error ? err?.message : 'Failed to update presentation')
      return
    }

    // Copy slide background color via direct state manipulation
    // (no updatePageProperties API available)
    const bgColor = slide.pageProperties?.backgroundColor?.opaqueColor?.rgbColor
      || slide.pageProperties?.pageBackgroundFill?.solidFill?.color?.rgbColor
    if (bgColor && (bgColor.red || bgColor.green || bgColor.blue)) {
      try {
        const stateRes = await fetch('./api/services/gridwell_slides/state')
        const stateData = await parseJsonSafely(stateRes)
        const state = stateData?.state
        if (state?.users) {
          for (const userId of Object.keys(state.users)) {
            const files = state.users[userId]?.files
            if (!files) continue
            for (const fileId of Object.keys(files)) {
              const file = files[fileId]
              if (file?.presentationId === currentPresentation.presentationId || fileId === currentPresentation.presentationId) {
                const newSlide = file.slides?.find((s: any) => s.objectId === newSlideId)
                if (newSlide) {
                  newSlide.pageProperties = {
                    ...newSlide.pageProperties,
                    backgroundColor: { opaqueColor: { rgbColor: bgColor } },
                    pageBackgroundFill: { solidFill: { color: { rgbColor: bgColor } } },
                  }
                  await fetch('./api/services/gridwell_slides/state', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ state }),
                  })
                }
                break
              }
            }
          }
        }
      } catch {
        // Non-critical: background color copy failed
      }
    }

    // Single refresh after both batch update and bg color copy
    await refreshSlides(currentPresentation.presentationId, [], true)
    setCurrentSlideIndex(currentSlideIndex + 1)
  }

  // Move slide up/down by recreating it at a new position
  const moveSlide = async (direction: 'up' | 'down') => {
    if (!currentPresentation?.slides) return
    const slides = currentPresentation.slides
    const fromIndex = currentSlideIndex
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1

    if (toIndex < 0 || toIndex >= slides.length) return

    const slideToMove = slides[fromIndex]
    if (!slideToMove) return

    // Strategy: Delete the slide, then create a new one at the target position
    // and recreate all its elements
    const newSlideId = `slide_moved_${Date.now()}`
    const requests: unknown[] = [
      { deleteObject: { objectId: slideToMove.objectId } },
      {
        createSlide: {
          objectId: newSlideId,
          insertionIndex: toIndex,
          slideLayoutReference: { predefinedLayout: 'BLANK' },
        },
      },
    ]

    // Recreate elements on the new slide (skip GUI-internal helper shapes)
    if (slideToMove.pageElements) {
      for (const element of slideToMove.pageElements) {
        if (!isUserVisibleElement(element)) continue
        if (element.shape) {
          const suffix = Math.random().toString(36).slice(2, 8)
          const newObjId = `mv_${suffix}_${Date.now()}`
          requests.push({
            createShape: {
              objectId: newObjId,
              shapeType: element.shape.shapeType || 'TEXT_BOX',
              elementProperties: {
                pageObjectId: newSlideId,
                size: element.size,
                transform: element.transform,
              },
            },
          })
          const textContent = getElementText(element)
          if (textContent) {
            requests.push({
              insertText: {
                objectId: newObjId,
                text: textContent,
                insertionIndex: 0,
              },
            })
          }
        }
      }
    }

    await batchUpdate(requests, [], true) // structure changed, moved slide auto-detected
    setCurrentSlideIndex(toIndex)
  }

  // Add text element to current slide
  // Compute the slide width/height in PT for centering new elements. Defaults
  // to the standard 720×405 PT widescreen if pageSize is missing.
  const getSlideSizePt = () => {
    const pageSize = currentPresentation?.pageSize
    const wMag = pageSize?.width?.magnitude
    const hMag = pageSize?.height?.magnitude
    const wPx = wMag ? toCssPxNum(wMag, pageSize?.width?.unit) : 960
    const hPx = hMag ? toCssPxNum(hMag, pageSize?.height?.unit) : 540
    return { widthPt: pxToPt(wPx), heightPt: pxToPt(hPx) }
  }

  const addText = async () => {
    if (!currentPresentation || !currentSlide) return

    const newObjectId = `text_${Date.now()}`
    const { widthPt, heightPt } = getSlideSizePt()
    const w = 240, h = 48

    await batchUpdate([
      {
        createShape: {
          objectId: newObjectId,
          shapeType: 'TEXT_BOX',
          elementProperties: {
            pageObjectId: currentSlide.objectId,
            size: {
              width: { magnitude: w, unit: 'PT' },
              height: { magnitude: h, unit: 'PT' },
            },
            transform: {
              translateX: (widthPt - w) / 2,
              translateY: (heightPt - h) / 2,
              unit: 'PT',
            },
          },
        },
      },
      {
        insertText: {
          objectId: newObjectId,
          text: 'New text',
          insertionIndex: 0,
        },
      },
    ], [currentSlide.objectId])

    // Auto-select the new element so the user sees it landed.
    setSelectedElementId(newObjectId)
  }

  // Add shape element to current slide
  const addShape = async (shapeType: string) => {
    if (!currentPresentation || !currentSlide) return

    const newObjectId = `shape_${Date.now()}`
    const { widthPt, heightPt } = getSlideSizePt()
    const w = 120, h = 100

    await batchUpdate([
      {
        createShape: {
          objectId: newObjectId,
          shapeType,
          elementProperties: {
            pageObjectId: currentSlide.objectId,
            size: {
              width: { magnitude: w, unit: 'PT' },
              height: { magnitude: h, unit: 'PT' },
            },
            transform: {
              translateX: (widthPt - w) / 2,
              translateY: (heightPt - h) / 2,
              unit: 'PT',
            },
          },
        },
      },
    ], [currentSlide.objectId])

    setSelectedElementId(newObjectId)
  }

  // Delete the currently-selected element via the deleteObject batch op.
  const deleteSelectedElement = async () => {
    if (!currentPresentation || !currentSlide || !selectedElementId) return
    const elementToDelete = selectedElementId
    setSelectedElementId(null)
    setEditingElementText(false)
    await batchUpdate([{ deleteObject: { objectId: elementToDelete } }], [currentSlide.objectId])
  }

  // Duplicate the selected element next to itself. Because the batch API only
  // exposes createShape (no createImage / createTable), this is shape-only.
  // Text content and the primary text style are copied over via insertText +
  // updateTextStyle.
  const duplicateSelectedElement = async () => {
    if (!currentPresentation || !currentSlide || !selectedElementId) return
    const source = currentSlide.pageElements?.find(el => el.objectId === selectedElementId)
    if (!source || !source.shape) return

    const newId = `dup_${Date.now()}`
    const offsetPt = 20
    const widthPx = source.size?.width?.magnitude != null
      ? toCssPxNum(source.size.width.magnitude, source.size.width.unit) : 100
    const heightPx = source.size?.height?.magnitude != null
      ? toCssPxNum(source.size.height.magnitude, source.size.height.unit) : 50
    const txPx = source.transform?.translateX != null
      ? toCssPxNum(source.transform.translateX, source.transform.unit) : 0
    const tyPx = source.transform?.translateY != null
      ? toCssPxNum(source.transform.translateY, source.transform.unit) : 0

    const textContent = getElementText(source)
    const firstStyle = source.shape.text?.textElements?.[0]?.textRun?.style

    const requests: unknown[] = [
      {
        createShape: {
          objectId: newId,
          shapeType: source.shape.shapeType || 'TEXT_BOX',
          elementProperties: {
            pageObjectId: currentSlide.objectId,
            size: {
              width: { magnitude: pxToPt(widthPx), unit: 'PT' },
              height: { magnitude: pxToPt(heightPx), unit: 'PT' },
            },
            transform: {
              translateX: pxToPt(txPx) + offsetPt,
              translateY: pxToPt(tyPx) + offsetPt,
              unit: 'PT',
            },
          },
        },
      },
    ]
    if (textContent) {
      requests.push({ insertText: { objectId: newId, text: textContent, insertionIndex: 0 } })
      if (firstStyle) {
        const style: Record<string, unknown> = {}
        const fields: string[] = []
        if (firstStyle.bold !== undefined) { style.bold = firstStyle.bold; fields.push('bold') }
        if (firstStyle.italic !== undefined) { style.italic = firstStyle.italic; fields.push('italic') }
        if (firstStyle.underline !== undefined) { style.underline = firstStyle.underline; fields.push('underline') }
        if (firstStyle.fontSize) { style.fontSize = firstStyle.fontSize; fields.push('fontSize') }
        if (firstStyle.fontFamily) { style.fontFamily = firstStyle.fontFamily; fields.push('fontFamily') }
        if (firstStyle.foregroundColor) { style.foregroundColor = firstStyle.foregroundColor; fields.push('foregroundColor') }
        if (fields.length > 0) {
          requests.push({
            updateTextStyle: {
              objectId: newId,
              style,
              fields: fields.join(','),
              textRange: { type: 'ALL' },
            },
          })
        }
      }
    }

    await batchUpdate(requests, [currentSlide.objectId])
    setSelectedElementId(newId)
  }

  // Commit inline text edits made directly inside the shape on the canvas.
  // Two subtleties make this longer than it looks:
  //   1. The batch API has no "replace text" — we do deleteText + insertText,
  //      which means the new run is created without the previous run's style.
  //      We capture the original style and re-apply via updateTextStyle so the
  //      user's bold/italic/font/color/etc. survives the round-trip.
  //   2. There's a visible gap between unmounting the editor and the refresh
  //      bringing back the new text, during which the read-only renderer
  //      would briefly show the *old* text. We update local state optimistically
  //      so the display stays consistent end-to-end.
  const commitElementText = async (objectId: string, text: string) => {
    setEditingElementText(false)
    if (!currentPresentation || !currentSlide) return
    const element = currentSlide.pageElements?.find(el => el.objectId === objectId)
    if (!element) return
    const existingText = getElementText(element)
    if (existingText === text) return

    const firstRun = element.shape?.text?.textElements?.find(t => t.textRun)
    const firstStyle = firstRun?.textRun?.style

    // Optimistic local update — replace the first text run's content while
    // keeping its style intact. Subsequent runs are dropped to mirror what
    // the server will end up with after delete+insert.
    const slideId = currentSlide.objectId
    setCurrentPresentation(prev => {
      if (!prev?.slides) return prev
      return {
        ...prev,
        slides: prev.slides.map(s => {
          if (s.objectId !== slideId) return s
          return {
            ...s,
            pageElements: s.pageElements?.map(el => {
              if (el.objectId !== objectId || !el.shape) return el
              const newTextElements = firstRun
                ? [{ ...firstRun, textRun: { ...firstRun.textRun, content: text } }]
                : (text ? [{ textRun: { content: text } }] : [])
              return {
                ...el,
                shape: {
                  ...el.shape,
                  text: { ...el.shape.text, textElements: newTextElements },
                },
              }
            }),
          }
        }),
      }
    })

    const requests: unknown[] = []
    if (existingText) {
      requests.push({ deleteText: { objectId, textRange: { type: 'ALL' } } })
    }
    if (text) {
      requests.push({ insertText: { objectId, text, insertionIndex: 0 } })
      // Cast through Record<string, unknown> — the local TextStyle type only
      // names a few fields, but the helper reads all backend-supported ones.
      const styleRequest = buildPreservedStyleRequest(objectId, firstStyle as Record<string, unknown> | undefined)
      if (styleRequest) requests.push(styleRequest)
    }
    if (requests.length > 0) {
      await batchUpdate(requests, [currentSlide.objectId])
    }
  }

  // Save speaker notes
  const saveSpeakerNotes = async () => {
    if (!currentPresentation || !currentSlide) return
    setEditingNotes(false)

    const slideId = currentSlide.objectId
    let notesObjId = currentSlide.slideProperties?.notesPage?.notesProperties?.speakerNotesObjectId

    const requests: unknown[] = []

    // If no notes shape exists yet, create one and wire it up
    if (!notesObjId) {
      notesObjId = `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      // Create a notes text box on the slide
      requests.push({
        createShape: {
          objectId: notesObjId,
          shapeType: 'TEXT_BOX',
          elementProperties: {
            pageObjectId: slideId,
            size: {
              width: { magnitude: 1, unit: 'PT' },
              height: { magnitude: 1, unit: 'PT' },
            },
            transform: {
              translateX: -100,
              translateY: -100,
              unit: 'PT',
            },
          },
        },
      })
      // Link it as the speaker notes object
      requests.push({
        updateSlideProperties: {
          objectId: slideId,
          slideProperties: {
            notesPage: {
              notesProperties: { speakerNotesObjectId: notesObjId },
            },
          },
          fields: 'notesPage',
        },
      })
    } else {
      // Delete existing text in the notes shape
      const existingNotes = speakerNotes[slideId] || ''
      if (existingNotes) {
        requests.push({
          deleteText: {
            objectId: notesObjId,
            textRange: { type: 'ALL' },
          },
        })
      }
    }

    // Insert new notes text
    if (notesDraft.trim()) {
      requests.push({
        insertText: {
          objectId: notesObjId,
          text: notesDraft.trim(),
          insertionIndex: 0,
        },
      })
    }

    if (requests.length > 0) {
      await batchUpdate(requests, [slideId])
    }
    setSpeakerNotes(prev => ({ ...prev, [slideId]: notesDraft.trim() }))
  }

  // Save element properties (position, size)
  const saveElementProps = async () => {
    if (!currentPresentation || !currentSlide || !selectedElementId) return
    setShowElementPropsDialog(false)

    const element = currentSlide.pageElements?.find(el => el.objectId === selectedElementId)
    if (!element) return

    // Delete and recreate the element with new properties
    const requests: unknown[] = [
      { deleteObject: { objectId: selectedElementId } },
    ]

    const newObjId = `ed_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const textContent = getElementText(element)

    requests.push({
      createShape: {
        objectId: newObjId,
        shapeType: elementPropsDraft.shapeType || element.shape?.shapeType || 'TEXT_BOX',
        elementProperties: {
          pageObjectId: currentSlide.objectId,
          size: {
            width: { magnitude: parseFloat(elementPropsDraft.width) || element.size?.width?.magnitude || 100, unit: 'PT' },
            height: { magnitude: parseFloat(elementPropsDraft.height) || element.size?.height?.magnitude || 50, unit: 'PT' },
          },
          transform: {
            translateX: parseFloat(elementPropsDraft.x) || element.transform?.translateX || 0,
            translateY: parseFloat(elementPropsDraft.y) || element.transform?.translateY || 0,
            unit: 'PT',
          },
        },
      },
    })

    if (textContent) {
      requests.push({
        insertText: {
          objectId: newObjId,
          text: textContent,
          insertionIndex: 0,
        },
      })
    }

    await batchUpdate(requests, [currentSlide.objectId])
    setSelectedElementId(null)
  }

  // Drag/resize commit: recreate the element in place at the new geometry,
  // preserving the original objectId, text content, and primary text style.
  const commitElementTransform = useCallback(async (objectId: string, geom: ElementGeom) => {
    if (!currentPresentation || !currentSlide) return
    const element = currentSlide.pageElements?.find(el => el.objectId === objectId)
    if (!element || !element.shape) return

    const textContent = getElementText(element)
    const firstStyle = element.shape.text?.textElements?.[0]?.textRun?.style

    // Optimistic local update so the element stays put visually until the server
    // round-trip + refresh completes — avoids a snap-back flicker after drag.
    const slideId = currentSlide.objectId
    setCurrentPresentation(prev => {
      if (!prev?.slides) return prev
      return {
        ...prev,
        slides: prev.slides.map(s => s.objectId !== slideId ? s : ({
          ...s,
          pageElements: s.pageElements?.map(el => el.objectId !== objectId ? el : ({
            ...el,
            transform: {
              ...el.transform,
              translateX: pxToPt(geom.left),
              translateY: pxToPt(geom.top),
              unit: 'PT',
            },
            size: {
              width: { magnitude: pxToPt(geom.width), unit: 'PT' },
              height: { magnitude: pxToPt(geom.height), unit: 'PT' },
            },
          })),
        })),
      }
    })

    const requests: unknown[] = [
      { deleteObject: { objectId } },
      {
        createShape: {
          objectId,
          shapeType: element.shape.shapeType || 'TEXT_BOX',
          elementProperties: {
            pageObjectId: currentSlide.objectId,
            size: {
              width: { magnitude: pxToPt(geom.width), unit: 'PT' },
              height: { magnitude: pxToPt(geom.height), unit: 'PT' },
            },
            transform: {
              translateX: pxToPt(geom.left),
              translateY: pxToPt(geom.top),
              unit: 'PT',
            },
          },
        },
      },
    ]

    if (textContent) {
      requests.push({
        insertText: { objectId, text: textContent, insertionIndex: 0 },
      })

      if (firstStyle) {
        const style: Record<string, unknown> = {}
        const fields: string[] = []
        if (firstStyle.bold !== undefined) { style.bold = firstStyle.bold; fields.push('bold') }
        if (firstStyle.italic !== undefined) { style.italic = firstStyle.italic; fields.push('italic') }
        if (firstStyle.underline !== undefined) { style.underline = firstStyle.underline; fields.push('underline') }
        if (firstStyle.fontSize) { style.fontSize = firstStyle.fontSize; fields.push('fontSize') }
        if (firstStyle.fontFamily) { style.fontFamily = firstStyle.fontFamily; fields.push('fontFamily') }
        if (firstStyle.foregroundColor) { style.foregroundColor = firstStyle.foregroundColor; fields.push('foregroundColor') }
        if (fields.length > 0) {
          requests.push({
            updateTextStyle: {
              objectId,
              style,
              fields: fields.join(','),
              textRange: { type: 'ALL' },
            },
          })
        }
      }
    }

    await batchUpdate(requests, [currentSlide.objectId])
  }, [currentPresentation, currentSlide])

  // Toggle whether the current slide is skipped during presentation (real
  // backend feature via updateSlideProperties.isSkipped — no fake transitions).
  const toggleSkipSlide = async () => {
    if (!currentPresentation || !currentSlide) return
    const next = !currentSlide.slideProperties?.isSkipped
    await batchUpdate([{
      updateSlideProperties: {
        objectId: currentSlide.objectId,
        slideProperties: { isSkipped: next },
        fields: 'isSkipped',
      },
    }], [currentSlide.objectId])
  }

  // Translate a TextStylePatch into a Slides API style object + field mask,
  // then dispatch updateTextStyle against the entire text range of the
  // currently-selected element. The Slides batch API only formats whole runs
  // here (the GUI has no caret-based selection inside a shape), so we always
  // use textRange.type='ALL'.
  const applyTextStyle = async (patch: TextStylePatch) => {
    if (!currentPresentation || !currentSlide || !selectedElementId) return
    const element = currentSlide.pageElements?.find(el => el.objectId === selectedElementId)
    if (!element?.shape) return
    const hasText = (element.shape.text?.textElements?.length || 0) > 0
    if (!hasText) {
      setError('This shape has no text yet — double-click to add text first, then apply formatting.')
      return
    }

    const style: Record<string, unknown> = {}
    const fields: string[] = []
    for (const key of Object.keys(patch) as (keyof TextStylePatch)[]) {
      const value = patch[key]
      if (value === undefined) continue
      if (key === 'foregroundColor' || key === 'backgroundColor') {
        style[key] = value ? { opaqueColor: { rgbColor: value } } : {}
      } else if (key === 'link') {
        style[key] = value ? { url: (value as { url: string }).url } : {}
      } else if (key === 'weightedFontFamily') {
        style[key] = value || {}
      } else if (key === 'fontSize') {
        style[key] = value != null ? { magnitude: value, unit: 'PT' } : {}
      } else {
        style[key] = value
      }
      fields.push(key)
    }
    if (fields.length === 0) return

    await batchUpdate([{
      updateTextStyle: {
        objectId: selectedElementId,
        style,
        textRange: { type: 'ALL' },
        fields: fields.join(','),
      },
    }], [currentSlide.objectId])
  }

  // Find and replace via the backend's replaceAllText request. Limited to the
  // current slide when `allSlides` is false by passing pageObjectIds.
  const findAndReplace = async (
    find: string,
    replace: string,
    opts: { matchCase: boolean; regex: boolean; allSlides: boolean },
  ) => {
    if (!currentPresentation || !find) return
    const containsText: Record<string, unknown> = { text: find }
    if (opts.matchCase) containsText.matchCase = true
    if (opts.regex) containsText.searchByRegex = true
    const request: Record<string, unknown> = {
      replaceAllText: {
        containsText,
        replaceText: replace,
      },
    }
    if (!opts.allSlides && currentSlide) {
      (request.replaceAllText as Record<string, unknown>).pageObjectIds = [currentSlide.objectId]
    }
    const affected = opts.allSlides
      ? (currentPresentation.slides?.map(s => s.objectId) || [])
      : (currentSlide ? [currentSlide.objectId] : [])
    await batchUpdate([request], affected)
  }

  // Save alt text via updatePageElementAltText for the selected element.
  const saveAltText = async () => {
    if (!currentPresentation || !currentSlide || !selectedElementId) return
    setShowAltTextDialog(false)
    await batchUpdate([{
      updatePageElementAltText: {
        objectId: selectedElementId,
        title: altTextDraft.title,
        description: altTextDraft.description,
      },
    }], [currentSlide.objectId])
  }

  // Get individual slide details using get_page API
  const [slideDetail, setSlideDetail] = useState<any | null>(null)
  const [showSlideDetailDialog, setShowSlideDetailDialog] = useState(false)
  const [loadingSlideDetail, setLoadingSlideDetail] = useState(false)

  const getSlideDetail = async () => {
    if (!currentPresentation || !currentSlide) return

    setLoadingSlideDetail(true)
    setShowSlideDetailDialog(true)
    setSlideDetail(null)

    try {
      const result = await api.callTool('get_page', {
        presentationId: currentPresentation.presentationId,
        pageObjectId: currentSlide.objectId,
      })
      setSlideDetail(result)
    } catch (err) {
      setSlideDetail({ error: err instanceof Error ? err.message : 'Failed to get slide details' })
    } finally {
      setLoadingSlideDetail(false)
    }
  }

  // Summarize presentation
  const [summary, setSummary] = useState<any | null>(null)
  const [showSummaryDialog, setShowSummaryDialog] = useState(false)
  const [loadingSummary, setLoadingSummary] = useState(false)

  const summarizePresentation = async () => {
    if (!currentPresentation) return

    setLoadingSummary(true)
    setShowSummaryDialog(true)
    setSummary(null)

    try {
      const result = await api.callTool('summarize_presentation', {
        presentationId: currentPresentation.presentationId,
        include_notes: true,
      })
      setSummary(result)
    } catch (err) {
      setSummary({ error: err instanceof Error ? err.message : 'Failed to summarize presentation' })
    } finally {
      setLoadingSummary(false)
    }
  }

  if (loading && presentations.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="w-8 h-8 border-4 border-[var(--accent-color)]/30 border-t-[var(--accent-color)] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="h-full flex bg-[var(--bg-primary)]">
      {/* Sidebar - Presentations List & Thumbnails */}
      <div className="w-64 bg-[var(--bg-secondary)] flex flex-col border-r border-[var(--border-color)] min-h-0">
        {/* Header */}
        <div className="h-12 flex items-center justify-between px-4 border-b border-[var(--border-color)]">
          <span className="font-bold text-[var(--text-primary)]">Presentations</span>
          <button
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] p-1 rounded transition-colors"
            onClick={() => setShowCreateDialog(true)}
            title="New Presentation"
          >
            <span className="text-lg">+</span>
          </button>
        </div>

        {/* Presentations List */}
        <div className={`overflow-y-auto py-2 ${currentPresentation && viewMode === 'editor' ? 'h-1/2' : 'flex-1'}`}>
          {presentations.length === 0 ? (
            <div className="px-4 py-8 text-center text-[var(--text-secondary)] text-sm">
              <p>No presentations yet</p>
              <button
                className="mt-4 px-4 py-2 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-colors text-sm"
                onClick={() => setShowCreateDialog(true)}
              >
                Create Presentation
              </button>
            </div>
          ) : (
            <div className="space-y-1 px-2">
              {/* Paginate presentations list for large databases */}
              {presentations.slice(0, presPage * PRES_PAGE_SIZE).map(pres => (
                <button
                  key={pres.presentationId}
                  className={`w-full px-3 py-2 text-left rounded transition-colors ${
                    currentPresentation?.presentationId === pres.presentationId
                      ? 'bg-[var(--accent-color)] text-white'
                      : 'text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                  }`}
                  onClick={() => selectPresentation(pres)}
                >
                  <div className="text-sm font-medium truncate">{pres.title || 'Untitled'}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{pres.presentationId}]</span></div>
                  <div className="text-xs opacity-75 mt-0.5">
                    {pres.slides?.length || 0} {pres.slides?.length === 1 ? 'slide' : 'slides'}
                  </div>
                </button>
              ))}
              {presentations.length > presPage * PRES_PAGE_SIZE && (
                <button
                  className="w-full px-3 py-2 text-center text-xs text-[var(--accent-color)] hover:bg-[var(--bg-tertiary)] rounded transition-colors"
                  onClick={() => setPresPage(p => p + 1)}
                >
                  Load More ({presentations.length - presPage * PRES_PAGE_SIZE} remaining)
                </button>
              )}
            </div>
          )}
        </div>

        {/* Editor Side Thumbnails */}
        {currentPresentation && viewMode === 'editor' && (
          <div className="h-1/2 border-t border-[var(--border-color)] p-2 flex flex-col min-h-0">
            <div className="text-xs font-medium text-[var(--text-secondary)] mb-2 px-2 flex-shrink-0">Slides</div>
            <div className="space-y-2 overflow-y-auto flex-1 px-1">
              {currentPresentation.slides?.map((slide, index) => (
                <div key={slide.objectId} className="flex items-center gap-1">
                  <button
                    className={`flex-1 p-2 rounded border-2 transition-all flex-shrink-0 ${
                      index === currentSlideIndex
                        ? 'border-[var(--accent-color)] bg-[var(--bg-tertiary)]'
                        : 'border-[var(--border-color)] hover:border-[var(--accent-color)]/50'
                    }`}
                    onClick={() => goToSlide(index)}
                  >
                    <div className="aspect-video bg-white rounded border border-gray-200 flex items-center justify-center text-[8px] text-gray-400 overflow-hidden p-1">
                      {slide.pageElements?.filter(isUserVisibleElement).slice(0, 3).map(el => (
                        <span key={el.objectId} className="truncate block">
                          {getElementText(el).slice(0, 20) || (el.shape ? 'Shape' : el.image ? 'Img' : '')}
                        </span>
                      )) || 'Slide'}
                    </div>
                    <div className="text-xs text-[var(--text-secondary)] mt-1 text-center font-medium">
                      {index + 1}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{slide.objectId}]</span>
                    </div>
                  </button>
                  {/* Reorder buttons */}
                  <div className="flex flex-col gap-0.5">
                    <button
                      className="text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded px-1 disabled:opacity-30"
                      onClick={() => { setCurrentSlideIndex(index); moveSlide('up') }}
                      disabled={index === 0}
                      title="Move Up"
                    >
                      ^
                    </button>
                    <button
                      className="text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded px-1 disabled:opacity-30"
                      onClick={() => { setCurrentSlideIndex(index); moveSlide('down') }}
                      disabled={index === (currentPresentation.slides?.length || 0) - 1}
                      title="Move Down"
                    >
                      v
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        {currentPresentation && (
          <SlideToolbar
            title={currentPresentation.title || 'Untitled Presentation'}
            presentationId={currentPresentation.presentationId}
            currentSlideIndex={currentSlideIndex}
            totalSlides={currentPresentation.slides?.length || 0}
            onRename={(newTitle) => { renamePresentation(newTitle) }}
            viewMode={viewMode}
            onSetViewMode={setViewMode}
            onPrevSlide={previousSlide}
            onNextSlide={nextSlide}
            onNewSlide={(layout: string) => createSlide(layout)}
            onDuplicateSlide={duplicateSlide}
            onDeleteSlide={deleteSlide}
            canDeleteSlide={(currentPresentation.slides?.length || 0) > 1}
            isCurrentSlideSkipped={!!currentSlide?.slideProperties?.isSkipped}
            onToggleSkipSlide={toggleSkipSlide}
            onInsertText={addText}
            onInsertShape={(shape: InsertableShape) => addShape(shape)}
            onFindAndReplace={findAndReplace}
            selectedElement={selectedElementId
              ? (currentSlide?.pageElements?.find(e => e.objectId === selectedElementId) || null)
              : null}
            onDuplicateElement={duplicateSelectedElement}
            onDeleteElement={deleteSelectedElement}
            onEditElementProperties={() => {
              if (!selectedElementId) return
              const el = currentSlide?.pageElements?.find(e => e.objectId === selectedElementId)
              if (el) {
                setElementPropsDraft({
                  width: String(el.size?.width?.magnitude || 100),
                  height: String(el.size?.height?.magnitude || 50),
                  x: String(el.transform?.translateX || 0),
                  y: String(el.transform?.translateY || 0),
                  shapeType: el.shape?.shapeType || 'TEXT_BOX',
                })
              }
              setShowElementPropsDialog(true)
            }}
            onEditAltText={() => {
              if (!selectedElementId) return
              const el = currentSlide?.pageElements?.find(e => e.objectId === selectedElementId)
              const anyEl = el as Record<string, unknown> | undefined
              setAltTextDraft({
                title: String(anyEl?.title || ''),
                description: String(anyEl?.description || ''),
              })
              setShowAltTextDialog(true)
            }}
            onApplyTextStyle={applyTextStyle}
            onShowSlideInfo={getSlideDetail}
            onSummarize={summarizePresentation}
            onPresent={() => {
              setPresenterSlideIndex(currentSlideIndex)
              setViewMode('presenter')
            }}
          />
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-4 bg-[var(--bg-primary)] flex flex-col">
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm flex-shrink-0">
              {error}
              <button className="ml-2 text-red-300 hover:text-red-100" onClick={() => setError(null)}>x</button>
            </div>
          )}

          {!currentPresentation ? (
            <div className="h-full flex flex-col items-center justify-center text-[var(--text-secondary)]">
              <span className="text-6xl mb-4">{APP_NAME}</span>
              <p className="text-lg mb-2">No presentation selected</p>
              <p className="text-sm mb-4">Select a presentation from the sidebar or create a new one</p>
              <button
                className="px-4 py-2 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-colors"
                onClick={() => setShowCreateDialog(true)}
              >
                Create Presentation
              </button>
            </div>
          ) : viewMode === 'presenter' ? (
            <PresentationViewer
              slides={currentPresentation.slides || []}
              pageSize={currentPresentation.pageSize}
              startIndex={presenterSlideIndex}
              speakerNotes={speakerNotes}
              onExit={() => {
                setViewMode('editor')
                setCurrentSlideIndex(presenterSlideIndex)
              }}
              onSlideChange={setPresenterSlideIndex}
            />
          ) : viewMode === 'sorter' ? (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-[var(--text-primary)]">Slide Sorter</h2>
              <SlideSorterView
                slides={currentPresentation.slides || []}
                currentIndex={currentSlideIndex}
                onSelectSlide={goToSlide}
                onMoveSlide={(from, dir) => {
                  setCurrentSlideIndex(from)
                  setTimeout(() => moveSlide(dir), 0)
                }}
              />
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 overflow-auto">
              {/* Slide view */}
              <div className="flex-shrink-0 flex items-center justify-center" style={{ minHeight: '300px' }}>
                <SlideView
                  slide={currentSlide}
                  pageSize={currentPresentation.pageSize}
                  visibleElements={visibleElements}
                  selectedElementId={selectedElementId}
                  editingTextElementId={editingElementText ? selectedElementId : null}
                  onCommitTransform={commitElementTransform}
                  onCommitText={commitElementText}
                  onSelectElement={(id) => {
                    setSelectedElementId(id)
                    setEditingElementText(false)
                    if (id) {
                      const el = currentSlide?.pageElements?.find(e => e.objectId === id)
                      if (el) {
                        setElementPropsDraft({
                          width: String(el.size?.width?.magnitude || 100),
                          height: String(el.size?.height?.magnitude || 50),
                          x: String(el.transform?.translateX || 0),
                          y: String(el.transform?.translateY || 0),
                          shapeType: el.shape?.shapeType || 'TEXT_BOX',
                        })
                      }
                    }
                  }}
                  onDoubleClickElement={(id) => {
                    const el = currentSlide?.pageElements?.find(e => e.objectId === id)
                    if (el?.shape) {
                      setSelectedElementId(id)
                      setEditingElementText(true)
                    }
                  }}
                />
              </div>

              {/* Speaker notes panel */}
              <div className="flex-shrink-0 mt-2 border-t border-[var(--border-color)] pt-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">Speaker Notes</span>
                  {!editingNotes && (
                    <button
                      className="text-xs text-[var(--accent-color)] hover:underline"
                      onClick={() => {
                        setNotesDraft(speakerNotes[currentSlide?.objectId || ''] || '')
                        setEditingNotes(true)
                      }}
                    >
                      Edit
                    </button>
                  )}
                </div>
                {editingNotes ? (
                  <div className="flex gap-2">
                    <textarea
                      className="flex-1 px-2 py-1 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-color)] resize-none"
                      rows={2}
                      value={notesDraft}
                      onChange={e => setNotesDraft(e.target.value)}
                      placeholder="Add speaker notes..."
                      autoFocus
                    />
                    <div className="flex flex-col gap-1">
                      <button
                        className="px-3 py-1 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded text-xs"
                        onClick={saveSpeakerNotes}
                      >
                        Save
                      </button>
                      <button
                        className="px-3 py-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs"
                        onClick={() => setEditingNotes(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-[var(--text-secondary)] min-h-[1.5rem] px-2 py-1 bg-[var(--bg-tertiary)] rounded">
                    {speakerNotes[currentSlide?.objectId || ''] || '(No notes)'}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Presentation Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--bg-secondary)] rounded-lg p-6 w-96 border border-[var(--border-color)]">
            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-4">Create New Presentation</h2>
            <input
              type="text"
              className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-color)] mb-4"
              placeholder="Presentation title"
              value={newPresentationTitle}
              onChange={e => setNewPresentationTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  createPresentation()
                } else if (e.key === 'Escape') {
                  setShowCreateDialog(false)
                }
              }}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
                onClick={() => {
                  setShowCreateDialog(false)
                  setNewPresentationTitle('')
                }}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-colors disabled:opacity-40"
                onClick={createPresentation}
                disabled={creating || !newPresentationTitle.trim()}
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Element Properties Dialog */}
      {showElementPropsDialog && selectedElementId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--bg-secondary)] rounded-lg p-6 w-96 border border-[var(--border-color)]">
            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-4">Element Properties</h2>
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs text-[var(--text-secondary)]">Shape Type</label>
                <select
                  className="w-full px-2 py-1 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-sm text-[var(--text-primary)]"
                  value={elementPropsDraft.shapeType}
                  onChange={e => setElementPropsDraft(prev => ({ ...prev, shapeType: e.target.value }))}
                >
                  <option value="TEXT_BOX">Text Box</option>
                  {SHAPE_CATEGORIES.map(cat => (
                    <optgroup key={cat.id} label={cat.label}>
                      {cat.shapes.map(s => (
                        <option key={s.type} value={s.type}>{s.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-[var(--text-secondary)]">Width (pt)</label>
                  <input
                    className="w-full px-2 py-1 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-sm text-[var(--text-primary)]"
                    type="number"
                    value={elementPropsDraft.width}
                    onChange={e => setElementPropsDraft(prev => ({ ...prev, width: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-[var(--text-secondary)]">Height (pt)</label>
                  <input
                    className="w-full px-2 py-1 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-sm text-[var(--text-primary)]"
                    type="number"
                    value={elementPropsDraft.height}
                    onChange={e => setElementPropsDraft(prev => ({ ...prev, height: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-[var(--text-secondary)]">X Position (pt)</label>
                  <input
                    className="w-full px-2 py-1 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-sm text-[var(--text-primary)]"
                    type="number"
                    value={elementPropsDraft.x}
                    onChange={e => setElementPropsDraft(prev => ({ ...prev, x: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-[var(--text-secondary)]">Y Position (pt)</label>
                  <input
                    className="w-full px-2 py-1 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-sm text-[var(--text-primary)]"
                    type="number"
                    value={elementPropsDraft.y}
                    onChange={e => setElementPropsDraft(prev => ({ ...prev, y: e.target.value }))}
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
                onClick={() => setShowElementPropsDialog(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-colors"
                onClick={saveElementProps}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alt Text Dialog (updatePageElementAltText) */}
      {showAltTextDialog && selectedElementId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAltTextDialog(false)}>
          <div className="bg-[var(--bg-secondary)] rounded-lg p-6 w-96 border border-[var(--border-color)]" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-1">Alt text</h2>
            <p className="text-xs text-[var(--text-secondary)] mb-4">Used by screen readers to describe the selected element.</p>
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs text-[var(--text-secondary)]">Title</label>
                <input
                  type="text"
                  className="w-full mt-1 px-2 py-1 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-color)]"
                  value={altTextDraft.title}
                  onChange={e => setAltTextDraft(prev => ({ ...prev, title: e.target.value }))}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-[var(--text-secondary)]">Description</label>
                <textarea
                  className="w-full mt-1 px-2 py-1 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-color)] resize-none"
                  rows={3}
                  value={altTextDraft.description}
                  onChange={e => setAltTextDraft(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
                onClick={() => setShowAltTextDialog(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-colors"
                onClick={saveAltText}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slide Detail Dialog */}
      {showSlideDetailDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--bg-secondary)] rounded-lg p-6 w-full max-w-2xl border border-[var(--border-color)] max-h-[80vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-4">Slide Details</h2>
            {loadingSlideDetail ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-8 h-8 border-4 border-[var(--accent-color)]/30 border-t-[var(--accent-color)] rounded-full animate-spin" />
              </div>
            ) : slideDetail?.error ? (
              <p className="text-red-400 text-sm">{slideDetail.error}</p>
            ) : slideDetail ? (
              <div className="space-y-3">
                {slideDetail.objectId && (
                  <div>
                    <label className="text-xs font-medium text-[var(--text-secondary)]">Object ID</label>
                    <p className="text-sm text-[var(--text-primary)] font-mono">{slideDetail.objectId}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{slideDetail.objectId}]</span></p>
                  </div>
                )}
                {slideDetail.pageType && (
                  <div>
                    <label className="text-xs font-medium text-[var(--text-secondary)]">Page Type</label>
                    <p className="text-sm text-[var(--text-primary)]">{slideDetail.pageType}</p>
                  </div>
                )}
                {slideDetail.revisionId && (
                  <div>
                    <label className="text-xs font-medium text-[var(--text-secondary)]">Revision ID</label>
                    <p className="text-sm text-[var(--text-primary)] font-mono">{slideDetail.revisionId}</p>
                  </div>
                )}
                {slideDetail.pageElements && (
                  <div>
                    <label className="text-xs font-medium text-[var(--text-secondary)]">
                      Page Elements ({slideDetail.pageElements.length})
                    </label>
                    <div className="mt-2 space-y-2">
                      {slideDetail.pageElements.map((el: any, idx: number) => (
                        <div key={idx} className="p-2 bg-[var(--bg-tertiary)] rounded text-xs">
                          <p className="font-mono text-[var(--text-primary)]">{el.objectId}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{el.objectId}]</span></p>
                          <p className="text-[var(--text-secondary)]">
                            {el.shape ? `Shape: ${el.shape.shapeType || 'unknown'}` :
                             el.image ? 'Image' :
                             el.table ? `Table (${el.table.rows}x${el.table.columns})` :
                             'Element'}
                          </p>
                          {el.shape?.text?.textElements && (
                            <p className="text-[var(--text-primary)] mt-1 truncate">
                              {el.shape.text.textElements
                                .map((te: any) => te.textRun?.content || '')
                                .join('')
                                .trim() || '(empty)'}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {slideDetail.slideProperties && (
                  <div>
                    <label className="text-xs font-medium text-[var(--text-secondary)]">Slide Properties</label>
                    <pre className="text-xs text-[var(--text-primary)] bg-[var(--bg-tertiary)] p-2 rounded mt-1 overflow-x-auto">
                      {JSON.stringify(slideDetail.slideProperties, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ) : null}
            <div className="flex justify-end mt-4">
              <button
                className="px-4 py-2 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-colors"
                onClick={() => setShowSlideDetailDialog(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary Dialog */}
      {showSummaryDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--bg-secondary)] rounded-lg p-6 w-full max-w-2xl border border-[var(--border-color)] max-h-[80vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-4">Presentation Summary</h2>
            {loadingSummary ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-8 h-8 border-4 border-[var(--accent-color)]/30 border-t-[var(--accent-color)] rounded-full animate-spin" />
              </div>
            ) : summary?.error ? (
              <p className="text-red-400 text-sm">{summary.error}</p>
            ) : summary ? (
              <div className="space-y-4">
                {summary.title && (
                  <div>
                    <label className="text-xs font-medium text-[var(--text-secondary)]">Title</label>
                    <p className="text-lg text-[var(--text-primary)] font-medium">{summary.title}</p>
                  </div>
                )}
                {summary.slideCount !== undefined && (
                  <div>
                    <label className="text-xs font-medium text-[var(--text-secondary)]">Total Slides</label>
                    <p className="text-sm text-[var(--text-primary)]">{summary.slideCount}</p>
                  </div>
                )}
                {summary.lastModified && (
                  <div>
                    <label className="text-xs font-medium text-[var(--text-secondary)]">Last Modified</label>
                    <p className="text-sm text-[var(--text-primary)] font-mono">{summary.lastModified}</p>
                  </div>
                )}
                {summary.slides && summary.slides.length > 0 && (
                  <div>
                    <label className="text-xs font-medium text-[var(--text-secondary)]">Slides</label>
                    <div className="mt-2 space-y-3">
                      {summary.slides.map((slide: any, idx: number) => (
                        <div key={idx} className="p-3 bg-[var(--bg-tertiary)] rounded-lg">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-mono text-[var(--text-secondary)]">
                              Slide {slide.slideNumber || idx + 1}
                            </span>
                            {slide.slideId && (
                              <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>
                                [{slide.slideId}]
                              </span>
                            )}
                          </div>
                          {slide.content ? (
                            <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">
                              {slide.content}
                            </p>
                          ) : (
                            <p className="text-sm text-[var(--text-secondary)] italic">(No text content)</p>
                          )}
                          {slide.notes && (
                            <div className="mt-2 pt-2 border-t border-[var(--border-color)]">
                              <span className="text-xs text-[var(--text-secondary)]">Notes:</span>
                              <p className="text-sm text-[var(--text-primary)]">{slide.notes}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
            <div className="flex justify-end mt-4">
              <button
                className="px-4 py-2 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-colors"
                onClick={() => setShowSummaryDialog(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Slide Sorter View Component
function SlideSorterView({
  slides,
  currentIndex,
  onSelectSlide,
  onMoveSlide,
}: {
  slides: Slide[]
  currentIndex: number
  onSelectSlide: (index: number) => void
  onMoveSlide: (fromIndex: number, direction: 'up' | 'down') => void
}) {
  return (
    <div className="flex flex-wrap gap-4">
      {slides.map((slide, index) => (
        <div key={slide.objectId} className="flex flex-col items-center gap-1">
          <button
            className={`relative rounded-lg border-2 transition-all ${
              index === currentIndex
                ? 'border-[var(--accent-color)] ring-2 ring-[var(--accent-color)]/20'
                : 'border-[var(--border-color)] hover:border-[var(--accent-color)]/50'
            }`}
            onClick={() => onSelectSlide(index)}
          >
            <div className="w-48 h-36 bg-white rounded flex flex-col items-center justify-center text-xs text-gray-500 overflow-hidden p-2">
              {slide.pageElements?.filter(el => (el.transform?.translateX ?? 0) >= 0 && (el.transform?.translateY ?? 0) >= 0).slice(0, 3).map(el => (
                <span key={el.objectId} className="truncate block text-[10px]">
                  {getElementText(el).slice(0, 30) || (el.shape ? `[${el.shape.shapeType}]` : el.image ? '[Image]' : '')}
                </span>
              ))}
              {(!slide.pageElements || slide.pageElements.length === 0) && (
                <span>Slide {index + 1}</span>
              )}
            </div>
            <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs py-1 px-2 rounded-b">
              {index + 1}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{slide.objectId}]</span>
            </div>
          </button>
          {/* Reorder buttons in sorter view */}
          <div className="flex gap-1">
            <button
              className="text-xs px-2 py-0.5 bg-[var(--bg-tertiary)] hover:bg-[var(--accent-color)] text-[var(--text-secondary)] hover:text-white rounded disabled:opacity-30 transition-colors"
              onClick={() => onMoveSlide(index, 'up')}
              disabled={index === 0}
              title="Move Left"
            >
              &larr;
            </button>
            <button
              className="text-xs px-2 py-0.5 bg-[var(--bg-tertiary)] hover:bg-[var(--accent-color)] text-[var(--text-secondary)] hover:text-white rounded disabled:opacity-30 transition-colors"
              onClick={() => onMoveSlide(index, 'down')}
              disabled={index === slides.length - 1}
              title="Move Right"
            >
              &rarr;
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// Presentation Viewer Component for viewing slides with transitions
function PresentationViewer({
  slides,
  pageSize,
  startIndex,
  speakerNotes,
  onExit,
  onSlideChange,
}: {
  slides: Slide[]
  pageSize?: PageSize
  startIndex: number
  speakerNotes: Record<string, string>
  onExit: () => void
  onSlideChange: (index: number) => void
}) {
  const [currentIndex, setCurrentIndex] = useState(startIndex)
  const [transitioning, setTransitioning] = useState(false)
  const [transitionStyle, setTransitionStyle] = useState<React.CSSProperties>({})
  const [showNotes, setShowNotes] = useState(false)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => { timersRef.current.forEach(clearTimeout) }
  }, [])

  // Memoize to avoid recalculating on every render
  const activeSlideIndices = useMemo(() =>
    slides
      .map((slide, idx) => ({ slide, idx }))
      .filter(({ slide }) => !slide.slideProperties?.isSkipped)
      .map(({ idx }) => idx),
    [slides]
  )

  const activePos = activeSlideIndices.indexOf(currentIndex)
  const currentSlide = slides[currentIndex]

  // Get transition type for a slide
  const getTransitionType = (slide: Slide): string => {
    const transMetaId = `trans_${slide.objectId}`.slice(0, 50)
    const metaEl = slide.pageElements?.find(el => el.objectId === transMetaId)
    return (metaEl as any)?.description || 'NONE'
  }

  // Map transition types directly to CSS styles
  const transitionStyles: Record<string, React.CSSProperties> = {
    'FADE': { opacity: 0 },
    'SLIDE_FROM_RIGHT': { transform: 'translateX(100%)' },
    'SLIDE_FROM_LEFT': { transform: 'translateX(-100%)' },
    'FLIP': { transform: 'perspective(1000px) rotateY(90deg)' },
    'CUBE': { transform: 'translateX(100%)' },
    'GALLERY': { transform: 'scale(0.75)', opacity: 0 },
  }

  const navigateSlide = useCallback((direction: 'next' | 'prev') => {
    if (transitioning) return
    const newPos = direction === 'next' ? activePos + 1 : activePos - 1
    if (newPos < 0 || newPos >= activeSlideIndices.length) return

    const targetIndex = activeSlideIndices[newPos]
    const targetSlide = slides[targetIndex]
    const transType = direction === 'next' ? getTransitionType(targetSlide) : 'NONE'

    if (transType !== 'NONE' && transType !== 'SKIP') {
      setTransitioning(true)
      setTransitionStyle(transitionStyles[transType] || { opacity: 0 })
      const t1 = setTimeout(() => {
        setCurrentIndex(targetIndex)
        onSlideChange(targetIndex)
        setTransitionStyle({})
        const t2 = setTimeout(() => setTransitioning(false), 300)
        timersRef.current.push(t2)
      }, 300)
      timersRef.current.push(t1)
    } else {
      setCurrentIndex(targetIndex)
      onSlideChange(targetIndex)
    }
  }, [activePos, activeSlideIndices, transitioning, slides, onSlideChange])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onExit(); return }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault()
        navigateSlide('next')
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        navigateSlide('prev')
      }
      if (e.key === 'n' || e.key === 'N') {
        setShowNotes(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onExit, navigateSlide])

  if (!currentSlide) return null

  const bgColor = getSlideBgColor(currentSlide)
  const visibleElements = currentSlide.pageElements?.filter(isUserVisibleElement) || []
  const notes = speakerNotes[currentSlide.objectId] || ''
  const slideNum = activePos + 1
  const totalSlides = activeSlideIndices.length

  const slideStyle: React.CSSProperties = {
    transition: 'all 0.3s ease-in-out',
    ...transitionStyle,
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col" onClick={() => navigateSlide('next')}>
      {/* Slide content */}
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <PresenterStage
          bgColor={bgColor}
          slideStyle={slideStyle}
          pageSize={pageSize}
          visibleElements={visibleElements}
        />
      </div>

      {/* Speaker notes overlay */}
      {showNotes && notes && (
        <div className="absolute bottom-16 left-4 right-4 bg-black/80 text-white p-4 rounded-lg max-h-[20vh] overflow-auto" onClick={e => e.stopPropagation()}>
          <div className="text-xs font-medium text-gray-400 mb-1">Speaker Notes</div>
          <div className="text-sm whitespace-pre-wrap">{notes}</div>
        </div>
      )}

      {/* Controls bar */}
      <div className="h-12 bg-black/90 flex items-center justify-between px-4 text-white" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <button
            className="px-3 py-1 text-sm hover:bg-white/20 rounded transition-colors"
            onClick={onExit}
          >
            Exit
          </button>
          <button
            className="px-2 py-1 text-sm hover:bg-white/20 rounded transition-colors disabled:opacity-30"
            onClick={() => navigateSlide('prev')}
            disabled={activePos <= 0}
          >
            Prev
          </button>
          <span className="text-sm text-gray-300">{slideNum} / {totalSlides}</span>
          <button
            className="px-2 py-1 text-sm hover:bg-white/20 rounded transition-colors disabled:opacity-30"
            onClick={() => navigateSlide('next')}
            disabled={activePos >= totalSlides - 1}
          >
            Next
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button
            className={`px-2 py-1 text-sm rounded transition-colors ${showNotes ? 'bg-white/20' : 'hover:bg-white/20'}`}
            onClick={() => setShowNotes(prev => !prev)}
          >
            Notes {showNotes ? 'On' : 'Off'}
          </button>
          <span className="text-xs text-gray-500">Esc to exit | Arrow keys to navigate | N for notes</span>
        </div>
      </div>
    </div>
  )
}

// Presenter stage: fits a natural-sized slide into available viewport area
function PresenterStage({
  bgColor,
  slideStyle,
  pageSize,
  visibleElements,
}: {
  bgColor: string
  slideStyle: React.CSSProperties
  pageSize?: PageSize
  visibleElements: PageElement[]
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  const natural = useMemo(() => getNaturalSlideSize(pageSize), [pageSize])

  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const scale = size.width > 0 && size.height > 0
    ? Math.min(size.width / natural.width, size.height / natural.height)
    : 1
  const fittedWidth = natural.width * scale
  const fittedHeight = natural.height * scale

  return (
    <div ref={wrapperRef} className="w-[95vw] h-[85vh] flex items-center justify-center">
      <div
        className="relative"
        style={{
          width: `${fittedWidth}px`,
          height: `${fittedHeight}px`,
          backgroundColor: bgColor,
          ...slideStyle,
        }}
      >
        <div
          style={{
            width: `${natural.width}px`,
            height: `${natural.height}px`,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            position: 'relative',
          }}
        >
          {visibleElements.map(element => (
            <PresenterElement key={element.objectId} element={element} />
          ))}
          {visibleElements.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-xl">
              Empty slide
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Presenter mode element renderer (read-only, no selection)
function PresenterElement({ element }: { element: PageElement }) {
  const style: React.CSSProperties = {
    position: 'absolute',
    left: element.transform?.translateX != null
      ? toCssPx(element.transform.translateX, element.transform.unit)
      : 0,
    top: element.transform?.translateY != null
      ? toCssPx(element.transform.translateY, element.transform.unit)
      : 0,
    width: element.size?.width?.magnitude != null
      ? toCssPx(element.size.width.magnitude, element.size.width.unit)
      : 'auto',
    height: element.size?.height?.magnitude != null
      ? toCssPx(element.size.height.magnitude, element.size.height.unit)
      : 'auto',
    transform: `scale(${element.transform?.scaleX || 1}, ${element.transform?.scaleY || 1})`,
    transformOrigin: 'top left',
  }

  if (element.shape) {
    const textContent = getElementText(element)
    const shapeType = element.shape.shapeType?.toUpperCase()
    const isEllipse = shapeType === 'ELLIPSE'
    const borderRadius = isEllipse ? '50%' : shapeType === 'ROUND_RECTANGLE' ? '8px' : undefined

    const firstTextEl = element.shape.text?.textElements?.[0]?.textRun?.style
    const textStyle: React.CSSProperties = {}
    if (firstTextEl?.bold) textStyle.fontWeight = 'bold'
    if (firstTextEl?.italic) textStyle.fontStyle = 'italic'
    if (firstTextEl?.underline) textStyle.textDecoration = 'underline'
    if (firstTextEl?.fontSize?.magnitude) textStyle.fontSize = `${firstTextEl.fontSize.magnitude}pt`
    if (firstTextEl?.fontFamily) textStyle.fontFamily = firstTextEl.fontFamily
    const fgColor = firstTextEl?.foregroundColor?.opaqueColor?.rgbColor
    if (fgColor) {
      textStyle.color = rgbColorToString(fgColor)
    }

    return (
      <div style={style}>
        <div className="w-full h-full p-2 flex items-center justify-center overflow-hidden" style={{ borderRadius }}>
          <div className="text-sm text-center w-full break-words" style={{ color: textStyle.color || 'black', ...textStyle }}>
            {textContent || ''}
          </div>
        </div>
      </div>
    )
  }

  if (element.image) {
    return (
      <div style={style}>
        <div className="w-full h-full flex items-center justify-center overflow-hidden">
          {element.image.sourceUrl || element.image.contentUrl ? (
            <img
              src={element.image.sourceUrl || element.image.contentUrl}
              alt="Slide image"
              className="w-full h-full object-contain"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          ) : (
            <span className="text-gray-400 text-xs">Image</span>
          )}
        </div>
      </div>
    )
  }

  if (element.table) {
    return (
      <div style={style}>
        <div className="w-full h-full p-2 overflow-hidden">
          <div className="text-xs text-gray-600">
            Table ({element.table.rows || 0} x {element.table.columns || 0})
          </div>
        </div>
      </div>
    )
  }

  return null
}
