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

    // Activa pedidos programados cuya hora ya llegó: scheduled/pending -> confirmed
    const { data, error } = await supabase
      .from('orders')
      .update({ status: 'confirmed' })
      .in('status', ['pending', 'scheduled'])
      .not('scheduled_at', 'is', null)
      .lte('scheduled_at', new Date().toISOString())
      .select('id, order_number')

    if (error) throw error

    return new Response(JSON.stringify({ activated: data?.length || 0, ids: data?.map(o => o.id) || [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
