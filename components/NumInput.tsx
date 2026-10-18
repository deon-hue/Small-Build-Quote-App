'use client'

// A number box that can be edited normally. A plain controlled <input type="number"> that turns every keystroke into a number and writes it straight back cannot be cleared:
// delete the last digit and the empty box becomes 0 (or the minimum), which is written back as "0" or "1", so the first character never deletes and a new amount cannot be typed over it.
// This is a drop-in for <input type="number" ...>: it takes the same props, and calls onChange with every real change, but while a box is being edited it keeps what was typed
// (including nothing at all) unless the value outside has been changed to something else, and when you leave the box it shows the value the page actually holds.
// A box whose value is already text (a string) is left as an ordinary input, as it never had the problem.

import React, { useState } from 'react'

export default function NumInput({ value, onChange, onBlur, onFocus, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  // null: not being edited, so show the value held outside
  const [text, setText] = useState<string | null>(null)

  if (typeof value === 'string' || value === undefined) {
    return <input {...rest} type="number" value={value} onChange={onChange} onBlur={onBlur} onFocus={onFocus} />
  }
  const held = typeof value === 'number' ? value : Number(value)
  // keep what is being typed while it is empty, or still means the same number as the page holds ("1.50", "0.", "" while clearing)
  const keep = text !== null && (text === '' || Number(text) === held)
  const shown = keep ? (text as string) : Number.isFinite(held) ? String(held) : ''

  return (
    <input
      {...rest}
      type="number"
      value={shown}
      onChange={e => { setText(e.target.value); onChange?.(e) }}
      onFocus={e => { setText(null); onFocus?.(e) }}
      onBlur={e => { setText(null); onBlur?.(e) }}
    />
  )
}
