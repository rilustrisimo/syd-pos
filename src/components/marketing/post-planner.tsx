'use client'

import { useState } from 'react'
import { CalendarDays, Check, ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { usePlanPosts, useSavePlannedPosts } from '@/hooks/useMarketingInsights'
import { AUDIENCE_COLORS, AUDIENCE_LABELS, FORMAT_COLORS, FORMAT_LABELS } from '@/lib/marketing/formats'
import type { PlannedPost } from '@/lib/marketing/planner-prompts'

/**
 * The "social media manager" panel on the Feed: Gemini plans today's post
 * (or the week) from imported insights; picked posts are saved as ideas +
 * ready-to-edit Feed suggestions.
 */
export function PostPlanner() {
  const plan = usePlanPosts()
  const save = useSavePlannedPosts()
  const [note, setNote] = useState('')
  const [posts, setPosts] = useState<PlannedPost[]>([])
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [confidence, setConfidence] = useState<string | null>(null)

  function run(mode: 'today' | 'week') {
    plan.mutate(
      { mode, note: note.trim() || undefined },
      {
        onSuccess: (res) => {
          setPosts(res.posts)
          setPicked(new Set(res.posts.map((_, i) => i)))
          setConfidence(res.confidence)
        },
        onError: (e) => toast.error(e.message),
      }
    )
  }

  async function handleSave() {
    const chosen = posts.filter((_, i) => picked.has(i))
    try {
      const { saved } = await save.mutateAsync(chosen)
      toast.success(`${saved} post${saved === 1 ? '' : 's'} added to the Feed below`)
      setPosts([])
      setPicked(new Set())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save')
    }
  }

  const toggle = (i: number) => setPicked((prev) => {
    const next = new Set(prev)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    return next
  })

  return (
    <Card className="border-blue-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-600" /> AI content planner
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2 flex-wrap">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note — e.g. 'new HardiFlex stock arrived' or 'focus on farms this week'"
            className="text-sm flex-1 min-w-[240px]"
            disabled={plan.isPending}
          />
          <Button onClick={() => run('today')} disabled={plan.isPending} className="gap-1.5">
            <Sparkles className="w-4 h-4" /> {plan.isPending ? 'Planning…' : "Plan today's post"}
          </Button>
          <Button variant="outline" onClick={() => run('week')} disabled={plan.isPending} className="gap-1.5">
            <CalendarDays className="w-4 h-4" /> Plan this week
          </Button>
        </div>
        <p className="text-[11px] text-slate-500">
          Plans use your imported results and best posting times from{' '}
          <Link href="/marketing/insights" className="underline">Insights</Link>. Import Meta and GA4 exports there regularly so the plans get sharper.
        </p>

        {posts.length > 0 && (
          <div className="space-y-2">
            {confidence === 'low' && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-1.5">
                Little performance data yet, so posting times are based mostly on typical local activity. Import your Meta and GA4 exports to improve them.
              </p>
            )}
            {posts.map((p, i) => (
              <PlannedPostCard key={`${p.date}-${i}`} post={p} picked={picked.has(i)} onToggle={() => toggle(i)} />
            ))}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { setPosts([]); setPicked(new Set()) }} disabled={save.isPending}>Discard</Button>
              <Button onClick={handleSave} disabled={!picked.size || save.isPending}>
                <Check className="w-4 h-4 mr-1.5" /> {save.isPending ? 'Saving…' : `Add ${picked.size} to Feed`}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function PlannedPostCard({ post, picked, onToggle }: { post: PlannedPost; picked: boolean; onToggle: () => void }) {
  const [open, setOpen] = useState(false)
  const isReel = post.format === 'reel'
  return (
    <div className={`rounded-md border p-3 space-y-2 ${picked ? 'border-blue-300 bg-blue-50/40' : 'opacity-70'}`}>
      <div className="flex items-start gap-2">
        <input type="checkbox" checked={picked} onChange={onToggle} className="mt-1 accent-blue-600" aria-label="Include this post" />
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-700">{post.date}</span>
            <span className="text-xs text-slate-500">post at {post.best_time}</span>
            <Badge variant="outline" className={FORMAT_COLORS[post.format]}>{FORMAT_LABELS[post.format]}</Badge>
            <Badge variant="outline" className={AUDIENCE_COLORS[post.audience]}>{AUDIENCE_LABELS[post.audience]}</Badge>
          </div>
          <p className="text-sm font-medium">{post.title}</p>
          <p className="text-xs text-slate-500">{post.why}</p>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{post.caption}</p>
          <p className="text-xs text-blue-700">{post.hashtags.join(' ')}</p>
          {post.tags.length > 0 && <p className="text-xs text-slate-500"><span className="font-medium">Tag:</span> {post.tags.join(' · ')}</p>}
        </div>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setOpen((o) => !o)} aria-label="Show creative details">
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
      </div>
      {open && (
        <div className="ml-6 rounded bg-white border p-2 text-xs space-y-2">
          {isReel ? (
            <>
              <p><span className="font-medium">Shots:</span> <span className="whitespace-pre-wrap">{post.shot_list}</span></p>
              <p><span className="font-medium">Voiceover:</span> {post.voice_script}</p>
              <p><span className="font-medium">Stock search:</span> {post.stock_keywords}</p>
            </>
          ) : (
            <p><span className="font-medium">Canva prompt:</span> <span className="whitespace-pre-wrap">{post.creative_prompt}</span></p>
          )}
          <p className="text-slate-500"><span className="font-medium">Angle:</span> {post.angle}</p>
        </div>
      )}
    </div>
  )
}
