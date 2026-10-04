// Help page content (FAQs and video links) — shared types and the link helpers. Pure functions, no imports, so they can be tested with plain Node.

export interface HelpItem {
  id: string
  kind: 'faq' | 'video'
  category: string
  title: string
  body: string
  url: string | null
  sort_order: number
  published: boolean
}

/** Only ever link to http(s) addresses — never javascript:, data: and so on, whatever is stored. */
export function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const u = url.trim()
  return /^https?:\/\/[^\s]+$/i.test(u) ? u : null
}

export type VideoInfo =
  | { provider: 'youtube'; id: string; embedUrl: string; thumbUrl: string; link: string }
  | { provider: 'tiktok' | 'vimeo' | 'other'; link: string; label: string }
  | null

const YT_ID = /^[A-Za-z0-9_-]{11}$/

/** Works out what kind of video link this is. YouTube links can be played on the page; TikTok and anything else open in a new tab. */
export function parseVideoUrl(raw: string | null | undefined): VideoInfo {
  const link = safeHttpUrl(raw)
  if (!link) return null
  let u: URL
  try { u = new URL(link) } catch { return null }
  const host = u.hostname.replace(/^www\./i, '').replace(/^m\./i, '').toLowerCase()

  if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'youtu.be') {
    let id = ''
    if (host === 'youtu.be') id = u.pathname.split('/')[1] || ''
    else if (u.pathname === '/watch') id = u.searchParams.get('v') || ''
    else {
      const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/)
      if (m) id = m[1]
    }
    if (YT_ID.test(id)) {
      return {
        provider: 'youtube', id, link,
        embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`,
        thumbUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      }
    }
    return { provider: 'other', link, label: 'Watch on YouTube' }
  }
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return { provider: 'tiktok', link, label: 'Watch on TikTok' }
  if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) return { provider: 'vimeo', link, label: 'Watch on Vimeo' }
  return { provider: 'other', link, label: 'Open video' }
}

/** Case-insensitive match on title, answer and category, for the search box. */
export function helpMatches(item: Pick<HelpItem, 'title' | 'body' | 'category'>, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return `${item.title}\n${item.body}\n${item.category}`.toLowerCase().includes(q)
}
