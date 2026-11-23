import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://fgvhbniauzjvzeuespmf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZndmhibmlhdXpqdnpldWVzcG1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NDY3MTEsImV4cCI6MjA5ODUyMjcxMX0.VOPzKRt8QB8w2RMoUQ7_wuzCRb8diA30p5DlLBPjkdE';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkOrgUber() {
  const { data, error } = await supabase
    .from('organizations')
    .select('delivery_mode, uber_enabled, uber_customer_id')
    .eq('id', 'dc87266b-ee5b-483d-851e-d869c134a96c');
    
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Org Details:', JSON.stringify(data, null, 2));
  }
}

checkOrgUber();
