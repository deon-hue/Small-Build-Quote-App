// A subcontractor's own choice of how their portal looks: the tile style on the home screen and the text size. Kept on their phone (browser storage),
// so it is remembered every time they open the portal on that phone and needs nothing in the database. Pure helpers, no React.

export type LookStyle = 'soft' | 'solid' | 'line' | 'dark'
export type TextSize = 'normal' | 'large'
export interface Look { style: LookStyle; size: TextSize }

export const LOOK_STYLES: { key: LookStyle; name: string }[] = [
  { key: 'soft',  name: 'Soft green' },
  { key: 'solid', name: 'Solid colour' },
  { key: 'line',  name: 'Big line' },
  { key: 'dark',  name: 'Dark slate' },
]

export const DEFAULT_LOOK: Look = { style: 'soft', size: 'normal' }
export const LOOK_STORAGE_KEY = 'sbc-sub-look'

/** Reads a saved value defensively: anything missing, broken or unknown falls back to the default for that part. */
export function parseLook(raw: string | null | undefined): Look {
  if (!raw) return { ...DEFAULT_LOOK }
  try {
    const o = JSON.parse(raw) as Partial<Look> | null
    const style = LOOK_STYLES.some(s => s.key === o?.style) ? (o!.style as LookStyle) : DEFAULT_LOOK.style
    const size: TextSize = o?.size === 'large' ? 'large' : 'normal'
    return { style, size }
  } catch {
    return { ...DEFAULT_LOOK }
  }
}

export function readLook(): Look {
  try { return parseLook(window.localStorage.getItem(LOOK_STORAGE_KEY)) } catch { return { ...DEFAULT_LOOK } }
}

export function saveLook(look: Look): void {
  try { window.localStorage.setItem(LOOK_STORAGE_KEY, JSON.stringify(look)) } catch { /* private mode or blocked storage: the choice just lasts until they close the page */ }
}
