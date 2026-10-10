// Turns a chat message or scope (markdown-ish text with tags) into words a speech voice can read: no asterisks or tags, units said in full,
// bullets and headings as pauses. Then splits it into short pieces, because some browsers stop a long utterance part-way. Pure, so it can be tested.

export function speakableText(raw: string): string {
  let t = raw
  t = t.replace(/\[\/?(SCOPE|READY_TO_BUILD)\]/gi, ' ')
  t = t.replace(/^\s*[-_*]{3,}\s*$/gm, '')                 // horizontal rules
  t = t.replace(/\*\*([^*]+)\*\*(\s*[,.;:!?])?/g, (_m, w, p) => p ? w + p.trim() : w + '. ')   // **Heading** -> "Heading."; **word**, stays "word,"
  t = t.replace(/[*_`#>]+/g, ' ')
  t = t.replace(/^\s*[-•]\s+/gm, '')                       // bullets: the line itself is the pause
  t = t.replace(/\(Assumed:/gi, '(Assumed, ')
  // sizes written 9m x 7m or 900 × 900 × 600mm: say "by"
  t = t.replace(/(\d(?:\s?(?:mm|m))?)\s*[x×]\s*(?=\d)/gi, '$1 by ')
  t = t.replace(/\s[x×]\s(?=\d)/g, ' by ')                 // "8m long x 2.4m high"
  // numbers and units, so they are not read as letters
  t = t.replace(/(\d)\s?m²/g, '$1 square metres').replace(/(\d)\s?m2\b/g, '$1 square metres')
  t = t.replace(/(\d)\s?m³/g, '$1 cubic metres').replace(/(\d)\s?m3\b/g, '$1 cubic metres')
  t = t.replace(/(\d)\s?mm\b/g, '$1 millimetres')
  t = t.replace(/(\d)\s?lm\b/gi, '$1 linear metres')
  t = t.replace(/(\d)\s?m\b/g, '$1 metres')
  t = t.replace(/(\d)\s?kg\b/g, '$1 kilograms')
  // "1 metre", not "1 metres"
  t = t.replace(/(^|[^\d.])1 (metre|millimetre|square metre|cubic metre|linear metre|kilogram)s\b/g, '$11 $2')
  t = t.replace(/&/g, ' and ')
  t = t.replace(/\s*\n\s*/g, '. ')                          // a new line is a pause
  t = t.replace(/\.(\s*\.)+/g, '.').replace(/([:;,])\s*\./g, '$1').replace(/([!?])\s*\./g, '$1')
  t = t.replace(/[ \t]+/g, ' ').trim()
  return t
}

/** Pieces of at most `max` characters, cut at the end of a sentence where possible. */
export function speechChunks(text: string, max = 180): string[] {
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text]
  const out: string[] = []
  let cur = ''
  const push = () => { const c = cur.trim(); if (c) out.push(c); cur = '' }
  for (const s0 of sentences) {
    let s = s0
    while (s.length > max) {                                // a very long sentence: cut at the last comma or space before max
      const cut = Math.max(s.lastIndexOf(', ', max), s.lastIndexOf(' ', max))
      const at = cut > 40 ? cut + 1 : max
      if (cur) push()
      out.push(s.slice(0, at).trim())
      s = s.slice(at)
    }
    if ((cur + s).length > max) push()
    cur += s
  }
  push()
  return out.filter(Boolean)
}
