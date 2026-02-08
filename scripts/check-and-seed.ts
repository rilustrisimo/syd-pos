import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

// Load .env.local
dotenv.config({ path: path.join(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!

console.log('Supabase URL:', supabaseUrl ? 'Found' : 'Missing')
console.log('Supabase Key:', supabaseKey ? 'Found' : 'Missing')

const supabase = createClient(supabaseUrl, supabaseKey)

interface InventoryItem {
  item_code: string
  description: string
  unit: string
  default_quantity: number
  cost_price: number
  selling_price: number
  markup_percent: number
  weight_kg?: number
}

interface CategoryData {
  category: string
  items: InventoryItem[]
}

interface ConstructionMaterials {
  company: string
  inventory: CategoryData[]
}

async function checkDatabase() {
  console.log('Checking database...\n')

  // Check categories
  const { data: categories, error: catError } = await supabase
    .from('product_categories')
    .select('*')

  if (catError) {
    console.log('Error fetching categories:', catError.message)
  } else {
    console.log(`Categories found: ${categories?.length || 0}`)
    categories?.forEach(c => console.log(`  - ${c.name}`))
  }

  // Check units
  const { data: units, error: unitError } = await supabase
    .from('units_of_measure')
    .select('*')

  if (unitError) {
    console.log('Error fetching units:', unitError.message)
  } else {
    console.log(`\nUnits of measure found: ${units?.length || 0}`)
  }

  // Check products
  const { data: products, error: prodError } = await supabase
    .from('products')
    .select('*')

  if (prodError) {
    console.log('Error fetching products:', prodError.message)
  } else {
    console.log(`\nProducts found: ${products?.length || 0}`)
  }

  // Check branches
  const { data: branches, error: branchError } = await supabase
    .from('branches')
    .select('*')

  if (branchError) {
    console.log('Error fetching branches:', branchError.message)
  } else {
    console.log(`\nBranches found: ${branches?.length || 0}`)
    branches?.forEach(b => console.log(`  - ${b.name}`))
  }

  return { categories, units, products, branches }
}

async function seedFromJson() {
  console.log('\n--- Seeding from construction_materials.json ---\n')

  // Read the JSON file
  const jsonPath = path.join(__dirname, '../../construction_materials.json')
  const rawData = fs.readFileSync(jsonPath, 'utf-8')
  const data: ConstructionMaterials = JSON.parse(rawData)

  console.log(`Company: ${data.company}`)
  console.log(`Categories in JSON: ${data.inventory.length}`)

  // Get existing categories and units
  const { data: existingCategories } = await supabase
    .from('product_categories')
    .select('id, name')

  const { data: existingUnits } = await supabase
    .from('units_of_measure')
    .select('id, code, name')

  const categoryMap = new Map(existingCategories?.map(c => [c.name.toLowerCase(), c.id]) || [])
  const unitMap = new Map(existingUnits?.map(u => [u.code.toLowerCase(), u.id]) || [])

  // Add unit name mappings
  existingUnits?.forEach(u => {
    unitMap.set(u.name.toLowerCase(), u.id)
  })

  // Common unit mappings
  const unitAliases: Record<string, string> = {
    'pcs': 'PC',
    'pc': 'PC',
    'piece': 'PC',
    'pieces': 'PC',
    'box': 'BOX',
    'boxes': 'BOX',
    'bag': 'BAG',
    'bags': 'BAG',
    'kg': 'KG',
    'kilo': 'KG',
    'kilos': 'KG',
    'kilogram': 'KG',
    'm': 'M',
    'meter': 'M',
    'meters': 'M',
    'ft': 'FT',
    'foot': 'FT',
    'feet': 'FT',
    'roll': 'ROLL',
    'rolls': 'ROLL',
    'gallon': 'GAL',
    'gal': 'GAL',
    'liter': 'L',
    'liters': 'L',
    'l': 'L',
    'set': 'SET',
    'sets': 'SET',
    'pair': 'PAIR',
    'pairs': 'PAIR',
    'pack': 'PACK',
    'packs': 'PACK',
    'bundle': 'BUNDLE',
    'bundles': 'BUNDLE',
    'sheet': 'SHEET',
    'sheets': 'SHEET',
    'length': 'LENGTH',
    'lengths': 'LENGTH',
    'can': 'CAN',
    'cans': 'CAN',
    'pail': 'PAIL',
    'pails': 'PAIL',
  }

  let categoriesCreated = 0
  let productsCreated = 0
  let errors: string[] = []

  for (const categoryData of data.inventory) {
    let categoryId = categoryMap.get(categoryData.category.toLowerCase())

    // Create category if it doesn't exist
    if (!categoryId) {
      const { data: newCat, error: catError } = await supabase
        .from('product_categories')
        .insert({ name: categoryData.category, description: `${categoryData.category} products` })
        .select('id')
        .single()

      if (catError) {
        errors.push(`Failed to create category ${categoryData.category}: ${catError.message}`)
        continue
      }
      categoryId = newCat.id
      categoryMap.set(categoryData.category.toLowerCase(), categoryId)
      categoriesCreated++
      console.log(`Created category: ${categoryData.category}`)
    }

    // Process items
    for (const item of categoryData.items) {
      // Find the unit
      const unitLower = item.unit.toLowerCase()
      let unitId = unitMap.get(unitLower)

      if (!unitId && unitAliases[unitLower]) {
        unitId = unitMap.get(unitAliases[unitLower].toLowerCase())
      }

      if (!unitId) {
        // Create the unit if it doesn't exist
        const unitCode = item.unit.toUpperCase().substring(0, 10)
        const { data: newUnit, error: unitError } = await supabase
          .from('units_of_measure')
          .insert({ code: unitCode, name: item.unit, description: `${item.unit} unit` })
          .select('id')
          .single()

        if (unitError) {
          // Try to get existing unit with this code
          const { data: existingUnit } = await supabase
            .from('units_of_measure')
            .select('id')
            .eq('code', unitCode)
            .single()

          if (existingUnit) {
            unitId = existingUnit.id
          } else {
            errors.push(`Failed to create/find unit ${item.unit} for ${item.item_code}: ${unitError.message}`)
            continue
          }
        } else {
          unitId = newUnit.id
          unitMap.set(unitLower, unitId)
          console.log(`Created unit: ${item.unit}`)
        }
      }

      // Check if product already exists
      const { data: existingProduct } = await supabase
        .from('products')
        .select('id')
        .eq('code', item.item_code)
        .single()

      if (existingProduct) {
        continue // Skip existing products
      }

      // Create the product
      const { error: prodError } = await supabase
        .from('products')
        .insert({
          code: item.item_code,
          name: item.description,
          category_id: categoryId,
          base_uom_id: unitId,
          selling_uom_id: unitId,
          latest_cogs: item.cost_price,
          markup_percentage: item.markup_percent,
          current_selling_price: item.selling_price,
          reorder_point: Math.floor(item.default_quantity * 0.2),
          reorder_quantity: item.default_quantity,
        })

      if (prodError) {
        errors.push(`Failed to create product ${item.item_code}: ${prodError.message}`)
      } else {
        productsCreated++
      }
    }
  }

  console.log(`\n--- Seeding Complete ---`)
  console.log(`Categories created: ${categoriesCreated}`)
  console.log(`Products created: ${productsCreated}`)

  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`)
    errors.slice(0, 10).forEach(e => console.log(`  - ${e}`))
    if (errors.length > 10) {
      console.log(`  ... and ${errors.length - 10} more`)
    }
  }
}

async function main() {
  const { categories, units, products } = await checkDatabase()

  // If no categories or products, seed from JSON
  if (!categories?.length || !products?.length) {
    await seedFromJson()

    // Check again after seeding
    console.log('\n--- After Seeding ---')
    await checkDatabase()
  }
}

main().catch(console.error)
