'use client'

import { useRef, useState } from 'react'
import { Images, Upload, Trash2, Film, FileImage, Search, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
  useProductImagesSearch,
  getContentMediaUrl,
  type ContentMedia,
} from '@/hooks/useContentMedia'
import { useSearchStockMedia, useImportStockMedia, type StockKind, type StockSearchResult } from '@/hooks/useStockMedia'
import { MediaLightbox } from '@/components/marketing/media-lightbox'
import { uploadMediaFile } from '@/lib/marketing/upload'
import { downloadMediaFile } from '@/lib/marketing/download'

const SOURCE_LABELS: Record<StockSearchResult['source'], string> = {
  pexels: 'Pexels',
  pixabay: 'Pixabay',
  unsplash: 'Unsplash',
}

const STOCK_KINDS: { value: StockKind; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Videos' },
]

function StockSearchTab() {
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<StockKind>('all')
  const search = useSearchStockMedia()
  const importMedia = useImportStockMedia()
  const [importingKey, setImportingKey] = useState<string | null>(null)
  const results = search.data ?? []

  function handleSearch(nextKind: StockKind = kind) {
    if (!query.trim()) return
    search.mutate({ q: query.trim(), kind: nextKind })
  }

  // Switching the filter re-runs the current search.
  function handleKind(next: StockKind) {
    setKind(next)
    handleSearch(next)
  }

  async function handleImport(result: StockSearchResult) {
    const key = `${result.source}-${result.id}`
    setImportingKey(key)
    try {
      await importMedia.mutateAsync(result)
      toast.success('Added to library')
    } catch (e: any) {
      toast.error(e.message || 'Failed to import')
    } finally {
      setImportingKey(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search Pexels, Pixabay, and Unsplash..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="pl-8 text-sm"
          />
        </div>
        <div className="flex rounded-md border p-0.5" role="group" aria-label="Media type">
          {STOCK_KINDS.map((k) => (
            <Button
              key={k.value}
              size="sm"
              variant={kind === k.value ? 'secondary' : 'ghost'}
              className="h-8 px-3 text-xs"
              aria-pressed={kind === k.value}
              onClick={() => handleKind(k.value)}
              disabled={search.isPending}
            >
              {k.label}
            </Button>
          ))}
        </div>
        <Button onClick={() => handleSearch()} disabled={search.isPending || !query.trim()}>
          {search.isPending ? 'Searching...' : 'Search'}
        </Button>
      </div>

      {search.isPending ? (
        <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Searching...</div>
      ) : results.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
          <Search className="w-10 h-10 opacity-30" />
          <p className="text-sm">{query ? 'No results — try a different search' : `Search for free stock ${kind === 'image' ? 'photos' : kind === 'video' ? 'videos' : 'photos and video'}`}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {results.map((result) => {
            const key = `${result.source}-${result.id}`
            return (
              <div key={key} className="border rounded-lg overflow-hidden">
                <div className="aspect-square bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={result.thumbnailUrl} alt={result.attribution} className="w-full h-full object-cover" />
                </div>
                <div className="p-2 space-y-1">
                  <div className="flex gap-1 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">{SOURCE_LABELS[result.source]}</Badge>
                    {result.type === 'video' && (
                      <Badge variant="outline" className="text-[10px]">
                        Video{result.durationSeconds ? ` · ${Math.floor(result.durationSeconds / 60)}:${String(Math.round(result.durationSeconds % 60)).padStart(2, '0')}` : ''}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 truncate" title={result.attribution}>{result.attribution}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-7 text-xs gap-1"
                    onClick={() => handleImport(result)}
                    disabled={importingKey === key}
                  >
                    <Download className="w-3 h-3" />
                    {importingKey === key ? 'Adding...' : 'Add to Library'}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ProductPhotosTab() {
  const [query, setQuery] = useState('')
  const { data: results = [], isLoading } = useProductImagesSearch(query)
  const createMedia = useCreateContentMedia()
  const [importingUrl, setImportingUrl] = useState<string | null>(null)

  // Product photos are referenced directly from wherever the catalog
  // already hosts them — no download/re-upload to R2, so there's no
  // server-side step here, just a content_media row pointing at the
  // existing URL (getContentMediaUrl already knows to pass full URLs
  // through as-is instead of treating them as an R2-relative key).
  async function handleImport(url: string, productName: string) {
    setImportingUrl(url)
    try {
      let sizeBytes = 0
      try {
        const headRes = await fetch(url, { method: 'HEAD' })
        const len = headRes.headers.get('content-length')
        if (len) sizeBytes = parseInt(len, 10)
      } catch {
        // Best-effort only — some hosts don't expose accurate HEAD responses.
      }
      const ext = url.split('.').pop()?.split('?')[0] || 'jpg'
      await createMedia.mutateAsync({
        media_type: 'image',
        storage_key: url,
        original_filename: `${productName}.${ext}`,
        mime_type: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        size_bytes: sizeBytes,
      })
      toast.success('Added to library')
    } catch (e: any) {
      toast.error(e.message || 'Failed to import')
    } finally {
      setImportingUrl(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input
          placeholder="Search products by name..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8 text-sm"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Searching...</div>
      ) : query.trim().length < 2 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
          <Search className="w-10 h-10 opacity-30" />
          <p className="text-sm">Type at least 2 characters to search products</p>
        </div>
      ) : results.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
          <FileImage className="w-10 h-10 opacity-30" />
          <p className="text-sm">No product photos found</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {results.map((result) => {
            const key = `${result.product_id}-${result.url}`
            return (
              <div key={key} className="border rounded-lg overflow-hidden">
                <div className="aspect-square bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={result.url} alt={result.product_name} className="w-full h-full object-cover" />
                </div>
                <div className="p-2 space-y-1">
                  <p className="text-[11px] text-slate-600 truncate" title={result.product_name}>{result.product_name}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-7 text-xs gap-1"
                    onClick={() => handleImport(result.url, result.product_name)}
                    disabled={importingUrl === result.url}
                  >
                    <Download className="w-3 h-3" />
                    {importingUrl === result.url ? 'Adding...' : 'Add to Library'}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ContentLibraryPage() {
  const { data: media = [], isLoading } = useContentMedia()
  const createMedia = useCreateContentMedia()
  const deleteMedia = useDeleteContentMedia()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  async function handleDownload(item: ContentMedia, url: string) {
    setDownloadingId(item.id)
    try {
      await downloadMediaFile(url, item.original_filename)
    } finally {
      setDownloadingId(null)
    }
  }
  const [tab, setTab] = useState<'uploads' | 'stock' | 'products'>('uploads')

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setUploading(true)
    try {
      await createMedia.mutateAsync(await uploadMediaFile(file, file.name))

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
        {tab === 'uploads' && (
          <>
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
          </>
        )}
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant={tab === 'uploads' ? 'default' : 'outline'} onClick={() => setTab('uploads')}>
          My Uploads
        </Button>
        <Button size="sm" variant={tab === 'stock' ? 'default' : 'outline'} onClick={() => setTab('stock')}>
          Search Stock
        </Button>
        <Button size="sm" variant={tab === 'products' ? 'default' : 'outline'} onClick={() => setTab('products')}>
          Product Photos
        </Button>
      </div>

      {tab === 'stock' ? (
        <StockSearchTab />
      ) : tab === 'products' ? (
        <ProductPhotosTab />
      ) : (
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
                    <div className="p-2 flex items-start gap-1">
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <p className="text-xs font-medium truncate" title={item.original_filename}>{item.original_filename}</p>
                        <p className="text-[11px] text-slate-400">
                          {formatSize(item.size_bytes)}
                          {item.duration_seconds != null && ` · ${Math.round(item.duration_seconds)}s`}
                        </p>
                      </div>
                      {url && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 flex-shrink-0 text-slate-500 hover:text-blue-600"
                          title="Download"
                          aria-label={`Download ${item.original_filename}`}
                          disabled={downloadingId === item.id}
                          onClick={() => handleDownload(item, url)}
                        >
                          <Download className={`w-3.5 h-3.5 ${downloadingId === item.id ? 'animate-pulse' : ''}`} />
                        </Button>
                      )}
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
      )}

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
