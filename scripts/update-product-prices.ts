import { createClient } from '@supabase/supabase-js';

// CSV data from SYD_Materials_2026-02-08.csv
const productsData = [
  { code: "GI-24X8", cost: 176, markup: 31.5, selling: 240 },
  { code: "GI-24X10", cost: 220, markup: 32.5, selling: 300 },
  { code: "GI-24X12", cost: 264, markup: 25.8, selling: 340 },
  { code: "GI-22X8", cost: 160, markup: 32, selling: 220 },
  { code: "GI-22X10", cost: 200, markup: 31, selling: 270 },
  { code: "GI-22X12", cost: 240, markup: 33.8, selling: 330 },
  { code: "PLAIN-G24", cost: 176, markup: 31.5, selling: 240 },
  { code: "PLAIN-G22", cost: 160, markup: 32, selling: 220 },
  { code: "SEAL-ISL", cost: 403, markup: 20.8, selling: 495 },
  { code: "VULCA-SEAL-75ML", cost: 57, markup: 49.1, selling: 85 },
  { code: "SUNSHIELD-SIL-300ML", cost: 135, markup: 70.4, selling: 230 },
  { code: "CN-2", cost: 970, markup: 15, selling: 52 },
  { code: "CN-2.5", cost: 970, markup: 15, selling: 52 },
  { code: "CN-3", cost: 910, markup: 15, selling: 49 },
  { code: "CN-1", cost: 1100, markup: 15, selling: 58 },
  { code: "CN-1.5", cost: 1030, markup: 20, selling: 57 },
  { code: "CN-4", cost: 880, markup: 20, selling: 50 },
  { code: "UMB-NAIL-2.5", cost: 1250, markup: 14, selling: 69 },
  { code: "CONCN-2", cost: 1500, markup: 15, selling: 76 },
  { code: "CONCN-3", cost: 1500, markup: 15, selling: 76 },
  { code: "FIN-NAIL-1", cost: 47.4, markup: 26.6, selling: 60 },
  { code: "FIN-NAIL-2", cost: 42.6, markup: 29.1, selling: 55 },
  { code: "REBAR-10MM", cost: 124, markup: 30, selling: 170 },
  { code: "REBAR-12MM", cost: 179, markup: 29.5, selling: 240 },
  { code: "REBAR-8MM", cost: 86, markup: 30, selling: 120 },
  { code: "REBAR-9MM", cost: 94, markup: 29, selling: 130 },
  { code: "FLAT-14-1", cost: 220, markup: 28, selling: 290 },
  { code: "FLAT-14-2", cost: 442, markup: 29.4, selling: 580 },
  { code: "RT-1X2-15", cost: 384, markup: 29.3, selling: 505 },
  { code: "ANG-316-1-25", cost: 223, markup: 30.9, selling: 300 },
  { code: "ANG-316-15-25", cost: 317, markup: 29.8, selling: 420 },
  { code: "ANG-316-2-25", cost: 420, markup: 28.9, selling: 550 },
  { code: "MFUR-1X2", cost: 107, markup: 19, selling: 135 },
  { code: "MSTUD-2X3", cost: 131, markup: 16.5, selling: 160 },
  { code: "MTRACK-2X3", cost: 120, markup: 18.5, selling: 150 },
  { code: "CPURL-2X3-15", cost: 430, markup: 15.8, selling: 505 },
  { code: "PLY-ORD-14", cost: 300, markup: 10.9, selling: 340 },
  { code: "PLY-ORD-12", cost: 505, markup: 11.4, selling: 570 },
  { code: "PLY-MAR-14", cost: 330, markup: 12.9, selling: 380 },
  { code: "PLY-MAR-12", cost: 660, markup: 12.5, selling: 750 },
  { code: "PLY-ORD-34", cost: 820, markup: 14.9, selling: 950 },
  { code: "PLY-MAR-34", cost: 1120, markup: 11, selling: 1250 },
  { code: "FCB-45MM", cost: 330, markup: 12.9, selling: 380 },
  { code: "FCB-35MM", cost: 255, markup: 14.9, selling: 300 },
  { code: "CEM-HOL", cost: 205, markup: 3.9, selling: 220 },
  { code: "CEM-UNI", cost: 195, markup: 4.5, selling: 210 },
  { code: "SAND-WASH", cost: 550, markup: 88.7, selling: 1050 },
  { code: "SAND-SCREEN", cost: 550, markup: 88.7, selling: 1050 },
  { code: "GRAVEL-34", cost: 550, markup: 88.7, selling: 1050 },
  { code: "PVC-12", cost: 68.5, markup: 19.5, selling: 90 },
  { code: "PVC-2-S500", cost: 63, markup: 21, selling: 84 },
  { code: "PVC-3-S500", cost: 136, markup: 26, selling: 179 },
  { code: "PVC-4-S500", cost: 182, markup: 27, selling: 239 },
  { code: "ELB-12-PL", cost: 9.5, markup: 90, selling: 30 },
  { code: "ELB-12-THR", cost: 16, markup: 90, selling: 43 },
  { code: "ELB-2-90", cost: 9, markup: 95, selling: 30 },
  { code: "ELB-3-90", cost: 17, markup: 91, selling: 45 },
  { code: "ELB-2-45", cost: 7.5, markup: 90, selling: 26 },
  { code: "ELB-4-90", cost: 26, markup: 90, selling: 62 },
  { code: "PTRAP-2", cost: 28, markup: 29.5, selling: 45 },
  { code: "PTRAP-3", cost: 50, markup: 30.5, selling: 74 },
  { code: "PTRAP-4", cost: 77, markup: 30.5, selling: 109 },
  { code: "WYE-3X2", cost: 33, markup: 25, selling: 49 },
  { code: "WYE-4X2", cost: 47, markup: 29, selling: 69 },
  { code: "WYE-2X2", cost: 16, markup: 30.5, selling: 29 },
  { code: "WYE-3X3", cost: 36, markup: 28, selling: 54 },
  { code: "WYE-4X3", cost: 52, markup: 27, selling: 74 },
  { code: "WYE-4X4", cost: 56, markup: 27, selling: 79 },
  { code: "COUP-1", cost: 9, markup: 30, selling: 20 },
  { code: "COUP-2", cost: 4.5, markup: 30, selling: 14 },
  { code: "COUP-3", cost: 9, markup: 30, selling: 20 },
  { code: "COUP-15", cost: 18, markup: 30, selling: 32 },
  { code: "COUP-4", cost: 18, markup: 30, selling: 32 },
  { code: "RED-4X2", cost: 17, markup: 30, selling: 30 },
  { code: "RED-4X3", cost: 18, markup: 30, selling: 32 },
  { code: "RED-12X34", cost: 10.5, markup: 30, selling: 22 },
  { code: "RED-12X1", cost: 12, markup: 30, selling: 24 },
  { code: "TIE-WIRE", cost: 42, markup: 44, selling: 70 },
  { code: "SHOVEL-MTL", cost: 160, markup: 80, selling: 300 },
  { code: "COCO-1X2X10", cost: 34, markup: 48, selling: 50 },
  { code: "COCO-2X3X10", cost: 100, markup: 30, selling: 130 },
  { code: "COCO-2X2X10", cost: 67, markup: 27, selling: 85 },
  { code: "COCO-2X4X10", cost: 133, markup: 28, selling: 170 },
  { code: "COCO-4X4X10", cost: 267, markup: 48, selling: 395 },
  { code: "COCO-4X4X12", cost: 320, markup: 48.5, selling: 475 },
  { code: "COCO-4X4X8", cost: 245, markup: 48.9, selling: 365 },
  { code: "SOLIGNUM-1L", cost: 502, markup: 29.5, selling: 650 },
  { code: "GI-MATING-6", cost: 440, markup: 54.5, selling: 680 },
  { code: "GI-MATING-10", cost: 225, markup: 55.5, selling: 350 },
  { code: "TRAPAL-BLUE-ORG", cost: 30, markup: 100, selling: 60 },
  { code: "RIVET-1/8X1/2", cost: 90, markup: 22.2, selling: 110 },
  { code: "RIVET-1/8X3/4", cost: 135, markup: 14.8, selling: 155 },
  { code: "AZTECH-3/4", cost: 9, markup: 177.8, selling: 25 },
  { code: "AZTECH-1", cost: 10, markup: 200, selling: 30 },
  { code: "AZTECH-1.5", cost: 12, markup: 191.7, selling: 35 },
  { code: "AZTECH-2", cost: 15, markup: 166.7, selling: 40 },
  { code: "AZTECH-3/4-HD", cost: 23, markup: 95.7, selling: 45 },
  { code: "RIVITER-HD", cost: 127, markup: 104.7, selling: 260 },
  { code: "CAULK-GUN-HNT", cost: 79, markup: 89.9, selling: 150 },
  { code: "TEFLON-1", cost: 10, markup: 150, selling: 25 },
  { code: "TEFLON-3/4", cost: 8, markup: 150, selling: 20 },
  { code: "TEFLON-1/2", cost: 5, markup: 200, selling: 15 },
  { code: "ENT-CAP-3/4", cost: 31.8, markup: 120.1, selling: 70 },
  { code: "ENT-CAP-1", cost: 34, markup: 61.8, selling: 55 },
  { code: "EMT-CONN-3/4", cost: 11.25, markup: 255.6, selling: 40 },
  { code: "EMT-CONN-1", cost: 16.5, markup: 172.7, selling: 45 },
  { code: "EMT-COUP-3/4", cost: 11.25, markup: 166.7, selling: 30 },
  { code: "EMT-COUP-1", cost: 16.5, markup: 93.9, selling: 32 },
  { code: "EMT-ELBOW-3/4", cost: 26, markup: 92.3, selling: 50 },
  { code: "EMT-ELBOW-1", cost: 48, markup: 56.3, selling: 75 },
  { code: "BRK-BOX-4H", cost: 549.78, markup: 36.4, selling: 750 },
  { code: "BRK-BOX-6H", cost: 679.8, markup: 25, selling: 850 },
  { code: "CB-60A", cost: 238, markup: 34.5, selling: 320 },
  { code: "CB-30A", cost: 228, markup: 36, selling: 310 },
  { code: "CB-20A", cost: 228, markup: 36, selling: 310 },
  { code: "CB-15A", cost: 228, markup: 36, selling: 310 },
  { code: "THHN-14-UP", cost: 16.66, markup: 80.1, selling: 30 },
  { code: "INS-STAPLE-1", cost: 51.8, markup: 44.8, selling: 75 },
  { code: "MTR-BASE-1", cost: 275, markup: 38.2, selling: 380 },
  { code: "MTR-BASE-3/4", cost: 275, markup: 38.2, selling: 380 },
  { code: "SAD-CLAMP-3/4", cost: 5, markup: 300, selling: 20 },
  { code: "SAD-CLAMP-1", cost: 7, markup: 257.1, selling: 25 },
  { code: "FLAT-CORD-16", cost: 18.77, markup: 86.5, selling: 35 },
  { code: "FLEX-HOSE-1/2", cost: 5.88, markup: 172.1, selling: 16 },
  { code: "THHN-8-ROYU", cost: 74.32, markup: 21.1, selling: 90 },
  { code: "THHN-12-ROYU", cost: 31.1, markup: 44.7, selling: 45 },
  { code: "WIRE-12-PDX", cost: 48, markup: 35.4, selling: 65 },
  { code: "WIRE-14-PDX", cost: 35, markup: 57.1, selling: 55 },
  { code: "ELEC-TAPE-4M", cost: 9, markup: 122.2, selling: 20 },
  { code: "ELEC-TAPE-16M", cost: 27.5, markup: 81.8, selling: 50 },
  { code: "WP-ENCL-NEMA", cost: 288, markup: 73.6, selling: 500 },
  { code: "ROYU-UTL-BOX", cost: 27, markup: 122.2, selling: 60 },
  { code: "ELEC-MOULD-PVC", cost: 68, markup: 61.8, selling: 110 },
  { code: "ROYU-2G-OUT-WD113", cost: 89, markup: 34.8, selling: 120 },
  { code: "ROYU-3G-OUT-WD115", cost: 132, markup: 43.9, selling: 190 },
  { code: "ROYU-2G-SW-WD513", cost: 89, markup: 34.8, selling: 120 },
  { code: "ROYU-3G-SW-WD515", cost: 124, markup: 45.2, selling: 180 },
  { code: "PVC-RECPT-3", cost: 23, markup: 160.9, selling: 60 },
  { code: "PVC-RECPT-4", cost: 26, markup: 150, selling: 65 },
  { code: "ECOLUME-LED-11W", cost: 63, markup: 90.5, selling: 120 },
  { code: "ECOLUME-LED-7W", cost: 49, markup: 83.7, selling: 90 },
  { code: "ROYU-CB-30A-ENC", cost: 302, markup: 65.6, selling: 500 },
  { code: "ROYU-CB-20A-ENC", cost: 302, markup: 65.6, selling: 500 },
  { code: "EMT-PIPE-1", cost: 274, markup: 38.7, selling: 380 },
  { code: "EMT-PIPE-3/4", cost: 202, markup: 58.4, selling: 320 },
  { code: "ROYU-EM-40X25", cost: 96, markup: 56.3, selling: 150 },
  { code: "ATLANTA-EM-1", cost: 85, markup: 64.7, selling: 140 },
  { code: "ATLANTA-EM-3/4", cost: 50, markup: 100, selling: 100 },
  { code: "ATLANTA-EM-1/2", cost: 45, markup: 100, selling: 90 },
  { code: "PVC-ORG-3/4", cost: 61, markup: 80.3, selling: 110 },
  { code: "PVC-ORG-1/2", cost: 44, markup: 104.5, selling: 90 },
  { code: "VOSCH-EMETER", cost: 728, markup: 18.1, selling: 860 },
  { code: "OMNI-JBOX-WSJ001", cost: 28, markup: 25, selling: 35 },
  { code: "OMNI-LED-6W", cost: 76, markup: 31.6, selling: 100 },
  { code: "OMNI-LED-9W", cost: 92, markup: 30.4, selling: 120 },
  { code: "OMNI-LED-12W", cost: 132, markup: 28.8, selling: 170 },
  { code: "OMNI-LED-15W", cost: 196, markup: 27.6, selling: 250 },
  { code: "OMNI-PLUG-MALE", cost: 16, markup: 56.3, selling: 25 },
  { code: "OMNI-OUT-2G-STO002", cost: 43, markup: 27.9, selling: 55 },
  { code: "OMNI-OUT-2G-WSO002", cost: 48, markup: 35.4, selling: 65 },
  { code: "OMNI-OUT-3G-STO003", cost: 56, markup: 33.9, selling: 75 },
  { code: "OMNI-SW-WSS003", cost: 80, markup: 31.3, selling: 105 },
  { code: "OMNI-UBOX-WUB001", cost: 21, markup: 42.9, selling: 30 },
  { code: "OMNI-PLUG-FEMALE", cost: 11, markup: 81.8, selling: 20 },
  { code: "BOSTIK-NMN-30G", cost: 34, markup: 76.5, selling: 60 },
  { code: "STICKWELL-WG-250", cost: 44, markup: 93.2, selling: 85 },
  { code: "SOLVENT-JOSE-BC", cost: 117, markup: 45.3, selling: 170 },
  { code: "RUGBY-45ML", cost: 42, markup: 78.6, selling: 75 },
  { code: "HINGE-3.5-SB", cost: 65, markup: 84.6, selling: 120 },
  { code: "HINGE-4-SB", cost: 75, markup: 100, selling: 150 },
  { code: "ARMOR-LOCKSET", cost: 225, markup: 77.8, selling: 400 },
  { code: "BATT-AA-EVDY", cost: 17.5, markup: 25.7, selling: 22 },
  { code: "BATT-AAA-EVDY", cost: 19.5, markup: 28.2, selling: 25 },
  { code: "VARNISH-PLAST-YEL", cost: 117, markup: 28.2, selling: 150 },
  { code: "FAUCET-TEFLON", cost: 22, markup: 127.3, selling: 50 },
  { code: "PVC-COUP-1/2", cost: 4, markup: 100, selling: 8 },
  { code: "PVC-TEE-PLAIN-1/2", cost: 7, markup: 71.4, selling: 12 },
  { code: "PVC-TEE-THR-1/2", cost: 8, markup: 50, selling: 12 },
  { code: "PE-TEE-1/2", cost: 58, markup: 89.7, selling: 110 },
  { code: "PE-ELBOW-1/2", cost: 42, markup: 61.9, selling: 68 },
  { code: "PE-ADAPT-1/2", cost: 26, markup: 150, selling: 65 },
  { code: "PE-COUP-1/2", cost: 39, markup: 41, selling: 55 },
  { code: "PVC-VALVE-1/2", cost: 20, markup: 125, selling: 45 },
  { code: "PE-PIPE-1/2-SDR11", cost: 9, markup: 177.8, selling: 25 },
];

async function updateProductPrices() {
  // Get Supabase credentials from environment
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials. Make sure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY are set.');
    console.error('URL:', supabaseUrl);
    console.error('Key:', supabaseKey ? 'Present' : 'Missing');
    process.exit(1);
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  console.log('Starting product price updates...\n');
  
  let successCount = 0;
  let errorCount = 0;
  let notFoundCount = 0;
  
  for (const product of productsData) {
    try {
      // First, check if product exists
      const { data: existingProduct, error: fetchError } = await supabase
        .from('products')
        .select('id, product_code, name')
        .eq('product_code', product.code)
        .single();
      
      if (fetchError || !existingProduct) {
        console.log(`⚠️  Product not found: ${product.code}`);
        notFoundCount++;
        continue;
      }
      
      // Update the product
      const { error: updateError } = await supabase
        .from('products')
        .update({
          latest_cogs: product.cost,
          markup_percentage: product.markup,
          selling_price: product.selling,
          updated_at: new Date().toISOString(),
        })
        .eq('product_code', product.code);
      
      if (updateError) {
        console.error(`❌ Error updating ${product.code}:`, updateError.message);
        errorCount++;
      } else {
        console.log(`✅ Updated ${product.code}: Cost=${product.cost}, Markup=${product.markup}%, Price=${product.selling}`);
        successCount++;
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`❌ Error processing ${product.code}:`, error);
      errorCount++;
    }
  }
  
  console.log('\n=================================');
  console.log('Update Summary:');
  console.log(`✅ Successfully updated: ${successCount}`);
  console.log(`⚠️  Products not found: ${notFoundCount}`);
  console.log(`❌ Errors: ${errorCount}`);
  console.log(`📊 Total processed: ${productsData.length}`);
  console.log('=================================\n');
}

// Run the update
updateProductPrices()
  .then(() => {
    console.log('✨ Product price update complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
