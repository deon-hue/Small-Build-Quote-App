// The public enquiry form: a page on a company-name link (app.buildospro.ai/enquiry/<company-slug>) that anyone can fill in and that lands in that company's Leads list.
// This file is the pure rules, so they can be tested on their own: the link name (slug), the ?src= tag that says where a visitor came from, what an enquiry must contain, and the
// embed code and links the builder copies. The database work is lib/enquiry-submit.ts, the pages are app/enquiry/[slug] and the Leads page's "Enquiry form" window.

// ── The link name ───────────────────────────────────────────────────────────────────────────────────────────────

export const SLUG_MIN = 3
export const SLUG_MAX = 40

/** Words nobody may take as a link name: they are pages or places of the app itself, or would look like the platform speaking. */
export const RESERVED_SLUGS = new Set([
  'admin', 'administrator', 'api', 'app', 'apps', 'auth', 'login', 'logout', 'signin', 'signup', 'register', 'enquiry', 'enquiries', 'enquire', 'quote', 'quotes', 'get-quote', 'portal',
  'sub-portal', 'owner', 'team', 'terms', 'privacy', 'support', 'help', 'www', 'mail', 'email', 'test', 'demo', 'buildos', 'buildospro', 'buildos-pro', 'buildos-pro-support', 'dashboard',
  'settings', 'billing', 'null', 'undefined', 'new', 'static', 'public', 'assets', 'supplier-quote', 'onboarding', 'reset-password', 'how-to-sign-in', 'official', 'staff', 'root',
])

/** A company name as a link name: lower case, no accents, "&" as "and", letters and numbers joined by single hyphens, at most 40 characters. Empty when nothing usable is left. */
export function slugify(name: string): string {
  const s = (name || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const cut = s.slice(0, SLUG_MAX).replace(/-+$/g, '')
  return cut
}

/** Why a link name cannot be used, in plain words, or null when it can (this says nothing about whether another company already has it). */
export function slugProblem(slug: string): string | null {
  const s = (slug || '').trim()
  if (s.length < SLUG_MIN) return `Use at least ${SLUG_MIN} letters or numbers.`
  if (s.length > SLUG_MAX) return `Use ${SLUG_MAX} characters or fewer.`
  if (!/^[a-z0-9-]+$/.test(s)) return 'Use only lower-case letters, numbers and hyphens (no spaces).'
  if (s.startsWith('-') || s.endsWith('-')) return 'It cannot start or end with a hyphen.'
  if (s.includes('--')) return 'It cannot have two hyphens in a row.'
  if (RESERVED_SLUGS.has(s)) return 'That name is kept for the app itself. Please choose another.'
  return null
}

// ── Where a visitor came from (?src=) ───────────────────────────────────────────────────────────────────────────

/** The tags the setup window offers, each with what the Leads list will call it. */
export const SOURCE_LINKS: { tag: string; label: string }[] = [
  { tag: 'facebook', label: 'Facebook' },
  { tag: 'instagram', label: 'Instagram' },
  { tag: 'tiktok', label: 'TikTok' },
  { tag: 'whatsapp', label: 'WhatsApp' },
  { tag: 'google', label: 'Google' },
  { tag: 'email', label: 'Email' },
  { tag: 'qr', label: 'QR code' },
  { tag: 'leaflet', label: 'Leaflet / van' },
]

const SOURCE_ALIASES: Record<string, string> = {
  facebook: 'Facebook', fb: 'Facebook', meta: 'Facebook',
  instagram: 'Instagram', ig: 'Instagram', insta: 'Instagram',
  tiktok: 'TikTok', tt: 'TikTok',
  whatsapp: 'WhatsApp', wa: 'WhatsApp',
  google: 'Google', gbp: 'Google', maps: 'Google',
  email: 'Email', mail: 'Email', newsletter: 'Email',
  qr: 'QR code', qrcode: 'QR code',
  leaflet: 'Leaflet / van', flyer: 'Leaflet / van', van: 'Leaflet / van', leaflets: 'Leaflet / van',
  website: 'Website form', web: 'Website form', site: 'Website form',
  referral: 'Referral', friend: 'Referral',
  phone: 'Phone call', call: 'Phone call',
}

/** What the lead's "where it came from" should say for a ?src= tag. A known tag gives the usual word; any other tag a builder made up (leaflet-march) is kept, tidied, so it can be told apart; no tag gives "Website form". */
export function sourceFromSrc(src: unknown): string {
  if (typeof src !== 'string') return 'Website form'
  const raw = src.trim().toLowerCase().slice(0, 60)
  if (!raw) return 'Website form'
  const key = raw.replace(/[^a-z0-9]+/g, '')
  if (SOURCE_ALIASES[key]) return SOURCE_ALIASES[key]
  const words = raw.replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 30).trim()
  if (!words) return 'Website form'
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** A tag typed by a builder as something safe to put after ?src= (lower case, hyphens). */
export function cleanSrcTag(tag: string): string {
  return (tag || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30)
}

// ── What an enquiry must contain ────────────────────────────────────────────────────────────────────────────────

export const ENQUIRY_JOB_TYPES = ['Rear Extension', 'Side Extension', 'Loft Conversion', 'Full Refurbishment', 'Kitchen Extension', 'Kitchen Fit-Out', 'Bathroom Fit-Out', 'Garden Room', 'Landscaping', 'New Build', 'Other', 'Not sure yet'] as const
export const ENQUIRY_TIMINGS = ['As soon as possible', 'Within 3 months', '3 to 6 months', 'Later than that', 'Just finding out costs'] as const
export const ENQUIRY_MAX_FILES = 8
/** At least this many seconds between the form opening and it being sent: a person cannot do it faster, a script can. */
export const ENQUIRY_MIN_SECONDS = 4
export const ENQUIRY_MAX_AGE_HOURS = 24

export interface EnquiryFile { url: string; name: string; isImage: boolean }

export interface EnquiryInput {
  name: string; email: string; phone: string; address: string; postcode: string
  jobType: string; description: string; timing: string
  files: EnquiryFile[]
  src: string
}

export type EnquiryCheck =
  | { ok: true; value: EnquiryInput }
  | { ok: false; error: string; status: number; silent?: boolean }

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\u0000/g, '').trim().slice(0, max) : '')
const tooLong = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > max

export const looksLikeEmail = (s: string) => /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/.test(s) && s.length <= 320
/** A phone number has at least 7 digits once spaces, brackets and dashes are ignored */
export const looksLikePhone = (s: string) => { const d = s.replace(/\D/g, ''); return d.length >= 7 && d.length <= 15 && /^[0-9+()\s.-]+$/.test(s) }

/** Is this one of OUR uploads? Only files the upload route put in the public client-uploads bucket may be attached, so nobody can put a link of their own into a builder's inbox. */
export function isOurUploadUrl(url: unknown, supabaseUrl: string): boolean {
  if (typeof url !== 'string' || !supabaseUrl) return false
  const prefix = supabaseUrl.replace(/\/+$/, '') + '/storage/v1/object/public/client-uploads/'
  return url.startsWith(prefix) && url.length <= 600 && !/[\s<>"']/.test(url)
}

/** Checks what the public form sent. Nothing is trusted: a field that is not text is empty, long text is refused (not cut), a file that is not one of ours is dropped. A filled-in hidden field (the trap for scripts)
 *  or a form sent too fast is answered as if it worked (`silent`) but is not saved, so a script learns nothing. */
export function checkEnquiry(raw: unknown, nowMs: number, supabaseUrl: string): EnquiryCheck {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Something went wrong. Please try again.', status: 400 }
  const b = raw as Record<string, unknown>

  if (typeof b.website === 'string' && b.website.trim()) return { ok: false, error: '', status: 200, silent: true }
  const started = typeof b.startedAt === 'number' ? b.startedAt : NaN
  if (!Number.isFinite(started) || nowMs - started < ENQUIRY_MIN_SECONDS * 1000) return { ok: false, error: '', status: 200, silent: true }
  if (nowMs - started > ENQUIRY_MAX_AGE_HOURS * 3600 * 1000) return { ok: false, error: 'This page has been open a long time. Please reload it and send again.', status: 400 }

  if (tooLong(b.name, 200) || tooLong(b.email, 320) || tooLong(b.phone, 40) || tooLong(b.address, 300) || tooLong(b.postcode, 12) || tooLong(b.description, 5000) || tooLong(b.jobType, 60) || tooLong(b.timing, 60)) {
    return { ok: false, error: 'Some of the information is too long. Please shorten it and try again.', status: 413 }
  }
  const name = str(b.name, 200), email = str(b.email, 320).toLowerCase(), phone = str(b.phone, 40)
  const address = str(b.address, 300), postcode = str(b.postcode, 12).toUpperCase(), description = str(b.description, 5000)
  const jobType = str(b.jobType, 60), timing = str(b.timing, 60)

  if (!name) return { ok: false, error: 'Please tell us your name.', status: 400 }
  if (!email && !phone) return { ok: false, error: 'Please give an email address or a phone number so we can reply.', status: 400 }
  if (email && !looksLikeEmail(email)) return { ok: false, error: 'That email address does not look right.', status: 400 }
  if (phone && !looksLikePhone(phone)) return { ok: false, error: 'That phone number does not look right.', status: 400 }
  if (description.length < 5) return { ok: false, error: 'Please tell us a little about what you would like done.', status: 400 }

  const files: EnquiryFile[] = []
  if (Array.isArray(b.files)) {
    for (const f of b.files.slice(0, 40)) {
      if (!f || typeof f !== 'object') continue
      const o = f as Record<string, unknown>
      if (!isOurUploadUrl(o.url, supabaseUrl)) continue
      files.push({ url: o.url as string, name: str(o.name, 120) || 'file', isImage: o.isImage === true })
      if (files.length >= ENQUIRY_MAX_FILES) break
    }
  }
  return { ok: true, value: { name, email, phone, address, postcode, jobType, description, timing, files, src: str(b.src, 60) } }
}

/** The row for the leads table (quote_requests). Where they hope to start goes on the end of "what they want", where it shows in the lead with no new column. */
export function leadRowFromEnquiry(e: EnquiryInput, ownerId: string): Record<string, unknown> {
  const scope = e.timing ? `${e.description}\n\nWhen they hope to start: ${e.timing}` : e.description
  const address = [e.address, e.postcode].filter(Boolean).join(', ')
  return {
    user_id: ownerId,
    client_name: e.name,
    client_email: e.email,
    client_phone: e.phone,
    project_type: e.jobType === 'Not sure yet' ? '' : e.jobType,
    project_address: address,
    scope_text: scope,
    ai_phases: [],
    estimated_total: 0,
    client_files: e.files,
    status: 'pending',
    source: sourceFromSrc(e.src),
  }
}

// ── Links and embed code the builder copies ─────────────────────────────────────────────────────────────────────

export function enquiryLink(origin: string, slug: string, src?: string): string {
  const base = `${origin.replace(/\/+$/, '')}/enquiry/${slug}`
  const tag = src ? cleanSrcTag(src) : ''
  return tag ? `${base}?src=${tag}` : base
}

/** The code a web designer pastes into a page: the form in a frame that grows to fit (the page tells its frame how tall it is). */
export function embedCode(origin: string, slug: string): string {
  const url = `${origin.replace(/\/+$/, '')}/enquiry/${slug}?embed=1`
  return [
    `<iframe id="buildos-enquiry" src="${url}" title="Send us an enquiry" style="width:100%;min-height:720px;border:0" loading="lazy"></iframe>`,
    `<script>window.addEventListener('message',function(e){if(e.data&&e.data.type==='buildos-enquiry-height'){var f=document.getElementById('buildos-enquiry');if(f)f.style.height=e.data.height+'px'}})</script>`,
  ].join('\n')
}
