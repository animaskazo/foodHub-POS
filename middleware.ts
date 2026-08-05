const CRAWLER_RE = /bot|crawler|spider|facebook|twitter|whatsapp|telegram|slack|discord|preview|linkedin|pinterest|vkShare|embedly|skype|quora/i

const SOCIAL_PREVIEW_URL = 'https://fgvhbniauzjvzeuespmf.supabase.co/functions/v1/social-preview'

// Dominios base: solo los subdominios de estas zonas se tratan como tiendas.
const TENANT_SUBDOMAIN_RE = /\.foodhub\.work$/i
const RESERVED_SUBDOMAINS = ['admin', 'app']

export const config = {
  matcher: ['/', '/order/:slug'],
}

export default async function middleware(req: Request) {
  const url = new URL(req.url)
  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  const ua = req.headers.get('user-agent') || ''

  // Subdominio de tienda → redirige a /order/:slug
  if (TENANT_SUBDOMAIN_RE.test(host) && url.pathname === '/') {
    const sub = host.split('.')[0]
    if (!RESERVED_SUBDOMAINS.includes(sub)) {
      return Response.redirect(new URL(`/order/${encodeURIComponent(sub)}`, url), 308)
    }
  }

  // Social preview para crawlers, usando el origin real del request
  if (CRAWLER_RE.test(ua) && url.pathname.startsWith('/order/')) {
    const slug = url.pathname.replace('/order/', '')
    const previewUrl = `${SOCIAL_PREVIEW_URL}?slug=${encodeURIComponent(slug)}&origin=${encodeURIComponent(url.origin)}`
    const res = await fetch(previewUrl)
    const html = await res.text()

    return new Response(html, {
      headers: { 'content-type': 'text/html;charset=utf-8' },
    })
  }
}
