'use client'

import { useRef, useState } from 'react'
import { Images, Upload, Trash2, Film, FileImage } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import {
  useContentMedia,
  useCreateContentMedia,
  useDeleteContentMedia,
  getContentMediaUrl,
  type ContentMedia,
} from '@/hooks/useContentMedia'
import { MediaLightbox } from '@/components/marketing/media-lightbox'

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Reads a video file's duration client-side before upload, so the DB row
// has it without needing any server-side processing.
function getVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src)
      resolve(Number.isFinite(video.duration) ? video.duration : null)
    }
    video.onerror = () => {
      URL.revokeObjectURL(video.src)
      resolve(null)
    }
    video.src = URL.createObjectURL(file)
  })
}

export default function ContentLibraryPage() {
  const { data: media = [], isLoading } = useContentMedia()
  const createMedia = useCreateContentMedia()
  const deleteMedia = useDeleteContentMedia()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const isVideo = file.type.startsWith('video/')
    setUploading(true)
    try {
      const presignRes = await fetch('/api/media/presign-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
      })
      const presignData = await presignRes.json()
      if (!presignRes.ok) throw new Error(presignData.error || 'Failed to get upload URL')

      const putRes = await fetch(presignData.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      if (!putRes.ok) throw new Error('Upload to storage failed')

      const duration = isVideo ? await getVideoDuration(file) : null

      await createMedia.mutateAsync({
        media_type: isVideo ? 'video' : 'image',
        storage_key: presignData.key,
        original_filename: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        ...(duration != null ? { duration_seconds: duration } : {}),
      })

      toast.success(`${file.name} uploaded`)
    } catch (err: any) {
      toast.error(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  function handleDelete() {
    if (!deletingId) return
    deleteMedia.mutate(deletingId, {
      onSuccess: () => toast.success('Removed from library'),
      onError: (e) => toast.error(e.message),
      onSettled: () => setDeletingId(null),
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Images className="w-6 h-6" />
            Content Library
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Photos and videos for social media posts</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
          className="hidden"
          onChange={handleFileSelected}
        />
        <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          <Upload className="w-4 h-4 mr-2" />
          {uploading ? 'Uploading...' : 'Upload Media'}
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">All Media</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
              Loading...
            </div>
          ) : media.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
              <Images className="w-10 h-10 opacity-30" />
              <p className="text-sm">No media uploaded yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {media.map((item: ContentMedia) => {
                const url = getContentMediaUrl(item.storage_key)
                return (
                  <div key={item.id} className="border rounded-lg overflow-hidden group relative">
                    <div className="aspect-square bg-slate-100 flex items-center justify-center">
                      {url ? (
                        <MediaLightbox
                          url={url}
                          mediaType={item.media_type}
                          label={item.original_filename}
                          trigger={
                            item.media_type === 'image' ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={url} alt={item.original_filename} className="w-full h-full object-cover" />
                            ) : (
                              <video src={url} className="w-full h-full object-cover" muted />
                            )
                          }
                        />
                      ) : (
                        item.media_type === 'image'
                          ? <FileImage className="w-8 h-8 text-slate-300" />
                          : <Film className="w-8 h-8 text-slate-300" />
                      )}
                    </div>
                    <div className="p-2 space-y-0.5">
                      <p className="text-xs font-medium truncate">{item.original_filename}</p>
                      <p className="text-[11px] text-slate-400">
                        {formatSize(item.size_bytes)}
                        {item.duration_seconds != null && ` · ${Math.round(item.duration_seconds)}s`}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="absolute top-1 right-1 h-7 w-7 p-0 bg-white/80 hover:bg-white text-slate-500 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => setDeletingId(item.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this media?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes it from the library. The underlying file in storage is not deleted automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteMedia.isPending ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
