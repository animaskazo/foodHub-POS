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
