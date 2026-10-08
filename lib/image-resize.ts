// Shrinks a phone photo before it is uploaded: a straight-from-the-camera picture can be 5-10 MB, which is slow on site mobile data and too big
// for the server to accept. The result is a JPEG at most `maxSide` pixels on its longest side. Browser only (uses a canvas).
// The photo is read the way every browser does it for an <img> (this is also how iPhones turn their HEIC photos into something usable, and it
// respects the way the phone was held); createImageBitmap is only a second chance. If nothing works, the original file is returned unchanged
// and the caller decides whether it is usable (see photoProblem).

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('could not read the picture')) }
    img.src = url
  })
}

export async function shrinkImage(file: File, maxSide = 1600, quality = 0.8): Promise<File> {
  try {
    if (file.type && !file.type.startsWith('image/')) return file
    let source: CanvasImageSource
    let w: number, h: number
    try {
      const img = await loadImage(file)
      source = img; w = img.naturalWidth; h = img.naturalHeight
    } catch {
      const bmp = await createImageBitmap(file)
      source = bmp; w = bmp.width; h = bmp.height
    }
    if (!w || !h) return file
    const scale = Math.min(1, maxSide / Math.max(w, h))
    const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale))
    const canvas = document.createElement('canvas')
    canvas.width = cw; canvas.height = ch
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(source, 0, 0, cw, ch)
    const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality))
    if (!blob || blob.size === 0) return file
    // already small and already a JPEG: keep the original rather than re-compress it
    if (file.type === 'image/jpeg' && blob.size >= file.size) return file
    const name = (file.name.replace(/\.[^.]+$/, '') || 'photo') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg' })
  } catch {
    return file
  }
}

const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_BYTES = 5 * 1024 * 1024   // the server's limit is a little higher; this keeps well under the host's request-size limit

/** Why a file (after shrinking) cannot be uploaded, in words a subcontractor can act on; null when it is fine. */
export function photoProblem(file: File): string | null {
  if (!OK_TYPES.includes(file.type)) return 'this kind of photo can’t be sent. Take it again with the phone’s camera, or pick a different photo'
  if (file.size > MAX_BYTES) return 'this photo is too big to send. Take it again, or pick a smaller one'
  return null
}
