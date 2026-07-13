import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

serve(async (req) => {
  try {
    const payload = await req.json();
    
    // Klap envía notificación. 
    const { reference_id } = payload;
    
    if (!reference_id) {
      return new Response("Invalid payload", { status: 400 });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Si llegó a webhook_confirm, significa que fue autorizado.
    // Marcar orden como pagada
    // Extraemos el UUID original de la orden (los primeros 5 segmentos separados por guion)
    const orderId = reference_id.split('-').slice(0, 5).join('-');

    const { error } = await supabase
      .from('payments')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('order_id', orderId)
      .eq('method', 'online');

    if (error) throw error;

    return new Response("OK", { status: 200 });

  } catch (error) {
    console.error("Webhook error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
