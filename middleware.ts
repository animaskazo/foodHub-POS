const CRAWLER_RE = /bot|crawler|spider|facebook|twitter|whatsapp|telegram|slack|discord|preview|linkedin|pinterest|vkShare|embedly|skype|quora/i

const SOCIAL_PREVIEW_URL = 'https://fgvhbniauzjvzeuespmf.supabase.co/functions/v1/social-preview'

// Dominios base: solo los subdominios de estas zonas se tratan como tiendas.
const TENANT_SUBDOMAIN_RE = /\.foodhub\.work$/i
const RESERVED_SUBDOMAINS = ['admin', 'app']

export const config = {
  matcher: ['/', '/order/:slug'],
}

function tenantSlugFromHost(host: string) {
  if (!TENANT_SUBDOMAIN_RE.test(host)) return null
  const sub = host.split('.')[0]
  if (RESERVED_SUBDOMAINS.includes(sub)) return null
  return sub || null
}

export default async function middleware(req: Request) {
  const url = new URL(req.url)
  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  const ua = req.headers.get('user-agent') || ''

  if (!CRAWLER_RE.test(ua)) return

  // Resolver slug desde el path o desde el subdominio (storefront en la raíz)
  let slug: string | null = null
  if (url.pathname.startsWith('/order/')) {
    slug = url.pathname.replace('/order/', '').split('/')[0]
  } else if (url.pathname === '/') {
    slug = tenantSlugFromHost(host)
  }
  if (!slug) return

  const atRoot = url.pathname === '/'
  const previewUrl = `${SOCIAL_PREVIEW_URL}?slug=${encodeURIComponent(slug)}&origin=${encodeURIComponent(url.origin)}${atRoot ? '&root=1' : ''}`
  const res = await fetch(previewUrl)
  const html = await res.text()

  return new Response(html, {
    headers: { 'content-type': 'text/html;charset=utf-8' },
  })
}
