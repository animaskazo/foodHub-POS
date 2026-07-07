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
        variant_options(
          id,
          name
        )
      )
    `);
  console.log(JSON.stringify(data.filter(p => p.variant_groups.length > 0), null, 2));
}
run();
