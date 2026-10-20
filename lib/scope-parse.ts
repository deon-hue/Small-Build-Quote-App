// Reading the AI scope chat's replies. The chat asks the AI to put the finished scope between [SCOPE] and [/SCOPE] and to say [READY_TO_BUILD]; the Build Estimate button only turns on once a scope has been
// found. Replies do not always come back in that exact shape (the AI forgets the tags, or the reply is cut off before the closing tag), so this is forgiving: a scope with no closing tag is still taken, and a
// reply with no tags at all can be used as the scope on request (`scopeFromReply`). Pure, so it can be tested.

export interface ParsedMessage {
  scope: string | null
  commentary: string
  readyToBuild: boolean
  /** the scope had no closing [/SCOPE]: the reply was probably cut off, so the end of it may be missing */
  unclosed: boolean
}

export function parseMessage(text: string): ParsedMessage {
  // Detect and strip the [READY_TO_BUILD] signal before rendering
  const readyToBuild = text.includes('[READY_TO_BUILD]')
  const cleaned = text.replace(/\[READY_TO_BUILD\]/g, '').trim()

  const match = cleaned.match(/\[SCOPE\]([\s\S]*?)\[\/SCOPE\]/i)
  if (match) {
    const scope = match[1].trim()
    const commentary = cleaned.replace(/\[SCOPE\][\s\S]*?\[\/SCOPE\]/i, '').trim()
    return { scope, commentary, readyToBuild, unclosed: false }
  }

  // An opening tag with no closing one: the reply was cut off. Take what is there rather than nothing.
  const open = cleaned.search(/\[SCOPE\]/i)
  if (open >= 0) {
    const scope = cleaned.slice(open).replace(/^\[SCOPE\]/i, '').replace(/\[\/SCOPE\]/gi, '').trim()
    if (scope.length > 40) return { scope, commentary: cleaned.slice(0, open).trim(), readyToBuild, unclosed: true }
  }
  return { scope: null, commentary: cleaned, readyToBuild, unclosed: false }
}

/** The text of a reply to use as the scope when it came back without the tags: the scope if it has one, otherwise the whole reply, tags removed. Null when the reply is too short to be a scope. */
export function scopeFromReply(text: string, minChars = 300): string | null {
  const p = parseMessage(text)
  const t = (p.scope ?? p.commentary).replace(/\[\/?SCOPE\]/gi, '').trim()
  return t.length >= minChars ? t : null
}
