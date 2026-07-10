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

/**
 * Validate image file
 * @param file - The file to validate
 * @returns Error message if invalid, null if valid
 */
export function validateImageFile(file: File): string | null {
  const maxSize = 5 * 1024 * 1024 // 5MB
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']

  if (!allowedTypes.includes(file.type)) {
    return 'Invalid file type. Please upload a JPEG, PNG, WebP, or GIF image.'
  }

  if (file.size > maxSize) {
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
