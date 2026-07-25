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
        pending: 'Pago pendiente',
      }
      const paymentLabel = paymentMethodMap[data.payment_method] || data.payment_method || 'En local'

      const totalFormatted = data.total
        ? `$${Number(data.total).toLocaleString('es-CL')}`
        : ''
      const subtotalFormatted = data.subtotal
        ? `$${Number(data.subtotal).toLocaleString('es-CL')}`
        : `$${Number(data.total - (data.delivery_fee || 0)).toLocaleString('es-CL')}`
      const deliveryFeeFormatted = data.delivery_fee
        ? `$${Number(data.delivery_fee).toLocaleString('es-CL')}`
        : 'Gratis'

      const itemsHtml = (data.items || []).map((item: any) => {
        // Support both direct image URL (from publicOrderService) and nested Supabase structure
        const imageUrl = item.image_url
          || item.products?.product_images?.[0]?.url
          || (Array.isArray(item.product_images) ? item.product_images[0]?.url : null)
          || null
        const itemTotal = item.total_price
          ? `$${Number(item.total_price).toLocaleString('es-CL')}`
          : ''
        return `
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 0;">
            <tr>
              ${imageUrl ? `
              <td width="64" valign="top" style="padding: 14px 0; padding-right: 14px;">
                <img src="${imageUrl}" alt="${item.product_name}"
                  style="width: 60px; height: 60px; border-radius: 8px; object-fit: cover; display: block; background-color: #f0f0f0;" />
              </td>` : `
              <td width="40" valign="top" style="padding: 14px 0; padding-right: 14px;">
                <div style="width: 36px; height: 36px; border-radius: 6px; background-color: #f0f0f0;"></div>
              </td>`}
              <td valign="middle" style="padding: 14px 0; border-bottom: 1px solid #eeeeee;">
                <span style="font-size: 14px; color: #888888; font-weight: 600;">${item.quantity}×</span>
                <span style="font-size: 15px; color: #111111; font-weight: 500; margin-left: 4px;">${item.product_name}</span>
              </td>
              <td width="90" valign="middle" align="right" style="padding: 14px 0; border-bottom: 1px solid #eeeeee; white-space: nowrap;">
                <span style="font-size: 15px; color: #111111; font-weight: 600;">${itemTotal}</span>
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
<body style="margin: 0; padding: 0; background-color: #f0f0f0; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0f0f0; padding: 0;">
    <tr>
      <td align="center" style="padding: 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px; background-color: #ffffff; overflow: hidden; box-shadow: 0 8px 40px rgba(0,0,0,0.10);">

          <!-- ██ BRAND HEADER ██ -->
          <tr>
            <td style="background-color: #0a0a0a; padding: 36px 32px 28px 32px; text-align: center;">
              ${orgLogo
                ? `<img src="${orgLogo}" alt="${orgName}" style="max-height: 52px; max-width: 180px; display: inline-block; margin-bottom: 20px;" />`
                : `<p style="margin: 0 0 20px 0; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">${orgName}</p>`
              }
              <br/>
              <span style="display: inline-block; background-color: ${isDelivery ? '#f97316' : '#22c55e'}; color: #ffffff; font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; padding: 6px 18px; border-radius: 100px;">
                ${isDelivery ? '🛵 &nbsp;A reparto' : '✓ &nbsp;¡Listo para retirar!'}
              </span>
            </td>
          </tr>

          <!-- ██ ORDER HEADLINE ██ -->
          <tr>
            <td style="padding: 32px 32px 0 32px; text-align: center; border-bottom: 1px solid #f0f0f0;">
              <p style="margin: 0 0 6px 0; font-size: 13px; font-weight: 600; letter-spacing: 1.2px; text-transform: uppercase; color: #aaaaaa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                Número de Pedido
              </p>
              <h1 style="margin: 0 0 6px 0; font-size: 36px; font-weight: 800; color: #0a0a0a; letter-spacing: -1px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                ${data.order_number || ''}
              </h1>
              <p style="margin: 0 0 28px 0; font-size: 15px; color: #666666; line-height: 1.5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                ${isDelivery ? 'Tu pedido está listo y saldrá a reparto a tu dirección. Prepárate para recibirlo.' : 'Tu pedido está listo. Muestra este número en el local para retirar.'}
              </p>
            </td>
          </tr>

          <!-- ██ PICKUP/DELIVERY LOCATION ██ -->
          <tr>
            <td style="padding: 24px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f7f7f8; border-radius: 12px; overflow: hidden;">
                <tr>
                  <td style="padding: 20px 20px 4px 20px;">
                    <p style="margin: 0; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #999999; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                      ${isDelivery ? '🛵 Dirección de Despacho' : '📍 Punto de Retiro'}
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
              </table>
            </td>
          </tr>

          <!-- ██ ORDER SUMMARY ██ -->
          <tr>
            <td style="padding: 0 32px 24px 32px;">
              <p style="margin: 0 0 16px 0; font-size: 13px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #0a0a0a; border-bottom: 2px solid #0a0a0a; padding-bottom: 10px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                Resumen del Pedido
              </p>
              ${itemsHtml}
            </td>
          </tr>

          <!-- ██ PAYMENT & DELIVERY INFO ██ -->
          <tr>
            <td style="padding: 0 32px 32px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0a; border-radius: 12px; overflow: hidden;">
                <tr>
                  <td style="padding: 20px 20px 0 20px;">
                    <p style="margin: 0; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #888888; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                      Detalle de Pago y Entrega
                    </p>
                  </td>
                </tr>
                <!-- Entrega -->
                <tr>
                  <td style="padding: 14px 20px 0 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size: 13px; color: #888888; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">Método de Entrega</td>
                        <td align="right" style="font-size: 13px; color: #ffffff; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${pickupMethod}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <!-- Pago -->
                <tr>
                  <td style="padding: 10px 20px 0 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size: 13px; color: #888888; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">Método de Pago</td>
                        <td align="right" style="font-size: 13px; color: #ffffff; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${paymentLabel}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <!-- Subtotal y Costo de Envío -->
                ${isDelivery ? `
                <tr>
                  <td style="padding: 10px 20px 0 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size: 13px; color: #888888; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">Subtotal</td>
                        <td align="right" style="font-size: 13px; color: #ffffff; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${subtotalFormatted}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 10px 20px 0 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size: 13px; color: #888888; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">Costo de Envío</td>
                        <td align="right" style="font-size: 13px; color: #ffffff; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${deliveryFeeFormatted}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                ` : ''}
                <!-- Divisor -->
                <tr>
                  <td style="padding: 16px 20px 0 20px;">
                    <div style="height: 1px; background-color: #333333;"></div>
                  </td>
                </tr>
                <!-- Total -->
                <tr>
                  <td style="padding: 16px 20px 20px 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size: 16px; color: #aaaaaa; font-weight: 700; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">Total Pagado</td>
                        <td align="right" style="font-size: 24px; color: #ffffff; font-weight: 800; letter-spacing: -0.5px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${totalFormatted}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ██ PAYMENT NOTE ██ -->
          <tr>
            <td style="padding: 0 32px 32px 32px; text-align: center;">
              <p style="margin: 0; font-size: 14px; color: #888888; line-height: 1.6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                Aceptamos <strong style="color: #555555;">efectivo, débito, crédito y transferencia</strong> en el local.
              </p>
            </td>
          </tr>

          <!-- ██ FOOTER ██ -->
          <tr>
            <td style="background-color: #f7f7f8; padding: 24px 32px; text-align: center; border-top: 1px solid #eeeeee;">
              <p style="margin: 0 0 4px 0; font-size: 12px; color: #cccccc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                Impulsado por <strong style="color: #aaaaaa;">FoodHub</strong>
              </p>
              <p style="margin: 0; font-size: 11px; color: #dddddd; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                Este correo fue enviado automáticamente, por favor no respondas.
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

      const pickupMethod2 = data.order_type === 'table' ? 'Servicio a la mesa'
        : data.order_type === 'takeaway' ? 'Llevar'
        : isDelivery2 ? 'Despacho a Domicilio'
        : 'Retiro en local'

      const itemsHtml2 = (data.items || []).map((item: any) => {
        const imageUrl = item.image_url
          || item.image
          || item.imageUrl
          || item.products?.product_images?.[0]?.url
          || (Array.isArray(item.product_images) ? item.product_images[0]?.url : null)
          || null
        const itemTotal = item.total_price
          ? `$${Number(item.total_price).toLocaleString('es-CL')}`
          : ''
        return `
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              ${imageUrl ? `
              <td width="64" valign="top" style="padding: 12px 0; padding-right: 14px;">
                <img src="${imageUrl}" alt="${item.name}"
                  style="width: 56px; height: 56px; border-radius: 8px; object-fit: cover; display: block; background-color: #f0f0f0;" />
              </td>` : `
              <td width="40" valign="top" style="padding: 12px 0; padding-right: 14px;">
                <div style="width: 36px; height: 36px; border-radius: 6px; background-color: #f0f0f0;"></div>
              </td>`}
              <td valign="middle" style="padding: 12px 0; border-bottom: 1px solid #eeeeee;">
                <span style="font-size: 14px; color: #888888; font-weight: 600;">${item.quantity}×</span>
                <span style="font-size: 15px; color: #111111; font-weight: 500; margin-left: 4px;">${item.name}</span>
              </td>
              <td width="90" valign="middle" align="right" style="padding: 12px 0; border-bottom: 1px solid #eeeeee; white-space: nowrap;">
                <span style="font-size: 15px; color: #111111; font-weight: 600;">${itemTotal}</span>
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
<body style="margin: 0; padding: 0; background-color: #f0f0f0; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0f0f0; padding: 0;">
    <tr>
      <td align="center" style="padding: 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px; background-color: #ffffff; overflow: hidden; box-shadow: 0 8px 40px rgba(0,0,0,0.10);">

          <!-- HEADER -->
          <tr>
            <td style="background-color: #0a0a0a; padding: 36px 32px 28px 32px; text-align: center;">
              ${orgLogo2
                ? `<img src="${orgLogo2}" alt="${orgName2}" style="max-height: 52px; max-width: 180px; display: inline-block; margin-bottom: 20px;" />`
                : `<p style="margin: 0 0 20px 0; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">${orgName2}</p>`
              }
              <br/>
              <span style="display: inline-block; background-color: #3b82f6; color: #ffffff; font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; padding: 6px 18px; border-radius: 100px;">
                ✔ &nbsp;Pedido Confirmado
              </span>
            </td>
          </tr>

          <!-- HEADLINE -->
          <tr>
            <td style="padding: 32px 32px 0 32px; text-align: center; border-bottom: 1px solid #f0f0f0;">
              <p style="margin: 0 0 6px 0; font-size: 13px; font-weight: 600; letter-spacing: 1.2px; text-transform: uppercase; color: #aaaaaa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                Número de Pedido
              </p>
              <h1 style="margin: 0 0 12px 0; font-size: 36px; font-weight: 800; color: #0a0a0a; letter-spacing: -1px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                ${data.order_number || ''}
              </h1>
              <p style="margin: 0 0 8px 0; font-size: 16px; color: #111111; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                ¡Recibimos tu pedido!
              </p>
              <p style="margin: 0 0 28px 0; font-size: 15px; color: #666666; line-height: 1.6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                Lo estamos preparando con cuidado.<br/>${isDelivery2 ? 'Te avisaremos por correo en cuanto salga a reparto a tu dirección.' : 'Te avisaremos por correo en cuanto esté listo para retirar.'}
              </p>
            </td>
          </tr>

          <!-- PICKUP/DELIVERY LOCATION -->
          <tr>
            <td style="padding: 24px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f7f7f8; border-radius: 12px; overflow: hidden;">
                <tr>
                  <td style="padding: 20px 20px 4px 20px;">
                    <p style="margin: 0; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #999999; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                      ${isDelivery2 ? '🛵 Dirección de Despacho' : '📍 Punto de Retiro'}
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
              </table>
            </td>
          </tr>

          <!-- ORDER ITEMS -->
          <tr>
            <td style="padding: 0 32px 24px 32px;">
              <p style="margin: 0 0 16px 0; font-size: 13px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #0a0a0a; border-bottom: 2px solid #0a0a0a; padding-bottom: 10px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                Tu Pedido
              </p>
              ${itemsHtml2}
            </td>
          </tr>

          <!-- PAYMENT & DELIVERY -->
          <tr>
            <td style="padding: 0 32px 32px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0a; border-radius: 12px; overflow: hidden;">
                <tr>
                  <td style="padding: 20px 20px 0 20px;">
                    <p style="margin: 0; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #888888; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                      Resumen
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 14px 20px 0 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size: 13px; color: #888888; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">Método de Entrega</td>
                        <td align="right" style="font-size: 13px; color: #ffffff; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${pickupMethod2}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <!-- Subtotal y Costo de Envío -->
                ${isDelivery2 ? `
                <tr>
                  <td style="padding: 10px 20px 0 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size: 13px; color: #888888; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">Subtotal</td>
                        <td align="right" style="font-size: 13px; color: #ffffff; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${subtotalFormatted2}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 10px 20px 0 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size: 13px; color: #888888; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">Costo de Envío</td>
                        <td align="right" style="font-size: 13px; color: #ffffff; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${deliveryFeeFormatted2}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                ` : ''}
                <tr>
                  <td style="padding: 16px 20px 0 20px;">
                    <div style="height: 1px; background-color: #333333;"></div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px 20px 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size: 16px; color: #aaaaaa; font-weight: 700; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">Total</td>
                        <td align="right" style="font-size: 24px; color: #ffffff; font-weight: 800; letter-spacing: -0.5px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${totalFormatted2}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- PAYMENT NOTE -->
          <tr>
            <td style="padding: 0 32px 32px 32px; text-align: center;">
              <p style="margin: 0; font-size: 14px; color: #888888; line-height: 1.6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                Aceptamos <strong style="color: #555555;">efectivo, débito, crédito y transferencia</strong> en el local.
              </p>
            </td>
          </tr>

          <!-- ██ FOOTER ██ -->
          <tr>
            <td style="background-color: #f7f7f8; padding: 24px 32px; text-align: center; border-top: 1px solid #eeeeee;">
              <p style="margin: 0 0 4px 0; font-size: 12px; color: #cccccc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                Impulsado por <strong style="color: #aaaaaa;">FoodHub</strong>
              </p>
              <p style="margin: 0; font-size: 11px; color: #dddddd; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                Este correo fue enviado automáticamente, por favor no respondas.
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

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: `${senderName} <${fromEmail}>`,
        to: email,
        subject: subject,
        html: html
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
