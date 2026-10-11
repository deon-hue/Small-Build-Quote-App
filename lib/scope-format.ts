// Scope of works: bold, underline and bullets.
//
// The scope is still saved as one plain string, so everything that already reads it (the contract, the AI, the PDF, old quotes) keeps working:
//   **bold**   __underline__   and a line starting "- " is a bullet.
// The editor (components/ScopeEditor.tsx) never shows those marks: it shows real bold/underline/bullets and writes the marks into the string.
// Everything that shows a scope to someone goes through here (scopeToHtml for printed/online pages, components/ScopeView.tsx on screen), so a
// star never appears. Plain-text places (the contract box, an invoice description) use stripScopeMarks.

export interface ScopeSegment { text: string; bold?: boolean; underline?: boolean }
export type ScopeBlock =
  | { kind: 'line'; segs: ScopeSegment[] }
  | { kind: 'bullet'; segs: ScopeSegment[] }
  | { kind: 'blank' }

const BULLET_RX = /^\s*(?:[-•]|\*(?=\s))\s+/

/** Split one line into runs, applying **bold** and __underline__. An odd, unpaired mark is left as ordinary text. */
export function parseInline(line: string): ScopeSegment[] {
  const marks: { i: number; m: '**' | '__' }[] = []
  const rx = /\*\*|(?<!_)__(?!_)/g  // a longer run of underscores (a signature line) is just text
  let t: RegExpExecArray | null
  while ((t = rx.exec(line)) !== null) marks.push({ i: t.index, m: t[0] as '**' | '__' })
  for (const m of ['**', '__'] as const) {
    const of = marks.filter(x => x.m === m)
    if (of.length % 2 === 1) marks.splice(marks.indexOf(of[of.length - 1]), 1)
  }
  const out: ScopeSegment[] = []
  let bold = false, underline = false, last = 0
  const push = (text: string) => { if (text) out.push({ text, ...(bold ? { bold: true } : {}), ...(underline ? { underline: true } : {}) }) }
  for (const mk of marks) {
    push(line.slice(last, mk.i))
    last = mk.i + 2
    if (mk.m === '**') bold = !bold; else underline = !underline
  }
  push(line.slice(last))
  return out
}

export function parseScope(text: string): ScopeBlock[] {
  if (!(text || '').trim()) return []
  return (text || '').replace(/\r\n?/g, '\n').split('\n').map((raw): ScopeBlock => {
    if (!raw.trim()) return { kind: 'blank' }
    const b = BULLET_RX.exec(raw)
    return b ? { kind: 'bullet', segs: parseInline(raw.slice(b[0].length)) } : { kind: 'line', segs: parseInline(raw) }
  })
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function segsToHtml(segs: ScopeSegment[], tags: { b: string; u: string }): string {
  return segs.map(s => {
    let h = esc(s.text)
    if (s.underline) h = `<${tags.u}>${h}</${tags.u}>`
    if (s.bold) h = `<${tags.b}>${h}</${tags.b}>`
    return h
  }).join('')
}

/** HTML for a printed or online page (quote preview, emailed quote, print view). Everything is escaped. */
export function scopeToHtml(text: string): string {
  const blocks = parseScope(text)
  let html = '', inList = false
  for (const b of blocks) {
    if (b.kind === 'bullet') {
      if (!inList) { html += '<ul style="margin:4px 0 6px 20px;padding:0">'; inList = true }
      html += `<li style="margin:0 0 2px">${segsToHtml(b.segs, { b: 'strong', u: 'u' })}</li>`
      continue
    }
    if (inList) { html += '</ul>'; inList = false }
    html += b.kind === 'blank' ? '<div style="height:0.6em"></div>' : `<div>${segsToHtml(b.segs, { b: 'strong', u: 'u' })}</div>`
  }
  if (inList) html += '</ul>'
  return html
}

/** Plain text with the marks removed, for places that can't show formatting (contract box, an invoice description). Bullets are kept as "- ". */
export function stripScopeMarks(text: string): string {
  return parseScope(text).map(b =>
    b.kind === 'blank' ? '' : (b.kind === 'bullet' ? '- ' : '') + b.segs.map(s => s.text).join('')).join('\n')
}

/**
 * The section headings of a scope, for the one-page PDF summary: a bold phrase at the START of a line (the AI writes
 * "**Carpentry — Second Fix**" on its own line). Bold in the middle of a sentence is emphasis, not a heading.
 */
export function scopeHeadings(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const b of parseScope(text)) {
    if (b.kind === 'blank') continue
    const first = b.segs[0]
    if (!first?.bold) continue
    const h = first.text.replace(/:\s*$/, '').trim()
    if (h.length >= 3 && h.length <= 65 && !seen.has(h)) { seen.add(h); out.push(h) }
  }
  return out
}

// ── The editor's side: scope string <-> editable HTML ────────────────────────────────────────────────────────────────

/** Editable HTML for the editor: real bold/underline/bullets instead of marks. */
export function scopeToEditorHtml(text: string): string {
  const blocks = parseScope(text)
  let html = '', inList = false
  for (const b of blocks) {
    if (b.kind === 'bullet') {
      if (!inList) { html += '<ul>'; inList = true }
      html += `<li>${segsToHtml(b.segs, { b: 'b', u: 'u' })}</li>`
      continue
    }
    if (inList) { html += '</ul>'; inList = false }
    html += b.kind === 'blank' ? '<div><br></div>' : `<div>${segsToHtml(b.segs, { b: 'b', u: 'u' })}</div>`
  }
  if (inList) html += '</ul>'
  return html
}

/** One line of scope text as the editor shows it: whether it is a bullet, and its inline HTML (used when pasting). */
export function scopeLineForEditor(raw: string): { bullet: boolean; html: string } {
  const b = BULLET_RX.exec(raw)
  const body = b ? raw.slice(b[0].length) : raw
  return { bullet: !!b, html: segsToHtml(parseInline(body), { b: 'b', u: 'u' }) }
}

const BLOCK_TAGS =new Set(['DIV', 'P', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE'])

function wrapMarks(content: string, mark: string): string {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(content)
  if (!m || !m[2]) return content
  return m[1] + mark + m[2] + mark + m[3]
}

function isBoldEl(el: HTMLElement): boolean {
  if (el.tagName === 'B' || el.tagName === 'STRONG') return true
  const w = el.style?.fontWeight
  return w === 'bold' || w === 'bolder' || (!!w && Number(w) >= 600)
}
function isUnderlineEl(el: HTMLElement): boolean {
  return el.tagName === 'U' || /underline/.test(el.style?.textDecoration || '') || /underline/.test(el.style?.textDecorationLine || '')
}

function inlineText(node: Node): string {
  if (node.nodeType === 3) return node.nodeValue ?? ''
  if (node.nodeType !== 1) return ''
  const el = node as HTMLElement
  if (el.tagName === 'BR') return '\n'
  let s = ''
  el.childNodes.forEach(c => { s += inlineText(c) })
  if (isBoldEl(el)) s = wrapMarks(s, '**')
  if (isUnderlineEl(el)) s = wrapMarks(s, '__')
  return s
}

/** Read the editor back into the saved string. */
export function domToScope(root: HTMLElement): string {
  const lines: string[] = []
  let buf = ''
  const flush = () => { if (buf !== '') { buf.split('\n').forEach(l => lines.push(l)); buf = '' } }
  const walk = (parent: Node) => {
    parent.childNodes.forEach(n => {
      if (n.nodeType === 1 && BLOCK_TAGS.has((n as HTMLElement).tagName)) {
        const el = n as HTMLElement
        flush()
        if (el.tagName === 'LI') { lines.push('- ' + inlineText(el).replace(/\n+$/, '').replace(/\n/g, ' ')); return }
        const hasBlocks = Array.from(el.children).some(c => BLOCK_TAGS.has(c.tagName))
        if (hasBlocks) { walk(el); return }
        const t = inlineText(el)
        t.replace(/\n$/, '').split('\n').forEach(l => lines.push(l))
        return
      }
      buf += inlineText(n)
    })
    flush()
  }
  walk(root)
  // Two marks touching ("**a****b**") are one run
  return lines.join('\n').replace(/\*\*\*\*/g, '').replace(/(?<!_)____(?!_)/g, '').replace(/\s+$/, '')
}
