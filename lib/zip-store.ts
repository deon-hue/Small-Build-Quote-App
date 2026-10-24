// A zip file written with no compression ("stored"): plans, PDFs and photos are already compressed, so storing them costs nothing in size and keeps this small and quick. Used to download everything for a
// customer as one file from the browser. Names are UTF-8. Zip32 only: up to 65,535 files and under 4 GB in all (the caller checks the size first). Pure apart from Blob, so it can be tested in Node.

export interface ZipEntry { path: string; data: Blob }

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 }
  return t
})()
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function dosDateTime(d: Date): { time: number; date: number } {
  const y = Math.max(1980, d.getFullYear())
  return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() }
}

/** The zip as a Blob. Throws if there are too many files or it would pass 4 GB. */
export async function buildZip(entries: ZipEntry[], now: Date = new Date()): Promise<Blob> {
  if (entries.length > 65535) throw new Error('Too many files for one zip.')
  const enc = new TextEncoder()
  const { time, date } = dosDateTime(now)
  const parts: BlobPart[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const e of entries) {
    const name = enc.encode(e.path.replace(/\\/g, '/'))
    const size = e.data.size
    if (size >= 0xffffffff || offset >= 0xffffffff) throw new Error('Too much to put in one zip (4 GB limit).')
    const crc = crc32(new Uint8Array(await e.data.arrayBuffer()))
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true)
    local.setUint16(10, time, true); local.setUint16(12, date, true); local.setUint32(14, crc, true); local.setUint32(18, size, true); local.setUint32(22, size, true)
    local.setUint16(26, name.length, true); local.setUint16(28, 0, true)
    parts.push(local.buffer as ArrayBuffer, name as BlobPart, e.data)
    const cd = new DataView(new ArrayBuffer(46))
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true); cd.setUint16(10, 0, true)
    cd.setUint16(12, time, true); cd.setUint16(14, date, true); cd.setUint32(16, crc, true); cd.setUint32(20, size, true); cd.setUint32(24, size, true)
    cd.setUint16(28, name.length, true); cd.setUint16(30, 0, true); cd.setUint16(32, 0, true); cd.setUint16(34, 0, true); cd.setUint16(36, 0, true); cd.setUint32(38, 0, true); cd.setUint32(42, offset, true)
    const cdBytes = new Uint8Array(46 + name.length); cdBytes.set(new Uint8Array(cd.buffer), 0); cdBytes.set(name, 46)
    central.push(cdBytes)
    offset += 30 + name.length + size
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0)
  if (offset + cdSize >= 0xffffffff) throw new Error('Too much to put in one zip (4 GB limit).')
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true); end.setUint16(4, 0, true); end.setUint16(6, 0, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true)
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true); end.setUint16(20, 0, true)
  return new Blob([...parts, ...(central as BlobPart[]), end.buffer as ArrayBuffer], { type: 'application/zip' })
}

/** Makes each path in a list unique by putting " (2)", " (3)"... before the extension of a repeat, and removes characters a zip or Windows path cannot hold. */
export function uniquePaths(paths: string[]): string[] {
  const seen = new Map<string, number>()
  return paths.map(p => {
    const clean = p.split('/').map(s => s.replace(/[\\:*?"<>|]/g, '_').trim() || '_').join('/')
    const key = clean.toLowerCase()
    const n = (seen.get(key) ?? 0) + 1
    seen.set(key, n)
    if (n === 1) return clean
    const dot = clean.lastIndexOf('.')
    const slash = clean.lastIndexOf('/')
    return dot > slash + 1 ? `${clean.slice(0, dot)} (${n})${clean.slice(dot)}` : `${clean} (${n})`
  })
}
