export const buildSelection = (opt) => {
  const activeVariants = opt.variants?.filter(v => v.is_active) || [];
  const lockedVariant = opt.variantId ? activeVariants.find(v => v.id === opt.variantId) : null;
  const chosenVariant = lockedVariant || activeVariants.reduce((min, v) => {
    if (!min) return v;
    return (v.price_modifier || 0) < (min.price_modifier || 0) ? v : min;
  }, null);

  return {
    optionId: opt.id,
    productId: opt.productId,
    name: opt.name,
    priceModifier: opt.priceModifier || 0,
    quantity: 1,
    variant: chosenVariant,
    selectedIngredients: []
  };
};

export const selectionFromCartOption = (opt) => ({
  optionId: opt.optionId,
  productId: opt.productId,
  name: opt.originalName || opt.name,
  priceModifier: opt.priceModifier || 0,
  quantity: opt.quantity || 1,
  variant: opt.variant || null,
  selectedIngredients: opt.selectedIngredients || []
});

export const defaultSelectionsForSlot = (slot) => {
  const ordered = slot.options?.length
    ? [...slot.options].sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0))
    : [];
  const max = slot.maxSelections > 0 ? slot.maxSelections : 1;
  const count = Math.min(max, Math.max(slot.minSelections || 0, 1));
  return ordered.slice(0, count).map(buildSelection);
};

export const slotIsMultiSelect = (slot) => {
  const max = slot.maxSelections > 0 ? slot.maxSelections : 1;
  const min = slot.minSelections || 0;
  return max > 1 || min > 1;
};

export const bundleHasChoices = (slots) =>
  (slots || []).some(slot =>
    slotIsMultiSelect(slot) ||
    (slot.options?.length > 1) ||
    slot.options?.some(opt =>
      (opt.variants && opt.variants.length > 0 && !opt.variantId) ||
      (opt.ingredients && opt.ingredients.some(i => i.isExtra))
    )
  );
