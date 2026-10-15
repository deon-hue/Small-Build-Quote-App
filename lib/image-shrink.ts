// Shrinks a photo in the browser before it is uploaded: a phone camera picture is several MB, and a selection only needs to be seen clearly, so it is scaled down
// (longest side 1600 pixels) and saved as a JPEG. A PDF, or a picture that cannot be read as an image, is passed on unchanged. Browser only.

const MAX_SIDE = 1600
const QUALITY = 0.82

export async function shrinkImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale)), h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)   // a PNG with see-through parts would otherwise turn black as a JPEG
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()
    const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/jpeg', QUALITY))
    if (!blob || blob.size >= file.size) return file   // never make it bigger
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}
