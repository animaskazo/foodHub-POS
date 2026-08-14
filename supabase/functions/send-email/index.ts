import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { type, email, data } = await req.json()
    
    if (!email) {
      throw new Error('Email is required')
    }

    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not set')
    }

    let subject = ''
    let html = ''

    const fromEmail = 'hola@digital-solutions.work'

    if (type === 'welcome') {
      subject = 'Bienvenido a FoodHub'
      html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9f9f9; padding: 40px 20px; text-align: center;">
          <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); text-align: left;">
            <h1 style="color: #000000; font-size: 24px; font-weight: bold; margin-top: 0;">¡Bienvenido a FoodHub!</h1>
            <p style="color: #333333; font-size: 16px; line-height: 1.5; margin-bottom: 24px;">
              Estamos muy felices de tenerte con nosotros. Ahora puedes pedir tus comidas favoritas de forma rápida y sencilla.
            </p>
            <p style="color: #666666; font-size: 14px; line-height: 1.5;">
              Si tienes alguna pregunta, no dudes en contactarnos.
            </p>
            <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eeeeee; text-align: center;">
              <p style="color: #999999; font-size: 12px; margin: 0;">FoodHub POS & Ecommerce</p>
            </div>
          </div>
        </div>
      `
    } else if (type === 'order_ready') {
      const isDelivery = data.delivery_type === 'delivery'
      subject = isDelivery 
        ? `Tu pedido ${data.order_number || ''} saldrá a reparto`
        : `Tu pedido ${data.order_number || ''} está listo para retirar`
      
      const pickupMethod = data.order_type === 'table' ? 'Servicio a la mesa'
        : data.order_type === 'takeaway' ? 'Llevar'
        : isDelivery ? 'Despacho a Domicilio'
        : 'Retiro en local'
      const paymentMethod = data.payment_method || 'En local'
      const total = data.total ? `$${data.total.toLocaleString('es-CL')}` : ''

      const branchName = data.branch?.name || 'Tu Local'
      const branchAddress = data.branch?.address || ''
      const orgName = data.organization?.name || 'FoodHub'
      const orgLogo = data.organization?.logo_url || null
      const customerName = data.customer_name || 'Cliente'
      const deliveryAddress = data.delivery_address || ''

      const paymentMethodMap: Record<string, string> = {
        cash: 'Efectivo',
        card: 'Tarjeta de Crédito / Débito',
        transfer: 'Transferencia',
        online: 'Pago Online',
        online_gateway: 'Pago Online',
        pending: 'Pago pendiente',
      }
      const paymentLabel = paymentMethodMap[data.payment_method] || data.payment_method || 'En local'

      const isKlapPayment = data.payment_method === 'online_gateway' && data.payment_reference
      const klapBlock = isKlapPayment ? `
          <tr>
            <td style="padding: 0 16px 24px 16px; text-align: center;">
              <p style="margin: 0 0 8px 0; font-size: 11px; color: #888888; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                Pago procesado a través de
              </p>
              <img src="https://www.alcaplus.cl/media/2024/08/logotipo-klap.webp" alt="Klap" width="48" style="width: 48px; max-width: 56px; display: inline-block; margin: 0 auto 6px auto; opacity: 0.7;" />
              <p style="margin: 0; font-size: 11px; color: #999999; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                N° de transacción: <span style="color: #666666; font-weight: 600; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;">${data.payment_reference}</span>
              </p>
            </td>
          </tr>` : ''

      const totalFormatted = data.total
        ? `$${Number(data.total).toLocaleString('es-CL')}`
        : ''
      const subtotalFormatted = data.subtotal
        ? `$${Number(data.subtotal).toLocaleString('es-CL')}`
        : `$${Number(data.total - (data.delivery_fee || 0)).toLocaleString('es-CL')}`
      const deliveryFeeFormatted = data.delivery_fee
        ? `$${Number(data.delivery_fee).toLocaleString('es-CL')}`
        : 'Gratis'

      const scheduledBlock = data.scheduled_at ? (() => {
        const d = new Date(data.scheduled_at)
        const dateStr = d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Santiago' })
        const timeStr = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' })
        return `
          <tr>
            <td style="padding: 16px 16px 0 16px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3e8ff; border: 1px solid #e9d5ff; border-radius: 12px; overflow: hidden;">
                <tr>
                  <td style="padding: 14px 18px;">
                    <p style="margin: 0; font-size: 14px; font-weight: 700; color: #581c87; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                      Programado: ${dateStr.charAt(0).toUpperCase() + dateStr.slice(1)} a las ${timeStr} hrs
                    </p>
                    <p style="margin: 4px 0 0 0; font-size: 13px; color: #6d28d9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                      Tu pedido se preparará para esa fecha y hora.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
      })() : ''

      const itemsHtml = (data.items || []).map((item: any) => {
        const itemTotal = item.total_price
          ? `$${Number(item.total_price).toLocaleString('es-CL')}`
          : ''
        const desc = item.description || item.product_description || item.products?.description || null
        const subParts: string[] = []
        if (desc) subParts.push(desc)
        if (item.variant_name) subParts.push(item.variant_name)
        if (Array.isArray(item.selectedOptions)) {
          item.selectedOptions.forEach((opt: any) => { if (opt.name) subParts.push(opt.name) })
        }
        if (Array.isArray(item.selectedIngredients)) {
          item.selectedIngredients.forEach((ing: any) => { if (ing.name) subParts.push(ing.name) })
        }
        if (Array.isArray(item.order_item_variants)) {
          item.order_item_variants.forEach((v: any) => { if (v.variant_option_name) subParts.push(v.variant_option_name) })
        }
        if (Array.isArray(item.order_item_ingredients)) {
          item.order_item_ingredients.forEach((i: any) => { if (i.ingredient_name) subParts.push(i.ingredient_name) })
        }
        const subText = subParts.join(' · ')
        return `
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 0;">
            <tr>
              <td valign="top" style="padding: 14px 0; border-bottom: 1px solid #f0f0f0;">
                <p style="margin: 0 0 3px 0; font-size: 15px; color: #111111; font-weight: 700; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${item.quantity} x ${item.product_name || item.name}</p>
                ${subText ? `<p style="margin: 0; font-size: 13px; color: #888888; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${subText}</p>` : ''}
              </td>
              <td width="90" valign="top" align="right" style="padding: 14px 0; border-bottom: 1px solid #f0f0f0; white-space: nowrap;">
                <span style="font-size: 15px; color: #111111; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${itemTotal}</span>
              </td>
            </tr>
          </table>`
      }).join('')

      html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Tu pedido saldrá a reparto</title>
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; padding: 0;">
    <tr>
      <td align="center" style="padding: 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; overflow: hidden;">

          <!-- BRAND HEADER -->
          <tr>
            <td style="background-color: #ffffff; padding: 40px 24px 24px 24px; text-align: center;">
              ${orgLogo
                ? `<img src="${orgLogo}" alt="${orgName}" style="width: 80px; height: 80px; object-fit: cover; display: inline-block; border-radius: 20px; margin-bottom: 24px; box-shadow: 0 4px 16px rgba(0,0,0,0.10);" />`
                : `<div style="display: inline-block; margin-bottom: 24px; background-color: #0a0a0a; width: 80px; height: 80px; border-radius: 20px; text-align: center; line-height: 80px;"><span style="font-size: 28px; font-weight: 900; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${orgName.charAt(0)}</span></div>`
              }
              <br/>
              <h1 style="margin: 0 0 6px 0; font-size: 26px; font-weight: 800; color: #0a0a0a; letter-spacing: -0.5px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                ¡Gracias ${customerName}!
              </h1>
              <p style="margin: 0; font-size: 18px; font-weight: 700; color: #111111; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                Tu pedido fue confirmado
              </p>
            </td>
          </tr>

          <!-- ORDER HEADLINE -->
          <tr>
            <td style="padding: 0 16px 0 16px; text-align: center; border-bottom: 1px solid #f0f0f0;">
              <p style="margin: 0 0 6px 0; font-size: 13px; font-weight: 600; letter-spacing: 1.2px; text-transform: uppercase; color: #aaaaaa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                Número de Pedido
              </p>
              <h2 style="margin: 0 0 8px 0; font-size: 36px; font-weight: 800; color: #0a0a0a; letter-spacing: -1px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                ${data.order_number || ''}
              </h2>
              <p style="margin: 0 0 24px 0; font-size: 11px; color: #999999; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;">
                ID Order ${data.order_id || data.id || ''}
              </p>
            </td>
          </tr>

          ${scheduledBlock}

          <!-- PICKUP/DELIVERY LOCATION -->
          <tr>
            <td style="padding: 24px 16px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f7f7f8; border-radius: 12px; overflow: hidden;">
                <tr>
                  <td style="padding: 20px 20px 4px 20px;">
                    <p style="margin: 0; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #999999; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                      ${isDelivery ? 'Dirección de Despacho' : 'Punto de Retiro'}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 6px 20px 6px 20px;">
                    <p style="margin: 0; font-size: 16px; font-weight: 700; color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                      ${isDelivery ? customerName : `${orgName} — ${branchName}`}
                    </p>
                  </td>
                </tr>
                ${(isDelivery ? deliveryAddress : branchAddress) ? `<tr>
                  <td style="padding: 0 20px 20px 20px;">
                    <p style="margin: 0; font-size: 14px; color: #666666; line-height: 1.5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                      ${isDelivery ? deliveryAddress : branchAddress}
                    </p>
                  </td>
                </tr>` : `<tr><td style="padding-bottom: 16px;"></td></tr>`}
                ${data.uber_tracking_url ? `<tr>
                  <td style="padding: 0 20px 20px 20px;">
                    <a href="${data.uber_tracking_url}" target="_blank" style="display: inline-block; background-color: #16a34a; color: #ffffff; font-size: 13px; font-weight: 700; padding: 10px 24px; border-radius: 8px; text-decoration: none;">
                      Seguir delivery en vivo
                    </a>
                  </td>
                </tr>` : ''}
              </table>
            </td>
          </tr>

          <!-- ORDER SUMMARY -->
          <tr>
            <td style="padding: 24px 24px 8px 24px;">
              <p style="margin: 0 0 20px 0; font-size: 22px; font-weight: 800; color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">Detalle del pedido</p>
              ${itemsHtml}

              <!-- Totals -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 28px;">
                <tr>
                  <td style="font-size: 15px; color: #333333; padding: 6px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">Subtotal</td>
                  <td align="right" style="font-size: 15px; color: #333333; font-weight: 500; padding: 6px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${subtotalFormatted}</td>
                </tr>
                <tr>
                  <td style="font-size: 15px; color: #333333; padding: 6px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">Envío</td>
                  <td align="right" style="font-size: 15px; color: #333333; font-weight: 500; padding: 6px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${isDelivery && data.delivery_fee ? deliveryFeeFormatted : '$0'}</td>
                </tr>

              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 24px 28px 24px; border-bottom: 1px solid #e8e8e8;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size: 28px; font-weight: 800; color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">Total</td>
                  <td align="right" style="font-size: 28px; font-weight: 800; color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${totalFormatted}</td>
                </tr>
              </table>
            </td>
          </tr>

          ${klapBlock}

          <!-- FOOTER -->
          <tr>
            <td style="background-color: #f7f7f8; padding: 20px 24px; border-top: 1px solid #eeeeee;">
              <p style="margin: 0 0 6px 0; font-size: 13px; color: #888888; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                ID: <span style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace;">${data.order_id || data.order_number || ''}</span> se ha empezado el ${new Date().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Santiago' })} ${new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' })}
              </p>
              <p style="margin: 0; font-size: 12px; color: #aaaaaa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                Impulsado por <strong style="color: #888888;">FoodHub</strong>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
    } else if (type === 'order_confirmed') {
      const isDelivery2 = data.delivery_type === 'delivery'
      subject = `Pedido ${data.order_number || ''} recibido — ¡Lo estamos preparando!`
      const uberTracking2 = data.uber_tracking_url

      const orgName2 = data.organization?.name || 'FoodHub'
      const orgLogo2 = data.organization?.logo_url || null
      const branchName2 = data.branch?.name || 'Tu Local'
      const branchAddress2 = data.branch?.address || ''
      const totalFormatted2 = data.total
        ? `$${Number(data.total).toLocaleString('es-CL')}`
        : ''
      const subtotalFormatted2 = data.subtotal
        ? `$${Number(data.subtotal).toLocaleString('es-CL')}`
        : `$${Number(data.total - (data.delivery_fee || 0)).toLocaleString('es-CL')}`
      const deliveryFeeFormatted2 = data.delivery_fee
        ? `$${Number(data.delivery_fee).toLocaleString('es-CL')}`
        : 'Gratis'

      const paymentMethodMap: Record<string, string> = {
        cash: 'Efectivo',
        card: 'Tarjeta de Crédito / Débito',
        transfer: 'Transferencia',
        online: 'Pago Online',
        online_gateway: 'Pago Online',
        pending: 'Pago pendiente',
      }
      const paymentLabel2 = paymentMethodMap[data.payment_method] || data.payment_method || 'En local'

      const isKlapPayment2 = data.payment_method === 'online_gateway' && data.payment_reference
      const klapBlock2 = isKlapPayment2 ? `
          <tr>
            <td style="padding: 0 16px 24px 16px; text-align: center;">
              <p style="margin: 0 0 8px 0; font-size: 11px; color: #888888; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                Pago procesado a través de
              </p>
              <img src="https://www.alcaplus.cl/media/2024/08/logotipo-klap.webp" alt="Klap" width="48" style="width: 48px; max-width: 56px; display: inline-block; margin: 0 auto 6px auto; opacity: 0.7;" />
              <p style="margin: 0; font-size: 11px; color: #999999; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                N° de transacción: <span style="color: #666666; font-weight: 600; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;">${data.payment_reference}</span>
              </p>
            </td>
          </tr>` : ''

      const pickupMethod2 = data.order_type === 'table' ? 'Servicio a la mesa'
        : data.order_type === 'takeaway' ? 'Llevar'
        : isDelivery2 ? 'Despacho a Domicilio'
        : 'Retiro en local'

      const scheduledBlock2 = data.scheduled_at ? (() => {
        const d = new Date(data.scheduled_at)
        const dateStr = d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Santiago' })
        const timeStr = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' })
        return `
          <tr>
            <td style="padding: 16px 16px 0 16px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3e8ff; border: 1px solid #e9d5ff; border-radius: 12px; overflow: hidden;">
                <tr>
                  <td style="padding: 14px 18px;">
                    <p style="margin: 0; font-size: 14px; font-weight: 700; color: #581c87; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                      Programado: ${dateStr.charAt(0).toUpperCase() + dateStr.slice(1)} a las ${timeStr} hrs
                    </p>
                    <p style="margin: 4px 0 0 0; font-size: 13px; color: #6d28d9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                      Tu pedido se preparará para esa fecha y hora.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
      })() : ''

      const itemsHtml2 = (data.items || []).map((item: any) => {
        const itemTotal = item.total_price
          ? `$${Number(item.total_price).toLocaleString('es-CL')}`
          : ''
        const desc2 = item.description || item.product_description || item.products?.description || null
        const subParts2: string[] = []
        if (desc2) subParts2.push(desc2)
        if (item.variant_name) subParts2.push(item.variant_name)
        if (Array.isArray(item.selectedOptions)) {
          item.selectedOptions.forEach((opt: any) => { if (opt.name) subParts2.push(opt.name) })
        }
        if (Array.isArray(item.selectedIngredients)) {
          item.selectedIngredients.forEach((ing: any) => { if (ing.name) subParts2.push(ing.name) })
        }
        if (Array.isArray(item.order_item_variants)) {
          item.order_item_variants.forEach((v: any) => { if (v.variant_option_name) subParts2.push(v.variant_option_name) })
        }
        if (Array.isArray(item.order_item_ingredients)) {
          item.order_item_ingredients.forEach((i: any) => { if (i.ingredient_name) subParts2.push(i.ingredient_name) })
        }
        const subText2 = subParts2.join(' · ')
        return `
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td valign="top" style="padding: 14px 0; border-bottom: 1px solid #f0f0f0;">
                <p style="margin: 0 0 3px 0; font-size: 15px; color: #111111; font-weight: 700; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${item.quantity} x ${item.product_name || item.name}</p>
                ${subText2 ? `<p style="margin: 0; font-size: 13px; color: #888888; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${subText2}</p>` : ''}
              </td>
              <td width="90" valign="top" align="right" style="padding: 14px 0; border-bottom: 1px solid #f0f0f0; white-space: nowrap;">
                <span style="font-size: 15px; color: #111111; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${itemTotal}</span>
              </td>
            </tr>
          </table>`
      }).join('')

      html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Pedido confirmado</title>
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; padding: 0;">
    <tr>
      <td align="center" style="padding: 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; overflow: hidden;">

          <!-- HEADER -->
          <tr>
            <td style="background-color: #ffffff; padding: 40px 24px 24px 24px; text-align: center;">
              ${orgLogo2
                ? `<img src="${orgLogo2}" alt="${orgName2}" style="width: 80px; height: 80px; object-fit: cover; display: inline-block; border-radius: 20px; margin-bottom: 24px; box-shadow: 0 4px 16px rgba(0,0,0,0.10);" />`
                : `<div style="display: inline-block; margin-bottom: 24px; background-color: #0a0a0a; width: 80px; height: 80px; border-radius: 20px; text-align: center; line-height: 80px;"><span style="font-size: 28px; font-weight: 900; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${orgName2.charAt(0)}</span></div>`
              }
              <br/>
              <h1 style="margin: 0 0 6px 0; font-size: 26px; font-weight: 800; color: #0a0a0a; letter-spacing: -0.5px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                ¡Gracias ${data.customer_name || 'Cliente'}!
              </h1>
              <p style="margin: 0; font-size: 18px; font-weight: 700; color: #111111; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                Tu pedido fue confirmado
              </p>
            </td>
          </tr>

          <!-- HEADLINE -->
          <tr>
            <td style="padding: 0 16px 0 16px; text-align: center; border-bottom: 1px solid #f0f0f0;">
              <p style="margin: 0 0 6px 0; font-size: 13px; font-weight: 600; letter-spacing: 1.2px; text-transform: uppercase; color: #aaaaaa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                Número de Pedido
              </p>
              <h2 style="margin: 0 0 8px 0; font-size: 36px; font-weight: 800; color: #0a0a0a; letter-spacing: -1px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                ${data.order_number || ''}
              </h2>
              <p style="margin: 0 0 24px 0; font-size: 11px; color: #999999; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;">
                ID Order ${data.order_id || data.id || ''}
              </p>
            </td>
          </tr>

          ${scheduledBlock2}

          <!-- PICKUP/DELIVERY LOCATION -->
          <tr>
            <td style="padding: 24px 16px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f7f7f8; border-radius: 12px; overflow: hidden;">
                <tr>
                  <td style="padding: 20px 20px 4px 20px;">
                    <p style="margin: 0; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #999999; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                      ${isDelivery2 ? 'Dirección de Despacho' : 'Punto de Retiro'}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 6px 20px 6px 20px;">
                    <p style="margin: 0; font-size: 16px; font-weight: 700; color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                      ${isDelivery2 ? (data.customer_name || 'Cliente') : `${orgName2} — ${branchName2}`}
                    </p>
                  </td>
                </tr>
                ${(isDelivery2 ? (data.delivery_address || '') : branchAddress2) ? `<tr>
                  <td style="padding: 0 20px 20px 20px;">
                    <p style="margin: 0; font-size: 14px; color: #666666; line-height: 1.5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                      ${isDelivery2 ? data.delivery_address : branchAddress2}
                    </p>
                  </td>
                </tr>` : `<tr><td style="padding-bottom: 16px;"></td></tr>`}
                ${uberTracking2 && isDelivery2 ? `<tr>
                  <td style="padding: 0 20px 20px 20px;">
                    <a href="${uberTracking2}" target="_blank" style="color: #16a34a; font-size: 13px; font-weight: 600; text-decoration: underline; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                      Seguir delivery en vivo
                    </a>
                  </td>
                </tr>` : ''}
              </table>
            </td>
          </tr>

          <!-- ORDER ITEMS -->
          <tr>
            <td style="padding: 24px 24px 8px 24px;">
              <p style="margin: 0 0 20px 0; font-size: 22px; font-weight: 800; color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">Detalle del pedido</p>
              ${itemsHtml2}

              <!-- Totals -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 28px;">
                <tr>
                  <td style="font-size: 15px; color: #333333; padding: 6px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">Subtotal</td>
                  <td align="right" style="font-size: 15px; color: #333333; font-weight: 500; padding: 6px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${subtotalFormatted2}</td>
                </tr>
                <tr>
                  <td style="font-size: 15px; color: #333333; padding: 6px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">Envío</td>
                  <td align="right" style="font-size: 15px; color: #333333; font-weight: 500; padding: 6px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${isDelivery2 && data.delivery_fee ? deliveryFeeFormatted2 : '$0'}</td>
                </tr>

              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 24px 28px 24px; border-bottom: 1px solid #e8e8e8;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size: 28px; font-weight: 800; color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">Total</td>
                  <td align="right" style="font-size: 28px; font-weight: 800; color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${totalFormatted2}</td>
                </tr>
              </table>
            </td>
          </tr>

          ${klapBlock2}

          <!-- FOOTER -->
          <tr>
            <td style="background-color: #f7f7f8; padding: 20px 24px; border-top: 1px solid #eeeeee;">
              <p style="margin: 0 0 6px 0; font-size: 13px; color: #888888; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                ID: <span style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace;">${data.order_id || data.order_number || ''}</span> se ha empezado el ${new Date().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Santiago' })} ${new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' })}
              </p>
              <p style="margin: 0; font-size: 12px; color: #aaaaaa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                Impulsado por <strong style="color: #888888;">FoodHub</strong>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
    } else if (type === 'send_whatsapp') {
      const { phone, organization_id, message, from_number } = data
      if (!phone) throw new Error('Phone is required')

      const KAPSO_API_KEY = Deno.env.get('KAPSO_API_KEY')
      if (!KAPSO_API_KEY) throw new Error('KAPSO_API_KEY not set')

      let phoneNumberId = from_number
      if (!phoneNumberId) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const orgRes = await fetch(`${supabaseUrl}/rest/v1/organizations?id=eq.${organization_id}&select=whatsapp_phone_number_id`, {
          headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` },
        })
        const [org] = await orgRes.json()
        phoneNumberId = org?.whatsapp_phone_number_id
      }
      if (!phoneNumberId) throw new Error('WhatsApp phone number not configured')

      const res = await fetch(`https://api.kapso.ai/meta/whatsapp/v24.0/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': KAPSO_API_KEY,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phone.startsWith('+') ? phone : `+${phone}`,
          type: 'text',
          text: { body: message },
        }),
      })

      if (!res.ok) {
        const txt = await res.text()
        throw new Error(`Kapso error: ${txt}`)
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } else if (type === 'sale_notification') {
      // Internal notification to the business when a new online/WhatsApp sale arrives
      const orderNumber = data.order_number || ''
      const orgName = data.organization?.name || 'FoodHub'
      const orgLogo = data.organization?.logo_url || null
      const channel = data.channel || data.order_type || 'online'
      const channelLabelMap: Record<string, string> = {
        whatsapp: 'WhatsApp',
        online: 'Tienda online',
      }
      const channelLabel = channelLabelMap[channel] || channel

      const deliveryType = data.delivery_type || 'pickup'
      const isDelivery = deliveryType === 'delivery'
      const customerName = data.customer_name || 'Cliente'
      const customerPhone = data.customer_phone || null
      const deliveryAddress = data.delivery_address || ''
      const notes = data.notes || ''

      const totalFormatted = data.total
        ? `$${Number(data.total).toLocaleString('es-CL')}`
        : ''
      const subtotalFormatted = data.subtotal
        ? `$${Number(data.subtotal).toLocaleString('es-CL')}`
        : ''
      const deliveryFeeFormatted = data.delivery_fee && data.delivery_fee > 0
        ? `$${Number(data.delivery_fee).toLocaleString('es-CL')}`
        : 'Sin costo'

      const paymentMethodMap: Record<string, string> = {
        cash: 'Efectivo',
        card: 'Tarjeta',
        transfer: 'Transferencia',
        online: 'Pago Online',
        online_gateway: 'Klap (Online)',
        pending: 'Pendiente',
      }
      const paymentLabel = paymentMethodMap[data.payment_method] || data.payment_method || 'Por definir'

      const itemsHtml = (data.items || []).map((item: any) => {
        const itemTotal = item.total_price
          ? `$${Number(item.total_price).toLocaleString('es-CL')}`
          : ''
        const subParts: string[] = []
        if (Array.isArray(item.order_item_variants)) {
          item.order_item_variants.forEach((v: any) => { if (v.variant_option_name) subParts.push(v.variant_option_name) })
        }
        if (Array.isArray(item.order_item_ingredients)) {
          item.order_item_ingredients.forEach((i: any) => { if (i.ingredient_name) subParts.push(i.ingredient_name) })
        }
        const subText = subParts.join(' · ')
        return `
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 0;">
            <tr>
              <td valign="top" style="padding: 12px 0; border-bottom: 1px solid #f0f0f0;">
                <p style="margin: 0 0 2px 0; font-size: 14px; color: #111111; font-weight: 700; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${item.quantity} × ${item.product_name || item.name}</p>
                ${subText ? `<p style="margin: 0; font-size: 12px; color: #888888; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${subText}</p>` : ''}
              </td>
              <td width="90" valign="top" align="right" style="padding: 12px 0; border-bottom: 1px solid #f0f0f0; white-space: nowrap;">
                <span style="font-size: 14px; color: #111111; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${itemTotal}</span>
              </td>
            </tr>
          </table>`
      }).join('')

      subject = `Nueva venta a través de ${channelLabel} — ${orderNumber}`

      html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Nueva venta recibida</title>
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; padding: 0;">
    <tr>
      <td align="center" style="padding: 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; overflow: hidden;">

          <!-- BRAND HEADER -->
          <tr>
            <td style="background-color: #ffffff; padding: 40px 24px 24px 24px; text-align: center;">
              ${orgLogo
                ? `<img src="${orgLogo}" alt="${orgName}" style="width: 80px; height: 80px; object-fit: cover; display: inline-block; border-radius: 20px; margin-bottom: 24px; box-shadow: 0 4px 16px rgba(0,0,0,0.10);" />`
                : `<div style="display: inline-block; margin-bottom: 24px; background-color: #0a0a0a; width: 80px; height: 80px; border-radius: 20px; text-align: center; line-height: 80px;"><span style="font-size: 28px; font-weight: 900; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${orgName.charAt(0)}</span></div>`
              }
              <br/>
              <h1 style="margin: 0 0 6px 0; font-size: 26px; font-weight: 800; color: #0a0a0a; letter-spacing: -0.5px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                Nueva venta recibida
              </h1>
              <p style="margin: 0; font-size: 16px; font-weight: 600; color: #555555; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                Vía ${channelLabel}
              </p>
            </td>
          </tr>

          <!-- ORDER HEADLINE -->
          <tr>
            <td style="padding: 0 16px 0 16px; text-align: center; border-bottom: 1px solid #f0f0f0;">
              <p style="margin: 0 0 6px 0; font-size: 13px; font-weight: 600; letter-spacing: 1.2px; text-transform: uppercase; color: #aaaaaa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                Número de Pedido
              </p>
              <h2 style="margin: 0 0 24px 0; font-size: 36px; font-weight: 800; color: #0a0a0a; letter-spacing: -1px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                ${orderNumber}
              </h2>
            </td>
          </tr>

          <!-- CUSTOMER / DELIVERY LOCATION -->
          <tr>
            <td style="padding: 24px 16px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f7f7f8; border-radius: 12px; overflow: hidden;">
                <tr>
                  <td style="padding: 20px 20px 4px 20px;">
                    <p style="margin: 0; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #999999; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                      ${isDelivery ? 'Cliente y despacho' : 'Cliente y retiro'}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 6px 20px 4px 20px;">
                    <p style="margin: 0; font-size: 16px; font-weight: 700; color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                      ${customerName}
                    </p>
                  </td>
                </tr>
                ${customerPhone ? `<tr>
                  <td style="padding: 2px 20px 4px 20px;">
                    <p style="margin: 0; font-size: 14px; color: #666666; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                      ${customerPhone}
                    </p>
                  </td>
                </tr>` : ''}
                ${(isDelivery && deliveryAddress) ? `<tr>
                  <td style="padding: 2px 20px 20px 20px;">
                    <p style="margin: 0; font-size: 14px; color: #666666; line-height: 1.5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                      ${deliveryAddress}
                    </p>
                  </td>
                </tr>` : `<tr><td style="padding-bottom: 16px;"></td></tr>`}
                ${(!isDelivery && notes) ? `<tr>
                  <td style="padding: 2px 20px 20px 20px;">
                    <p style="margin: 0; font-size: 13px; color: #888888; font-style: italic; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                      📝 ${notes}
                    </p>
                  </td>
                </tr>` : ''}
                ${(isDelivery && notes) ? `<tr>
                  <td style="padding: 2px 20px 20px 20px;">
                    <p style="margin: 0; font-size: 13px; color: #888888; font-style: italic; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                      📝 ${notes}
                    </p>
                  </td>
                </tr>` : ''}
              </table>
            </td>
          </tr>

          <!-- ORDER ITEMS -->
          <tr>
            <td style="padding: 24px 24px 8px 24px;">
              <p style="margin: 0 0 20px 0; font-size: 22px; font-weight: 800; color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">Detalle del pedido</p>
              ${itemsHtml}

              <!-- Totals -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 28px;">
                <tr>
                  <td style="font-size: 15px; color: #333333; padding: 6px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">Subtotal</td>
                  <td align="right" style="font-size: 15px; color: #333333; font-weight: 500; padding: 6px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${subtotalFormatted}</td>
                </tr>
                <tr>
                  <td style="font-size: 15px; color: #333333; padding: 6px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">Envío</td>
                  <td align="right" style="font-size: 15px; color: #333333; font-weight: 500; padding: 6px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${isDelivery && data.delivery_fee ? deliveryFeeFormatted : '$0'}</td>
                </tr>
                <tr>
                  <td style="font-size: 15px; color: #333333; padding: 6px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">Método de pago</td>
                  <td align="right" style="font-size: 15px; color: #333333; font-weight: 500; padding: 6px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${paymentLabel}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 24px 28px 24px; border-bottom: 1px solid #e8e8e8;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size: 28px; font-weight: 800; color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">Total</td>
                  <td align="right" style="font-size: 28px; font-weight: 800; color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${totalFormatted}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background-color: #f7f7f8; padding: 20px 24px; border-top: 1px solid #eeeeee;">
              <p style="margin: 0 0 6px 0; font-size: 13px; color: #888888; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                Recibido el ${new Date().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Santiago' })} ${new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' })}
              </p>
              <p style="margin: 0; font-size: 12px; color: #aaaaaa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                Impulsado por <strong style="color: #888888;">FoodHub</strong>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
    } else {
      throw new Error('Invalid email type')
    }

    const senderName = (type === 'welcome')
      ? (data?.organization_name || 'FoodHub')
      : (data?.organization?.name || 'FoodHub')

    // Generate a simple plain text fallback to prevent spam filters from flagging HTML-only emails
    const plainText = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: `${senderName} <${fromEmail}>`,
        reply_to: data?.organization?.email || fromEmail,
        to: email,
        subject: subject,
        html: html,
        text: plainText
      })
    })

    if (!res.ok) {
      const errorText = await res.text()
      console.error('Resend API error:', errorText)
      throw new Error(`Failed to send email: ${errorText}`)
    }

    const resData = await res.json()

    return new Response(
      JSON.stringify(resData),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (error) {
    console.error('Edge function error:', error.message)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    )
  }
})
