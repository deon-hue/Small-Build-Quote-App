// What a client may see of a quote's cost rows. A calculator's costed lines go into a quote as ordinary rows, including its own "Profit (20%)" row and, in the
// notes, "110 nr @ £0.80/nr (10% waste)" (the builder's cost rate). Neither may reach the client, however the quote is viewed (client view, detailed, the online
// quote, the printed page or the PDF): a "Profit" row would show the margin outright, and a cost rate beside a selling price lets it be worked out.
// So in anything a client sees, the profit rows are folded into the other rows pro rata (the phase total does not change) and calculator cost notes are dropped.
// The builder's own screens are untouched and still show the profit row. Pure, so it can be tested.

export const isProfitRow = (i: { desc?: string }): boolean => /^profit \(\d+(\.\d+)?%\)$/i.test((i.desc ?? '').trim())

/** A note written by a calculator: "110 nr @ £0.80/nr", optionally "(10% waste)". Hand-typed notes are never matched. */
export const isCostNote = (n?: string): boolean => !!n && /^[\d.,]+ \S+ @ £[\d.,]+\/\S+( \(\d+(\.\d+)?% waste\))?$/.test(n.trim())

export interface ClientRow<T> { item: T; sell: number; notes: string | undefined }

/** The rows to show a client: profit rows folded into the rest, calculator cost notes removed. `rows` are the rows that would be shown (sell above zero). */
export function clientRows<T extends { desc?: string; notes?: string }>(rows: T[], sellOf: (i: T) => number): ClientRow<T>[] {
  const profit = rows.filter(isProfitRow)
  const others = rows.filter(r => !isProfitRow(r))
  const profitSell = profit.reduce((s, r) => s + sellOf(r), 0)
  const othersSell = others.reduce((s, r) => s + sellOf(r), 0)
  const cleanNotes = (r: T) => (isCostNote(r.notes) ? undefined : r.notes)
  if (profit.length === 0) return rows.map(r => ({ item: r, sell: sellOf(r), notes: cleanNotes(r) }))
  // Nothing to fold the profit into (a phase of only a profit row): show it as an allowance, never as profit
  if (others.length === 0 || othersSell <= 0) return rows.map(r => ({ item: isProfitRow(r) ? { ...r, desc: 'Allowances' } : r, sell: sellOf(r), notes: cleanNotes(r) }))
  return others.map(r => ({ item: r, sell: +(sellOf(r) + profitSell * (sellOf(r) / othersSell)).toFixed(2), notes: cleanNotes(r) }))
}
