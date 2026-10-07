// Shrinks a phone photo before it is uploaded: a straight-from-the-camera picture can be 5-10 MB, which is slow on site mobile data and too big
// for the server to accept. The result is a JPEG at most `maxSide` pixels on its longest side. Browser only (uses a canvas).
// If anything about the shrinking fails, the original file is used as it is.

export async function shrinkImage(file: File, maxSide = 1600, quality = 0.8): Promise<File> {
  try {
    if (!file.type.startsWith('image/')) return file
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale)), h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()
    const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality))
    if (!blob) return file
    // already small and already a JPEG: keep the original rather than re-compress it
    if (file.type === 'image/jpeg' && blob.size >= file.size) return file
    const name = (file.name.replace(/\.[^.]+$/, '') || 'photo') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg' })
  } catch {
    return file
  }
}
