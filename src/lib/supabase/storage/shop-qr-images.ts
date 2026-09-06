import { getClient } from '../client'

const BUCKET_NAME = 'shop-qr-codes'

// Matches the shop-qr-codes bucket's file_size_limit (see
// supabase/migrations/00080_shop_payment_qr_and_bank_accounts.sql).
export const MAX_QR_IMAGE_SIZE = 5 * 1024 * 1024 // 5MB

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

/**
 * Validate a QR image file's type only. Size is deliberately not checked
 * here — an oversized original should be compressed down to fit, not
 * rejected outright. See compressQrImageToLimit.
 */
export function validateQrImageType(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return 'Invalid file type. Please upload a JPEG, PNG, or WebP image.'
  }
  return null
}

/**
 * Upload a payment QR code image to Supabase storage.
 * @param file - The image file to upload
 * @returns The public URL of the uploaded image
 */
export async function uploadShopQrImage(file: File): Promise<string> {
  const supabase = getClient()

  const fileExt = file.name.split('.').pop()
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false,
    })

  if (error) throw error

  const { data: { publicUrl } } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(data.path)

  return publicUrl
}

/**
 * Delete a payment QR code image from storage.
 * @param imageUrl - The full URL of the image
 */
export async function deleteShopQrImage(imageUrl: string): Promise<void> {
  const supabase = getClient()

  const url = new URL(imageUrl)
  const pathMatch = url.pathname.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)/)

  if (!pathMatch) {
    throw new Error('Invalid image URL format')
  }

  const filePath = pathMatch[1]

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .remove([filePath])

  if (error) throw error
}

function compressImage(
  file: File,
  maxWidth: number,
  maxHeight: number,
  quality: number
): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)

    reader.onload = (event) => {
      const img = new Image()
      img.src = event.target?.result as string

      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width)
            width = maxWidth
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height)
            height = maxHeight
          }
        }

        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        ctx?.drawImage(img, 0, 0, width, height)

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(new File([blob], file.name, { type: file.type, lastModified: Date.now() }))
            } else {
              reject(new Error('Failed to compress image'))
            }
          },
          file.type,
          quality
        )
      }

      img.onerror = () => reject(new Error('Failed to load image'))
    }

    reader.onerror = () => reject(new Error('Failed to read file'))
  })
}

// Progressively smaller dimension/quality combinations, tried in order
// until the result fits under the size limit. QR codes are simple
// high-contrast graphics, so even the smallest step stays sharp enough
// to scan.
const COMPRESSION_STEPS: Array<{ maxWidth: number; maxHeight: number; quality: number }> = [
  { maxWidth: 1200, maxHeight: 1200, quality: 0.85 },
  { maxWidth: 900, maxHeight: 900, quality: 0.8 },
  { maxWidth: 700, maxHeight: 700, quality: 0.75 },
  { maxWidth: 500, maxHeight: 500, quality: 0.7 },
]

/**
 * Compress a QR image down to fit within maxSizeBytes, automatically
 * reducing resolution/quality further if the first attempt is still too
 * large — so an oversized original never needs to be rejected outright
 * before upload.
 */
export async function compressQrImageToLimit(
  file: File,
  maxSizeBytes: number = MAX_QR_IMAGE_SIZE
): Promise<File> {
  let result = file
  for (const { maxWidth, maxHeight, quality } of COMPRESSION_STEPS) {
    result = await compressImage(file, maxWidth, maxHeight, quality)
    if (result.size <= maxSizeBytes) return result
  }
  return result
}
