// The questions each kind of order asks (a skip, a digger, a portaloo, a grab lorry...), and how the answers are kept.
//
// The answers are not separate database columns: they are written as plain "Label: answer" lines at the top of the order's details, followed by the builder's own note. That way the supplier reads
// them as an ordinary list in the email and WhatsApp message, nothing needs a database change, and an order made this way is still just text if it is edited by hand. Pure (no imports), so
// it can be tested on its own: parseSpec reads the lines back and composeSpec writes them, and the two are exact opposites (the note is kept character for character).

export type SpecType = 'skip' | 'portaloo' | 'plant' | 'waste' | 'materials' | 'other'

export interface SpecField {
  key: string
  /** the start of the line the supplier reads, e.g. "Going in" */
  line: string
  /** the label on the form */
  label: string
  placeholder?: string
  /** a drop-down when set, a free box when not */
  options?: string[]
}

export interface TypeSpec { fields: SpecField[]; /** asks "how long for" */ duration: boolean }

const HANDOVER: SpecField = { key: 'handover', line: 'Delivery', label: 'Delivery', options: ['They deliver and collect it', 'We will collect it ourselves'] }

export const TYPE_SPEC: Record<SpecType, TypeSpec> = {
  skip: { duration: true, fields: [{ key: 'goingIn', line: 'Going in', label: 'What is going in', placeholder: 'Builders waste, soil, mixed' }] },
  plant: { duration: true, fields: [{ key: 'driver', line: 'Driver', label: 'Driver', options: ['With driver', 'Without driver (we drive it)'] }, HANDOVER] },
  portaloo: { duration: true, fields: [{ key: 'servicing', line: 'Servicing', label: 'Servicing', options: ['Weekly service', 'No service needed'] }] },
  waste: {
    duration: false,
    fields: [
      { key: 'service', line: 'Service', label: 'Which service', options: ['Grab lorry', 'Waste removal'] },
      { key: 'waste', line: 'Waste', label: 'What is it', placeholder: 'Soil, rubble, mixed' },
      { key: 'amount', line: 'Amount', label: 'About how much', placeholder: 'About 6 yards, or 2 loads' },
    ],
  },
  materials: { duration: false, fields: [] },
  other: { duration: false, fields: [HANDOVER] },
}

export const HOW_LONG_LINE = 'How long'
const HOW_LONG_KEY = 'howLong'

const linesOf = (type: SpecType): { key: string; line: string }[] => [
  ...TYPE_SPEC[type].fields.map(f => ({ key: f.key, line: f.line })),
  ...(TYPE_SPEC[type].duration ? [{ key: HOW_LONG_KEY, line: HOW_LONG_LINE }] : []),
]

export interface ParsedSpec { values: Record<string, string>; note: string }

/** Reads the answers off the top of the details, and gives back the rest as the note. Details with no answer lines are all note. */
export function parseSpec(type: SpecType, details: string): ParsedSpec {
  const known = linesOf(type)
  const lines = (details || '').split('\n')
  const values: Record<string, string> = {}
  let i = 0
  while (i < lines.length) {
    const m = /^([^:\n]+): (.*)$/.exec(lines[i])
    const hit = m ? known.find(k => k.line === m[1]) : undefined
    if (!m || !hit || values[hit.key] !== undefined) break
    values[hit.key] = m[2]
    i++
  }
  if (i > 0 && lines[i] === '') i++
  return { values, note: i === 0 ? (details || '') : lines.slice(i).join('\n') }
}

/** Writes the answers (an empty answer leaves its line out) and then the note, so that parseSpec gives the same back. */
export function composeSpec(type: SpecType, values: Record<string, string>, note: string): string {
  const out = linesOf(type).filter(k => (values[k.key] ?? '') !== '').map(k => `${k.line}: ${values[k.key]}`)
  return out.join('\n') + (out.length > 0 && note !== '' ? '\n\n' : '') + note
}

export type HowLongUnit = 'day' | 'week'

export const howLongText = (n: number, unit: HowLongUnit) => `${n} ${unit}${n === 1 ? '' : 's'}`

/** "2 weeks" → { n: 2, unit: 'week' }; anything else (typed by hand, or empty) → null. */
export function parseHowLong(text: string): { n: number; unit: HowLongUnit } | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(day|week)s?\s*$/i.exec(text || '')
  if (!m || !(+m[1] > 0)) return null
  return { n: +m[1], unit: m[2].toLowerCase() as HowLongUnit }
}

export { HOW_LONG_KEY }
