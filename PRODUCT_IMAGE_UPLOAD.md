# Product Image Upload Feature

## Overview
The product image upload feature allows users to add up to 5 images per product. The feature is fully mobile-friendly, enabling users to take photos directly from their mobile device camera or upload existing images from their device.

## Features

### ✨ Core Functionality
- **Multiple Images**: Upload up to 5 images per product
- **Primary Image**: Set one image as the primary product image
- **Mobile Camera Support**: On mobile devices, access the camera directly to take product photos
- **File Upload**: Choose images from device storage
- **Image Compression**: Automatically compresses images to reduce storage and improve load times
- **Image Management**: Delete images, reorder, and set primary image
- **Validation**: Validates file type and size before upload

### 📱 Mobile-Friendly Features
- **Camera Access**: Dedicated "Take Photo" button on mobile devices
- **Touch-Friendly Interface**: Large buttons and cards for easy interaction
- **Responsive Grid**: Adapts to different screen sizes
- **Optimized Images**: Compressed for faster mobile loading

### 🎨 User Experience
- **Visual Feedback**: Loading indicators during upload/delete operations
- **Primary Badge**: Clear visual indication of the primary image
- **Empty State**: Helpful message when no images are uploaded
- **Progress Indicator**: Shows how many images uploaded (e.g., "3 of 5 images")
- **Hover Actions**: On desktop, hover over images to see delete/set primary buttons

## Technical Implementation

### Database Schema
The feature uses the existing `product_images` table:

```sql
CREATE TABLE product_images (
    id UUID PRIMARY KEY,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    alt_text VARCHAR(200),
    is_primary BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Supabase Storage
Images are stored in a dedicated Supabase Storage bucket:

- **Bucket Name**: `product-images`
- **Public Access**: Yes (images are publicly viewable)
- **File Size Limit**: 5MB per image
- **Allowed Types**: JPEG, PNG, WebP, GIF
- **Storage Path**: `{product_id}/{timestamp}-{random}.{extension}`

### Migration
Apply the storage bucket migration safely (without affecting existing data):

**Option 1: Via Supabase Dashboard (Recommended)**
1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy the contents of `supabase/migrations/00014_create_storage_buckets.sql`
4. Paste and execute the SQL

**Option 2: Via Supabase CLI (if using local development)**
```bash
# Apply only the new migration (safe, won't reset data)
supabase migration up --db-url "your_database_url"
```

**Option 3: Manual Storage Bucket Creation**
1. Go to Supabase Dashboard → Storage
2. Create new bucket named `product-images`
3. Settings: Public bucket, 5MB limit
4. Add RLS policies manually via SQL Editor (copy from migration file)

### Components

#### 1. **ProductImageUpload Component**
Located: `/src/components/products/product-image-upload.tsx`

**Props:**
- `productId?: string` - The product ID (optional for new products)
- `images: ProductImage[]` - Array of current product images
- `onImagesChange: (images: ProductImage[]) => void` - Callback when images change
- `maxImages?: number` - Maximum number of images (default: 5)

**Features:**
- File input for choosing images from device
- Camera input for taking photos (mobile only)
- Image grid with hover actions
- Delete and set primary image functionality
- Loading states for all async operations

#### 2. **Helper Functions**
Located: `/src/lib/supabase/storage/product-images.ts`

**Key Functions:**
```typescript
// Upload image to storage
uploadProductImage(file: File, productId: string): Promise<string>

// Delete image from storage
deleteProductImage(imageUrl: string): Promise<void>

// Add image record to database
addProductImageRecord(productId: string, url: string, isPrimary: boolean): Promise<ProductImage>

// Remove image record from database
removeProductImageRecord(imageId: string): Promise<void>

// Set image as primary
setPrimaryImage(productId: string, imageId: string): Promise<void>

// Get all product images
getProductImages(productId: string): Promise<ProductImage[]>

// Validate image file (type and size)
validateImageFile(file: File): string | null

// Compress image before upload (reduces size by up to 70%)
compressImage(file: File, maxWidth?: number, maxHeight?: number, quality?: number): Promise<File>
```

#### 3. **Product Form Integration**
Located: `/src/components/forms/product-form.tsx`

The product form has been updated to include the image upload component. Images are automatically saved to the database when creating or editing products.

**New Products:**
- Images are uploaded immediately to storage
- Stored temporarily in component state
- Saved to database when product is created

**Existing Products:**
- Images are uploaded and saved immediately
- No need to submit the form to save images

## Usage

### Adding Images During Product Creation

1. Fill out product details
2. Click "Choose File" or "Take Photo" (mobile)
3. Select/capture image
4. Image is automatically compressed and uploaded
5. First image is set as primary
6. Add more images (up to 5 total)
7. Submit the form to create product with images

### Managing Images on Existing Products

1. Open product edit page
2. Scroll to "Product Images" section
3. **To add image:**
   - Click "Choose File" or "Take Photo"
   - Image uploads immediately
4. **To set primary image:**
   - Hover over image (desktop)
   - Click star icon
5. **To delete image:**
   - Hover over image (desktop)
   - Click X icon
   - Confirm deletion

### Mobile Usage

1. **Take Photo:**
   - Click "Take Photo" button
   - Camera app opens
   - Take photo
   - Photo is automatically uploaded

2. **Choose from Gallery:**
   - Click "Choose File" button
   - Select image from gallery
   - Image is automatically uploaded

## File Requirements

### Accepted File Types
- JPEG (.jpg, .jpeg)
- PNG (.png)
- WebP (.webp)
- GIF (.gif)

### Size Limits
- **Maximum File Size**: 5MB per image
- **Recommended Size**: 1200x1200 pixels or smaller
- **Automatic Compression**: Images are compressed to reduce storage:
  - Max dimensions: 1200x1200 pixels
  - Quality: 85%
  - Maintains aspect ratio

### Storage Organization
Images are organized by product:
```
product-images/
  └── {product-id}/
      ├── {timestamp}-{random-id}.jpg
      ├── {timestamp}-{random-id}.jpg
      └── ...
```

For new products (before saved):
```
product-images/
  └── temp/
      ├── {timestamp}-{random-id}.jpg
      └── ...
```

## Security & Permissions

### RLS Policies
Row Level Security policies are in place:

- **View**: Public can view all product images (bucket is public)
- **Upload**: Only authenticated users with roles: `admin`, `manager`, `inventory_staff`
- **Delete**: Only authenticated users with roles: `admin`, `manager`, `inventory_staff`
- **Update**: Only authenticated users with roles: `admin`, `manager`, `inventory_staff`

### Validation
- Client-side validation for file type and size
- Server-side validation via RLS policies
- Storage bucket-level restrictions on file types and sizes

## Performance Optimizations

### Image Compression
- All images are compressed before upload
- Reduces file size by 50-70% on average
- Maintains visual quality
- Faster page loads

### Lazy Loading
- Images use Next.js Image component
- Automatic lazy loading
- Responsive image sizes
- Optimized for different screen sizes

### Caching
- Images cached with 1-hour cache control
- Public CDN delivery via Supabase
- Faster subsequent loads

## Troubleshooting

### "Failed to upload image"
- **Check file size**: Must be under 5MB
- **Check file type**: Must be JPEG, PNG, WebP, or GIF
- **Check permissions**: User must have proper role (admin, manager, or inventory_staff)
- **Check connection**: Ensure stable internet connection

### "Invalid image URL format"
- Contact admin - may indicate storage configuration issue
- Check Supabase storage bucket is properly configured

### Camera not working on mobile
- **Check permissions**: Ensure browser has camera access
- **Check browser**: Use modern mobile browser (Chrome, Safari)
- **Check HTTPS**: Camera access requires HTTPS connection

### Images not displaying
- **Check storage bucket**: Ensure bucket is public
- **Check RLS policies**: Verify policies allow public read access
- **Check image URL**: Verify URL is valid and accessible

## Future Enhancements

Potential future improvements:

1. **Drag & Drop**: Drag images to reorder
2. **Bulk Upload**: Upload multiple images at once
3. **Image Editing**: Crop and rotate images before upload
4. **AI Alt Text**: Automatically generate alt text using AI
5. **Image Variants**: Generate thumbnails and different sizes
6. **Gallery View**: Full-screen image gallery viewer
7. **Image Zoom**: Zoom in on images for details

## API Reference

### Upload Image
```typescript
const imageUrl = await uploadProductImage(file, productId)
```

### Delete Image
```typescript
await deleteProductImage(imageUrl)
```

### Add to Database
```typescript
const image = await addProductImageRecord(productId, url, isPrimary)
```

### Remove from Database
```typescript
await removeProductImageRecord(imageId)
```

### Set Primary
```typescript
await setPrimaryImage(productId, imageId)
```

### Validate File
```typescript
const error = validateImageFile(file)
if (error) {
  console.error(error)
}
```

### Compress Image
```typescript
const compressed = await compressImage(file, 1200, 1200, 0.85)
```

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review Supabase storage dashboard
3. Check browser console for error messages
4. Verify user has proper permissions

---

**Last Updated**: February 14, 2026
**Version**: 1.0.0
