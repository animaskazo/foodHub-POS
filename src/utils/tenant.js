const TENANT_DOMAIN = 'foodhub.work';
const RESERVED_SUBDOMAINS = ['app', 'admin', 'www'];

export const getTenantSlug = () => {
  if (typeof window === 'undefined') return null;
  const host = window.location.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== TENANT_DOMAIN && !host.endsWith(`.${TENANT_DOMAIN}`)) return null;
  if (host === TENANT_DOMAIN) return null;
  const sub = host.slice(0, host.indexOf('.'));
  if (RESERVED_SUBDOMAINS.includes(sub)) return null;
  return sub || null;
};

// URL relativa de la tienda según el host actual:
// en el dominio de tenants usa el subdominio canónico, en cualquier otro
// host (localhost, admin, etc.) apunta al origen actual + /order/{slug}.
export const getStoreUrl = (slug) => {
  if (typeof window === 'undefined') return null;
  if (!slug) return null;
  const host = window.location.hostname.toLowerCase().replace(/^www\./, '');
  const isTenantHost = host === TENANT_DOMAIN || host.endsWith(`.${TENANT_DOMAIN}`);
  if (isTenantHost) return `https://${slug}.${TENANT_DOMAIN}`;
  return `${window.location.origin}/order/${encodeURIComponent(slug)}`;
};
