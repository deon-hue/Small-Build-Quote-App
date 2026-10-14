// Every company shares one quotes address and one documents address (say quotes@buildospro.ai), and each company's own code goes into it after a plus sign: quotes+ab12cd34@buildospro.ai.
// The plus part is ignored by the mail system for delivery, so all of them arrive in the same inbox, and the app reads the code to know which company a message belongs to. Pure.

/** quotes@buildospro.ai and a company's code give quotes+ab12cd34@buildospro.ai. Without a code, or without a base address, the base is returned as it is. */
export function withCode(base: string, code: string | null | undefined): string {
  const b = (base || '').trim()
  const c = (code || '').trim().toLowerCase()
  const at = b.lastIndexOf('@')
  if (at <= 0 || !c) return b
  return `${b.slice(0, at).split('+')[0]}+${c}${b.slice(at)}`
}

/**
 * The company code in any of the addresses a message was sent to ("Name <quotes+ab12cd34@buildospro.ai>" or a bare address), or null.
 * Only codes of the shape we hand out (6 to 12 letters and numbers) count. Several different codes in one message count as none: it is not clear whose it is.
 */
export function codeFromRecipients(recipients: (string | undefined | null)[]): string | null {
  const found = new Set<string>()
  const re = /\+([a-z0-9]{6,12})@/gi
  for (const r of recipients) {
    if (!r) continue
    let m: RegExpExecArray | null
    re.lastIndex = 0
    while ((m = re.exec(r)) !== null) found.add(m[1].toLowerCase())
  }
  return found.size === 1 ? [...found][0] : null
}
