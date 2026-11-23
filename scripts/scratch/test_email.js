import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testEmail() {
  console.log("Invoking edge function...");
  const { data, error } = await supabase.functions.invoke('send-email', {
    body: {
      type: 'order_ready',
      email: 'fernando.rg@live.cl',
      data: {
        order_number: 'online#0059',
        order_type: 'online',
        delivery_type: 'pickup',
        total: 1000,
        branch: { name: 'Test Branch' },
        organization: { name: 'Test Org' }
      }
    },
  });

  if (error) {
    console.error("Error from Edge Function:", error);
  } else {
    console.log("Success! Data:", data);
  }
}

testEmail();
