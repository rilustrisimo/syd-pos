'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, Film, Mic, Pause, Play, Save, Sparkles, Upload, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useContentMedia, useCreateContentMedia, getContentMediaUrl, type ContentMedia } from '@/hooks/useContentMedia'
import {
  useAttachCreativeMedia,
  useGenerateVoiceScript,
  useSaveReelTimeline,
  useSaveVoiceScript,
  useSynthesizeVoice,
  type ContentSuggestion,
} from '@/hooks/useContentSuggestions'
import { ReelPlayer, getSupportedReelMimeType, type RenderedReel } from '@/lib/marketing/reel-renderer'
import {
  END_CARD_SECONDS,
  buildDefaultCaptions,
  clampTrim,
  contentLength,
  emptyTimeline,
  makeClip,
  spreadClipsEvenly,
  totalLength,
  type ReelTimeline,
} from '@/lib/marketing/reel-timeline'
import { uploadMediaFile } from '@/lib/marketing/upload'
import { applyReelPreset, type ReelPreset } from '@/lib/marketing/reel-timeline'
import { CREATIVE_STYLES, isCreativeStyle } from '@/lib/marketing/creative-styles'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ReelClipRow } from '@/components/marketing/reel-clip-row'
import { VoiceSelect } from '@/components/marketing/voice-select'
import { DEFAULT_NARRATION_VOICE } from '@/lib/marketing/voices'
import { ReelCaptionsEditor } from '@/components/marketing/reel-captions-editor'

interface ReelBuilderDialogProps {
  suggestion: ContentSuggestion
  open: boolean
  onOpenChange: (open: boolean) => void
}

const LOGO_URL = '/syd-logo-mark.png'

/**
 * Reel editor for a reel suggestion: narration first (if missing), then
 * clips (library or uploaded on the spot) with per-clip length / start
 * point / sound, editable captions, a live preview with scrubbing, and a
 * final real-time render to MP4 that's saved back as the creative.
 */
export function ReelBuilderDialog({ suggestion, open, onOpenChange }: ReelBuilderDialogProps) {
  const narrationUrl = suggestion.voice_media ? getContentMediaUrl(suggestion.voice_media.storage_key) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* sm:max-w-* is needed to override the dialog's default sm:max-w-lg cap. */}
      <DialogContent className="w-[96vw] max-w-[96vw] sm:max-w-6xl max-h-[94vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Film className="w-5 h-5" /> Build Reel</DialogTitle>
          <DialogDescription>
            {narrationUrl
              ? 'Arrange clips, set their timing and captions, preview, then render the MP4.'
              : 'Step 1: the reel is built around its narration — create that first.'}
          </DialogDescription>
        </DialogHeader>
        {narrationUrl ? (
          <ReelEditor suggestion={suggestion} narrationUrl={narrationUrl} onDone={() => onOpenChange(false)} />
        ) : (
          <NarrationStep suggestion={suggestion} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function NarrationStep({ suggestion }: { suggestion: ContentSuggestion }) {
  const generate = useGenerateVoiceScript()
  const save = useSaveVoiceScript()
  const synthesize = useSynthesizeVoice()
  const [voice, setVoice] = useState(DEFAULT_NARRATION_VOICE)
  const [voiceScript, setVoiceScript] = useState(suggestion.voice_script ?? '')
  const busy = generate.isPending || save.isPending || synthesize.isPending

  function handleGenerate() {
    generate.mutate(suggestion.id, {
      onSuccess: (text) => { setVoiceScript(text); toast.success('Voice script generated — edit it if you like') },
      onError: (e) => toast.error(e.message),
    })
  }

  async function handleSynthesize() {
    try {
      if (voiceScript !== (suggestion.voice_script ?? '')) {
        await save.mutateAsync({ id: suggestion.id, voice_script: voiceScript })
      }
      await synthesize.mutateAsync({ id: suggestion.id, voice })
      toast.success('Narration ready — opening the editor')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create the narration')
    }
  }

  return (
    <div className="max-w-2xl space-y-3">
      <div className="flex items-start gap-3 rounded-md border bg-slate-50 p-3">
        <Mic className="w-5 h-5 text-slate-500 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-slate-600">
          Write the voiceover (plain English, about 60–80 words), then create the narration. Captions are timed to it automatically.
        </p>
      </div>
      <Textarea
        value={voiceScript}
        onChange={(e) => setVoiceScript(e.target.value)}
        rows={6}
        className="text-sm"
        placeholder="Generate a voice script from the post script, or write your own."
        disabled={busy}
      />
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" onClick={handleGenerate} disabled={busy || !suggestion.script?.trim()}>
          <Sparkles className="w-4 h-4 mr-1.5" /> {generate.isPending ? 'Generating...' : 'Generate Voice Script'}
        </Button>
        <div className="flex items-center gap-2">
          <VoiceSelect value={voice} onChange={setVoice} disabled={busy} />
          <Button onClick={handleSynthesize} disabled={busy || !voiceScript.trim()}>
            <Mic className="w-4 h-4 mr-1.5" /> {save.isPending || synthesize.isPending ? 'Creating narration...' : 'Create Narration'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// Reads the narration length up front — default captions and clip lengths
// are built from it before the player itself loads.
function useNarrationDuration(url: string) {
  const [duration, setDuration] = useState<number | null>(null)
  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : null)
    audio.src = url
    return () => { audio.removeAttribute('src') }
  }, [url])
  return duration
}

function ReelEditor({ suggestion, narrationUrl, onDone }: { suggestion: ContentSuggestion; narrationUrl: string; onDone: () => void }) {
  const narrationSeconds = useNarrationDuration(narrationUrl)
  if (!narrationSeconds) {
    return <div className="py-16 text-center text-sm text-slate-400">Loading narration…</div>
  }
  return <ReelEditorLoaded suggestion={suggestion} narrationUrl={narrationUrl} narrationSeconds={narrationSeconds} onDone={onDone} />
}

function initialTimeline(suggestion: ContentSuggestion, narrationSeconds: number): ReelTimeline {
  const voiceMediaId = suggestion.voice_media_id
  const defaultCaptions = () => buildDefaultCaptions(suggestion.voice_script ?? '', suggestion.voice_timepoints, narrationSeconds)
  const saved = suggestion.reel_timeline
  if (!saved) return emptyTimeline(voiceMediaId, defaultCaptions())
  // Narration was re-synthesized since the timeline was saved: keep the
  // clips, but re-time the captions to the new audio.
  if (saved.voiceMediaId !== voiceMediaId) return { ...saved, voiceMediaId, captions: defaultCaptions() }
  return saved
}

function ReelEditorLoaded({
  suggestion, narrationUrl, narrationSeconds, onDone,
}: { suggestion: ContentSuggestion; narrationUrl: string; narrationSeconds: number; onDone: () => void }) {
  const { data: mediaList = [] } = useContentMedia()
  const createMedia = useCreateContentMedia()
  const attachCreative = useAttachCreativeMedia()
  const saveTimeline = useSaveReelTimeline()

  const [timeline, setTimeline] = useState<ReelTimeline>(() => initialTimeline(suggestion, narrationSeconds))
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [loadingPlayer, setLoadingPlayer] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<RenderedReel | null>(null)
  const [saving, setSaving] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const playerRef = useRef<ReelPlayer | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const timelineRef = useRef(timeline)
  timelineRef.current = timeline

  const visualMedia = useMemo(() => mediaList.filter((m) => m.media_type === 'image' || m.media_type === 'video'), [mediaList])
  const mp4Supported = useMemo(() => getSupportedReelMimeType() !== null, [])
  const resultUrl = useMemo(() => (result ? URL.createObjectURL(result.blob) : null), [result])
  useEffect(() => () => { if (resultUrl) URL.revokeObjectURL(resultUrl) }, [resultUrl])

  const total = totalLength(timeline, narrationSeconds)
  const main = contentLength(timeline, narrationSeconds)
  const busy = rendering || saving

  // A new player is needed only when the set of media elements changes
  // (which clips, their order, or whether their sound is kept); lengths,
  // trims and captions are applied to the running player live.
  const playerKey = timeline.clips.map((c) => `${c.mediaId}:${c.type}:${c.keepSound}`).join('|')
  useEffect(() => {
    let cancelled = false
    const canvas = canvasRef.current
    if (!canvas) return
    setLoadingPlayer(true)
    setIsPlaying(false)
    playerRef.current?.dispose()
    playerRef.current = null
    ReelPlayer.load({
      canvas,
      timeline: timelineRef.current,
      resolveUrl: getContentMediaUrl,
      narrationUrl,
      logoUrl: LOGO_URL,
      onTime: (t) => setCurrentTime(t),
      onEnded: () => setIsPlaying(false),
    })
      .then((player) => {
        if (cancelled) return player.dispose()
        playerRef.current = player
        setLoadingPlayer(false)
      })
      .catch((e) => {
        if (!cancelled) {
          setLoadingPlayer(false)
          toast.error(e instanceof Error ? e.message : 'Could not load the clips for preview')
        }
      })
    return () => { cancelled = true }
  }, [playerKey, narrationUrl])

  useEffect(() => () => { abortRef.current?.abort(); playerRef.current?.dispose() }, [])

  useEffect(() => { playerRef.current?.setTimeline(timeline) }, [timeline])

  // Debounced autosave so the reel can be reopened and edited later.
  const firstSave = useRef(true)
  useEffect(() => {
    if (firstSave.current) { firstSave.current = false; return }
    const handle = setTimeout(() => saveTimeline.mutate({ id: suggestion.id, reel_timeline: timeline }), 1000)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline, suggestion.id])

  const update = useCallback((patch: Partial<ReelTimeline>) => {
    setResult(null)
    setTimeline((prev) => ({ ...prev, ...patch }))
  }, [])

  function addClip(media: ContentMedia) {
    const remaining = narrationSeconds - timeline.clips.reduce((s, c) => s + c.duration, 0)
    let length = remaining > 1 ? Math.min(remaining, 5) : 3
    if (media.media_type === 'video' && media.duration_seconds) length = Math.min(length, media.duration_seconds)
    // Prefill the planner's on-screen text for this shot position.
    const sticker = suggestion.reel_stickers?.[timeline.clips.length] ?? ''
    update({ clips: [...timeline.clips, makeClip(media, length, sticker)] })
  }

  const stylePreset: ReelPreset | null =
    suggestion.creative_style === 'listicle' || suggestion.creative_style === 'transition' || suggestion.creative_style === 'qa'
      ? suggestion.creative_style
      : null

  function applyPreset(preset: ReelPreset) {
    update({ clips: applyReelPreset(timeline, preset, narrationSeconds, suggestion.reel_stickers ?? []).clips })
    toast.success(`${CREATIVE_STYLES[preset].label} layout applied — check the clips and preview`)
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const media = await createMedia.mutateAsync(await uploadMediaFile(file, file.name))
      addClip(media)
      toast.success(`${file.name} uploaded and added`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function togglePlay() {
    const player = playerRef.current
    if (!player) return
    if (player.isPlaying) {
      player.pause()
      setIsPlaying(false)
      return
    }
    setIsPlaying(true)
    try {
      await player.play()
    } finally {
      setIsPlaying(player.isPlaying)
    }
  }

  function seek(t: number) {
    setIsPlaying(false)
    playerRef.current?.seek(t)
  }

  async function handleRender() {
    const player = playerRef.current
    if (!player) return
    const controller = new AbortController()
    abortRef.current = controller
    setRendering(true)
    setResult(null)
    setProgress(0)
    try {
      setResult(await player.record(setProgress, controller.signal))
      toast.success('Reel rendered — check it below, then save')
    } catch (e) {
      const err = e instanceof Error ? e : null
      if (err?.name !== 'AbortError') toast.error(err?.message || 'Failed to render the reel')
    } finally {
      setRendering(false)
      setIsPlaying(false)
      abortRef.current = null
    }
  }

  async function handleSave() {
    if (!result) return
    setSaving(true)
    try {
      const fields = await uploadMediaFile(result.blob, `reel-${Date.now()}.mp4`, result.mimeType)
      const media = await createMedia.mutateAsync({ ...fields, duration_seconds: Math.round(result.durationSeconds * 100) / 100 })
      await attachCreative.mutateAsync({ id: suggestion.id, creative_media_id: media.id })
      toast.success('Reel saved to the library and attached')
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save the reel')
    } finally {
      setSaving(false)
    }
  }

  let clipCursor = 0
  const clipStarts = timeline.clips.map((c) => { const s = clipCursor; clipCursor += c.duration; return s })
  const keywords = suggestion.source_idea?.stock_keywords

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6">
      {/* ── Left: editing ── */}
      <div className="space-y-4 min-w-0">
        <TimelineBar timeline={timeline} narrationSeconds={narrationSeconds} total={total} currentTime={currentTime} onSeek={seek} />

        <Tabs defaultValue="clips">
          <TabsList>
            <TabsTrigger value="clips">Clips ({timeline.clips.length})</TabsTrigger>
            <TabsTrigger value="captions">Captions ({timeline.captions.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="clips" className="space-y-3 pt-2">
            {isCreativeStyle(suggestion.creative_style) && (
              <p className="text-xs rounded-md border border-orange-200 bg-orange-50 text-orange-900 px-3 py-2">
                <span className="font-semibold">{CREATIVE_STYLES[suggestion.creative_style].label} reel:</span>{' '}
                {CREATIVE_STYLES[suggestion.creative_style].reel}
              </p>
            )}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-[11px] text-slate-500">
                Narration {narrationSeconds.toFixed(1)}s · clips {timeline.clips.reduce((s, c) => s + c.duration, 0).toFixed(1)}s · end card {END_CARD_SECONDS}s
              </p>
              <div className="flex gap-1 flex-wrap">
                <Button
                  size="sm" variant="outline" className="h-7 text-xs gap-1"
                  disabled={busy || !timeline.clips.length}
                  onClick={() => update({ clips: spreadClipsEvenly(timeline.clips, narrationSeconds) })}
                >
                  <Wand2 className="w-3.5 h-3.5" /> Fit clips to narration
                </Button>
                <Select
                  value=""
                  onValueChange={(v) => applyPreset(v as ReelPreset)}
                  disabled={busy || !timeline.clips.length}
                >
                  <SelectTrigger className="h-7 w-44 text-xs">
                    <SelectValue placeholder={stylePreset ? `Apply ${CREATIVE_STYLES[stylePreset].label} layout` : 'Apply a style layout…'} />
                  </SelectTrigger>
                  <SelectContent>
                    {(['listicle', 'transition', 'qa'] as ReelPreset[]).map((p) => (
                      <SelectItem key={p} value={p}>
                        {CREATIVE_STYLES[p].label}{p === stylePreset ? ' (this post)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {timeline.clips.length === 0 ? (
              <p className="text-xs text-slate-400 border border-dashed rounded-md px-3 py-4 text-center">
                No clips yet — pick videos or photos below (or upload your own). 3–5 clips works well.
              </p>
            ) : (
              <ol className="space-y-1.5">
                {timeline.clips.map((clip, i) => (
                  <ReelClipRow
                    key={`${clip.mediaId}-${i}`}
                    clip={clip}
                    index={i}
                    count={timeline.clips.length}
                    thumbUrl={getContentMediaUrl(clip.storageKey)}
                    startsAt={clipStarts[i]}
                    disabled={busy}
                    onChange={(next) => update({ clips: timeline.clips.map((c, j) => (j === i ? { ...next, trimStart: clampTrim(next, next.duration, next.trimStart) } : c)) })}
                    onMove={(delta) => {
                      const target = i + delta
                      if (target < 0 || target >= timeline.clips.length) return
                      const clips = [...timeline.clips]
                      ;[clips[i], clips[target]] = [clips[target], clips[i]]
                      update({ clips })
                    }}
                    onRemove={() => update({ clips: timeline.clips.filter((_, j) => j !== i) })}
                    onJump={() => seek(clipStarts[i])}
                  />
                ))}
              </ol>
            )}

            <input ref={fileInputRef} type="file" accept="video/mp4,video/quicktime,video/webm,image/*" className="hidden" onChange={handleUpload} />
            <MediaPicker
              media={visualMedia}
              usedCounts={timeline.clips.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.mediaId]: (acc[c.mediaId] ?? 0) + 1 }), {})}
              keywords={keywords}
              disabled={busy}
              uploading={uploading}
              onAdd={addClip}
              onUpload={() => fileInputRef.current?.click()}
            />
          </TabsContent>

          <TabsContent value="captions" className="pt-2">
            <ReelCaptionsEditor
              captions={timeline.captions}
              showCaptions={timeline.showCaptions}
              narrationSeconds={narrationSeconds}
              currentTime={currentTime}
              disabled={busy}
              onChange={(captions) => update({ captions })}
              onToggle={(showCaptions) => update({ showCaptions })}
              onReset={() => update({ captions: buildDefaultCaptions(suggestion.voice_script ?? '', suggestion.voice_timepoints, narrationSeconds) })}
              onJump={seek}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Right: preview + render ── */}
      <div className="space-y-3">
        <div className={`relative aspect-[9/16] w-full rounded-md overflow-hidden bg-slate-900 ${result ? 'hidden' : ''}`}>
          <canvas ref={canvasRef} className="w-full h-full" />
          {loadingPlayer && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/70 text-xs text-slate-300">Loading clips…</div>
          )}
        </div>
        {result && resultUrl && <video src={resultUrl} controls className="aspect-[9/16] w-full rounded-md bg-black" />}

        {!result && (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={togglePlay} disabled={loadingPlayer || rendering}>
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </Button>
              <input
                type="range"
                min={0}
                max={total}
                step={0.1}
                value={Math.min(currentTime, total)}
                onChange={(e) => seek(Number(e.target.value))}
                disabled={loadingPlayer || rendering}
                className="flex-1 accent-blue-600"
                aria-label="Preview position"
              />
              <span className="text-[11px] font-mono text-slate-500 w-20 text-right">{currentTime.toFixed(1)} / {total.toFixed(1)}s</span>
            </div>
            {currentTime >= main && <p className="text-[11px] text-slate-400">End card</p>}
          </div>
        )}

        {rendering && (
          <div className="space-y-1">
            <Progress value={progress * 100} />
            <p className="text-[11px] text-slate-500">Recording in real time — keep this tab open and visible.</p>
          </div>
        )}

        {!mp4Supported && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            This browser can&apos;t record MP4. Use the latest Google Chrome on a computer to render.
          </p>
        )}

        <div className="flex flex-col gap-2">
          {rendering ? (
            <Button variant="outline" onClick={() => abortRef.current?.abort()}>Cancel render</Button>
          ) : result ? (
            <>
              <Button onClick={handleSave} disabled={saving}>
                <Save className="w-4 h-4 mr-1.5" /> {saving ? 'Saving...' : 'Save to Library & Attach'}
              </Button>
              {resultUrl && (
                <a href={resultUrl} download={`syd-reel-${suggestion.id.slice(0, 8)}.mp4`}>
                  <Button variant="outline" className="w-full"><Download className="w-4 h-4 mr-1.5" /> Download MP4</Button>
                </a>
              )}
              <Button variant="ghost" onClick={() => setResult(null)} disabled={saving}>Back to editing</Button>
            </>
          ) : (
            <Button onClick={handleRender} disabled={!timeline.clips.length || !mp4Supported || loadingPlayer}>
              <Film className="w-4 h-4 mr-1.5" /> Render MP4 ({total.toFixed(0)}s)
            </Button>
          )}
        </div>
        <p className="text-[11px] text-slate-400">Your edits save automatically.</p>
      </div>
    </div>
  )
}

type MediaFilter = 'video' | 'image' | 'all'

function MediaPicker({
  media, usedCounts, keywords, disabled, uploading, onAdd, onUpload,
}: {
  media: ContentMedia[]
  usedCounts: Record<string, number>
  keywords?: string | null
  disabled?: boolean
  uploading?: boolean
  onAdd: (media: ContentMedia) => void
  onUpload: () => void
}) {
  const videoCount = media.filter((m) => m.media_type === 'video').length
  const [filter, setFilter] = useState<MediaFilter>(() => (videoCount > 0 ? 'video' : 'all'))
  const imageCount = media.length - videoCount
  const shown = filter === 'all' ? media : media.filter((m) => m.media_type === filter)
  const filters: { value: MediaFilter; label: string }[] = [
    { value: 'video', label: `Videos (${videoCount})` },
    { value: 'image', label: `Photos (${imageCount})` },
    { value: 'all', label: 'All' },
  ]

  return (
    <div className="space-y-2 rounded-md border p-3 bg-slate-50/60">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm font-medium text-slate-700">Add clips</p>
        <Button size="sm" className="h-8 text-xs gap-1" onClick={onUpload} disabled={disabled || uploading}>
          <Upload className="w-3.5 h-3.5" /> {uploading ? 'Uploading...' : 'Upload your own video or photo'}
        </Button>
      </div>
      <div className="flex gap-1">
        {filters.map((f) => (
          <Button key={f.value} size="sm" variant={filter === f.value ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => setFilter(f.value)}>
            {f.label}
          </Button>
        ))}
      </div>
      {keywords && (
        <p className="text-[11px] text-slate-500">
          Need more clips? Search stock in Marketing → Library for: <span className="font-medium">{keywords}</span>
        </p>
      )}

      {shown.length === 0 ? (
        <p className="text-xs text-slate-400 py-6 text-center">
          No {filter === 'image' ? 'photos' : filter === 'video' ? 'videos' : 'media'} in the library yet — upload your own above.
        </p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-5 gap-2 max-h-[380px] overflow-y-auto pr-1">
          {shown.map((m) => {
            const url = getContentMediaUrl(m.storage_key)
            const uses = usedCounts[m.id] ?? 0
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onAdd(m)}
                disabled={disabled}
                className="group text-left space-y-1"
                title={`Add ${m.original_filename}`}
              >
                <div className={`relative aspect-[9/16] rounded-md overflow-hidden bg-slate-200 ring-2 transition ${uses ? 'ring-blue-500' : 'ring-transparent group-hover:ring-slate-400'}`}>
                  {m.media_type === 'video' ? (
                    <video
                      src={url}
                      className="w-full h-full object-cover"
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      onMouseEnter={(e) => { e.currentTarget.play().catch(() => {}) }}
                      onMouseLeave={(e) => { e.currentTarget.pause() }}
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                  )}
                  {m.media_type === 'video' && (
                    <span className="absolute bottom-1 left-1 text-[10px] bg-black/70 text-white rounded px-1.5 py-0.5 flex items-center gap-1">
                      <Film className="w-3 h-3" /> {m.duration_seconds ? `${m.duration_seconds.toFixed(0)}s` : 'video'}
                    </span>
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white text-xs font-semibold opacity-0 group-hover:opacity-100 transition">
                    + Add
                  </span>
                  {uses > 0 && (
                    <span className="absolute top-1 right-1 min-w-5 h-5 px-1 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">
                      {uses}×
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-600 truncate">{m.original_filename}</p>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

const CLIP_COLORS =['bg-sky-400', 'bg-violet-400', 'bg-emerald-400', 'bg-amber-400', 'bg-rose-400', 'bg-teal-400']

function TimelineBar({
  timeline, narrationSeconds, total, currentTime, onSeek,
}: { timeline: ReelTimeline; narrationSeconds: number; total: number; currentTime: number; onSeek: (t: number) => void }) {
  const main = contentLength(timeline, narrationSeconds)
  const pct = (s: number) => `${(s / total) * 100}%`
  const clipsSum = timeline.clips.reduce((s, c) => s + c.duration, 0)

  return (
    <div className="space-y-1">
      <div
        className="relative h-9 rounded-md bg-slate-100 overflow-hidden cursor-pointer"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          onSeek(((e.clientX - rect.left) / rect.width) * total)
        }}
        title="Click to jump the preview"
      >
        <div className="absolute inset-y-0 left-0 flex" style={{ width: pct(Math.max(clipsSum, 0)) }}>
          {timeline.clips.map((c, i) => (
            <div
              key={`${c.mediaId}-${i}`}
              className={`${CLIP_COLORS[i % CLIP_COLORS.length]} h-full border-r border-white/70 text-[10px] text-white font-semibold px-1 truncate leading-9`}
              style={{ width: `${(c.duration / Math.max(clipsSum, 0.01)) * 100}%` }}
            >
              {i + 1}
            </div>
          ))}
        </div>
        {clipsSum < main && timeline.clips.length > 0 && (
          <div
            className="absolute inset-y-0 bg-[repeating-linear-gradient(45deg,#cbd5e1,#cbd5e1_4px,#e2e8f0_4px,#e2e8f0_8px)]"
            style={{ left: pct(clipsSum), width: pct(main - clipsSum) }}
            title="Last clip keeps playing to cover the narration"
          />
        )}
        <div className="absolute inset-y-0 bg-slate-800 text-[10px] text-white flex items-center justify-center" style={{ left: pct(main), width: pct(END_CARD_SECONDS) }}>
          End
        </div>
        <div className="absolute inset-y-0 w-px bg-red-500" style={{ left: pct(narrationSeconds) }} title="Narration ends" />
        <div className="absolute inset-y-0 w-0.5 bg-slate-900" style={{ left: pct(Math.min(currentTime, total)) }} />
      </div>
      <div className="flex justify-between text-[10px] text-slate-400">
        <span>0s</span>
        <span className="text-red-500">narration ends {narrationSeconds.toFixed(1)}s</span>
        <span>{total.toFixed(1)}s</span>
      </div>
    </div>
  )
}
