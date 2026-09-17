'use client'

import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

interface MediaLightboxProps {
  url: string
  mediaType: 'image' | 'video'
  label?: string
  trigger: React.ReactNode
}

/** Wraps a thumbnail so clicking it opens a full-size view in a dialog. */
export function MediaLightbox({ url, mediaType, label, trigger }: MediaLightboxProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className="cursor-zoom-in block w-full h-full">
          {trigger}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl w-fit p-2 bg-black border-none" showCloseButton>
        <DialogTitle className="sr-only">{label || 'Media preview'}</DialogTitle>
        {mediaType === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={label || ''} className="max-w-full max-h-[85vh] w-auto h-auto object-contain rounded" />
        ) : (
          <video src={url} controls autoPlay className="max-w-full max-h-[85vh] w-auto h-auto rounded" />
        )}
      </DialogContent>
    </Dialog>
  )
}
