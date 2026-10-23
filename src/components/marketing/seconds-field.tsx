'use client'

import { useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface SecondsFieldProps {
  value: number
  onChange: (value: number) => void
  step?: number
  min?: number
  max?: number
  disabled?: boolean
  label?: string
}

/** A seconds value with −/+ nudge buttons; typing commits on blur/Enter. */
export function SecondsField({ value, onChange, step = 0.5, min = 0, max = Infinity, disabled, label }: SecondsFieldProps) {
  // Holds the text only while the user is typing; otherwise the field shows
  // the current value, so outside changes (nudges, re-fits) always show.
  const [draft, setDraft] = useState<string | null>(null)

  const clamp = (n: number) => Math.round(Math.min(Math.max(n, min), max) * 100) / 100
  const commit = () => {
    const parsed = Number.parseFloat(draft ?? '')
    if (draft !== null && Number.isFinite(parsed)) onChange(clamp(parsed))
    setDraft(null)
  }

  return (
    <div className="flex items-center gap-0.5" aria-label={label}>
      <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={disabled || value <= min}
        onClick={() => onChange(clamp(value - step))}>
        <Minus className="w-3 h-3" />
      </Button>
      <Input
        value={draft ?? value.toFixed(1)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit() }}
        disabled={disabled}
        inputMode="decimal"
        className="h-7 w-14 px-1 text-center text-xs"
      />
      <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + step))}>
        <Plus className="w-3 h-3" />
      </Button>
      <span className="text-[11px] text-slate-400">s</span>
    </div>
  )
}
