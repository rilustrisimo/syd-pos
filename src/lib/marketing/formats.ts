import { toast } from 'sonner'
import type { ContentAudience, ContentFormat } from '@/hooks/useContentIdeas'

export const AUDIENCE_LABELS: Record<ContentAudience, string> = {
  contractor: 'Contractors',
  business_farm: 'Business / Farm',
  family_build: 'Family build',
  general: 'General',
}

export const AUDIENCE_COLORS: Record<ContentAudience, string> = {
  contractor: 'bg-amber-50 text-amber-800 border-amber-200',
  business_farm: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  family_build: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  general: 'bg-slate-50 text-slate-600 border-slate-200',
}

// Accepts the stored values or the labels people tend to type in a CSV.
export function parseContentAudience(value: string | undefined): ContentAudience {
  const v = value?.trim().toLowerCase().replace(/[\s/-]+/g, '_') ?? ''
  if (v.startsWith('contractor') || v.startsWith('foreman')) return 'contractor'
  if (v.startsWith('business') || v.includes('farm')) return 'business_farm'
  if (v.startsWith('family') || v.includes('house') || v.includes('ofw')) return 'family_build'
  return 'general'
}

export { toConceptCode } from '@/lib/marketing/concept-code'

/** Shop link tagged so GA4 can attribute visits and quote requests to a concept. */
export function buildAdLink(conceptCode: string, kind: 'paid' | 'organic' = 'paid'): string {
  const params = new URLSearchParams({
    utm_source: 'meta',
    utm_medium: kind === 'paid' ? 'paid_social' : 'social',
    utm_campaign: kind === 'paid' ? 'syd_ads' : 'syd_organic',
    utm_content: conceptCode,
  })
  return `https://sydconstruct.com/?${params.toString()}`
}

export const FORMAT_LABELS: Record<ContentFormat, string> = {
  image: 'Image',
  carousel: 'Carousel',
  reel: 'Reel',
}

export const FORMAT_COLORS: Record<ContentFormat, string> = {
  image: 'bg-sky-50 text-sky-700 border-sky-200',
  carousel: 'bg-violet-50 text-violet-700 border-violet-200',
  reel: 'bg-rose-50 text-rose-700 border-rose-200',
}

export function parseContentFormat(value: string | undefined): ContentFormat {
  const v = value?.trim().toLowerCase()
  return v === 'carousel' || v === 'reel' ? v : 'image'
}

export async function copyToClipboard(text: string, label = 'Prompt') {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${label} copied`)
  } catch {
    toast.error('Could not copy — select the text and copy it manually')
  }
}
