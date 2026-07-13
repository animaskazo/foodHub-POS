import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

serve(async (req) => {
  try {
    const payload = await req.json();
    
    // Klap envía notificación. Dependiendo de la estructura, extraer el estado.
    // Asumiremos que envía { buy_order: "...", status: "AUTHORIZED" o "REJECTED" }
    const { buy_order, status } = payload;
    
    if (!buy_order || !status) {
      return new Response("Invalid payload", { status: 400 });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (status === 'AUTHORIZED' || status === 'paid' || status === 'APPROVED') {
      // Marcar orden como pagada
      const { error } = await supabase
        .from('payments')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('order_id', buy_order) // asumiendo que buy_order coincide con order.id
        .eq('method', 'online');

      if (error) throw error;
    }

    return new Response("OK", { status: 200 });

  } catch (error) {
    console.error("Webhook error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
