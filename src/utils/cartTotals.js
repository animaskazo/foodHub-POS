// Fuente única de verdad para totales del carrito (POS + online).
//
// Modelo de datos:
// - Producto estándar: `item.price` es SOLO la base (+ variante ya incluida en
//   `addToCart`). Los ingredientes extra van en `item.selectedIngredients` y
//   SE SUMAN al total.
// - Combo/bundle: `item.price` YA es el total del combo (base + modificadores
//   de opciones + modificadores de variante + ingredientes extra de cada opción,
//   calculado en BundleSelectionModal / ProductDetailView). Por lo tanto NO se
//   deben sumar `selectedOptions` de nuevo (eso duplicaría el cobro en pantalla).

export const sumExtraIngredients = (ingredients) =>
  (ingredients || []).reduce((s, ing) => s + Math.round(ing.price || 0), 0);

export const getBundleOptionUnitPrice = (sel) => {
  let unit = Math.round(sel.priceModifier ?? sel.price ?? 0);
  if (sel.variant) {
    unit += Math.round(sel.variant.price_modifier || 0);
  }
  (sel.selectedIngredients || []).forEach((ing) => {
    if (ing.isExtra !== false) {
      unit += Math.round(ing.price || 0);
    }
  });
  return unit;
};

export const getCartItemUnitPrice = (item) => {
  const base = Math.round(item.price || 0);
  // Los combos ya traen el total calculado en `price`. No sumar opciones de nuevo.
  if (item.type === 'bundle') {
    return base;
  }
  return base + sumExtraIngredients(item.selectedIngredients);
};

export const getCartItemLineTotal = (item) =>
  getCartItemUnitPrice(item) * (item.quantity || 1);

export const getCartTotal = (items = []) =>
  items.reduce((acc, i) => acc + getCartItemLineTotal(i), 0);

export const getCartTotalsWithTax = (items = [], taxRate = 0.19) => {
  const total = getCartTotal(items);
  const subtotal = Math.round(total / (1 + taxRate));
  const tax = total - subtotal;
  return { total, subtotal, tax };
};
