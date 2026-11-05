// Turns the live Take-off drawing (the zoomed and panned <g> inside the canvas <svg>) into a JPEG for the PDF. Browser only. Take-off (app/(app)/takeoff/page.tsx) first sets the view so the part to print fills the canvas;
// this copies the drawing, takes out the on-screen helpers (anything marked data-print-hide, the plan picture, the grid), fills in the colour variables, thickens the lines that stay one screen pixel wide, and paints the plan
// picture and the drawing onto one canvas at the size wanted. The page's own CSS cannot reach a picture of an svg, so everything it needs is put inline.

export interface PrintRegion { x: number; y: number; w: number; h: number }

/** the zoomed and panned group that holds the plan and every drawing */
export function drawingGroup(svg: SVGSVGElement): SVGGElement | null {
  return svg.querySelector(':scope > g[transform^="translate("]') as SVGGElement | null
}

/** the zoom and pan the group is drawn with right now, read from the page itself so we know the screen has caught up */
export function readView(svg: SVGSVGElement): { x: number; y: number; z: number } | null {
  const g = drawingGroup(svg)
  const m = g && /translate\(\s*([-\d.eE+]+)[ ,]+([-\d.eE+]+)\s*\)\s*scale\(\s*([-\d.eE+]+)\s*\)/.exec(g.getAttribute('transform') || '')
  return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]), z: parseFloat(m[3]) } : null
}

const isHidden = (el: Element) => !!el.closest('[data-print-hide]')

/** The box (in plan pixels) round everything drawn that will be printed, or null if there is nothing. The plan picture, its fade, the grid and the on-screen helpers are not counted. */
export function drawingsBox(svg: SVGSVGElement, imgSize: { w: number; h: number } | null): PrintRegion | null {
  const g = drawingGroup(svg), v = readView(svg)
  if (!g || !v) return null
  const sr = svg.getBoundingClientRect()
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const el of Array.from(g.children)) {
    const tag = el.tagName.toLowerCase()
    if (tag === 'image' || tag === 'defs' || tag === 'style') continue
    if (isHidden(el) || (el as Element).hasAttribute('data-print-hide')) continue
    if (tag === 'rect' && imgSize && Math.abs(parseFloat(el.getAttribute('width') || '0') - imgSize.w) < 1) continue   // the fade over the plan
    if (el.querySelector(':scope > defs')) continue   // the grid (its patterns and its one big rectangle)
    const r = el.getBoundingClientRect()
    if (!(r.width > 0 || r.height > 0)) continue
    x0 = Math.min(x0, (r.left - sr.left - v.x) / v.z); y0 = Math.min(y0, (r.top - sr.top - v.y) / v.z)
    x1 = Math.max(x1, (r.right - sr.left - v.x) / v.z); y1 = Math.max(y1, (r.bottom - sr.top - v.y) / v.z)
  }
  if (!isFinite(x0) || x1 - x0 < 1 || y1 - y0 < 1) return null
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/** `var(--x)` and `var(--x, fallback)` replaced by the value the page gives it, so the copy needs no style sheet */
function resolveVars(value: string, cs: CSSStyleDeclaration): string {
  return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g, (_m, name: string, fb?: string) => (cs.getPropertyValue(name).trim() || (fb || '').trim() || 'currentColor'))
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image()
    im.onload = () => resolve(im)
    im.onerror = () => reject(new Error('The picture could not be read'))
    im.src = src
  })
}

export interface RasteriseInput {
  svg: SVGSVGElement
  planImage: string | null
  imgSize: { w: number; h: number } | null
  /** what part of the sheet, in plan pixels; the view must already be set so it fits the canvas */
  region: PrintRegion
  /** 0 to 100: how far the plan picture is faded toward white (the Fade plan view setting) */
  fade: number
  /** pixels along the longer side of the picture */
  longSide: number
  withPlan: boolean
}

/** The picture of the drawing as JPEG bytes, with its size in pixels. Throws a plain message if it cannot be made. */
export async function rasterise(o: RasteriseInput): Promise<{ jpeg: Uint8Array; w: number; h: number }> {
  const g = drawingGroup(o.svg), v = readView(o.svg)
  if (!g || !v) throw new Error('The drawing is not showing, so it cannot be printed.')
  const cs = getComputedStyle(o.svg)
  const vw = o.region.w * v.z, vh = o.region.h * v.z
  const vx = o.region.x * v.z + v.x, vy = o.region.y * v.z + v.y
  const wide = o.region.w >= o.region.h
  const outW = Math.max(200, Math.round(wide ? o.longSide : o.longSide * o.region.w / o.region.h))
  const outH = Math.max(200, Math.round(wide ? o.longSide * o.region.h / o.region.w : o.longSide))
  const r = outW / vw   // picture pixels for each screen pixel

  const clone = g.cloneNode(true) as SVGGElement
  clone.querySelectorAll('[data-print-hide]').forEach(n => n.remove())
  // the plan picture and its fade are painted on the canvas, the grid is not printed (its patterns, which the walls' hatching uses, stay)
  Array.from(clone.children).forEach(ch => {
    const tag = ch.tagName.toLowerCase()
    if (tag === 'image') ch.remove()
    else if (tag === 'rect' && o.imgSize && Math.abs(parseFloat(ch.getAttribute('width') || '0') - o.imgSize.w) < 1) ch.remove()
  })
  clone.querySelectorAll('rect[fill^="url(#grid-"]').forEach(n => n.remove())

  const scaleNums = (s: string) => s.replace(/[-\d.]+/g, n => String(parseFloat(n) * r))
  clone.querySelectorAll('*').forEach(el => {
    for (const a of Array.from(el.attributes)) {
      if (a.value.includes('var(')) el.setAttribute(a.name, resolveVars(a.value, cs))
    }
    // a line that stays one screen pixel wide at any zoom must stay that wide, in proportion to the page, when the picture is bigger
    const styleAttr = el.getAttribute('style') || ''
    const nonScaling = el.getAttribute('vector-effect') === 'non-scaling-stroke' || /vector-effect:\s*non-scaling-stroke/.test(styleAttr)
    if (nonScaling) {
      let sw = parseFloat(el.getAttribute('stroke-width') || '')
      const sm = /stroke-width:\s*([\d.]+)/.exec(styleAttr)
      if (sm) { sw = parseFloat(sm[1]); el.setAttribute('style', styleAttr.replace(/stroke-width:\s*[\d.]+(px)?;?/, '')) }
      el.setAttribute('stroke-width', String((Number.isFinite(sw) ? sw : 1) * r))
      const da = el.getAttribute('stroke-dasharray')
      if (da && da !== 'none') el.setAttribute('stroke-dasharray', scaleNums(da))
    }
  })

  const xml = new XMLSerializer().serializeToString(clone)
  const cls = o.svg.classList.contains('to-tags-on') ? ' class="to-tags-on"' : ''
  const svgText = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${outW}" height="${outH}" viewBox="${vx} ${vy} ${vw} ${vh}"${cls} style="font-family:Arial,Helvetica,sans-serif">`
    + `<style>.to-tags-on .to-lbl{display:none}</style>${xml}</svg>`

  const canvas = document.createElement('canvas')
  canvas.width = outW; canvas.height = outH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser cannot make the picture.')
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, outW, outH)
  if (o.withPlan && o.planImage && o.imgSize) {
    const plan = await loadImage(o.planImage)
    const k = plan.naturalWidth / o.imgSize.w
    // the part of the plan picture inside the region (the region can reach past the picture's edge)
    const ix0 = Math.max(0, o.region.x), iy0 = Math.max(0, o.region.y)
    const ix1 = Math.min(o.imgSize.w, o.region.x + o.region.w), iy1 = Math.min(o.imgSize.h, o.region.y + o.region.h)
    if (ix1 > ix0 && iy1 > iy0) {
      ctx.drawImage(plan, ix0 * k, iy0 * k, (ix1 - ix0) * k, (iy1 - iy0) * k, (ix0 - o.region.x) / o.region.w * outW, (iy0 - o.region.y) / o.region.h * outH, (ix1 - ix0) / o.region.w * outW, (iy1 - iy0) / o.region.h * outH)
      if (o.fade > 0) { ctx.globalAlpha = Math.min(1, o.fade / 100); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, outW, outH); ctx.globalAlpha = 1 }
    }
  }
  const layer = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText))
  ctx.drawImage(layer, 0, 0, outW, outH)

  const blob: Blob | null = await new Promise(res => { try { canvas.toBlob(res, 'image/jpeg', 0.9) } catch { res(null) } })
  if (!blob) throw new Error('The picture could not be made (the plan picture may be from another website).')
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), w: outW, h: outH }
}
