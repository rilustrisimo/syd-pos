'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { NARRATION_LANGUAGES, type NarrationLanguage } from '@/lib/marketing/narration-language'

/** Language the voice script is written in (Bisaya by default). */
export function NarrationLanguageSelect({
  value, onChange, disabled,
}: { value: NarrationLanguage; onChange: (v: NarrationLanguage) => void; disabled?: boolean }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as NarrationLanguage)} disabled={disabled}>
      <SelectTrigger className="h-7 w-36 text-xs" aria-label="Script language">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {NARRATION_LANGUAGES.map((l) => (
          <SelectItem key={l.value} value={l.value} className="text-xs">{l.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
