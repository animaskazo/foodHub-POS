import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase
    .from('products')
    .select(`
      id,
      name,
      variant_groups(
        id,
        name,
        variant_options(
          id,
          variant_group_id,
          name,
          sku,
          price_modifier,
          is_active
        )
      )
    `);
  const withVariants = data.filter(p => p.variant_groups && p.variant_groups.length > 0);
  console.log(JSON.stringify(withVariants, null, 2));
}
run();
