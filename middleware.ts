const CRAWLER_RE = /bot|crawler|spider|facebook|twitter|whatsapp|telegram|slack|discord|preview|linkedin|pinterest|vkShare|embedly|skype|quora/i

const SOCIAL_PREVIEW_URL = 'https://fgvhbniauzjvzeuespmf.supabase.co/functions/v1/social-preview'

export const config = {
  matcher: '/order/:slug',
}

export default async function middleware(req: Request) {
  const ua = req.headers.get('user-agent') || ''
  if (!CRAWLER_RE.test(ua)) return

  const url = new URL(req.url)
  const slug = url.pathname.replace('/order/', '')

  const previewUrl = `${SOCIAL_PREVIEW_URL}?slug=${encodeURIComponent(slug)}&origin=${encodeURIComponent('https://food.digital-solutions.work')}`
  const res = await fetch(previewUrl)
  const html = await res.text()

  return new Response(html, {
    headers: { 'content-type': 'text/html;charset=utf-8' },
  })
}
