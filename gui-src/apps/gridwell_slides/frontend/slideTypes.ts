// Type definitions for the GridwellSlides app, mirroring the relevant subset of
// the GridwellSlides API response shape plus view-local types for drag/resize.

export interface PageSize {
  width?: {
    magnitude?: number
    unit?: string
  }
  height?: {
    magnitude?: number
    unit?: string
  }
}

export interface PageElement {
  objectId: string
  size?: {
    width?: { magnitude?: number; unit?: string }
    height?: { magnitude?: number; unit?: string }
  }
  transform?: {
    scaleX?: number
    scaleY?: number
    translateX?: number
    translateY?: number
    unit?: string
  }
  shape?: {
    shapeType?: string
    text?: {
      textElements?: Array<{
        textRun?: {
          content?: string
          style?: {
            foregroundColor?: {
              opaqueColor?: {
                rgbColor?: {
                  red?: number
                  green?: number
                  blue?: number
                }
              }
            }
            bold?: boolean
            italic?: boolean
            underline?: boolean
            fontSize?: { magnitude?: number; unit?: string }
            fontFamily?: string
          }
        }
        startIndex?: number
        endIndex?: number
      }>
    }
  }
  image?: {
    sourceUrl?: string
    contentUrl?: string
  }
  table?: {
    rows?: number
    columns?: number
  }
  pageElementType?: string
}

export interface NotesPage {
  objectId?: string
  pageElements?: PageElement[]
  notesProperties?: {
    speakerNotesObjectId?: string
  }
}

export interface Slide {
  objectId: string
  pageType?: string
  revisionId?: string
  pageProperties?: {
    backgroundColor?: {
      opaqueColor?: {
        rgbColor?: {
          red?: number
          green?: number
          blue?: number
        }
      }
    }
    pageBackgroundFill?: {
      solidFill?: {
        color?: {
          rgbColor?: {
            red?: number
            green?: number
            blue?: number
          }
        }
      }
    }
  }
  slideProperties?: {
    masterObjectId?: string
    layoutObjectId?: string
    isSkipped?: boolean
    notesPage?: NotesPage
  }
  pageElements?: PageElement[]
}

export interface Presentation {
  presentationId: string
  title?: string
  pageSize?: PageSize
  slides?: Slide[]
  masters?: unknown[]
  layouts?: unknown[]
  notesMaster?: unknown
  locale?: string
  revisionId?: string
}

export type ViewMode = 'editor' | 'sorter' | 'presenter'

// View-local types for editing interactions ---------------------------------

// Element bounding box in native slide CSS px (slide-local coordinates).
export interface ElementGeom {
  left: number
  top: number
  width: number
  height: number
}

export const DRAG_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const
export type DragHandle = (typeof DRAG_HANDLES)[number]
export type DragMode = 'move' | DragHandle

export interface DragState {
  objectId: string
  mode: DragMode
  startClientX: number
  startClientY: number
  start: ElementGeom
}
