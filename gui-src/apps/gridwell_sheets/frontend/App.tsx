import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useBackendAPI } from '@shared/hooks/useBackendAPI'
import { evaluateFormula } from './utils/formula'

/**
 * GridwellSheets Frontend Application
 * 
 * A spreadsheet interface that connects to the GridwellSheets simulation API.
 * Supports spreadsheet management, sheet operations, and cell editing.
 */

const APP_NAME = "GridwellSheets";

// ============================================================================
// Type Definitions
// ============================================================================

interface SpreadsheetProperties {
  title: string
  locale?: string
  timeZone?: string
}

interface SheetProperties {
  sheetId: number
  title: string
  index: number
  gridProperties?: {
    rowCount?: number
    columnCount?: number
    frozenRowCount?: number
    frozenColumnCount?: number
  }
}

interface Sheet {
  properties: SheetProperties
  data?: Array<{
    rowData?: Array<{
      values?: Array<{
        formattedValue?: string
        userEnteredValue?: {
          stringValue?: string
          numberValue?: number
          boolValue?: boolean
          formulaValue?: string
        }
      }>
    }>
  }>
}

interface Spreadsheet {
  spreadsheetId: string
  properties: SpreadsheetProperties
  sheets: Sheet[]
  createdTime?: string
  modifiedTime?: string
  owners?: Array<{
    displayName?: string
    emailAddress?: string
  }>
}

interface CellData {
  value: string | number | boolean | null
  formattedValue?: string
}

interface OpenWindowConfig {
  id: string
  title: string
  content: React.ReactNode
  width?: number
  height?: number
}

interface CommentAuthor {
  displayName?: string
  emailAddress?: string
}

interface CommentReply {
  id: string
  content: string
  author: CommentAuthor
  createdTime: string
  commentId?: string
}

interface FileComment {
  id: string
  fileId: string
  content: string
  author: CommentAuthor
  createdTime: string
  resolved?: boolean
  replies?: CommentReply[]
}

interface AppProps {
  onClose: () => void
  setRefreshHandler?: (handler: (() => void) | null) => void
  openWindow?: (config: OpenWindowConfig) => void
  initialFileId?: string
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert column index (0-based) to letter (A, B, C, ..., AA, AB, etc.)
 */
function colIndexToLetter(index: number): string {
  let letter = ''
  let temp = index
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter
    temp = Math.floor(temp / 26) - 1
  }
  return letter
}

/**
 * Convert column letter to index (0-based)
 */
function colLetterToIndex(letter: string): number {
  let index = 0
  for (let i = 0; i < letter.length; i++) {
    index = index * 26 + (letter.charCodeAt(i) - 64)
  }
  return index - 1
}

/**
 * Format a sheet name for use in A1 notation.
 * Sheet names need to be quoted if they contain spaces, special characters, or start with digits.
 */
function formatSheetNameForA1(sheetTitle: string): string {
  // Check if quoting is needed: spaces, quotes, parentheses, or other special characters
  const needsQuoting = /[\s'()\[\]!:;,]/.test(sheetTitle) || /^\d/.test(sheetTitle)
  if (needsQuoting) {
    // Escape single quotes by doubling them, then wrap in single quotes
    return `'${sheetTitle.replace(/'/g, "''")}'`
  }
  return sheetTitle
}

/**
 * Format a user-entered A1 range, ensuring sheet names are properly quoted
 * Handles ranges like "Sheet1(Copy)!A1:B1" → "'Sheet1(Copy)'!A1:B1"
 */
function formatUserA1Range(range: string): string {
  const trimmed = range.trim()

  // Check if range has a sheet name (contains !)
  const exclamationIdx = trimmed.lastIndexOf('!')
  if (exclamationIdx === -1) {
    // No sheet name, return as-is
    return trimmed
  }

  const sheetPart = trimmed.substring(0, exclamationIdx)
  const rangePart = trimmed.substring(exclamationIdx + 1)

  // Check if already properly quoted (starts and ends with single quotes)
  if (sheetPart.startsWith("'") && sheetPart.endsWith("'")) {
    return trimmed
  }

  // Format the sheet name
  return `${formatSheetNameForA1(sheetPart)}!${rangePart}`
}

/**
 * Generate a range string in A1 notation
 */
function generateA1Range(
  sheetTitle: string,
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number
): string {
  const startCell = `${colIndexToLetter(startCol)}${startRow + 1}`
  const endCell = `${colIndexToLetter(endCol)}${endRow + 1}`
  return `${formatSheetNameForA1(sheetTitle)}!${startCell}:${endCell}`
}

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Spreadsheet List Component - displays all available spreadsheets in a modern card grid
 */
function SpreadsheetList({
  spreadsheets,
  onSelect,
  onDelete,
  onRefresh,
  loading,
}: {
  spreadsheets: Spreadsheet[]
  onSelect: (spreadsheet: Spreadsheet) => void
  onDelete: (spreadsheetId: string) => void
  onRefresh: () => void
  loading: boolean
}) {
  return (
    <div className="flex flex-col min-h-full bg-gradient-to-b from-[var(--bg-secondary)] to-[var(--bg-primary)]">
      {/* Section header */}
      <div className="flex items-center justify-between px-6 py-5">
        <div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">Recent Spreadsheets</h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {spreadsheets.length} spreadsheet{spreadsheets.length !== 1 ? 's' : ''} available
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-primary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-xl transition-all disabled:opacity-50 shadow-sm hover:shadow"
        >
          <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
      
      {/* Spreadsheet grid — relies on the parent Window's overflow for scrolling */}
      <div className="flex-1 px-6 pb-6">
        {spreadsheets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            {/* Empty state with GridwellSheets-style icon */}
            <div className="w-28 h-28 mb-6 rounded-3xl bg-gradient-to-br from-[#059669] via-[#047857] to-[#047857] flex items-center justify-center shadow-xl">
              <svg className="w-14 h-14 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/>
                <path d="M7 7h2v2H7zm0 4h2v2H7zm0 4h2v2H7zm4-8h6v2h-6zm0 4h6v2h-6zm0 4h6v2h-6z"/>
              </svg>
            </div>
            <p className="text-xl font-semibold text-[var(--text-primary)] mb-2">No spreadsheets yet</p>
            <p className="text-sm text-[var(--text-secondary)] text-center max-w-sm">
              Create your first spreadsheet to start organizing and analyzing your data
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {/* Sort spreadsheets by modified time (newest first) */}
            {[...spreadsheets]
              .sort((a, b) => {
                const timeA = a.modifiedTime ? new Date(a.modifiedTime).getTime() : 0
                const timeB = b.modifiedTime ? new Date(b.modifiedTime).getTime() : 0
                return timeB - timeA // Descending (newest first)
              })
              .map((spreadsheet) => (
              <div
                key={spreadsheet.spreadsheetId}
                className="group relative bg-[var(--bg-primary)] rounded-2xl border border-[var(--border-color)] hover:border-[#0D9488]/40 hover:shadow-xl cursor-pointer transition-all duration-300 overflow-hidden transform hover:-translate-y-1"
                onClick={() => onSelect(spreadsheet)}
              >
                {/* Card content - clean design without preview */}
                <div className="p-5">
                  {/* Header with icon and title */}
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#059669] to-[#047857] flex items-center justify-center flex-shrink-0 shadow-md group-hover:shadow-lg group-hover:scale-105 transition-all">
                      <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/>
                        <path d="M7 7h2v2H7zm0 4h2v2H7zm0 4h2v2H7zm4-8h6v2h-6zm0 4h6v2h-6zm0 4h6v2h-6z"/>
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0 pt-1">
                      <h3 className="font-semibold text-[var(--text-primary)] truncate group-hover:text-[#0D9488] transition-colors text-base">
                        {spreadsheet.properties.title}
                        <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{spreadsheet.spreadsheetId}]</span>
                      </h3>
                      <p className="text-sm text-[var(--text-secondary)] mt-1">
                        {spreadsheet.sheets?.length || 0} sheet{(spreadsheet.sheets?.length || 0) !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  
                  {/* Footer with metadata */}
                  <div className="mt-5 pt-4 border-t border-[var(--border-color)] flex items-center justify-between">
                    <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {spreadsheet.modifiedTime 
                        ? `Modified ${new Date(spreadsheet.modifiedTime).toLocaleDateString()}`
                        : 'Recently created'
                      }
                    </p>
                    <div className="text-xs text-[var(--text-secondary)] px-2 py-1 bg-[#f1f3f4] dark:bg-[var(--bg-tertiary)] rounded-full">
                      Spreadsheet
                    </div>
                  </div>
                </div>
                
                {/* Delete button - appears on hover */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm(`Delete "${spreadsheet.properties.title}"?`)) {
                      onDelete(spreadsheet.spreadsheetId)
                    }
                  }}
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-2 bg-white/90 dark:bg-[var(--bg-primary)]/90 backdrop-blur-sm text-[var(--text-secondary)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all shadow-lg"
                  title="Delete spreadsheet"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Sheet Tab Bar Component - displays tabs for each sheet in a spreadsheet
 * Modern tab styling similar to GridwellSheets
 */
function SheetTabBar({
  sheets,
  activeSheetId,
  onSelectSheet,
  onAddSheet,
  onDeleteSheet,
  onRenameSheet,
}: {
  sheets: Sheet[]
  activeSheetId: number | null
  onSelectSheet: (sheetId: number) => void
  onAddSheet: () => void
  onDeleteSheet: (sheetId: number) => void
  onRenameSheet: (sheetId: number) => void
}) {
  return (
    <div className="flex items-end h-10 border-t border-[var(--border-color)] bg-[#F0FDFA] dark:bg-[var(--bg-secondary)] overflow-x-auto px-2 gap-1">
      {/* Add sheet button */}
      <button
        onClick={onAddSheet}
        className="flex items-center justify-center w-8 h-8 mb-0.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white dark:hover:bg-[var(--bg-tertiary)] rounded-lg transition-all"
        title="Add sheet"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>
      
      {/* Divider */}
      <div className="w-px h-6 bg-[var(--border-color)] mx-1 mb-1" />
      
      {/* Sheet tabs */}
      {sheets.map((sheet) => {
        const isActive = activeSheetId === sheet.properties.sheetId
        return (
          <div
            key={sheet.properties.sheetId}
            className={`flex items-center gap-1 group relative rounded-t-lg transition-all duration-200 ${
              isActive
                ? 'bg-white dark:bg-[var(--bg-primary)] shadow-sm'
                : 'hover:bg-white/60 dark:hover:bg-[var(--bg-tertiary)]'
            }`}
          >
            {/* Active indicator bar */}
            {isActive && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0D9488] rounded-full" />
            )}
            
            <button
              onClick={() => onSelectSheet(sheet.properties.sheetId)}
              onDoubleClick={() => onRenameSheet(sheet.properties.sheetId)}
              className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? 'text-[#0D9488]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              title="Double-click to rename"
            >
              {sheet.properties.title}
              <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{sheet.properties.sheetId}]</span>
            </button>
            
            {/* Delete button */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (sheets.length <= 1) {
                  alert('At least one sheet must be open.')
                  return
                }
                if (confirm(`Delete "${sheet.properties.title}"?`)) {
                  onDeleteSheet(sheet.properties.sheetId)
                }
              }}
              className={`p-1 mr-2 rounded transition-all ${
                isActive 
                  ? 'text-[var(--text-secondary)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                  : 'text-[var(--text-secondary)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100'
              }`}
              title="Delete sheet"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Formula Bar Component - displays and edits the active cell's content
 * Modern GridwellSheets-style formula bar
 */
function FormulaBar({
  cellRef,
  value,
  onChange,
  onSubmit,
}: {
  cellRef: string
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
}) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onSubmit()
    }
  }

  return (
    <div className="flex items-center h-9 border-b border-[var(--border-color)] bg-white dark:bg-[var(--bg-secondary)]">
      {/* Cell reference box */}
      <div className="flex items-center justify-center px-3 h-full border-r border-[var(--border-color)] bg-[#f8f9fa] dark:bg-[var(--bg-tertiary)] min-w-[90px]">
        <span className="text-sm font-semibold font-mono text-[var(--text-primary)] tracking-wide">
          {cellRef || 'A1'}
        </span>
      </div>
      
      {/* Function icon */}
      <div className="flex items-center justify-center w-10 h-full border-r border-[var(--border-color)]">
        <span className="text-base font-medium italic text-[#5f6368] dark:text-[var(--text-secondary)]">
          𝑓𝑥
        </span>
      </div>
      
      {/* Input field */}
      <div className="flex-1 flex items-center h-full px-3 bg-white dark:bg-[var(--bg-primary)]">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full bg-transparent text-[var(--text-primary)] outline-none text-sm font-mono placeholder:text-[var(--text-secondary)]/50"
          placeholder="Enter value or formula (e.g., =SUM(A1:A10))"
        />
      </div>
    </div>
  )
}

/**
 * Selection range type for multi-cell selection
 */
type SelectionRange = {
  startRow: number
  startCol: number
  endRow: number
  endCol: number
}

/**
 * Spreadsheet Grid Component - the main grid for viewing/editing cells
 */
function SpreadsheetGrid({
  data,
  rowCount,
  colCount,
  activeCell,
  onSelectCell,
  onStartEditing,
  editingCell,
  editValue,
  onEditChange,
  onEditSubmit,
  onEditCancel,
  onClearCell,
  onClearSelection,
  selection,
  onSelectionChange,
  onCopy,
  onPaste,
  onCut,
  sheetsData,
  currentSheetTitle,
}: {
  data: (string | number | boolean | null)[][]
  rowCount: number
  colCount: number
  activeCell: { row: number; col: number } | null
  onSelectCell: (row: number, col: number, extend?: boolean) => void
  onStartEditing: (row: number, col: number, initialValue?: string) => void
  editingCell: { row: number; col: number } | null
  editValue: string
  onEditChange: (value: string) => void
  onEditSubmit: (moveToNextRow?: boolean) => void
  onEditCancel: () => void
  onClearCell: () => void
  onClearSelection: () => void
  selection: SelectionRange | null
  onSelectionChange: (selection: SelectionRange | null) => void
  onCopy: () => void
  onPaste: () => void
  onCut: () => void
  sheetsData: Record<string, (string | number | boolean | null)[][]>
  currentSheetTitle?: string
}) {
  const gridRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<{ row: number; col: number } | null>(null)
  
  // Track mouse start position for drag threshold detection
  const mouseStartPos = useRef<{ x: number; y: number } | null>(null)
  const hasDragStarted = useRef(false)
  
  // Use a ref to track the "immediate" active cell for keyboard handling
  // This bypasses React's async state batching
  const activeCellRef = useRef<{ row: number; col: number } | null>(activeCell)
  
  // Keep ref in sync with state
  useEffect(() => {
    activeCellRef.current = activeCell
  }, [activeCell])
  
  // Generate column headers (A, B, C, ...)
  const columnHeaders = Array.from({ length: colCount }, (_, i) => colIndexToLetter(i))
  
  // Check if a cell is within the selection
  const isCellSelected = useCallback((row: number, col: number): boolean => {
    if (!selection) return false
    const minRow = Math.min(selection.startRow, selection.endRow)
    const maxRow = Math.max(selection.startRow, selection.endRow)
    const minCol = Math.min(selection.startCol, selection.endCol)
    const maxCol = Math.max(selection.startCol, selection.endCol)
    return row >= minRow && row <= maxRow && col >= minCol && col <= maxCol
  }, [selection])
  
  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Use the ref for immediate access (bypasses React's async state batching)
    const currentActiveCell = activeCellRef.current
    if (!currentActiveCell) return

    // If editing, let the input handle key events
    if (editingCell) return

    const { row, col } = currentActiveCell
    let newRow = row
    let newCol = col
    
    // Handle Ctrl/Cmd shortcuts for copy/paste/cut
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'c':
          e.preventDefault()
          onCopy()
          return
        case 'v':
          e.preventDefault()
          onPaste()
          return
        case 'x':
          e.preventDefault()
          onCut()
          return
        case 'a':
          // Select all could be added here if needed
          return
      }
    }
    
    switch (e.key) {
      case 'ArrowUp':
        newRow = Math.max(0, row - 1)
        break
      case 'ArrowDown':
        newRow = Math.min(rowCount - 1, row + 1)
        break
      case 'ArrowLeft':
        newCol = Math.max(0, col - 1)
        break
      case 'ArrowRight':
        newCol = Math.min(colCount - 1, col + 1)
        break
      case 'Enter':
      case 'F2':
        e.preventDefault()
        onStartEditing(row, col)
        return
      case 'Tab':
        e.preventDefault()
        newCol = e.shiftKey ? Math.max(0, col - 1) : Math.min(colCount - 1, col + 1)
        break
      case 'Delete':
      case 'Backspace':
        e.preventDefault()
        // Clear selection or single cell
        if (selection) {
          onClearSelection()
        } else {
          onClearCell()
        }
        return
      default:
        // Start typing (replace cell content) - pass initial character to avoid it being overwritten
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          e.preventDefault()
          onStartEditing(row, col, e.key)
        }
        return
    }
    
    if (newRow !== row || newCol !== col) {
      e.preventDefault()
      // Shift+Arrow extends selection
      if (e.shiftKey) {
        const newSelection: SelectionRange = selection 
          ? { ...selection, endRow: newRow, endCol: newCol }
          : { startRow: row, startCol: col, endRow: newRow, endCol: newCol }
        onSelectionChange(newSelection)
      } else {
        onSelectionChange(null)
      }
      onSelectCell(newRow, newCol, e.shiftKey)
    }
  }, [activeCell, editingCell, rowCount, colCount, onSelectCell, onStartEditing, onClearCell, onClearSelection, selection, onSelectionChange, onCopy, onPaste, onCut])

  // Handle edit cell key events
  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onEditSubmit(true) // Move to next row on Enter
    } else if (e.key === 'Escape') {
      onEditCancel()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      onEditSubmit(false) // Don't move on Tab (Tab navigation handled separately if needed)
    }
  }

  // Focus grid on mount or when active cell changes (if not editing)
  useEffect(() => {
    if (gridRef.current && !editingCell) {
      gridRef.current.focus()
    }
  }, [activeCell, editingCell])

  const getDisplayValue = (row: number, col: number): string => {
    if (!data[row]) return ''
    const value = data[row][col]

    if (value === null || value === undefined) return ''

    if (typeof value === 'string' && value.startsWith('=')) {
      const result = evaluateFormula(value, data, {
        sheets: sheetsData,
        currentSheet: currentSheetTitle,
      })
      return result === null ? '' : String(result)
    }

    return String(value)
  }


  // Track if mouse button is currently pressed (more reliable than relying on state)
  const isMouseDown = useRef(false)

  // Handle mouse down for cell selection (single click)
  // Double-click for editing is handled by onDoubleClick event
  const handleCellMouseDown = (e: React.MouseEvent, row: number, col: number) => {
    // Only handle left mouse button
    if (e.button !== 0) return
    
    // Mark mouse as down
    isMouseDown.current = true
    
    // Track mouse start position for drag threshold
    mouseStartPos.current = { x: e.clientX, y: e.clientY }
    hasDragStarted.current = false
    
    // Force focus to the grid container to ensure keyboard events are captured immediately
    gridRef.current?.focus({ preventScroll: true })
    
    if (e.shiftKey && activeCell) {
      // Shift+click extends selection from active cell
      const newSelection: SelectionRange = {
        startRow: activeCell.row,
        startCol: activeCell.col,
        endRow: row,
        endCol: col,
      }
      onSelectionChange(newSelection)
    } else {
      // Single click: select cell (typing will replace content)
      // Double click is handled separately by onDoubleClick (enters edit mode)
      setDragStart({ row, col })
      onSelectionChange(null)
      
      // Update both ref AND state for immediate keyboard access
      activeCellRef.current = { row, col }
      onSelectCell(row, col, false)
    }
  }

  // Handle mouse move for drag selection (with threshold check)
  const handleCellMouseMove = (e: React.MouseEvent, row: number, col: number) => {
    // CRITICAL: Only process if mouse button is actually pressed
    // e.buttons is a bitmask: 1 = left button pressed
    if ((e.buttons & 1) === 0) {
      // Mouse button not pressed, reset drag state if needed
      if (dragStart) {
        setDragStart(null)
        isMouseDown.current = false
      }
      return
    }
    
    // Must have started a drag from a cell
    if (!dragStart || !mouseStartPos.current || !isMouseDown.current) return
    
    // Check if mouse has moved beyond threshold (10 pixels - increased for reliability)
    const dx = e.clientX - mouseStartPos.current.x
    const dy = e.clientY - mouseStartPos.current.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    
    // Increased threshold to 10 pixels to prevent accidental selections
    if (distance < 10 && !hasDragStarted.current) {
      // Not enough movement, don't start drag yet
      return
    }
    
    // Start drag if not started and moved beyond threshold
    if (!hasDragStarted.current) {
      hasDragStarted.current = true
      setIsDragging(true)
    }
    
    // Only update selection if we're actually dragging
    if (hasDragStarted.current) {
      const newSelection: SelectionRange = {
        startRow: dragStart.row,
        startCol: dragStart.col,
        endRow: row,
        endCol: col,
      }
      onSelectionChange(newSelection)
    }
  }

  // Handle mouse up to end drag selection
  useEffect(() => {
    const handleMouseUp = () => {
      // Reset all drag-related state
      isMouseDown.current = false
      setIsDragging(false)
      setDragStart(null)
      mouseStartPos.current = null
      hasDragStarted.current = false
    }
    
    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, [])

  return (
    <div
      ref={gridRef}
      className="flex-1 overflow-auto bg-white select-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <table className="border-collapse min-w-full">
        <thead className="sticky top-0 z-10">
          <tr>
            {/* Row number header */}
            <th className="w-12 h-6 bg-[#f8f9fa] border border-[#e0e0e0] text-xs font-medium text-[#5f6368]" />
            {/* Column headers */}
            {columnHeaders.map((letter, i) => {
              const isColSelected = selection && i >= Math.min(selection.startCol, selection.endCol) && i <= Math.max(selection.startCol, selection.endCol)
              const isActiveCol = activeCell?.col === i
              return (
                <th
                  key={letter}
                  className={`min-w-[100px] h-6 border border-[#e0e0e0] text-xs font-medium transition-colors ${
                    isActiveCol 
                      ? 'bg-[#0D9488] text-white font-bold' 
                      : isColSelected 
                        ? 'bg-[#CCFBF1] text-[#0D9488] font-semibold' 
                        : 'bg-[#f8f9fa] text-[#5f6368]'
                  }`}
                >
                  {letter}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }, (_, rowIdx) => {
            const isRowSelected = selection && rowIdx >= Math.min(selection.startRow, selection.endRow) && rowIdx <= Math.max(selection.startRow, selection.endRow)
            const isActiveRow = activeCell?.row === rowIdx
            return (
              <tr key={rowIdx}>
                {/* Row number */}
                <td
                  className={`w-12 h-[21px] border border-[#e0e0e0] text-xs font-medium text-center transition-colors ${
                    isActiveRow 
                      ? 'bg-[#0D9488] text-white font-bold' 
                      : isRowSelected 
                        ? 'bg-[#CCFBF1] text-[#0D9488] font-semibold' 
                        : 'bg-[#f8f9fa] text-[#5f6368]'
                  }`}
                >
                  {rowIdx + 1}
                </td>
                {/* Cells */}
                {Array.from({ length: colCount }, (_, colIdx) => {
                  const isActive = activeCell?.row === rowIdx && activeCell?.col === colIdx
                  const isEditing = editingCell?.row === rowIdx && editingCell?.col === colIdx
                  const isSelected = isCellSelected(rowIdx, colIdx)
                  const cellValue = getDisplayValue(rowIdx, colIdx)
                  
                  return (
                    <td
                      key={colIdx}
                      className={`min-w-[100px] h-[21px] border border-[#e0e0e0] p-0 text-sm ${
                        isActive ? 'outline outline-2 outline-[#0D9488] outline-offset-[-1px] z-10 relative' : ''
                      } ${isSelected && !isActive ? 'bg-[#F0FDFA]' : ''}`}
                      onMouseDown={(e) => handleCellMouseDown(e, rowIdx, colIdx)}
                      onMouseMove={(e) => handleCellMouseMove(e, rowIdx, colIdx)}
                      onDoubleClick={() => onStartEditing(rowIdx, colIdx)}
                    >
                      {isEditing ? (
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => onEditChange(e.target.value)}
                          onKeyDown={handleEditKeyDown}
                          onBlur={() => onEditSubmit(false)}
                          autoFocus
                          className="w-full h-full px-1 text-sm outline-none border-none bg-white text-black"
                        />
                      ) : (
                        <div className="px-1 truncate text-black">{cellValue}</div>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Create Spreadsheet Modal
 */
function CreateSpreadsheetModal({
  isOpen,
  onClose,
  onCreate,
  loading,
}: {
  isOpen: boolean
  onClose: () => void
  onCreate: (title: string) => void
  loading: boolean
}) {
  const [title, setTitle] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (title.trim()) {
      onCreate(title.trim())
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[var(--bg-primary)] rounded-2xl shadow-2xl w-[440px] overflow-hidden transform animate-in zoom-in-95 duration-200">
        {/* Header with icon */}
        <div className="px-6 py-5 border-b border-[var(--border-color)] bg-gradient-to-r from-[#f8f9fa] to-white dark:from-[var(--bg-secondary)] dark:to-[var(--bg-primary)]">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#059669] to-[#047857] flex items-center justify-center shadow-lg">
              <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/>
                <path d="M7 7h2v2H7zm0 4h2v2H7zm0 4h2v2H7zm4-8h6v2h-6zm0 4h6v2h-6zm0 4h6v2h-6z"/>
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-[var(--text-primary)]">New Spreadsheet</h3>
              <p className="text-sm text-[var(--text-secondary)] mt-0.5">Create a blank spreadsheet</p>
            </div>
          </div>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="p-6">
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
              Name your spreadsheet
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Budget 2024, Sales Report..."
              className="w-full px-4 py-3 bg-[#f8f9fa] dark:bg-[var(--bg-secondary)] border-2 border-transparent rounded-xl text-[var(--text-primary)] outline-none focus:border-[#0D9488] focus:bg-white dark:focus:bg-[var(--bg-primary)] transition-all placeholder:text-[var(--text-secondary)]/50"
              autoFocus
            />
          </div>
          
          <div className="px-6 py-4 border-t border-[var(--border-color)] bg-[#f8f9fa] dark:bg-[var(--bg-secondary)] flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white dark:hover:bg-[var(--bg-primary)] rounded-lg transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim()}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Create Spreadsheet
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/**
 * Add Sheet Modal
 */
function AddSheetModal({
  isOpen,
  onClose,
  onAdd,
  loading,
}: {
  isOpen: boolean
  onClose: () => void
  onAdd: (title: string) => void
  loading: boolean
}) {
  const [title, setTitle] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onAdd(title.trim() || 'Sheet')
  }

  useEffect(() => {
    if (isOpen) {
      setTitle('')
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white dark:bg-[var(--bg-primary)] rounded-2xl shadow-2xl w-[400px] overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--border-color)] bg-[#f8f9fa] dark:bg-[var(--bg-secondary)]">
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">Add New Sheet</h3>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">Create a new sheet in this spreadsheet</p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-6">
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
              Sheet name
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Data, Summary, Charts..."
              className="w-full px-4 py-3 bg-[#f8f9fa] dark:bg-[var(--bg-secondary)] border-2 border-transparent rounded-xl text-[var(--text-primary)] outline-none focus:border-[#0D9488] focus:bg-white dark:focus:bg-[var(--bg-primary)] transition-all"
              autoFocus
            />
          </div>
          <div className="px-6 py-4 border-t border-[var(--border-color)] bg-[#f8f9fa] dark:bg-[var(--bg-secondary)] flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white dark:hover:bg-[var(--bg-primary)] rounded-lg transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 text-sm font-medium bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg transition-all disabled:opacity-50 shadow-md"
            >
              {loading ? 'Adding...' : 'Add Sheet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/**
 * Rename Sheet Modal
 */
function RenameSheetModal({
  isOpen,
  onClose,
  onRename,
  currentName,
  loading,
}: {
  isOpen: boolean
  onClose: () => void
  onRename: (title: string) => void
  currentName: string
  loading: boolean
}) {
  const [title, setTitle] = useState(currentName)

  // Update title when currentName changes or modal opens
  useEffect(() => {
    setTitle(currentName)
  }, [currentName, isOpen])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (title.trim() && title.trim() !== currentName) {
      onRename(title.trim())
    } else {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white dark:bg-[var(--bg-primary)] rounded-2xl shadow-2xl w-[400px] overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--border-color)] bg-[#f8f9fa] dark:bg-[var(--bg-secondary)]">
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">Rename Sheet</h3>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">Enter a new name for this sheet</p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-6">
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
              Sheet name
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-3 bg-[#f8f9fa] dark:bg-[var(--bg-secondary)] border-2 border-transparent rounded-xl text-[var(--text-primary)] outline-none focus:border-[#0D9488] focus:bg-white dark:focus:bg-[var(--bg-primary)] transition-all"
              autoFocus
            />
          </div>
          <div className="px-6 py-4 border-t border-[var(--border-color)] bg-[#f8f9fa] dark:bg-[var(--bg-secondary)] flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white dark:hover:bg-[var(--bg-primary)] rounded-lg transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 text-sm font-medium bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg transition-all disabled:opacity-50 shadow-md"
            >
              {loading ? 'Saving...' : 'Rename'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ============================================================================
// Batch Get Values Modal
// ============================================================================

/**
 * Batch Get Values Modal - Get values from multiple ranges at once
 */
function BatchGetValuesModal({
  isOpen,
  onClose,
  onBatchGet,
  onNewQuery,
  loading,
  results,
}: {
  isOpen: boolean
  onClose: () => void
  onBatchGet: (ranges: string[]) => Promise<void>
  onNewQuery: () => void
  loading: boolean
  results: Array<{ range: string; values: (string | number | boolean | null)[][] }> | null
}) {
  const [rangesInput, setRangesInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!rangesInput.trim()) {
      setError('Please enter at least one range')
      return
    }

    // Split by newlines and filter empty lines
    const ranges = rangesInput
      .split('\n')
      .map(r => r.trim())
      .filter(r => r.length > 0)

    if (ranges.length === 0) {
      setError('Please enter at least one range')
      return
    }

    setError(null)
    await onBatchGet(ranges)
  }

  const handleClose = () => {
    setRangesInput('')
    setError(null)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-[var(--bg-secondary)] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">Get Batch</h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-4">
              {/* Input Section */}
              {!results && (
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                    Ranges (one per line)
                  </label>
                  <p className="text-xs text-[var(--text-secondary)] mb-3">
                    Enter ranges in A1 notation. Examples:
                  </p>
                  <ul className="text-xs text-[var(--text-secondary)] mb-3 space-y-1 pl-4">
                    <li>• Sheet1!A1:B10</li>
                    <li>• Sheet2!D1:E5</li>
                    <li>• 'My Sheet'!A1:C20</li>
                  </ul>
                  <textarea
                    value={rangesInput}
                    onChange={(e) => setRangesInput(e.target.value)}
                    placeholder="Sheet1!A1:B10&#10;Sheet2!D1:E5"
                    rows={6}
                    className="w-full px-4 py-3 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D9488] bg-[var(--bg-primary)] text-[var(--text-primary)] font-mono text-sm"
                    disabled={loading}
                  />
                </div>
              )}

              {/* Results Section */}
              {results && results.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                      Results ({results.length} range{results.length > 1 ? 's' : ''})
                    </h3>
                    <button
                      type="button"
                      onClick={() => {
                        setRangesInput('')
                        setError(null)
                        onNewQuery()
                      }}
                      className="text-sm text-[#0D9488] hover:underline"
                    >
                      New Query
                    </button>
                  </div>

                  {results.map((result, idx) => (
                    <div key={idx} className="border border-[var(--border-color)] rounded-lg overflow-hidden">
                      <div className="px-4 py-2 bg-[#f8f9fa] dark:bg-[var(--bg-tertiary)] border-b border-[var(--border-color)]">
                        <p className="text-sm font-medium text-[var(--text-primary)] font-mono">{result.range}</p>
                      </div>
                      <div className="p-4 overflow-x-auto">
                        {result.values && result.values.length > 0 ? (
                          <table className="min-w-full text-sm border-collapse">
                            <tbody>
                              {result.values.map((row, rowIdx) => (
                                <tr key={rowIdx}>
                                  {row.map((cell, cellIdx) => (
                                    <td
                                      key={cellIdx}
                                      className="border border-[var(--border-color)] px-3 py-2 text-[var(--text-primary)]"
                                    >
                                      {cell !== null && cell !== undefined ? String(cell) : ''}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p className="text-sm text-[var(--text-secondary)] italic">No data in range</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border-color)] bg-[#f8f9fa] dark:bg-[var(--bg-tertiary)]">
            {results ? (
              <button
                type="button"
                onClick={handleClose}
                className="px-5 py-2.5 text-sm font-medium bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg transition-all shadow-md"
              >
                Close
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-5 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !rangesInput.trim()}
                  className="px-5 py-2.5 text-sm font-medium bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg transition-all disabled:opacity-50 shadow-md"
                >
                  {loading ? 'Fetching...' : 'Get Batch'}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

// ============================================================================
// Copy Sheet Modal
// ============================================================================

/**
 * Copy Sheet Modal - Copy current sheet to another spreadsheet
 */
function CopySheetModal({
  isOpen,
  onClose,
  onCopy,
  loading,
  spreadsheets,
  currentSpreadsheetId,
  currentSheetTitle,
}: {
  isOpen: boolean
  onClose: () => void
  onCopy: (destinationSpreadsheetId: string) => Promise<boolean>
  loading: boolean
  spreadsheets: Spreadsheet[]
  currentSpreadsheetId: string
  currentSheetTitle: string
}) {
  const [selectedSpreadsheetId, setSelectedSpreadsheetId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Filter out the current spreadsheet from destination options
  const availableSpreadsheets = spreadsheets.filter(s => s.spreadsheetId !== currentSpreadsheetId)

  useEffect(() => {
    if (isOpen) {
      setSelectedSpreadsheetId('')
      setError(null)
      setSuccess(false)
    }
  }, [isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (!selectedSpreadsheetId) {
      setError('Please select a destination spreadsheet')
      return
    }

    const result = await onCopy(selectedSpreadsheetId)
    if (result) {
      setSuccess(true)
    } else {
      setError('Failed to copy sheet. Please try again.')
    }
  }

  const handleClose = () => {
    setSelectedSpreadsheetId('')
    setError(null)
    setSuccess(false)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-[var(--bg-secondary)] rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">Copy Sheet</h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-4">
              {/* Success message */}
              {success && (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <p className="text-sm text-green-600 dark:text-green-400">
                    Sheet "{currentSheetTitle}" copied successfully!
                  </p>
                </div>
              )}

              {/* Current sheet info */}
              <div className="p-3 bg-[#f8f9fa] dark:bg-[var(--bg-tertiary)] rounded-lg">
                <p className="text-sm text-[var(--text-secondary)]">
                  Copying sheet: <span className="font-medium text-[var(--text-primary)]">{currentSheetTitle}</span>
                </p>
              </div>

              {/* Destination spreadsheet selector */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                  Destination Spreadsheet
                </label>
                {availableSpreadsheets.length === 0 ? (
                  <p className="text-sm text-[var(--text-secondary)] italic">
                    No other spreadsheets available. Create another spreadsheet first.
                  </p>
                ) : (
                  <select
                    value={selectedSpreadsheetId}
                    onChange={(e) => setSelectedSpreadsheetId(e.target.value)}
                    className="w-full px-4 py-2.5 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D9488] bg-[var(--bg-primary)] text-[var(--text-primary)]"
                    disabled={loading || success}
                  >
                    <option value="">Select a spreadsheet...</option>
                    {availableSpreadsheets.map(s => (
                      <option key={s.spreadsheetId} value={s.spreadsheetId}>
                        {s.properties.title}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Error message */}
              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border-color)] bg-[#f8f9fa] dark:bg-[var(--bg-tertiary)]">
            <button
              type="button"
              onClick={handleClose}
              className="px-5 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              disabled={loading}
            >
              {success ? 'Close' : 'Cancel'}
            </button>
            {!success && (
              <button
                type="submit"
                disabled={loading || !selectedSpreadsheetId || availableSpreadsheets.length === 0}
                className="px-5 py-2.5 text-sm font-medium bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg transition-all disabled:opacity-50 shadow-md"
              >
                {loading ? 'Copying...' : 'Copy Sheet'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

// ============================================================================
// Batch Clear Values Modal
// ============================================================================

/**
 * Batch Clear Values Modal - Clear values from multiple ranges at once
 */
function BatchClearValuesModal({
  isOpen,
  onClose,
  onBatchClear,
  loading,
}: {
  isOpen: boolean
  onClose: () => void
  onBatchClear: (ranges: string[]) => Promise<boolean>
  loading: boolean
}) {
  const [rangesInput, setRangesInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [clearedRanges, setClearedRanges] = useState<string[]>([])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (!rangesInput.trim()) {
      setError('Please enter at least one range')
      return
    }

    // Split by newlines, filter empty lines, and format sheet names properly
    const ranges = rangesInput
      .split('\n')
      .map(r => r.trim())
      .filter(r => r.length > 0)
      .map(r => formatUserA1Range(r))

    if (ranges.length === 0) {
      setError('Please enter at least one range')
      return
    }

    const result = await onBatchClear(ranges)
    if (result) {
      setSuccess(true)
      setClearedRanges(ranges)
    } else {
      setError('Failed to clear values. Please check your ranges and try again.')
    }
  }

  const handleClose = () => {
    setRangesInput('')
    setError(null)
    setSuccess(false)
    setClearedRanges([])
    onClose()
  }

  const handleNewClear = () => {
    setRangesInput('')
    setError(null)
    setSuccess(false)
    setClearedRanges([])
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-[var(--bg-secondary)] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">Batch Clear</h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-4">
              {/* Success message */}
              {success && (
                <div className="space-y-3">
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                    <p className="text-sm text-green-600 dark:text-green-400">
                      Successfully cleared {clearedRanges.length} range{clearedRanges.length > 1 ? 's' : ''}!
                    </p>
                  </div>
                  <div className="border border-[var(--border-color)] rounded-lg overflow-hidden">
                    <div className="px-4 py-2 bg-[#f8f9fa] dark:bg-[var(--bg-tertiary)] border-b border-[var(--border-color)]">
                      <p className="text-sm font-medium text-[var(--text-primary)]">Cleared Ranges:</p>
                    </div>
                    <div className="p-3">
                      <ul className="space-y-1 text-sm font-mono text-[var(--text-secondary)]">
                        {clearedRanges.map((range, idx) => (
                          <li key={idx}>{range}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleNewClear}
                    className="text-sm text-[#0D9488] hover:underline"
                  >
                    Clear More Ranges
                  </button>
                </div>
              )}

              {/* Input Section */}
              {!success && (
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                    Ranges to Clear (one per line)
                  </label>
                  <p className="text-xs text-[var(--text-secondary)] mb-3">
                    Enter ranges in A1 notation. Examples:
                  </p>
                  <ul className="text-xs text-[var(--text-secondary)] mb-3 space-y-1 pl-4">
                    <li>• Sheet1!A1:B10</li>
                    <li>• Sheet2!D1:E5</li>
                    <li>• 'My Sheet'!A1:C20</li>
                  </ul>
                  <textarea
                    value={rangesInput}
                    onChange={(e) => setRangesInput(e.target.value)}
                    placeholder="Sheet1!A1:B10&#10;Sheet2!D1:E5"
                    rows={6}
                    className="w-full px-4 py-3 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D9488] bg-[var(--bg-primary)] text-[var(--text-primary)] font-mono text-sm"
                    disabled={loading}
                  />
                </div>
              )}

              {/* Error message */}
              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border-color)] bg-[#f8f9fa] dark:bg-[var(--bg-tertiary)]">
            {success ? (
              <button
                type="button"
                onClick={handleClose}
                className="px-5 py-2.5 text-sm font-medium bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg transition-all shadow-md"
              >
                Close
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-5 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !rangesInput.trim()}
                  className="px-5 py-2.5 text-sm font-medium bg-[#E11D48] hover:bg-[#BE123C] text-white rounded-lg transition-all disabled:opacity-50 shadow-md"
                >
                  {loading ? 'Clearing...' : 'Clear Ranges'}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

// ============================================================================
// Data Filter Modal
// ============================================================================

/**
 * Data Filter Modal - Get or clear values using data filters
 */
function DataFilterModal({
  isOpen,
  onClose,
  onGetByFilter,
  onBatchClearByFilter,
  onBatchUpdateByFilter,
  onGetSpreadsheetByFilter,
  loading,
  results,
  onNewQuery,
}: {
  isOpen: boolean
  onClose: () => void
  onGetByFilter: (filters: Array<{ a1Range?: string; gridRange?: { sheetId: number; startRowIndex?: number; endRowIndex?: number; startColumnIndex?: number; endColumnIndex?: number } }>) => Promise<void>
  onBatchClearByFilter: (filters: Array<{ a1Range?: string; gridRange?: { sheetId: number; startRowIndex?: number; endRowIndex?: number; startColumnIndex?: number; endColumnIndex?: number } }>) => Promise<boolean>
  onBatchUpdateByFilter: (filters: Array<{ a1Range?: string; gridRange?: { sheetId: number; startRowIndex?: number; endRowIndex?: number; startColumnIndex?: number; endColumnIndex?: number } }>, values: (string | number | boolean | null)[][], valueInputOption: string) => Promise<boolean>
  onGetSpreadsheetByFilter: (filters: Array<{ a1Range?: string; gridRange?: { sheetId: number; startRowIndex?: number; endRowIndex?: number; startColumnIndex?: number; endColumnIndex?: number } }>, includeGridData: boolean) => Promise<void>
  loading: boolean
  results: Array<{ dataFilters: Array<{ a1Range?: string }>; valueRange?: { range: string; values: (string | number | boolean | null)[][] } }> | null
  onNewQuery: () => void
}) {
  const [mode, setMode] = useState<'get' | 'clear' | 'update' | 'getSpreadsheet'>('get')
  const [filterType, setFilterType] = useState<'a1Range' | 'gridRange'>('a1Range')
  const [a1Ranges, setA1Ranges] = useState('')
  const [sheetId, setSheetId] = useState('0')
  const [startRow, setStartRow] = useState('')
  const [endRow, setEndRow] = useState('')
  const [startCol, setStartCol] = useState('')
  const [endCol, setEndCol] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [clearSuccess, setClearSuccess] = useState(false)
  const [updateValues, setUpdateValues] = useState('')
  const [valueInputOption, setValueInputOption] = useState('RAW')
  const [includeGridData, setIncludeGridData] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setMode('get')
      setFilterType('a1Range')
      setA1Ranges('')
      setSheetId('0')
      setStartRow('')
      setEndRow('')
      setStartCol('')
      setEndCol('')
      setError(null)
      setClearSuccess(false)
      setUpdateValues('')
      setValueInputOption('RAW')
      setIncludeGridData(false)
    }
  }, [isOpen])

  const buildFilters = () => {
    if (filterType === 'a1Range') {
      const ranges = a1Ranges
        .split('\n')
        .map(r => r.trim())
        .filter(r => r.length > 0)
      return ranges.map(range => ({ a1Range: formatUserA1Range(range) }))
    } else {
      const gridRange: { sheetId: number; startRowIndex?: number; endRowIndex?: number; startColumnIndex?: number; endColumnIndex?: number } = {
        sheetId: parseInt(sheetId) || 0,
      }
      if (startRow) gridRange.startRowIndex = parseInt(startRow)
      if (endRow) gridRange.endRowIndex = parseInt(endRow)
      if (startCol) gridRange.startColumnIndex = parseInt(startCol)
      if (endCol) gridRange.endColumnIndex = parseInt(endCol)
      return [{ gridRange }]
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setClearSuccess(false)

    const filters = buildFilters()
    if (filters.length === 0) {
      setError('Please enter at least one filter')
      return
    }

    if (mode === 'get') {
      await onGetByFilter(filters)
    } else if (mode === 'clear') {
      const result = await onBatchClearByFilter(filters)
      if (result) {
        setClearSuccess(true)
      } else {
        setError('Failed to clear values')
      }
    } else if (mode === 'update') {
      // Parse CSV-like values input into 2D array
      const parsedValues = updateValues.trim().split('\n').map(row =>
        row.split('\t').length > 1 ? row.split('\t') : row.split(',')
      )
      if (parsedValues.length === 0 || (parsedValues.length === 1 && parsedValues[0][0] === '')) {
        setError('Please enter values to update (rows separated by newlines, columns by tab or comma)')
        return
      }
      const result = await onBatchUpdateByFilter(filters, parsedValues, valueInputOption)
      if (result) {
        setClearSuccess(true)
      } else {
        setError('Failed to update values')
      }
    } else if (mode === 'getSpreadsheet') {
      await onGetSpreadsheetByFilter(filters, includeGridData)
    }
  }

  const handleClose = () => {
    setA1Ranges('')
    setError(null)
    setClearSuccess(false)
    onClose()
  }

  const handleNewQueryClick = () => {
    setA1Ranges('')
    setError(null)
    setClearSuccess(false)
    onNewQuery()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-[var(--bg-secondary)] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">Data Filter Operations</h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-4">
              {/* Success message for clear */}
              {clearSuccess && (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <p className="text-sm text-green-600 dark:text-green-400">
                    Values cleared successfully!
                  </p>
                </div>
              )}

              {/* Results Section */}
              {results && results.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                      Results ({results.length} filter{results.length > 1 ? 's' : ''})
                    </h3>
                    <button
                      type="button"
                      onClick={handleNewQueryClick}
                      className="text-sm text-[#0D9488] hover:underline"
                    >
                      New Query
                    </button>
                  </div>

                  {results.map((result, idx) => (
                    <div key={idx} className="border border-[var(--border-color)] rounded-lg overflow-hidden">
                      <div className="px-4 py-2 bg-[#f8f9fa] dark:bg-[var(--bg-tertiary)] border-b border-[var(--border-color)]">
                        <p className="text-sm font-medium text-[var(--text-primary)] font-mono">
                          {result.valueRange?.range || result.dataFilters?.[0]?.a1Range || 'Grid Range'}
                        </p>
                      </div>
                      <div className="p-4 overflow-x-auto">
                        {result.valueRange?.values && result.valueRange.values.length > 0 ? (
                          <table className="min-w-full text-sm border-collapse">
                            <tbody>
                              {result.valueRange.values.map((row, rowIdx) => (
                                <tr key={rowIdx}>
                                  {row.map((cell, cellIdx) => (
                                    <td
                                      key={cellIdx}
                                      className="border border-[var(--border-color)] px-3 py-2 text-[var(--text-primary)]"
                                    >
                                      {cell !== null && cell !== undefined ? String(cell) : ''}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p className="text-sm text-[var(--text-secondary)] italic">No data in range</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Input Section */}
              {!results && !clearSuccess && (
                <>
                  {/* Mode selector */}
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                      Operation Mode
                    </label>
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="mode"
                          value="get"
                          checked={mode === 'get'}
                          onChange={() => setMode('get')}
                          className="w-4 h-4 text-[#0D9488]"
                        />
                        <span className="text-sm text-[var(--text-primary)]">Get Values</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="mode"
                          value="update"
                          checked={mode === 'update'}
                          onChange={() => setMode('update')}
                          className="w-4 h-4 text-[#0D9488]"
                        />
                        <span className="text-sm text-[var(--text-primary)]">Update Values</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="mode"
                          value="clear"
                          checked={mode === 'clear'}
                          onChange={() => setMode('clear')}
                          className="w-4 h-4 text-[#E11D48]"
                        />
                        <span className="text-sm text-[var(--text-primary)]">Clear Values</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="mode"
                          value="getSpreadsheet"
                          checked={mode === 'getSpreadsheet'}
                          onChange={() => setMode('getSpreadsheet')}
                          className="w-4 h-4 text-[#0D9488]"
                        />
                        <span className="text-sm text-[var(--text-primary)]">Get Spreadsheet</span>
                      </label>
                    </div>
                  </div>

                  {/* Filter type selector */}
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                      Filter Type
                    </label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="filterType"
                          value="a1Range"
                          checked={filterType === 'a1Range'}
                          onChange={() => setFilterType('a1Range')}
                          className="w-4 h-4 text-[#0D9488]"
                        />
                        <span className="text-sm text-[var(--text-primary)]">A1 Range</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="filterType"
                          value="gridRange"
                          checked={filterType === 'gridRange'}
                          onChange={() => setFilterType('gridRange')}
                          className="w-4 h-4 text-[#0D9488]"
                        />
                        <span className="text-sm text-[var(--text-primary)]">Grid Range</span>
                      </label>
                    </div>
                  </div>

                  {/* A1 Range input */}
                  {filterType === 'a1Range' && (
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                        A1 Ranges (one per line)
                      </label>
                      <textarea
                        value={a1Ranges}
                        onChange={(e) => setA1Ranges(e.target.value)}
                        placeholder="Sheet1!A1:B10&#10;Sheet2!C1:D5"
                        rows={4}
                        className="w-full px-4 py-3 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D9488] bg-[var(--bg-primary)] text-[var(--text-primary)] font-mono text-sm"
                        disabled={loading}
                      />
                    </div>
                  )}

                  {/* Grid Range inputs */}
                  {filterType === 'gridRange' && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                          Sheet ID
                        </label>
                        <input
                          type="number"
                          value={sheetId}
                          onChange={(e) => setSheetId(e.target.value)}
                          placeholder="0"
                          className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D9488] bg-[var(--bg-primary)] text-[var(--text-primary)]"
                          disabled={loading}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                            Start Row (0-indexed)
                          </label>
                          <input
                            type="number"
                            value={startRow}
                            onChange={(e) => setStartRow(e.target.value)}
                            placeholder="0"
                            className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D9488] bg-[var(--bg-primary)] text-[var(--text-primary)]"
                            disabled={loading}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                            End Row (0-indexed, exclusive)
                          </label>
                          <input
                            type="number"
                            value={endRow}
                            onChange={(e) => setEndRow(e.target.value)}
                            placeholder="10"
                            className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D9488] bg-[var(--bg-primary)] text-[var(--text-primary)]"
                            disabled={loading}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                            Start Column (0-indexed)
                          </label>
                          <input
                            type="number"
                            value={startCol}
                            onChange={(e) => setStartCol(e.target.value)}
                            placeholder="0"
                            className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D9488] bg-[var(--bg-primary)] text-[var(--text-primary)]"
                            disabled={loading}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                            End Column (0-indexed, exclusive)
                          </label>
                          <input
                            type="number"
                            value={endCol}
                            onChange={(e) => setEndCol(e.target.value)}
                            placeholder="5"
                            className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D9488] bg-[var(--bg-primary)] text-[var(--text-primary)]"
                            disabled={loading}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Update mode: values input and options */}
                  {mode === 'update' && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                          Value Input Option
                        </label>
                        <select
                          value={valueInputOption}
                          onChange={(e) => setValueInputOption(e.target.value)}
                          className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D9488] bg-[var(--bg-primary)] text-[var(--text-primary)]"
                          disabled={loading}
                        >
                          <option value="RAW">RAW</option>
                          <option value="USER_ENTERED">USER_ENTERED</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                          Values (rows by newline, columns by tab or comma)
                        </label>
                        <textarea
                          value={updateValues}
                          onChange={(e) => setUpdateValues(e.target.value)}
                          placeholder={"value1,value2,value3\nvalue4,value5,value6"}
                          rows={5}
                          className="w-full px-4 py-3 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D9488] bg-[var(--bg-primary)] text-[var(--text-primary)] font-mono text-sm"
                          disabled={loading}
                        />
                      </div>
                    </div>
                  )}

                  {/* Get Spreadsheet mode: includeGridData option */}
                  {mode === 'getSpreadsheet' && (
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={includeGridData}
                          onChange={(e) => setIncludeGridData(e.target.checked)}
                          className="w-4 h-4 text-[#0D9488]"
                          disabled={loading}
                        />
                        <span className="text-sm text-[var(--text-primary)]">Include Grid Data</span>
                      </label>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">
                        When enabled, returns cell data in addition to spreadsheet structure
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* Error message */}
              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border-color)] bg-[#f8f9fa] dark:bg-[var(--bg-tertiary)]">
            {results || clearSuccess ? (
              <button
                type="button"
                onClick={handleClose}
                className="px-5 py-2.5 text-sm font-medium bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg transition-all shadow-md"
              >
                Close
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-5 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || (filterType === 'a1Range' && !a1Ranges.trim()) || (mode === 'update' && !updateValues.trim())}
                  className={`px-5 py-2.5 text-sm font-medium text-white rounded-lg transition-all disabled:opacity-50 shadow-md ${
                    mode === 'clear'
                      ? 'bg-[#E11D48] hover:bg-[#BE123C]'
                      : 'bg-[#0D9488] hover:bg-[#0F766E]'
                  }`}
                >
                  {loading ? 'Processing...' : mode === 'get' ? 'Get Values' : mode === 'update' ? 'Update Values' : mode === 'getSpreadsheet' ? 'Get Spreadsheet' : 'Clear Values'}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

// ============================================================================
// Import Data Modal
// ============================================================================

/**
 * Import Data Modal - Append CSV data to a range
 */
function ImportDataModal({
  isOpen,
  onClose,
  onImport,
  loading,
  defaultRange,
}: {
  isOpen: boolean
  onClose: () => void
  onImport: (range: string, values: (string | number | boolean | null)[][]) => Promise<boolean>
  loading: boolean
  defaultRange: string
}) {
  const [range, setRange] = useState(defaultRange)
  const [csvInput, setCsvInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Update range when defaultRange changes
  useEffect(() => {
    if (isOpen) {
      setRange(defaultRange)
      setSuccess(false)
      setError(null)
    }
  }, [isOpen, defaultRange])

  const parseCSV = (input: string): (string | number | boolean | null)[][] => {
    // Handle both actual newlines and literal \n
    const normalizedInput = input.replace(/\\n/g, '\n')
    const lines = normalizedInput.trim().split('\n')

    const result = lines.map(line => {
      // Split by comma, handling basic cases
      return line.split(',').map(cell => {
        const trimmed = cell.trim()
        // Try to convert to number
        const num = Number(trimmed)
        if (!isNaN(num) && trimmed !== '') {
          return num
        }
        // Check for boolean
        if (trimmed.toLowerCase() === 'true') return true
        if (trimmed.toLowerCase() === 'false') return false
        // Return as string
        return trimmed
      })
    })
    return result
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)


    if (!range.trim()) {
      setError('Please enter a target range')
      return
    }

    if (!csvInput.trim()) {
      setError('Please enter data to import')
      return
    }

    const values = parseCSV(csvInput)

    if (values.length === 0 || values[0].length === 0) {
      setError('Invalid data format')
      return
    }

    const result = await onImport(range.trim(), values)

    if (result) {
      setSuccess(true)
      setCsvInput('')
    } else {
      setError('Import failed - check console for details')
    }
  }

  const handleClose = () => {
    setRange(defaultRange)
    setCsvInput('')
    setError(null)
    setSuccess(false)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-[var(--bg-secondary)] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">Import Data</h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-4">
              {/* Success message */}
              {success && (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <p className="text-sm text-green-600 dark:text-green-400">Data imported successfully!</p>
                </div>
              )}

              {/* Target Range */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                  Target Range
                </label>
                <input
                  type="text"
                  value={range}
                  onChange={(e) => setRange(e.target.value)}
                  placeholder="Sheet1!A:C"
                  className="w-full px-4 py-2.5 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D9488] bg-[var(--bg-primary)] text-[var(--text-primary)] font-mono text-sm"
                  disabled={loading}
                />
                <p className="text-xs text-[var(--text-secondary)] mt-1.5">
                  A1 notation (e.g., Sheet1!A:C). Data appends after the last row of the table found in this range.
                </p>
              </div>

              {/* Data Input */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                  Data to Import
                </label>
                <textarea
                  value={csvInput}
                  onChange={(e) => setCsvInput(e.target.value)}
                  placeholder="Bob,35,Engineer&#10;Alice,28,Designer&#10;Charlie,42,Manager"
                  rows={6}
                  className="w-full px-4 py-3 border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D9488] bg-[var(--bg-primary)] text-[var(--text-primary)] font-mono text-sm"
                  disabled={loading}
                />
                <p className="text-xs text-[var(--text-secondary)] mt-1.5">
                  Format: comma-separated values, one row per line
                </p>
              </div>

              {/* Error message */}
              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border-color)] bg-[#f8f9fa] dark:bg-[var(--bg-tertiary)]">
            <button
              type="button"
              onClick={handleClose}
              className="px-5 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !range.trim() || !csvInput.trim()}
              className="px-5 py-2.5 text-sm font-medium bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg transition-all disabled:opacity-50 shadow-md"
            >
              {loading ? 'Importing...' : 'Import'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ============================================================================
// Main App Component
// ============================================================================

export default function GridwellSheetsApp({ setRefreshHandler, initialFileId }: AppProps) {
  // State
  const [view, setView] = useState<'list' | 'spreadsheet'>('list')
  const [spreadsheets, setSpreadsheets] = useState<Spreadsheet[]>([])
  const [activeSpreadsheet, setActiveSpreadsheet] = useState<Spreadsheet | null>(null)
  const [activeSheetId, setActiveSheetId] = useState<number | null>(null)
  const [gridData, setGridData] = useState<(string | number | boolean | null)[][]>([])
  // Data for every sheet in the active spreadsheet, keyed by sheet title.
  // Populated alongside gridData so cross-sheet formula refs (e.g. =SUM(Tests!A:A)) resolve.
  const [sheetsData, setSheetsData] = useState<Record<string, (string | number | boolean | null)[][]>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Cell editing state
  const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>(null)
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [formulaBarValue, setFormulaBarValue] = useState('')
  
  // Multi-cell selection state
  const [selection, setSelection] = useState<SelectionRange | null>(null)
  
  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showAddSheetModal, setShowAddSheetModal] = useState(false)
  const [showRenameSheetModal, setShowRenameSheetModal] = useState(false)
  const [renameSheetId, setRenameSheetId] = useState<number | null>(null)
  const [showBatchGetModal, setShowBatchGetModal] = useState(false)
  const [batchGetResults, setBatchGetResults] = useState<Array<{
    range: string
    values: (string | number | boolean | null)[][]
  }> | null>(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showCopySheetModal, setShowCopySheetModal] = useState(false)
  const [showBatchClearModal, setShowBatchClearModal] = useState(false)
  const [showDataFilterModal, setShowDataFilterModal] = useState(false)
  const [dataFilterResults, setDataFilterResults] = useState<Array<{
    dataFilters: Array<{ a1Range?: string }>
    valueRange?: { range: string; values: (string | number | boolean | null)[][] }
  }> | null>(null)

  // Comments panel
  const [showCommentsPanel, setShowCommentsPanel] = useState(false)
  const [comments, setComments] = useState<FileComment[]>([])
  const [loadingComments, setLoadingComments] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [creatingComment, setCreatingComment] = useState(false)
  const [replyTexts, setReplyTexts] = useState<{[commentId: string]: string}>({})
  const [expandedComments, setExpandedComments] = useState<{[commentId: string]: boolean}>({})

  // Grid dimensions
  const [rowCount, setRowCount] = useState(100)
  const [colCount, setColCount] = useState(26)
  
  // References for refresh
  const loadDataRef = useRef<() => void>(() => {})
  
  // API hooks
  const api = useBackendAPI('gridwell_sheets')
  const gridwell_driveApi = useBackendAPI('gridwell_drive')
  
  // =========================================================================
  // Refresh Handler
  // =========================================================================
  
  useEffect(() => {
    loadDataRef.current = loadSpreadsheets
  })

  useEffect(() => {
    if (setRefreshHandler) {
      setRefreshHandler(() => loadDataRef.current())
    }
    return () => {
      if (setRefreshHandler) setRefreshHandler(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  
  // =========================================================================
  // Data Loading Functions
  // =========================================================================
  
  /**
   * Fetch the users.me.files map from a service's state endpoint.
   * gridwell_sheets shares its DB with gridwell_drive, so either service exposes the same file data;
   * the gridwell_drive fallback keeps the spreadsheets list populated when GYM_SERVICES omits gridwell_sheets.
   */
  const fetchFilesFromState = async (): Promise<Record<string, unknown>> => {
    for (const service of ['gridwell_sheets', 'gridwell_drive']) {
      try {
        const res = await fetch(`./api/services/${service}/state`)
        if (!res.ok) continue
        const json = await res.json()
        const files = json?.state?.users?.me?.files
        if (files && Object.keys(files).length > 0) return files
      } catch {
        // try next service
      }
    }
    return {}
  }

  /**
   * Load all spreadsheets from the backend state
   */
  const loadSpreadsheets = async () => {
    setLoading(true)
    setError(null)
    try {
      // Spreadsheets are stored in GridwellDrive's file system at state.users.me.files
      const filesData = await fetchFilesFromState()
      
      // Get locally deleted IDs (fallback for missing gridwell_drive service)
      const deletedIds = JSON.parse(localStorage.getItem('deleted_spreadsheet_ids') || '[]')
      
      // Filter for spreadsheet files only (mimeType: application/vnd.gridwell-apps.spreadsheet)
      const spreadsheetList: Spreadsheet[] = Object.entries(filesData)
        .filter(([id, data]: [string, unknown]) => {
          // Filter out locally deleted files
          if (deletedIds.includes(id)) return false
          
          const fileData = data as Record<string, unknown>
          return fileData.mimeType === 'application/vnd.gridwell-apps.spreadsheet'
        })
        .map(([id, data]: [string, unknown]) => {
          const fileData = data as Record<string, unknown>
          // The spreadsheet data may be nested under 'spreadsheet' key or at top level
          const spreadsheetContent = (fileData.spreadsheet as Record<string, unknown>) || fileData
          return {
            spreadsheetId: id,
            properties: {
              title: (fileData.name as string) || (spreadsheetContent.properties as SpreadsheetProperties)?.title || 'Untitled',
              ...(spreadsheetContent.properties as SpreadsheetProperties || {})
            },
            sheets: (spreadsheetContent.sheets as Sheet[]) || [],
            createdTime: fileData.createdTime as string,
            modifiedTime: fileData.modifiedTime as string,
            owners: fileData.owners as any[],
          }
        })
      
      setSpreadsheets(spreadsheetList)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load spreadsheets')
    } finally {
      setLoading(false)
    }
  }
  
  /**
   * Read a sheet's values directly from shared state.
   * Used when the gridwell_sheets service isn't registered (so its tools return 404)
   * but the file payload still lives in the shared gridwell_drive DB.
   */
  const loadSheetDataFromState = async (
    spreadsheetId: string,
    sheetTitle: string,
  ): Promise<(string | number | boolean | null)[][]> => {
    const files = await fetchFilesFromState()
    const file = files[spreadsheetId] as Record<string, unknown> | undefined
    if (!file) return []
    const content = (file.spreadsheet as Record<string, unknown>) || file
    const dataMap = (content.data as Record<string, (string | number | boolean | null)[][]>) || {}
    for (const [rangeKey, values] of Object.entries(dataMap)) {
      const exclamationIdx = rangeKey.indexOf('!')
      if (exclamationIdx === -1) continue
      let keySheet = rangeKey.slice(0, exclamationIdx)
      if (keySheet.startsWith("'") && keySheet.endsWith("'")) {
        keySheet = keySheet.slice(1, -1).replace(/''/g, "'")
      }
      if (keySheet === sheetTitle) return values
    }
    return []
  }

  /**
   * Fetch raw (unpadded) values for one sheet, with a state-DB fallback.
   */
  const fetchSheetValues = async (
    spreadsheetId: string,
    sheetTitle: string,
  ): Promise<(string | number | boolean | null)[][]> => {
    try {
      const result = await api.callTool('get_spreadsheet_values', {
        spreadsheet_id: spreadsheetId,
        range: `${formatSheetNameForA1(sheetTitle)}!A1:${colIndexToLetter(colCount - 1)}${rowCount}`,
        majorDimension: 'ROWS',
      })
      return (result as { values?: (string | number | boolean | null)[][] })?.values || []
    } catch {
      return loadSheetDataFromState(spreadsheetId, sheetTitle)
    }
  }

  /**
   * Preload every sheet's values so cross-sheet formula refs can resolve.
   * Stored unpadded — the formula evaluator handles out-of-range cells.
   */
  const loadAllSheetsData = async (spreadsheet: Spreadsheet) => {
    const entries = await Promise.all(
      spreadsheet.sheets.map(async sheet => {
        const values = await fetchSheetValues(spreadsheet.spreadsheetId, sheet.properties.title)
        return [sheet.properties.title, values] as const
      }),
    )
    const map: Record<string, (string | number | boolean | null)[][]> = {}
    for (const [title, values] of entries) map[title] = values
    setSheetsData(map)
  }

  /**
   * Load sheet data for the active spreadsheet and sheet
   */
  const loadSheetData = async (spreadsheetId: string, sheetTitle: string) => {
    setLoading(true)
    try {
      const values = await fetchSheetValues(spreadsheetId, sheetTitle)

      // Pad the data to fit the grid
      const paddedData: (string | number | boolean | null)[][] = []
      for (let i = 0; i < rowCount; i++) {
        paddedData[i] = []
        for (let j = 0; j < colCount; j++) {
          paddedData[i][j] = values[i]?.[j] ?? null
        }
      }

      setGridData(paddedData)
      setSheetsData(prev => ({ ...prev, [sheetTitle]: paddedData }))
    } catch (err) {
      console.error('Failed to load sheet data:', err)
      // Initialize with empty grid on error
      setGridData(Array.from({ length: rowCount }, () => Array(colCount).fill(null)))
    } finally {
      setLoading(false)
    }
  }
  
  // Load initial data
  useEffect(() => {
    loadSpreadsheets()
  }, [])

  // Auto-open spreadsheet if initialFileId is provided (from GridwellDrive cross-app navigation)
  const initialFileIdRef = useRef(initialFileId)
  useEffect(() => {
    if (initialFileIdRef.current && !loading && spreadsheets.length > 0 && !activeSpreadsheet) {
      const target = spreadsheets.find(s => s.spreadsheetId === initialFileIdRef.current)
      if (target) {
        handleSelectSpreadsheet(target)
      }
      initialFileIdRef.current = undefined
    }
  }, [loading, spreadsheets])

  // Load sheet data when active sheet changes
  useEffect(() => {
    if (activeSpreadsheet && activeSheetId !== null) {
      const activeSheet = activeSpreadsheet.sheets.find(s => s.properties.sheetId === activeSheetId)
      if (activeSheet) {
        loadSheetData(activeSpreadsheet.spreadsheetId, activeSheet.properties.title)
      }
    }
  }, [activeSpreadsheet?.spreadsheetId, activeSheetId])

  // Preload every sheet's data when the spreadsheet changes so cross-sheet
  // formula refs resolve without waiting for the user to visit each tab.
  useEffect(() => {
    if (activeSpreadsheet) {
      loadAllSheetsData(activeSpreadsheet)
    } else {
      setSheetsData({})
    }
  }, [activeSpreadsheet?.spreadsheetId, activeSpreadsheet?.sheets.length])

  // Auto-load comments when spreadsheet changes (for badge count + panel)
  const commentsLoadedForRef = useRef<string | null>(null)
  useEffect(() => {
    let cancelled = false
    if (activeSpreadsheet) {
      const fileId = activeSpreadsheet.spreadsheetId
      commentsLoadedForRef.current = null
      loadComments(fileId).then(() => {
        if (!cancelled) commentsLoadedForRef.current = fileId
      })
    } else {
      setComments([])
      commentsLoadedForRef.current = null
    }
    return () => { cancelled = true }
  }, [activeSpreadsheet?.spreadsheetId])

  // =========================================================================
  // Spreadsheet Operations
  // =========================================================================
  
  /**
   * Create a new spreadsheet
   */
  const handleCreateSpreadsheet = async (title: string) => {
    setSaving(true)
    try {
      const result = await api.callTool('create_spreadsheet', {
        spreadsheet: {
          properties: { title },
          sheets: [{ properties: { title: 'Sheet1', sheetId: 0, index: 0 } }],
        },
      })
      
      setShowCreateModal(false)
      
      // The API returns { id, name, properties, sheets, ... }
      // Note: id is used instead of spreadsheetId in the response
      const apiResult = result as Record<string, unknown>
      const spreadsheetId = (apiResult.id as string) || ''
      const spreadsheetName = (apiResult.name as string) || title
      const spreadsheetSheets = (apiResult.sheets as Sheet[]) || [{ properties: { title: 'Sheet1', sheetId: 0, index: 0 } }]
      
      if (spreadsheetId) {
        // Navigate directly to the new spreadsheet
        handleSelectSpreadsheet({
          spreadsheetId,
          properties: { 
            title: spreadsheetName,
            ...((apiResult.properties as SpreadsheetProperties) || {})
          },
          sheets: spreadsheetSheets,
        })
      } else {
        // If no ID returned, refresh the list
        await loadSpreadsheets()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create spreadsheet')
    } finally {
      setSaving(false)
    }
  }
  
  /**
   * Select a spreadsheet to view
   */
  const handleSelectSpreadsheet = async (spreadsheet: Spreadsheet) => {
    setView('spreadsheet')

    // Initialize empty grid
    setGridData(Array.from({ length: rowCount }, () => Array(colCount).fill(null)))
    setActiveCell({ row: 0, col: 0 })
    setSelection(null)
    setEditingCell(null)
    setFormulaBarValue('')

    // Fetch fresh spreadsheet metadata (including sheets) from the API
    try {
      const freshData = await api.callTool('get_spreadsheet', {
        spreadsheet_id: spreadsheet.spreadsheetId,
      }) as Record<string, unknown>

      const updatedSpreadsheet: Spreadsheet = {
        ...spreadsheet,
        sheets: (freshData.sheets as Sheet[]) || spreadsheet.sheets,
        properties: {
          ...spreadsheet.properties,
          ...((freshData.properties as SpreadsheetProperties) || {}),
        },
      }
      setActiveSpreadsheet(updatedSpreadsheet)

      // Select first sheet by default
      if (updatedSpreadsheet.sheets.length > 0) {
        setActiveSheetId(updatedSpreadsheet.sheets[0].properties.sheetId)
      }
    } catch (err) {
      console.error('Failed to fetch spreadsheet metadata:', err)
      // Fall back to state data
      setActiveSpreadsheet(spreadsheet)
      if (spreadsheet.sheets.length > 0) {
        setActiveSheetId(spreadsheet.sheets[0].properties.sheetId)
      }
    }
  }
  
  /**
   * Go back to spreadsheet list
   */
  const handleBackToList = () => {
    setView('list')
    setActiveSpreadsheet(null)
    setActiveSheetId(null)
    setGridData([])
    setActiveCell(null)
    setEditingCell(null)
    loadSpreadsheets()
  }
  
  // =========================================================================
  // Sheet Operations
  // =========================================================================
  
  /**
   * Add a new sheet to the active spreadsheet
   */
  const handleAddSheet = async (title: string) => {
    if (!activeSpreadsheet) return
    
    setSaving(true)
    try {
      // Find the next available sheet ID
      const maxId = activeSpreadsheet.sheets.reduce(
        (max, sheet) => Math.max(max, sheet.properties.sheetId),
        -1
      )
      const newSheetId = maxId + 1
      const newIndex = activeSpreadsheet.sheets.length
      
      await api.callTool('batch_update_spreadsheet', {
        spreadsheet_id: activeSpreadsheet.spreadsheetId,
        requests: [
          {
            addSheetRequest: {
              properties: {
                sheetId: newSheetId,
                title: title || `Sheet${newIndex + 1}`,
                index: newIndex,
              },
            },
          },
        ],
      })
      
      setShowAddSheetModal(false)
      
      // Refresh spreadsheet data
      const result = await api.callTool('get_spreadsheet', {
        spreadsheet_id: activeSpreadsheet.spreadsheetId,
      })
      
      // Convert API response format (id -> spreadsheetId)
      const apiResult = result as Record<string, unknown>
      const updatedSpreadsheet: Spreadsheet = {
        spreadsheetId: (apiResult.id as string) || activeSpreadsheet.spreadsheetId,
        properties: {
          title: (apiResult.name as string) || activeSpreadsheet.properties.title,
          ...((apiResult.properties as SpreadsheetProperties) || {})
        },
        sheets: (apiResult.sheets as Sheet[]) || [],
      }
      setActiveSpreadsheet(updatedSpreadsheet)
      setActiveSheetId(newSheetId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add sheet')
    } finally {
      setSaving(false)
    }
  }
  
  /**
   * Delete a sheet from the active spreadsheet
   */
  const handleDeleteSheet = async (sheetId: number) => {
    if (!activeSpreadsheet) return
    
    // Don't allow deleting the last sheet
    if (activeSpreadsheet.sheets.length <= 1) {
      setError('Cannot delete the last sheet')
      return
    }
    
    setSaving(true)
    try {
      await api.callTool('batch_update_spreadsheet', {
        spreadsheet_id: activeSpreadsheet.spreadsheetId,
        requests: [
          {
            deleteSheetRequest: {
              sheetId,
            },
          },
        ],
      })
      
      // Refresh spreadsheet data
      const result = await api.callTool('get_spreadsheet', {
        spreadsheet_id: activeSpreadsheet.spreadsheetId,
      })
      
      // Convert API response format (id -> spreadsheetId)
      const apiResult = result as Record<string, unknown>
      const updatedSpreadsheet: Spreadsheet = {
        spreadsheetId: (apiResult.id as string) || activeSpreadsheet.spreadsheetId,
        properties: {
          title: (apiResult.name as string) || activeSpreadsheet.properties.title,
          ...((apiResult.properties as SpreadsheetProperties) || {})
        },
        sheets: (apiResult.sheets as Sheet[]) || [],
      }
      setActiveSpreadsheet(updatedSpreadsheet)
      
      // Select first sheet if current was deleted
      if (activeSheetId === sheetId && updatedSpreadsheet.sheets.length > 0) {
        setActiveSheetId(updatedSpreadsheet.sheets[0].properties.sheetId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete sheet')
    } finally {
      setSaving(false)
    }
  }

  /**
   * Rename a sheet
   */
  const handleRenameSheet = async (newTitle: string) => {
    if (!activeSpreadsheet || renameSheetId === null) return
    
    setSaving(true)
    try {
      await api.callTool('batch_update_spreadsheet', {
        spreadsheet_id: activeSpreadsheet.spreadsheetId,
        requests: [
          {
            updateSheetPropertiesRequest: {
              properties: {
                sheetId: renameSheetId,
                title: newTitle,
              },
              fields: 'title',
            },
          },
        ],
      })
      
      setShowRenameSheetModal(false)
      setRenameSheetId(null)
      
      // Refresh spreadsheet data
      const result = await api.callTool('get_spreadsheet', {
        spreadsheet_id: activeSpreadsheet.spreadsheetId,
      })
      
      // Convert API response format (id -> spreadsheetId)
      const apiResult = result as Record<string, unknown>
      const updatedSpreadsheet: Spreadsheet = {
        spreadsheetId: (apiResult.id as string) || activeSpreadsheet.spreadsheetId,
        properties: {
          title: (apiResult.name as string) || activeSpreadsheet.properties.title,
          ...((apiResult.properties as SpreadsheetProperties) || {})
        },
        sheets: (apiResult.sheets as Sheet[]) || [],
        createdTime: (apiResult.createdTime as string) || activeSpreadsheet.createdTime,
        modifiedTime: (apiResult.modifiedTime as string) || activeSpreadsheet.modifiedTime,
        owners: (apiResult.owners as any[]) || activeSpreadsheet.owners,
      }
      setActiveSpreadsheet(updatedSpreadsheet)
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename sheet')
    } finally {
      setSaving(false)
    }
  }
  
  // =========================================================================
  // Cell Operations
  // =========================================================================
  
  /**
   * Handle cell selection
   */
  /**
   * Handle cell selection (single click on non-active cell)
   */
  const handleSelectCell = (row: number, col: number, extend?: boolean) => {
    setActiveCell({ row, col })
    setEditingCell(null)
    const value = gridData[row]?.[col]
    setFormulaBarValue(value !== null && value !== undefined ? String(value) : '')
    
    // Clear selection unless extending
    if (!extend) {
      setSelection(null)
    }
  }

  /**
   * Handle starting cell editing (single click on active cell or double-click)
   */
  /**
   * Start editing a cell
   * @param row - Row index
   * @param col - Column index
   * @param initialValue - Optional initial value (for typing to replace content)
   *                       If provided, replaces cell content with this value
   *                       If not provided, shows existing cell content for editing
   */
  const handleStartEditing = (row: number, col: number, initialValue?: string) => {
    setActiveCell({ row, col })
    setEditingCell({ row, col })
    setSelection(null)
    
    if (initialValue !== undefined) {
      // User started typing - replace content with typed character
      setEditValue(initialValue)
    } else {
      // Double-click or Enter - edit existing content
      const value = gridData[row]?.[col]
      setEditValue(value !== null && value !== undefined ? String(value) : '')
    }
  }
  
  /**
   * Unified cell update logic
   */
  const updateCellValue = async (row: number, col: number, newValue: string) => {
    if (!activeSpreadsheet || activeSheetId === null) return
    const activeSheet = activeSpreadsheet.sheets.find(s => s.properties.sheetId === activeSheetId)
    if (!activeSheet) return

    // 1. Optimistic Update (deep copy the modified row to avoid mutating state)
    const oldValue = gridData[row]?.[col]
    const newGridData = gridData.map((r, i) => i === row ? [...(r || Array(colCount).fill(null))] : r)
    newGridData[row][col] = newValue || null
    setGridData(newGridData)

    // Update formula bar to match if we are updating the active cell
    if (activeCell?.row === row && activeCell?.col === col) {
      setFormulaBarValue(newValue)
    }

    // 2. Persist to Backend
    const range = generateA1Range(activeSheet.properties.title, row, col, row, col)
    try {
      if (newValue === '') {
        await api.callTool('clear_spreadsheet_values', {
          spreadsheet_id: activeSpreadsheet.spreadsheetId,
          range,
        })
      } else {
        await api.callTool('update_spreadsheet_values', {
          spreadsheet_id: activeSpreadsheet.spreadsheetId,
          range,
          valueInputOption: 'USER_ENTERED',
          values: [[newValue]],
        })
      }
    } catch (err) {
      console.error('Failed to save cell:', err)
      // 3. Rollback on Error (deep copy row for proper state update)
      setGridData(prev => {
        const reverted = prev.map((r, i) => i === row ? [...r] : r)
        if (reverted[row]) reverted[row][col] = oldValue
        return reverted
      })
      if (activeCell?.row === row && activeCell?.col === col) {
        setFormulaBarValue(oldValue !== null && oldValue !== undefined ? String(oldValue) : '')
      }
      setError('Failed to save changes. Value reverted.')
    }
  }

  /**
   * Handle cell edit submission
   * @param moveToNextRow - If true, move to the next row after submission (Enter key behavior)
   *                        If false, stay on current cell (blur/click-away behavior)
   */
  const handleEditSubmit = async (moveToNextRow: boolean = false) => {
    const cellToUpdate = editingCell || activeCell
    if (!cellToUpdate) return

    const { row, col } = cellToUpdate

    // Clear editing state FIRST to prevent re-triggers
    setEditingCell(null)

    // Update the cell value
    await updateCellValue(row, col, editValue)

    // Only move to next row if explicitly requested (Enter key)
    // When clicking away (blur), we don't move - the click handler will set the new cell
    if (moveToNextRow) {
      const newRow = Math.min(row + 1, rowCount - 1)
      setActiveCell({ row: newRow, col })
      const newValue = gridData[newRow]?.[col]
      setFormulaBarValue(newValue !== null && newValue !== undefined ? String(newValue) : '')
    }
  }

  
  /**
   * Handle formula bar changes
   */
  const handleFormulaBarSubmit = async () => {
    if (!activeCell) return
    await updateCellValue(activeCell.row, activeCell.col, formulaBarValue)
  }
  
  /**
   * Cancel cell editing
   */
  const handleEditCancel = () => {
    setEditingCell(null)
    if (activeCell) {
      const value = gridData[activeCell.row]?.[activeCell.col]
      setEditValue(value !== null && value !== undefined ? String(value) : '')
    }
  }
  
  /**
   * Clear the active cell's content (for Delete/Backspace key)
   */
  const handleClearCell = async () => {
    if (!activeCell) return
    await updateCellValue(activeCell.row, activeCell.col, '')
  }
  
  /**
   * Batch update multiple cells at once
   * Uses the batch_update_spreadsheet_values API for efficient multi-cell updates
   * 
   * @param updates - Array of cell updates, each with row, col, and value
   * @returns Promise that resolves when updates are complete
   */
  const batchUpdateCells = useCallback(async (
    updates: Array<{ row: number; col: number; value: string | number | boolean | null }>
  ): Promise<void> => {
    if (!activeSpreadsheet || activeSheetId === null || updates.length === 0) return

    const activeSheet = activeSpreadsheet.sheets.find(s => s.properties.sheetId === activeSheetId)
    if (!activeSheet) return

    // Store old values for rollback
    const oldValues: Array<{ row: number; col: number; value: string | number | boolean | null }> = []
    
    // Apply optimistic updates
    const newGridData = [...gridData.map(row => [...row])]
    for (const update of updates) {
      if (newGridData[update.row]) {
        oldValues.push({
          row: update.row,
          col: update.col,
          value: newGridData[update.row][update.col],
        })
        newGridData[update.row][update.col] = update.value
      }
    }
    setGridData(newGridData)

    // Group updates by contiguous ranges for efficiency
    // For simplicity, we'll send each cell as a separate range in the batch
    // The API handles this efficiently
    const data = updates.map(update => ({
      range: generateA1Range(
        activeSheet.properties.title,
        update.row,
        update.col,
        update.row,
        update.col
      ),
      values: [[update.value === null ? '' : update.value]],
    }))

    try {
      await api.callTool('batch_update_spreadsheet_values', {
        spreadsheet_id: activeSpreadsheet.spreadsheetId,
        valueInputOption: 'USER_ENTERED',
        data,
      })
    } catch (err) {
      console.error('Batch update failed:', err)
      
      // Rollback optimistic updates
      const revertedGridData = [...gridData.map(row => [...row])]
      for (const old of oldValues) {
        if (revertedGridData[old.row]) {
          revertedGridData[old.row][old.col] = old.value
        }
      }
      setGridData(revertedGridData)
      setError('Failed to save changes. Values reverted.')
    }
  }, [activeSpreadsheet, activeSheetId, gridData, api])

  /**
   * Fill all selected cells with a value
   * @param value - The value to fill
   */
  const fillSelectionWithValue = async (value: string) => {
    if (!selection) return

    const minRow = Math.min(selection.startRow, selection.endRow)
    const maxRow = Math.max(selection.startRow, selection.endRow)
    const minCol = Math.min(selection.startCol, selection.endCol)
    const maxCol = Math.max(selection.startCol, selection.endCol)

    const updates: Array<{ row: number; col: number; value: string }> = []
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        updates.push({ row, col, value })
      }
    }

    await batchUpdateCells(updates)
  }

  /**
   * Clear all selected cells (for multi-cell selection)
   * Uses optimistic updates for better UX
   */
  const handleClearSelection = async () => {
    if (!selection || !activeSpreadsheet || activeSheetId === null) return

    const activeSheet = activeSpreadsheet.sheets.find(s => s.properties.sheetId === activeSheetId)
    if (!activeSheet) return

    const minRow = Math.min(selection.startRow, selection.endRow)
    const maxRow = Math.max(selection.startRow, selection.endRow)
    const minCol = Math.min(selection.startCol, selection.endCol)
    const maxCol = Math.max(selection.startCol, selection.endCol)

    // Store old values for rollback
    const oldValues: Array<{ row: number; col: number; value: string | number | boolean | null }> = []
    
    // Apply optimistic update - clear cells locally
    const newGridData = [...gridData.map(row => [...row])]
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        if (newGridData[row]) {
          oldValues.push({ row, col, value: newGridData[row][col] })
          newGridData[row][col] = null
        }
      }
    }
    setGridData(newGridData)
    setFormulaBarValue('')

    const range = generateA1Range(activeSheet.properties.title, minRow, minCol, maxRow, maxCol)

    try {
      await api.callTool('clear_spreadsheet_values', {
        spreadsheet_id: activeSpreadsheet.spreadsheetId,
        range,
      })
      
      // Clear selection after successful clear
      setSelection(null)
    } catch (err) {
      console.error('Failed to clear selection:', err)
      
      // Rollback optimistic updates
      const revertedGridData = [...gridData.map(row => [...row])]
      for (const old of oldValues) {
        if (revertedGridData[old.row]) {
          revertedGridData[old.row][old.col] = old.value
        }
      }
      setGridData(revertedGridData)
      setError('Failed to clear selection. Values reverted.')
    }
  }

  /**
   * Copy selected cells to clipboard
   */
  const handleCopy = useCallback(() => {
    if (!activeCell) return

    let textToCopy: string

    if (selection) {
      // Copy multiple cells
      const minRow = Math.min(selection.startRow, selection.endRow)
      const maxRow = Math.max(selection.startRow, selection.endRow)
      const minCol = Math.min(selection.startCol, selection.endCol)
      const maxCol = Math.max(selection.startCol, selection.endCol)

      const rows: string[] = []
      for (let row = minRow; row <= maxRow; row++) {
        const rowValues: string[] = []
        for (let col = minCol; col <= maxCol; col++) {
          const value = gridData[row]?.[col]
          rowValues.push(value !== null && value !== undefined ? String(value) : '')
        }
        rows.push(rowValues.join('\t'))
      }
      textToCopy = rows.join('\n')
    } else {
      // Copy single cell
      const value = gridData[activeCell.row]?.[activeCell.col]
      textToCopy = value !== null && value !== undefined ? String(value) : ''
    }

    navigator.clipboard.writeText(textToCopy).catch(err => {
      console.error('Failed to copy:', err)
    })
  }, [activeCell, selection, gridData])

  /**
   * Paste from clipboard to selected cells
   */
  const handlePaste = useCallback(async () => {
    if (!activeCell || !activeSpreadsheet || activeSheetId === null) return

    try {
      const text = await navigator.clipboard.readText()
      if (!text) return

      // Parse clipboard content (tab-separated columns, newline-separated rows)
      const rows = text.split('\n').map(row => row.split('\t'))
      
      const updates: Array<{ row: number; col: number; value: string }> = []
      
      for (let rowOffset = 0; rowOffset < rows.length; rowOffset++) {
        const rowData = rows[rowOffset]
        for (let colOffset = 0; colOffset < rowData.length; colOffset++) {
          const targetRow = activeCell.row + rowOffset
          const targetCol = activeCell.col + colOffset
          
          // Check bounds
          if (targetRow < rowCount && targetCol < colCount) {
            updates.push({
              row: targetRow,
              col: targetCol,
              value: rowData[colOffset],
            })
          }
        }
      }

      if (updates.length > 0) {
        await batchUpdateCells(updates)
      }
    } catch (err) {
      console.error('Failed to paste:', err)
      setError('Failed to paste from clipboard')
    }
  }, [activeCell, activeSpreadsheet, activeSheetId, rowCount, colCount, batchUpdateCells])

  /**
   * Cut selected cells (copy then clear)
   */
  const handleCut = useCallback(async () => {
    handleCopy()
    if (selection) {
      await handleClearSelection()
    } else if (activeCell) {
      await handleClearCell()
    }
  }, [handleCopy, handleClearSelection, handleClearCell, selection, activeCell])

  // =========================================================================
  // Range Operations
  // =========================================================================

  /**
   * Get values from a specific range
   * @param range - A1 notation range (e.g., "Sheet1!A1:C10")
   * @returns Promise with the values from the range
   */
  const getValuesFromRange = async (range: string): Promise<(string | number | boolean | null)[][] | null> => {
    if (!activeSpreadsheet) return null

    try {
      const result = await api.callTool('get_spreadsheet_values', {
        spreadsheet_id: activeSpreadsheet.spreadsheetId,
        range,
        majorDimension: 'ROWS',
      })

      return result?.values || []
    } catch (err) {
      console.error('Failed to get values from range:', err)
      setError('Failed to get values from range')
      return null
    }
  }

  /**
   * Update values in a specific range
   * @param range - A1 notation range (e.g., "Sheet1!A1:C10")
   * @param values - 2D array of values to set
   * @returns Promise that resolves when update is complete
   */
  const updateValuesInRange = async (
    range: string,
    values: (string | number | boolean | null)[][]
  ): Promise<boolean> => {
    if (!activeSpreadsheet) return false

    try {
      await api.callTool('update_spreadsheet_values', {
        spreadsheet_id: activeSpreadsheet.spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        values,
      })

      // Reload sheet data to reflect changes
      const activeSheet = activeSpreadsheet.sheets.find(s => s.properties.sheetId === activeSheetId)
      if (activeSheet) {
        await loadSheetData(activeSpreadsheet.spreadsheetId, activeSheet.properties.title)
      }

      return true
    } catch (err) {
      console.error('Failed to update values in range:', err)
      setError('Failed to update values in range')
      return false
    }
  }

  /**
   * Append values after the last row of a table found in the specified range.
   * Uses the append_spreadsheet_values API which:
   * 1. Searches for a logical table within the provided range
   * 2. Finds the last row of that table
   * 3. Appends new data immediately after
   */
  const appendValuesToRange = async (
    range: string,
    values: (string | number | boolean | null)[][]
  ): Promise<boolean> => {
    if (!activeSpreadsheet) return false

    try {
      setSaving(true)

      const params = {
        spreadsheet_id: activeSpreadsheet.spreadsheetId,
        range,
        values,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
      }
      await api.callTool('append_spreadsheet_values', params)

      // Reload sheet data to reflect changes
      const activeSheet = activeSpreadsheet.sheets.find(s => s.properties.sheetId === activeSheetId)
      if (activeSheet) {
        await loadSheetData(activeSpreadsheet.spreadsheetId, activeSheet.properties.title)
      }

      return true
    } catch (err) {
      console.error('Failed to append values:', err)
      setError('Failed to append values')
      return false
    } finally {
      setSaving(false)
    }
  }

  /**
   * Batch get values from multiple ranges
   * @param ranges - Array of A1 notation ranges
   */
  const handleBatchGetValues = useCallback(async (ranges: string[]) => {
    if (!activeSpreadsheet) return

    try {
      setSaving(true)
      const result = await api.callTool<{
        spreadsheetId: string
        valueRanges: Array<{
          range: string
          majorDimension: string
          values: (string | number | boolean | null)[][]
        }>
      }>('batch_get_spreadsheet_values', {
        spreadsheet_id: activeSpreadsheet.spreadsheetId,
        ranges,
        majorDimension: 'ROWS',
        valueRenderOption: 'FORMATTED_VALUE',
      })

      if (result && result.valueRanges) {
        setBatchGetResults(result.valueRanges)
      } else {
        setBatchGetResults([])
      }
    } catch (err) {
      console.error('Failed to batch get values:', err)
      setError('Failed to fetch values from ranges')
      setBatchGetResults(null)
    } finally {
      setSaving(false)
    }
  }, [activeSpreadsheet, api])

  /**
   * Handle new query request in Batch Get modal
   */
  const handleNewQuery = useCallback(() => {
    setBatchGetResults(null)
  }, [])

  /**
   * Copy current sheet to another spreadsheet
   * Uses the copy_sheet_to_spreadsheet API
   */
  const handleCopySheet = useCallback(async (destinationSpreadsheetId: string): Promise<boolean> => {
    if (!activeSpreadsheet || activeSheetId === null) return false

    try {
      setSaving(true)
      await api.callTool('copy_sheet_to_spreadsheet', {
        spreadsheet_id: activeSpreadsheet.spreadsheetId,
        sheet_id: Number(activeSheetId),  // Ensure sheet_id is sent as integer
        destination_spreadsheet_id: destinationSpreadsheetId,
      })
      return true
    } catch (err) {
      // Note: The API may throw a validation error on the response (sheetType is null)
      // but the copy operation actually succeeds. Check if error is response validation
      const errorMsg = err instanceof Error ? err.message : String(err)
      if (errorMsg.includes('ValidationError') && errorMsg.includes('sheetType')) {
        // This is a backend response validation bug - the copy actually worked
        console.warn('Copy succeeded but response validation failed (known backend bug)')
        return true
      }
      console.error('Failed to copy sheet:', err)
      setError('Failed to copy sheet')
      return false
    } finally {
      setSaving(false)
    }
  }, [activeSpreadsheet, activeSheetId, api])

  /**
   * Batch clear values from multiple ranges
   * Uses the batch_clear_spreadsheet_values API
   */
  const handleBatchClearValues = useCallback(async (ranges: string[]): Promise<boolean> => {
    if (!activeSpreadsheet) return false

    try {
      setSaving(true)
      await api.callTool('batch_clear_spreadsheet_values', {
        spreadsheet_id: activeSpreadsheet.spreadsheetId,
        ranges,
      })

      // Reload sheet data to reflect changes
      const activeSheet = activeSpreadsheet.sheets.find(s => s.properties.sheetId === activeSheetId)
      if (activeSheet) {
        await loadSheetData(activeSpreadsheet.spreadsheetId, activeSheet.properties.title)
      }

      return true
    } catch (err) {
      console.error('Failed to batch clear values:', err)
      setError('Failed to clear values')
      return false
    } finally {
      setSaving(false)
    }
  }, [activeSpreadsheet, activeSheetId, api])

  /**
   * Get values by data filter
   * Uses the batch_get_spreadsheet_values_by_data_filter API
   */
  const handleGetByDataFilter = useCallback(async (
    filters: Array<{ a1Range?: string; gridRange?: { sheetId: number; startRowIndex?: number; endRowIndex?: number; startColumnIndex?: number; endColumnIndex?: number } }>
  ): Promise<void> => {
    if (!activeSpreadsheet) return

    try {
      setSaving(true)
      const result = await api.callTool<{
        spreadsheetId: string
        valueRanges: Array<{
          range: string
          values: (string | number | boolean | null)[][]
          majorDimension: string
        }>
      }>('batch_get_spreadsheet_values_by_data_filter', {
        spreadsheet_id: activeSpreadsheet.spreadsheetId,
        dataFilters: filters,
        majorDimension: 'ROWS',
        valueRenderOption: 'FORMATTED_VALUE',
      })

      if (result && result.valueRanges) {
        // Transform API response format to match UI expected format
        const transformedResults = result.valueRanges.map((vr, idx) => ({
          dataFilters: [filters[idx] || {}],
          valueRange: { range: vr.range, values: vr.values },
        }))
        setDataFilterResults(transformedResults)
      } else {
        setDataFilterResults([])
      }
    } catch (err) {
      console.error('Failed to get values by data filter:', err)
      setError('Failed to get values by data filter')
      setDataFilterResults(null)
    } finally {
      setSaving(false)
    }
  }, [activeSpreadsheet, api])

  /**
   * Clear values by data filter
   * Uses the batch_clear_spreadsheet_values_by_data_filter API
   */
  const handleClearByDataFilter = useCallback(async (
    filters: Array<{ a1Range?: string; gridRange?: { sheetId: number; startRowIndex?: number; endRowIndex?: number; startColumnIndex?: number; endColumnIndex?: number } }>
  ): Promise<boolean> => {
    if (!activeSpreadsheet) return false

    try {
      setSaving(true)
      await api.callTool('batch_clear_spreadsheet_values_by_data_filter', {
        spreadsheet_id: activeSpreadsheet.spreadsheetId,
        dataFilters: filters,
      })

      // Reload sheet data to reflect changes
      const activeSheet = activeSpreadsheet.sheets.find(s => s.properties.sheetId === activeSheetId)
      if (activeSheet) {
        await loadSheetData(activeSpreadsheet.spreadsheetId, activeSheet.properties.title)
      }

      return true
    } catch (err) {
      console.error('Failed to clear values by data filter:', err)
      setError('Failed to clear values by data filter')
      return false
    } finally {
      setSaving(false)
    }
  }, [activeSpreadsheet, activeSheetId, api])

  /**
   * Update values by data filter
   * Uses the batch_update_spreadsheet_values_by_data_filter API
   */
  const handleUpdateByDataFilter = useCallback(async (
    filters: Array<{ a1Range?: string; gridRange?: { sheetId: number; startRowIndex?: number; endRowIndex?: number; startColumnIndex?: number; endColumnIndex?: number } }>,
    values: (string | number | boolean | null)[][],
    valueInputOption: string
  ): Promise<boolean> => {
    if (!activeSpreadsheet) return false

    try {
      setSaving(true)
      // Build data array matching filters to values
      const data = filters.map(filter => ({
        dataFilter: filter,
        values,
      }))

      await api.callTool('batch_update_spreadsheet_values_by_data_filter', {
        spreadsheet_id: activeSpreadsheet.spreadsheetId,
        valueInputOption,
        data,
        includeValuesInResponse: false,
      })

      // Reload sheet data to reflect changes
      const activeSheet = activeSpreadsheet.sheets.find(s => s.properties.sheetId === activeSheetId)
      if (activeSheet) {
        await loadSheetData(activeSpreadsheet.spreadsheetId, activeSheet.properties.title)
      }

      return true
    } catch (err) {
      console.error('Failed to update values by data filter:', err)
      setError('Failed to update values by data filter')
      return false
    } finally {
      setSaving(false)
    }
  }, [activeSpreadsheet, activeSheetId, api])

  /**
   * Get spreadsheet by data filter
   * Uses the get_spreadsheet_by_data_filter API
   */
  const handleGetSpreadsheetByDataFilter = useCallback(async (
    filters: Array<{ a1Range?: string; gridRange?: { sheetId: number; startRowIndex?: number; endRowIndex?: number; startColumnIndex?: number; endColumnIndex?: number } }>,
    includeGridData: boolean
  ): Promise<void> => {
    if (!activeSpreadsheet) return

    try {
      setSaving(true)
      const result = await api.callTool<{
        id: string
        properties: Record<string, unknown>
        sheets: Array<Record<string, unknown>>
        data?: Record<string, (string | number | boolean | null)[][]>
      }>('get_spreadsheet_by_data_filter', {
        spreadsheet_id: activeSpreadsheet.spreadsheetId,
        dataFilters: filters,
        includeGridData,
      })

      if (result) {
        // Transform API response to match UI expected format
        const transformedResults: Array<{ dataFilters: Array<{ a1Range?: string }>; valueRange?: { range: string; values: (string | number | boolean | null)[][] } }> = []

        if (result.data) {
          Object.entries(result.data).forEach(([range, values]) => {
            transformedResults.push({
              dataFilters: [{ a1Range: range }],
              valueRange: { range, values: values as (string | number | boolean | null)[][] },
            })
          })
        }

        if (transformedResults.length === 0) {
          // Show spreadsheet metadata as result
          transformedResults.push({
            dataFilters: filters.map(f => ({ a1Range: f.a1Range })),
            valueRange: {
              range: 'Spreadsheet Info',
              values: [
                ['ID', result.id || ''],
                ['Sheets', String(result.sheets?.length || 0)],
                ...((result.sheets || []).map((s: any) => [`Sheet: ${s.properties?.title || 'Unknown'}`, `ID: ${s.properties?.sheetId ?? ''}`])),
              ],
            },
          })
        }

        setDataFilterResults(transformedResults)
      } else {
        setDataFilterResults([])
      }
    } catch (err) {
      console.error('Failed to get spreadsheet by data filter:', err)
      setError('Failed to get spreadsheet by data filter')
      setDataFilterResults(null)
    } finally {
      setSaving(false)
    }
  }, [activeSpreadsheet, api])

  /**
   * Handle new query request in Data Filter modal
   */
  const handleDataFilterNewQuery = useCallback(() => {
    setDataFilterResults(null)
  }, [])

  /**
   * Check if there is content to clear in the selected cell(s)
   */
  const hasContentToClear = useMemo(() => {
    // If actively editing a cell, check the edit value
    if (editingCell) {
      return editValue.trim() !== ''
    }
    // If cell is selected and formula bar has content
    if (activeCell && !editingCell && formulaBarValue.trim() !== '') {
      return true
    }
    // Check saved grid data for multi-cell selection
    if (selection) {
      const minRow = Math.min(selection.startRow, selection.endRow)
      const maxRow = Math.max(selection.startRow, selection.endRow)
      const minCol = Math.min(selection.startCol, selection.endCol)
      const maxCol = Math.max(selection.startCol, selection.endCol)
      for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
          const value = gridData[row]?.[col]
          if (value !== null && value !== undefined && value !== '') {
            return true
          }
        }
      }
      return false
    } else if (activeCell) {
      const value = gridData[activeCell.row]?.[activeCell.col]
      return value !== null && value !== undefined && value !== ''
    }
    return false
  }, [selection, activeCell, gridData, editingCell, editValue, formulaBarValue])

  /**
   * Add a new row below the currently active cell.
   * 
   * Approaches considered:
   * 1. Backend `insertDimension`: Not supported by current backend simulation.
   * 2. Frontend-only (Virtual): Doesn't persist data.
   * 3. Shift-and-Overwrite (Selected): 
   *    - Shifts all data below the insertion point down by 1.
   *    - Clears the new row.
   *    - Updates frontend optimistically.
   *    - Syncs with backend using `batch_update_spreadsheet_values`.
   */
  const handleAddRow = async () => {
    if (!activeSpreadsheet || activeSheetId === null || !activeCell) {
      // Fallback: if no cell selected, add to bottom (legacy behavior)
      // But user specifically asked for "after current cell", so we enforce selection or alert
      if (!activeCell) {
        alert('Please select a cell to add a row after it.')
        return
      }
    }

    const insertionRowIdx = activeCell.row + 1
    
    // 1. Optimistic Frontend Update
    const newGridData = [...gridData]
    // Create empty row
    const emptyRow = new Array(colCount).fill(null)
    // Insert at index
    newGridData.splice(insertionRowIdx, 0, emptyRow)
    
    // Update state
    setGridData(newGridData)
    setRowCount(prev => prev + 1)
    
    // Move selection to the new row (same column)
    setActiveCell({ row: insertionRowIdx, col: activeCell.col })
    setEditingCell({ row: insertionRowIdx, col: activeCell.col })
    setEditValue('')
    setFormulaBarValue('')

    // 2. Backend Update (Shift Data)
    try {
      const activeSheet = activeSpreadsheet.sheets.find(s => s.properties.sheetId === activeSheetId)
      if (!activeSheet) return

      // Get data to shift (from insertion point to end)
      // We use the OLD gridData (before splice) for this
      const rowsToShift = gridData.slice(insertionRowIdx)
      
      if (rowsToShift.length > 0) {
        // We need to move these rows down by 1
        // Target range starts at insertionRowIdx + 2 (1-based, +1 for shift)
        const startRow = insertionRowIdx + 2
        const range = `${formatSheetNameForA1(activeSheet.properties.title)}!A${startRow}`

        // We also need to clear the row at insertionRowIdx + 1
        const clearRange = `${formatSheetNameForA1(activeSheet.properties.title)}!A${insertionRowIdx + 1}:${colIndexToLetter(colCount-1)}${insertionRowIdx + 1}`

        const updates = [
          // Shift data down
          {
            range,
            values: rowsToShift
          },
          // Clear the new row
          {
            range: clearRange,
            values: [new Array(colCount).fill('')]
          }
        ]
        
        // Use direct API call for block updates
         await api.callTool('batch_update_spreadsheet_values', {
            spreadsheet_id: activeSpreadsheet.spreadsheetId,
            valueInputOption: 'USER_ENTERED',
            data: updates
         })
      }
    } catch (err) {
      console.error('Failed to add row:', err)
      setError('Failed to add row')
      // Rollback would be complex here, so we reload
      if (activeSpreadsheet && activeSheetId) {
         const activeSheet = activeSpreadsheet.sheets.find(s => s.properties.sheetId === activeSheetId)
         if (activeSheet) {
             await loadSheetData(activeSpreadsheet.spreadsheetId, activeSheet.properties.title)
         }
      }
    }
  }

  /**
   * Add a new column after the currently active cell.
   * 
   * Similar logic to Add Row: shifts data to the right.
   */
  const handleAddColumn = async () => {
    if (!activeSpreadsheet || activeSheetId === null || !activeCell) {
       if (!activeCell) {
        alert('Please select a cell to add a column after it.')
        return
      }
    }

    const insertionColIdx = activeCell.col + 1
    const insertionColLetter = colIndexToLetter(insertionColIdx)
    
    // 1. Optimistic Frontend Update
    const newGridData = gridData.map(row => {
      const newRow = [...row]
      newRow.splice(insertionColIdx, 0, null)
      return newRow
    })
    
    setGridData(newGridData)
    setColCount(prev => prev + 1)
    
    // Move selection
    setActiveCell({ row: activeCell.row, col: insertionColIdx })
    setEditingCell({ row: activeCell.row, col: insertionColIdx })
    setEditValue('')
    setFormulaBarValue('')

    // 2. Backend Update
    try {
      const activeSheet = activeSpreadsheet.sheets.find(s => s.properties.sheetId === activeSheetId)
      if (!activeSheet) return

      // We need to shift columns. This is trickier than rows because "values" are row-major.
      // We need to read the block from insertionColIdx to end for ALL rows.
      
      // Construct the shifted data block
      // For each row, take cells from insertionColIdx to end
      const shiftedData = gridData.map(row => {
         // Get cells from insertion point to end
         // If row is shorter than insertion point, nothing to shift
         if (row.length <= insertionColIdx) return []
         return row.slice(insertionColIdx)
      })
      
      // Check if there is anything to shift
      const hasDataToShift = shiftedData.some(row => row.length > 0)
      
      if (hasDataToShift) {
        // Target: insertionColIdx + 1 (0-based) -> +1 for 1-based -> "B" becomes "C"
        // Target column letter
        const targetColLetter = colIndexToLetter(insertionColIdx + 1)
        const range = `${formatSheetNameForA1(activeSheet.properties.title)}!${targetColLetter}1`

        // Clear the new column
        const clearRange = `${formatSheetNameForA1(activeSheet.properties.title)}!${insertionColLetter}1:${insertionColLetter}${rowCount}`
        const clearValues = Array.from({ length: rowCount }, () => ['']) // Column of empty strings

        const updates = [
          {
            range,
            values: shiftedData
          },
          {
            range: clearRange,
            values: clearValues
          }
        ]

         await api.callTool('batch_update_spreadsheet_values', {
            spreadsheet_id: activeSpreadsheet.spreadsheetId,
            valueInputOption: 'USER_ENTERED',
            data: updates
         })
      }
    } catch (err) {
      console.error('Failed to add column:', err)
      setError('Failed to add column')
       if (activeSpreadsheet && activeSheetId) {
         const activeSheet = activeSpreadsheet.sheets.find(s => s.properties.sheetId === activeSheetId)
         if (activeSheet) {
             await loadSheetData(activeSpreadsheet.spreadsheetId, activeSheet.properties.title)
         }
      }
    }
  }
  
  /**
   * Delete a spreadsheet
   */
  const handleDeleteSpreadsheet = async (spreadsheetId: string) => {
    try {
      // Try using GridwellDrive API to delete the file first
      // Note: This might fail if the gridwell_drive service is not loaded in the backend
      await gridwell_driveApi.callTool('delete_file_permanently', {
        fileId: spreadsheetId,
      })
      
      // Refresh the list
      await loadSpreadsheets()
    } catch (err) {
      console.warn('Backend delete failed, performing client-side soft delete:', err)
      
      // Fallback: Client-side soft delete
      // 1. Persist deletion in localStorage so it survives refreshes
      const deletedIds = JSON.parse(localStorage.getItem('deleted_spreadsheet_ids') || '[]')
      if (!deletedIds.includes(spreadsheetId)) {
        deletedIds.push(spreadsheetId)
        localStorage.setItem('deleted_spreadsheet_ids', JSON.stringify(deletedIds))
      }
      
      // 2. Update local state immediately
      setSpreadsheets(prev => prev.filter(s => s.spreadsheetId !== spreadsheetId))
      
      // 3. Clear any error that might have been set
      setError(null)
    }
  }
  
  // =========================================================================
  // Comments Functions
  // =========================================================================

  const gridwell_driveAvailable = useRef<boolean | null>(null)

  const loadComments = async (fileId: string) => {
    setLoadingComments(true)
    try {
      // Try GridwellDrive API first (if gridwell_drive service is loaded and hasn't failed before)
      if (gridwell_driveAvailable.current !== false) {
        try {
          const result = await gridwell_driveApi.callTool('list_comments', { fileId })
          gridwell_driveAvailable.current = true
          setComments(result.comments || [])
          return
        } catch {
          gridwell_driveAvailable.current = false
        }
      }

      // Fallback: Load comments directly from state
      const stateResponse = await fetch('./api/services/gridwell_sheets/state').then(r => r.json())
      const userData = stateResponse?.state?.users?.me
      if (!userData) { setComments([]); return }

      const commentsMap = userData.comments || {}
      const repliesMap = userData.replies || {}

      // Group replies by commentId for O(M+N) lookup
      const repliesByComment: Record<string, any[]> = {}
      for (const r of Object.values(repliesMap) as any[]) {
        if (!repliesByComment[r.commentId]) repliesByComment[r.commentId] = []
        repliesByComment[r.commentId].push(r)
      }
      for (const arr of Object.values(repliesByComment)) {
        arr.sort((a: any, b: any) => new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime())
      }

      // Filter comments for this file and attach their replies
      const fileComments: FileComment[] = Object.values(commentsMap)
        .filter((c: any) => c.fileId === fileId)
        .map((c: any) => ({ ...c, replies: repliesByComment[c.id] || [] }) as FileComment)
        .sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime())

      setComments(fileComments)
    } catch (err) {
      console.error('Failed to load comments:', err)
      setComments([])
    } finally {
      setLoadingComments(false)
    }
  }

  const handleOpenComments = async () => {
    if (showCommentsPanel) {
      setShowCommentsPanel(false)
      return
    }
    setShowCommentsPanel(true)
    setExpandedComments({})
    setReplyTexts({})
    if (activeSpreadsheet && commentsLoadedForRef.current !== activeSpreadsheet.spreadsheetId) {
      await loadComments(activeSpreadsheet.spreadsheetId)
      commentsLoadedForRef.current = activeSpreadsheet.spreadsheetId
    }
  }

  const handleCreateComment = async () => {
    if (!activeSpreadsheet || !newComment.trim()) return
    setCreatingComment(true)
    try {
      await gridwell_driveApi.callTool('create_file_comment', {
        fileId: activeSpreadsheet.spreadsheetId,
        content: newComment.trim()
      })
      setNewComment('')
      await loadComments(activeSpreadsheet.spreadsheetId)
    } catch (err) {
      console.error('Failed to create comment:', err)
    } finally {
      setCreatingComment(false)
    }
  }

  const handleCreateReply = async (commentId: string) => {
    if (!activeSpreadsheet || !replyTexts[commentId]?.trim()) return
    try {
      await gridwell_driveApi.callTool('create_comment_reply', {
        fileId: activeSpreadsheet.spreadsheetId,
        commentId,
        body: { content: replyTexts[commentId].trim() }
      })
      setReplyTexts(prev => ({ ...prev, [commentId]: '' }))
      await loadComments(activeSpreadsheet.spreadsheetId)
    } catch (err) {
      console.error('Failed to create reply:', err)
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    if (!activeSpreadsheet) return
    if (!confirm('Delete this comment?')) return
    try {
      await gridwell_driveApi.callTool('delete_file_comment', {
        fileId: activeSpreadsheet.spreadsheetId,
        commentId
      })
      await loadComments(activeSpreadsheet.spreadsheetId)
    } catch (err) {
      console.error('Failed to delete comment:', err)
    }
  }

  // =========================================================================
  // Cell reference string
  // =========================================================================
  
  const cellRefString = selection
    ? `${colIndexToLetter(Math.min(selection.startCol, selection.endCol))}${Math.min(selection.startRow, selection.endRow) + 1}:${colIndexToLetter(Math.max(selection.startCol, selection.endCol))}${Math.max(selection.startRow, selection.endRow) + 1}`
    : activeCell
      ? `${colIndexToLetter(activeCell.col)}${activeCell.row + 1}`
      : ''
  
  // =========================================================================
  // Render
  // =========================================================================
  
  if (loading && view === 'list') {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gradient-to-b from-[var(--bg-secondary)] to-[var(--bg-primary)]">
        {/* Loading animation with GridwellSheets icon */}
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#059669] to-[#047857] flex items-center justify-center shadow-xl animate-pulse">
            <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/>
              <path d="M7 7h2v2H7zm0 4h2v2H7zm0 4h2v2H7zm4-8h6v2h-6zm0 4h6v2h-6zm0 4h6v2h-6z"/>
            </svg>
          </div>
          <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-white dark:bg-[var(--bg-primary)] rounded-full flex items-center justify-center shadow-lg">
            <div className="w-4 h-4 border-2 border-[#0D9488]/30 border-t-[#0D9488] rounded-full animate-spin" />
          </div>
        </div>
        <p className="mt-6 text-sm font-medium text-[var(--text-secondary)]">Loading your spreadsheets...</p>
      </div>
    )
  }
  
  if (error && view === 'list') {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gradient-to-b from-[var(--bg-secondary)] to-[var(--bg-primary)] gap-6">
        {/* Error icon */}
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-xl">
          <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-[var(--text-primary)] mb-1">Something went wrong</p>
          <p className="text-sm text-[var(--danger-color)]">{error}</p>
        </div>
        <button
          className="flex items-center gap-2 px-6 py-2.5 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-full transition-all font-medium shadow-md hover:shadow-lg"
          onClick={loadSpreadsheets}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Try Again
        </button>
      </div>
    )
  }
  
  // Spreadsheet list view
  if (view === 'list') {
    return (
      <div className="min-h-full flex flex-col bg-[var(--bg-primary)]">
        {/* Header - Modern GridwellSheets branding */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-white dark:bg-[var(--bg-secondary)] shadow-sm">
          <div className="flex items-center gap-3">
            {/* GridwellSheets Icon */}
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#059669] to-[#047857] flex items-center justify-center shadow-md">
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/>
                <path d="M7 7h2v2H7zm0 4h2v2H7zm0 4h2v2H7zm4-8h6v2h-6zm0 4h6v2h-6zm0 4h6v2h-6z"/>
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-semibold text-[var(--text-primary)]">{APP_NAME}</h1>
              <p className="text-xs text-[var(--text-secondary)]">Create and edit spreadsheets</p>
            </div>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 text-sm bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-full transition-all font-medium shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Spreadsheet
          </button>
        </div>
        
        {/* Spreadsheet list */}
        <SpreadsheetList
          spreadsheets={spreadsheets}
          onSelect={handleSelectSpreadsheet}
          onDelete={handleDeleteSpreadsheet}
          onRefresh={loadSpreadsheets}
          loading={loading}
        />
        
        {/* Create modal */}
        <CreateSpreadsheetModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateSpreadsheet}
          loading={saving}
        />
      </div>
    )
  }
  
  // Spreadsheet view
  return (
    <div className="h-full flex flex-col bg-[var(--bg-primary)]">
      {/* Header - Modern spreadsheet header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-color)] bg-white dark:bg-[var(--bg-secondary)] shadow-sm">
        {/* Back button */}
        <button
          onClick={handleBackToList}
          className="flex items-center justify-center w-9 h-9 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[#f1f3f4] dark:hover:bg-[var(--bg-tertiary)] rounded-full transition-all"
          title="Back to list"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        
        {/* GridwellSheets icon */}
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#059669] to-[#047857] flex items-center justify-center shadow-sm">
          <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/>
            <path d="M7 7h2v2H7zm0 4h2v2H7zm4-4h6v2h-6zm0 4h6v2h-6z"/>
          </svg>
        </div>
        
        {/* Spreadsheet title */}
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold text-[var(--text-primary)] truncate">
            {activeSpreadsheet?.properties.title || 'Untitled'}
            {activeSpreadsheet && <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{activeSpreadsheet.spreadsheetId}]</span>}
          </h1>
        </div>
        
        {/* Saving indicator */}
        {saving && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#f1f3f4] dark:bg-[var(--bg-tertiary)] rounded-full">
            <div className="w-3 h-3 border-2 border-[#0D9488]/30 border-t-[#0D9488] rounded-full animate-spin" />
            <span className="text-xs font-medium text-[var(--text-secondary)]">Saving...</span>
          </div>
        )}
      </div>
      
      {/* Formula bar */}
      <FormulaBar
        cellRef={cellRefString}
        value={formulaBarValue}
        onChange={setFormulaBarValue}
        onSubmit={handleFormulaBarSubmit}
      />

      {/* Toolbar - Modern button styling */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-[var(--border-color)] bg-[#f8f9fa] dark:bg-[var(--bg-secondary)]">
        {/* Add Row button */}
        <button
          onClick={handleAddRow}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white dark:bg-[var(--bg-primary)] hover:bg-[#F0FDFA] dark:hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[#0D9488] border border-[var(--border-color)] hover:border-[#0D9488]/30 rounded-lg transition-all shadow-sm"
          title="Insert row after current cell"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Row
        </button>
        
        {/* Add Column button */}
        <button
          onClick={handleAddColumn}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white dark:bg-[var(--bg-primary)] hover:bg-[#F0FDFA] dark:hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[#0D9488] border border-[var(--border-color)] hover:border-[#0D9488]/30 rounded-lg transition-all shadow-sm"
          title="Insert column after current cell"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Column
        </button>

        {/* Clear Selection button */}
        <button
          onClick={() => {
            if (selection) {
              handleClearSelection()
            } else if (activeCell) {
              handleClearCell()
            }
          }}
          disabled={!hasContentToClear}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white dark:bg-[var(--bg-primary)] text-[var(--text-secondary)] border border-[var(--border-color)] rounded-lg transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:bg-[#F0FDFA] enabled:dark:hover:bg-[var(--bg-tertiary)] enabled:hover:text-[#E11D48] enabled:hover:border-[#E11D48]/30"
          title="Clear selected cells"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Clear
        </button>

        {/* Get Batch button */}
        <button
          onClick={() => {
            setBatchGetResults(null)
            setShowBatchGetModal(true)
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white dark:bg-[var(--bg-primary)] hover:bg-[#F0FDFA] dark:hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[#0D9488] border border-[var(--border-color)] hover:border-[#0D9488]/30 rounded-lg transition-all shadow-sm"
          title="Get values from multiple ranges"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Get Batch
        </button>

        {/* Import Data button */}
        <button
          onClick={() => setShowImportModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white dark:bg-[var(--bg-primary)] hover:bg-[#F0FDFA] dark:hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[#0D9488] border border-[var(--border-color)] hover:border-[#0D9488]/30 rounded-lg transition-all shadow-sm"
          title="Import CSV data to spreadsheet"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          Import Data
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-[var(--border-color)] mx-1" />

        {/* Batch Clear button */}
        <button
          onClick={() => setShowBatchClearModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white dark:bg-[var(--bg-primary)] hover:bg-[#FFF1F2] dark:hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[#E11D48] border border-[var(--border-color)] hover:border-[#E11D48]/30 rounded-lg transition-all shadow-sm"
          title="Clear values from multiple ranges"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Batch Clear
        </button>

        {/* Data Filter button */}
        <button
          onClick={() => {
            setDataFilterResults(null)
            setShowDataFilterModal(true)
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white dark:bg-[var(--bg-primary)] hover:bg-[#F0FDFA] dark:hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[#0D9488] border border-[var(--border-color)] hover:border-[#0D9488]/30 rounded-lg transition-all shadow-sm"
          title="Get or clear values using data filters"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          Data Filter
        </button>

        {/* Copy Sheet button */}
        <button
          onClick={() => setShowCopySheetModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white dark:bg-[var(--bg-primary)] hover:bg-[#F0FDFA] dark:hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[#0D9488] border border-[var(--border-color)] hover:border-[#0D9488]/30 rounded-lg transition-all shadow-sm"
          title="Copy current sheet to another spreadsheet"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Copy Sheet
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-[var(--border-color)] mx-1" />

        {/* Comments button */}
        <button
          onClick={handleOpenComments}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-all shadow-sm ${
            showCommentsPanel
              ? 'bg-[#F0FDFA] dark:bg-[var(--bg-tertiary)] text-[#0D9488] border-[#0D9488]/30'
              : 'bg-white dark:bg-[var(--bg-primary)] hover:bg-[#F0FDFA] dark:hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[#0D9488] border-[var(--border-color)] hover:border-[#0D9488]/30'
          }`}
          title="View comments"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
          Comments
          {comments.length > 0 && !showCommentsPanel && (
            <span className="ml-0.5 px-1.5 py-0.5 text-[10px] font-bold leading-none rounded-full bg-[#0D9488] text-white">
              {comments.length}
            </span>
          )}
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-[var(--border-color)] mx-2" />

        {/* Selection info */}
        <div className="flex items-center gap-2 px-3 py-1 bg-white dark:bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg">
          <svg className="w-3.5 h-3.5 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
          </svg>
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            {selection 
              ? `${Math.abs(selection.endRow - selection.startRow) + 1} × ${Math.abs(selection.endCol - selection.startCol) + 1} cells`
              : activeCell 
                ? `${colIndexToLetter(activeCell.col)}${activeCell.row + 1}`
                : 'No selection'
            }
          </span>
        </div>
      </div>
      
      {/* Grid + Comments Panel */}
      <div className="flex flex-1 overflow-hidden">
        <SpreadsheetGrid
          data={gridData}
          rowCount={rowCount}
          colCount={colCount}
          activeCell={activeCell}
          onSelectCell={handleSelectCell}
          onStartEditing={handleStartEditing}
          editingCell={editingCell}
          editValue={editValue}
          onEditChange={setEditValue}
          onEditSubmit={handleEditSubmit}
          onEditCancel={handleEditCancel}
          onClearCell={handleClearCell}
          onClearSelection={handleClearSelection}
          selection={selection}
          onSelectionChange={setSelection}
          onCopy={handleCopy}
          onPaste={handlePaste}
          onCut={handleCut}
          sheetsData={sheetsData}
          currentSheetTitle={activeSpreadsheet?.sheets.find(s => s.properties.sheetId === activeSheetId)?.properties.title}
        />

        {/* Comments Panel */}
        {showCommentsPanel && (
          <div className="w-80 flex-shrink-0 border-l border-[var(--border-color)] bg-white dark:bg-[var(--bg-secondary)] flex flex-col">
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)]">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Comments</h3>
              <button
                onClick={() => setShowCommentsPanel(false)}
                className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[#f1f3f4] dark:hover:bg-[var(--bg-tertiary)] rounded-full transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Add comment form */}
            <div className="px-4 py-3 border-b border-[var(--border-color)]">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreateComment() }}
                  placeholder="Add a comment..."
                  className="flex-1 px-3 py-2 text-sm bg-[#f8f9fa] dark:bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] outline-none focus:border-[#0D9488] focus:bg-white dark:focus:bg-[var(--bg-primary)] transition-all placeholder:text-[var(--text-secondary)]/50"
                />
                <button
                  onClick={handleCreateComment}
                  disabled={creatingComment || !newComment.trim()}
                  className="px-3 py-2 text-sm font-medium bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creatingComment ? '...' : 'Post'}
                </button>
              </div>
            </div>

            {/* Comments list */}
            <div className="flex-1 overflow-y-auto">
              {loadingComments ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-5 h-5 border-2 border-[#0D9488]/30 border-t-[#0D9488] rounded-full animate-spin" />
                </div>
              ) : comments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4">
                  <svg className="w-10 h-10 text-[var(--text-secondary)]/30 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                  </svg>
                  <p className="text-sm text-[var(--text-secondary)] text-center">No comments yet</p>
                  <p className="text-xs text-[var(--text-secondary)]/60 text-center mt-1">Add a comment to start a discussion</p>
                </div>
              ) : (
                <div className="divide-y divide-[var(--border-color)]">
                  {comments.map((comment) => (
                    <div key={comment.id} className="group px-4 py-3">
                      {/* Comment header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-[#0D9488] flex items-center justify-center flex-shrink-0">
                            <span className="text-[10px] font-bold text-white">
                              {(comment.author?.displayName || comment.author?.emailAddress || '?')[0].toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                              {comment.author?.displayName || comment.author?.emailAddress || 'Unknown'}
                              <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{comment.id}]</span>
                            </p>
                            <p className="text-[10px] text-[var(--text-secondary)]">
                              {new Date(comment.createdTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteComment(comment.id)}
                          className="p-1 text-[var(--text-secondary)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-all opacity-0 group-hover:opacity-100 flex-shrink-0"
                          title="Delete comment"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>

                      {/* Comment content */}
                      <p className="text-sm text-[var(--text-primary)] mt-2 ml-8 leading-relaxed">
                        {comment.content}
                      </p>

                      {/* Resolved badge */}
                      {comment.resolved && (
                        <span className="inline-block ml-8 mt-1 px-2 py-0.5 text-[10px] font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full">
                          Resolved
                        </span>
                      )}

                      {/* Replies */}
                      {comment.replies && comment.replies.length > 0 && (
                        <div className="ml-8 mt-2">
                          <button
                            onClick={() => setExpandedComments(prev => ({ ...prev, [comment.id]: !prev[comment.id] }))}
                            className="text-xs font-medium text-[#0D9488] hover:text-[#0F766E] transition-colors mb-1"
                          >
                            {expandedComments[comment.id] ? 'Hide' : 'Show'} {comment.replies.length} {comment.replies.length === 1 ? 'reply' : 'replies'}
                          </button>
                          {expandedComments[comment.id] && (
                            <div className="space-y-2 mt-1">
                              {comment.replies.map((reply) => (
                                <div key={reply.id} className="pl-3 border-l-2 border-[var(--border-color)]">
                                  <div className="flex items-center gap-1.5">
                                    <div className="w-5 h-5 rounded-full bg-[#059669] flex items-center justify-center flex-shrink-0">
                                      <span className="text-[9px] font-bold text-white">
                                        {(reply.author?.displayName || reply.author?.emailAddress || '?')[0].toUpperCase()}
                                      </span>
                                    </div>
                                    <span className="text-[11px] font-semibold text-[var(--text-primary)] truncate">
                                      {reply.author?.displayName || reply.author?.emailAddress || 'Unknown'}
                                      <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{reply.id}]</span>
                                    </span>
                                    <span className="text-[10px] text-[var(--text-secondary)]">
                                      {new Date(reply.createdTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                    </span>
                                  </div>
                                  <p className="text-xs text-[var(--text-primary)] mt-1 ml-[26px] leading-relaxed">
                                    {reply.content}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Reply input */}
                      <div className="ml-8 mt-2 flex gap-1.5">
                        <input
                          type="text"
                          value={replyTexts[comment.id] || ''}
                          onChange={(e) => setReplyTexts(prev => ({ ...prev, [comment.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleCreateReply(comment.id) }}
                          placeholder="Reply..."
                          className="flex-1 px-2 py-1 text-xs bg-[#f8f9fa] dark:bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-[var(--text-primary)] outline-none focus:border-[#0D9488] transition-all placeholder:text-[var(--text-secondary)]/50"
                        />
                        <button
                          onClick={() => handleCreateReply(comment.id)}
                          disabled={!replyTexts[comment.id]?.trim()}
                          className="px-2 py-1 text-xs font-medium text-[#0D9488] hover:bg-[#F0FDFA] rounded transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Reply
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Sheet tabs */}
      {activeSpreadsheet && (
        <SheetTabBar
          sheets={activeSpreadsheet.sheets}
          activeSheetId={activeSheetId}
          onSelectSheet={setActiveSheetId}
          onAddSheet={() => setShowAddSheetModal(true)}
          onDeleteSheet={handleDeleteSheet}
          onRenameSheet={(sheetId) => {
            const sheet = activeSpreadsheet.sheets.find(s => s.properties.sheetId === sheetId)
            if (sheet) {
              setRenameSheetId(sheetId)
              setShowRenameSheetModal(true)
            }
          }}
        />
      )}
      
      {/* Add sheet modal */}
      <AddSheetModal
        isOpen={showAddSheetModal}
        onClose={() => setShowAddSheetModal(false)}
        onAdd={handleAddSheet}
        loading={saving}
      />

      {/* Rename sheet modal */}
      {renameSheetId !== null && activeSpreadsheet && (
        <RenameSheetModal
          isOpen={showRenameSheetModal}
          onClose={() => {
            setShowRenameSheetModal(false)
            setRenameSheetId(null)
          }}
          onRename={handleRenameSheet}
          currentName={
            activeSpreadsheet.sheets.find((s) => s.properties.sheetId === renameSheetId)?.properties.title || ''
          }
          loading={saving}
        />
      )}

      {/* Batch Get modal */}
      <BatchGetValuesModal
        isOpen={showBatchGetModal}
        onClose={() => {
          setShowBatchGetModal(false)
          setBatchGetResults(null)
        }}
        onBatchGet={handleBatchGetValues}
        onNewQuery={handleNewQuery}
        loading={saving}
        results={batchGetResults}
      />

      {/* Import Data modal */}
      <ImportDataModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImport={appendValuesToRange}
        loading={saving}
        defaultRange={
          activeSpreadsheet && activeSheetId !== null
            ? `${activeSpreadsheet.sheets.find(s => s.properties.sheetId === activeSheetId)?.properties.title || 'Sheet1'}!A:C`
            : 'Sheet1!A:C'
        }
      />

      {/* Copy Sheet modal */}
      {activeSpreadsheet && activeSheetId !== null && (
        <CopySheetModal
          isOpen={showCopySheetModal}
          onClose={() => setShowCopySheetModal(false)}
          onCopy={handleCopySheet}
          loading={saving}
          spreadsheets={spreadsheets}
          currentSpreadsheetId={activeSpreadsheet.spreadsheetId}
          currentSheetTitle={
            activeSpreadsheet.sheets.find(s => s.properties.sheetId === activeSheetId)?.properties.title || 'Sheet1'
          }
        />
      )}

      {/* Batch Clear modal */}
      <BatchClearValuesModal
        isOpen={showBatchClearModal}
        onClose={() => setShowBatchClearModal(false)}
        onBatchClear={handleBatchClearValues}
        loading={saving}
      />

      {/* Data Filter modal */}
      <DataFilterModal
        isOpen={showDataFilterModal}
        onClose={() => {
          setShowDataFilterModal(false)
          setDataFilterResults(null)
        }}
        onGetByFilter={handleGetByDataFilter}
        onBatchClearByFilter={handleClearByDataFilter}
        onBatchUpdateByFilter={handleUpdateByDataFilter}
        onGetSpreadsheetByFilter={handleGetSpreadsheetByDataFilter}
        loading={saving}
        results={dataFilterResults}
        onNewQuery={handleDataFilterNewQuery}
      />

      {/* Error display */}
      {error && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 px-4 py-2 bg-[var(--danger-color)] text-white rounded-lg shadow-lg">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-3 opacity-70 hover:opacity-100"
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}
