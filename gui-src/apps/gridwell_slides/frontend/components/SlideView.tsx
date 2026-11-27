import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragHandle, DragMode, DragState, ElementGeom, PageElement, PageSize, Slide } from '../slideTypes'
import {
  applyDrag,
  clampGeomToSlide,
  getElementGeom,
  getElementText,
  getNaturalSlideSize,
  getSlideBgColor,
  rgbColorToString,
} from '../slideHelpers'

interface SlideViewProps {
  slide: Slide | undefined
  pageSize?: PageSize
  visibleElements: PageElement[]
  selectedElementId: string | null
  editingTextElementId: string | null
  onSelectElement: (id: string | null) => void
  onDoubleClickElement: (id: string) => void
  onCommitTransform: (objectId: string, geom: ElementGeom) => Promise<void>
  onCommitText: (objectId: string, text: string) => void
}

// Renders a single slide at its natural size and scales it to fit the
// container. Handles selection, double-click to edit, drag-to-move, and 8-handle
// resize for shape elements. Image and table elements are read-only here
// because the batch update API has no recreate path for them.
export default function SlideView({
  slide,
  pageSize,
  visibleElements,
  selectedElementId,
  editingTextElementId,
  onSelectElement,
  onDoubleClickElement,
  onCommitTransform,
  onCommitText,
}: SlideViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [override, setOverride] = useState<ElementGeom | null>(null)

  const natural = useMemo(() => getNaturalSlideSize(pageSize), [pageSize])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setContainerWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const scale = containerWidth > 0 ? containerWidth / natural.width : 1
  const scaleRef = useRef(scale)
  scaleRef.current = scale

  // Global mouse listeners while a drag is in progress.
  useEffect(() => {
    if (!drag) return
    const handleMove = (e: MouseEvent) => {
      const dx = (e.clientX - drag.startClientX) / scaleRef.current
      const dy = (e.clientY - drag.startClientY) / scaleRef.current
      // Clamp so the element keeps at least MIN_VISIBLE_PX overlapping the
      // slide. Without this, dragging past the slide edge would carry the
      // element off-canvas — and releasing the mouse there commits that
      // position, leaving the user with what looks like a vanished element.
      setOverride(clampGeomToSlide(applyDrag(drag.mode, drag.start, dx, dy), natural))
    }
    const handleUp = () => {
      setOverride(current => {
        if (current) onCommitTransform(drag.objectId, current).catch(() => {})
        return null
      })
      setDrag(null)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    const prevUserSelect = document.body.style.userSelect
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      document.body.style.userSelect = prevUserSelect
    }
  }, [drag, onCommitTransform])

  const startDrag = (e: React.MouseEvent, element: PageElement, mode: DragMode) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    setDrag({
      objectId: element.objectId,
      mode,
      startClientX: e.clientX,
      startClientY: e.clientY,
      start: getElementGeom(element),
    })
    setOverride(null)
  }

  if (!slide) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--text-secondary)]">
        <p>No slide selected</p>
      </div>
    )
  }

  const bgStyle = { backgroundColor: getSlideBgColor(slide) }
  const selectedElement = selectedElementId
    ? visibleElements.find(el => el.objectId === selectedElementId)
    : undefined
  const selectedGeom = selectedElement
    ? (drag?.objectId === selectedElement.objectId && override ? override : getElementGeom(selectedElement))
    : null

  return (
    <div className="h-full flex items-center justify-center w-full" onClick={() => onSelectElement(null)}>
      <div
        ref={containerRef}
        className="w-full max-w-4xl rounded-lg shadow-lg border border-[var(--border-color)] overflow-hidden relative"
        style={{ ...bgStyle, aspectRatio: `${natural.width} / ${natural.height}` }}
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
          {visibleElements.length > 0 ? (
            visibleElements.map(element => {
              const editing = element.objectId === editingTextElementId
              return (
                <SlideElement
                  key={element.objectId}
                  element={element}
                  overrideGeom={drag?.objectId === element.objectId ? override : null}
                  isSelected={element.objectId === selectedElementId}
                  isEditingText={editing}
                  onSelect={() => onSelectElement(element.objectId)}
                  onMouseDown={element.shape && !editing ? (e) => {
                    onSelectElement(element.objectId)
                    startDrag(e, element, 'move')
                  } : undefined}
                  onDoubleClick={() => onDoubleClickElement(element.objectId)}
                  onCommitText={(text) => onCommitText(element.objectId, text)}
                />
              )
            })
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-gray-500 font-medium">
              <p>Empty slide</p>
            </div>
          )}

          {selectedElement && selectedElement.shape && selectedGeom && (
            <ResizeHandles
              geom={selectedGeom}
              scale={scale}
              onHandleMouseDown={(e, handle) => startDrag(e, selectedElement, handle)}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// Element renderer. Falls back to data-derived geometry when no live drag
// override is provided.
function SlideElement({
  element,
  overrideGeom,
  isSelected,
  isEditingText,
  onSelect,
  onMouseDown,
  onDoubleClick,
  onCommitText,
}: {
  element: PageElement
  overrideGeom?: ElementGeom | null
  isSelected: boolean
  isEditingText: boolean
  onSelect: () => void
  onMouseDown?: (e: React.MouseEvent) => void
  onDoubleClick: () => void
  onCommitText: (text: string) => void
}) {
  const geom = overrideGeom || getElementGeom(element)
  const isShape = !!element.shape
  const style: React.CSSProperties = {
    position: 'absolute',
    left: `${geom.left}px`,
    top: `${geom.top}px`,
    width: `${geom.width}px`,
    height: `${geom.height}px`,
    transform: `scale(${element.transform?.scaleX || 1}, ${element.transform?.scaleY || 1})`,
    transformOrigin: 'top left',
    cursor: isSelected ? 'move' : (isShape ? 'pointer' : 'default'),
  }

  const selectedClass = isSelected
    ? 'ring-2 ring-teal-500 border-teal-500'
    : 'border-transparent group-hover:border-teal-400'

  if (element.shape) {
    const textContent = getElementText(element)
    const shapeType = element.shape.shapeType?.toUpperCase()
    const isEllipse = shapeType === 'ELLIPSE'
    const borderRadius = isEllipse ? '50%' : shapeType === 'ROUND_RECTANGLE' ? '8px' : undefined

    const firstTextEl = element.shape.text?.textElements?.[0]?.textRun?.style
    // Slides API carries several fields on textRun.style (weightedFontFamily,
    // backgroundColor, strikethrough, smallCaps, baselineOffset, link) that
    // the local TS type doesn't model. Cast through `unknown` so we can read
    // them without expanding the shared type surface.
    const styleExt = firstTextEl as Record<string, unknown> | undefined
    const textStyle: React.CSSProperties = {}
    if (firstTextEl?.bold) textStyle.fontWeight = 'bold'
    if (firstTextEl?.italic) textStyle.fontStyle = 'italic'
    if (firstTextEl?.fontSize?.magnitude) textStyle.fontSize = `${firstTextEl.fontSize.magnitude}pt`
    if (firstTextEl?.fontFamily) textStyle.fontFamily = firstTextEl.fontFamily
    // weightedFontFamily.weight overrides the legacy `bold` flag per the
    // Slides API; the toolbar's weight selector writes here, so without this
    // the canvas would silently ignore weight changes.
    const weightedFont = styleExt?.weightedFontFamily as { fontFamily?: string; weight?: number } | undefined
    if (weightedFont?.weight) textStyle.fontWeight = weightedFont.weight
    if (weightedFont?.fontFamily) textStyle.fontFamily = weightedFont.fontFamily
    const fgColor = firstTextEl?.foregroundColor?.opaqueColor?.rgbColor
    if (fgColor) textStyle.color = rgbColorToString(fgColor)
    const bgColor = (styleExt?.backgroundColor as
      { opaqueColor?: { rgbColor?: { red?: number; green?: number; blue?: number } } } | undefined
    )?.opaqueColor?.rgbColor
    const bgColorCss = bgColor ? rgbColorToString(bgColor) : undefined
    // underline + strikethrough share the `text-decoration` property, so
    // build a space-separated list to let either be toggled independently
    // without clobbering the other. A link also reads as underlined per
    // conventional hyperlink rendering.
    const isStrikethrough = !!styleExt?.strikethrough
    const linkUrl = (styleExt?.link as { url?: string } | undefined)?.url
    const decorations: string[] = []
    if (firstTextEl?.underline || linkUrl) decorations.push('underline')
    if (isStrikethrough) decorations.push('line-through')
    if (decorations.length > 0) textStyle.textDecoration = decorations.join(' ')
    if (styleExt?.smallCaps) textStyle.fontVariant = 'small-caps'
    // Link visually overrides the user's color with the standard hyperlink
    // blue (matches Slides/Docs behavior). The full URL is exposed via the
    // wrapping span's title attr below.
    if (linkUrl) textStyle.color = '#2563eb'
    const baselineOffset = styleExt?.baselineOffset as string | undefined

    return (
      <div
        style={style}
        className="group"
        onMouseDown={onMouseDown}
        onClick={e => { e.stopPropagation(); onSelect() }}
        onDoubleClick={e => { e.stopPropagation(); onDoubleClick() }}
      >
        <div
          className={`w-full h-full p-2 bg-white/50 border ${selectedClass} group-hover:bg-white/80 transition-colors flex items-center justify-center overflow-hidden`}
          style={{ borderRadius, position: 'relative' }}
        >
          {isEditingText ? (
            <ShapeTextEditor
              initialText={textContent}
              textStyle={textStyle}
              onCommit={onCommitText}
            />
          ) : (
            // whiteSpace: pre-wrap preserves the newlines that live inside a
            // single textRun.content (e.g. multi-line bulleted bodies). Without
            // it, HTML collapses runs of whitespace, so "• A\n• B" renders as
            // "• A • B" and the bullets visually concatenate into one line.
            <div
              className="text-sm text-black text-center w-full break-words"
              style={{ ...textStyle, whiteSpace: 'pre-wrap' }}
            >
              {textContent ? (
                renderStyledText(textContent, { baselineOffset, bgColorCss, linkUrl })
              ) : (
                <span className="text-gray-400">Empty shape</span>
              )}
            </div>
          )}
          <span style={ID_LABEL_STYLE}>[{element.objectId}]</span>
        </div>
      </div>
    )
  }

  if (element.image) {
    return (
      <div
        style={style}
        className="group"
        onMouseDown={onMouseDown}
        onClick={e => { e.stopPropagation(); onSelect() }}
      >
        <div className={`w-full h-full bg-gray-200 border ${selectedClass} flex items-center justify-center text-xs text-gray-400 overflow-hidden`} style={{ position: 'relative' }}>
          {element.image.sourceUrl || element.image.contentUrl ? (
            <img
              src={element.image.sourceUrl || element.image.contentUrl}
              alt="Slide image"
              className="w-full h-full object-contain"
              draggable={false}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          ) : (
            'Image'
          )}
          <span style={ID_LABEL_STYLE}>[{element.objectId}]</span>
        </div>
      </div>
    )
  }

  if (element.table) {
    return (
      <div
        style={style}
        className="group"
        onMouseDown={onMouseDown}
        onClick={e => { e.stopPropagation(); onSelect() }}
      >
        <div className={`w-full h-full bg-white/50 border border-gray-200 ${selectedClass} p-2 overflow-hidden`} style={{ position: 'relative' }}>
          <div className="text-[10px] text-gray-600">
            Table ({element.table.rows || 0} x {element.table.columns || 0})
          </div>
          <span style={ID_LABEL_STYLE}>[{element.objectId}]</span>
        </div>
      </div>
    )
  }

  return null
}

// Layer inline wrappers around the raw text content. Order matters: baseline
// offset is innermost (sup/sub uses smaller text), highlight is in the middle
// so the bg hugs the shifted glyphs, and the link's hover title wraps
// everything so any part of the visible text reveals the URL on hover.
function renderStyledText(
  content: string,
  opts: { baselineOffset?: string; bgColorCss?: string; linkUrl?: string },
): React.ReactNode {
  let node: React.ReactNode = content
  if (opts.baselineOffset === 'SUPERSCRIPT') node = <sup>{node}</sup>
  else if (opts.baselineOffset === 'SUBSCRIPT') node = <sub>{node}</sub>
  if (opts.bgColorCss) {
    node = (
      <span
        style={{
          backgroundColor: opts.bgColorCss,
          // box-decoration-break: clone makes each visual line carry its own
          // highlight, matching Slides' multi-line highlight rendering.
          boxDecorationBreak: 'clone',
          WebkitBoxDecorationBreak: 'clone',
          padding: '0 2px',
        }}
      >
        {node}
      </span>
    )
  }
  if (opts.linkUrl) {
    // Render as a styled span (not <a>) so canvas double-click-to-edit still
    // works — hover exposes the URL through the title attr.
    node = <span title={opts.linkUrl} style={{ cursor: 'help' }}>{node}</span>
  }
  return node
}

// Inline contentEditable rendered inside a shape while editing its text.
// We deliberately use a `contentEditable` div instead of a <textarea> so the
// editing surface inherits every layout property (font, size, weight, color,
// alignment, line-height, flex centering from the parent) from the *exact*
// same className/style stack used by the read-only renderer. A textarea has
// user-agent defaults that subtly shift baseline and break centering, which
// caused text to jump on entering/exiting edit mode.
function ShapeTextEditor({
  initialText,
  textStyle,
  onCommit,
  onCancel,
}: {
  initialText: string
  textStyle: React.CSSProperties
  onCommit: (text: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const committedRef = useRef(false)

  // Set initial content and select all once on mount. We don't render the
  // text through JSX because React would then race against contentEditable
  // mutations on every keystroke.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.textContent = initialText
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const commit = () => {
    if (committedRef.current) return
    committedRef.current = true
    // innerText preserves user-entered newlines; textContent collapses them.
    const next = (ref.current?.innerText ?? '').replace(/\r\n/g, '\n')
    onCommit(next)
  }

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      className="text-sm text-black text-center w-full break-words outline-none cursor-text"
      // whiteSpace: pre-wrap is required for two reasons:
      //   1. Seeding via textContent leaves any embedded "\n" invisible — the
      //      editor would open showing collapsed text that doesn't match the
      //      canvas, surprising users mid-edit.
      //   2. innerText reads back the *visible* layout; if newlines aren't
      //      rendered, innerText silently strips them on commit, destroying
      //      the original line breaks (every multi-line bulleted body in the
      //      stock decks would be flattened on first edit).
      style={{ ...textStyle, whiteSpace: 'pre-wrap' }}
      onBlur={commit}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
      onKeyDown={e => {
        // Both Enter and Escape commit. Cancel-on-Escape would discard text
        // the user typed, which surprised users coming from in-place editors
        // like GridwellSlides where clicking away saves. Shift+Enter inserts
        // a literal newline.
        if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) {
          e.preventDefault()
          commit()
        }
        e.stopPropagation()
      }}
    />
  )
}

const ID_LABEL_STYLE: React.CSSProperties = {
  position: 'absolute',
  bottom: '1px',
  right: '2px',
  fontSize: '9px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  color: 'var(--text-tertiary, #888)',
  opacity: 0.7,
  pointerEvents: 'none',
}

// 8 resize handles around the selected element. Sizes inversely scale with the
// canvas scale so they stay visually constant regardless of zoom.
function ResizeHandles({ geom, scale, onHandleMouseDown }: {
  geom: ElementGeom
  scale: number
  onHandleMouseDown: (e: React.MouseEvent, handle: DragHandle) => void
}) {
  const size = 10 / scale
  const half = size / 2
  const border = 1 / scale
  const handles: { handle: DragHandle; x: number; y: number; cursor: string }[] = [
    { handle: 'nw', x: geom.left, y: geom.top, cursor: 'nwse-resize' },
    { handle: 'n', x: geom.left + geom.width / 2, y: geom.top, cursor: 'ns-resize' },
    { handle: 'ne', x: geom.left + geom.width, y: geom.top, cursor: 'nesw-resize' },
    { handle: 'e', x: geom.left + geom.width, y: geom.top + geom.height / 2, cursor: 'ew-resize' },
    { handle: 'se', x: geom.left + geom.width, y: geom.top + geom.height, cursor: 'nwse-resize' },
    { handle: 's', x: geom.left + geom.width / 2, y: geom.top + geom.height, cursor: 'ns-resize' },
    { handle: 'sw', x: geom.left, y: geom.top + geom.height, cursor: 'nesw-resize' },
    { handle: 'w', x: geom.left, y: geom.top + geom.height / 2, cursor: 'ew-resize' },
  ]
  return (
    <>
      {handles.map(h => (
        <div
          key={h.handle}
          style={{
            position: 'absolute',
            left: `${h.x - half}px`,
            top: `${h.y - half}px`,
            width: `${size}px`,
            height: `${size}px`,
            backgroundColor: '#ffffff',
            border: `${border}px solid #14B8A6`,
            boxSizing: 'border-box',
            cursor: h.cursor,
            zIndex: 20,
          }}
          onMouseDown={(e) => onHandleMouseDown(e, h.handle)}
          onClick={(e) => e.stopPropagation()}
        />
      ))}
    </>
  )
}
