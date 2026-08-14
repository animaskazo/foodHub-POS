import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Plus, Minus } from 'lucide-react';
import IngredientIcon from '../ui/IngredientIcon';
import { buildSelection, selectionFromCartOption, defaultSelectionsForSlot } from '../../utils/bundleSelections';

const ProductDetailView = ({ product, onAdd, onBack, initialVariant = null, initialExtras = [], initialQuantity = 1, isOutOfStock = false }) => {
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
          if (!initial[opt.slotId]) initial[opt.slotId] = [];
          initial[opt.slotId].push(selectionFromCartOption(opt));
        });
      } else {
        // Sin preselección por defecto: solo se auto-incluyen los slots con
        // una única opción ("Incluido"); el resto inicia vacío para que el
        // usuario elija la cantidad mínima.
        product.bundleSlots?.forEach(slot => {
          if ((slot.options?.length || 0) === 1) {
            initial[slot.id] = defaultSelectionsForSlot(slot);
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
    setSelections(prev => {
      const current = prev[slotId] || [];
      const existingIndex = current.findIndex(s => s.optionId === opt.id);
      const slot = product.bundleSlots?.find(s => s.id === slotId);
      const max = slot?.maxSelections > 0 ? slot.maxSelections : 1;
      const count = current.reduce((acc, s) => acc + (s.quantity || 1), 0);

      if (existingIndex >= 0) {
        return { ...prev, [slotId]: current.filter((_, i) => i !== existingIndex) };
      }

      if (count >= max) {
        if (max === 1 && current.length === 1) {
          return { ...prev, [slotId]: [buildSelection(opt)] };
        }
        return prev;
      }
      return { ...prev, [slotId]: [...current, buildSelection(opt)] };
    });
  };

  const handleIncrementOption = (e, slotId, opt) => {
    e.stopPropagation();
    setSelections(prev => {
      const current = prev[slotId] || [];
      const existingIndex = current.findIndex(s => s.optionId === opt.id);
      if (existingIndex < 0) return prev;

      const slot = product.bundleSlots?.find(s => s.id === slotId);
      const max = slot?.maxSelections > 0 ? slot.maxSelections : 1;
      const count = current.reduce((acc, s) => acc + (s.quantity || 1), 0);

      if (count >= max) return prev;

      return {
        ...prev,
        [slotId]: current.map((s, i) => i === existingIndex ? { ...s, quantity: (s.quantity || 1) + 1 } : s)
      };
    });
  };

  const handleDecrementOption = (e, slotId, opt) => {
    e.stopPropagation();
    setSelections(prev => {
      const current = prev[slotId] || [];
      const existingIndex = current.findIndex(s => s.optionId === opt.id);
      if (existingIndex < 0) return prev;

      const existing = current[existingIndex];
      const newQty = (existing.quantity || 1) - 1;

      if (newQty <= 0) {
        return { ...prev, [slotId]: current.filter((_, i) => i !== existingIndex) };
      }

      return {
        ...prev,
        [slotId]: current.map((s, i) => i === existingIndex ? { ...s, quantity: newQty } : s)
      };
    });
  };

  const handleSelectVariant = (slotId, optionId, variant) => {
    setSelections(prev => {
      const current = prev[slotId] || [];
      return {
        ...prev,
        [slotId]: current.map(s => s.optionId === optionId ? { ...s, variant } : s)
      };
    });
  };

  const handleToggleIngredient = (slotId, optionId, ing) => {
    setSelections(prev => {
      const current = prev[slotId] || [];
      return {
        ...prev,
        [slotId]: current.map(s => {
          if (s.optionId !== optionId) return s;
          const alreadySelected = s.selectedIngredients?.some(i => i.id === ing.id);
          return {
            ...s,
            selectedIngredients: alreadySelected
              ? s.selectedIngredients.filter(i => i.id !== ing.id)
              : [...(s.selectedIngredients || []), ing]
          };
        })
      };
    });
  };

  const calculateBundleTotalGross = () => {
    const baseNet = product.price || 0;
    let totalGross = Math.round(baseNet);

    Object.keys(selections).forEach(slotId => {
      (selections[slotId] || []).forEach(sel => {
        const qty = sel.quantity || 1;
        let optionTotal = Math.round(sel.priceModifier || 0);
        if (sel.variant) {
          optionTotal += Math.round(sel.variant.price_modifier || 0);
        }
        if (sel.selectedIngredients) {
          sel.selectedIngredients?.forEach(ing => {
            if (ing.isExtra) {
              optionTotal += Math.round(ing.price || 0);
            }
          });
        }
        totalGross += (optionTotal * qty);
      });
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

  const slotsComplete = isBundle
    ? !product.bundleSlots?.some(slot => {
        const count = (selections[slot.id] || []).reduce((acc, s) => acc + (s.quantity || 1), 0);
        return slot.minSelections > 0 && count < slot.minSelections;
      })
    : true;

  const handleConfirm = () => {
    if (isBundle) {
      const missingSlot = product.bundleSlots?.find(slot => {
        const count = (selections[slot.id] || []).reduce((acc, s) => acc + (s.quantity || 1), 0);
        return slot.minSelections > 0 && count < slot.minSelections;
      });
      if (missingSlot) {
        const count = (selections[missingSlot.id] || []).reduce((acc, s) => acc + (s.quantity || 1), 0);
        alert(`"${missingSlot.name}" requiere al menos ${missingSlot.minSelections} selección${missingSlot.minSelections > 1 ? 'es' : ''}. Has elegido ${count}.`);
        return;
      }

      const selectedOptionsList = (product.bundleSlots || []).flatMap(slot => {
        const sels = selections[slot.id] || [];
        return sels.map(sel => {
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
            quantity: sel.quantity || 1,
            variant: sel.variant,
            selectedIngredients: sel.selectedIngredients
          };
        });
      });

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
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-gray-200 text-gray-600 text-[12px] font-semibold"
                    >
                      <IngredientIcon name={i.name} icon={i.icon} size={14} className="text-gray-500 shrink-0" />
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
                    const isUnavailable = !ing.price || Number(ing.price) <= 0 || Number(ing.stock_quantity) <= 0;
                    return (
                      <button
                        key={ing.id}
                        onClick={() => !isUnavailable && toggleExtra(ing)}
                        disabled={isUnavailable}
                        className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all text-left ${
                          isUnavailable
                            ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
                            : selected ? 'border-black bg-gray-50/50' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                            isUnavailable
                              ? 'border-gray-300 bg-gray-100'
                              : selected ? 'border-black bg-black' : 'border-gray-300 bg-white'
                          }`}>
                            {selected && (
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3.5} stroke="currentColor" className="w-3 h-3 text-white">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                            )}
                          </div>
                          <IngredientIcon name={ing.name} icon={ing.icon} className="h-5 w-5 text-gray-900 shrink-0" />
                          <span className="font-bold text-sm text-gray-900">{ing.name}</span>
                        </div>
                        {isUnavailable ? (
                          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">No disponible</span>
                        ) : (
                          <span className="font-bold text-sm text-gray-900">
                            {ing.price ? `+$${Math.round(ing.price).toLocaleString('es-CL')}` : 'Gratis'}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Combo/Bundle Slots Selection */}
            {isBundle && product.bundleSlots?.map(slot => {
              const currentSelection = selections[slot.id] || [];
              const max = slot.maxSelections > 0 ? slot.maxSelections : 1;
              const count = currentSelection.reduce((acc, s) => acc + (s.quantity || 1), 0);
              const atMax = count >= max;

              return (
                <div key={slot.id} className="border-t border-gray-100 pt-6 first:border-t-0 first:pt-0">
                  <div className="flex items-center justify-between mb-4 px-1">
                    <p className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                      {slot.name} 
                      {slot.minSelections > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-100 text-amber-800 rounded uppercase tracking-wider">Obligatorio</span>
                      )}
                    </p>
                    {max > 1 ? (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        count >= (slot.minSelections || 0) ? 'bg-gray-100 text-gray-600' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {count}/{max}
                      </span>
                    ) : slot.minSelections === 0 ? (
                      <span className="text-xs text-gray-400 font-medium">(Opcional)</span>
                    ) : null}
                  </div>

                  <div className="space-y-2.5 mb-4">
                    {slot.options?.map(opt => {
                      const isSelected = currentSelection.some(s => s.optionId === opt.id);
                      const currentQty = isSelected ? (currentSelection.find(s => s.optionId === opt.id)?.quantity || 1) : 0;
                      const extraPrice = Math.round(opt.priceModifier);
                      const isSingleOption = slot.options.length === 1;
                      const isLocked = max > 1 && atMax && !isSelected && !isSingleOption;

                      return (
                        <div
                          key={opt.id}
                          onClick={() => {
                            if (!isSingleOption && !isLocked) {
                              handleSelectOption(slot.id, opt);
                            }
                          }}
                          className={`flex items-center justify-between p-4 min-h-[68px] border rounded-2xl transition-all cursor-pointer select-none ${
                            isSelected 
                              ? 'border-black bg-gray-50/50' 
                              : isLocked
                                ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
                                : 'border-gray-200 hover:border-gray-300 bg-white'
                          }`}
                        >
                          <div className="flex items-center gap-3">
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
                          
                          <div className="flex items-center gap-3">
                            {opt.priceModifier > 0 && (
                              <span className="text-xs font-bold text-gray-900 shrink-0 bg-gray-100 px-2.5 py-0.5 rounded-full">
                                +${extraPrice.toLocaleString('es-CL')}
                              </span>
                            )}
                            {max > 1 && isSelected && !isSingleOption && (
                              <div className="flex items-center bg-gray-100 rounded-full h-8 px-1 shrink-0" onClick={e => e.stopPropagation()}>
                                <button 
                                  onClick={(e) => handleDecrementOption(e, slot.id, opt)}
                                  className="w-6 h-6 flex items-center justify-center rounded-full text-gray-600 hover:bg-gray-200 hover:text-black transition-colors"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <span className="font-bold text-sm w-5 text-center text-gray-900">{currentQty}</span>
                                <button 
                                  onClick={(e) => handleIncrementOption(e, slot.id, opt)}
                                  disabled={count >= max}
                                  className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${count >= max ? 'text-gray-400' : 'text-gray-600 hover:bg-gray-200 hover:text-black'}`}
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                {atMax && max > 1 && (
                    <p className="text-xs text-gray-400 font-medium mb-4 -mt-1">
                      Máximo alcanzado ({max}). Deselecciona una opción para elegir otra.
                    </p>
                  )}

                  {/* Nested personalization por cada opción seleccionada */}
                  {currentSelection.map(sel => {
                    const selectedOptionObj = slot.options?.find(o => o.id === sel.optionId);
                    if (!selectedOptionObj) return null;
                    const hasCustomization = (
                      (selectedOptionObj.variants?.length > 0 && !selectedOptionObj.variantId) ||
                      selectedOptionObj.ingredients?.some(i => i.isExtra)
                    );
                    if (!hasCustomization) return null;
                    const qty = sel.quantity || 1;

                    return (
                      <div key={sel.optionId} className="bg-gray-100/70 p-4 rounded-2xl border border-gray-200 space-y-4">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-gray-400"></div>
                          <p className="font-bold text-sm text-gray-900">Personaliza {selectedOptionObj.name} {qty > 1 && <span className="text-xs text-gray-500 font-medium">(x{qty})</span>}</p>
                        </div>

                        {/* Nested Variants */}
                        {selectedOptionObj.variants && selectedOptionObj.variants.length > 0 && !selectedOptionObj.variantId && (
                          <div>
                            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Tamaño / Opción</p>
                            <div className="flex flex-wrap gap-2">
                              {selectedOptionObj.variants.map(v => {
                                const isVarSelected = sel.variant?.id === v.id;
                                const varPrice = Math.round(v.price_modifier);
                                return (
                                  <button
                                    key={v.id}
                                    type="button"
                                    onClick={() => handleSelectVariant(slot.id, sel.optionId, v)}
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
                                const isIngSelected = sel.selectedIngredients?.some(i => i.id === ing.id);
                                const ingPrice = Math.round(ing.price);
                                const isUnavailable = !ing.price || Number(ing.price) <= 0 || Number(ing.stock_quantity) <= 0;
                                return (
                                  <button
                                    key={ing.id}
                                    type="button"
                                    onClick={() => handleToggleIngredient(slot.id, sel.optionId, ing)}
                                    disabled={isUnavailable}
                                    className={`flex items-center justify-between px-3 py-2 border rounded-xl text-xs transition-all text-left ${
                                      isUnavailable
                                        ? 'border-gray-200 bg-gray-50 text-gray-400 opacity-60 cursor-not-allowed'
                                        : isIngSelected 
                                          ? 'border-orange-600 bg-orange-50/50 text-orange-700 font-bold' 
                                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                                    }`}
                                  >
                                    <span className="flex items-center gap-1.5 truncate min-w-0">
                                      <IngredientIcon name={ing.name} icon={ing.icon} size={14} className="text-gray-500 shrink-0" />
                                      <span className="truncate">{ing.name}</span>
                                    </span>
                                    {isUnavailable ? (
                                      <span className="text-[9px] font-bold uppercase tracking-wide text-gray-500 shrink-0 ml-1">No disponible</span>
                                    ) : (
                                      <span className="font-semibold shrink-0 text-orange-600 ml-1">+${ingPrice.toLocaleString('es-CL')}</span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
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
              disabled={isOutOfStock || !slotsComplete || (!isBundle && hasVariants && !selectedVariant)}
              className={`flex-1 h-14 font-bold rounded-full flex items-center justify-center px-6 transition-colors active:scale-[0.98] disabled:active:scale-100 ${
                isOutOfStock || !slotsComplete || (!isBundle && hasVariants && !selectedVariant)
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed shadow-none'
                  : 'bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-600/20'
              }`}
            >
              <span className="font-bold">{isOutOfStock ? 'Sin stock' : 'Agregar'}</span>
              {!isOutOfStock && (
                <>
                  <span className="mx-1.5 opacity-40">·</span>
                  <span className="text-lg">${(finalGross * quantity).toLocaleString('es-CL')}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetailView;
