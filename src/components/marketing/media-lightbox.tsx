'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { downloadMediaFile } from '@/lib/marketing/download'

interface MediaLightboxProps {
  url: string
  mediaType: 'image' | 'video'
  label?: string
  trigger: React.ReactNode
  /** Replaces the Download button (e.g. "Add to Library" on a stock preview). */
  action?: React.ReactNode
}

function fileNameFor(url: string, label: string | undefined, mediaType: 'image' | 'video'): string {
  if (label && /\.[a-z0-9]{2,5}$/i.test(label)) return label
  const ext = url.split('?')[0].match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? (mediaType === 'video' ? 'mp4' : 'jpg')
  const base = (label || 'syd-media').replace(/[^\w.-]+/g, '-').replace(/-+$/, '')
  return `${base}.${ext}`
}

/** Wraps a thumbnail so clicking it opens a full-size view in a dialog, with a download button. */
export function MediaLightbox({ url, mediaType, label, trigger, action }: MediaLightboxProps) {
  const [downloading, setDownloading] = useState(false)

  async function handleDownload() {
    setDownloading(true)
    try {
      await downloadMediaFile(url, fileNameFor(url, label, mediaType))
    } finally {
      setDownloading(false)
    }
  }

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
          <img src={url} alt={label || ''} className="max-w-full max-h-[80vh] w-auto h-auto object-contain rounded" />
        ) : (
          <video src={url} controls autoPlay className="max-w-full max-h-[80vh] w-auto h-auto rounded" />
        )}
        <div className="flex justify-center pt-1">
          {action ?? <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 rounded-md bg-white/10 hover:bg-white/20 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
          >
            <Download className="w-3.5 h-3.5" /> {downloading ? 'Downloading…' : 'Download'}
          </button>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
