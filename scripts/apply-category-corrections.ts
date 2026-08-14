// Applies category corrections found during manual review of scripts/category-audit-2026-08-14.csv.
// Each entry moves a product (matched by its unique `code`) to the category/subcategory that
// matches how its sibling products are already classified, or to the category that actually
// matches what the product is (verified via domain knowledge / web search where uncertain).
//
// Run:  set -a && source ../syd-shop/.env.local && set +a && npx tsx scripts/apply-category-corrections.ts
//       add --dry-run to preview without writing

import { createClient } from '@supabase/supabase-js'

interface Correction {
  code: string
  category: string
  subcategory?: string | null // null = explicitly clear the subcategory; omit = leave subcategory untouched
  reason: string
}

const CORRECTIONS: Correction[] = [
  // Plumbing fixtures that were dumped into the generic "Hardware" bucket —
  // all their close siblings (faucets, valves) are correctly under Plumbing.
  { code: 'WH-FAUCET', category: 'Plumbing', subcategory: 'Faucets', reason: 'Kitchen faucet — other faucets are under Plumbing > Faucets' },
  { code: 'YZ-FAUCET', category: 'Plumbing', subcategory: 'Faucets', reason: 'Lavatory faucet — other faucets are under Plumbing > Faucets' },
  { code: 'WATER-BOWL', category: 'Plumbing', reason: 'Toilet bowl/water closet is a plumbing fixture' },
  { code: 'ST-SINK-SMALL', category: 'Plumbing', reason: 'Sink is a plumbing fixture' },
  { code: 'ST-SINK-MED', category: 'Plumbing', reason: 'Sink is a plumbing fixture' },
  { code: 'DRAIN-2X2', category: 'Plumbing', reason: 'Floor drain is a plumbing fixture' },
  { code: 'PLUNGER', category: 'Plumbing', reason: 'Plumbing tool for clearing drains' },
  { code: 'ANG-VALVE', category: 'Plumbing', reason: 'Valve — other valves (gate, ball) are under Plumbing' },
  { code: 'JNX-DS-2-1/2', category: 'Plumbing', reason: 'Drain strainer is a plumbing fixture' },

  // PVC solvent cement (pipe glue) — its siblings (Neltex, Sherman) are under Plumbing, not Adhesives.
  { code: 'JOS-SC', category: 'Plumbing', reason: 'PVC pipe cement — sibling products are under Plumbing' },

  // Epoxy primer is a paint/coating product, not glue — Paint & Finishes already
  // has a Primers & Sealers subcategory used by other primers.
  { code: 'WEB-EPOXY-1L', category: 'Paint & Finishes', subcategory: 'Primers & Sealers', reason: 'Primer, not adhesive — matches other primers in Paint & Finishes' },
  { code: 'WEB-EPOXY-GAL', category: 'Paint & Finishes', subcategory: 'Primers & Sealers', reason: 'Primer, not adhesive — matches other primers in Paint & Finishes' },

  // Hand tools that ended up outside the Tools category while identical sibling
  // products (other trowels, mallets, putty knives) are correctly under Tools.
  { code: 'RUB-TROWEL', category: 'Tools', subcategory: 'Hand Tools', reason: 'Trowel — other trowels are under Tools > Hand Tools' },
  { code: 'MALLET-RUB', category: 'Tools', subcategory: 'Hand Tools', reason: 'Mallet — other hammers are under Tools > Hand Tools' },
  { code: 'JOSE-PK4', category: 'Tools', reason: 'Putty knife — other putty knives are under Tools' },

  // Singleton/duplicate category — the other 5 cement brands are under "Cement & Masonry".
  { code: 'SAH-CEM', category: 'Cement & Masonry', reason: 'Merge singleton "Cement & Concrete" category into the established "Cement & Masonry" one' },

  // Cement sold by the sack is still cement, not an aggregate/fill material like sand/gravel.
  { code: 'CEM-HOL-SACK', category: 'Cement & Masonry', reason: 'Cement, not an aggregate/fill material' },
]

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env')
    process.exit(1)
  }
  const supabase = createClient(supabaseUrl, serviceKey)

  const { data: categories, error: catErr } = await supabase.from('product_categories').select('id, name')
  if (catErr) { console.error(catErr.message); process.exit(1) }
  const { data: subcategories, error: subErr } = await supabase.from('product_subcategories').select('id, name, category_id')
  if (subErr) { console.error(subErr.message); process.exit(1) }

  const catByName = new Map((categories ?? []).map(c => [c.name, c.id]))

  let applied = 0
  let failed = 0

  for (const fix of CORRECTIONS) {
    const category_id = catByName.get(fix.category)
    if (!category_id) {
      console.error(`✗ ${fix.code}: category "${fix.category}" not found`)
      failed++
      continue
    }

    let subcategory_id: string | null | undefined = undefined
    if (fix.subcategory) {
      const sub = (subcategories ?? []).find(s => s.name === fix.subcategory && s.category_id === category_id)
      if (!sub) {
        console.error(`✗ ${fix.code}: subcategory "${fix.subcategory}" not found under "${fix.category}"`)
        failed++
        continue
      }
      subcategory_id = sub.id
    } else if (fix.subcategory === null) {
      subcategory_id = null
    }

    const update: Record<string, unknown> = { category_id }
    if (subcategory_id !== undefined) update.subcategory_id = subcategory_id

    console.log(`${dryRun ? '[dry-run] ' : ''}${fix.code} → ${fix.category}${fix.subcategory ? ' > ' + fix.subcategory : ''}  (${fix.reason})`)

    if (!dryRun) {
      const { error } = await supabase.from('products').update(update).eq('code', fix.code)
      if (error) {
        console.error(`  ✗ update failed: ${error.message}`)
        failed++
        continue
      }
    }
    applied++
  }

  console.log(`\n${dryRun ? 'Would apply' : 'Applied'} ${applied} corrections, ${failed} failed`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
