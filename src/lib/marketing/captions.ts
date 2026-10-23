// Splits a voiceover script into short on-screen caption chunks: at most
// MAX_WORDS words, breaking early after punctuation so a chunk rarely
// straddles two sentences or clauses. Shared by synthesize-voice (which
// places an SSML mark before each chunk) and the reel builder's fallback
// timing, so both always agree on the chunk boundaries.

const MAX_WORDS = 6

export function splitIntoCaptionChunks(script: string): string[] {
  const words = script.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  const chunks: string[] = []
  let current: string[] = []

  for (const word of words) {
    current.push(word)
    const endsClause = /[.,!?;:—]$/.test(word)
    if (current.length >= MAX_WORDS || (endsClause && current.length >= 2)) {
      chunks.push(current.join(' '))
      current = []
    }
  }
  if (current.length) chunks.push(current.join(' '))

  // A 1-2 word tail left over from a word-count split ("our website.")
  // reads like a glitch on screen — fold it back into the chunk it was
  // cut from, as long as that chunk didn't already end a clause.
  return chunks.reduce<string[]>((merged, chunk) => {
    const previous = merged[merged.length - 1]
    const tooShort = chunk.split(' ').length <= 2
    if (previous && tooShort && !/[.,!?;:—]$/.test(previous)) {
      merged[merged.length - 1] = `${previous} ${chunk}`
    } else {
      merged.push(chunk)
    }
    return merged
  }, [])
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// SSML with a <mark name="cN"/> before chunk N, so Google TTS reports when
// each chunk starts speaking.
export function captionChunksToSsml(chunks: string[]): string {
  return `<speak>${chunks.map((c, i) => `<mark name="c${i}"/>${escapeXml(c)}`).join(' ')}</speak>`
}
