# Safe Migration Guide - Product Images Storage

## ⚠️ IMPORTANT: This migration is SAFE and will NOT affect existing data

This migration only:
- Creates a new storage bucket for product images
- Adds storage policies for access control
- Does NOT modify any existing tables or data

---

## 🔧 Apply Migration (Choose ONE method)

### Method 1: Supabase Dashboard (Easiest & Recommended)

1. **Open Supabase Dashboard**
   - Go to [https://app.supabase.com](https://app.supabase.com)
   - Select your project

2. **Navigate to SQL Editor**
   - Click "SQL Editor" in the left sidebar
   - Click "New Query"

3. **Copy & Execute SQL**
   - Open the file: `supabase/migrations/00014_create_storage_buckets.sql`
   - Copy ALL the contents
   - Paste into SQL Editor
   - Click "Run" or press Cmd/Ctrl + Enter

4. **Verify Storage Bucket Created**
   - Go to "Storage" in left sidebar
   - You should see `product-images` bucket

---

### Method 2: Supabase CLI (If you have CLI installed)

```bash
# Navigate to project directory
cd /Users/eyorsogood/Sites/syd/syd-pos

# Apply specific migration only
supabase db push

# This will apply any new migrations without resetting data
```

---

### Method 3: Manual Creation via Dashboard

#### Step 1: Create Storage Bucket

1. Go to **Storage** in Supabase Dashboard
2. Click **"New bucket"**
3. Configure bucket:
   - **Name**: `product-images`
   - **Public bucket**: ✅ YES
   - **File size limit**: 5242880 (5MB)
   - **Allowed MIME types**: `image/jpeg, image/jpg, image/png, image/webp, image/gif`
4. Click **"Create bucket"**

#### Step 2: Add Storage Policies

1. Go to **SQL Editor**
2. Run this SQL:

```sql
-- Public can view product images
CREATE POLICY "Public can view product images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'product-images');

-- Authenticated users can upload product images
CREATE POLICY "Authenticated users can upload product images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product-images' AND
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'manager', 'inventory_staff')
  )
);

-- Authenticated users can update product images
CREATE POLICY "Authenticated users can update product images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'product-images' AND
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'manager', 'inventory_staff')
  )
);

-- Authenticated users can delete product images
CREATE POLICY "Authenticated users can delete product images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'product-images' AND
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'manager', 'inventory_staff')
  )
);
```

---

## ✅ Verify Installation

After applying the migration, verify everything is set up:

### 1. Check Storage Bucket Exists

Go to **Storage** → You should see `product-images` bucket

### 2. Test Upload (via Dashboard)

1. Go to Storage → `product-images` bucket
2. Try uploading a test image
3. If successful, storage is working!

### 3. Test in Application

1. Go to Products → Add/Edit Product
2. Scroll to "Product Images" section
3. Click "Choose File" and upload an image
4. If successful, everything is working! 🎉

---

## 🐛 Troubleshooting

### "Bucket already exists" Error
- **Solution**: Bucket already created, skip creation step
- **Action**: Just add the policies (Step 2 in Method 3)

### "Permission denied" Error
- **Solution**: Check your Supabase user role
- **Action**: Ensure you're logged in with proper permissions

### "Policy already exists" Error
- **Solution**: Policy already created
- **Action**: This is ok, migration already applied

### Upload fails in application
- **Check 1**: Verify bucket is public (Storage → bucket settings)
- **Check 2**: Verify policies are created (SQL Editor → check the queries above)
- **Check 3**: Check browser console for specific error messages

---

## 📝 Migration File Location

The SQL migration file is located at:
```
/Users/eyorsogood/Sites/syd/syd-pos/supabase/migrations/00014_create_storage_buckets.sql
```

---

## 🎯 What This Migration Does

**Creates:**
- ✅ Storage bucket named `product-images`
- ✅ Public read access (anyone can view images via URL)
- ✅ Role-based write access (only admin, manager, inventory_staff can upload/delete)

**Does NOT:**
- ❌ Modify existing tables
- ❌ Delete any data
- ❌ Change existing migrations
- ❌ Affect current products or transactions

**100% Safe** - This only adds new storage functionality!

---

## 📞 Need Help?

If you encounter issues:
1. Check Supabase project logs (Dashboard → Logs)
2. Verify environment variables in `.env.local`
3. Check browser console for errors
4. Ensure you're using the latest version of the app

---

**Status**: Ready to apply ✅  
**Risk Level**: None - Safe migration 🟢  
**Estimated Time**: 2-3 minutes
