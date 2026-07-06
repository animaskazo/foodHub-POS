import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      order_items(*, products(description), order_item_variants(variant_option_name), order_item_ingredients(ingredient_name))
    `)
    .limit(1);

  if (error) console.error("Error:", error);
  else console.log("Success:", data);
}
test();
