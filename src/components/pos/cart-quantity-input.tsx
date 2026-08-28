'use client'

import { useState } from 'react'
import { NumericInput } from '@/components/ui/numeric-input'
import { cn } from '@/lib/utils'

interface CartQuantityInputProps {
  value: number
  onChange: (quantity: number) => void
  className?: string
}

export function CartQuantityInput({ value, onChange, className }: CartQuantityInputProps) {
  const [raw, setRaw] = useState(String(value))
  const [prevValue, setPrevValue] = useState(value)
  const [focused, setFocused] = useState(false)

  if (value !== prevValue) {
    setPrevValue(value)
    if (!focused) setRaw(String(value))
  }

  return (
    <NumericInput
      value={raw}
      className={cn('w-16 h-7 text-center', className)}
      onFocus={(e) => {
        setFocused(true)
        e.currentTarget.select()
      }}
      onChange={(e) => {
        const text = e.target.value
        setRaw(text)
        const parsed = parseFloat(text)
        if (!isNaN(parsed) && parsed > 0) onChange(parsed)
      }}
      onBlur={() => {
        setFocused(false)
        const parsed = parseFloat(raw)
        if (isNaN(parsed) || parsed <= 0) {
          setRaw('1')
          onChange(1)
        } else {
          setRaw(String(parsed))
        }
      }}
    />
  )
}
