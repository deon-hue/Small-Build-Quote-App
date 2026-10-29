// Where pdf.js finds the extra files it needs to read some PDFs, from the same place as its worker (unpkg, at the installed version).
// Without `wasmUrl` pdf.js 5 cannot decode a black-and-white scan (CCITT fax or JBIG2, which is what most scanners make) or a JPEG 2000 picture:
// it logs "Ensure that the `wasmUrl` API parameter is provided" and the page never finishes rendering, so the plan never appeared in Take-off.
// The other three are for PDFs with real text: the standard fonts, the character maps and the colour profiles.

export function pdfjsResources(version: string) {
  const base = `https://unpkg.com/pdfjs-dist@${version}/`
  return {
    wasmUrl: base + 'wasm/',
    cMapUrl: base + 'cmaps/',
    cMapPacked: true,
    standardFontDataUrl: base + 'standard_fonts/',
    iccUrl: base + 'iccs/',
  }
}
