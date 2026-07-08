import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
  const { data: orgs } = await supabase.from('organizations').select('id').limit(1);
  const organizationId = orgs[0].id;

  let query = supabase
    .from('products')
    .select(`
      id,
      name,
      base_price,
      description,
      status,
      product_categories (
        categories (
          id,
          name
        )
      ),
      product_images (
        url
      ),
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
      ),
      product_ingredients (
        ingredients (
          id,
          name,
          price,
          is_active
        )
      )
    `)
    .eq('organization_id', organizationId);

  const { data, error } = await query;
  console.log("Error:", error);
  console.log("Data count:", data?.length);
}

test().catch(console.error);
