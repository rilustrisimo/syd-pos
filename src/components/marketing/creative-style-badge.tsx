import { Badge } from '@/components/ui/badge'
import { CREATIVE_STYLES, isCreativeStyle } from '@/lib/marketing/creative-styles'

/** Shows a post's creative style (how it's made), with its recipe on hover. */
export function CreativeStyleBadge({ style }: { style: string | null | undefined }) {
  if (!isCreativeStyle(style)) return null
  const spec = CREATIVE_STYLES[style]
  return (
    <Badge variant="outline" className="bg-orange-50 text-orange-800 border-orange-200" title={spec.recipe}>
      {spec.label}
    </Badge>
  )
}
