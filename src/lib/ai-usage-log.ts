// Best-effort log of every Gemini / Google TTS call (table ai_usage_log,
// migration 00105). Shows which feature uses the free-tier quota, and when
// a model hit its limit and the call moved to a lighter one. Logging
// failures are swallowed: they must never break the feature itself.

import { createClient } from '@/lib/supabase/server'

export interface AiUsageEntry {
  feature: string
  provider: 'gemini' | 'google-tts'
  model: string
  status: 'ok' | 'rate_limited' | 'unavailable' | 'error'
  http_status?: number | null
  /** 0 = top model; higher = how many models down the fallback list. */
  fallback_level?: number
  input_tokens?: number | null
  output_tokens?: number | null
  characters?: number | null
  error?: string | null
}

export async function logAiUsage(entry: AiUsageEntry): Promise<void> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    // ai_usage_log isn't in the hand-maintained Database type, so the
    // table name is untyped here (same pattern as content_suggestions).
    const { error } = await supabase
      .from('ai_usage_log' as never)
      .insert({ ...entry, user_id: user?.id ?? null } as never)
    if (error) console.error('[ai-usage-log] insert failed', error.message)
  } catch (err) {
    console.error('[ai-usage-log] insert failed', err instanceof Error ? err.message : err)
  }
}
