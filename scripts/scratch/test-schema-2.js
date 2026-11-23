import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: staffData } = await supabase.from('staff').select('*').limit(1);
  console.log("Staff:", JSON.stringify(staffData, null, 2));
}
run();
