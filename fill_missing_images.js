import { createClient } from '@supabase/supabase-js';
import google from 'googlethis';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function downloadImage(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.statusText}`);
    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    
    // Determine extension
    let ext = 'jpg';
    if (contentType.includes('png')) ext = 'png';
    else if (contentType.includes('webp')) ext = 'webp';
    
    return { buffer: Buffer.from(buffer), contentType, ext };
  } catch (error) {
    console.error(`Error downloading image from ${url}:`, error.message);
    return null;
  }
}

async function processProducts() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error("Please add ADMIN_EMAIL and ADMIN_PASSWORD to .env.local to run this script.");
    return;
  }

  console.log("Authenticating with Supabase...");
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (authError) {
    console.error("Auth error:", authError.message);
    return;
  }
  
  console.log("Authenticated successfully as", authData.user.email);
  console.log("Fetching products and their images...");
  
  // Get all products and their existing images
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, product_images(id, url)');

  if (error) {
    console.error("Error fetching products:", error);
    return;
  }

  const productsWithoutImages = products.filter(p => !p.product_images || p.product_images.length === 0);

  if (productsWithoutImages.length === 0) {
    console.log("No products with missing images found.");
    return;
  }

  console.log(`Found ${productsWithoutImages.length} products to process.`);

  for (const product of productsWithoutImages) {
    console.log(`\nProcessing: ${product.name}`);
    
    try {
      const query = `${product.name} comida food alta calidad hd`;
      const images = await google.image(query, { safe: false });
      
      if (!images || images.length === 0) {
        console.log(`No images found for ${product.name}`);
        continue;
      }
      
      // Try to download the first valid image
      let downloaded = null;
      for (const img of images.slice(0, 5)) { // Try up to 5 images
        console.log(`Attempting to download: ${img.url}`);
        downloaded = await downloadImage(img.url);
        if (downloaded) break;
      }

      if (!downloaded) {
        console.log(`Could not download any images for ${product.name}`);
        continue;
      }

      const filename = `product-${product.id}-${Date.now()}.${downloaded.ext}`;
      
      console.log(`Uploading to bucket 'images' as ${filename}...`);
      const { data: uploadData, error: uploadError } = await supabase
        .storage
        .from('images')
        .upload(filename, downloaded.buffer, {
          contentType: downloaded.contentType,
          upsert: false
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        continue;
      }

      const { data: publicUrlData } = supabase
        .storage
        .from('images')
        .getPublicUrl(filename);
        
      const publicUrl = publicUrlData.publicUrl;
      console.log(`Uploaded successfully. URL: ${publicUrl}`);
      
      console.log(`Updating product_images for ${product.id} in database...`);
      const { error: insertError } = await supabase
        .from('product_images')
        .insert({
          product_id: product.id,
          url: publicUrl,
          is_primary: true,
          sort_order: 0
        });
        
      if (insertError) {
        console.error("Database insert error:", insertError);
      } else {
        console.log(`Successfully updated ${product.name}`);
      }
      
    } catch (e) {
      console.error(`Error processing ${product.name}:`, e);
    }
    
    // Slight delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 2000));
  }
  
  console.log("\nFinished processing products.");
}

processProducts();
