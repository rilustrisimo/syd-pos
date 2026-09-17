'use client'

import { useRef, useState } from 'react'
import { Lightbulb, Search, X, Sparkles, Trash2, Check, Upload, Download } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { downloadCSV } from '@/lib/utils/export'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
  useContentIdeas,
  useCreateContentIdea,
  useMarkContentIdeaStatus,
  useDeleteContentIdea,
  type ContentIdea,
  type ContentIdeaStatus,
} from '@/hooks/useContentIdeas'
import { usePOSProductSearch } from '@/hooks/useTransactions'
import { useShopBranchId } from '@/hooks/useShopSettings'

const STATUS_TABS: { value: ContentIdeaStatus | 'all'; label: string }[] = [
  { value: 'idea', label: 'Ideas' },
  { value: 'created', label: 'Created' },
  { value: 'posted', label: 'Posted' },
  { value: 'all', label: 'All' },
]

const STATUS_COLORS: Record<ContentIdeaStatus, string> = {
  idea: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  created: 'bg-blue-100 text-blue-800 border-blue-200',
  posted: 'bg-green-100 text-green-800 border-green-200',
}

const SAMPLE_CSV_ROWS = [
  { title: 'Rainy season roofing tips', description: 'Quick checks homeowners can do before the rains get heavy', image_concept: 'worker inspecting a roof in light rain' },
  { title: 'Cement restock announcement', description: 'Portland cement 40kg back in stock, mention bulk pricing for contractors', image_concept: 'stacked cement bags in the warehouse' },
  { title: 'Bulk discount reminder', description: 'Remind contractors about volume pricing on rebar and hollow blocks', image_concept: '' },
]

function downloadSampleIdeasCSV() {
  downloadCSV(SAMPLE_CSV_ROWS, 'content-ideas-sample.csv')
}

// Same hand-rolled RFC4180-ish parser used by the stocktake CSV import
// (src/app/(dashboard)/inventory/stocktake/page.tsx) — kept page-local
// there too, so duplicated here rather than extracted into a shared
// util for a single second caller.
function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i]

    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows.filter((r) => r.some((f) => f.trim() !== ''))
}

function NewIdeaForm({ onCreated }: { onCreated: () => void }) {
  const create = useCreateContentIdea()
  const { data: branchId } = useShopBranchId()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [imageConcept, setImageConcept] = useState('')
  const [productQuery, setProductQuery] = useState('')
  const { data: searchResults = [], isLoading: isSearching } = usePOSProductSearch(productQuery, branchId ?? '')
  const [selectedProduct, setSelectedProduct] = useState<{ id: string; name: string } | null>(null)

  async function handleCreate() {
    if (!title.trim()) {
      toast.error('Give the idea a title first.')
      return
    }
    try {
      await create.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        image_concept: imageConcept.trim() || undefined,
        source_product_id: selectedProduct?.id,
      })
      toast.success('Idea added')
      setTitle('')
      setDescription('')
      setImageConcept('')
      setSelectedProduct(null)
      setProductQuery('')
      onCreated()
    } catch (e: any) {
      toast.error(e.message || 'Failed to add idea')
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Lightbulb className="w-4 h-4" /> Add Idea
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          placeholder={'Title — e.g. "Rainy season roofing tips"'}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="text-sm"
        />
        <Textarea
          placeholder="Description / brief — what should this post cover?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="text-sm"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            placeholder={'Suggested visual (optional) — e.g. "worker on a roof in the rain"'}
            value={imageConcept}
            onChange={(e) => setImageConcept(e.target.value)}
            className="text-sm"
          />
          <div className="space-y-1">
            {selectedProduct ? (
              <div className="flex items-center justify-between border rounded-md px-3 py-2 text-sm bg-muted/30 h-9">
                <span className="truncate">{selectedProduct.name}</span>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setSelectedProduct(null)}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Link a product (optional)..."
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
        </div>
        <div className="flex justify-end">
          <Button onClick={handleCreate} disabled={create.isPending}>
            {create.isPending ? 'Adding...' : 'Add Idea'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function IdeaCard({ idea }: { idea: ContentIdea }) {
  const router = useRouter()
  const markStatus = useMarkContentIdeaStatus()
  const deleteIdea = useDeleteContentIdea()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  return (
    <Card>
      <CardContent className="pt-4 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={STATUS_COLORS[idea.status]}>{idea.status}</Badge>
          {idea.source_product && (
            <span className="text-xs text-slate-500">Product: {idea.source_product.name}</span>
          )}
        </div>
        <p className="font-medium text-sm">{idea.title}</p>
        {idea.description && <p className="text-sm text-slate-600">{idea.description}</p>}
        {idea.image_concept && (
          <p className="text-xs text-slate-400 italic">Visual: {idea.image_concept}</p>
        )}
        <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
          <div className="flex items-center gap-1">
            {idea.status === 'idea' && (
              <Button
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={() => router.push(`/marketing?idea=${idea.id}`)}
              >
                <Sparkles className="w-3.5 h-3.5" /> Generate Script
              </Button>
            )}
            {idea.status === 'created' && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1"
                onClick={() => markStatus.mutate({ id: idea.id, status: 'posted' })}
              >
                <Check className="w-3.5 h-3.5" /> Mark Posted
              </Button>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 text-slate-400 hover:text-red-600"
            onClick={() => setShowDeleteConfirm(true)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </CardContent>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this idea?</AlertDialogTitle>
            <AlertDialogDescription>This can&apos;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteIdea.mutate(idea.id, { onSuccess: () => setShowDeleteConfirm(false) })}
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

export default function ContentIdeasPage() {
  const [statusTab, setStatusTab] = useState<ContentIdeaStatus | 'all'>('idea')
  const { data: ideas = [], isLoading, refetch } = useContentIdeas(statusTab === 'all' ? undefined : statusTab)
  const createIdea = useCreateContentIdea()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setImporting(true)
    try {
      const text = await file.text()
      const parsed = parseCSV(text)
      if (parsed.length < 2) {
        toast.error('CSV must have a header row and at least one data row')
        return
      }

      const headers = parsed[0].map((h) => h.trim().toLowerCase())
      const titleCol = headers.indexOf('title')
      const descriptionCol = headers.indexOf('description')
      const imageConceptCol = headers.indexOf('image_concept')

      if (titleCol === -1) {
        toast.error('CSV must have a "title" column — see the sample CSV for the expected format')
        return
      }

      let imported = 0
      let skipped = 0
      for (const row of parsed.slice(1)) {
        const title = row[titleCol]?.trim()
        if (!title) { skipped++; continue }
        try {
          await createIdea.mutateAsync({
            title,
            description: descriptionCol !== -1 ? row[descriptionCol]?.trim() || undefined : undefined,
            image_concept: imageConceptCol !== -1 ? row[imageConceptCol]?.trim() || undefined : undefined,
          })
          imported++
        } catch {
          skipped++
        }
      }

      if (imported > 0) {
        toast.success(`Imported ${imported} idea${imported === 1 ? '' : 's'}${skipped > 0 ? ` (${skipped} row${skipped === 1 ? '' : 's'} skipped)` : ''}`)
      } else {
        toast.error('No ideas were imported — check the CSV has a title in every row')
      }
      refetch()
    } catch {
      toast.error('Failed to read CSV file')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Lightbulb className="w-6 h-6" />
            Content Ideas
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">A bank of post ideas — the briefs scripts and creatives are generated from</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" className="text-xs gap-1.5" onClick={downloadSampleIdeasCSV}>
            <Download className="w-3.5 h-3.5" /> Sample CSV
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleImportFile}
          />
          <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            <Upload className="w-3.5 h-3.5" /> {importing ? 'Importing...' : 'Import CSV'}
          </Button>
        </div>
      </div>

      <NewIdeaForm onCreated={() => refetch()} />

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
      ) : ideas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
          <Lightbulb className="w-10 h-10 opacity-30" />
          <p className="text-sm">No ideas here yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {ideas.map((idea) => <IdeaCard key={idea.id} idea={idea} />)}
        </div>
      )}
    </div>
  )
}
