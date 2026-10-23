// Browser-side upload of a photo/video (or a rendered reel) straight to R2
// via a presigned PUT URL. Returns the content_media fields for the caller
// to insert with useCreateContentMedia(), so the row is created through the
// same mutation (and query invalidation) everywhere. Shared by the Library
// page and the Reel builder.

import type { NewContentMediaInput } from '@/hooks/useContentMedia'

// Reads a video's duration client-side before upload, so the DB row has it
// without any server-side processing.
export function getVideoDuration(file: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve(Number.isFinite(video.duration) ? video.duration : null)
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    video.src = url
  })
}

export async function uploadMediaFile(
  file: Blob,
  filename: string,
  contentType: string = file.type
): Promise<NewContentMediaInput> {
  const presignRes = await fetch('/api/media/presign-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, contentType }),
  })
  const presignData = await presignRes.json()
  if (!presignRes.ok) throw new Error(presignData.error || 'Failed to get upload URL')

  const putRes = await fetch(presignData.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  })
  if (!putRes.ok) throw new Error('Upload to storage failed')

  const isVideo = contentType.startsWith('video/')
  const duration = isVideo ? await getVideoDuration(file) : null

  return {
    media_type: isVideo ? 'video' : 'image',
    storage_key: presignData.key,
    original_filename: filename,
    mime_type: contentType,
    size_bytes: file.size,
    ...(duration != null ? { duration_seconds: Math.round(duration * 100) / 100 } : {}),
  }
}
