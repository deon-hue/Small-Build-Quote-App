// Makes text safe to write into a PDF that uses the standard (WinAnsi / Windows-1252) fonts, such as the FMB contract form fields.
// Those fonts cannot draw characters like <=-style symbols (≤ ≥), arrows, ticks or emoji, and pdf-lib stops with "WinAnsi cannot encode …"
// for the whole document. Symbols with a sensible plain-text equivalent are swapped for it; anything else that can't be drawn becomes "?".
// Line breaks are kept (the scope box is multi-line). Pure functions, no imports, so it can be tested with plain Node.
//
// This only changes what is printed on the PDF. The text saved in the app is never altered.
//
// (Character codes are written as numbers on purpose: invisible characters such as zero-width spaces are easy to lose in source code.)

// code point -> plain-text replacement
const MAP: Record<number, string> = {
  0x2264: '<=', 0x2265: '>=', 0x2260: '!=', 0x2248: '~', 0x223C: '~', 0x2245: '~',            // ≤ ≥ ≠ ≈ ∼ ≅
  0x2192: '->', 0x27F6: '->', 0x21D2: '->', 0x2794: '->', 0x279C: '->', 0x27A1: '->',         // arrows pointing right
  0x2190: '<-', 0x27F5: '<-', 0x21D0: '<-', 0x2B05: '<-', 0x2194: '<->', 0x21D4: '<->',
  0x2191: '(up)', 0x2193: '(down)',
  0x2212: '-', 0x2012: '-', 0x2015: '-', 0x2043: '-', 0x2011: '-', 0x2010: '-', 0x2027: '-',  // minus signs and hyphen variants
  0x2713: 'Yes', 0x2714: 'Yes', 0x2611: 'Yes', 0x2705: 'Yes',                                 // ticks
  0x2717: 'No', 0x2718: 'No', 0x2715: 'No', 0x274C: 'No', 0x2612: 'No',                       // crosses
  0x221E: 'infinity', 0x221A: 'sqrt', 0x2211: 'sum', 0x2206: 'delta', 0x0394: 'delta',
  0x03C0: 'pi', 0x03A9: 'ohm', 0x2126: 'ohm', 0x03BC: 'u',
  0x2153: '1/3', 0x2154: '2/3', 0x215B: '1/8', 0x215C: '3/8', 0x215D: '5/8', 0x215E: '7/8',
  0x2032: "'", 0x2033: '"', 0xFF1C: '<', 0xFF1E: '>',
  0x2028: '\n', 0x2029: '\n',
  0x00AD: '', 0x200B: '', 0x200C: '', 0x200D: '', 0x2060: '', 0xFEFF: '',                    // soft hyphen and zero-width characters
  0x202F: ' ', 0x205F: ' ', 0x3000: ' ',
  0x0141: 'L', 0x0142: 'l', 0x0110: 'D', 0x0111: 'd', 0x0131: 'i', 0x0126: 'H', 0x0127: 'h', 0x0166: 'T', 0x0167: 't',   // letters with no plain-letter decomposition                                                      // fancy spaces
}

// Windows-1252 extras beyond Latin-1 (0xA0–0xFF) that the standard fonts CAN draw
const WINANSI_EXTRA = new Set([
  0x20AC, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017D,
  0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014, 0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0x017E, 0x0178,
])

function drawable(cp: number): boolean {
  return cp === 0x0A || (cp >= 0x20 && cp <= 0x7E) || (cp >= 0xA0 && cp <= 0xFF) || WINANSI_EXTRA.has(cp)
}

export function toPdfSafeText(input: string | undefined | null): string {
  if (!input) return ''
  const text = String(input).split('\r\n').join('\n').split('\r').join('\n').split('\t').join(' ')
  let out = ''
  for (const ch of text) {                                  // iterates whole characters, so emoji (surrogate pairs) count once
    let cp = ch.codePointAt(0)!
    if (cp >= 0x2000 && cp <= 0x200A) { out += ' '; continue }   // en/em/thin spaces etc.
    if (cp in MAP) { out += MAP[cp]; continue }
    if (!drawable(cp)) {
      // An accented letter that Windows-1252 lacks (e.g. ő, ł) → its plain letter, if it has one
      const base = Array.from(ch.normalize('NFD')).filter(c => { const k = c.codePointAt(0)!; return k < 0x300 || k > 0x36F }).join('')
      if (base !== ch && base.length === 1) { cp = base.codePointAt(0)!; out += drawable(cp) ? base : '?'; continue }
      out += '?'
      continue
    }
    out += ch
  }
  return out
}
