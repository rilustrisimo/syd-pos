'use client'

// Animated reel: storyboard (one scene per narration sentence) + style →
// live preview in an iframe (the real template, driven by the narration) →
// render to MP4 on GitHub Actions, which attaches it to the post.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Play, Square, Sparkles, Download, ExternalLink, Clapperboard } from 'lucide-react'
import type { ContentSuggestion } from '@/hooks/useContentSuggestions'
import { getContentMediaUrl } from '@/hooks/useContentMedia'
import { useGenerateStoryboard, useLatestReelJob, useRenderReel } from '@/hooks/useReelRenders'
import { getStoreContactInfo } from '@/lib/supabase/queries/shop-settings'
import {
  REEL_STYLES, buildReelData, formatPhoneForReel,
  type ReelStyle, type SceneRole, type Storyboard, type StoryboardScene,
} from '@/lib/marketing/reel-styles'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const ROLE_LABELS: Record<SceneRole, string> = { hook: 'Hook', product: 'Product', proof: 'Points', cta: 'Call to action' }
const PREVIEW_SCALE = 0.25 // 1080×1920 → 270×480

/** UTF-8 safe base64 for the template's ?data= parameter. */
const toBase64 = (s: string) => btoa(unescape(encodeURIComponent(s)))

export function AnimatedReelDialog({
  suggestion, open, onOpenChange,
}: { suggestion: ContentSuggestion; open: boolean; onOpenChange: (open: boolean) => void }) {
  const generate = useGenerateStoryboard()
  const render = useRenderReel()
  const { data: job } = useLatestReelJob(suggestion.id, open)

  const { data: contact } = useQuery({ queryKey: ['store-contact'], queryFn: getStoreContactInfo, staleTime: 5 * 60 * 1000 })

  // Local edits; until there are any, show the saved storyboard.
  const [edited, setEdited] = useState<Storyboard | null>(null)
  const storyboard = edited ?? suggestion.reel_storyboard
  // Starts on the style of the last render, until staff pick another.
  const [pickedStyle, setStyle] = useState<ReelStyle | null>(null)
  const [narrationSeconds, setNarrationSeconds] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const stopRef = useRef<(() => void) | null>(null)

  const style: ReelStyle = pickedStyle ?? (job?.style && job.style in REEL_STYLES ? job.style : 'flat-poster')
  const voiceKey = suggestion.voice_media?.storage_key ?? null
  const hasNarration = !!voiceKey && (suggestion.voice_timepoints?.length ?? 0) > 0

  // Template data, rebuilt (debounced) as staff edit the storyboard.
  const reelData = useMemo(() => {
    if (!storyboard || !narrationSeconds) return null
    return buildReelData({
      style, storyboard, narrationSeconds,
      site: 'sydconstruct.com',
      phone: formatPhoneForReel(contact?.store_phone),
      logoUrl: '../syd-logo.svg',
    })
  }, [storyboard, narrationSeconds, style, contact?.store_phone])
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  useEffect(() => {
    if (!reelData) return
    const t = setTimeout(() => {
      setPlaying(false)
      setPreviewSrc(`/reel-templates/${style}.html?data=${toBase64(JSON.stringify(reelData))}`)
    }, 500)
    return () => clearTimeout(t)
  }, [reelData, style])

  const stopPreview = () => {
    stopRef.current?.(); stopRef.current = null
    audioRef.current?.pause()
    setPlaying(false)
  }
  // Stop the narration when the preview reloads or the dialog closes (unmounts).
  useEffect(() => () => { stopRef.current?.(); stopRef.current = null; audioRef.current?.pause() }, [previewSrc])

  const playPreview = () => {
    const win = frameRef.current?.contentWindow as (Window & { play?: (a: HTMLAudioElement) => () => void; seek?: (t: number) => void }) | null
    const audio = audioRef.current
    if (!win?.play || !audio || !reelData) return
    stopPreview()
    audio.currentTime = 0
    win.seek?.(0)
    stopRef.current = win.play(audio)
    const lead = setTimeout(() => { audio.play().catch(() => {}) }, reelData.leadSeconds * 1000)
    const end = setTimeout(stopPreview, reelData.durationSeconds * 1000 + 300)
    const prevStop = stopRef.current
    stopRef.current = () => { prevStop?.(); clearTimeout(lead); clearTimeout(end) }
    setPlaying(true)
  }

  const updateScene = (i: number, patch: Partial<StoryboardScene>) =>
    setEdited((sb) => {
      const base = sb ?? suggestion.reel_storyboard
      return base ? { ...base, scenes: base.scenes.map((s, j) => (j === i ? { ...s, ...patch } : s)) } : base
    })

  const handleGenerate = async () => {
    try {
      const { storyboard: sb } = await generate.mutateAsync(suggestion.id)
      setEdited(sb)
      toast.success('Storyboard ready — edit any text, then preview')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to make the storyboard')
    }
  }

  const handleRender = async () => {
    if (!storyboard) return
    stopPreview()
    try {
      await render.mutateAsync({ suggestion_id: suggestion.id, style, storyboard, narration_seconds: narrationSeconds ?? undefined })
      toast.success('Rendering started — about 1–3 minutes. You can close this window.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start the render')
    }
  }

  const busy = job?.status === 'queued' || job?.status === 'rendering'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Clapperboard className="w-5 h-5" /> Animated Reel</DialogTitle>
          <DialogDescription>
            One scene per narration sentence. Edit the on-screen text, pick a style, preview it with the voice, then render the MP4.
          </DialogDescription>
        </DialogHeader>

        {!hasNarration ? (
          <p className="py-10 text-center text-muted-foreground">
            Make the narration first (voice script → Synthesize). The animation is timed to it.
          </p>
        ) : (
          <div className="grid gap-6 md:grid-cols-[1fr_300px]">
            {/* Storyboard */}
            <div className="space-y-3 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">Storyboard</h3>
                <Button size="sm" variant={storyboard ? 'outline' : 'default'} onClick={handleGenerate} disabled={generate.isPending}>
                  {generate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  {storyboard ? 'Rewrite with AI' : 'Make storyboard'}
                </Button>
              </div>
              {!storyboard ? (
                <p className="text-sm text-muted-foreground py-6">Click <b>Make storyboard</b> to turn the narration into scenes.</p>
              ) : (
                storyboard.scenes.map((scene, i) => (
                  <div key={i} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Scene {i + 1}</Badge>
                      <Select value={scene.role} onValueChange={(v) => updateScene(i, { role: v as SceneRole })}>
                        <SelectTrigger className="h-7 w-40 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(ROLE_LABELS) as SceneRole[]).map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <span className="text-xs text-muted-foreground">at {scene.start.toFixed(1)}s</span>
                    </div>
                    <p className="text-xs text-muted-foreground italic">&ldquo;{scene.spoken}&rdquo;</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1 sm:col-span-2">
                        <Label className="text-xs">Headline (1–4 words)</Label>
                        <Input value={scene.headline} maxLength={60} onChange={(e) => updateScene(i, { headline: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Small line (optional)</Label>
                        <Input value={scene.sub ?? ''} maxLength={60} onChange={(e) => updateScene(i, { sub: e.target.value || undefined })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Stamp (optional)</Label>
                        <Input value={scene.stamp ?? ''} maxLength={20} placeholder="Matibay!" onChange={(e) => updateScene(i, { stamp: e.target.value || undefined })} />
                      </div>
                      {scene.role === 'proof' && (
                        <div className="space-y-1 sm:col-span-2">
                          <Label className="text-xs">Points (up to 3, separated by commas)</Label>
                          <Input
                            value={(scene.items ?? []).join(', ')}
                            onChange={(e) => updateScene(i, { items: e.target.value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 3) })}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Style, preview, render */}
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Style</h3>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(REEL_STYLES) as ReelStyle[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStyle(s)}
                      title={REEL_STYLES[s].description}
                      className={`rounded-md overflow-hidden border-2 text-left ${style === s ? 'border-primary' : 'border-transparent hover:border-muted-foreground/40'}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/reel-styles/${s}.jpg`} alt="" className="w-full aspect-[9/16] object-cover" />
                      <div className="px-1 py-0.5 text-[10px] leading-tight font-medium">{REEL_STYLES[s].label}</div>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{REEL_STYLES[style].description}</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">Preview</h3>
                  <Button size="sm" variant="outline" onClick={playing ? stopPreview : playPreview} disabled={!previewSrc}>
                    {playing ? <Square className="mr-1 h-3.5 w-3.5" /> : <Play className="mr-1 h-3.5 w-3.5" />}
                    {playing ? 'Stop' : 'Play'}
                  </Button>
                </div>
                <div className="relative mx-auto rounded-lg overflow-hidden bg-black" style={{ width: 1080 * PREVIEW_SCALE, height: 1920 * PREVIEW_SCALE }}>
                  {previewSrc ? (
                    <iframe
                      ref={frameRef}
                      key={previewSrc}
                      src={previewSrc}
                      title="Reel preview"
                      className="absolute top-0 left-0 border-0 origin-top-left"
                      style={{ width: 1080, height: 1920, transform: `scale(${PREVIEW_SCALE})` }}
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-white/60 p-4 text-center">
                      {storyboard ? 'Loading preview…' : 'Make the storyboard to see a preview'}
                    </div>
                  )}
                </div>
                {voiceKey && (
                  <audio
                    ref={audioRef}
                    src={getContentMediaUrl(voiceKey)}
                    preload="auto"
                    onLoadedMetadata={(e) => setNarrationSeconds(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : null)}
                    className="hidden"
                  />
                )}
              </div>

              <Button className="w-full" onClick={handleRender} disabled={!storyboard || !reelData || busy || render.isPending}>
                {render.isPending || busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clapperboard className="mr-2 h-4 w-4" />}
                {busy ? 'Rendering…' : 'Render MP4'}
              </Button>

              {job && (
                <div className="rounded-lg border p-3 text-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Last render · {REEL_STYLES[job.style]?.label ?? job.style}</span>
                    <Badge variant={job.status === 'done' ? 'default' : job.status === 'failed' ? 'destructive' : 'secondary'}>
                      {{ queued: 'Queued', rendering: 'Rendering', done: 'Done', failed: 'Failed' }[job.status]}
                    </Badge>
                  </div>
                  {busy && <p className="text-xs text-muted-foreground">Usually 1–3 minutes. The video is attached to this post when it&apos;s done.</p>}
                  {job.status === 'failed' && <p className="text-xs text-destructive">{job.error}</p>}
                  {job.status === 'done' && job.output_media?.storage_key && (
                    <>
                      <video src={getContentMediaUrl(job.output_media.storage_key)} controls playsInline className="w-full rounded-md bg-black" />
                      <a href={getContentMediaUrl(job.output_media.storage_key)} download className="inline-flex items-center text-xs text-primary hover:underline">
                        <Download className="mr-1 h-3.5 w-3.5" /> Download MP4
                      </a>
                    </>
                  )}
                  {job.github_run_url && (
                    <a href={job.github_run_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-xs text-muted-foreground hover:underline ml-3">
                      Render log <ExternalLink className="ml-1 h-3 w-3" />
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
