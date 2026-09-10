/**
 * Parser central de precios a pesos chilenos (CLP).
 *
 * Acepta números o strings en formatos variados y siempre devuelve
 * un entero >= 0 en CLP (sin decimales, redondeado).
 *
 * Formatos soportados:
 *  - CLP: "$12.990", "$ 12.990", "12.990", "12990", "12,990", "12 990",
 *         "CLP 12.990", "$12.990,50", "12990.00", "12,990.50"
 *  - Abreviados: "12k", "12,5k", "12.5K" (= 12500)
 *  - USD: "US$9.99", "USD 12.5", "U$ 10", "$US 10", "10 dólares/dollar"
 *         -> se convierten a CLP con tasa USD_TO_CLP
 *  - EUR: "€9.99", "EUR 10" -> tasa EUR_TO_CLP
 *  - Sin precio: "gratis", "cortesía", "incluido", "s/p", "consultar", "", null
 *         -> 0
 */

export const USD_TO_CLP = 950;
export const EUR_TO_CLP = 1000;

/**
 * Convierte cualquier valor a entero CLP.
 * @param {unknown} value - número, string o null/undefined
 * @param {{ usdRate?: number, eurRate?: number }} opts - tasas opcionales
 * @returns {number} entero >= 0 en CLP
 */
export function parsePriceToCLP(value, opts = {}) {
  const usdRate = opts.usdRate ?? USD_TO_CLP;
  const eurRate = opts.eurRate ?? EUR_TO_CLP;

  if (value === null || value === undefined) return 0;

  // Números: asumir CLP directo y redondear.
  // (Si la IA devolvió 12.99 para "$12.990", el prompt ya le exige entero;
  // aquí solo redondeamos para no inventar miles.)
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return 0;
    return Math.round(value);
  }

  let s = String(value).trim();
  if (!s) return 0;

  const lower = s.toLowerCase();

  // Sin precio explícito
  if (
    /(gratis|gratuito|cortes[ií]a|incluido|inclu[ií]do|consultar|s\/p|^s\.?p\.?$|a convenir|por confirmar)/i.test(
      lower
    )
  ) {
    return 0;
  }

  // Detección de moneda extranjera
  const isUSD =
    /\busd\b|us\$|u\$|\$us|d[oó]lar|dollar|buck/i.test(s);
  const isEUR = /€|\beur\b/i.test(s);
  const isUF =
    /\buf\b|\bclf\b|unidad de fomento/i.test(s);
  // UF ~ $39.000 (2026). Si aparece, convertir con tasa aprox.
  const UF_TO_CLP = 39000;

  // Sufijo "k" => miles: "12k", "12,5k", "$ 8.5 k"
  const kMatch = lower.replace(/\s+/g, '').match(/^[$\w.,]*?(\d[\d.,]*)\s*k$/);
  if (kMatch) {
    const base = parseNumericPart(kMatch[1]);
    if (base === null) return 0;
    return Math.max(0, Math.round(base * 1000 * (isUSD ? usdRate : 1)));
  }

  const numeric = parseNumericPart(s);
  if (numeric === null || !Number.isFinite(numeric) || numeric < 0) return 0;

  let clp = numeric;
  if (isUSD) clp = numeric * usdRate;
  else if (isEUR) clp = numeric * eurRate;
  else if (isUF) clp = numeric * UF_TO_CLP;

  // Sanity: CLP no usa decimales
  return Math.max(0, Math.round(clp));
}

/**
 * Extrae el valor numérico de un string con separadores es-CL / en-US mixtos.
 * - "12.990" -> 12990 (punto miles)
 * - "12,990" -> 12990 (coma miles)
 * - "12 990" / "12'990" -> 12990
 * - "12.990,50" / "12,990.50" -> 12990.5
 * - "9.99" / "9,99" -> 9.99
 * - "1.200.000" -> 1200000
 * @returns {number|null}
 */
function parseNumericPart(raw) {
  // Quedarse solo con dígitos, punto, coma, signo y espacio
  let s = String(raw)
    .replace(/[^\d.,\s'-]/g, '')
    .trim()
    .replace(/[\s']/g, '');

  if (!s || s === '.' || s === ',' || s === '-') return null;

  // Signo negativo => tratar como 0 aguas arriba (no hay precios negativos)
  s = s.replace(/-/g, '');
  if (!s) return null;

  const hasDot = s.includes('.');
  const hasComma = s.includes(',');

  let normalized;

  if (hasDot && hasComma) {
    // El último separador es el decimal: "12.990,50" o "12,990.50"
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    const decimalSep = lastDot > lastComma ? '.' : ',';
    const thousandSep = decimalSep === '.' ? ',' : '.';
    normalized = s.split(thousandSep).join('').replace(decimalSep, '.');
  } else if (hasComma) {
    const parts = s.split(',');
    if (parts.length > 2) {
      // "1,200,000" => miles
      normalized = parts.join('');
    } else {
      const dec = parts[1] ?? '';
      // 2 decimales => decimal ("9,99", "12990,50"); 3 dígitos => miles ("12,990")
      if (dec.length === 2) normalized = parts.join('.');
      else if (dec.length === 3) normalized = parts.join('');
      else if (dec.length === 0) normalized = parts.join('');
      else normalized = parts.join('.');
    }
  } else if (hasDot) {
    const parts = s.split('.');
    if (parts.length > 2) {
      // "1.200.000" => miles
      normalized = parts.join('');
    } else {
      const dec = parts[1] ?? '';
      if (dec.length === 3) normalized = parts.join(''); // "12.990" miles
      else normalized = parts.join('.'); // "9.99" decimal, "12990.0", etc.
    }
  } else {
    normalized = s;
  }

  if (!normalized || normalized === '.') return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Formatea entero CLP: 12990 -> "$12.990" */
export function formatCLP(n) {
  const v = typeof n === 'number' ? n : parsePriceToCLP(n);
  return '$' + Math.round(v || 0).toLocaleString('es-CL');
}

/**
 * Parsea cantidades (stock, porciones, umbrales) respetando separadores
 * es-CL/en-US pero SIN redondear a entero ni convertir monedas.
 * "1.500" -> 1500, "0,5" -> 0.5, "1,200.5" -> 1200.5
 */
export function parseQuantity(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, value) : 0;
  const s = String(value).trim();
  if (!s) return 0;
  const n = parseNumericPart(s);
  if (n === null || !Number.isFinite(n) || n < 0) return 0;
  return n;
}

export default parsePriceToCLP;
