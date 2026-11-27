import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Baseline,
  Bold,
  CaseSensitive,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Highlighter,
  Italic,
  Link,
  Play,
  Settings,
  Square,
  Strikethrough,
  Subscript,
  Superscript,
  Trash2,
  Type,
  Underline,
} from 'lucide-react'
import type { PageElement, ViewMode } from '../slideTypes'
import {
  FONT_FAMILIES,
  FONT_SIZES,
  FONT_WEIGHTS,
  PREDEFINED_LAYOUTS,
  SHAPE_CATEGORIES,
  type ShapeType,
} from '../slideShapeCatalog'
import { rgbColorToString } from '../slideHelpers'

// Re-export for back-compat with callers that imported InsertableShape from here.
export type InsertableShape = ShapeType

// All text-style fields the backend exposes via updateTextStyle. The dispatch
// callback collects whichever subset the caller wants to update; the parent
// translates it into a batchUpdate request with the matching field mask.
export interface TextStylePatch {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  smallCaps?: boolean
  baselineOffset?: 'NONE' | 'SUBSCRIPT' | 'SUPERSCRIPT'
  fontFamily?: string
  fontSize?: number // PT
  foregroundColor?: { red: number; green: number; blue: number } | null
  backgroundColor?: { red: number; green: number; blue: number } | null
  link?: { url: string } | null
  weightedFontFamily?: { fontFamily: string; weight: number } | null
}

export interface SlideToolbarProps {
  // Title & slide indicator
  title: string
  presentationId: string
  currentSlideIndex: number
  totalSlides: number
  onRename: (newTitle: string) => void

  // View mode
  viewMode: ViewMode
  onSetViewMode: (mode: ViewMode) => void

  // Slide navigation
  onPrevSlide: () => void
  onNextSlide: () => void

  // Slide operations
  onNewSlide: (predefinedLayout: string) => void
  onDuplicateSlide: () => void
  onDeleteSlide: () => void
  canDeleteSlide: boolean

  // Slide properties (updateSlideProperties)
  isCurrentSlideSkipped: boolean
  onToggleSkipSlide: () => void

  // Insert (createShape)
  onInsertText: () => void
  onInsertShape: (shape: ShapeType) => void

  // Find & Replace (replaceAllText)
  onFindAndReplace: (find: string, replace: string, opts: { matchCase: boolean; regex: boolean; allSlides: boolean }) => Promise<void> | void

  // Selected-element context
  selectedElement: PageElement | null
  onDuplicateElement: () => void
  onDeleteElement: () => void
  onEditElementProperties: () => void
  onEditAltText: () => void
  onApplyTextStyle: (patch: TextStylePatch) => void

  // Misc
  onShowSlideInfo: () => void
  onSummarize: () => void
  onPresent: () => void
}

export default function SlideToolbar(props: SlideToolbarProps) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(props.title)
  const titleRef = useRef<string>(props.title)
  const [showFindReplace, setShowFindReplace] = useState(false)

  useEffect(() => {
    if (!editingTitle) {
      titleRef.current = props.title
      setTitleDraft(props.title)
    }
  }, [props.title, editingTitle])

  const startEditingTitle = () => {
    setTitleDraft(props.title)
    setEditingTitle(true)
  }
  const commitTitle = () => {
    const next = titleDraft.trim()
    setEditingTitle(false)
    if (next && next !== titleRef.current) props.onRename(next)
  }

  const slideLabel = props.totalSlides > 0
    ? `${props.currentSlideIndex + 1} / ${props.totalSlides}`
    : '0 / 0'

  const hasSelection = !!props.selectedElement

  return (
    <div className="bg-[var(--bg-secondary)] border-b border-[var(--border-color)] px-4 pt-2 flex flex-col gap-2 flex-shrink-0">
      {/* Title row */}
      <div className="flex items-center gap-2">
        {editingTitle ? (
          <input
            className="px-2 py-0.5 bg-[var(--bg-tertiary)] border border-[var(--accent-color)] rounded text-[var(--text-primary)] text-sm focus:outline-none max-w-[300px]"
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={e => {
              if (e.key === 'Enter') commitTitle()
              if (e.key === 'Escape') setEditingTitle(false)
            }}
            autoFocus
          />
        ) : (
          <span
            className="font-medium text-[var(--text-primary)] cursor-pointer hover:bg-[var(--bg-tertiary)] px-2 py-0.5 rounded truncate max-w-[300px]"
            onClick={startEditingTitle}
            title="Click to rename"
          >
            {props.title || 'Untitled Presentation'}
            <span style={ID_BADGE_STYLE}>[{props.presentationId}]</span>
          </span>
        )}
        <span className="text-sm text-[var(--text-secondary)] flex-shrink-0">({slideLabel})</span>
        {props.isCurrentSlideSkipped && (
          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 bg-amber-500/15 text-amber-300 rounded">Skipped</span>
        )}
      </div>

      {/* Main toolbar row */}
      <div className="flex items-center gap-1 overflow-x-auto overflow-y-hidden pb-2">
        {/* View mode */}
        <div className="flex bg-[var(--bg-tertiary)] rounded p-0.5 flex-shrink-0">
          <ToggleButton active={props.viewMode === 'editor'} onClick={() => props.onSetViewMode('editor')} title="Editor view">
            Edit
          </ToggleButton>
          <ToggleButton active={props.viewMode === 'sorter'} onClick={() => props.onSetViewMode('sorter')} title="Slide sorter">
            Sort
          </ToggleButton>
        </div>

        <Divider />

        {/* Slide navigation */}
        <IconButton onClick={props.onPrevSlide} disabled={props.currentSlideIndex === 0} title="Previous slide">
          <ChevronLeft size={14} />
        </IconButton>
        <IconButton onClick={props.onNextSlide} disabled={props.currentSlideIndex >= props.totalSlides - 1} title="Next slide">
          <ChevronRight size={14} />
        </IconButton>

        <Divider />

        {/* New slide with layout dropdown */}
        <NewSlideButton onCreate={props.onNewSlide} />
        <IconButton onClick={props.onDuplicateSlide} title="Duplicate this slide">
          <Copy size={14} />
        </IconButton>
        <IconButton
          onClick={props.onDeleteSlide}
          disabled={!props.canDeleteSlide}
          title={props.canDeleteSlide ? 'Delete this slide' : 'Cannot delete the last slide'}
          danger
        >
          <Trash2 size={14} />
        </IconButton>
        <ToggleButton
          active={props.isCurrentSlideSkipped}
          onClick={props.onToggleSkipSlide}
          title={props.isCurrentSlideSkipped ? 'Slide is skipped in presentation — click to include' : 'Skip this slide when presenting'}
        >
          {props.isCurrentSlideSkipped ? 'Skipped' : 'Skip'}
        </ToggleButton>

        <Divider />

        {/* Insert group */}
        <GroupLabel>Insert</GroupLabel>
        <IconButton onClick={props.onInsertText} title="Text box">
          <Type size={14} />
        </IconButton>
        <ShapePickerButton onPick={props.onInsertShape} />

        <Divider />

        {/* Find & replace */}
        <SecondaryButton onClick={() => setShowFindReplace(true)} title="Find and replace text across slides">
          Find / Replace
        </SecondaryButton>

        <Divider />

        {/* Misc */}
        <SecondaryButton onClick={props.onShowSlideInfo} title="Slide details (get_page)">
          Info
        </SecondaryButton>
        <SecondaryButton onClick={props.onSummarize} title="Summarize presentation">
          Summary
        </SecondaryButton>

        {/* Right-anchored Present */}
        <div className="flex-grow min-w-[8px]" />
        <button
          className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors font-medium flex items-center gap-1 flex-shrink-0"
          onClick={props.onPresent}
          title="Present from current slide"
        >
          <Play size={14} />
          <span>Present</span>
        </button>
      </div>

      {/* Selection-context row — always rendered with constant height. If we
          conditionally rendered it, the toolbar would grow ~45px on selection,
          pushing the slide canvas down between mousedown and mouseup. The
          browser would then fire `click` on the common ancestor of those two
          targets — the outer slide container — whose onClick deselects, making
          the toolbar appear-and-vanish. Always-rendered avoids the shift. */}
      <FormattingRow
        element={hasSelection ? props.selectedElement : null}
        onApplyTextStyle={props.onApplyTextStyle}
        onDuplicateElement={props.onDuplicateElement}
        onDeleteElement={props.onDeleteElement}
        onEditProperties={props.onEditElementProperties}
        onEditAltText={props.onEditAltText}
      />

      {showFindReplace && (
        <FindReplaceDialog
          onClose={() => setShowFindReplace(false)}
          onSubmit={async (find, replace, opts) => {
            await props.onFindAndReplace(find, replace, opts)
            setShowFindReplace(false)
          }}
        />
      )}
    </div>
  )
}

// --- Formatting row --------------------------------------------------------

function FormattingRow({
  element,
  onApplyTextStyle,
  onDuplicateElement,
  onDeleteElement,
  onEditProperties,
  onEditAltText,
}: {
  element: PageElement | null
  onApplyTextStyle: (patch: TextStylePatch) => void
  onDuplicateElement: () => void
  onDeleteElement: () => void
  onEditProperties: () => void
  onEditAltText: () => void
}) {
  // Render an empty row with the same vertical footprint when nothing is
  // selected — keeps the toolbar height constant so the slide canvas doesn't
  // jump on selection (see comment at the call site).
  if (!element) {
    return (
      <div className="flex items-center gap-1 overflow-x-auto overflow-y-hidden pb-2 border-t border-[var(--border-color)] pt-2 min-h-[44px]">
        <span className="text-[11px] uppercase tracking-wide text-[var(--text-tertiary)] px-1">
          Select an element to format it
        </span>
      </div>
    )
  }
  const isShape = !!element.shape
  // Read the *current* style from the first text run so toggle buttons can
  // light up to reflect existing state. The backend returns the style
  // alongside textRun content, so this is reliable for whole-element formatting.
  const currentStyle = element.shape?.text?.textElements?.find(t => t.textRun)?.textRun?.style
  const isBold = !!currentStyle?.bold
  const isItalic = !!currentStyle?.italic
  const isUnderline = !!currentStyle?.underline
  // TextRun.style carries strikethrough/smallCaps/baselineOffset in the Slides
  // API but our local PageElement TS type doesn't model them; we read them
  // through a cast to keep the toggles state-aware without expanding the type.
  const styleAny = currentStyle as Record<string, unknown> | undefined
  const isStrikethrough = !!styleAny?.strikethrough
  const isSmallCaps = !!styleAny?.smallCaps
  const baselineOffset = (styleAny?.baselineOffset as string | undefined) || 'NONE'

  const currentFontFamily = currentStyle?.fontFamily || ''
  const currentFontSize = currentStyle?.fontSize?.magnitude
  const fgRgb = currentStyle?.foregroundColor?.opaqueColor?.rgbColor
  const bgRgb = (styleAny?.backgroundColor as { opaqueColor?: { rgbColor?: { red?: number; green?: number; blue?: number } } } | undefined)?.opaqueColor?.rgbColor
  const currentLink = (styleAny?.link as { url?: string } | undefined)?.url
  const weightedFont = styleAny?.weightedFontFamily as { weight?: number } | undefined
  const currentWeight = weightedFont?.weight

  return (
    <div className="flex items-center gap-1 overflow-x-auto overflow-y-hidden pb-2 border-t border-[var(--border-color)] pt-2">
      {isShape && (
        <>
          <GroupLabel>Format</GroupLabel>

          <FontFamilySelect value={currentFontFamily} onChange={f => onApplyTextStyle({ fontFamily: f })} />
          <FontSizeInput value={currentFontSize} onChange={s => onApplyTextStyle({ fontSize: s })} />

          <Divider />

          <ToggleIconButton active={isBold} onClick={() => onApplyTextStyle({ bold: !isBold })} title="Bold">
            <Bold size={14} />
          </ToggleIconButton>
          <ToggleIconButton active={isItalic} onClick={() => onApplyTextStyle({ italic: !isItalic })} title="Italic">
            <Italic size={14} />
          </ToggleIconButton>
          <ToggleIconButton active={isUnderline} onClick={() => onApplyTextStyle({ underline: !isUnderline })} title="Underline">
            <Underline size={14} />
          </ToggleIconButton>
          <ToggleIconButton active={isStrikethrough} onClick={() => onApplyTextStyle({ strikethrough: !isStrikethrough })} title="Strikethrough">
            <Strikethrough size={14} />
          </ToggleIconButton>

          <Divider />

          <ColorButton
            label="Text color"
            currentColor={fgRgb ? rgbColorToString(fgRgb) : undefined}
            defaultSwatch="#000000"
            onPick={rgb => onApplyTextStyle({ foregroundColor: rgb })}
          >
            <Baseline size={14} />
          </ColorButton>
          <ColorButton
            label="Highlight color"
            currentColor={bgRgb ? rgbColorToString(bgRgb) : undefined}
            defaultSwatch="#fef08a"
            onPick={rgb => onApplyTextStyle({ backgroundColor: rgb })}
          >
            <Highlighter size={14} />
          </ColorButton>

          <Divider />

          <ToggleIconButton
            active={baselineOffset === 'SUPERSCRIPT'}
            onClick={() => onApplyTextStyle({ baselineOffset: baselineOffset === 'SUPERSCRIPT' ? 'NONE' : 'SUPERSCRIPT' })}
            title="Superscript"
          >
            <Superscript size={14} />
          </ToggleIconButton>
          <ToggleIconButton
            active={baselineOffset === 'SUBSCRIPT'}
            onClick={() => onApplyTextStyle({ baselineOffset: baselineOffset === 'SUBSCRIPT' ? 'NONE' : 'SUBSCRIPT' })}
            title="Subscript"
          >
            <Subscript size={14} />
          </ToggleIconButton>
          <ToggleIconButton
            active={isSmallCaps}
            onClick={() => onApplyTextStyle({ smallCaps: !isSmallCaps })}
            title="Small caps"
          >
            <CaseSensitive size={14} />
          </ToggleIconButton>

          <Divider />

          <LinkButton currentUrl={currentLink} onSet={url => onApplyTextStyle({ link: url ? { url } : null })} />
          <WeightSelect value={currentWeight} onChange={w => {
            if (w == null) {
              onApplyTextStyle({ weightedFontFamily: null })
            } else {
              onApplyTextStyle({ weightedFontFamily: { fontFamily: currentFontFamily || 'Arial', weight: w } })
            }
          }} />

          <Divider />
        </>
      )}

      <GroupLabel>Element</GroupLabel>
      <IconButton onClick={onDuplicateElement} title="Duplicate selected element">
        <Copy size={14} />
      </IconButton>
      <IconButton onClick={onEditProperties} title="Position & size">
        <Settings size={14} />
      </IconButton>
      <IconButton onClick={onEditAltText} title="Alt text">
        <span className="text-[10px] font-semibold">alt</span>
      </IconButton>
      <IconButton onClick={onDeleteElement} title="Delete selected element" danger>
        <Trash2 size={14} />
      </IconButton>
    </div>
  )
}

// --- Popover / dropdown components -----------------------------------------

function NewSlideButton({ onCreate }: { onCreate: (predefinedLayout: string) => void }) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)

  return (
    <>
      <div ref={anchorRef} className="flex items-stretch flex-shrink-0">
        <button
          className="px-3 py-1.5 text-sm bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-l transition-colors"
          onClick={() => onCreate('BLANK')}
          title="Insert a blank slide after the current one"
        >
          + Slide
        </button>
        <button
          className="px-1.5 py-1.5 text-sm bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-r transition-colors border-l border-white/20"
          onClick={() => setOpen(o => !o)}
          title="Choose layout"
        >
          <ChevronDown size={12} />
        </button>
      </div>
      <Popover anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} width={224}>
        <div className="py-1">
          <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">New slide with layout</div>
          {PREDEFINED_LAYOUTS.map(l => (
            <button
              key={l.value}
              className="w-full text-left px-3 py-1.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
              onClick={() => { onCreate(l.value); setOpen(false) }}
            >
              {l.label}
            </button>
          ))}
        </div>
      </Popover>
    </>
  )
}

function ShapePickerButton({ onPick }: { onPick: (shape: ShapeType) => void }) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      <button
        ref={anchorRef}
        className="p-1.5 rounded transition-colors flex-shrink-0 text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] flex items-center gap-1"
        onClick={() => setOpen(o => !o)}
        title="Insert shape"
      >
        <Square size={14} />
        <ChevronDown size={10} />
      </button>
      <Popover anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} width={420} maxHeight={400}>
        <div className="p-2">
          {SHAPE_CATEGORIES.map(cat => (
            <div key={cat.id} className="mb-2 last:mb-0">
              <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">{cat.label}</div>
              <div className="grid grid-cols-6 gap-1">
                {cat.shapes.map(s => (
                  <button
                    key={s.type}
                    className="aspect-square flex items-center justify-center rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)]"
                    onClick={() => { onPick(s.type); setOpen(false) }}
                    title={s.label}
                  >
                    <ShapeThumb type={s.type} />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Popover>
    </>
  )
}

function FontFamilySelect({ value, onChange }: { value: string; onChange: (font: string) => void }) {
  return (
    <select
      className="px-2 py-1 text-xs bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-[var(--text-primary)] focus:outline-none flex-shrink-0 w-[140px]"
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      title="Font family"
    >
      <option value="">Default font</option>
      {FONT_FAMILIES.map(f => (
        <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
      ))}
    </select>
  )
}

function FontSizeInput({ value, onChange }: { value: number | undefined; onChange: (size: number) => void }) {
  const [draft, setDraft] = useState(value != null ? String(value) : '')
  useEffect(() => { setDraft(value != null ? String(value) : '') }, [value])
  const commit = () => {
    const n = parseFloat(draft)
    if (Number.isFinite(n) && n > 0 && n <= 400 && n !== value) onChange(n)
  }
  return (
    <div className="flex items-stretch bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded flex-shrink-0">
      <select
        className="px-1 py-1 text-xs bg-transparent text-[var(--text-primary)] focus:outline-none border-r border-[var(--border-color)] w-[58px]"
        value={FONT_SIZES.includes(parseFloat(draft)) ? draft : ''}
        onChange={e => { setDraft(e.target.value); onChange(parseFloat(e.target.value)) }}
        title="Font size"
      >
        <option value="">--</option>
        {FONT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <input
        type="number"
        className="w-[44px] px-1 py-1 text-xs bg-transparent text-[var(--text-primary)] focus:outline-none"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        title="Custom font size (pt)"
        min="1"
        max="400"
      />
    </div>
  )
}

function WeightSelect({ value, onChange }: { value: number | undefined; onChange: (weight: number | null) => void }) {
  return (
    <select
      className="px-2 py-1 text-xs bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-[var(--text-primary)] focus:outline-none flex-shrink-0 w-[120px]"
      value={value != null ? String(value) : ''}
      onChange={e => {
        const v = e.target.value
        onChange(v ? parseInt(v, 10) : null)
      }}
      title="Font weight (weighted font family)"
    >
      <option value="">Weight…</option>
      {FONT_WEIGHTS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
    </select>
  )
}

function ColorButton({
  label,
  currentColor,
  defaultSwatch,
  onPick,
  children,
}: {
  label: string
  currentColor: string | undefined
  defaultSwatch: string
  onPick: (rgb: { red: number; green: number; blue: number } | null) => void
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      <button
        ref={anchorRef}
        className="p-1.5 rounded transition-colors text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] flex items-center gap-1 flex-shrink-0"
        onClick={() => setOpen(o => !o)}
        title={label}
      >
        <span className="flex flex-col items-center gap-0.5">
          {children}
          <span className="block w-3.5 h-1 rounded-sm" style={{ backgroundColor: currentColor || defaultSwatch }} />
        </span>
        <ChevronDown size={10} />
      </button>
      <Popover anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} width={260}>
        <ColorPickerBody
          onPick={rgb => { onPick(rgb); setOpen(false) }}
          onClose={() => setOpen(false)}
        />
      </Popover>
    </>
  )
}

const COLOR_PALETTE = [
  '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff',
  '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff',
  '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc',
  '#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd',
  '#cc4125', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb', '#6fa8dc', '#8e7cc3', '#c27ba0',
]

function hexToRgb(hex: string): { red: number; green: number; blue: number } {
  const h = hex.replace('#', '')
  return {
    red: parseInt(h.slice(0, 2), 16) / 255,
    green: parseInt(h.slice(2, 4), 16) / 255,
    blue: parseInt(h.slice(4, 6), 16) / 255,
  }
}

function ColorPickerBody({ onPick, onClose }: {
  onPick: (rgb: { red: number; green: number; blue: number } | null) => void
  onClose: () => void
}) {
  const [custom, setCustom] = useState('#000000')
  return (
    <div className="p-2">
      <div className="grid grid-cols-10 gap-1">
        {COLOR_PALETTE.map(hex => (
          <button
            key={hex}
            className="w-5 h-5 rounded-sm border border-black/10 hover:scale-110 transition-transform"
            style={{ backgroundColor: hex }}
            onClick={() => onPick(hexToRgb(hex))}
            title={hex}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="color"
          value={custom}
          onChange={e => setCustom(e.target.value)}
          className="w-8 h-8 rounded cursor-pointer"
          title="Custom color"
        />
        <button
          className="px-2 py-1 text-xs bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded"
          onClick={() => onPick(hexToRgb(custom))}
        >
          Apply
        </button>
        <button
          className="px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] ml-auto"
          onClick={() => { onPick(null); onClose() }}
          title="Clear color"
        >
          Reset
        </button>
      </div>
    </div>
  )
}

function LinkButton({ currentUrl, onSet }: { currentUrl: string | undefined; onSet: (url: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(currentUrl || '')
  const anchorRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (open) setDraft(currentUrl || '') }, [open, currentUrl])
  const active = !!currentUrl

  return (
    <>
      <button
        ref={anchorRef}
        className={`p-1.5 rounded transition-colors flex-shrink-0 ${
          active
            ? 'bg-[var(--accent-color)]/20 text-[var(--accent-color)]'
            : 'text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
        }`}
        onClick={() => setOpen(o => !o)}
        title={currentUrl ? `Link: ${currentUrl}` : 'Insert link'}
      >
        <Link size={14} />
      </button>
      <Popover anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} width={300}>
        <div className="p-3">
          <label className="text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">URL</label>
          <input
            type="url"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            className="w-full mt-1 px-2 py-1 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-sm text-[var(--text-primary)] focus:outline-none"
            placeholder="https://example.com"
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter') { onSet(draft.trim() || null); setOpen(false) }
              if (e.key === 'Escape') setOpen(false)
            }}
          />
          <div className="flex gap-2 mt-2 justify-end">
            {currentUrl && (
              <button
                className="px-2 py-1 text-xs text-red-400 hover:text-red-300 mr-auto"
                onClick={() => { onSet(null); setOpen(false) }}
              >
                Remove
              </button>
            )}
            <button
              className="px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button
              className="px-2 py-1 text-xs bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded"
              onClick={() => { onSet(draft.trim() || null); setOpen(false) }}
            >
              Apply
            </button>
          </div>
        </div>
      </Popover>
    </>
  )
}

function FindReplaceDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void
  onSubmit: (find: string, replace: string, opts: { matchCase: boolean; regex: boolean; allSlides: boolean }) => void | Promise<void>
}) {
  const [find, setFind] = useState('')
  const [replace, setReplace] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [regex, setRegex] = useState(false)
  const [allSlides, setAllSlides] = useState(true)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!find) return
    setBusy(true)
    try {
      await onSubmit(find, replace, { matchCase, regex, allSlides })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" onClick={onClose}>
      <div className="bg-[var(--bg-secondary)] rounded-lg p-6 w-[420px] border border-[var(--border-color)]" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-[var(--text-primary)] mb-4">Find and replace</h2>
        <div className="space-y-3 mb-4">
          <div>
            <label className="text-xs text-[var(--text-secondary)]">Find</label>
            <input
              type="text"
              className="w-full mt-1 px-2 py-1 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-color)]"
              value={find}
              onChange={e => setFind(e.target.value)}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') submit() }}
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-secondary)]">Replace with</label>
            <input
              type="text"
              className="w-full mt-1 px-2 py-1 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-color)]"
              value={replace}
              onChange={e => setReplace(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submit() }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <input type="checkbox" checked={matchCase} onChange={e => setMatchCase(e.target.checked)} />
              Match case
            </label>
            <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <input type="checkbox" checked={regex} onChange={e => setRegex(e.target.checked)} />
              Search by regex
            </label>
            <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <input type="checkbox" checked={allSlides} onChange={e => setAllSlides(e.target.checked)} />
              Search all slides (uncheck to limit to current slide)
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            className="px-4 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white rounded-lg transition-colors disabled:opacity-40"
            onClick={submit}
            disabled={!find || busy}
          >
            {busy ? 'Replacing…' : 'Replace all'}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Utilities -------------------------------------------------------------

// Portal-rendered popover anchored to a trigger button. We portal to <body>
// because the toolbar row uses `overflow-y-hidden` (to suppress vertical
// scrollbars while keeping a horizontal one for overflow), which otherwise
// clips dropdown content rendered as a normal child.
function Popover({
  anchorRef,
  open,
  onClose,
  width,
  maxHeight,
  children,
}: {
  anchorRef: React.RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  width: number
  maxHeight?: number
  children: React.ReactNode
}) {
  const popRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setCoords(null)
      return
    }
    const update = () => {
      const el = anchorRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      let left = r.left
      if (left + width > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - width - 8)
      }
      setCoords({ top: r.bottom + 4, left })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, anchorRef, width])

  useEffect(() => {
    if (!open) return
    const onMouse = (e: MouseEvent) => {
      const t = e.target as Node
      if (anchorRef.current?.contains(t)) return
      if (popRef.current?.contains(t)) return
      onClose()
    }
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('mousedown', onMouse)
    window.addEventListener('keydown', onEsc)
    return () => {
      window.removeEventListener('mousedown', onMouse)
      window.removeEventListener('keydown', onEsc)
    }
  }, [open, anchorRef, onClose])

  if (!open || !coords) return null
  return createPortal(
    <div
      ref={popRef}
      style={{
        position: 'fixed',
        top: coords.top,
        left: coords.left,
        width,
        maxHeight,
        zIndex: 100,
      }}
      className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded shadow-xl overflow-y-auto"
    >
      {children}
    </div>,
    document.body,
  )
}

// --- Layout primitives ------------------------------------------------------

const ID_BADGE_STYLE: React.CSSProperties = {
  marginLeft: '6px',
  fontSize: '11px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  color: 'var(--text-tertiary, #888)',
}

function Divider() {
  return <div className="h-5 w-px bg-[var(--border-color)] mx-1 flex-shrink-0" />
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] uppercase tracking-wide text-[var(--text-tertiary)] mr-1 flex-shrink-0">{children}</span>
}

function ToggleButton({ active, onClick, title, children }: {
  active: boolean
  onClick: () => void
  title?: string
  children: React.ReactNode
}) {
  return (
    <button
      className={`px-3 py-1 text-xs rounded transition-colors flex-shrink-0 ${
        active
          ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-sm'
          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
      }`}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  )
}

function IconButton({ children, onClick, disabled, title, danger }: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
  danger?: boolean
}) {
  return (
    <button
      className={`p-1.5 rounded transition-colors flex-shrink-0 ${
        disabled
          ? 'opacity-40 cursor-not-allowed text-[var(--text-secondary)]'
          : danger
            ? 'text-[var(--text-secondary)] hover:text-red-400 hover:bg-red-500/15'
            : 'text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
      }`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  )
}

function ToggleIconButton({ active, children, onClick, title }: {
  active: boolean
  children: React.ReactNode
  onClick: () => void
  title?: string
}) {
  return (
    <button
      className={`p-1.5 rounded transition-colors flex-shrink-0 ${
        active
          ? 'bg-[var(--accent-color)]/20 text-[var(--accent-color)]'
          : 'text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
      }`}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  )
}

function SecondaryButton({ children, onClick, title }: {
  children: React.ReactNode
  onClick: () => void
  title?: string
}) {
  return (
    <button
      className="px-2 py-1.5 text-xs rounded transition-colors text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-color)] flex-shrink-0"
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  )
}

// Toolbar action icons come from lucide-react (the project-wide icon library —
// see gui/frontend/README.md). The custom ShapeThumb below is *not* a button
// icon; it draws faithful silhouettes of the Slides shape catalog (CLOUD,
// FLOW_CHART_*, …) which lucide doesn't cover.

// Shape thumbnail rendered for the shape picker — minimal silhouettes that
// hint at the geometry without trying to render the full Slides preview.
function ShapeThumb({ type }: { type: string }) {
  const s = 18
  const sw = 1.4
  const stroke = 'currentColor'
  const fill = 'none'
  const t = type.toUpperCase()

  if (t === 'RECTANGLE') return <svg viewBox="0 0 20 20" width={s} height={s}><rect x="3" y="5" width="14" height="10" stroke={stroke} fill={fill} strokeWidth={sw} /></svg>
  if (t === 'ROUND_RECTANGLE') return <svg viewBox="0 0 20 20" width={s} height={s}><rect x="3" y="5" width="14" height="10" rx="3" stroke={stroke} fill={fill} strokeWidth={sw} /></svg>
  if (t === 'ELLIPSE') return <svg viewBox="0 0 20 20" width={s} height={s}><ellipse cx="10" cy="10" rx="7" ry="5" stroke={stroke} fill={fill} strokeWidth={sw} /></svg>
  if (t === 'TRIANGLE') return <svg viewBox="0 0 20 20" width={s} height={s}><polygon points="10,3 17,16 3,16" stroke={stroke} fill={fill} strokeWidth={sw} strokeLinejoin="round" /></svg>
  if (t === 'RIGHT_TRIANGLE') return <svg viewBox="0 0 20 20" width={s} height={s}><polygon points="3,16 17,16 3,3" stroke={stroke} fill={fill} strokeWidth={sw} strokeLinejoin="round" /></svg>
  if (t === 'PARALLELOGRAM') return <svg viewBox="0 0 20 20" width={s} height={s}><polygon points="5,5 18,5 15,15 2,15" stroke={stroke} fill={fill} strokeWidth={sw} strokeLinejoin="round" /></svg>
  if (t === 'TRAPEZOID') return <svg viewBox="0 0 20 20" width={s} height={s}><polygon points="5,5 15,5 18,15 2,15" stroke={stroke} fill={fill} strokeWidth={sw} strokeLinejoin="round" /></svg>
  if (t === 'DIAMOND') return <svg viewBox="0 0 20 20" width={s} height={s}><polygon points="10,3 17,10 10,17 3,10" stroke={stroke} fill={fill} strokeWidth={sw} strokeLinejoin="round" /></svg>
  if (t === 'PENTAGON') return <svg viewBox="0 0 20 20" width={s} height={s}><polygon points="10,3 17,8 14,17 6,17 3,8" stroke={stroke} fill={fill} strokeWidth={sw} strokeLinejoin="round" /></svg>
  if (t === 'HEXAGON') return <svg viewBox="0 0 20 20" width={s} height={s}><polygon points="6,4 14,4 18,10 14,16 6,16 2,10" stroke={stroke} fill={fill} strokeWidth={sw} strokeLinejoin="round" /></svg>
  if (t === 'OCTAGON') return <svg viewBox="0 0 20 20" width={s} height={s}><polygon points="7,3 13,3 17,7 17,13 13,17 7,17 3,13 3,7" stroke={stroke} fill={fill} strokeWidth={sw} strokeLinejoin="round" /></svg>
  if (t === 'HEART') return <svg viewBox="0 0 20 20" width={s} height={s}><path d="M10 16 C 4 12, 3 6, 7 5 C 9 5, 10 7, 10 7 C 10 7, 11 5, 13 5 C 17 6, 16 12, 10 16 Z" stroke={stroke} fill={fill} strokeWidth={sw} strokeLinejoin="round" /></svg>
  if (t === 'STAR_5') return <svg viewBox="0 0 20 20" width={s} height={s}><polygon points="10,3 12,8 18,8 13,12 15,17 10,14 5,17 7,12 2,8 8,8" stroke={stroke} fill={fill} strokeWidth={sw} strokeLinejoin="round" /></svg>
  if (t === 'STAR_4') return <svg viewBox="0 0 20 20" width={s} height={s}><polygon points="10,3 12,9 17,10 12,11 10,17 8,11 3,10 8,9" stroke={stroke} fill={fill} strokeWidth={sw} strokeLinejoin="round" /></svg>
  if (t === 'STAR_6') return <svg viewBox="0 0 20 20" width={s} height={s}><polygon points="10,3 12,7 17,7 13,11 15,16 10,13 5,16 7,11 3,7 8,7" stroke={stroke} fill={fill} strokeWidth={sw} strokeLinejoin="round" /></svg>
  if (t === 'SMILEY_FACE') return <svg viewBox="0 0 20 20" width={s} height={s}><circle cx="10" cy="10" r="7" stroke={stroke} fill={fill} strokeWidth={sw} /><circle cx="7.5" cy="8.5" r="0.6" fill={stroke} /><circle cx="12.5" cy="8.5" r="0.6" fill={stroke} /><path d="M7 12 Q10 14 13 12" stroke={stroke} fill="none" strokeWidth={sw} strokeLinecap="round" /></svg>
  if (t === 'CLOUD') return <svg viewBox="0 0 20 20" width={s} height={s}><path d="M5 14 Q2 14 2 11 Q2 9 5 9 Q5 6 8 6 Q11 6 11 8 Q14 7 15 10 Q18 10 18 13 Q18 15 16 15 H6 Q5 15 5 14 Z" stroke={stroke} fill={fill} strokeWidth={sw} strokeLinejoin="round" /></svg>
  if (t === 'SUN') return <svg viewBox="0 0 20 20" width={s} height={s}><circle cx="10" cy="10" r="3" stroke={stroke} fill={fill} strokeWidth={sw} /><path d="M10 2 V4 M10 16 V18 M2 10 H4 M16 10 H18 M4 4 L5.5 5.5 M14.5 14.5 L16 16 M4 16 L5.5 14.5 M14.5 5.5 L16 4" stroke={stroke} strokeWidth={sw} strokeLinecap="round" /></svg>
  if (t === 'MOON') return <svg viewBox="0 0 20 20" width={s} height={s}><path d="M14 4 Q8 6 8 10 Q8 14 14 16 Q5 16 5 10 Q5 4 14 4 Z" stroke={stroke} fill={fill} strokeWidth={sw} strokeLinejoin="round" /></svg>
  if (t === 'LIGHTNING_BOLT') return <svg viewBox="0 0 20 20" width={s} height={s}><polygon points="11,3 5,11 9,11 7,17 14,9 10,9 12,3" stroke={stroke} fill={fill} strokeWidth={sw} strokeLinejoin="round" /></svg>
  if (t === 'RIGHT_ARROW' || t === 'ARROW_EAST') return <svg viewBox="0 0 20 20" width={s} height={s}><polygon points="3,8 12,8 12,5 17,10 12,15 12,12 3,12" stroke={stroke} fill={fill} strokeWidth={sw} strokeLinejoin="round" /></svg>
  if (t === 'LEFT_ARROW') return <svg viewBox="0 0 20 20" width={s} height={s}><polygon points="17,8 8,8 8,5 3,10 8,15 8,12 17,12" stroke={stroke} fill={fill} strokeWidth={sw} strokeLinejoin="round" /></svg>
  if (t === 'UP_ARROW' || t === 'ARROW_NORTH') return <svg viewBox="0 0 20 20" width={s} height={s}><polygon points="8,17 8,8 5,8 10,3 15,8 12,8 12,17" stroke={stroke} fill={fill} strokeWidth={sw} strokeLinejoin="round" /></svg>
  if (t === 'DOWN_ARROW') return <svg viewBox="0 0 20 20" width={s} height={s}><polygon points="8,3 8,12 5,12 10,17 15,12 12,12 12,3" stroke={stroke} fill={fill} strokeWidth={sw} strokeLinejoin="round" /></svg>
  if (t === 'LEFT_RIGHT_ARROW') return <svg viewBox="0 0 20 20" width={s} height={s}><polygon points="3,10 6,7 6,9 14,9 14,7 17,10 14,13 14,11 6,11 6,13" stroke={stroke} fill={fill} strokeWidth={sw} strokeLinejoin="round" /></svg>
  if (t === 'UP_DOWN_ARROW') return <svg viewBox="0 0 20 20" width={s} height={s}><polygon points="10,3 7,6 9,6 9,14 7,14 10,17 13,14 11,14 11,6 13,6" stroke={stroke} fill={fill} strokeWidth={sw} strokeLinejoin="round" /></svg>
  if (t === 'CHEVRON') return <svg viewBox="0 0 20 20" width={s} height={s}><polygon points="3,5 12,5 17,10 12,15 3,15 8,10" stroke={stroke} fill={fill} strokeWidth={sw} strokeLinejoin="round" /></svg>
  if (t === 'HOME_PLATE') return <svg viewBox="0 0 20 20" width={s} height={s}><polygon points="3,5 13,5 17,10 13,15 3,15" stroke={stroke} fill={fill} strokeWidth={sw} strokeLinejoin="round" /></svg>
  if (t === 'WEDGE_RECTANGLE_CALLOUT') return <svg viewBox="0 0 20 20" width={s} height={s}><polygon points="3,4 17,4 17,13 11,13 8,17 7,13 3,13" stroke={stroke} fill={fill} strokeWidth={sw} strokeLinejoin="round" /></svg>
  if (t === 'WEDGE_ROUND_RECTANGLE_CALLOUT') return <svg viewBox="0 0 20 20" width={s} height={s}><path d="M5 4 H15 Q17 4 17 6 V11 Q17 13 15 13 H11 L8 17 L7 13 H5 Q3 13 3 11 V6 Q3 4 5 4 Z" stroke={stroke} fill={fill} strokeWidth={sw} strokeLinejoin="round" /></svg>
  if (t === 'WEDGE_ELLIPSE_CALLOUT') return <svg viewBox="0 0 20 20" width={s} height={s}><ellipse cx="10" cy="8" rx="7" ry="5" stroke={stroke} fill={fill} strokeWidth={sw} /><polygon points="7,12 6,17 11,12" stroke={stroke} fill={fill} strokeWidth={sw} strokeLinejoin="round" /></svg>
  if (t === 'CLOUD_CALLOUT') return <svg viewBox="0 0 20 20" width={s} height={s}><path d="M5 10 Q3 10 3 8 Q3 6 5 6 Q5 4 8 4 Q11 4 11 6 Q14 5 15 8 Q17 8 17 10 Q17 12 15 12 H6 Q5 12 5 10 Z" stroke={stroke} fill={fill} strokeWidth={sw} strokeLinejoin="round" /><circle cx="6" cy="15" r="1.5" stroke={stroke} fill={fill} strokeWidth={sw} /><circle cx="3" cy="17" r="0.7" stroke={stroke} fill={fill} strokeWidth={sw} /></svg>
  if (t === 'SPEECH') return <svg viewBox="0 0 20 20" width={s} height={s}><path d="M3 4 H17 V13 H10 L6 17 L7 13 H3 Z" stroke={stroke} fill={fill} strokeWidth={sw} strokeLinejoin="round" /></svg>
  if (t === 'MATH_PLUS') return <svg viewBox="0 0 20 20" width={s} height={s}><polygon points="8,3 12,3 12,8 17,8 17,12 12,12 12,17 8,17 8,12 3,12 3,8 8,8" stroke={stroke} fill={fill} strokeWidth={sw} strokeLinejoin="round" /></svg>
  if (t === 'MATH_MINUS') return <svg viewBox="0 0 20 20" width={s} height={s}><rect x="3" y="8" width="14" height="4" stroke={stroke} fill={fill} strokeWidth={sw} /></svg>
  if (t === 'MATH_MULTIPLY') return <svg viewBox="0 0 20 20" width={s} height={s}><polygon points="4,5 7,5 10,8 13,5 16,5 12,10 16,15 13,15 10,12 7,15 4,15 8,10" stroke={stroke} fill={fill} strokeWidth={sw} strokeLinejoin="round" /></svg>
  if (t === 'MATH_DIVIDE') return <svg viewBox="0 0 20 20" width={s} height={s}><rect x="3" y="9" width="14" height="2" stroke={stroke} fill={fill} strokeWidth={sw} /><circle cx="10" cy="5" r="1.5" fill={stroke} /><circle cx="10" cy="15" r="1.5" fill={stroke} /></svg>
  if (t === 'MATH_EQUAL') return <svg viewBox="0 0 20 20" width={s} height={s}><rect x="3" y="6" width="14" height="2.5" stroke={stroke} fill={fill} strokeWidth={sw} /><rect x="3" y="11.5" width="14" height="2.5" stroke={stroke} fill={fill} strokeWidth={sw} /></svg>
  if (t === 'MATH_NOT_EQUAL') return <svg viewBox="0 0 20 20" width={s} height={s}><rect x="3" y="6" width="14" height="2.5" stroke={stroke} fill={fill} strokeWidth={sw} /><rect x="3" y="11.5" width="14" height="2.5" stroke={stroke} fill={fill} strokeWidth={sw} /><line x1="15" y1="3" x2="5" y2="17" stroke={stroke} strokeWidth={sw + 0.4} /></svg>
  if (t === 'FLOW_CHART_PROCESS') return <svg viewBox="0 0 20 20" width={s} height={s}><rect x="3" y="6" width="14" height="8" stroke={stroke} fill={fill} strokeWidth={sw} /></svg>
  if (t === 'FLOW_CHART_DECISION') return <svg viewBox="0 0 20 20" width={s} height={s}><polygon points="10,3 17,10 10,17 3,10" stroke={stroke} fill={fill} strokeWidth={sw} strokeLinejoin="round" /></svg>
  if (t === 'FLOW_CHART_TERMINATOR') return <svg viewBox="0 0 20 20" width={s} height={s}><rect x="3" y="6" width="14" height="8" rx="4" stroke={stroke} fill={fill} strokeWidth={sw} /></svg>
  if (t === 'FLOW_CHART_DOCUMENT') return <svg viewBox="0 0 20 20" width={s} height={s}><path d="M3 5 H17 V14 Q14 12 10 14 Q6 16 3 14 Z" stroke={stroke} fill={fill} strokeWidth={sw} strokeLinejoin="round" /></svg>
  if (t === 'BRACE_PAIR' || t === 'LEFT_BRACE') return <svg viewBox="0 0 20 20" width={s} height={s}><path d="M7 3 Q5 3 5 6 Q5 9 3 10 Q5 11 5 14 Q5 17 7 17" stroke={stroke} fill="none" strokeWidth={sw + 0.2} strokeLinecap="round" /></svg>
  if (t === 'BRACKET_PAIR' || t === 'LEFT_BRACKET') return <svg viewBox="0 0 20 20" width={s} height={s}><path d="M7 3 H4 V17 H7" stroke={stroke} fill="none" strokeWidth={sw + 0.2} strokeLinejoin="round" /></svg>
  if (t === 'RIGHT_BRACE') return <svg viewBox="0 0 20 20" width={s} height={s}><path d="M13 3 Q15 3 15 6 Q15 9 17 10 Q15 11 15 14 Q15 17 13 17" stroke={stroke} fill="none" strokeWidth={sw + 0.2} strokeLinecap="round" /></svg>
  if (t === 'RIGHT_BRACKET') return <svg viewBox="0 0 20 20" width={s} height={s}><path d="M13 3 H16 V17 H13" stroke={stroke} fill="none" strokeWidth={sw + 0.2} strokeLinejoin="round" /></svg>

  // Fallback: a generic placeholder with a short label
  return (
    <svg viewBox="0 0 20 20" width={s} height={s}>
      <rect x="2" y="6" width="16" height="8" stroke={stroke} fill="none" strokeWidth={sw} strokeDasharray="2 1.5" />
    </svg>
  )
}
