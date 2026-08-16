import React, { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import { Button } from '../ui/button';
import { buildSelection, selectionFromCartOption, defaultSelectionsForSlot } from '../../utils/bundleSelections';
import { Plus, Minus } from 'lucide-react';

const BundleSelectionModal = ({ isOpen, onClose, product, onConfirm, editingItem, onDelete }) => {
  const [selections, setSelections] = useState({});

  useEffect(() => {
    if (isOpen && product) {
      const initialSelections = {};
      if (editingItem) {
        // Cargar selección existente desde el carrito
        editingItem.selectedOptions?.forEach(opt => {
          if (!initialSelections[opt.slotId]) initialSelections[opt.slotId] = [];
          initialSelections[opt.slotId].push(selectionFromCartOption(opt));
        });
        setSelections(initialSelections);
      } else {
        // Sin preselección por defecto: solo se auto-incluyen los slots con
        // una única opción ("Incluido"); el resto inicia vacío para que el
        // usuario elija la cantidad mínima.
        product.bundleSlots?.forEach(slot => {
          if ((slot.options?.length || 0) === 1) {
            initialSelections[slot.id] = defaultSelectionsForSlot(slot);
          }
        });
        setSelections(initialSelections);
      }
    }
  }, [isOpen, product, editingItem]);

  if (!product) return null;

  const handleSelectOption = (slotId, option) => {
    setSelections(prev => {
      const current = prev[slotId] || [];
      const existingIndex = current.findIndex(s => s.optionId === option.id);
      const slot = product.bundleSlots?.find(s => s.id === slotId);
      const max = slot?.maxSelections > 0 ? slot.maxSelections : 1;
      const count = current.reduce((acc, s) => acc + (s.quantity || 1), 0);

      if (existingIndex >= 0) {
        return { ...prev, [slotId]: current.filter((_, i) => i !== existingIndex) };
      }

      if (count >= max) {
        // Comportamiento radio para max = 1: reemplazar en vez de ignorar
        if (max === 1 && current.length === 1) {
          return { ...prev, [slotId]: [buildSelection(option)] };
        }
        return prev;
      }
      return { ...prev, [slotId]: [...current, buildSelection(option)] };
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

  const handleToggleIngredient = (slotId, optionId, ingredient) => {
    setSelections(prev => {
      const current = prev[slotId] || [];
      return {
        ...prev,
        [slotId]: current.map(s => {
          if (s.optionId !== optionId) return s;
          const isSelected = s.selectedIngredients?.some(i => i.id === ingredient.id);
          return {
            ...s,
            selectedIngredients: isSelected
              ? s.selectedIngredients.filter(i => i.id !== ingredient.id)
              : [...(s.selectedIngredients || []), ingredient]
          };
        })
      };
    });
  };

  const calculateTotal = () => {
    const baseNet = product.price || 0;
    let totalGross = Math.round(baseNet);

    Object.keys(selections).forEach(slotId => {
      (selections[slotId] || []).forEach(sel => {
        totalGross += Math.round(sel.priceModifier || 0);
        if (sel.variant) {
          totalGross += Math.round(sel.variant.price_modifier || 0);
        }
        if (sel.selectedIngredients) {
          sel.selectedIngredients.forEach(ing => {
            if (ing.isExtra) {
              totalGross += Math.round(ing.price || 0);
            }
          });
        }
      });
    });

    return totalGross;
  };

  const slotsComplete = !product.bundleSlots?.some(slot => {
    const count = (selections[slot.id] || []).length;
    return slot.minSelections > 0 && count < slot.minSelections;
  });

  const handleConfirmClick = () => {
    // Validar que todos los slots obligatorios cumplan el mínimo de selecciones
    const missingSlot = product.bundleSlots?.find(slot => {
      const count = (selections[slot.id] || []).length;
      return slot.minSelections > 0 && count < slot.minSelections;
    });
    if (missingSlot) {
      const count = (selections[missingSlot.id] || []).length;
      alert(`"${missingSlot.name}" requiere al menos ${missingSlot.minSelections} selección${missingSlot.minSelections > 1 ? 'es' : ''}. Has elegido ${count}.`);
      return;
    }

    // Mapear al formato esperado del carrito
    const selectedOptionsList = (product.bundleSlots || []).flatMap(slot => {
      const sels = selections[slot.id] || [];
      return sels.map(sel => {
        // Generar nombre completo para el carrito
        let fullName = sel.name;
        if (sel.variant) {
          fullName += ` (${sel.variant.name})`;
        }

        // Calcular precio unitario neto para esta opción (modificador de combo + modificador de variante)
        const optPriceNet = (sel.priceModifier || 0) + (sel.variant?.price_modifier || 0);

        return {
          slotId: slot.id,
          slotName: slot.name,
          optionId: sel.optionId,
          productId: sel.productId,
          name: fullName,
          originalName: sel.name,
          price: optPriceNet, // precio neto
          quantity: 1, // cantidad por combo
          variant: sel.variant,
          selectedIngredients: sel.selectedIngredients
        };
      });
    });

    const comboTotalNet = calculateTotal();

    onConfirm({
      ...product,
      price: comboTotalNet, // Sobreescribimos el precio neto calculado
      selectedOptions: selectedOptionsList,
      editingItem
    });
  };

  const originalName = product.originalName || product.name;
  const quantity = editingItem?.quantity || 1;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Configurar ${originalName}`} maxWidth="max-w-xl">
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        
        {product.bundleSlots?.map(slot => {
          const currentSelection = selections[slot.id] || [];
          const max = slot.maxSelections > 0 ? slot.maxSelections : 1;
          const count = currentSelection.reduce((acc, s) => acc + (s.quantity || 1), 0);
          const atMax = count >= max;

          return (
            <div key={slot.id} className="mb-6 last:mb-0">
              <div className="flex items-center justify-between mb-3">
                <span className="font-bold text-sm text-gray-500 uppercase tracking-wider">
                  {slot.name} {slot.minSelections > 0 && <span className="text-red-500">*</span>}
                </span>
                {max > 1 ? (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    count >= (slot.minSelections || 0) ? 'bg-blue-50 text-blue-600' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {count}/{max}
                  </span>
                ) : slot.minSelections === 0 ? (
                  <span className="text-xs text-gray-400 font-medium">(Opcional)</span>
                ) : null}
              </div>

              {/* Listado de opciones hacia abajo con checkbox */}
              <div className="space-y-2 mb-4">
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
                      className={`flex items-center justify-between p-3.5 border rounded-2xl transition-all cursor-pointer select-none ${
                        isSelected 
                          ? 'border-blue-600 bg-blue-50/20' 
                          : isLocked
                            ? 'border-gray-200 bg-gray-50 opacity-60'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {/* Checkbox Icon */}
                        <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-all ${
                          isSelected 
                            ? 'border-blue-600 bg-blue-600 text-white' 
                            : 'border-gray-300 bg-white text-transparent'
                        }`}>
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3.5} stroke="currentColor" className="w-3.5 h-3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        </div>
                        <span className="font-bold text-[15px] sm:text-sm text-gray-900 leading-snug">{opt.name}</span>
                        {isSingleOption && (
                          <span className="text-[9px] text-gray-400 bg-gray-150 px-1.5 py-0.5 rounded font-extrabold uppercase tracking-wider">Incluido</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {opt.priceModifier > 0 && (
                          <span className="text-xs font-bold text-blue-600 shrink-0 bg-blue-50 px-2 py-0.5 rounded-full ml-2">
                            +${extraPrice.toLocaleString('es-CL')}
                          </span>
                        )}
                        {max > 1 && isSelected && !isSingleOption && (
                          <div className="flex items-center bg-blue-50/50 border border-blue-100 rounded-full h-8 px-1 shrink-0" onClick={e => e.stopPropagation()}>
                            <button 
                              onClick={(e) => handleDecrementOption(e, slot.id, opt)}
                              className="w-6 h-6 flex items-center justify-center rounded-full text-blue-600 hover:bg-blue-100 transition-colors"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-4 text-center font-bold text-sm text-blue-900">{currentQty}</span>
                            <button 
                              onClick={(e) => handleIncrementOption(e, slot.id, opt)}
                              disabled={atMax}
                              className={`w-6 h-6 flex items-center justify-center rounded-full transition-colors ${
                                atMax ? 'text-blue-300' : 'text-blue-600 hover:bg-blue-100'
                              }`}
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
                <p className="text-xs text-gray-400 font-medium mb-4 -mt-2">
                  Máximo alcanzado ({max}). Deselecciona una opción para elegir otra.
                </p>
              )}

              {/* Personalización anidada de CADA producto seleccionado (Variantes e Ingredientes) */}
              {currentSelection.map(sel => {
                const selectedOptionObj = slot.options?.find(o => o.id === sel.optionId);
                if (!selectedOptionObj) return null;
                const hasCustomization = (
                  (selectedOptionObj.variants?.length > 0 && !selectedOptionObj.variantId) ||
                  selectedOptionObj.ingredients?.some(i => i.isExtra)
                );
                if (!hasCustomization) return null;

                return (
                  <div key={sel.optionId} className="bg-gray-50 p-4 rounded-xl border border-gray-150 space-y-4 mt-4">
                    {currentSelection.length > 1 && (
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{sel.name}</p>
                    )}

                    {/* Variantes del producto seleccionado */}
                    {selectedOptionObj.variants && selectedOptionObj.variants.length > 0 && !selectedOptionObj.variantId && (
                      <div>
                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Tamaño / Opción</p>
                        <div className="flex flex-wrap gap-2">
                          {selectedOptionObj.variants.filter(v => v.is_active).map(v => {
                            const isVarSelected = sel.variant?.id === v.id;
                            const varPrice = Math.round(v.price_modifier);
                            return (
                              <button
                                key={v.id}
                                onClick={() => handleSelectVariant(slot.id, sel.optionId, v)}
                                className={`px-3 py-2 rounded-lg text-[13px] sm:text-xs font-semibold border transition-all ${
                                  isVarSelected 
                                    ? 'border-blue-600 bg-blue-50 text-blue-700 font-bold' 
                                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                                }`}
                              >
                                {v.name} {v.price_modifier > 0 && `(+$${varPrice})`}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Ingredientes Extras del producto seleccionado */}
                    {selectedOptionObj.ingredients && selectedOptionObj.ingredients.some(i => i.isExtra) && (
                      <div>
                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Ingredientes Extra</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {selectedOptionObj.ingredients.filter(i => i.isExtra).map(ing => {
                            const isIngSelected = sel.selectedIngredients?.some(i => i.id === ing.id);
                            const ingPrice = Math.round(ing.price);
                            const isUnavailable = !ing.price || Number(ing.price) <= 0 || Number(ing.stock_quantity) <= 0;
                            return (
                              <button
                                key={ing.id}
                                onClick={() => handleToggleIngredient(slot.id, sel.optionId, ing)}
                                disabled={isUnavailable}
                                className={`flex items-center justify-between px-3 py-2.5 sm:py-2 border rounded-lg text-[13px] sm:text-xs transition-all text-left ${
                                  isUnavailable
                                    ? 'border-gray-200 bg-gray-50 text-gray-400 opacity-60 cursor-not-allowed'
                                    : isIngSelected 
                                      ? 'border-orange-500 bg-orange-50/50 text-orange-700 font-bold' 
                                      : 'border-gray-250 bg-white text-gray-600 hover:border-gray-300'
                                }`}
                              >
                                <span className="truncate pr-2">{ing.name}</span>
                                {isUnavailable ? (
                                  <span className="font-bold uppercase tracking-wide text-[9px] text-gray-500 shrink-0">No disponible</span>
                                ) : (
                                  <span className="font-semibold shrink-0 text-gray-400">+${ingPrice}</span>
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

      <div className="p-4 sm:p-6 border-t border-gray-100 bg-gray-50/50 shrink-0 space-y-3">
        {editingItem && (
          <Button
            variant="destructive"
            size="lg"
            onClick={() => {
              if (onDelete) onDelete(editingItem.cartItemId);
              onClose();
            }}
            className="w-full"
          >
            Eliminar combo
          </Button>
        )}
        <Button
          size="lg"
          onClick={handleConfirmClick}
          disabled={!slotsComplete}
          className="w-full flex items-center justify-between text-base"
        >
          <span>{editingItem ? 'Actualizar combo' : 'Agregar combo al carrito'}</span>
          <span className="font-bold">${(calculateTotal() * quantity).toLocaleString('es-CL')}</span>
        </Button>
        {!slotsComplete && (
          <p className="text-xs text-red-500 font-semibold text-center">
            Completa las selecciones obligatorias del combo para continuar.
          </p>
        )}
      </div>
    </Modal>
  );
};

export default BundleSelectionModal;
