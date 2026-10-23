'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Download, Film, Save, X } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useContentMedia, useCreateContentMedia, getContentMediaUrl, type ContentMedia } from '@/hooks/useContentMedia'
import { useAttachCreativeMedia, type ContentSuggestion } from '@/hooks/useContentSuggestions'
import { renderReel, getSupportedReelMimeType, type RenderedReel } from '@/lib/marketing/reel-renderer'

interface ReelBuilderDialogProps {
  suggestion: ContentSuggestion
  narrationUrl: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Picks library clips/images for a reel suggestion, renders them under the
 * narration with burned-in subtitles (see lib/marketing/reel-renderer.ts),
 * and saves the MP4 back to the library as the suggestion's creative.
 */
export function ReelBuilderDialog({ suggestion, narrationUrl, open, onOpenChange }: ReelBuilderDialogProps) {
  const { data: mediaList = [] } = useContentMedia()
  const createMedia = useCreateContentMedia()
  const attachCreative = useAttachCreativeMedia()

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [selected, setSelected] = useState<ContentMedia[]>([])
  const [progress, setProgress] = useState(0)
  const [rendering, setRendering] = useState(false)
  const [result, setResult] = useState<RenderedReel | null>(null)
  const [saving, setSaving] = useState(false)

  const visualMedia = useMemo(() => mediaList.filter((m) => m.media_type === 'image' || m.media_type === 'video'), [mediaList])
  const resultUrl = useMemo(() => (result ? URL.createObjectURL(result.blob) : null), [result])
  const mp4Supported = useMemo(() => getSupportedReelMimeType() !== null, [])

  useEffect(() => () => { if (resultUrl) URL.revokeObjectURL(resultUrl) }, [resultUrl])
  useEffect(() => () => abortRef.current?.abort(), [])

  function toggle(media: ContentMedia) {
    setResult(null)
    setSelected((prev) => (prev.some((m) => m.id === media.id) ? prev.filter((m) => m.id !== media.id) : [...prev, media]))
  }

  function move(index: number, delta: number) {
    setResult(null)
    setSelected((prev) => {
      const next = [...prev]
      const target = index + delta
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  async function handleRender() {
    if (!canvasRef.current) return
    const controller = new AbortController()
    abortRef.current = controller
    setRendering(true)
    setResult(null)
    setProgress(0)
    try {
      const rendered = await renderReel({
        canvas: canvasRef.current,
        clips: selected.map((m) => ({ url: getContentMediaUrl(m.storage_key), type: m.media_type === 'video' ? 'video' : 'image' })),
        narrationUrl,
        voiceScript: suggestion.voice_script ?? '',
        timepoints: suggestion.voice_timepoints,
        logoUrl: '/syd-logo-mark.png',
        onProgress: setProgress,
        signal: controller.signal,
      })
      setResult(rendered)
      toast.success('Reel rendered — preview it below')
    } catch (e) {
      const err = e instanceof Error ? e : null
      if (err?.name !== 'AbortError') toast.error(err?.message || 'Failed to render the reel')
    } finally {
      setRendering(false)
      abortRef.current = null
    }
  }

  async function handleSave() {
    if (!result) return
    setSaving(true)
    try {
      const filename = `reel-${Date.now()}.mp4`
      const presignRes = await fetch('/api/media/presign-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, contentType: result.mimeType }),
      })
      const presignData = await presignRes.json()
      if (!presignRes.ok) throw new Error(presignData.error || 'Failed to get upload URL')

      const putRes = await fetch(presignData.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': result.mimeType },
        body: result.blob,
      })
      if (!putRes.ok) throw new Error('Upload to storage failed')

      const media = await createMedia.mutateAsync({
        media_type: 'video',
        storage_key: presignData.key,
        original_filename: filename,
        mime_type: result.mimeType,
        size_bytes: result.blob.size,
        duration_seconds: Math.round(result.durationSeconds * 100) / 100,
      })
      await attachCreative.mutateAsync({ id: suggestion.id, creative_media_id: media.id })
      toast.success('Reel saved to the library and attached')
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save the reel')
    } finally {
      setSaving(false)
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next && rendering) abortRef.current?.abort()
    onOpenChange(next)
  }

  const keywords = suggestion.source_idea?.stock_keywords

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Film className="w-5 h-5" /> Build Reel</DialogTitle>
          <DialogDescription>
            Pick clips in the order they should play. They share the narration time evenly, then an SYD end card closes the reel.
          </DialogDescription>
        </DialogHeader>

        {!mp4Supported && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            This browser can&apos;t record MP4 video. Open this page in the latest Google Chrome on a computer.
          </p>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
          <div className="space-y-4 min-w-0">
            {keywords && (
              <p className="text-xs text-slate-500">
                Suggested stock search: <span className="font-medium text-slate-700">{keywords}</span> — add clips from Marketing → Library first.
              </p>
            )}

            <div>
              <p className="text-xs font-medium text-slate-600 mb-2">Selected ({selected.length})</p>
              {selected.length === 0 ? (
                <p className="text-xs text-slate-400 border border-dashed rounded-md px-3 py-4 text-center">
                  Tap clips below to add them. 3–5 clips works well for a 20-second reel.
                </p>
              ) : (
                <ol className="space-y-1.5">
                  {selected.map((m, i) => (
                    <li key={m.id} className="flex items-center gap-2 border rounded-md px-2 py-1.5 text-xs">
                      <span className="w-5 text-slate-400 font-mono">{i + 1}</span>
                      <span className="flex-1 truncate">{m.original_filename}</span>
                      <span className="text-slate-400 uppercase text-[10px]">{m.media_type}</span>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => move(i, -1)} disabled={i === 0 || rendering}>
                        <ArrowUp className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => move(i, 1)} disabled={i === selected.length - 1 || rendering}>
                        <ArrowDown className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => toggle(m)} disabled={rendering}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div>
              <p className="text-xs font-medium text-slate-600 mb-2">Library</p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[320px] overflow-y-auto pr-1">
                {visualMedia.map((m) => {
                  const url = getContentMediaUrl(m.storage_key)
                  const index = selected.findIndex((s) => s.id === m.id)
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggle(m)}
                      disabled={rendering}
                      className={`relative aspect-[9/16] rounded-md overflow-hidden bg-slate-100 ring-2 transition ${
                        index !== -1 ? 'ring-blue-500' : 'ring-transparent hover:ring-slate-300'
                      }`}
                      title={m.original_filename}
                    >
                      {m.media_type === 'video' ? (
                        <video src={url} className="w-full h-full object-cover" muted preload="metadata" />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                      )}
                      {m.media_type === 'video' && (
                        <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white rounded px-1">video</span>
                      )}
                      {index !== -1 && (
                        <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">
                          {index + 1}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {/* The canvas is the recording surface; shown scaled down as a live preview while rendering. */}
            <div className={`aspect-[9/16] w-full rounded-md overflow-hidden bg-slate-900 ${result ? 'hidden' : ''}`}>
              <canvas ref={canvasRef} className="w-full h-full" />
            </div>
            {result && resultUrl && (
              <video src={resultUrl} controls className="aspect-[9/16] w-full rounded-md bg-black" />
            )}

            {rendering && (
              <div className="space-y-1">
                <Progress value={progress * 100} />
                <p className="text-[11px] text-slate-500">Recording in real time — keep this tab open and visible.</p>
              </div>
            )}

            <div className="flex flex-col gap-2">
              {rendering ? (
                <Button variant="outline" onClick={() => abortRef.current?.abort()}>Cancel</Button>
              ) : (
                <Button onClick={handleRender} disabled={!selected.length || !mp4Supported || saving}>
                  <Film className="w-4 h-4 mr-1.5" /> {result ? 'Render Again' : 'Render Reel'}
                </Button>
              )}
              {result && resultUrl && !rendering && (
                <>
                  <Button onClick={handleSave} disabled={saving}>
                    <Save className="w-4 h-4 mr-1.5" /> {saving ? 'Saving...' : 'Save to Library & Attach'}
                  </Button>
                  <a href={resultUrl} download={`syd-reel-${suggestion.id.slice(0, 8)}.mp4`}>
                    <Button variant="outline" className="w-full">
                      <Download className="w-4 h-4 mr-1.5" /> Download MP4
                    </Button>
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
