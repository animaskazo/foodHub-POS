import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase env vars')
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Activa pedidos programados cuya hora ya llegó: scheduled/pending -> confirmed.
    // Un pedido con venta Klap pendiente de pago no se activa: no debe entrar
    // a cocina hasta que el webhook de Klap lo marque como pagado.
    const { data: dueOrders, error: dueError } = await supabase
      .from('orders')
      .select('id, order_number, payments(method, status)')
      .in('status', ['pending', 'scheduled'])
      .not('scheduled_at', 'is', null)
      .lte('scheduled_at', new Date().toISOString())

    if (dueError) throw dueError

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activatable = (dueOrders || []).filter((o: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hasKlapPayment = o.payments?.some((p: any) => p.method === 'online_gateway' || p.method === 'klap')
      if (!hasKlapPayment) return true
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return o.payments?.some((p: any) => p.status === 'paid' || p.status === 'completed')
    })

    let activatedData: { id: string, order_number: unknown }[] = []
    if (activatable.length > 0) {
      const { data, error: activateError } = await supabase
        .from('orders')
        .update({ status: 'confirmed' })
        .in('id', activatable.map((o: { id: string }) => o.id))
        .select('id, order_number')
      if (activateError) throw activateError
      activatedData = data || []
    }

    // -- Nueva lógica: Cancelar pedidos online con pago pendiente de más de 1 hora --
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    
    const { data: staleOrders, error: fetchError } = await supabase
      .from('orders')
      .select('id, order_number, payments(status, method)')
      .eq('order_type', 'online')
      .eq('status', 'pending')
      .lte('created_at', oneHourAgo)
      
    if (fetchError) throw fetchError

    const ordersToCancel = staleOrders?.filter(order => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hasKlapPayment = order.payments?.some((p: any) => p.method === 'online_gateway' || p.method === 'klap')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hasPaidPayment = order.payments?.some((p: any) => p.status === 'paid' || p.status === 'completed')
      return hasKlapPayment && !hasPaidPayment
    }) || []
    
    let cancelledCount = 0;
    if (ordersToCancel.length > 0) {
      const orderIdsToCancel = ordersToCancel.map(o => o.id);
      const { error: cancelError } = await supabase
        .from('orders')
        .update({ 
          status: 'cancelled', 
          cancellation_reason: 'El cliente no completó el pago',
          cancelled_at: new Date().toISOString()
        })
        .in('id', orderIdsToCancel)
        
      if (cancelError) throw cancelError
      cancelledCount = orderIdsToCancel.length;
    }

    return new Response(JSON.stringify({ 
      activated: activatedData?.length || 0, 
      activated_ids: activatedData?.map(o => o.id) || [],
      cancelled: cancelledCount,
      cancelled_ids: ordersToCancel.map(o => o.id)
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
