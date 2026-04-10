import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * NumericInput — text field that only accepts digits and a single decimal point.
 * Use this everywhere a number/decimal value is needed instead of <NumericInput>.
 *
 * - type="text" + inputMode="decimal" → mobile shows numeric keyboard, no spinner arrows
 * - Blocks non-numeric keypresses (digits, one ".", backspace, arrows, tab, etc.)
 * - Strips invalid chars on paste
 * - value/onChange work the same as a regular Input (string value)
 */

interface NumericInputProps extends Omit<React.ComponentProps<"input">, "type"> {
  /** Allow negative values (prepend "-"). Default: false */
  allowNegative?: boolean
}

function NumericInput({
  className,
  allowNegative = false,
  onKeyDown,
  onPaste,
  onChange,
  ...props
}: NumericInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const allowed = [
      "Backspace", "Delete", "Tab", "Escape", "Enter",
      "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
      "Home", "End",
    ]

    if (
      allowed.includes(e.key) ||
      // Allow Ctrl/Cmd shortcuts (copy, paste, select all, etc.)
      e.ctrlKey || e.metaKey
    ) {
      onKeyDown?.(e)
      return
    }

    // Allow digits
    if (/^[0-9]$/.test(e.key)) {
      onKeyDown?.(e)
      return
    }

    // Allow one decimal point
    if (e.key === ".") {
      const input = e.currentTarget
      if (!input.value.includes(".")) {
        onKeyDown?.(e)
        return
      }
      e.preventDefault()
      return
    }

    // Allow leading minus for negative numbers
    if (allowNegative && e.key === "-") {
      const input = e.currentTarget
      if (input.selectionStart === 0 && !input.value.startsWith("-")) {
        onKeyDown?.(e)
        return
      }
      e.preventDefault()
      return
    }

    e.preventDefault()
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData("text")
    const pattern = allowNegative ? /[^0-9.\-]/g : /[^0-9.]/g
    // Keep at most one decimal point
    let cleaned = pasted.replace(pattern, "")
    const parts = cleaned.split(".")
    if (parts.length > 2) cleaned = parts[0] + "." + parts.slice(1).join("")

    const input = e.currentTarget
    const start = input.selectionStart ?? input.value.length
    const end = input.selectionEnd ?? input.value.length
    const newValue = input.value.slice(0, start) + cleaned + input.value.slice(end)

    // Fire synthetic onChange
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set
    nativeInputValueSetter?.call(input, newValue)
    input.dispatchEvent(new Event("input", { bubbles: true }))

    onPaste?.(e)
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onChange={onChange}
      {...props}
    />
  )
}

export { NumericInput }
