// The editable description of a reel: which library clips play, in what
// order, for how long and from which point, plus the on-screen captions.
// Saved as content_suggestions.reel_timeline so a reel can be reopened and
// edited; the renderer (reel-renderer.ts) plays it back for both the
// preview and the final MP4.

import { splitIntoCaptionChunks } from '@/lib/marketing/captions'
import type { VoiceTimepoint } from '@/hooks/useContentSuggestions'
import type { ContentMedia } from '@/hooks/useContentMedia'

export const END_CARD_SECONDS = 2.5
export const MIN_CLIP_SECONDS = 0.5

export interface ReelTimelineClip {
  mediaId: string
  storageKey: string
  filename: string
  type: 'image' | 'video'
  /** Seconds this clip is on screen. */
  duration: number
  /** Videos only: where in the source video playback starts (seconds). */
  trimStart: number
  /** Videos only: mix the clip's own sound under the narration. */
  keepSound: boolean
  /** Videos only: length of the source video, when known. */
  sourceDuration: number | null
}

export interface ReelCaption {
  text: string
  start: number
  end: number
}

export interface ReelTimeline {
  version: 1
  /** The narration audio the captions were timed against — when the
   * narration is re-synthesized, captions are rebuilt from the new timing. */
  voiceMediaId: string | null
  clips: ReelTimelineClip[]
  captions: ReelCaption[]
  showCaptions: boolean
}

const round = (n: number) => Math.round(n * 100) / 100

/** Recomputes each caption's end as the next caption's start (the last one
 * runs to the end of the narration), after sorting by start time. */
export function normalizeCaptions(captions: ReelCaption[], narrationSeconds: number): ReelCaption[] {
  const sorted = [...captions]
    .map((c) => ({ ...c, start: Math.max(0, round(c.start)) }))
    .sort((a, b) => a.start - b.start)
  return sorted.map((c, i) => ({ ...c, end: sorted[i + 1]?.start ?? Math.max(narrationSeconds, c.start + 0.5) }))
}

/** Captions from the narration's TTS timepoints, or — for narration made
 * before timepoints existed — spread across the audio by character count. */
export function buildDefaultCaptions(
  voiceScript: string,
  timepoints: VoiceTimepoint[] | null,
  narrationSeconds: number
): ReelCaption[] {
  if (timepoints?.length) {
    return normalizeCaptions(timepoints.map((tp) => ({ text: tp.text, start: tp.start, end: 0 })), narrationSeconds)
  }
  const chunks = splitIntoCaptionChunks(voiceScript)
  const totalChars = chunks.reduce((sum, c) => sum + c.length, 0) || 1
  let cursor = 0
  return chunks.map((text) => {
    const length = (text.length / totalChars) * narrationSeconds
    const caption = { text, start: round(cursor), end: round(cursor + length) }
    cursor += length
    return caption
  })
}

export function makeClip(media: ContentMedia, duration: number): ReelTimelineClip {
  const isVideo = media.media_type === 'video'
  return {
    mediaId: media.id,
    storageKey: media.storage_key,
    filename: media.original_filename,
    type: isVideo ? 'video' : 'image',
    duration: round(Math.max(MIN_CLIP_SECONDS, duration)),
    trimStart: 0,
    keepSound: false,
    sourceDuration: isVideo ? media.duration_seconds : null,
  }
}

/** Splits the narration evenly across the clips (the "auto" timing). */
export function spreadClipsEvenly(clips: ReelTimelineClip[], narrationSeconds: number): ReelTimelineClip[] {
  if (!clips.length) return clips
  const each = Math.max(MIN_CLIP_SECONDS, narrationSeconds / clips.length)
  return clips.map((c) => ({ ...c, duration: round(each), trimStart: clampTrim(c, each, c.trimStart) }))
}

/** Latest trim start that still leaves `duration` seconds of source video. */
export function maxTrimStart(clip: ReelTimelineClip, duration = clip.duration): number {
  if (clip.type !== 'video' || !clip.sourceDuration) return 0
  return round(Math.max(0, clip.sourceDuration - duration))
}

export function clampTrim(clip: ReelTimelineClip, duration: number, trimStart: number): number {
  return round(Math.min(Math.max(0, trimStart), maxTrimStart(clip, duration)))
}

export function clipsTotal(timeline: ReelTimeline): number {
  return timeline.clips.reduce((sum, c) => sum + c.duration, 0)
}

/** Length of the main part (before the end card): the longer of the
 * narration and the clips. */
export function contentLength(timeline: ReelTimeline, narrationSeconds: number): number {
  return Math.max(narrationSeconds, clipsTotal(timeline))
}

export function totalLength(timeline: ReelTimeline, narrationSeconds: number): number {
  return contentLength(timeline, narrationSeconds) + END_CARD_SECONDS
}

/** Which clip is on screen at time t, and how far into it. If the clips are
 * shorter than the narration, the last clip keeps going (videos loop). */
export function clipAt(timeline: ReelTimeline, t: number): { index: number; offset: number } {
  let cursor = 0
  for (let i = 0; i < timeline.clips.length; i++) {
    const d = timeline.clips[i].duration
    if (t < cursor + d || i === timeline.clips.length - 1) return { index: i, offset: Math.max(0, t - cursor) }
    cursor += d
  }
  return { index: -1, offset: 0 }
}

export function captionAt(timeline: ReelTimeline, t: number): ReelCaption | undefined {
  if (!timeline.showCaptions) return undefined
  return timeline.captions.find((c) => t >= c.start && t < c.end)
}

export function emptyTimeline(voiceMediaId: string | null, captions: ReelCaption[]): ReelTimeline {
  return { version: 1, voiceMediaId, clips: [], captions, showCaptions: true }
}
