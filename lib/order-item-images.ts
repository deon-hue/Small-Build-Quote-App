import type { SupabaseClient } from '@supabase/supabase-js'

// A picture of an item on a request for a price, so the supplier can see what is wanted. It is kept in the existing private job-documents bucket under <user>/orders/items/ (that bucket's policy
// already lets a signed-in user use their own folder, so no storage setup), and only its PATH is kept, on the item itself (OrderItem.image, inside the order's items JSON, so no SQL either).
// A supplier never reads the bucket: the public supplier page asks the server, which signs a short-lived link for just that item's picture (app/api/public/supplier-quote/[token]/route.ts).

const BUCKET = 'job-documents'
export const ITEM_IMAGE_MAX_INPUT_BYTES = 20 * 1024 * 1024
/** the longest side of a stored picture, in pixels: big enough to read a product code, small enough for a phone on site */
export const ITEM_IMAGE_MAX_SIDE = 1400

const PATH = /^[0-9a-f-]{36}\/orders\/items\/[A-Za-z0-9._-]{1,120}$/i

/** Is this the path of a picture made by uploadItemImage? Anything else (another folder, a `..`, a full URL) is not trusted, wherever it came from. */
export function isItemImagePath(v: unknown): v is string {
  return typeof v === 'string' && PATH.test(v) && !v.includes('..')
}

/** The size a picture is shrunk to: the longest side no more than `max`, never enlarged. */
export function fitSize(w: number, h: number, max = ITEM_IMAGE_MAX_SIDE): { w: number; h: number } {
  if (!(w > 0) || !(h > 0)) return { w: 0, h: 0 }
  const k = Math.min(1, max / Math.max(w, h))
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }
}

/** Shrinks a picture to a JPEG in the browser (a phone photo is several MB; a screenshot may be a PNG with a clear background, which is made white). */
async function toJpeg(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const el = new Image()
      el.onload = () => res(el)
      el.onerror = () => rej(new Error('That file could not be read as a picture.'))
      el.src = url
    })
    const { w, h } = fitSize(img.naturalWidth, img.naturalHeight)
    if (!w) throw new Error('That picture has no size.')
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('This browser cannot prepare the picture.')
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.84))
    if (!blob) throw new Error('This browser cannot prepare the picture.')
    return blob
  } finally { URL.revokeObjectURL(url) }
}

/** Uploads a picture for an item and returns its path. A picture pasted, dropped, chosen or taken on a phone all come through here. */
export async function uploadItemImage(sb: SupabaseClient, file: File): Promise<{ path: string } | { error: string }> {
  if (!file.type.startsWith('image/')) return { error: 'That is not a picture. Choose a photo or screenshot (JPG, PNG, WebP…).' }
  if (file.size > ITEM_IMAGE_MAX_INPUT_BYTES) return { error: 'That picture is over 20 MB. Choose a smaller one.' }
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'Not signed in.' }
  let blob: Blob
  try { blob = await toJpeg(file) } catch (e) { return { error: (e as Error).message || 'That picture could not be prepared.' } }
  const path = `${user.id}/orders/items/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.jpg`
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' })
  if (error) return { error: error.message || 'The picture could not be saved.' }
  return { path }
}

/** A link the builder's own screen can show the picture from (an hour). */
export async function itemImageUrl(sb: SupabaseClient, path: string): Promise<string | null> {
  if (!isItemImagePath(path)) return null
  const { data } = await sb.storage.from(BUCKET).createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}

/** Removes pictures from storage (best effort: when a request is deleted for good). */
export async function removeItemImages(sb: SupabaseClient, paths: string[]): Promise<void> {
  const ok = paths.filter(isItemImagePath)
  for (let i = 0; i < ok.length; i += 100) { try { await sb.storage.from(BUCKET).remove(ok.slice(i, i + 100)) } catch { /* left behind at worst */ } }
}
