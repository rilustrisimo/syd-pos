'use client'

import { useState } from 'react'
import { Megaphone, Sparkles, Search, ExternalLink, Check, X, Trash2, Image as ImageIcon, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  useContentSuggestions,
  useGenerateContentSuggestion,
  useUpdateContentSuggestionCaption,
  useAttachCreativeMedia,
  useGenerateCreative,
  useReviewContentSuggestion,
  useDeleteContentSuggestion,
  type ContentSuggestion,
  type SuggestionStatus,
  type SuggestionPlatform,
  type CreativeTemplate,
} from '@/hooks/useContentSuggestions'
import { useContentMedia, getContentMediaUrl } from '@/hooks/useContentMedia'
import { usePOSProductSearch } from '@/hooks/useTransactions'
import { useShopBranchId } from '@/hooks/useShopSettings'

const STATUS_TABS: { value: SuggestionStatus | 'all'; label: string }[] = [
  { value: 'suggested', label: 'Needs Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
]

const STATUS_COLORS: Record<SuggestionStatus, string> = {
  suggested: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  approved: 'bg-green-100 text-green-800 border-green-200',
  rejected: 'bg-gray-100 text-gray-500 border-gray-200',
}

const CREATIVE_TEMPLATES: { value: CreativeTemplate; label: string }[] = [
  { value: 'new-arrival', label: 'New Arrival' },
  { value: 'promo', label: 'Promo / Sale' },
  { value: 'spotlight', label: 'Spotlight' },
]

function NewSuggestionForm({ onCreated }: { onCreated: () => void }) {
  const generate = useGenerateContentSuggestion()
  const { data: branchId } = useShopBranchId()
  const { data: mediaList = [] } = useContentMedia()

  const [productQuery, setProductQuery] = useState('')
  const { data: searchResults = [], isLoading: isSearching } = usePOSProductSearch(productQuery, branchId ?? '')
  const [selectedProduct, setSelectedProduct] = useState<{ id: string; name: string } | null>(null)
  const [selectedMediaId, setSelectedMediaId] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [platform, setPlatform] = useState<SuggestionPlatform>('facebook')

  async function handleGenerate() {
    if (!selectedProduct && !selectedMediaId && !notes.trim()) {
      toast.error('Pick a product or media item, or write a brief, before generating.')
      return
    }
    try {
      await generate.mutateAsync({
        source_product_id: selectedProduct?.id,
        source_media_id: selectedMediaId || undefined,
        notes: notes.trim() || undefined,
        platform,
      })
      toast.success('Draft generated — review it below')
      setSelectedProduct(null)
      setProductQuery('')
      setSelectedMediaId('')
      setNotes('')
      onCreated()
    } catch (e: any) {
      toast.error(e.message || 'Failed to generate')
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> New Suggestion
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-slate-500">Product (optional)</label>
            {selectedProduct ? (
              <div className="flex items-center justify-between border rounded-md px-3 py-2 text-sm bg-muted/30">
                <span className="truncate">{selectedProduct.name}</span>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setSelectedProduct(null)}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Search product by name or code..."
                  value={productQuery}
                  onChange={(e) => setProductQuery(e.target.value)}
                  className="pl-8 h-9 text-sm"
                />
                {productQuery.length >= 2 && (
                  <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto border rounded-md bg-white shadow-md divide-y">
                    {isSearching ? (
                      <p className="text-xs text-slate-400 p-2 text-center">Searching...</p>
                    ) : searchResults.length === 0 ? (
                      <p className="text-xs text-slate-400 p-2 text-center">No products found</p>
                    ) : (
                      searchResults.map((p: any) => (
                        <button
                          key={p.id}
                          type="button"
                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 truncate"
                          onClick={() => { setSelectedProduct({ id: p.id, name: p.name }); setProductQuery('') }}
                        >
                          {p.name}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs text-slate-500">Media (optional)</label>
            <Select value={selectedMediaId} onValueChange={setSelectedMediaId}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Pick from the library" />
              </SelectTrigger>
              <SelectContent>
                {mediaList.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.original_filename}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-slate-500">Brief / notes (optional)</label>
          <Textarea
            placeholder="e.g. emphasize the bulk discount, mention it's back in stock..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="text-sm"
          />
        </div>

        <div className="flex items-center justify-between">
          <Select value={platform} onValueChange={(v) => setPlatform(v as SuggestionPlatform)}>
            <SelectTrigger className="h-9 text-sm w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="facebook">Facebook</SelectItem>
              <SelectItem value="instagram">Instagram</SelectItem>
              <SelectItem value="both">Both</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleGenerate} disabled={generate.isPending}>
            <Sparkles className="w-4 h-4 mr-2" />
            {generate.isPending ? 'Generating...' : 'Generate Draft'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function SuggestionCard({ suggestion }: { suggestion: ContentSuggestion }) {
  const updateCaption = useUpdateContentSuggestionCaption()
  const attachCreative = useAttachCreativeMedia()
  const generateCreative = useGenerateCreative()
  const review = useReviewContentSuggestion()
  const deleteSuggestion = useDeleteContentSuggestion()
  const { data: mediaList = [] } = useContentMedia()

  const currentCaption = suggestion.caption_final ?? suggestion.caption_draft
  const [caption, setCaption] = useState(currentCaption)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [template, setTemplate] = useState<CreativeTemplate>('new-arrival')
  const dirty = caption !== currentCaption

  function handleGenerateCreative() {
    generateCreative.mutate(
      { id: suggestion.id, template },
      { onSuccess: () => toast.success('Creative generated'), onError: (e) => toast.error(e.message) }
    )
  }

  const sourceUrl = suggestion.source_media ? getContentMediaUrl(suggestion.source_media.storage_key) : null
  const creativeUrl = suggestion.creative_media ? getContentMediaUrl(suggestion.creative_media.storage_key) : null

  function handleSaveCaption() {
    updateCaption.mutate(
      { id: suggestion.id, caption_final: caption },
      { onSuccess: () => toast.success('Caption updated'), onError: (e) => toast.error(e.message) }
    )
  }

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={STATUS_COLORS[suggestion.status]}>{suggestion.status}</Badge>
          <Badge variant="outline" className="capitalize">{suggestion.platform}</Badge>
          {suggestion.source_product && (
            <span className="text-xs text-slate-500">Product: {suggestion.source_product.name}</span>
          )}
        </div>

        {(sourceUrl || creativeUrl) && (
          <div className="flex gap-2">
            {sourceUrl && (
              <div className="w-20 h-20 rounded-md overflow-hidden bg-slate-100 flex-shrink-0">
                {suggestion.source_media?.media_type === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={sourceUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <video src={sourceUrl} className="w-full h-full object-cover" muted />
                )}
              </div>
            )}
            {creativeUrl && (
              <div className="w-20 h-20 rounded-md overflow-hidden bg-slate-100 flex-shrink-0 ring-2 ring-blue-400">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={creativeUrl} alt="Creative" className="w-full h-full object-cover" />
              </div>
            )}
          </div>
        )}

        <Textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={3}
          className="text-sm"
        />

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={template} onValueChange={(v) => setTemplate(v as CreativeTemplate)}>
              <SelectTrigger className="h-8 text-xs w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CREATIVE_TEMPLATES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1"
              onClick={handleGenerateCreative}
              disabled={generateCreative.isPending}
            >
              <Wand2 className="w-3.5 h-3.5" />
              {generateCreative.isPending ? 'Generating...' : 'Generate Creative'}
            </Button>
            <Select
              value={suggestion.creative_media_id ?? ''}
              onValueChange={(v) => attachCreative.mutate({ id: suggestion.id, creative_media_id: v || null })}
            >
              <SelectTrigger className="h-8 text-xs w-44">
                <SelectValue placeholder="Attach existing..." />
              </SelectTrigger>
              <SelectContent>
                {mediaList.filter((m) => m.media_type === 'image').map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.original_filename}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <a href="https://www.canva.com/create/" target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1">
                Create in Canva <ExternalLink className="w-3 h-3" />
              </Button>
            </a>
          </div>

          <div className="flex items-center gap-1">
            {dirty && (
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleSaveCaption} disabled={updateCaption.isPending}>
                Save
              </Button>
            )}
            {suggestion.status === 'suggested' && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 text-green-600 hover:text-green-700"
                  onClick={() => review.mutate({ id: suggestion.id, status: 'approved' })}
                >
                  <Check className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 text-slate-400 hover:text-red-600"
                  onClick={() => review.mutate({ id: suggestion.id, status: 'rejected' })}
                >
                  <X className="w-4 h-4" />
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-slate-400 hover:text-red-600"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this suggestion?</AlertDialogTitle>
            <AlertDialogDescription>This can&apos;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteSuggestion.mutate(suggestion.id, { onSuccess: () => setShowDeleteConfirm(false) })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

export default function MarketingFeedPage() {
  const [statusTab, setStatusTab] = useState<SuggestionStatus | 'all'>('suggested')
  const { data: suggestions = [], isLoading, refetch } = useContentSuggestions(statusTab === 'all' ? undefined : statusTab)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Megaphone className="w-6 h-6" />
          Content Feed
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">AI-drafted post ideas, awaiting your review</p>
      </div>

      <NewSuggestionForm onCreated={() => refetch()} />

      <div className="flex gap-2">
        {STATUS_TABS.map((tab) => (
          <Button
            key={tab.value}
            size="sm"
            variant={statusTab === tab.value ? 'default' : 'outline'}
            onClick={() => setStatusTab(tab.value)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Loading...</div>
      ) : suggestions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
          <ImageIcon className="w-10 h-10 opacity-30" />
          <p className="text-sm">No suggestions here yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {suggestions.map((s) => <SuggestionCard key={s.id} suggestion={s} />)}
        </div>
      )}
    </div>
  )
}
