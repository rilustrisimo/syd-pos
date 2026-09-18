/**
 * POST /api/content/generate-suggestion
 *
 * Drafts a script and caption via the Gemini API (free tier — see
 * https://aistudio.google.com/apikey) from a product, a media library
 * item, and/or a content_idea, then inserts it as a pending
 * content_suggestion for staff to review/edit/approve on the
 * Marketing > Feed page. Uses structured JSON output so the script
 * (master content, feeds creatives/voiceover) and the caption (the
 * actual post text) come back as two distinct fields in one call.
 *
 * Requires GEMINI_API_KEY (server-only, never NEXT_PUBLIC_*). Calls the
 * REST endpoint directly rather than a SDK — it's one simple request and
 * this avoids pinning to a specific SDK package/version.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const GEMINI_MODEL = 'gemini-3.6-flash'

const BRAND_BRIEF = `You write social media content for SYD Construction Supplies Trading, a
hardware/construction supplies store in Talakag, Bukidnon, Philippines. The
audience is a mix of DIY homeowners and contractors/bulk buyers. Tone:
friendly, straightforward, locally-grounded — a natural mix of English and
Filipino is fine (taglish), never overly formal or corporate. Do not invent
prices, stock levels, or claims not given to you in the brief below.

You produce two distinct outputs from the same brief — they serve different
purposes and should not just be copies of each other:

1. "script": a short spoken-style script (3-6 sentences) written to be read
   aloud as the voiceover for a video or reel. Natural spoken cadence, short
   sentences, no hashtags, no emoji.
2. "caption": a short written caption for the Facebook/Instagram post itself
   (2-4 short sentences), ending with a light call-to-action (visit the
   store, message to order, or check the online shop at sydconstruct.com).
3. "hashtags": up to 5 relevant hashtags (each including the leading #).`

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: staffUser } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single() as { data: { role: string } | null }

    if (!staffUser || !['admin', 'manager'].includes(staffUser.role)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const {
      source_product_id,
      source_media_id,
      source_idea_id,
      notes,
      platform = 'facebook',
    } = await request.json() as {
      source_product_id?: string
      source_media_id?: string
      source_idea_id?: string
      notes?: string
      platform?: 'facebook' | 'instagram' | 'both'
    }

    if (!source_product_id && !source_media_id && !source_idea_id && !notes?.trim()) {
      return NextResponse.json(
        { error: 'Pick a product, media item, or idea, or write a brief, before generating.' },
        { status: 400 }
      )
    }

    const briefParts: string[] = []

    if (source_product_id) {
      const { data: product } = await supabase
        .from('products')
        .select('name, description, current_selling_price')
        .eq('id', source_product_id)
        .single() as { data: { name: string; description: string | null; current_selling_price: number } | null }

      if (product) {
        briefParts.push(
          `Product: ${product.name}` +
          (product.description ? ` — ${product.description}` : '') +
          ` (price: ₱${Number(product.current_selling_price).toLocaleString('en-PH')})`
        )
      }
    }

    if (source_media_id) {
      const { data: media } = await supabase
        .from('content_media')
        .select('media_type, original_filename, transcript')
        .eq('id', source_media_id)
        .single() as { data: { media_type: string; original_filename: string; transcript: string | null } | null }

      if (media) {
        briefParts.push(
          `Attached ${media.media_type}: ${media.original_filename}` +
          (media.transcript ? ` — spoken content: "${media.transcript}"` : '')
        )
      }
    }

    if (source_idea_id) {
      const { data: idea } = await (supabase as any)
        .from('content_ideas')
        .select('title, description, image_concept')
        .eq('id', source_idea_id)
        .single() as { data: { title: string; description: string | null; image_concept: string | null } | null }

      if (idea) {
        briefParts.push(
          `Post idea: ${idea.title}` +
          (idea.description ? ` — ${idea.description}` : '') +
          (idea.image_concept ? ` (suggested visual: ${idea.image_concept})` : '')
        )
      }
    }

    if (notes?.trim()) {
      briefParts.push(`Staff notes: ${notes.trim()}`)
    }

    briefParts.push(`Target platform: ${platform}`)

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: BRAND_BRIEF }] },
          contents: [{ role: 'user', parts: [{ text: briefParts.join('\n') }] }],
          generationConfig: {
            maxOutputTokens: 500,
            // Without this, gemini-3.6-flash burns most/all of
            // maxOutputTokens on invisible "thinking" tokens before ever
            // producing the actual JSON, truncating the response —
            // confirmed directly against the live API before shipping.
            thinkingConfig: { thinkingBudget: 0 },
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                script: { type: 'STRING', description: 'A short spoken-style script (3-6 sentences) for a video/reel voiceover.' },
                caption: { type: 'STRING', description: 'A short written caption for the FB/IG post itself (2-4 sentences).' },
                hashtags: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Up to 5 relevant hashtags, each including the leading #.' },
              },
              required: ['script', 'caption', 'hashtags'],
              propertyOrdering: ['script', 'caption', 'hashtags'],
            },
          },
        }),
      }
    )

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text()
      console.error('[generate-suggestion] Gemini error', geminiRes.status, errBody)
      return NextResponse.json({ error: 'Failed to generate a draft — try again' }, { status: 502 })
    }

    const geminiData = await geminiRes.json()
    const rawText: string = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    let script: string | null = null
    let caption_draft = ''
    try {
      const parsed = JSON.parse(rawText) as { script?: string; caption?: string; hashtags?: string[] }
      script = parsed.script?.trim() || null
      const caption = parsed.caption?.trim() || ''
      const hashtags = parsed.hashtags?.filter(Boolean) ?? []
      caption_draft = (caption + (hashtags.length ? '\n\n' + hashtags.join(' ') : '')).trim()
    } catch (parseErr) {
      console.error('[generate-suggestion] Failed to parse Gemini JSON output', parseErr, rawText)
    }

    if (!caption_draft) {
      return NextResponse.json({ error: 'Gemini returned an empty draft — try again' }, { status: 502 })
    }

    // `content_suggestions` isn't in the hand-maintained Database type yet
    // (same as content_media) — cast, matching this codebase's established
    // pattern for querying tables the typed client doesn't know about.
    const { data: suggestion, error: insertError } = await (supabase as any)
      .from('content_suggestions')
      .insert({
        source_product_id: source_product_id || null,
        source_media_id: source_media_id || null,
        source_idea_id: source_idea_id || null,
        platform,
        notes: notes?.trim() || null,
        script,
        caption_draft,
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    // Generating a script from an idea means it's no longer just an idea —
    // the one automatic status transition in the idea bank (the rest are
    // manual staff actions).
    if (source_idea_id) {
      await (supabase as any)
        .from('content_ideas')
        .update({ status: 'created' })
        .eq('id', source_idea_id)
    }

    return NextResponse.json({ suggestion })
  } catch (err: any) {
    console.error('[generate-suggestion]', err)
    return NextResponse.json({ error: err?.message || 'Failed to generate suggestion' }, { status: 500 })
  }
}
