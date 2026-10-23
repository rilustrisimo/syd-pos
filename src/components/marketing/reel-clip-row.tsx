'use client'

import { ArrowDown, ArrowUp, Volume2, VolumeX, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SecondsField } from '@/components/marketing/seconds-field'
import {
  MIN_CLIP_SECONDS,
  clampTrim,
  maxTrimStart,
  type ReelTimelineClip,
} from '@/lib/marketing/reel-timeline'

interface ReelClipRowProps {
  clip: ReelTimelineClip
  index: number
  count: number
  thumbUrl: string
  startsAt: number
  disabled?: boolean
  onChange: (clip: ReelTimelineClip) => void
  onMove: (delta: number) => void
  onRemove: () => void
  onJump: () => void
}

export function ReelClipRow({ clip, index, count, thumbUrl, startsAt, disabled, onChange, onMove, onRemove, onJump }: ReelClipRowProps) {
  const isVideo = clip.type === 'video'
  const maxLength = isVideo && clip.sourceDuration ? clip.sourceDuration : 60

  return (
    <li className="flex gap-2 border rounded-md p-2 bg-white">
      <button type="button" onClick={onJump} className="w-12 h-20 rounded overflow-hidden bg-slate-100 flex-shrink-0" title="Jump preview here">
        {isVideo ? (
          <video src={thumbUrl} className="w-full h-full object-cover" muted preload="metadata" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
        )}
      </button>

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-mono text-slate-400">{index + 1}</span>
          <span className="text-xs font-medium truncate flex-1" title={clip.filename}>{clip.filename}</span>
          <span className="text-[10px] text-slate-400">@{startsAt.toFixed(1)}s</span>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => onMove(-1)} disabled={disabled || index === 0}>
            <ArrowUp className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => onMove(1)} disabled={disabled || index === count - 1}>
            <ArrowDown className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={onRemove} disabled={disabled}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>

        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-slate-500 w-11">Length</span>
            <SecondsField
              value={clip.duration}
              min={MIN_CLIP_SECONDS}
              max={maxLength}
              disabled={disabled}
              label="Clip length"
              onChange={(duration) => onChange({ ...clip, duration, trimStart: clampTrim(clip, duration, clip.trimStart) })}
            />
          </div>
          {isVideo && (
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-slate-500 w-11">Start at</span>
              <SecondsField
                value={clip.trimStart}
                max={maxTrimStart(clip)}
                disabled={disabled || maxTrimStart(clip) === 0}
                label="Start point in the video"
                onChange={(trimStart) => onChange({ ...clip, trimStart })}
              />
            </div>
          )}
          {isVideo && (
            <Button
              size="sm"
              variant={clip.keepSound ? 'secondary' : 'ghost'}
              className="h-7 text-[11px] gap-1 px-2"
              disabled={disabled}
              onClick={() => onChange({ ...clip, keepSound: !clip.keepSound })}
              title="Mix this clip's own sound under the narration"
            >
              {clip.keepSound ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              {clip.keepSound ? 'Clip sound on' : 'Clip sound off'}
            </Button>
          )}
        </div>
        {isVideo && clip.sourceDuration != null && (
          <p className="text-[10px] text-slate-400">
            Uses {clip.trimStart.toFixed(1)}s–{Math.min(clip.trimStart + clip.duration, clip.sourceDuration).toFixed(1)}s of a {clip.sourceDuration.toFixed(1)}s video
          </p>
        )}
      </div>
    </li>
  )
}
