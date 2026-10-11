// The words for the internal decoration calculator: a short line for the quote and a fuller room-by-room "what's included". Written from the rooms as they
// are set, so they follow the calculator until edited by hand. Takes only the plain summary the engine returns (type import: no runtime import of the engine).

import type { DecoRoomSummary } from './decoration-units'

export interface DecorationDescribed {
  rooms: DecoRoomSummary[]
  /** which kinds of work appear anywhere, so the short line can name them */
  walls: boolean; ceilings: boolean; woodwork: boolean; doors: boolean; frames: boolean; stripping: boolean
}

const list = (a: string[]) => (a.length <= 1 ? (a[0] ?? '') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function describeDecorationShort(d: DecorationDescribed): string {
  const n = d.rooms.length
  if (n === 0) return 'Internal decoration — no rooms yet.'
  const works: string[] = []
  if (d.walls) works.push('walls')
  if (d.ceilings) works.push('ceilings')
  if (d.woodwork) works.push('skirting boards and architraves')
  if (d.doors) works.push('doors')
  if (d.frames) works.push('window frames')
  const names = n <= 4 ? ` (${list(d.rooms.map(r => r.name))})` : ''
  return `Internal decoration to ${n} room${n === 1 ? '' : 's'}${names}: ${d.stripping ? 'stripping, ' : ''}preparing and painting the ${works.length ? list(works) : 'surfaces'}.`
}

export function describeDecoration(d: DecorationDescribed): string {
  if (d.rooms.length === 0) return 'No rooms are included yet.'
  const lines = ['Protect floors and fittings, prepare the surfaces and paint, room by room:']
  for (const r of d.rooms) {
    lines.push(`${r.name}: ${r.parts.length ? cap(list(r.parts)) : 'nothing included'}.`)
  }
  lines.push('Paint colours and finishes to be agreed with the client before work starts.')
  return lines.join('\n')
}
