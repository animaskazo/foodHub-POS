import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://fgvhbniauzjvzeuespmf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZndmhibmlhdXpqdnpldWVzcG1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NDY3MTEsImV4cCI6MjA5ODUyMjcxMX0.VOPzKRt8QB8w2RMoUQ7_wuzCRb8diA30p5DlLBPjkdE';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkOrder() {
  const { data, error } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', 'b0061110-1541-4729-a422-e1e69aa8a67a');
    
  if (error) {
    console.error('Error fetching order items:', error);
  } else {
    console.log('Order Items:', JSON.stringify(data, null, 2));
  }
}

checkOrder();
