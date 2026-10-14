// Every company shares one quotes address and one documents address (say quotes@buildospro.ai), and each company's own code goes into it after a hyphen: quotes-ab12cd34@buildospro.ai.
// A catch-all rule at the mail host delivers all of them to the same inbox, and the app reads the code to know which company a message belongs to. (A plus sign, quotes+ab12cd34@, is read too:
// the first version of the addresses used it, but a hyphen is accepted by every mail system, so it is what is handed out now.) Pure.

/** quotes@buildospro.ai and a company's code give quotes-ab12cd34@buildospro.ai. Without a code, or without a base address, the base is returned as it is. */
export function withCode(base: string, code: string | null | undefined): string {
  const b = (base || '').trim()
  const c = (code || '').trim().toLowerCase()
  const at = b.lastIndexOf('@')
  if (at <= 0 || !c) return b
  const local = b.slice(0, at).split('+')[0].replace(/-[0-9a-f]{8}$/i, '')
  return `${local}-${c}${b.slice(at)}`
}

/**
 * The company code in any of the addresses a message was sent to ("Name <quotes-ab12cd34@buildospro.ai>" or a bare address), or null.
 * A code is 8 letters and numbers after a hyphen or plus. If `domains` is given, only addresses at those domains count. Several different codes in one message count as none: it is not clear whose it is.
 */
export function codeFromRecipients(recipients: (string | undefined | null)[], domains?: string[]): string | null {
  const found = new Set<string>()
  const re = /[+-]([0-9a-f]{8})@([a-z0-9.-]+)/gi
  const wanted = (domains ?? []).map(d => d.trim().toLowerCase()).filter(Boolean)
  for (const r of recipients) {
    if (!r) continue
    let m: RegExpExecArray | null
    re.lastIndex = 0
    while ((m = re.exec(r)) !== null) {
      if (wanted.length && !wanted.includes(m[2].toLowerCase())) continue
      found.add(m[1].toLowerCase())
    }
  }
  return found.size === 1 ? [...found][0] : null
}
