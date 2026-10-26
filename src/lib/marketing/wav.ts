// Minimal WAV (PCM) helpers for joining narration audio synthesized one
// sentence at a time. Uncompressed audio makes each piece's exact length
// known from its byte count, which times the reel captions.

export interface PcmAudio {
  pcm: Uint8Array
  sampleRate: number
  channels: number
  bitsPerSample: number
}

/** Reads a RIFF/WAVE file (as returned by Google TTS LINEAR16) into raw PCM. */
export function parseWav(buf: Uint8Array): PcmAudio {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const tag = (o: number) => String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3])
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Not a WAV file')
  let offset = 12
  let fmt: Omit<PcmAudio, 'pcm'> | null = null
  while (offset + 8 <= buf.byteLength) {
    const id = tag(offset)
    const size = view.getUint32(offset + 4, true)
    const body = offset + 8
    if (id === 'fmt ') {
      fmt = {
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bitsPerSample: view.getUint16(body + 14, true),
      }
    } else if (id === 'data') {
      if (!fmt) throw new Error('WAV data before format')
      // Some encoders write 0 / 0xFFFFFFFF for a streamed size; clamp to the buffer.
      const end = size && body + size <= buf.byteLength ? body + size : buf.byteLength
      return { ...fmt, pcm: buf.subarray(body, end) }
    }
    offset = body + size + (size % 2)
  }
  throw new Error('WAV has no data chunk')
}

export function pcmSeconds(a: PcmAudio): number {
  return a.pcm.byteLength / (a.sampleRate * a.channels * (a.bitsPerSample / 8))
}

/** Joins PCM pieces (same format) into one WAV file. */
export function joinWav(parts: PcmAudio[]): Uint8Array {
  if (!parts.length) throw new Error('Nothing to join')
  const { sampleRate, channels, bitsPerSample } = parts[0]
  if (parts.some((p) => p.sampleRate !== sampleRate || p.channels !== channels || p.bitsPerSample !== bitsPerSample)) {
    throw new Error('Audio pieces have different formats')
  }
  const dataSize = parts.reduce((s, p) => s + p.pcm.byteLength, 0)
  const out = new Uint8Array(44 + dataSize)
  const view = new DataView(out.buffer)
  const write = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i) }
  const blockAlign = channels * (bitsPerSample / 8)
  write(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); write(8, 'WAVE')
  write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true); view.setUint16(34, bitsPerSample, true)
  write(36, 'data'); view.setUint32(40, dataSize, true)
  let offset = 44
  for (const p of parts) { out.set(p.pcm, offset); offset += p.pcm.byteLength }
  return out
}
