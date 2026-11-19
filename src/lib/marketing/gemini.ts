// Gemini (free tier, GEMINI_API_KEY) client shared by every route that calls
// Gemini. Thinking is disabled because the Flash models otherwise spend the
// output budget on hidden thinking tokens and truncate the answer.
//
// Free-tier limits are per model, so when one model answers 429 (per-minute
// or per-day limit reached) the request moves down to the next, lighter model.
// Every request starts again at the top model, so the best model is used as
// soon as its limit resets. Each attempt is written to ai_usage_log.

import { logAiUsage } from '@/lib/ai-usage-log'

/**
 * Tried in order, best first. Each has its own free-tier allowance.
 * Checked against the live API on 2026-11-19: the 2.5 models are retired
 * for new keys, and 3.5 Flash Lite rejects thinkingBudget (it doesn't
 * think by default, so it's sent without a thinking config).
 */
export const GEMINI_MODELS = [
  { id: 'gemini-3.6-flash', disableThinking: true },
  { id: 'gemini-3.5-flash', disableThinking: true },
  { id: 'gemini-3.5-flash-lite', disableThinking: false },
  { id: 'gemini-3.1-flash-lite', disableThinking: true },
] as const

export const GEMINI_MODEL = GEMINI_MODELS[0].id

export class GeminiError extends Error {}

type GenerationConfig = Record<string, unknown>

export interface GeminiResult {
  text: string
  model: string
  finishReason?: string
}

/** 503 "high demand" and 500s are usually gone after a couple of seconds. */
const RETRY_BACKOFF_MS = [0, 2000]
/** Normal answers take a few seconds; past this the model is treated as down. */
const REQUEST_TIMEOUT_MS = 20_000

export async function geminiGenerate({
  feature,
  system,
  prompt,
  generationConfig,
}: {
  /** Which app feature made the call, for the usage log (e.g. 'generate-suggestion'). */
  feature: string
  system: string
  prompt: string
  generationConfig: GenerationConfig
}): Promise<GeminiResult> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new GeminiError('GEMINI_API_KEY is not configured on the server')

  const bodyFor = (disableThinking: boolean) => JSON.stringify({
    system_instruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: disableThinking
      ? { ...generationConfig, thinkingConfig: { thinkingBudget: 0 } }
      : generationConfig,
  })

  let limited = 0
  for (const [index, { id: model, disableThinking }] of GEMINI_MODELS.entries()) {
    const body = bodyFor(disableThinking)
    let res: Response | null = null
    for (const wait of RETRY_BACKOFF_MS) {
      if (wait) await new Promise((r) => setTimeout(r, wait))
      try {
        res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            // A stuck model must not block the fallback to the next one.
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          }
        )
      } catch (err) {
        res = null
        console.error(`[gemini] ${model} request failed`, err instanceof Error ? err.message : err)
        break
      }
      if (res.status !== 503 && res.status !== 500) break
    }
    if (!res) {
      await logAiUsage({
        feature,
        provider: 'gemini',
        model,
        status: 'unavailable',
        fallback_level: index,
        error: `no response within ${REQUEST_TIMEOUT_MS / 1000}s`,
      })
      continue
    }

    if (res.ok) {
      const data = await res.json()
      const usage = data.usageMetadata ?? {}
      await logAiUsage({
        feature,
        provider: 'gemini',
        model,
        status: 'ok',
        http_status: res.status,
        fallback_level: index,
        input_tokens: usage.promptTokenCount ?? null,
        output_tokens: usage.candidatesTokenCount ?? null,
      })
      return {
        text: data.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
        model,
        finishReason: data.candidates?.[0]?.finishReason,
      }
    }

    const errText = await res.text()
    // 429 = this model's free-tier limit; 503/500 = still overloaded after
    // retries; 404 = model retired. A lighter model may still answer.
    const tryNext = res.status === 429 || res.status === 503 || res.status === 500 || res.status === 404
    if (res.status === 429) limited++
    console.error(`[gemini] ${model} ${res.status}`, errText.slice(0, 300))
    await logAiUsage({
      feature,
      provider: 'gemini',
      model,
      status: res.status === 429 ? 'rate_limited' : tryNext ? 'unavailable' : 'error',
      http_status: res.status,
      fallback_level: index,
      error: errText.slice(0, 500),
    })
    if (!tryNext) throw new GeminiError('Gemini request failed — try again')
  }

  throw new GeminiError(
    limited === GEMINI_MODELS.length
      ? 'Every Gemini model has reached its free-tier limit — try again in a minute, or tomorrow for the daily limit.'
      : 'Gemini is busy right now (free tier) — try again in a minute.'
  )
}

/** Structured JSON output; same fallback and logging as geminiGenerate. */
export async function geminiJson<T>({
  feature,
  system,
  prompt,
  schema,
  maxOutputTokens = 4000,
  temperature = 0.9,
}: {
  feature: string
  system: string
  prompt: string
  schema: Record<string, unknown>
  maxOutputTokens?: number
  temperature?: number
}): Promise<T> {
  const { text, model, finishReason } = await geminiGenerate({
    feature,
    system,
    prompt,
    generationConfig: {
      maxOutputTokens,
      temperature,
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  })
  try {
    return JSON.parse(text) as T
  } catch {
    console.error(`[gemini] unparseable output from ${model}`, finishReason, text.slice(0, 500))
    throw new GeminiError('Gemini returned an incomplete answer — try again')
  }
}
