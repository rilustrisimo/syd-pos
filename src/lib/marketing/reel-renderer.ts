// Renders a vertical reel (1080x1920 MP4) in the browser: the chosen
// library clips/images play back-to-back under the synthesized narration,
// with the voice script burned in as subtitles and an SYD end card.
//
// Done client-side on purpose — Vercel functions can't practically run
// ffmpeg, and hosted video renderers cost money. The canvas is recorded in
// real time with MediaRecorder, so rendering takes as long as the reel
// itself and the tab must stay visible (browsers throttle hidden tabs).
// R2's public domain sends CORS headers for the app origin, which is what
// keeps the canvas exportable when it draws R2 media.

import { splitIntoCaptionChunks } from '@/lib/marketing/captions'
import type { VoiceTimepoint } from '@/hooks/useContentSuggestions'

export const REEL_WIDTH = 1080
export const REEL_HEIGHT = 1920
const FPS = 30
const END_CARD_SECONDS = 2.5
const BRAND_DARK = '#0f172a'
const BRAND_YELLOW = '#ffc107'
const FONT = 'Inter, "Helvetica Neue", Arial, sans-serif'

const MP4_MIME_TYPES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4',
]

export interface ReelClip {
  url: string
  type: 'image' | 'video'
}

export interface RenderReelOptions {
  canvas: HTMLCanvasElement
  clips: ReelClip[]
  narrationUrl: string
  voiceScript: string
  timepoints: VoiceTimepoint[] | null
  logoUrl: string
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

export interface RenderedReel {
  blob: Blob
  mimeType: string
  durationSeconds: number
}

export function getSupportedReelMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  return MP4_MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null
}

interface TimedCaption {
  text: string
  start: number
  end: number
}

// Caption i shows from its own start until the next one starts; without
// timepoints, chunks are spread across the narration by character count.
function buildCaptionTimeline(
  voiceScript: string,
  timepoints: VoiceTimepoint[] | null,
  narrationSeconds: number
): TimedCaption[] {
  if (timepoints?.length) {
    return timepoints.map((tp, i) => ({
      text: tp.text,
      start: tp.start,
      end: timepoints[i + 1]?.start ?? narrationSeconds,
    }))
  }
  const chunks = splitIntoCaptionChunks(voiceScript)
  const totalChars = chunks.reduce((sum, c) => sum + c.length, 0) || 1
  let cursor = 0
  return chunks.map((text) => {
    const length = (text.length / totalChars) * narrationSeconds
    const caption = { text, start: cursor, end: cursor + length }
    cursor += length
    return caption
  })
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Could not load image: ${url}`))
    img.src = url
  })
}

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.muted = true
    video.playsInline = true
    video.loop = true
    video.preload = 'auto'
    video.oncanplay = () => resolve(video)
    video.onerror = () => reject(new Error(`Could not load video: ${url}`))
    video.src = url
    video.load()
  })
}

function loadAudio(url: string): Promise<HTMLAudioElement> {
  return new Promise((resolve, reject) => {
    const audio = new Audio()
    audio.crossOrigin = 'anonymous'
    audio.preload = 'auto'
    audio.oncanplaythrough = () => resolve(audio)
    audio.onerror = () => reject(new Error('Could not load the narration audio'))
    audio.src = url
    audio.load()
  })
}

// Scales the source to fill the frame (like CSS object-fit: cover), with an
// optional zoom for the slow push-in on still images.
function drawCover(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  zoom = 1
) {
  if (!sourceWidth || !sourceHeight) return
  const scale = Math.max(REEL_WIDTH / sourceWidth, REEL_HEIGHT / sourceHeight) * zoom
  const w = sourceWidth * scale
  const h = sourceHeight * scale
  ctx.drawImage(source, (REEL_WIDTH - w) / 2, (REEL_HEIGHT - h) / 2, w, h)
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)
  return lines
}

function drawCaption(ctx: CanvasRenderingContext2D, text: string) {
  const fontSize = 66
  const lineHeight = fontSize * 1.22
  const paddingX = 44
  const paddingY = 30
  ctx.font = `800 ${fontSize}px ${FONT}`
  const lines = wrapLines(ctx, text, REEL_WIDTH - 220)
  const textWidth = Math.max(...lines.map((l) => ctx.measureText(l).width))
  const boxWidth = textWidth + paddingX * 2
  const boxHeight = lines.length * lineHeight + paddingY * 2
  const x = (REEL_WIDTH - boxWidth) / 2
  const y = REEL_HEIGHT * 0.68

  ctx.fillStyle = 'rgba(15, 23, 42, 0.86)'
  ctx.beginPath()
  ctx.roundRect(x, y, boxWidth, boxHeight, 28)
  ctx.fill()
  ctx.fillStyle = BRAND_YELLOW
  ctx.fillRect(x, y + 22, 10, boxHeight - 44)

  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  lines.forEach((l, i) => ctx.fillText(l, REEL_WIDTH / 2, y + paddingY + i * lineHeight + 4))
}

function drawWatermark(ctx: CanvasRenderingContext2D, logo: HTMLImageElement) {
  const h = 90
  const w = (logo.naturalWidth / logo.naturalHeight) * h
  ctx.globalAlpha = 0.92
  ctx.drawImage(logo, 60, 80, w, h)
  ctx.globalAlpha = 1
}

function drawEndCard(ctx: CanvasRenderingContext2D, logo: HTMLImageElement) {
  ctx.fillStyle = BRAND_DARK
  ctx.fillRect(0, 0, REEL_WIDTH, REEL_HEIGHT)

  const logoHeight = 260
  const logoWidth = (logo.naturalWidth / logo.naturalHeight) * logoHeight
  ctx.drawImage(logo, (REEL_WIDTH - logoWidth) / 2, 520, logoWidth, logoHeight)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillStyle = BRAND_YELLOW
  ctx.font = `800 70px ${FONT}`
  ctx.fillText('Request a quote', REEL_WIDTH / 2, 900)
  ctx.fillStyle = '#ffffff'
  ctx.font = `800 84px ${FONT}`
  ctx.fillText('sydconstruct.com', REEL_WIDTH / 2, 1000)
  ctx.fillStyle = '#94a3b8'
  ctx.font = `600 44px ${FONT}`
  ctx.fillText('COD within 5km · Talakag, Bukidnon', REEL_WIDTH / 2, 1140)
}

export async function renderReel(opts: RenderReelOptions): Promise<RenderedReel> {
  const mimeType = getSupportedReelMimeType()
  if (!mimeType) {
    throw new Error('This browser cannot record MP4 video. Use the latest Google Chrome on a computer.')
  }
  if (!opts.clips.length) throw new Error('Pick at least one clip or image first.')

  const { canvas } = opts
  canvas.width = REEL_WIDTH
  canvas.height = REEL_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available in this browser.')

  const [audio, logo, ...sources] = await Promise.all([
    loadAudio(opts.narrationUrl),
    loadImage(opts.logoUrl),
    ...opts.clips.map((c) => (c.type === 'video' ? loadVideo(c.url) : loadImage(c.url))),
  ])

  const narrationSeconds = audio.duration
  if (!Number.isFinite(narrationSeconds) || narrationSeconds <= 0) {
    throw new Error('Could not read the narration length.')
  }
  const totalSeconds = narrationSeconds + END_CARD_SECONDS
  const segmentSeconds = narrationSeconds / sources.length
  const captions = buildCaptionTimeline(opts.voiceScript, opts.timepoints, narrationSeconds)

  const audioCtx = new AudioContext()
  const audioSource = audioCtx.createMediaElementSource(audio)
  const audioDest = audioCtx.createMediaStreamDestination()
  audioSource.connect(audioDest)
  audioSource.connect(audioCtx.destination)

  const stream = canvas.captureStream(FPS)
  audioDest.stream.getAudioTracks().forEach((t) => stream.addTrack(t))
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
  const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve() })

  let activeSegment = -1
  let rafId = 0
  let aborted = false

  const cleanup = () => {
    cancelAnimationFrame(rafId)
    audio.pause()
    sources.forEach((s) => { if (s instanceof HTMLVideoElement) s.pause() })
    stream.getTracks().forEach((t) => t.stop())
    audioCtx.close().catch(() => {})
  }

  const onAbort = () => {
    aborted = true
    if (recorder.state !== 'inactive') recorder.stop()
  }
  opts.signal?.addEventListener('abort', onAbort)

  // Paint the first frame before recording so the video doesn't open black.
  const first = sources[0]
  if (first instanceof HTMLVideoElement) drawCover(ctx, first, first.videoWidth, first.videoHeight)
  else drawCover(ctx, first, first.naturalWidth, first.naturalHeight)

  await audioCtx.resume()
  recorder.start(250)
  const t0 = performance.now()
  await audio.play()

  await new Promise<void>((resolve) => {
    const frame = () => {
      if (aborted) return resolve()
      const t = (performance.now() - t0) / 1000
      opts.onProgress?.(Math.min(t / totalSeconds, 1))

      if (t >= totalSeconds) {
        if (recorder.state !== 'inactive') recorder.stop()
        return resolve()
      }

      if (t >= narrationSeconds) {
        drawEndCard(ctx, logo)
      } else {
        const segment = Math.min(Math.floor(t / segmentSeconds), sources.length - 1)
        const source = sources[segment]
        if (segment !== activeSegment) {
          const previous = sources[activeSegment]
          if (previous instanceof HTMLVideoElement) previous.pause()
          if (source instanceof HTMLVideoElement) {
            source.currentTime = 0
            source.play().catch(() => {})
          }
          activeSegment = segment
        }

        ctx.fillStyle = '#000000'
        ctx.fillRect(0, 0, REEL_WIDTH, REEL_HEIGHT)
        if (source instanceof HTMLVideoElement) {
          drawCover(ctx, source, source.videoWidth, source.videoHeight)
        } else {
          const progress = (t - segment * segmentSeconds) / segmentSeconds
          drawCover(ctx, source, source.naturalWidth, source.naturalHeight, 1 + 0.12 * progress)
        }

        drawWatermark(ctx, logo)
        const caption = captions.find((c) => t >= c.start && t < c.end)
        if (caption) drawCaption(ctx, caption.text)
      }

      rafId = requestAnimationFrame(frame)
    }
    rafId = requestAnimationFrame(frame)
  })

  await stopped
  opts.signal?.removeEventListener('abort', onAbort)
  cleanup()

  if (aborted) throw new DOMException('Render cancelled', 'AbortError')
  return {
    blob: new Blob(chunks, { type: mimeType.split(';')[0] }),
    mimeType: mimeType.split(';')[0],
    durationSeconds: totalSeconds,
  }
}
