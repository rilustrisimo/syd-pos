'use client'

import { useEffect } from 'react'

interface PageTitleProps {
  /** Full title shown before " · SYD POS", e.g. "Portland Cement · Products" */
  title: string
}

/** Overrides the NavTitleSync title with a dynamic entity-specific title.
 *  Because child useEffects run after parent effects, this wins over NavTitleSync. */
export function PageTitle({ title }: PageTitleProps) {
  useEffect(() => {
    if (title) document.title = `${title} · SYD POS`
  }, [title])
  return null
}
