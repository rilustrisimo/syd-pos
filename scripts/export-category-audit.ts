// Exports every active product with its category/subcategory to a CSV for manual review.
// Also adds a `flagged` column: TRUE when the product's name shares no meaningful word
// with its category or subcategory name. This is a coarse heuristic to help you prioritize
// which rows to eyeball first — it is NOT a verdict. Plenty of correctly-categorized
// products (e.g. "U-Nail Staple" under "Hardware") will still get flagged since the words
// just don't overlap. Sort by `flagged` and scan those first, but a full read of the sheet
// is still the reliable way to catch real miscategorizations.
//
// Run:  set -a && source .env.local && set +a && npx tsx scripts/export-category-audit.ts
// (uses SUPABASE_SERVICE_ROLE_KEY from syd-shop/.env.local — copy it into syd-pos's env
// or export it manually before running if it's not already present here)

import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'

const STOPWORDS = new Set([
  'pc', 'pcs', 'kg', 'g', 'mm', 'cm', 'm', 'in', 'inch', 'inches', 'ft', 'feet',
  'gal', 'gallon', 'ltr', 'liter', 'litre', 'l', 'set', 'sets', 'pack', 'roll',
  'rolls', 'box', 'boxes', 'bag', 'bags', 'pair', 'pairs', 'piece', 'pieces',
  'the', 'and', 'or', 'of', 'for', 'with', 'per', 'no', 'size', 'type', 'each',
]);

function tokenize(text: string | null | undefined): Set<string> {
  if (!text) return new Set()
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(w => w.length >= 3 && !/^\d+$/.test(w) && !STOPWORDS.has(w))
  )
}

function hasOverlap(a: Set<string>, b: Set<string>): boolean {
  for (const w of a) if (b.has(w)) return true
  return false
}

function csvEscape(val: string | number | boolean): string {
  const s = String(val)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env')
    process.exit(1)
  }
  const supabase = createClient(supabaseUrl, serviceKey)

  const { data: products, error } = await supabase
    .from('products')
    .select(`
      id, code, name, current_selling_price, is_active,
      category:product_categories!products_category_id_fkey(id, name),
      subcategory:product_subcategories(id, name)
    `)
    .order('is_active', { ascending: false })
    .order('name')

  if (error) {
    console.error('Query failed:', error.message)
    process.exit(1)
  }

  const rows = (products ?? []).map((p: any) => {
    const categoryName = p.category?.name ?? ''
    const subcategoryName = p.subcategory?.name ?? ''
    const nameTokens = tokenize(p.name)
    const catTokens = new Set([...tokenize(categoryName), ...tokenize(subcategoryName)])
    const flagged = catTokens.size > 0 && !hasOverlap(nameTokens, catTokens)

    return {
      code: p.code ?? '',
      name: p.name ?? '',
      category: categoryName,
      subcategory: subcategoryName,
      flagged,
      is_active: !!p.is_active,
      price: Number(p.current_selling_price ?? 0),
    }
  })

  // Sorted by category first, not by flag — with real product names (brand
  // names, trade synonyms like "glue" for "Adhesives"), the word-overlap flag
  // has too many false positives to be a reliable priority order on its own.
  // Grouping by category is what actually lets a human eyeball an outlier
  // (e.g. a garden hose sitting in "Electrical") in a sorted spreadsheet.
  rows.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category)
    return a.name.localeCompare(b.name)
  })

  const header = ['code', 'name', 'category', 'subcategory', 'flagged', 'is_active', 'price']
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push([r.code, r.name, r.category, r.subcategory, r.flagged, r.is_active, r.price]
      .map(csvEscape).join(','))
  }

  const outPath = `scripts/category-audit-${new Date().toISOString().slice(0, 10)}.csv`
  writeFileSync(outPath, lines.join('\n'))

  const flaggedCount = rows.filter(r => r.flagged).length
  console.log(`Wrote ${rows.length} products to ${outPath}`)
  console.log(`${flaggedCount} flagged for priority review (${((flaggedCount / rows.length) * 100).toFixed(0)}%)`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
