import { getClient } from '../client'

const BUCKET_NAME = 'product-images'

export interface ProductImage {
  id: string
  product_id: string
  url: string
  alt_text?: string
  is_primary: boolean
  sort_order: number
  created_at: string
}

/**
 * Upload a product image to Supabase storage
 * @param file - The image file to upload
 * @param productId - The product ID (or 'temp' for new products)
 * @returns The public URL of the uploaded image
 */
export async function uploadProductImage(
  file: File,
  productId: string = 'temp'
): Promise<string> {
  const supabase = getClient()

  // Generate unique filename
  const fileExt = file.name.split('.').pop()
  const fileName = `${productId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`

  // Upload file
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false,
    })

  if (error) throw error

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(data.path)

  return publicUrl
}

/**
 * Delete a product image from storage
 * @param imageUrl - The full URL of the image
 */
export async function deleteProductImage(imageUrl: string): Promise<void> {
  const supabase = getClient()

  // Extract path from URL
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

/**
 * Add image record to product_images table
 * @param productId - The product ID
 * @param url - The image URL
 * @param isPrimary - Whether this is the primary image
 * @param altText - Optional alt text for the image
 */
export async function addProductImageRecord(
  productId: string,
  url: string,
  isPrimary: boolean = false,
  altText?: string
): Promise<ProductImage> {
  const supabase = getClient()

  // If setting as primary, unset other primary images
  if (isPrimary) {
    await supabase
      .from('product_images')
      .update({ is_primary: false })
      .eq('product_id', productId)
      .eq('is_primary', true)
  }

  // Get the next sort order
  const { data: existingImages } = await supabase
    .from('product_images')
    .select('sort_order')
    .eq('product_id', productId)
    .order('sort_order', { ascending: false })
    .limit(1)

  const nextSortOrder = existingImages && existingImages.length > 0
    ? (existingImages[0].sort_order || 0) + 1
    : 0

  const { data, error } = await supabase
    .from('product_images')
    .insert({
      product_id: productId,
      url,
      alt_text: altText,
      is_primary: isPrimary,
      sort_order: nextSortOrder,
    })
    .select()
    .single()

  if (error) throw error
  return data as ProductImage
}

/**
 * Remove image record from product_images table
 * @param imageId - The image record ID
 */
export async function removeProductImageRecord(imageId: string): Promise<void> {
  const supabase = getClient()

  const { error } = await supabase
    .from('product_images')
    .delete()
    .eq('id', imageId)

  if (error) throw error
}

/**
 * Set an image as primary
 * @param productId - The product ID
 * @param imageId - The image record ID to set as primary
 */
export async function setPrimaryImage(
  productId: string,
  imageId: string
): Promise<void> {
  const supabase = getClient()

  // Unset all primary images for this product
  await supabase
    .from('product_images')
    .update({ is_primary: false })
    .eq('product_id', productId)
    .eq('is_primary', true)

  // Set the specified image as primary
  const { error } = await supabase
    .from('product_images')
    .update({ is_primary: true })
    .eq('id', imageId)

  if (error) throw error
}

/**
 * Get all images for a product
 * @param productId - The product ID
 */
export async function getProductImages(productId: string): Promise<ProductImage[]> {
  const supabase = getClient()

  const { data, error } = await supabase
    .from('product_images')
    .select('*')
    .eq('product_id', productId)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return data as ProductImage[]
}

/**
 * Update image sort order
 * @param imageId - The image record ID
 * @param newSortOrder - The new sort order
 */
export async function updateImageSortOrder(
  imageId: string,
  newSortOrder: number
): Promise<void> {
  const supabase = getClient()

  const { error } = await supabase
    .from('product_images')
    .update({ sort_order: newSortOrder })
    .eq('id', imageId)

  if (error) throw error
}

// Matches the product-images bucket's file_size_limit (see
// supabase/migrations/00014_create_storage_buckets.sql).
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5MB

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']

/**
 * Validate an image file's type only. Size is deliberately not checked
 * here — an oversized original (e.g. a 10MB phone photo) should be
 * compressed down to fit, not rejected outright. See compressImageToLimit.
 */
export function validateImageType(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return 'Invalid file type. Please upload a JPEG, PNG, WebP, or GIF image.'
  }
  return null
}

/**
 * Validate image file (type and size). Useful when a caller uploads a
 * file as-is without compressing it first.
 * @param file - The file to validate
 * @returns Error message if invalid, null if valid
 */
export function validateImageFile(file: File): string | null {
  const typeError = validateImageType(file)
  if (typeError) return typeError

  if (file.size > MAX_IMAGE_SIZE) {
    return 'File size exceeds 5MB limit. Please choose a smaller image.'
  }

  return null
}

/**
 * Compress and resize image before upload
 * @param file - The original image file
 * @param maxWidth - Maximum width in pixels (default 1200)
 * @param maxHeight - Maximum height in pixels (default 1200)
 * @param quality - Image quality 0-1 (default 0.85)
 * @returns Compressed image file
 */
export async function compressImage(
  file: File,
  maxWidth: number = 1000,
  maxHeight: number = 1000,
  quality: number = 0.75
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

        // Calculate new dimensions
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
              const compressedFile = new File([blob], file.name, {
                type: file.type,
                lastModified: Date.now(),
              })
              resolve(compressedFile)
            } else {
              reject(new Error('Failed to compress image'))
            }
          },
          file.type,
          quality
        )
      }
      
      img.onerror = () => {
        reject(new Error('Failed to load image'))
      }
    }

    reader.onerror = () => {
      reject(new Error('Failed to read file'))
    }
  })
}

// Progressively smaller dimension/quality combinations, tried in order
// until the result fits under the size limit. Starts high enough that a
// normal photo is barely touched, and only falls back to more aggressive
// resizing for unusually large/detailed files.
const COMPRESSION_STEPS: Array<{ maxWidth: number; maxHeight: number; quality: number }> = [
  { maxWidth: 1600, maxHeight: 1600, quality: 0.8 },
  { maxWidth: 1200, maxHeight: 1200, quality: 0.75 },
  { maxWidth: 1000, maxHeight: 1000, quality: 0.7 },
  { maxWidth: 800, maxHeight: 800, quality: 0.6 },
  { maxWidth: 600, maxHeight: 600, quality: 0.5 },
]

/**
 * Compress an image down to fit within maxSizeBytes, automatically
 * reducing resolution/quality further if the first attempt is still too
 * large (e.g. a 10MB capture) — so an oversized original never needs to
 * be rejected outright before upload.
 * @param file - The original image file
 * @param maxSizeBytes - Target size ceiling (default: the 5MB bucket limit)
 * @returns The best-fitting compressed file found
 */
export async function compressImageToLimit(
  file: File,
  maxSizeBytes: number = MAX_IMAGE_SIZE
): Promise<File> {
  let result = file
  for (const { maxWidth, maxHeight, quality } of COMPRESSION_STEPS) {
    result = await compressImage(file, maxWidth, maxHeight, quality)
    if (result.size <= maxSizeBytes) return result
  }
  // Smallest attempt still exceeded the limit — return it anyway and let
  // the caller decide whether to block the upload with a clear message.
  return result
}
