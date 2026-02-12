import { createClient } from '@supabase/supabase-js';

async function checkProducts() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  console.log('Fetching sample products...\n');
  
  // Get first 10 products
  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .limit(10);
  
  if (error) {
    console.error('Error fetching products:', error);
    process.exit(1);
  }
  
  console.log(`Found ${products?.length} products\n`);
  
  if (products && products.length > 0) {
    console.log('Sample product structure:');
    console.log(JSON.stringify(products[0], null, 2));
    
    console.log('\n\nAll column names:');
    console.log(Object.keys(products[0]).join(', '));
    
    console.log('\n\nFirst 10 products:');
    products.forEach(p => {
      console.log(`- ID: ${p.id}`);
      console.log(`  Name: ${p.name || 'N/A'}`);
      console.log(`  Product Code: ${p.product_code || 'N/A'}`);
      console.log(`  SKU: ${p.sku || 'N/A'}`);
      console.log(`  Latest COGS: ${p.latest_cogs || 'N/A'}`);
      console.log(`  Markup: ${p.markup_percentage || 'N/A'}`);
      console.log(`  Selling Price: ${p.current_selling_price || p.selling_price || 'N/A'}`);
      console.log('');
    });
  }
  
  // Check total count
  const { count } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true });
  
  console.log(`\nTotal products in database: ${count}`);
}

checkProducts()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
