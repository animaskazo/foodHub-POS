import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';

const ProductDetailView = ({ product, onAdd, onBack, initialVariant = null, initialExtras = [], initialQuantity = 1 }) => {
  const isBundle = product.type === 'bundle';
  const hasVariants = product.variants?.length > 0;
  const extraIngredients = product.ingredients?.filter(i => i.isExtra) || [];
  const baseIngredients = product.ingredients?.filter(i => !i.isExtra) || [];
  const hasExtras = extraIngredients.length > 0;

  const cheapestVariant = useMemo(() => {
    if (!product.variants || product.variants.length === 0) return null;
    return product.variants.reduce((cheapest, v) => {
      if (!cheapest) return v;
      return (v.price_modifier || 0) < (cheapest.price_modifier || 0) ? v : cheapest;
    }, null);
  }, [product.variants]);

  const [selectedVariant, setSelectedVariant] = useState(initialVariant || cheapestVariant);
  const [selectedExtras, setSelectedExtras] = useState(initialExtras);
  const [quantity, setQuantity] = useState(initialQuantity);

  // Bundle selection state
  const [selections, setSelections] = useState(() => {
    if (product.type === 'bundle') {
      const initial = {};
      if (product.selectedOptions) {
        product.selectedOptions.forEach(opt => {
          initial[opt.slotId] = {
            optionId: opt.optionId,
            productId: opt.productId,
            name: opt.originalName || opt.name,
            priceModifier: opt.priceModifier || 0,
            variant: opt.variant || null,
            selectedIngredients: opt.selectedIngredients || []
          };
        });
      } else {
        // Pre-select defaults y variante fija si está configurada
        product.bundleSlots?.forEach(slot => {
          const defaultOpt = slot.options?.find(o => o.isDefault) || slot.options?.[0];
          if (defaultOpt) {
            const activeVariants = defaultOpt.variants?.filter(v => v.is_active) || [];
            const lockedVariant = defaultOpt.variantId ? activeVariants.find(v => v.id === defaultOpt.variantId) : null;
            const chosenVariant = lockedVariant || activeVariants.reduce((min, v) => {
              if (!min) return v;
              return (v.price_modifier || 0) < (min.price_modifier || 0) ? v : min;
            }, null);

            initial[slot.id] = {
              optionId: defaultOpt.id,
              productId: defaultOpt.productId,
              name: defaultOpt.name,
              priceModifier: defaultOpt.priceModifier || 0,
              variant: chosenVariant,
              selectedIngredients: []
            };
          }
        });
      }
      return initial;
    }
    return {};
  });

  const basePrice = product.originalPrice || product.price;

  const actualBasePrice = selectedVariant
    ? basePrice + (selectedVariant.price_modifier || 0)
    : basePrice;
  const baseGross = Math.round(actualBasePrice);
  const extrasTotal = selectedExtras.reduce((s, i) => s + (i.price || 0), 0);
  const totalGross = baseGross + extrasTotal;

  // Bundle actions
  const handleSelectOption = (slotId, opt) => {
    const activeVariants = opt.variants?.filter(v => v.is_active) || [];
    const lockedVariant = opt.variantId ? activeVariants.find(v => v.id === opt.variantId) : null;
    const chosenVariant = lockedVariant || activeVariants.reduce((min, v) => {
      if (!min) return v;
      return (v.price_modifier || 0) < (min.price_modifier || 0) ? v : min;
    }, null);

    setSelections(prev => ({
      ...prev,
      [slotId]: {
        optionId: opt.id,
        productId: opt.productId,
        name: opt.name,
        priceModifier: opt.priceModifier || 0,
        variant: chosenVariant,
        selectedIngredients: []
      }
    }));
  };

  const handleSelectVariant = (slotId, variant) => {
    setSelections(prev => {
      const current = prev[slotId];
      if (!current) return prev;
      return {
        ...prev,
        [slotId]: {
          ...current,
          variant
        }
      };
    });
  };

  const handleToggleIngredient = (slotId, ing) => {
    setSelections(prev => {
      const current = prev[slotId];
      if (!current) return prev;
      const alreadySelected = current.selectedIngredients?.some(i => i.id === ing.id);
      const nextIngredients = alreadySelected
        ? current.selectedIngredients.filter(i => i.id !== ing.id)
        : [...(current.selectedIngredients || []), ing];
      return {
        ...prev,
        [slotId]: {
          ...current,
          selectedIngredients: nextIngredients
        }
      };
    });
  };

  const calculateBundleTotalGross = () => {
    const baseNet = product.price || 0;
    let totalGross = Math.round(baseNet);

    Object.keys(selections).forEach(slotId => {
      const sel = selections[slotId];
      if (sel) {
        totalGross += Math.round(sel.priceModifier || 0);
        if (sel.variant) {
          totalGross += Math.round(sel.variant.price_modifier || 0);
        }
        if (sel.selectedIngredients) {
          sel.selectedIngredients?.forEach(ing => {
            if (ing.isExtra) {
              totalGross += Math.round(ing.price || 0);
            }
          });
        }
      }
    });

    return totalGross;
  };

  const finalGross = isBundle ? calculateBundleTotalGross() : totalGross;

  useEffect(() => {
    // Prevent body scroll
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, []);

  const toggleExtra = (ing) => {
    setSelectedExtras(prev =>
      prev.find(i => i.id === ing.id)
        ? prev.filter(i => i.id !== ing.id)
        : [...prev, ing]
    );
  };

  const handleConfirm = () => {
    if (isBundle) {
      const missing = product.bundleSlots?.some(slot => slot.minSelections > 0 && !selections[slot.id]);
      if (missing) {
        alert("Por favor completa todas las selecciones obligatorias del combo.");
        return;
      }

      const selectedOptionsList = product.bundleSlots?.map(slot => {
        const sel = selections[slot.id];
        if (!sel) return null;

        let fullName = sel.name;
        if (sel.variant) {
          fullName += ` (${sel.variant.name})`;
        }

        const optPriceNet = (sel.priceModifier || 0) + (sel.variant?.price_modifier || 0);

        return {
          slotId: slot.id,
          slotName: slot.name,
          optionId: sel.optionId,
          productId: sel.productId,
          name: fullName,
          originalName: sel.name,
          price: optPriceNet,
          quantity: 1,
          variant: sel.variant,
          selectedIngredients: sel.selectedIngredients
        };
      }).filter(Boolean) || [];

      const comboTotalNet = calculateBundleTotalGross();

      onAdd({
        ...product,
        price: comboTotalNet,
        selectedOptions: selectedOptionsList,
        quantity,
      });
      return;
    }

    onAdd({
      ...product,
      price: actualBasePrice,
      originalPrice: basePrice,
      variant: selectedVariant,
      selectedIngredients: selectedExtras,
      quantity,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-center sm:p-4 bg-gray-50/20 sm:bg-black/40 sm:backdrop-blur-sm">
      <div className="w-full max-w-3xl h-[100dvh] sm:h-[90dvh] sm:rounded-3xl bg-gray-50 flex flex-col overflow-hidden relative shadow-2xl">
        
        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto pb-28">
          {/* Header / Image Area */}
          <div className="relative bg-transparent shrink-0">
            {product.image ? (
              <div className="w-full h-[380px] sm:h-[450px] relative bg-gray-100">
                <img src={product.image} alt={product.name} className="w-full h-full object-cover object-center" />
                <button 
                  onClick={onBack} 
                  className="absolute top-4 left-4 p-2.5 bg-white/90 backdrop-blur-md rounded-full hover:bg-white transition-colors shadow-sm z-10"
                >
                  <ArrowLeft className="h-6 w-6 text-gray-900" />
                </button>
              </div>
            ) : (
              <div className="pt-4 px-4 pb-2">
                <button 
                  onClick={onBack} 
                  className="p-2 -ml-2 rounded-full hover:bg-gray-100 mb-2 inline-flex"
                >
                  <ArrowLeft className="h-6 w-6 text-gray-900" />
                </button>
              </div>
            )}

            <div className="px-5 pt-4 pb-1">
              <h1 className="font-bold text-3xl text-gray-900 leading-tight mb-2">{product.name}</h1>
              {product.description && (
                <p className="text-[15px] text-gray-500 leading-relaxed">{product.description}</p>
              )}
            </div>
          </div>

          <div className="px-5 pt-2 pb-6 space-y-8">
            {/* Standard Products Base Ingredients */}
            {!isBundle && baseIngredients.length > 0 && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mt-4 mb-3 px-1">Incluye</p>
                <div className="flex flex-wrap gap-1.5">
                  {baseIngredients.map(i => (
                    <span
                      key={i.id || i.name}
                      className="inline-flex items-center px-3 py-1.5 rounded-full bg-white border border-gray-200 text-gray-600 text-[12px] font-semibold"
                    >
                      {i.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Standard Products Variants */}
            {!isBundle && hasVariants && (
              <div>
                <div className="flex items-center justify-between mb-4 px-1">
                  <p className="text-sm font-bold text-gray-900">Selecciona tu variante</p>
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-100 text-amber-800 rounded uppercase tracking-wider">Obligatorio</span>
                </div>
                <div className="space-y-2.5">
                  {product.variants.map(v => {
                    const gross = Math.round(basePrice + (v.price_modifier || 0));
                    const isSelected = selectedVariant?.id === v.id;
                    return (
                      <button
                        key={v.id}
                        onClick={() => setSelectedVariant(v)}
                        className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all text-left ${
                          isSelected ? 'border-black bg-gray-50/50' : 'border-gray-200 bg-white text-gray-800 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                            isSelected ? 'border-black bg-black' : 'border-gray-300 bg-white'
                          }`}>
                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                          <span className="font-bold text-sm text-gray-900">{v.name}</span>
                        </div>
                        <span className="font-bold text-sm text-gray-900">${gross.toLocaleString('es-CL')}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Standard Products Extras */}
            {!isBundle && hasExtras && (
              <div>
                <div className="mb-4 px-1">
                  <p className="text-sm font-bold text-gray-900">¿Deseas agregar extras?</p>
                  <p className="text-xs text-gray-500 mt-0.5">Opcional</p>
                </div>
                <div className="space-y-2.5">
                  {extraIngredients.map(ing => {
                    const selected = !!selectedExtras.find(i => i.id === ing.id);
                    return (
                      <button
                        key={ing.id}
                        onClick={() => toggleExtra(ing)}
                        className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all text-left ${
                          selected ? 'border-black bg-gray-50/50' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                            selected ? 'border-black bg-black' : 'border-gray-300 bg-white'
                          }`}>
                            {selected && (
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3.5} stroke="currentColor" className="w-3 h-3 text-white">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                            )}
                          </div>
                          <span className="font-bold text-sm text-gray-900">{ing.name}</span>
                        </div>
                        <span className="font-bold text-sm text-gray-900">
                          {ing.price ? `+$${Math.round(ing.price).toLocaleString('es-CL')}` : 'Gratis'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Combo/Bundle Slots Selection */}
            {isBundle && product.bundleSlots?.map(slot => {
              const currentSelection = selections[slot.id];
              const selectedOptionObj = slot.options?.find(o => o.id === currentSelection?.optionId);

              return (
                <div key={slot.id} className="border-t border-gray-100 pt-6 first:border-t-0 first:pt-0">
                  <div className="flex items-center justify-between mb-4 px-1">
                    <p className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                      {slot.name} 
                      {slot.minSelections > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-100 text-amber-800 rounded uppercase tracking-wider">Obligatorio</span>
                      )}
                    </p>
                    {slot.minSelections === 0 && (
                      <span className="text-xs text-gray-400 font-medium">(Opcional)</span>
                    )}
                  </div>

                  <div className="space-y-2.5 mb-4">
                    {slot.options?.map(opt => {
                      const isSelected = currentSelection?.optionId === opt.id;
                      const extraPrice = Math.round(opt.priceModifier);
                      const isSingleOption = slot.options.length === 1;

                      return (
                        <div
                          key={opt.id}
                          onClick={() => {
                            if (!isSingleOption) {
                              handleSelectOption(slot.id, opt);
                            }
                          }}
                          className={`flex items-center justify-between p-4 border rounded-2xl transition-all cursor-pointer select-none ${
                            isSelected 
                              ? 'border-black bg-gray-50/50' 
                              : 'border-gray-200 hover:border-gray-300 bg-white'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {/* Checkbox Icon */}
                            <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-all ${
                              isSelected 
                                ? 'border-black bg-black text-white' 
                                : 'border-gray-300 bg-white text-transparent'
                            }`}>
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3.5} stroke="currentColor" className="w-3.5 h-3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                            </div>
                            <span className="font-bold text-sm text-gray-900 leading-snug">{opt.name}</span>
                            {isSingleOption && (
                              <span className="text-[9px] text-gray-400 bg-gray-150 px-1.5 py-0.5 rounded font-extrabold uppercase tracking-wider">Incluido</span>
                            )}
                          </div>
                          {opt.priceModifier > 0 && (
                            <span className="text-xs font-bold text-gray-900 shrink-0 bg-gray-100 px-2.5 py-0.5 rounded-full">
                              +${extraPrice.toLocaleString('es-CL')}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Nested option personalization */}
                  {selectedOptionObj && (
                    <div className="bg-gray-100/70 p-4 rounded-2xl border border-gray-200 space-y-4">
                      {/* Nested Variants */}
                      {selectedOptionObj.variants && selectedOptionObj.variants.length > 0 && !selectedOptionObj.variantId && (
                        <div>
                          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Tamaño / Opción</p>
                          <div className="flex flex-wrap gap-2">
                            {selectedOptionObj.variants.map(v => {
                              const isVarSelected = currentSelection?.variant?.id === v.id;
                              const varPrice = Math.round(v.price_modifier);
                              return (
                                <button
                                  key={v.id}
                                  type="button"
                                  onClick={() => handleSelectVariant(slot.id, v)}
                                  className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                                    isVarSelected 
                                      ? 'border-black bg-black text-white font-bold' 
                                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                                  }`}
                                >
                                  {v.name} {v.price_modifier > 0 && `(+$${varPrice.toLocaleString('es-CL')})`}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Nested Ingredients Extras */}
                      {selectedOptionObj.ingredients && selectedOptionObj.ingredients.some(i => i.isExtra) && (
                        <div>
                          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Ingredientes Extra</p>
                          <div className="grid grid-cols-2 gap-2">
                            {selectedOptionObj.ingredients.filter(i => i.isExtra).map(ing => {
                              const isIngSelected = currentSelection?.selectedIngredients?.some(i => i.id === ing.id);
                              const ingPrice = Math.round(ing.price);
                              return (
                                <button
                                  key={ing.id}
                                  type="button"
                                  onClick={() => handleToggleIngredient(slot.id, ing)}
                                  className={`flex items-center justify-between px-3 py-2 border rounded-xl text-xs transition-all text-left ${
                                    isIngSelected 
                                      ? 'border-orange-600 bg-orange-50/50 text-orange-700 font-bold' 
                                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                                  }`}
                                >
                                  <span className="truncate">{ing.name}</span>
                                  <span className="font-semibold shrink-0 text-orange-600 ml-1">+${ingPrice.toLocaleString('es-CL')}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Sticky Bottom Actions */}
        <div className="absolute bottom-0 w-full bg-white border-t border-gray-100 px-5 py-4 pb-8 sm:pb-4 z-50">
          <div className="flex items-center gap-4">
            <div className="flex items-center bg-gray-100 rounded-full h-14 p-1 shrink-0">
              <button
                onClick={() => setQuantity(q => Math.max(1, q - 1))}
                className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-gray-600 hover:bg-gray-200 transition-colors text-xl"
              >−</button>
              <span className="font-black text-lg w-8 text-center">{quantity}</span>
              <button
                onClick={() => setQuantity(q => q + 1)}
                className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-gray-600 hover:bg-gray-200 transition-colors text-xl"
              >+</button>
            </div>
            
            <button
              onClick={handleConfirm}
              disabled={!isBundle && hasVariants && !selectedVariant}
              className="flex-1 h-14 bg-blue-600 text-white font-bold rounded-full flex items-center justify-between px-6 hover:bg-blue-700 transition-colors active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 shadow-md shadow-blue-600/20"
            >
              <span>Agregar</span>
              <span className="text-lg">${(finalGross * quantity).toLocaleString('es-CL')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetailView;
