import { supabase } from '../lib/supabase';

// ── Caché de fotos de productos ────────────────────────────
// La cocina refresca cada 12s + realtime: sin caché, cada refresco
// re-preguntaría la foto de cada producto a la DB. El Map vive en
// memoria durante la sesión (las fotos casi nunca cambian) y los
// archivos los cachea el navegador por HTTP. Solo se consulta lo
// que aún no está cacheado.
const imageCache = new Map(); // productId -> url | null

export const getProductImageMap = async (productIds = []) => {
  const ids = [...new Set((productIds || []).filter(Boolean))];
  const missing = ids.filter((id) => !imageCache.has(id));

  if (missing.length > 0) {
    const { data, error } = await supabase
      .from('products')
      .select('id, product_images(url)')
      .in('id', missing);
    if (!error && data) {
      for (const p of data) {
        imageCache.set(p.id, p.product_images?.[0]?.url || null);
      }
      // Los ids sin fila también se marcan para no re-preguntar.
      for (const id of missing) {
        if (!imageCache.has(id)) imageCache.set(id, null);
      }
    }
  }

  const map = {};
  for (const id of ids) map[id] = imageCache.get(id) || null;
  return map;
};

export const invalidateProductImageCache = (productId = null) => {
  if (productId) imageCache.delete(productId);
  else imageCache.clear();
};
