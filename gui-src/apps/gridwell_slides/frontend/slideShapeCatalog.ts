// Curated catalog of insertable shapes, organized by category for the toolbar
// shape picker. The full enum is much larger (see endpoint_models.py ShapeType);
// these are the shapes a typical user reaches for, exposed as labeled buttons.
// Every shapeType value below is part of the backend's accepted Literal union.

export type ShapeType = string

export interface ShapeDef {
  type: ShapeType
  label: string
}

export interface ShapeCategory {
  id: string
  label: string
  shapes: ShapeDef[]
}

export const SHAPE_CATEGORIES: ShapeCategory[] = [
  {
    id: 'basic',
    label: 'Shapes',
    shapes: [
      { type: 'RECTANGLE', label: 'Rectangle' },
      { type: 'ROUND_RECTANGLE', label: 'Rounded rectangle' },
      { type: 'ELLIPSE', label: 'Ellipse' },
      { type: 'TRIANGLE', label: 'Triangle' },
      { type: 'RIGHT_TRIANGLE', label: 'Right triangle' },
      { type: 'PARALLELOGRAM', label: 'Parallelogram' },
      { type: 'TRAPEZOID', label: 'Trapezoid' },
      { type: 'DIAMOND', label: 'Diamond' },
      { type: 'PENTAGON', label: 'Pentagon' },
      { type: 'HEXAGON', label: 'Hexagon' },
      { type: 'OCTAGON', label: 'Octagon' },
      { type: 'DECAGON', label: 'Decagon' },
      { type: 'DODECAGON', label: 'Dodecagon' },
      { type: 'HEART', label: 'Heart' },
      { type: 'TEARDROP', label: 'Teardrop' },
      { type: 'CLOUD', label: 'Cloud' },
      { type: 'SUN', label: 'Sun' },
      { type: 'MOON', label: 'Moon' },
      { type: 'LIGHTNING_BOLT', label: 'Lightning bolt' },
      { type: 'SMILEY_FACE', label: 'Smiley face' },
      { type: 'NO_SMOKING', label: 'Prohibition' },
      { type: 'PLAQUE', label: 'Plaque' },
      { type: 'FRAME', label: 'Frame' },
      { type: 'DONUT', label: 'Donut' },
      { type: 'CAN', label: 'Cylinder' },
      { type: 'CUBE', label: 'Cube' },
      { type: 'BEVEL', label: 'Bevel' },
      { type: 'FOLDED_CORNER', label: 'Folded corner' },
      { type: 'CHEVRON', label: 'Chevron' },
      { type: 'HOME_PLATE', label: 'Home plate' },
      { type: 'ARC', label: 'Arc' },
      { type: 'CHORD', label: 'Chord' },
      { type: 'PIE', label: 'Pie' },
      { type: 'BLOCK_ARC', label: 'Block arc' },
    ],
  },
  {
    id: 'arrows',
    label: 'Arrows',
    shapes: [
      { type: 'RIGHT_ARROW', label: 'Right arrow' },
      { type: 'LEFT_ARROW', label: 'Left arrow' },
      { type: 'UP_ARROW', label: 'Up arrow' },
      { type: 'DOWN_ARROW', label: 'Down arrow' },
      { type: 'LEFT_RIGHT_ARROW', label: 'Left-right arrow' },
      { type: 'UP_DOWN_ARROW', label: 'Up-down arrow' },
      { type: 'QUAD_ARROW', label: 'Quad arrow' },
      { type: 'LEFT_UP_ARROW', label: 'Left-up arrow' },
      { type: 'LEFT_RIGHT_UP_ARROW', label: 'Left-right-up arrow' },
      { type: 'BENT_ARROW', label: 'Bent arrow' },
      { type: 'BENT_UP_ARROW', label: 'Bent-up arrow' },
      { type: 'UTURN_ARROW', label: 'U-turn arrow' },
      { type: 'CURVED_RIGHT_ARROW', label: 'Curved right arrow' },
      { type: 'CURVED_LEFT_ARROW', label: 'Curved left arrow' },
      { type: 'CURVED_UP_ARROW', label: 'Curved up arrow' },
      { type: 'CURVED_DOWN_ARROW', label: 'Curved down arrow' },
      { type: 'STRIPED_RIGHT_ARROW', label: 'Striped right arrow' },
      { type: 'NOTCHED_RIGHT_ARROW', label: 'Notched right arrow' },
      { type: 'ARROW_EAST', label: 'East arrow' },
      { type: 'ARROW_NORTH', label: 'North arrow' },
      { type: 'ARROW_NORTH_EAST', label: 'North-east arrow' },
    ],
  },
  {
    id: 'callouts',
    label: 'Callouts',
    shapes: [
      { type: 'WEDGE_RECTANGLE_CALLOUT', label: 'Rectangle callout' },
      { type: 'WEDGE_ROUND_RECTANGLE_CALLOUT', label: 'Rounded rectangle callout' },
      { type: 'WEDGE_ELLIPSE_CALLOUT', label: 'Ellipse callout' },
      { type: 'CLOUD_CALLOUT', label: 'Cloud callout' },
      { type: 'LEFT_ARROW_CALLOUT', label: 'Left arrow callout' },
      { type: 'RIGHT_ARROW_CALLOUT', label: 'Right arrow callout' },
      { type: 'UP_ARROW_CALLOUT', label: 'Up arrow callout' },
      { type: 'DOWN_ARROW_CALLOUT', label: 'Down arrow callout' },
      { type: 'LEFT_RIGHT_ARROW_CALLOUT', label: 'Left-right arrow callout' },
      { type: 'QUAD_ARROW_CALLOUT', label: 'Quad arrow callout' },
      { type: 'SPEECH', label: 'Speech' },
    ],
  },
  {
    id: 'equations',
    label: 'Equations',
    shapes: [
      { type: 'MATH_PLUS', label: 'Plus' },
      { type: 'MATH_MINUS', label: 'Minus' },
      { type: 'MATH_MULTIPLY', label: 'Multiply' },
      { type: 'MATH_DIVIDE', label: 'Divide' },
      { type: 'MATH_EQUAL', label: 'Equal' },
      { type: 'MATH_NOT_EQUAL', label: 'Not equal' },
    ],
  },
  {
    id: 'stars',
    label: 'Stars & banners',
    shapes: [
      { type: 'STAR_4', label: '4-point star' },
      { type: 'STAR_5', label: '5-point star' },
      { type: 'STAR_6', label: '6-point star' },
      { type: 'STAR_7', label: '7-point star' },
      { type: 'STAR_8', label: '8-point star' },
      { type: 'STAR_10', label: '10-point star' },
      { type: 'STAR_12', label: '12-point star' },
      { type: 'STAR_16', label: '16-point star' },
      { type: 'STAR_24', label: '24-point star' },
      { type: 'STAR_32', label: '32-point star' },
      { type: 'STARBURST', label: 'Starburst' },
      { type: 'IRREGULAR_SEAL_1', label: 'Explosion 1' },
      { type: 'IRREGULAR_SEAL_2', label: 'Explosion 2' },
      { type: 'RIBBON', label: 'Ribbon' },
      { type: 'RIBBON_2', label: 'Ribbon 2' },
      { type: 'ELLIPSE_RIBBON', label: 'Ellipse ribbon' },
      { type: 'ELLIPSE_RIBBON_2', label: 'Ellipse ribbon 2' },
      { type: 'WAVE', label: 'Wave' },
      { type: 'DOUBLE_WAVE', label: 'Double wave' },
      { type: 'HORIZONTAL_SCROLL', label: 'Horizontal scroll' },
      { type: 'VERTICAL_SCROLL', label: 'Vertical scroll' },
    ],
  },
  {
    id: 'flow',
    label: 'Flowchart',
    shapes: [
      { type: 'FLOW_CHART_PROCESS', label: 'Process' },
      { type: 'FLOW_CHART_ALTERNATE_PROCESS', label: 'Alternate process' },
      { type: 'FLOW_CHART_DECISION', label: 'Decision' },
      { type: 'FLOW_CHART_INPUT_OUTPUT', label: 'Input/output' },
      { type: 'FLOW_CHART_DOCUMENT', label: 'Document' },
      { type: 'FLOW_CHART_MULTIDOCUMENT', label: 'Multidocument' },
      { type: 'FLOW_CHART_TERMINATOR', label: 'Terminator' },
      { type: 'FLOW_CHART_PREPARATION', label: 'Preparation' },
      { type: 'FLOW_CHART_MANUAL_INPUT', label: 'Manual input' },
      { type: 'FLOW_CHART_MANUAL_OPERATION', label: 'Manual operation' },
      { type: 'FLOW_CHART_CONNECTOR', label: 'Connector' },
      { type: 'FLOW_CHART_OFFPAGE_CONNECTOR', label: 'Off-page connector' },
      { type: 'FLOW_CHART_PUNCHED_CARD', label: 'Punched card' },
      { type: 'FLOW_CHART_PUNCHED_TAPE', label: 'Punched tape' },
      { type: 'FLOW_CHART_SUMMING_JUNCTION', label: 'Summing junction' },
      { type: 'FLOW_CHART_OR', label: 'Or' },
      { type: 'FLOW_CHART_COLLATE', label: 'Collate' },
      { type: 'FLOW_CHART_SORT', label: 'Sort' },
      { type: 'FLOW_CHART_EXTRACT', label: 'Extract' },
      { type: 'FLOW_CHART_MERGE', label: 'Merge' },
      { type: 'FLOW_CHART_PREDEFINED_PROCESS', label: 'Predefined process' },
      { type: 'FLOW_CHART_INTERNAL_STORAGE', label: 'Internal storage' },
      { type: 'FLOW_CHART_DISPLAY', label: 'Display' },
      { type: 'FLOW_CHART_DELAY', label: 'Delay' },
      { type: 'FLOW_CHART_MAGNETIC_DISK', label: 'Magnetic disk' },
      { type: 'FLOW_CHART_MAGNETIC_DRUM', label: 'Magnetic drum' },
      { type: 'FLOW_CHART_MAGNETIC_TAPE', label: 'Magnetic tape' },
      { type: 'FLOW_CHART_ONLINE_STORAGE', label: 'Online storage' },
      { type: 'FLOW_CHART_OFFLINE_STORAGE', label: 'Offline storage' },
    ],
  },
  {
    id: 'brackets',
    label: 'Brackets',
    shapes: [
      { type: 'BRACE_PAIR', label: 'Brace pair' },
      { type: 'BRACKET_PAIR', label: 'Bracket pair' },
      { type: 'LEFT_BRACE', label: 'Left brace' },
      { type: 'RIGHT_BRACE', label: 'Right brace' },
      { type: 'LEFT_BRACKET', label: 'Left bracket' },
      { type: 'RIGHT_BRACKET', label: 'Right bracket' },
    ],
  },
]

// Build a fast lookup table from shape type to label, used by the Element
// Properties dialog and selection panel to display the human-readable name.
export const SHAPE_LABELS: Record<string, string> = (() => {
  const out: Record<string, string> = { TEXT_BOX: 'Text box' }
  for (const cat of SHAPE_CATEGORIES) {
    for (const s of cat.shapes) out[s.type] = s.label
  }
  return out
})()

// Common slide layout presets that the backend's CreateSlideRequest accepts.
// Mirrors the PredefinedLayout Literal in endpoint_models.py.
export const PREDEFINED_LAYOUTS: { value: string; label: string }[] = [
  { value: 'BLANK', label: 'Blank' },
  { value: 'TITLE', label: 'Title slide' },
  { value: 'TITLE_AND_BODY', label: 'Title and body' },
  { value: 'TITLE_AND_TWO_COLUMNS', label: 'Title and two columns' },
  { value: 'TITLE_ONLY', label: 'Title only' },
  { value: 'SECTION_HEADER', label: 'Section header' },
  { value: 'SECTION_TITLE_AND_DESCRIPTION', label: 'Section title and description' },
  { value: 'ONE_COLUMN_TEXT', label: 'One column text' },
  { value: 'MAIN_POINT', label: 'Main point' },
  { value: 'BIG_NUMBER', label: 'Big number' },
  { value: 'CAPTION_ONLY', label: 'Caption only' },
]

// Curated list of common web-safe + GridwellSlides-default fonts. Plenty more
// are accepted by the backend (it's a free-form string), but exposing a small
// dropdown keeps the UI tidy. The user can still type a custom font name.
export const FONT_FAMILIES = [
  'Arial',
  'Arial Black',
  'Arial Narrow',
  'Calibri',
  'Cambria',
  'Comic Sans MS',
  'Consolas',
  'Courier New',
  'Garamond',
  'Georgia',
  'Helvetica',
  'Impact',
  'Lato',
  'Lucida Console',
  'Merriweather',
  'Montserrat',
  'Open Sans',
  'Oswald',
  'PT Sans',
  'PT Serif',
  'Palatino',
  'Playfair Display',
  'Raleway',
  'Roboto',
  'Roboto Condensed',
  'Roboto Mono',
  'Source Sans Pro',
  'Source Serif Pro',
  'Tahoma',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
]

export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 60, 72, 96]

// Weighted font family weights — backend accepts integers 100..900.
export const FONT_WEIGHTS: { value: number; label: string }[] = [
  { value: 100, label: 'Thin (100)' },
  { value: 200, label: 'Extra Light (200)' },
  { value: 300, label: 'Light (300)' },
  { value: 400, label: 'Regular (400)' },
  { value: 500, label: 'Medium (500)' },
  { value: 600, label: 'Semi Bold (600)' },
  { value: 700, label: 'Bold (700)' },
  { value: 800, label: 'Extra Bold (800)' },
  { value: 900, label: 'Black (900)' },
]
