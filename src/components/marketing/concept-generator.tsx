'use client'

import { useState } from 'react'
import { Check, Megaphone, Target } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateContentIdea, type ContentAudience } from '@/hooks/useContentIdeas'
import { useGenerateConcepts } from '@/hooks/useMarketingInsights'
import { AUDIENCE_COLORS, AUDIENCE_LABELS, FORMAT_COLORS, FORMAT_LABELS } from '@/lib/marketing/formats'
import type { AdConcept, ConceptKind } from '@/lib/marketing/planner-prompts'
import { isCreativeStyle } from '@/lib/marketing/creative-styles'
import { CreativeStyleBadge } from '@/components/marketing/creative-style-badge'

const AD_AUDIENCES: ContentAudience[] = ['contractor', 'business_farm', 'family_build']
const POST_AUDIENCES: ContentAudience[] = [...AD_AUDIENCES, 'general']

const GOAL_LABELS: Record<string, string> = {
  leads: 'Leads', page_follows: 'Follows', interactions: 'Interactions', sales: 'Sales',
  reach: 'Reach', saves: 'Saves', shares: 'Shares', comments: 'Comments', trust: 'Trust',
}

const KIND_COPY: Record<ConceptKind, { title: string; help: string; placeholder: string; saved: string }> = {
  ad: {
    title: 'Generate ad concepts',
    help: 'Ads chase results: leads (quote requests), page follows, interactions and sales. On Meta, the creative decides who sees an ad, so each concept speaks to a different customer or uses a different kind of proof. Run 6–9 at once in one broad ad set.',
    placeholder: "Topic or product — e.g. 'roofing materials' or 'complete list for a piggery'",
    saved: 'ad concept',
  },
  post: {
    title: 'Generate post concepts',
    help: 'Everyday posts for the Page and Instagram: tips, product know-how, behind the scenes, deliveries, questions and local stories that earn reach, saves, shares and comments, so people follow and trust SYD. Soft calls to action, little selling.',
    placeholder: "Topic (optional) — e.g. 'rainy season prep' or 'building a piggery'",
    saved: 'post concept',
  },
}

/**
 * Generates genuinely different concepts (audience × proof/hook × format ×
 * creative style): Meta ad concepts that chase results, or everyday post
 * concepts that build reach and engagement. On Meta the creative does the
 * targeting, so each concept reaches a different group of people.
 */
export function ConceptGenerator({ onAdded }: { onAdded: () => void }) {
  const generate = useGenerateConcepts()
  const createIdea = useCreateContentIdea()
  const [kind, setKind] = useState<ConceptKind>('ad')
  const [topic, setTopic] = useState('')
  const [audiences, setAudiences] = useState<Set<ContentAudience>>(new Set(AD_AUDIENCES))
  const [count, setCount] = useState('6')
  const [concepts, setConcepts] = useState<AdConcept[]>([])
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [adding, setAdding] = useState(false)

  function toggleAudience(a: ContentAudience) {
    setAudiences((prev) => {
      const next = new Set(prev)
      if (next.has(a)) next.delete(a)
      else next.add(a)
      return next
    })
  }

  function switchKind(next: ConceptKind) {
    if (next === kind) return
    setKind(next)
    setConcepts([])
    setAudiences(new Set(next === 'post' ? POST_AUDIENCES : AD_AUDIENCES))
  }

  function run() {
    generate.mutate(
      { topic, audiences: [...audiences], count: Number(count), kind },
      {
        onSuccess: (res) => { setConcepts(res.concepts); setPicked(new Set(res.concepts.map((_, i) => i))) },
        onError: (e) => toast.error(e.message),
      }
    )
  }

  async function addSelected() {
    setAdding(true)
    let added = 0
    try {
      for (const [i, c] of concepts.entries()) {
        if (!picked.has(i)) continue
        const isReel = c.format === 'reel'
        const description = `${c.description} (${kind === 'ad' ? 'Proof' : 'Hook'}: ${c.proof_type}${c.goal ? ` · Goal: ${GOAL_LABELS[c.goal] ?? c.goal}` : ''})`
        await createIdea.mutateAsync({
          title: c.title,
          source_product_id: c.source_product_id ?? undefined,
          // For reels the generator's "creative_prompt" is the voiceover, so
          // it goes in the description and the Canva prompt slot stays empty.
          description: isReel ? `${description}\n\nVoiceover: ${c.creative_prompt}` : description,
          image_concept: c.image_concept || undefined,
          format: c.format,
          audience: c.audience,
          angle: c.angle,
          concept_code: c.concept_code,
          purpose: kind === 'ad' ? 'ad' : 'daily',
          creative_style: isCreativeStyle(c.creative_style) ? c.creative_style : undefined,
          reel_stickers: isReel && c.stickers?.length ? c.stickers : undefined,
          creative_prompt: isReel ? undefined : c.creative_prompt,
          stock_keywords: c.stock_keywords || undefined,
        })
        added++
      }
      toast.success(`Added ${added} ${KIND_COPY[kind].saved}${added === 1 ? '' : 's'} to the Idea Bank`)
      setConcepts([])
      onAdded()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add concepts')
    } finally {
      setAdding(false)
    }
  }

  return (
    <Card className="border-blue-200">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            {kind === 'ad' ? <Target className="w-4 h-4 text-blue-600" /> : <Megaphone className="w-4 h-4 text-blue-600" />}
            {KIND_COPY[kind].title}
          </CardTitle>
          <div className="flex rounded-md border p-0.5 text-xs">
            {(['ad', 'post'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => switchKind(k)}
                disabled={generate.isPending || adding}
                className={`px-2.5 py-1 rounded ${kind === k ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {k === 'ad' ? 'Ad concepts' : 'Post concepts'}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-slate-500">
          {KIND_COPY[kind].help}
        </p>
        <div className="flex gap-2 flex-wrap items-center">
          <Input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={KIND_COPY[kind].placeholder}
            className="text-sm flex-1 min-w-[240px]"
            disabled={generate.isPending}
          />
          <Select value={count} onValueChange={setCount}>
            <SelectTrigger className="w-28 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {['4', '6', '8'].map((n) => <SelectItem key={n} value={n}>{n} concepts</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={run} disabled={generate.isPending || !audiences.size}>
            <Target className="w-4 h-4 mr-1.5" /> {generate.isPending ? 'Generating…' : 'Generate'}
          </Button>
        </div>
        <div className="flex gap-3 flex-wrap">
          {(kind === 'post' ? POST_AUDIENCES : AD_AUDIENCES).map((a) => (
            <label key={a} className="flex items-center gap-1.5 text-xs text-slate-700">
              <input type="checkbox" checked={audiences.has(a)} onChange={() => toggleAudience(a)} className="accent-blue-600" />
              {AUDIENCE_LABELS[a]}
            </label>
          ))}
        </div>

        {concepts.length > 0 && (
          <div className="space-y-2">
            {concepts.map((c, i) => (
              <label key={c.concept_code} className={`flex gap-2 rounded-md border p-3 cursor-pointer ${picked.has(i) ? 'border-blue-300 bg-blue-50/40' : 'opacity-70'}`}>
                <input
                  type="checkbox"
                  checked={picked.has(i)}
                  onChange={() => setPicked((prev) => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n })}
                  className="mt-1 accent-blue-600"
                />
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{c.title}</span>
                    <Badge variant="outline" className={FORMAT_COLORS[c.format]}>{FORMAT_LABELS[c.format]}</Badge>
                    <Badge variant="outline" className={AUDIENCE_COLORS[c.audience]}>{AUDIENCE_LABELS[c.audience]}</Badge>
                    <CreativeStyleBadge style={c.creative_style} />
                    {c.goal && <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">{GOAL_LABELS[c.goal] ?? c.goal}</Badge>}
                    <span className="text-[11px] text-slate-400">{c.proof_type}</span>
                  </div>
                  {c.product_code && <p className="text-xs text-slate-600"><span className="font-medium">Product:</span> <span className="font-mono">{c.product_code}</span></p>}
                  <p className="text-xs text-slate-600"><span className="font-medium">Hook:</span> {c.angle}</p>
                  <p className="text-xs text-slate-500">{c.description}</p>
                  <p className="text-[11px] font-mono text-slate-400">{c.concept_code}</p>
                </div>
              </label>
            ))}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConcepts([])} disabled={adding}>Discard</Button>
              <Button onClick={addSelected} disabled={!picked.size || adding}>
                <Check className="w-4 h-4 mr-1.5" /> {adding ? 'Adding…' : `Add ${picked.size} to Idea Bank`}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
