'use client'

import { useState } from 'react'
import { Copy, ExternalLink, RefreshCw, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useRegenerateCanvaPrompt } from '@/hooks/useContentIdeas'
import { copyToClipboard } from '@/lib/marketing/formats'
import { LAYOUT_PATTERNS, LAYOUT_PATTERN_KEYS, inspirationLinks, layoutPatternOf } from '@/lib/marketing/canva-prompt'

/**
 * The Canva prompt for an image/carousel post, with Copy and Regenerate.
 * Regenerate asks Gemini for a fresh, detailed design on a curated layout
 * pattern (auto-rotated, or picked here) and saves it on the idea or Feed
 * post. Links open matching designs on Behance, Dribbble, Pinterest etc.
 */
export function CanvaPromptPanel({
  prompt,
  ideaId,
  suggestionId,
  isCarousel,
}: {
  prompt: string | null | undefined
  ideaId?: string
  suggestionId?: string
  isCarousel: boolean
}) {
  const regenerate = useRegenerateCanvaPrompt()
  const [pattern, setPattern] = useState('auto')
  const current = layoutPatternOf(prompt)

  function handleRegenerate() {
    regenerate.mutate(
      { idea_id: ideaId, suggestion_id: suggestionId, pattern: pattern === 'auto' ? undefined : pattern },
      { onSuccess: () => toast.success('Canva prompt ready'), onError: (e) => toast.error(e.message) }
    )
  }

  const layouts = LAYOUT_PATTERN_KEYS.filter((k) => isCarousel || !LAYOUT_PATTERNS[k].carouselOnly)

  const controls = (
    <div className="flex items-center gap-2 flex-wrap">
      <Select value={pattern} onValueChange={setPattern} disabled={regenerate.isPending}>
        <SelectTrigger className="h-7 text-xs w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">Layout: auto (new each time)</SelectItem>
          {layouts.map((k) => (
            <SelectItem key={k} value={k}>{LAYOUT_PATTERNS[k].label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleRegenerate} disabled={regenerate.isPending}>
        {prompt ? <RefreshCw className={`w-3 h-3 ${regenerate.isPending ? 'animate-spin' : ''}`} /> : <Wand2 className="w-3 h-3" />}
        {regenerate.isPending ? 'Designing...' : prompt ? 'Regenerate Canva prompt' : 'Make detailed Canva prompt'}
      </Button>
    </div>
  )

  if (!prompt) return controls

  return (
    <details className="rounded-md border bg-slate-50 text-xs">
      <summary className="cursor-pointer px-3 py-2 font-medium text-slate-600 select-none">
        {isCarousel ? 'Canva prompt (slides)' : 'Canva prompt'}
        {current && <span className="font-normal text-slate-400"> · {LAYOUT_PATTERNS[current].label}</span>}
      </summary>
      <div className="px-3 pb-3 space-y-2">
        <p className="whitespace-pre-wrap text-slate-700">{prompt}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => copyToClipboard(prompt)}>
            <Copy className="w-3 h-3" /> Copy prompt
          </Button>
          {controls}
        </div>
        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-slate-500">
          <span className="font-medium">See similar designs:</span>
          {inspirationLinks(current).map((l) => (
            <a key={l.site} href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-blue-700 hover:underline">
              {l.site} <ExternalLink className="w-3 h-3" />
            </a>
          ))}
        </div>
      </div>
    </details>
  )
}
