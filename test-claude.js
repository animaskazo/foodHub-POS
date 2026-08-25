import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'missing';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'missing';

if (supabaseUrl === 'missing') {
  console.log('MISSING ENV VARS. Using process.env...');
  console.log(process.env);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  console.log('Testing generate_joke...');
  const { data, error } = await supabase.functions.invoke('claude', {
    body: {
      action: 'generate_joke',
      payload: {}
    }
  });
  console.log('Error:', error);
  console.log('Data:', data);
}

test();
