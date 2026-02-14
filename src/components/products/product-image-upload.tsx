'use client'

import { useState, useRef } from 'react'
import { X, Upload, Camera, Loader2, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import Image from 'next/image'
import { toast } from 'sonner'
import {
  uploadProductImage,
  deleteProductImage,
  addProductImageRecord,
  removeProductImageRecord,
  setPrimaryImage,
  validateImageFile,
  compressImage,
  type ProductImage,
} from '@/lib/supabase/storage/product-images'

interface ProductImageUploadProps {
  productId?: string // If editing existing product
  images: ProductImage[]
  onImagesChange: (images: ProductImage[]) => void
  maxImages?: number
}

export function ProductImageUpload({
  productId,
  images,
  onImagesChange,
  maxImages = 5,
}: ProductImageUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    const file = files[0]

    // Validate file
    const validationError = validateImageFile(file)
    if (validationError) {
      toast.error(validationError)
      return
    }

    if (images.length >= maxImages) {
      toast.error(`Maximum ${maxImages} images allowed`)
      return
    }

    setUploading(true)

    try {
      // Compress image before upload
      toast.info('Compressing image...')
      const compressedFile = await compressImage(file)

      // Upload to storage
      toast.info('Uploading image...')
      const imageUrl = await uploadProductImage(compressedFile, productId || 'temp')

      // If product exists, add to database
      if (productId) {
        const isPrimary = images.length === 0
        const imageRecord = await addProductImageRecord(
          productId,
          imageUrl,
          isPrimary,
          file.name
        )
        onImagesChange([...images, imageRecord])
      } else {
        // For new products, store temporarily
        const tempImage: ProductImage = {
          id: `temp-${Date.now()}`,
          product_id: 'temp',
          url: imageUrl,
          alt_text: file.name,
          is_primary: images.length === 0,
          sort_order: images.length,
          created_at: new Date().toISOString(),
        }
        onImagesChange([...images, tempImage])
      }

      toast.success('Image uploaded successfully')
    } catch (error: any) {
      console.error('Error uploading image:', error)
      toast.error(error.message || 'Failed to upload image')
    } finally {
      setUploading(false)
      // Reset file inputs
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (cameraInputRef.current) cameraInputRef.current.value = ''
    }
  }

  const handleRemoveImage = async (image: ProductImage) => {
    setDeletingId(image.id)

    try {
      // Delete from storage
      await deleteProductImage(image.url)

      // Remove from database if real product
      if (productId && !image.id.startsWith('temp-')) {
        await removeProductImageRecord(image.id)
      }

      // Update local state
      const updatedImages = images.filter((img) => img.id !== image.id)
      
      // If we removed the primary image and there are others, make the first one primary
      if (image.is_primary && updatedImages.length > 0 && productId) {
        await setPrimaryImage(productId, updatedImages[0].id)
        updatedImages[0].is_primary = true
      }

      onImagesChange(updatedImages)
      toast.success('Image removed')
    } catch (error: any) {
      console.error('Error removing image:', error)
      toast.error(error.message || 'Failed to remove image')
    } finally {
      setDeletingId(null)
    }
  }

  const handleSetPrimary = async (imageId: string) => {
    if (!productId) {
      // For new products, just update local state
      const updatedImages = images.map((img) => ({
        ...img,
        is_primary: img.id === imageId,
      }))
      onImagesChange(updatedImages)
      return
    }

    try {
      await setPrimaryImage(productId, imageId)
      
      const updatedImages = images.map((img) => ({
        ...img,
        is_primary: img.id === imageId,
      }))
      onImagesChange(updatedImages)
      toast.success('Primary image updated')
    } catch (error: any) {
      console.error('Error setting primary image:', error)
      toast.error(error.message || 'Failed to set primary image')
    }
  }

  return (
    <div className="space-y-4">
      {/* Upload Buttons */}
      <div className="flex flex-wrap gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
          onChange={(e) => handleFileSelect(e.target.files)}
          className="hidden"
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => handleFileSelect(e.target.files)}
          className="hidden"
        />
        
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || images.length >= maxImages}
        >
          {uploading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          Choose File
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={() => cameraInputRef.current?.click()}
          disabled={uploading || images.length >= maxImages}
          className="md:hidden"
        >
          {uploading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Camera className="mr-2 h-4 w-4" />
          )}
          Take Photo
        </Button>
      </div>

      {/* Image Grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {images.map((image) => (
            <Card
              key={image.id}
              className={cn(
                'relative group overflow-hidden',
                image.is_primary && 'ring-2 ring-primary'
              )}
            >
              <div className="aspect-square relative">
                <Image
                  src={image.url}
                  alt={image.alt_text || 'Product image'}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
                />
                
                {/* Overlay on hover */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  {!image.is_primary && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => handleSetPrimary(image.id)}
                      title="Set as primary"
                    >
                      <Star className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => handleRemoveImage(image)}
                    disabled={deletingId === image.id}
                  >
                    {deletingId === image.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <X className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {/* Primary badge */}
                {image.is_primary && (
                  <div className="absolute top-2 left-2 bg-primary text-primary-foreground px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1">
                    <Star className="h-3 w-3 fill-current" />
                    Primary
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Empty state */}
      {images.length === 0 && (
        <div className="border-2 border-dashed rounded-lg p-8 text-center">
          <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground mb-2">
            No images uploaded yet
          </p>
          <p className="text-xs text-muted-foreground">
            Upload up to {maxImages} images. First image will be the primary image.
          </p>
        </div>
      )}

      {/* Info */}
      {images.length > 0 && images.length < maxImages && (
        <p className="text-xs text-muted-foreground">
          {images.length} of {maxImages} images uploaded
        </p>
      )}
    </div>
  )
}
