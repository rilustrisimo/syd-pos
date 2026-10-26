'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { NARRATION_VOICES } from '@/lib/marketing/voices'

/** Picks the narration voice (Kore by default). */
export function VoiceSelect({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="h-7 w-52 text-xs" aria-label="Narration voice">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {NARRATION_VOICES.map((v) => (
          <SelectItem key={v.id} value={v.id} className="text-xs">{v.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
