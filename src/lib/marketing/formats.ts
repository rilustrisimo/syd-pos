import { toast } from 'sonner'
import type { ContentFormat } from '@/hooks/useContentIdeas'

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
