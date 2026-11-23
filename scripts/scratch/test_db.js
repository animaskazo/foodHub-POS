import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      id,
      order_number,
      total,
      subtotal,
      tax_amount,
      notes,
      order_items (
        id,
        product_name,
        quantity,
        unit_price,
        total_price,
        order_item_variants (
          variant_option_name
        ),
        order_item_ingredients (
          ingredient_name
        )
      )
    `)
    .eq('id', 'b1e27bb2-7e15-4a8e-b96f-8a991b8616b4')
    .single();

  console.log("Data:", JSON.stringify(data, null, 2));
  console.log("Error:", error);
}

test();
