// Plays a reel timeline (reel-timeline.ts) onto a 1080x1920 canvas in the
// browser: library clips/images under the synthesized narration, with
// captions and an SYD end card. The same player drives the editor's live
// preview (play / seek, nothing recorded) and the final render, which
// records the canvas + audio mix with MediaRecorder to an MP4.
//
// Done client-side on purpose — Vercel functions can't practically run
// ffmpeg, and hosted video renderers cost money. Rendering happens in real
// time, so the tab must stay visible (browsers throttle hidden tabs). R2's
// public domain sends CORS headers for the app origin, which is what keeps
// the canvas exportable when it draws R2 media.

import {
  captionAt,
  clipAt,
  contentLength,
  totalLength,
  type ReelTimeline,
} from '@/lib/marketing/reel-timeline'

export const REEL_WIDTH = 1080
export const REEL_HEIGHT = 1920
const FPS = 30
const CLIP_SOUND_VOLUME = 0.35
const BRAND_DARK = '#0f172a'
const BRAND_YELLOW = '#ffc107'
const FONT = 'Inter, "Helvetica Neue", Arial, sans-serif'

const MP4_MIME_TYPES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4',
]

export interface RenderedReel {
  blob: Blob
  mimeType: string
  durationSeconds: number
}

export function getSupportedReelMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  return MP4_MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null
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

function loadVideo(url: string, withSound: boolean): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    // A muted element feeds silence into the audio graph, so clips whose
    // sound is kept stay unmuted — their audio only reaches the speakers
    // through the graph (createMediaElementSource takes over output).
    video.muted = !withSound
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

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - time) < 0.02) return resolve()
    const done = () => { video.removeEventListener('seeked', done); resolve() }
    video.addEventListener('seeked', done)
    video.currentTime = time
    setTimeout(done, 1500)
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

function drawPlaceholder(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = BRAND_DARK
  ctx.fillRect(0, 0, REEL_WIDTH, REEL_HEIGHT)
  ctx.fillStyle = '#64748b'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `600 52px ${FONT}`
  ctx.fillText('Add clips to start', REEL_WIDTH / 2, REEL_HEIGHT / 2)
}

export interface ReelPlayerOptions {
  canvas: HTMLCanvasElement
  timeline: ReelTimeline
  /** Public URL for each clip's storage key. */
  resolveUrl: (storageKey: string) => string
  narrationUrl: string
  logoUrl: string
  onTime?: (seconds: number) => void
  onEnded?: () => void
}

/**
 * Loads a timeline's media once and plays it onto the canvas. Changes to
 * clip lengths, trims and captions can be applied live with
 * setTimeline(); changing which clips are used (or their keep-sound
 * setting) needs a new player, since media elements are bound to the audio
 * graph at load time.
 */
export class ReelPlayer {
  private ctx: CanvasRenderingContext2D
  private timeline: ReelTimeline
  private audio!: HTMLAudioElement
  private logo!: HTMLImageElement
  private sources: (HTMLImageElement | HTMLVideoElement)[] = []
  private audioCtx!: AudioContext
  private recordDest!: MediaStreamAudioDestinationNode
  private activeIndex = -1
  private rafId = 0
  private clockStart = 0
  private clockOffset = 0
  private playing = false
  private finishPlayback: (() => void) | null = null
  narrationSeconds = 0

  private constructor(private opts: ReelPlayerOptions) {
    const ctx = opts.canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is not available in this browser.')
    this.ctx = ctx
    this.timeline = opts.timeline
    opts.canvas.width = REEL_WIDTH
    opts.canvas.height = REEL_HEIGHT
  }

  static async load(opts: ReelPlayerOptions): Promise<ReelPlayer> {
    const player = new ReelPlayer(opts)
    const [audio, logo, ...sources] = await Promise.all([
      loadAudio(opts.narrationUrl),
      loadImage(opts.logoUrl),
      ...opts.timeline.clips.map((c) =>
        c.type === 'video' ? loadVideo(opts.resolveUrl(c.storageKey), c.keepSound) : loadImage(opts.resolveUrl(c.storageKey))
      ),
    ])
    player.audio = audio
    player.logo = logo
    player.sources = sources
    player.narrationSeconds = Number.isFinite(audio.duration) ? audio.duration : 0
    if (!player.narrationSeconds) throw new Error('Could not read the narration length.')

    // Narration and any kept clip sound mix into both the speakers (for the
    // preview) and a stream destination (for recording).
    player.audioCtx = new AudioContext()
    player.recordDest = player.audioCtx.createMediaStreamDestination()
    const narration = player.audioCtx.createMediaElementSource(audio)
    narration.connect(player.recordDest)
    narration.connect(player.audioCtx.destination)
    opts.timeline.clips.forEach((clip, i) => {
      const el = sources[i]
      if (clip.keepSound && el instanceof HTMLVideoElement) {
        const gain = player.audioCtx.createGain()
        gain.gain.value = CLIP_SOUND_VOLUME
        player.audioCtx.createMediaElementSource(el).connect(gain)
        gain.connect(player.recordDest)
        gain.connect(player.audioCtx.destination)
      }
    })

    await player.seek(0)
    return player
  }

  get duration() {
    return totalLength(this.timeline, this.narrationSeconds)
  }

  get isPlaying() {
    return this.playing
  }

  setTimeline(timeline: ReelTimeline) {
    this.timeline = timeline
    if (!this.playing) this.drawAt(this.currentTime())
  }

  currentTime() {
    return this.playing ? this.clockOffset + (performance.now() - this.clockStart) / 1000 : this.clockOffset
  }

  /** Shows the frame at time t (paused). */
  async seek(t: number) {
    this.pause()
    const time = Math.min(Math.max(0, t), this.duration)
    this.clockOffset = time
    await this.positionVideoFor(time, false)
    this.drawAt(time)
    this.opts.onTime?.(time)
  }

  /** Plays from the current position in real time. Resolves when it reaches
   * the end or is paused. */
  async play(): Promise<void> {
    if (this.playing) return
    if (this.clockOffset >= this.duration - 0.05) await this.seek(0)
    await this.audioCtx.resume()
    const from = this.clockOffset

    this.activeIndex = -1
    await this.positionVideoFor(from, true)
    if (from < this.narrationSeconds) {
      this.audio.currentTime = from
      await this.audio.play()
    }
    this.playing = true
    this.clockStart = performance.now()

    await new Promise<void>((resolve) => {
      this.finishPlayback = resolve
      const frame = () => {
        if (!this.playing) return
        const t = this.currentTime()
        if (t >= this.duration) {
          this.clockOffset = this.duration
          this.stopMedia()
          this.playing = false
          this.drawAt(this.duration - 0.01)
          this.opts.onTime?.(this.duration)
          this.opts.onEnded?.()
          this.finishPlayback = null
          return resolve()
        }
        this.syncVideo(t)
        this.drawAt(t)
        this.opts.onTime?.(t)
        this.rafId = requestAnimationFrame(frame)
      }
      this.rafId = requestAnimationFrame(frame)
    })
  }

  pause() {
    if (!this.playing) return
    this.clockOffset = this.currentTime()
    this.playing = false
    cancelAnimationFrame(this.rafId)
    this.stopMedia()
    this.finishPlayback?.()
    this.finishPlayback = null
  }

  /** Plays the whole reel from the start while recording it to an MP4. */
  async record(onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<RenderedReel> {
    const mimeType = getSupportedReelMimeType()
    if (!mimeType) throw new Error('This browser cannot record MP4 video. Use the latest Google Chrome on a computer.')
    if (!this.timeline.clips.length) throw new Error('Add at least one clip first.')

    await this.seek(0)
    const stream = this.opts.canvas.captureStream(FPS)
    this.recordDest.stream.getAudioTracks().forEach((t) => stream.addTrack(t))
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 })
    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
    const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve() })

    let aborted = false
    const onAbort = () => { aborted = true; this.pause() }
    signal?.addEventListener('abort', onAbort)
    const stopProgress = this.opts.onTime
    const total = this.duration
    this.opts.onTime = (t) => { stopProgress?.(t); onProgress?.(Math.min(t / total, 1)) }

    try {
      recorder.start(250)
      await this.play()
      recorder.stop()
      await stopped
    } finally {
      this.opts.onTime = stopProgress
      signal?.removeEventListener('abort', onAbort)
      stream.getVideoTracks().forEach((t) => t.stop())
    }

    if (aborted) throw new DOMException('Render cancelled', 'AbortError')
    const type = mimeType.split(';')[0]
    return { blob: new Blob(chunks, { type }), mimeType: type, durationSeconds: total }
  }

  dispose() {
    this.pause()
    this.sources.forEach((s) => { if (s instanceof HTMLVideoElement) s.removeAttribute('src') })
    this.audio?.removeAttribute('src')
    this.audioCtx?.close().catch(() => {})
  }

  private stopMedia() {
    this.audio.pause()
    this.sources.forEach((s) => { if (s instanceof HTMLVideoElement) s.pause() })
  }

  /** Where in its source the clip on screen at time t should be. */
  private sourceTimeFor(t: number): { index: number; time: number } {
    const { index, offset } = clipAt(this.timeline, Math.min(t, contentLength(this.timeline, this.narrationSeconds) - 0.001))
    const clip = this.timeline.clips[index]
    if (!clip || clip.type !== 'video') return { index, time: 0 }
    const el = this.sources[index] as HTMLVideoElement
    const available = Math.max(0.1, (clip.sourceDuration ?? el.duration ?? 0) - clip.trimStart)
    return { index, time: clip.trimStart + (offset % available) }
  }

  private async positionVideoFor(t: number, startPlaying: boolean) {
    if (t >= contentLength(this.timeline, this.narrationSeconds)) return
    const { index, time } = this.sourceTimeFor(t)
    const el = this.sources[index]
    if (!(el instanceof HTMLVideoElement)) return
    await seekVideo(el, time)
    if (startPlaying) {
      this.activeIndex = index
      el.play().catch(() => {})
    }
  }

  // Keeps the on-screen video in step with the clock: starts the next clip
  // at its trim point, and pulls a video back to its trim start when it
  // loops past the end of its source.
  private syncVideo(t: number) {
    if (t >= contentLength(this.timeline, this.narrationSeconds)) {
      this.sources.forEach((s) => { if (s instanceof HTMLVideoElement && !s.paused) s.pause() })
      return
    }
    const { index, time } = this.sourceTimeFor(t)
    if (index !== this.activeIndex) {
      const previous = this.sources[this.activeIndex]
      if (previous instanceof HTMLVideoElement) previous.pause()
      const el = this.sources[index]
      if (el instanceof HTMLVideoElement) {
        el.currentTime = time
        el.play().catch(() => {})
      }
      this.activeIndex = index
      return
    }
    const el = this.sources[index]
    const clip = this.timeline.clips[index]
    if (el instanceof HTMLVideoElement && clip && el.currentTime < clip.trimStart - 0.25) {
      el.currentTime = clip.trimStart
    }
  }

  private drawAt(t: number) {
    const { ctx } = this
    if (!this.timeline.clips.length) return drawPlaceholder(ctx)
    if (t >= contentLength(this.timeline, this.narrationSeconds)) return drawEndCard(ctx, this.logo)

    const { index, offset } = clipAt(this.timeline, t)
    const source = this.sources[index]
    const clip = this.timeline.clips[index]
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, REEL_WIDTH, REEL_HEIGHT)
    if (source instanceof HTMLVideoElement) {
      drawCover(ctx, source, source.videoWidth, source.videoHeight)
    } else if (source) {
      const progress = Math.min(offset / Math.max(clip.duration, 0.1), 1)
      drawCover(ctx, source, source.naturalWidth, source.naturalHeight, 1 + 0.12 * progress)
    }
    drawWatermark(ctx, this.logo)
    const caption = captionAt(this.timeline, t)
    if (caption) drawCaption(ctx, caption.text)
  }
}
