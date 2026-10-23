'use client'

import { Plus, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { SecondsField } from '@/components/marketing/seconds-field'
import { normalizeCaptions, type ReelCaption } from '@/lib/marketing/reel-timeline'

interface ReelCaptionsEditorProps {
  captions: ReelCaption[]
  showCaptions: boolean
  narrationSeconds: number
  currentTime: number
  disabled?: boolean
  onChange: (captions: ReelCaption[]) => void
  onToggle: (show: boolean) => void
  onReset: () => void
  onJump: (t: number) => void
}

export function ReelCaptionsEditor({
  captions, showCaptions, narrationSeconds, currentTime, disabled, onChange, onToggle, onReset, onJump,
}: ReelCaptionsEditorProps) {
  const update = (index: number, patch: Partial<ReelCaption>) => {
    const next = captions.map((c, i) => (i === index ? { ...c, ...patch } : c))
    // Re-sort only when a start time changed, so typing in a text box
    // never makes the row jump away.
    onChange(patch.start !== undefined ? normalizeCaptions(next, narrationSeconds) : next)
  }

  const remove = (index: number) => onChange(normalizeCaptions(captions.filter((_, i) => i !== index), narrationSeconds))

  const add = () => {
    const start = Math.min(currentTime, Math.max(0, narrationSeconds - 0.5))
    onChange(normalizeCaptions([...captions, { text: 'New caption', start, end: 0 }], narrationSeconds))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <Switch checked={showCaptions} onCheckedChange={onToggle} disabled={disabled} />
          Show captions
        </label>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={add} disabled={disabled}>
            <Plus className="w-3.5 h-3.5" /> Add at {currentTime.toFixed(1)}s
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={onReset} disabled={disabled}>
            <RotateCcw className="w-3.5 h-3.5" /> Reset to voice timing
          </Button>
        </div>
      </div>
      <p className="text-[11px] text-slate-400">
        Editing captions changes the on-screen text only. To change what&apos;s said, edit the voice script and re-synthesize.
      </p>

      <ol className={`space-y-1 max-h-[300px] overflow-y-auto pr-1 ${showCaptions ? '' : 'opacity-50'}`}>
        {captions.map((c, i) => {
          const active = currentTime >= c.start && currentTime < c.end
          return (
            <li key={i} className={`flex items-center gap-1 rounded-md px-1 py-0.5 ${active ? 'bg-amber-50 ring-1 ring-amber-300' : ''}`}>
              <button type="button" className="text-[10px] font-mono text-slate-400 w-6 text-left" onClick={() => onJump(c.start)} title="Jump preview here">
                {i + 1}
              </button>
              <SecondsField
                value={c.start}
                step={0.1}
                max={narrationSeconds}
                disabled={disabled}
                label="Caption start"
                onChange={(start) => update(i, { start })}
              />
              <Input
                value={c.text}
                onChange={(e) => update(i, { text: e.target.value })}
                disabled={disabled}
                className="h-7 text-xs flex-1 min-w-0"
              />
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-red-600" onClick={() => remove(i)} disabled={disabled}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
