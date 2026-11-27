import type { DragMode, ElementGeom, PageElement, PageSize, Slide } from './slideTypes'

// Convert an API RGB color (0..1 floats) to a CSS rgb() string.
export function rgbColorToString(rgb: { red?: number; green?: number; blue?: number }): string {
  return `rgb(${Math.round((rgb.red || 0) * 255)}, ${Math.round((rgb.green || 0) * 255)}, ${Math.round((rgb.blue || 0) * 255)})`
}

// Concatenate all text runs from a shape's text into a single string.
export function getElementText(element: PageElement): string {
  return element.shape?.text?.textElements
    ?.map(el => el.textRun?.content || '')
    .join('') || ''
}

// Resolve a slide's background color, defaulting to white when missing/black.
export function getSlideBgColor(slide: Slide): string {
  const bgColor = slide.pageProperties?.backgroundColor?.opaqueColor?.rgbColor
    || slide.pageProperties?.pageBackgroundFill?.solidFill?.color?.rgbColor
  if (bgColor) {
    const colorStr = rgbColorToString(bgColor)
    if (colorStr === 'rgb(0, 0, 0)') return '#FFFFFF'
    return colorStr
  }
  return '#FFFFFF'
}

// Convert a unit value to a CSS dimension string (EMU/PT → px).
export function toCssPx(value: number, unit?: string): string {
  if (!unit) return `${value}pt`
  const u = unit.toUpperCase()
  if (u === 'EMU') return `${value / 914400 * 96}px` // 914400 EMU = 1 inch = 96 px
  if (u === 'PT') return `${value * 96 / 72}px`     // 1 pt = 1/72 inch
  return `${value}${unit.toLowerCase()}`
}

// Numeric CSS px value for layout math (assumes PT when unit missing).
export function toCssPxNum(value: number, unit?: string): number {
  const u = (unit || 'PT').toUpperCase()
  if (u === 'EMU') return value / 914400 * 96
  if (u === 'PT') return value * 96 / 72
  return value
}

// Convert CSS px back to PT (the unit used when writing transform/size to the API).
export function pxToPt(px: number): number {
  return px * 72 / 96
}

// Native slide size in CSS px. Defaults to 10" × 5.625" widescreen.
export function getNaturalSlideSize(pageSize?: PageSize): { width: number; height: number } {
  const w = pageSize?.width?.magnitude
  const h = pageSize?.height?.magnitude
  return {
    width: w ? toCssPxNum(w, pageSize?.width?.unit) : 960,
    height: h ? toCssPxNum(h, pageSize?.height?.unit) : 540,
  }
}

// Compute an element's bounding box in native slide CSS px from its raw transform/size.
export function getElementGeom(element: PageElement): ElementGeom {
  return {
    left: element.transform?.translateX != null
      ? toCssPxNum(element.transform.translateX, element.transform.unit)
      : 0,
    top: element.transform?.translateY != null
      ? toCssPxNum(element.transform.translateY, element.transform.unit)
      : 0,
    width: element.size?.width?.magnitude != null
      ? toCssPxNum(element.size.width.magnitude, element.size.width.unit)
      : 100,
    height: element.size?.height?.magnitude != null
      ? toCssPxNum(element.size.height.magnitude, element.size.height.unit)
      : 50,
  }
}

export const MIN_ELEMENT_SIZE_PX = 10

// At least this many px of an element must remain inside the slide. Keeps
// elements grabbable after a drag — without it, a fast drag off the canvas
// can leave only a few pixels visible (or none) and the element becomes
// effectively lost.
export const MIN_VISIBLE_PX = 30

// Clamp a geometry so the element retains at least MIN_VISIBLE_PX of overlap
// with the slide on every side. Applied during drag/resize so releasing the
// mouse outside the slide can't strand the element off-canvas.
export function clampGeomToSlide(
  geom: ElementGeom,
  slide: { width: number; height: number },
): ElementGeom {
  const minLeft = MIN_VISIBLE_PX - geom.width
  const maxLeft = slide.width - MIN_VISIBLE_PX
  const minTop = MIN_VISIBLE_PX - geom.height
  const maxTop = slide.height - MIN_VISIBLE_PX
  return {
    width: geom.width,
    height: geom.height,
    left: Math.max(minLeft, Math.min(maxLeft, geom.left)),
    top: Math.max(minTop, Math.min(maxTop, geom.top)),
  }
}

// Compute the new bounding box for a drag/resize operation given the mode,
// the original geometry at drag start, and pointer delta in native slide px.
// When the box would shrink below MIN_ELEMENT_SIZE_PX, the *opposite* edge is
// anchored so the element doesn't drift away from the user's pointer.
export function applyDrag(mode: DragMode, start: ElementGeom, dx: number, dy: number): ElementGeom {
  let { left, top, width, height } = start
  switch (mode) {
    case 'move':
      left += dx; top += dy; break
    case 'nw':
      left += dx; top += dy; width -= dx; height -= dy; break
    case 'n':
      top += dy; height -= dy; break
    case 'ne':
      top += dy; width += dx; height -= dy; break
    case 'e':
      width += dx; break
    case 'se':
      width += dx; height += dy; break
    case 's':
      height += dy; break
    case 'sw':
      left += dx; width -= dx; height += dy; break
    case 'w':
      left += dx; width -= dx; break
  }
  if (width < MIN_ELEMENT_SIZE_PX) {
    if (mode === 'nw' || mode === 'sw' || mode === 'w') {
      left = start.left + start.width - MIN_ELEMENT_SIZE_PX
    }
    width = MIN_ELEMENT_SIZE_PX
  }
  if (height < MIN_ELEMENT_SIZE_PX) {
    if (mode === 'nw' || mode === 'n' || mode === 'ne') {
      top = start.top + start.height - MIN_ELEMENT_SIZE_PX
    }
    height = MIN_ELEMENT_SIZE_PX
  }
  return { left, top, width, height }
}
