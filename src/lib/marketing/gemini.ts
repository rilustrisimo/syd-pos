// Gemini (free tier, GEMINI_API_KEY) client shared by every route that calls
// Gemini. Thinking is disabled because the Flash models otherwise spend the
// output budget on hidden thinking tokens and truncate the answer.
//
// Free-tier limits are per model, so when one model answers 429 (per-minute
// or per-day limit reached) the request moves down to the next, lighter model.
// Every request starts again at the top model, so the best model is used as
// soon as its limit resets. Each attempt is written to ai_usage_log.

import { logAiUsage, recentlyRateLimitedModels } from '@/lib/ai-usage-log'

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

/** 503 "high demand" and 500s are often gone after a couple of seconds. */
const RETRY_BACKOFF_MS = [0, 2000]
/** Whole call must finish inside the routes' 60 s maxDuration. */
const TOTAL_BUDGET_MS = 55_000
/** A model that answered 429 is skipped for this long (then checked again). */
const RATE_LIMIT_COOLDOWN_MS = 10 * 60 * 1000

/** Long answers take longer: ~20 s for short replies, up to 50 s for big JSON batches. */
function attemptTimeoutMs(generationConfig: GenerationConfig): number {
  const tokens = Number(generationConfig.maxOutputTokens) || 1000
  return Math.min(50_000, Math.max(20_000, 12_000 + tokens * 5))
}

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
  const startedAt = Date.now()
  const remaining = () => TOTAL_BUDGET_MS - (Date.now() - startedAt)

  const bodyFor = (disableThinking: boolean) => JSON.stringify({
    system_instruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: disableThinking
      ? { ...generationConfig, thinkingConfig: { thinkingBudget: 0 } }
      : generationConfig,
  })

  // Skip models that hit their free-tier limit recently (from the usage log),
  // unless that would skip every model. The top model is checked again after
  // the cooldown, so it's used as soon as its limit resets.
  const cooling = await recentlyRateLimitedModels(RATE_LIMIT_COOLDOWN_MS)
  const all = GEMINI_MODELS.map((m, index) => ({ ...m, index }))
  let candidates = all.filter((m) => !cooling.has(m.id))
  if (candidates.length === 0) candidates = all

  const limitedModels = new Set<string>()

  interface GeminiBody {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
  }
  type Outcome =
    | { ok: true; model: string; index: number; data: GeminiBody }
    | { ok: false; model: string; index: number; status: number | null; error: string }

  /** One model: retries 503/500 briefly; aborts when `stop` fires or time runs out. */
  async function attempt(model: string, disableThinking: boolean, index: number, stop: AbortSignal): Promise<Outcome> {
    const body = bodyFor(disableThinking)
    const timeout = Math.max(3_000, Math.min(attemptTimeoutMs(generationConfig), remaining() - 2_000))
    let res: Response | null = null
    for (const wait of RETRY_BACKOFF_MS) {
      if (wait) {
        if (remaining() < wait + 5_000 || stop.aborted) break
        await new Promise((r) => setTimeout(r, wait))
      }
      // Own controller + timer (AbortSignal.any with AbortSignal.timeout can
      // lose the timer in Node, leaving the request hanging forever).
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), timeout)
      const onStop = () => ctrl.abort()
      stop.addEventListener('abort', onStop)
      try {
        res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: ctrl.signal }
        )
      } catch {
        return { ok: false, model, index, status: null, error: stop.aborted ? 'cancelled' : `no response within ${Math.round(timeout / 1000)}s` }
      } finally {
        clearTimeout(timer)
        stop.removeEventListener('abort', onStop)
      }
      if (res.status !== 503 && res.status !== 500) break
    }
    if (!res) return { ok: false, model, index, status: null, error: 'no response' }
    if (res.ok) return { ok: true, model, index, data: await res.json() }
    return { ok: false, model, index, status: res.status, error: (await res.text()).slice(0, 500) }
  }

  // Staggered race: start the best model; if it hasn't answered within
  // STAGGER_MS, also start the next one (without cancelling the first). A
  // model that fails hands over immediately. First success wins; the rest
  // are cancelled. Pass 2 retries models that were only busy (never 429s).
  const STAGGER_MS = 15_000
  for (let pass = 0; pass < 2; pass++) {
    if (pass === 1) {
      candidates = candidates.filter((m) => !limitedModels.has(m.id))
      if (candidates.length === 0 || remaining() < 15_000) break
      await new Promise((r) => setTimeout(r, 2000))
    }
    const stop = new AbortController()
    const queue = [...candidates]
    const running = new Map<string, Promise<Outcome>>()
    const launch = () => {
      const next = queue.shift()
      if (!next || remaining() < 5_000) return false
      running.set(next.id, attempt(next.id, next.disableThinking, next.index, stop.signal))
      return true
    }
    launch()
    while (running.size > 0) {
      let staggerTimer: ReturnType<typeof setTimeout> | undefined
      let deadlineTimer: ReturnType<typeof setTimeout> | undefined
      const stagger = new Promise<'stagger'>((r) => { staggerTimer = setTimeout(() => r('stagger'), STAGGER_MS) })
      // Hard stop at the end of the budget, whatever is still running.
      const deadline = new Promise<'deadline'>((r) => { deadlineTimer = setTimeout(() => r('deadline'), Math.max(0, remaining())) })
      const first = await Promise.race([...running.values(), deadline, ...(queue.length ? [stagger] : [])])
      clearTimeout(staggerTimer); clearTimeout(deadlineTimer)
      if (first === 'deadline') { stop.abort(); running.clear(); break }
      if (first === 'stagger') { launch(); continue }
      running.delete(first.model)

      if (first.ok) {
        stop.abort()  // cancel the slower attempts still running
        const usage = first.data.usageMetadata ?? {}
        await logAiUsage({
          feature, provider: 'gemini', model: first.model, status: 'ok', http_status: 200, fallback_level: first.index,
          input_tokens: usage.promptTokenCount ?? null, output_tokens: usage.candidatesTokenCount ?? null,
        })
        return {
          text: first.data.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
          model: first.model,
          finishReason: first.data.candidates?.[0]?.finishReason,
        }
      }

      // 429 = this model's free-tier limit; 404 = retired; 503/500/timeout = busy.
      const status = first.status
      if (status === 429 || status === 404) limitedModels.add(first.model)
      const tryNext = status === null || status === 429 || status === 503 || status === 500 || status === 404
      console.error(`[gemini] ${first.model} ${status ?? ''}`, first.error.slice(0, 300))
      await logAiUsage({
        feature, provider: 'gemini', model: first.model,
        status: status === 429 ? 'rate_limited' : tryNext ? 'unavailable' : 'error',
        http_status: status, fallback_level: first.index, error: first.error,
      })
      if (!tryNext) { stop.abort(); throw new GeminiError('Gemini request failed — try again') }
      launch()  // hand over to the next model straight away
    }
  }

  const allLimited = GEMINI_MODELS.every((m) => limitedModels.has(m.id) || cooling.has(m.id))
  throw new GeminiError(
    allLimited
      ? 'Every Gemini model has reached its free-tier limit — try again in a few minutes, or tomorrow for the daily limit.'
      : 'Gemini is busy right now (Google is overloaded on the free tier) — try again in a minute.'
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
