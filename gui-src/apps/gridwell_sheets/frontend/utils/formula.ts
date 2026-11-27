/**
 * Formula Evaluator for GridwellSheets Frontend
 *
 * Tokenizer + recursive-descent parser that mirrors the subset of GridwellSheets
 * formulas actually stored by the backend (which never evaluates them itself).
 *
 * Supported: numeric / string literals, booleans, comparison + arithmetic
 * operators, cell + range references (including cross-sheet `Sheet!A1:B2` and
 * `'Sheet Name'!A1`), and the function set listed in FUNCTIONS below.
 */

export type CellValue = string | number | boolean | null
export type GridData = CellValue[][]
export type SheetMap = Record<string, GridData>

export interface FormulaContext {
  data: GridData
  sheets?: SheetMap
  currentSheet?: string
}

// ---------------------------------------------------------------------------
// A1 helpers
// ---------------------------------------------------------------------------

function colLetterToIndex(letter: string): number {
  let column = 0
  for (let i = 0; i < letter.length; i++) {
    column = column * 26 + (letter.charCodeAt(i) - 64)
  }
  return column - 1
}

function parseA1(ref: string): { col: number; row: number } | null {
  const m = ref.match(/^\$?([A-Z]+)\$?([0-9]+)$/)
  if (!m) return null
  return { col: colLetterToIndex(m[1]), row: parseInt(m[2], 10) - 1 }
}

function resolveSheetData(sheetName: string | undefined, ctx: FormulaContext): GridData {
  if (!sheetName) return ctx.data
  if (ctx.sheets && ctx.sheets[sheetName]) return ctx.sheets[sheetName]
  if (ctx.currentSheet && sheetName === ctx.currentSheet) return ctx.data
  return []
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type TokenType =
  | 'NUMBER'
  | 'STRING'
  | 'BOOL'
  | 'IDENT'
  | 'REF'
  | 'OP'
  | 'LPAREN'
  | 'RPAREN'
  | 'COMMA'
  | 'COLON'
  | 'PERCENT'

interface Token {
  type: TokenType
  value: string
}

class FormulaError extends Error {
  readonly code: string
  constructor(code: string) {
    super(code)
    this.code = code
  }
}

// Matches a single cell reference with an explicit sheet prefix:
//   Sheet1!A1, 'Sheet Name'!$B$2
// Range tokens (the trailing `:B5`) are emitted separately by the tokenizer
// so the parser can build them uniformly with same-sheet ranges.
const SHEET_REF_PATTERN =
  /^(?:'((?:[^']|'')+)'|([A-Za-z_][A-Za-z0-9_.\s]*?))!(\$?[A-Za-z]+\$?[0-9]+)/

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++
      continue
    }

    // String literal — Sheets uses "" to escape an embedded quote
    if (ch === '"') {
      let j = i + 1
      let str = ''
      while (j < src.length) {
        if (src[j] === '"') {
          if (src[j + 1] === '"') {
            str += '"'
            j += 2
            continue
          }
          break
        }
        str += src[j]
        j++
      }
      if (j >= src.length) throw new FormulaError('#ERROR!')
      tokens.push({ type: 'STRING', value: str })
      i = j + 1
      continue
    }

    // Number
    if ((ch >= '0' && ch <= '9') || (ch === '.' && src[i + 1] >= '0' && src[i + 1] <= '9')) {
      const m = src.slice(i).match(/^[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?/)
      if (!m) throw new FormulaError('#ERROR!')
      tokens.push({ type: 'NUMBER', value: m[0] })
      i += m[0].length
      continue
    }

    // Cross-sheet reference: Sheet!A1 (a trailing `:B5` becomes its own tokens)
    if (ch === "'" || /[A-Za-z_]/.test(ch)) {
      const rest = src.slice(i)
      const refMatch = rest.match(SHEET_REF_PATTERN)
      if (refMatch) {
        const sheet = refMatch[1] !== undefined ? refMatch[1].replace(/''/g, "'") : refMatch[2]
        const start = refMatch[3]
        tokens.push({ type: 'REF', value: `${sheet}!${start.toUpperCase()}` })
        i += refMatch[0].length
        continue
      }
    }

    // Identifier or cell ref (A1) or function name
    if (/[A-Za-z_$]/.test(ch)) {
      const m = src.slice(i).match(/^\$?[A-Za-z]+\$?[0-9]+|^[A-Za-z_][A-Za-z0-9_.]*/)
      if (!m) throw new FormulaError('#ERROR!')
      const word = m[0]
      const upper = word.toUpperCase()
      if (/^\$?[A-Z]+\$?[0-9]+$/i.test(word)) {
        tokens.push({ type: 'REF', value: word.toUpperCase() })
      } else if (upper === 'TRUE' || upper === 'FALSE') {
        tokens.push({ type: 'BOOL', value: upper })
      } else {
        tokens.push({ type: 'IDENT', value: upper })
      }
      i += word.length
      continue
    }

    // Operators / punctuation
    if (ch === '<' && src[i + 1] === '=') { tokens.push({ type: 'OP', value: '<=' }); i += 2; continue }
    if (ch === '>' && src[i + 1] === '=') { tokens.push({ type: 'OP', value: '>=' }); i += 2; continue }
    if (ch === '<' && src[i + 1] === '>') { tokens.push({ type: 'OP', value: '<>' }); i += 2; continue }
    if (ch === '=' || ch === '<' || ch === '>') { tokens.push({ type: 'OP', value: ch }); i++; continue }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '^' || ch === '&') {
      tokens.push({ type: 'OP', value: ch }); i++; continue
    }
    if (ch === '(') { tokens.push({ type: 'LPAREN', value: '(' }); i++; continue }
    if (ch === ')') { tokens.push({ type: 'RPAREN', value: ')' }); i++; continue }
    if (ch === ',') { tokens.push({ type: 'COMMA', value: ',' }); i++; continue }
    if (ch === ':') { tokens.push({ type: 'COLON', value: ':' }); i++; continue }
    if (ch === '%') { tokens.push({ type: 'PERCENT', value: '%' }); i++; continue }

    throw new FormulaError('#ERROR!')
  }
  return tokens
}

// ---------------------------------------------------------------------------
// Parser → AST
// ---------------------------------------------------------------------------

type Node =
  | { kind: 'num'; value: number }
  | { kind: 'str'; value: string }
  | { kind: 'bool'; value: boolean }
  | { kind: 'ref'; ref: string }
  | { kind: 'range'; start: string; end: string }
  | { kind: 'unary'; op: string; operand: Node }
  | { kind: 'binary'; op: string; left: Node; right: Node }
  | { kind: 'percent'; operand: Node }
  | { kind: 'call'; name: string; args: Node[] }

class Parser {
  private pos = 0
  constructor(private tokens: Token[]) {}

  parse(): Node {
    const node = this.parseExpression()
    if (this.pos < this.tokens.length) throw new FormulaError('#ERROR!')
    return node
  }

  private peek(offset = 0): Token | undefined {
    return this.tokens[this.pos + offset]
  }

  private consume(): Token {
    const t = this.tokens[this.pos++]
    if (!t) throw new FormulaError('#ERROR!')
    return t
  }

  private match(type: TokenType, value?: string): boolean {
    const t = this.peek()
    if (!t || t.type !== type) return false
    if (value !== undefined && t.value !== value) return false
    return true
  }

  // expression : comparison
  private parseExpression(): Node { return this.parseComparison() }

  // comparison : concat ((=|<>|<|<=|>|>=) concat)?
  private parseComparison(): Node {
    let left = this.parseConcat()
    while (this.match('OP') && ['=', '<>', '<', '<=', '>', '>='].includes(this.peek()!.value)) {
      const op = this.consume().value
      const right = this.parseConcat()
      left = { kind: 'binary', op, left, right }
    }
    return left
  }

  // concat : additive (& additive)*
  private parseConcat(): Node {
    let left = this.parseAdditive()
    while (this.match('OP', '&')) {
      this.consume()
      const right = this.parseAdditive()
      left = { kind: 'binary', op: '&', left, right }
    }
    return left
  }

  // additive : multiplicative ((+|-) multiplicative)*
  private parseAdditive(): Node {
    let left = this.parseMultiplicative()
    while (this.match('OP', '+') || this.match('OP', '-')) {
      const op = this.consume().value
      const right = this.parseMultiplicative()
      left = { kind: 'binary', op, left, right }
    }
    return left
  }

  // multiplicative : power ((*|/) power)*
  private parseMultiplicative(): Node {
    let left = this.parsePower()
    while (this.match('OP', '*') || this.match('OP', '/')) {
      const op = this.consume().value
      const right = this.parsePower()
      left = { kind: 'binary', op, left, right }
    }
    return left
  }

  // power : unary (^ unary)*  (right-associative)
  private parsePower(): Node {
    const base = this.parseUnary()
    if (this.match('OP', '^')) {
      this.consume()
      const exp = this.parsePower()
      return { kind: 'binary', op: '^', left: base, right: exp }
    }
    return base
  }

  // unary : (+|-) unary | percent
  private parseUnary(): Node {
    if (this.match('OP', '+')) { this.consume(); return this.parseUnary() }
    if (this.match('OP', '-')) {
      this.consume()
      return { kind: 'unary', op: '-', operand: this.parseUnary() }
    }
    return this.parsePercent()
  }

  // percent : primary (%)?
  private parsePercent(): Node {
    const node = this.parsePrimary()
    if (this.match('PERCENT')) {
      this.consume()
      return { kind: 'percent', operand: node }
    }
    return node
  }

  private parsePrimary(): Node {
    const t = this.peek()
    if (!t) throw new FormulaError('#ERROR!')

    if (t.type === 'NUMBER') { this.consume(); return { kind: 'num', value: parseFloat(t.value) } }
    if (t.type === 'STRING') { this.consume(); return { kind: 'str', value: t.value } }
    if (t.type === 'BOOL') { this.consume(); return { kind: 'bool', value: t.value === 'TRUE' } }
    if (t.type === 'LPAREN') {
      this.consume()
      const inner = this.parseExpression()
      if (!this.match('RPAREN')) throw new FormulaError('#ERROR!')
      this.consume()
      return inner
    }
    if (t.type === 'IDENT') {
      const name = this.consume().value
      if (!this.match('LPAREN')) throw new FormulaError('#NAME?')
      this.consume()
      const args: Node[] = []
      if (!this.match('RPAREN')) {
        args.push(this.parseExpression())
        while (this.match('COMMA')) {
          this.consume()
          args.push(this.parseExpression())
        }
      }
      if (!this.match('RPAREN')) throw new FormulaError('#ERROR!')
      this.consume()
      return { kind: 'call', name, args }
    }
    if (t.type === 'REF') {
      const startRef = this.consume().value
      if (this.match('COLON')) {
        this.consume()
        const endTok = this.consume()
        if (endTok.type !== 'REF') throw new FormulaError('#ERROR!')
        return { kind: 'range', start: startRef, end: endTok.value }
      }
      return { kind: 'ref', ref: startRef }
    }
    throw new FormulaError('#ERROR!')
  }
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

type Scalar = number | string | boolean | null

interface Range2D {
  values: Scalar[][]
}

type Value = Scalar | Range2D

function isRange(v: Value): v is Range2D {
  return typeof v === 'object' && v !== null && Array.isArray((v as Range2D).values)
}

function splitRef(ref: string): { sheet?: string; cell: string } {
  const bang = ref.indexOf('!')
  if (bang === -1) return { cell: ref }
  return { sheet: ref.slice(0, bang), cell: ref.slice(bang + 1) }
}

function rawCellValue(sheet: string | undefined, cell: string, ctx: FormulaContext, stack: Set<string>): Scalar {
  const grid = resolveSheetData(sheet, ctx)
  const pos = parseA1(cell)
  if (!pos) return null
  const key = `${sheet ?? ctx.currentSheet ?? ''}!${cell.toUpperCase()}`
  if (stack.has(key)) throw new FormulaError('#CYCLE!')
  if (pos.row < 0 || !grid[pos.row] || pos.col < 0 || pos.col >= grid[pos.row].length) return null
  const raw = grid[pos.row][pos.col]
  if (typeof raw === 'string' && raw.startsWith('=')) {
    stack.add(key)
    try {
      // When recursing into a formula on a different sheet, the relative refs
      // inside it must resolve against that sheet's grid — not the caller's.
      // Without this, e.g. =SUM(Payroll!E2:E7) on Summary would evaluate
      // Payroll!E2 = "=C2+D2" but read C2/D2 from Summary, falsely cycling
      // through the original SUM cell.
      const targetSheet = sheet ?? ctx.currentSheet
      const targetData = (targetSheet && ctx.sheets && ctx.sheets[targetSheet]) || ctx.data
      const inner = evaluateInternal(raw, { ...ctx, currentSheet: targetSheet, data: targetData }, stack)
      return scalarize(inner)
    } finally {
      stack.delete(key)
    }
  }
  return raw ?? null
}

function rangeValues(start: string, end: string, ctx: FormulaContext, stack: Set<string>): Range2D {
  const { sheet: sheetA, cell: cellA } = splitRef(start)
  const { sheet: sheetB, cell: cellB } = splitRef(end)
  const sheet = sheetA ?? sheetB
  const a = parseA1(cellA)
  const b = parseA1(cellB)
  if (!a || !b) return { values: [] }
  const minRow = Math.min(a.row, b.row)
  const maxRow = Math.max(a.row, b.row)
  const minCol = Math.min(a.col, b.col)
  const maxCol = Math.max(a.col, b.col)
  const grid = resolveSheetData(sheet, ctx)
  const out: Scalar[][] = []
  for (let r = minRow; r <= maxRow; r++) {
    const row: Scalar[] = []
    for (let c = minCol; c <= maxCol; c++) {
      const cellLetters = numberToLetters(c)
      row.push(rawCellValue(sheet, `${cellLetters}${r + 1}`, ctx, stack))
    }
    out.push(row)
  }
  return { values: out }
}

function numberToLetters(index: number): string {
  let out = ''
  let n = index
  while (n >= 0) {
    out = String.fromCharCode((n % 26) + 65) + out
    n = Math.floor(n / 26) - 1
  }
  return out
}

function scalarize(v: Value): Scalar {
  if (isRange(v)) return v.values[0]?.[0] ?? null
  return v
}

function toNumber(v: Scalar): number {
  if (v === null || v === '') return 0
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  const n = parseFloat(v)
  if (Number.isNaN(n)) throw new FormulaError('#VALUE!')
  return n
}

function toNumberLoose(v: Scalar): number | null {
  if (v === null || v === '') return null
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  const n = parseFloat(v)
  return Number.isNaN(n) ? null : n
}

function toBool(v: Scalar): boolean {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  if (v === null || v === '') return false
  if (typeof v === 'string') {
    const u = v.toUpperCase()
    if (u === 'TRUE') return true
    if (u === 'FALSE') return false
    const n = parseFloat(v)
    if (!Number.isNaN(n)) return n !== 0
  }
  return false
}

function toText(v: Scalar): string {
  if (v === null) return ''
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  return String(v)
}

function flatten(values: Value[]): Scalar[] {
  const out: Scalar[] = []
  for (const v of values) {
    if (isRange(v)) {
      for (const row of v.values) for (const cell of row) out.push(cell)
    } else {
      out.push(v)
    }
  }
  return out
}

function flatNumbers(values: Value[]): number[] {
  return flatten(values)
    .map(toNumberLoose)
    .filter((n): n is number => n !== null)
}

// Lift a scalar function over a Range2D argument so callers can write things
// like AVERAGE(ABS(B2:B4)) — ABS must broadcast across the range.
function liftScalar(v: Value, fn: (s: Scalar) => Scalar): Value {
  if (isRange(v)) return { values: v.values.map(row => row.map(fn)) }
  return fn(v as Scalar)
}

function compare(a: Scalar, b: Scalar): number {
  const na = toNumberLoose(a)
  const nb = toNumberLoose(b)
  if (na !== null && nb !== null) return na - nb
  return toText(a).localeCompare(toText(b))
}

// Criteria like ">10", "=Pass", "Pass", 5, "<>x"
function matchesCriterion(cell: Scalar, criterion: Scalar): boolean {
  if (typeof criterion === 'number' || typeof criterion === 'boolean') {
    const n = toNumberLoose(cell)
    return n !== null && n === toNumberLoose(criterion)
  }
  const raw = String(criterion ?? '')
  const m = raw.match(/^(<=|>=|<>|<|>|=)(.*)$/)
  if (m) {
    const op = m[1]
    const rhs = m[2]
    const rhsNum = toNumberLoose(rhs)
    const cellNum = toNumberLoose(cell)
    const numericCompare = rhsNum !== null && cellNum !== null
    switch (op) {
      case '=': return numericCompare ? cellNum === rhsNum : toText(cell) === rhs
      case '<>': return numericCompare ? cellNum !== rhsNum : toText(cell) !== rhs
      case '<': return numericCompare ? cellNum < rhsNum : toText(cell) < rhs
      case '<=': return numericCompare ? cellNum <= rhsNum : toText(cell) <= rhs
      case '>': return numericCompare ? cellNum > rhsNum : toText(cell) > rhs
      case '>=': return numericCompare ? cellNum >= rhsNum : toText(cell) >= rhs
    }
  }
  // Wildcards * and ?
  if (raw.includes('*') || raw.includes('?')) {
    const re = new RegExp(
      '^' +
      raw
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.') +
      '$',
      'i',
    )
    return re.test(toText(cell))
  }
  // Plain equality (case-insensitive for strings, like Sheets)
  if (typeof cell === 'string') return cell.toLowerCase() === raw.toLowerCase()
  return toText(cell) === raw
}

// ---------------------------------------------------------------------------
// Built-in functions
// ---------------------------------------------------------------------------

type Fn = (args: Value[], ctx: FormulaContext, stack: Set<string>) => Value

const FUNCTIONS: Record<string, Fn> = {
  SUM: (args) => flatNumbers(args).reduce((a, b) => a + b, 0),
  AVERAGE: (args) => {
    const nums = flatNumbers(args)
    if (!nums.length) throw new FormulaError('#DIV/0!')
    return nums.reduce((a, b) => a + b, 0) / nums.length
  },
  MIN: (args) => {
    const nums = flatNumbers(args)
    return nums.length ? Math.min(...nums) : 0
  },
  MAX: (args) => {
    const nums = flatNumbers(args)
    return nums.length ? Math.max(...nums) : 0
  },
  COUNT: (args) => flatten(args).filter(v => toNumberLoose(v) !== null).length,
  COUNTA: (args) => flatten(args).filter(v => v !== null && v !== '').length,
  COUNTBLANK: (args) => flatten(args).filter(v => v === null || v === '').length,
  PRODUCT: (args) => flatNumbers(args).reduce((a, b) => a * b, 1),
  ABS: (args) => liftScalar(args[0], s => Math.abs(toNumber(s))),
  ROUND: (args) => {
    const d = args.length > 1 ? Math.trunc(toNumber(scalarize(args[1]))) : 0
    const m = Math.pow(10, d)
    return liftScalar(args[0], s => Math.round(toNumber(s) * m) / m)
  },
  ROUNDUP: (args) => {
    const d = args.length > 1 ? Math.trunc(toNumber(scalarize(args[1]))) : 0
    const m = Math.pow(10, d)
    return liftScalar(args[0], s => {
      const n = toNumber(s)
      return (n >= 0 ? Math.ceil(n * m) : Math.floor(n * m)) / m
    })
  },
  ROUNDDOWN: (args) => {
    const d = args.length > 1 ? Math.trunc(toNumber(scalarize(args[1]))) : 0
    const m = Math.pow(10, d)
    return liftScalar(args[0], s => {
      const n = toNumber(s)
      return (n >= 0 ? Math.floor(n * m) : Math.ceil(n * m)) / m
    })
  },
  INT: (args) => liftScalar(args[0], s => Math.floor(toNumber(s))),
  MOD: (args) => {
    const a = toNumber(scalarize(args[0]))
    const b = toNumber(scalarize(args[1]))
    if (b === 0) throw new FormulaError('#DIV/0!')
    return a - Math.floor(a / b) * b
  },
  POWER: (args) => Math.pow(toNumber(scalarize(args[0])), toNumber(scalarize(args[1]))),
  SQRT: (args) => {
    const n = toNumber(scalarize(args[0]))
    if (n < 0) throw new FormulaError('#NUM!')
    return Math.sqrt(n)
  },
  CEILING: (args) => {
    const n = toNumber(scalarize(args[0]))
    const step = args.length > 1 ? toNumber(scalarize(args[1])) : 1
    return step === 0 ? 0 : Math.ceil(n / step) * step
  },
  FLOOR: (args) => {
    const n = toNumber(scalarize(args[0]))
    const step = args.length > 1 ? toNumber(scalarize(args[1])) : 1
    return step === 0 ? 0 : Math.floor(n / step) * step
  },
  IF: (args) => {
    if (args.length < 2) throw new FormulaError('#N/A')
    const cond = toBool(scalarize(args[0]))
    if (cond) return args[1] as Value
    return (args[2] ?? false) as Value
  },
  IFS: (args) => {
    for (let i = 0; i < args.length; i += 2) {
      if (toBool(scalarize(args[i]))) return args[i + 1] as Value
    }
    throw new FormulaError('#N/A')
  },
  IFERROR: (args) => {
    // Errors thrown during arg evaluation already short-circuit out of here,
    // so this is a no-op for non-error values; the wrapper around the call
    // catches the error and substitutes the fallback.
    return args[0] as Value
  },
  AND: (args) => flatten(args).every(v => toBool(v)),
  OR: (args) => flatten(args).some(v => toBool(v)),
  NOT: (args) => !toBool(scalarize(args[0])),
  SUMPRODUCT: (args) => {
    if (!args.length) return 0
    const arrays = args.map(a => {
      if (isRange(a)) return a.values.flat()
      return [a as Scalar]
    })
    const len = arrays[0].length
    if (!arrays.every(arr => arr.length === len)) throw new FormulaError('#VALUE!')
    let total = 0
    for (let i = 0; i < len; i++) {
      let prod = 1
      for (const arr of arrays) {
        const n = toNumberLoose(arr[i])
        prod *= n ?? 0
      }
      total += prod
    }
    return total
  },
  COUNTIF: (args) => countIfs([args[0]], [args[1]]),
  COUNTIFS: (args) => {
    const ranges: Value[] = []
    const crits: Value[] = []
    for (let i = 0; i < args.length; i += 2) {
      ranges.push(args[i])
      crits.push(args[i + 1])
    }
    return countIfs(ranges, crits)
  },
  SUMIF: (args) => sumIfs(args[2] ?? args[0], [args[0]], [args[1]]),
  SUMIFS: (args) => {
    const sumRange = args[0]
    const ranges: Value[] = []
    const crits: Value[] = []
    for (let i = 1; i < args.length; i += 2) {
      ranges.push(args[i])
      crits.push(args[i + 1])
    }
    return sumIfs(sumRange, ranges, crits)
  },
  AVERAGEIF: (args) => {
    const sumRange = args[2] ?? args[0]
    const matched = matchIndices([args[0]], [args[1]])
    const target = isRange(sumRange) ? sumRange.values.flat() : [sumRange as Scalar]
    const nums = matched.map(i => toNumberLoose(target[i])).filter((n): n is number => n !== null)
    if (!nums.length) throw new FormulaError('#DIV/0!')
    return nums.reduce((a, b) => a + b, 0) / nums.length
  },
  CONCATENATE: (args) => flatten(args).map(toText).join(''),
  CONCAT: (args) => flatten(args).map(toText).join(''),
  LEN: (args) => toText(scalarize(args[0])).length,
  UPPER: (args) => toText(scalarize(args[0])).toUpperCase(),
  LOWER: (args) => toText(scalarize(args[0])).toLowerCase(),
  TRIM: (args) => toText(scalarize(args[0])).replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' '),
  LEFT: (args) => {
    const s = toText(scalarize(args[0]))
    const n = args.length > 1 ? Math.trunc(toNumber(scalarize(args[1]))) : 1
    return s.slice(0, Math.max(0, n))
  },
  RIGHT: (args) => {
    const s = toText(scalarize(args[0]))
    const n = args.length > 1 ? Math.trunc(toNumber(scalarize(args[1]))) : 1
    if (n <= 0) return ''
    return s.slice(-n)
  },
  MID: (args) => {
    const s = toText(scalarize(args[0]))
    const start = Math.trunc(toNumber(scalarize(args[1])))
    const n = Math.trunc(toNumber(scalarize(args[2])))
    if (start < 1 || n < 0) throw new FormulaError('#VALUE!')
    return s.slice(start - 1, start - 1 + n)
  },
}

function flattenRangeOrScalar(v: Value): Scalar[] {
  return isRange(v) ? v.values.flat() : [v as Scalar]
}

function matchIndices(ranges: Value[], crits: Value[]): number[] {
  const flats = ranges.map(flattenRangeOrScalar)
  const len = flats[0]?.length ?? 0
  if (!flats.every(arr => arr.length === len)) throw new FormulaError('#VALUE!')
  const critScalars = crits.map(scalarize)
  const result: number[] = []
  for (let i = 0; i < len; i++) {
    let ok = true
    for (let j = 0; j < flats.length; j++) {
      if (!matchesCriterion(flats[j][i], critScalars[j])) { ok = false; break }
    }
    if (ok) result.push(i)
  }
  return result
}

function countIfs(ranges: Value[], crits: Value[]): number {
  return matchIndices(ranges, crits).length
}

function sumIfs(sumRange: Value, ranges: Value[], crits: Value[]): number {
  const target = flattenRangeOrScalar(sumRange)
  const matched = matchIndices(ranges, crits)
  let total = 0
  for (const i of matched) {
    const n = toNumberLoose(target[i])
    if (n !== null) total += n
  }
  return total
}

// ---------------------------------------------------------------------------
// AST evaluator
// ---------------------------------------------------------------------------

function evalNode(node: Node, ctx: FormulaContext, stack: Set<string>): Value {
  switch (node.kind) {
    case 'num': return node.value
    case 'str': return node.value
    case 'bool': return node.value
    case 'ref': {
      const { sheet, cell } = splitRef(node.ref)
      return rawCellValue(sheet, cell, ctx, stack)
    }
    case 'range': return rangeValues(node.start, node.end, ctx, stack)
    case 'unary': {
      const v = scalarize(evalNode(node.operand, ctx, stack))
      return -toNumber(v)
    }
    case 'percent': {
      const v = toNumber(scalarize(evalNode(node.operand, ctx, stack)))
      return v / 100
    }
    case 'binary': {
      const op = node.op
      if (op === '&') {
        return toText(scalarize(evalNode(node.left, ctx, stack))) + toText(scalarize(evalNode(node.right, ctx, stack)))
      }
      if (['=', '<>', '<', '<=', '>', '>='].includes(op)) {
        const a = scalarize(evalNode(node.left, ctx, stack))
        const b = scalarize(evalNode(node.right, ctx, stack))
        const c = compare(a, b)
        switch (op) {
          case '=': return c === 0
          case '<>': return c !== 0
          case '<': return c < 0
          case '<=': return c <= 0
          case '>': return c > 0
          case '>=': return c >= 0
        }
      }
      const lhs = toNumber(scalarize(evalNode(node.left, ctx, stack)))
      const rhs = toNumber(scalarize(evalNode(node.right, ctx, stack)))
      switch (op) {
        case '+': return lhs + rhs
        case '-': return lhs - rhs
        case '*': return lhs * rhs
        case '/':
          if (rhs === 0) throw new FormulaError('#DIV/0!')
          return lhs / rhs
        case '^': return Math.pow(lhs, rhs)
      }
      throw new FormulaError('#ERROR!')
    }
    case 'call': {
      const fn = FUNCTIONS[node.name]
      if (!fn) throw new FormulaError('#NAME?')
      if (node.name === 'IFERROR') {
        try {
          const v = evalNode(node.args[0], ctx, stack)
          return v
        } catch {
          return node.args[1] ? evalNode(node.args[1], ctx, stack) : ''
        }
      }
      if (node.name === 'IF' || node.name === 'IFS') {
        // Lazy-evaluate branches so an unused branch can't poison the result.
        if (node.name === 'IF') {
          const cond = toBool(scalarize(evalNode(node.args[0], ctx, stack)))
          if (cond) return node.args[1] ? evalNode(node.args[1], ctx, stack) : true
          return node.args[2] ? evalNode(node.args[2], ctx, stack) : false
        }
        for (let i = 0; i < node.args.length; i += 2) {
          if (toBool(scalarize(evalNode(node.args[i], ctx, stack)))) {
            return node.args[i + 1] ? evalNode(node.args[i + 1], ctx, stack) : true
          }
        }
        throw new FormulaError('#N/A')
      }
      const argValues = node.args.map(a => evalNode(a, ctx, stack))
      return fn(argValues, ctx, stack)
    }
  }
}

function evaluateInternal(formula: string, ctx: FormulaContext, stack: Set<string>): Value {
  const body = formula.startsWith('=') ? formula.slice(1) : formula
  const tokens = tokenize(body)
  if (!tokens.length) return ''
  const ast = new Parser(tokens).parse()
  return evalNode(ast, ctx, stack)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function valueToCell(v: Value): CellValue {
  if (isRange(v)) {
    const first = v.values[0]?.[0]
    return first === undefined ? null : (first as CellValue)
  }
  return v as CellValue
}

export function evaluateFormula(formula: string, data: GridData, context?: Omit<FormulaContext, 'data'>): CellValue {
  if (typeof formula !== 'string') return formula as CellValue
  if (!formula.startsWith('=')) {
    const trimmed = formula.trim()
    if (trimmed !== '' && !Number.isNaN(Number(trimmed))) return Number(trimmed)
    return formula
  }
  try {
    const ctx: FormulaContext = { data, sheets: context?.sheets, currentSheet: context?.currentSheet }
    return valueToCell(evaluateInternal(formula, ctx, new Set()))
  } catch (err) {
    if (err instanceof FormulaError) return err.code
    return '#ERROR!'
  }
}
