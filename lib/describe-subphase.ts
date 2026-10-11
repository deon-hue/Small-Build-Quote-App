// "Write it for me" on a quote sub-phase's Description: the builder says or types a few rough words about the work and the AI turns them into the short
// scope-of-works line that is printed under the sub-phase name on the client's quote. This builds the instructions and cleans what comes back. The text is
// client-facing, so anything about prices, cost or profit is removed whatever the AI writes. Pure, so it can be tested.

export interface DescribeInput { notes: string; phase: string; parentPhase?: string; jobType?: string; roomLabel?: string }

export const MAX_NOTES = 1500
export const MAX_DESCRIPTION = 600

export function buildDescribePrompt(i: DescribeInput): { system: string; user: string } {
  const system = `You write the short scope-of-works description that sits under a sub-phase name on a UK builder's quote, and is read by the client. Turn the builder's rough notes into 1 to 3 clear sentences in plain UK English: what is being done, with the sizes, materials and finishes the notes mention.

Rules:
- Use only facts in the notes and the sub-phase name. Never invent sizes, materials, products or inclusions.
- Never mention prices, costs, rates, profit, margin or mark-up.
- Start with the work itself (for example "Build a ...", "Supply and fit ...", "Strip out ...").
- Plain text only: no markdown, bullets, headings, quotation marks or labels.
- If the notes are very thin, write one short sentence from what is there.
Return only the description.`
  const user = `Job type: ${i.jobType || 'general building works'}
Phase: ${i.parentPhase || '—'}
Sub-phase: ${i.phase}${i.roomLabel ? `\nRoom: ${i.roomLabel}` : ''}

Builder's notes:
${i.notes.trim().slice(0, MAX_NOTES)}`
  return { system, user }
}

const FORBIDDEN = /£|\bprofit\b|\bmargin\b|\bmark-?ups?\b|\bcosts?\b|\bprices?\b|\brates?\b/i

/** The description as it may go on a quote: plain text, no price talk, a sensible length. Empty when nothing usable is left. */
export function cleanDescription(raw: string): string {
  let t = (raw ?? '').replace(/```[a-z]*\n?/gi, '').replace(/[*_`#>]+/g, ' ').replace(/^\s*[-•]\s+/gm, '')
  t = t.replace(/^\s*(description|scope of works?|scope|summary)\s*[:\-–]\s*/i, '').trim()
  t = t.replace(/^["“'‘]+|["”'’]+$/g, '').replace(/\s*\n+\s*/g, ' ').replace(/\s+/g, ' ').trim()
  // sentences end at . ! or ? followed by a space and a capital (so "4.2m" is not cut in two)
  const sentences = t.match(/.+?(?:[.!?](?=\s+[A-Z"“'‘])|[.!?]$|$)/g) ?? []
  const kept = sentences.map(s => s.trim()).filter(s => s && !FORBIDDEN.test(s))
  let out = kept.join(' ')
  if (out.length > MAX_DESCRIPTION) {
    const cut = out.slice(0, MAX_DESCRIPTION)
    const at = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
    out = at > 80 ? cut.slice(0, at + 1) : cut.replace(/\s+\S*$/, '') + '…'
  }
  return out.trim()
}
