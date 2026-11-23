// Loader hook: intercepta cualquier import que resuelva a src/lib/supabase y
// devuelve un cliente Supabase simulado (BD en memoria). Permite testear el
// flujo de compra REAL (createPublicOrder) sin tocar la base de PROD.

export async function resolve(specifier, context, nextResolve) {
  if (specifier.includes('lib/supabase') && !specifier.includes('@supabase')) {
    return { url: new URL('./test-checkout-flow.supabase-impl.mjs', import.meta.url).href, shortCircuit: true };
  }
  // Los módulos de la app usan imports sin extensión (lo resuelve Vite).
  // Node ESM necesita la extensión: si el specifier es un path relativo sin
  // extensión y existe el archivo .js, lo agregamos.
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[a-z]+$/i.test(specifier)) {
    const base = new URL(specifier, context.parentURL).pathname;
    try {
      const { pathToFileURL } = await import('node:url');
      const fs = await import('node:fs');
      if (fs.existsSync(`${base}.js`)) {
        return { url: pathToFileURL(`${base}.js`).href, shortCircuit: true };
      }
      if (fs.existsSync(`${base}/index.js`)) {
        return { url: pathToFileURL(`${base}/index.js`).href, shortCircuit: true };
      }
    } catch {
      // fallthrough
    }
  }
  return nextResolve(specifier, context);
}

export function load(url, context, nextLoad) {
  return nextLoad(url, context);
}
