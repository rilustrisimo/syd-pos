// Minimal Gemini (free tier, GEMINI_API_KEY) call returning structured JSON,
// shared by the marketing planner routes. Same model and settings as the
// existing content routes: thinking disabled, because gemini-3.6-flash
// otherwise spends the output budget on hidden thinking tokens and
// truncates the JSON.

export const GEMINI_MODEL = 'gemini-3.6-flash'

export class GeminiError extends Error {}

export async function geminiJson<T>({
  system,
  prompt,
  schema,
  maxOutputTokens = 4000,
  temperature = 0.9,
}: {
  system: string
  prompt: string
  schema: Record<string, unknown>
  maxOutputTokens?: number
  temperature?: number
}): Promise<T> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new GeminiError('GEMINI_API_KEY is not configured on the server')

  const body = JSON.stringify({
    system_instruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens,
      temperature,
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  })

  // The free tier regularly answers 503 "high demand" for a few seconds;
  // retry those (and 500s) with a short backoff before giving up.
  let res: Response | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 2000 * attempt))
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
    )
    if (res.status !== 503 && res.status !== 500) break
  }
  if (!res) throw new GeminiError('Gemini request failed — try again')

  if (!res.ok) {
    const body = await res.text()
    console.error('[gemini] error', res.status, body)
    // 429 = free-tier rate/daily limit reached (never billed on a no-billing key).
    throw new GeminiError(
      res.status === 429
        ? 'Gemini free-tier limit reached — try again in a minute (or tomorrow).'
        : res.status === 503
          ? 'Gemini is busy right now (free tier) — try again in a minute.'
          : 'Gemini request failed — try again'
    )
  }
  const data = await res.json()
  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  try {
    return JSON.parse(text) as T
  } catch {
    console.error('[gemini] unparseable output', data.candidates?.[0]?.finishReason, text.slice(0, 500))
    throw new GeminiError('Gemini returned an incomplete answer — try again')
  }
}
