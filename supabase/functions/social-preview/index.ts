import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const rawSlug = url.searchParams.get('slug') || url.pathname.split('/').pop() || ''
    const slug = rawSlug.trim().toLowerCase()

    if (!slug) {
      return new Response('Missing slug', { status: 400 })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const headers = {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
    }

    // 1) Búsqueda exacta por slug (los subdominios llegan en minúsculas).
    let org: Record<string, string | null> | null = null
    const bySlug = await fetch(
      `${supabaseUrl}/rest/v1/organizations?select=name,slug,logo_url,cover_url,description&slug=eq.${encodeURIComponent(slug)}`,
      { headers },
    )
    if (bySlug.ok) {
      const orgs = await bySlug.json()
      org = orgs?.[0] || null
    }

    // 2) Fallback: búsqueda insensible a mayúsculas por nombre (por si
    // subdominio y slug difieren, ej. "Mi Tienda" vs "mi-tienda").
    if (!org) {
      const byName = await fetch(
        `${supabaseUrl}/rest/v1/organizations?select=name,slug,logo_url,cover_url,description&or=(slug.ilike.${encodeURIComponent(slug)},name.ilike.${encodeURIComponent(slug)})&limit=1`,
        { headers },
      )
      if (byName.ok) {
        const orgs = await byName.json()
        org = orgs?.[0] || null
      }
    }

    const appOrigin = url.searchParams.get('origin') || 'https://food.digital-solutions.work'
    const atRoot = url.searchParams.get('root') === '1'
    const name = org?.name || slug
    const description = org?.description || `Pide online en ${name}`
    const logo = org?.logo_url || null
    const cover = org?.cover_url || null
    // Logo cuadrado -> tarjeta compacta; portada panorámica -> tarjeta grande.
    // Sin foto real no se emite og:image: WhatsApp/Instagram no renderizan SVG
    // y una imagen rota es peor que solo título + descripción.
    const image = logo || cover || null
    const isLogo = Boolean(logo)
    const appUrl = atRoot ? appOrigin : `${appOrigin}/order/${slug}`

    const imageTags = image ? `
  <meta property="og:image" content="${escapeHtml(image)}" />
  <meta property="og:image:secure_url" content="${escapeHtml(image)}" />
  <meta property="og:image:width" content="${isLogo ? '600' : '1200'}" />
  <meta property="og:image:height" content="${isLogo ? '600' : '630'}" />
  <meta property="og:image:alt" content="${escapeHtml(name)}" />` : ''

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="refresh" content="0;url=${escapeHtml(appUrl)}" />
  <title>${escapeHtml(name)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta property="og:locale" content="es_CL" />
  <meta property="og:title" content="${escapeHtml(name)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />${imageTags}
  <meta property="og:site_name" content="${escapeHtml(name)}" />
  <meta property="og:url" content="${escapeHtml(appUrl)}" />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="${isLogo || !image ? 'summary' : 'summary_large_image'}" />
  <meta name="twitter:title" content="${escapeHtml(name)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />${image ? `
  <meta name="twitter:image" content="${escapeHtml(image)}" />` : ''}
</head>
<body>
  <script>location.href=${JSON.stringify(appUrl)}</script>
</body>
</html>`

    return new Response(html, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    )
  }
})

function escapeHtml(str: string): string {
  return str.replace(/\r?\n/g, ' ').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
