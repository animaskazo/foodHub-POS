import React, { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import { Button } from '../ui/button';

const BundleSelectionModal = ({ isOpen, onClose, product, onConfirm, editingItem, onDelete }) => {
  const [selections, setSelections] = useState({});

  useEffect(() => {
    if (isOpen && product) {
      if (editingItem) {
        // Cargar selección existente desde el carrito
        const initialSelections = {};
        editingItem.selectedOptions?.forEach(opt => {
          initialSelections[opt.slotId] = {
            optionId: opt.optionId,
            productId: opt.productId,
            name: opt.originalName || opt.name,
            priceModifier: opt.priceModifier || 0,
            variant: opt.variant || null,
            selectedIngredients: opt.selectedIngredients || []
          };
        });
        setSelections(initialSelections);
      } else {
        // Cargar selecciones por defecto
        const initialSelections = {};
        product.bundleSlots?.forEach(slot => {
          const defaultOpt = slot.options?.find(o => o.isDefault) || slot.options?.[0];
          if (defaultOpt) {
            // Pre-seleccionar variante más económica o variante fija del combo
            const activeVariants = defaultOpt.variants?.filter(v => v.is_active) || [];
            const lockedVariant = defaultOpt.variantId ? activeVariants.find(v => v.id === defaultOpt.variantId) : null;
            const chosenVariant = lockedVariant || activeVariants.reduce((min, v) => {
              if (!min) return v;
              return (v.price_modifier || 0) < (min.price_modifier || 0) ? v : min;
            }, null);

            initialSelections[slot.id] = {
              optionId: defaultOpt.id,
              productId: defaultOpt.productId,
              name: defaultOpt.name,
              priceModifier: defaultOpt.priceModifier || 0,
              variant: chosenVariant,
              selectedIngredients: []
            };
          }
        });
        setSelections(initialSelections);
      }
    }
  }, [isOpen, product, editingItem]);

  if (!product) return null;

  const handleSelectOption = (slotId, option) => {
    const activeVariants = option.variants?.filter(v => v.is_active) || [];
    const lockedVariant = option.variantId ? activeVariants.find(v => v.id === option.variantId) : null;
    const chosenVariant = lockedVariant || activeVariants.reduce((min, v) => {
      if (!min) return v;
      return (v.price_modifier || 0) < (min.price_modifier || 0) ? v : min;
    }, null);

    setSelections(prev => ({
      ...prev,
      [slotId]: {
        optionId: option.id,
        productId: option.productId,
        name: option.name,
        priceModifier: option.priceModifier || 0,
        variant: chosenVariant,
        selectedIngredients: []
      }
    }));
  };

  const handleSelectVariant = (slotId, variant) => {
    setSelections(prev => ({
      ...prev,
      [slotId]: {
        ...prev[slotId],
        variant: variant
      }
    }));
  };

  const handleToggleIngredient = (slotId, ingredient) => {
    setSelections(prev => {
      const current = prev[slotId];
      if (!current) return prev;
      const isSelected = current.selectedIngredients?.some(i => i.id === ingredient.id);
      const newIngredients = isSelected
        ? current.selectedIngredients.filter(i => i.id !== ingredient.id)
        : [...(current.selectedIngredients || []), ingredient];

      return {
        ...prev,
        [slotId]: {
          ...current,
          selectedIngredients: newIngredients
        }
      };
    });
  };

  const calculateTotal = () => {
    const baseNet = product.price || 0;
    let totalGross = Math.round(baseNet * 1.19);

    Object.keys(selections).forEach(slotId => {
      const sel = selections[slotId];
      if (sel) {
        // Sumar modificador de la opción en combo (bruto)
        totalGross += Math.round((sel.priceModifier || 0) * 1.19);

        // Sumar modificador de variante si corresponde (bruto)
        if (sel.variant) {
          totalGross += Math.round((sel.variant.price_modifier || 0) * 1.19);
        }

        // Sumar modificador de ingredientes extras (bruto)
        if (sel.selectedIngredients) {
          sel.selectedIngredients.forEach(ing => {
            totalGross += Math.round((ing.price || 0) * 1.19);
          });
        }
      }
    });

    return totalGross;
  };

  const handleConfirmClick = () => {
    // Validar que todos los slots obligatorios tengan selección
    const missing = product.bundleSlots?.some(slot => slot.minSelections > 0 && !selections[slot.id]);
    if (missing) {
      alert("Por favor completa todas las selecciones obligatorias del combo.");
      return;
    }

    // Mapear al formato esperado del carrito
    const selectedOptionsList = product.bundleSlots?.map(slot => {
      const sel = selections[slot.id];
      if (!sel) return null;

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
    }).filter(Boolean) || [];

    const comboTotalNet = Math.round(calculateTotal() / 1.19);

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
    <Modal isOpen={isOpen} onClose={onClose} hideHeader={true} maxWidth="max-w-4xl">
      <div className="grid grid-cols-1 md:grid-cols-2 max-h-[85vh] overflow-hidden">
        
        {/* Left Column - Product Info */}
        <div className="bg-gray-50 p-6 md:p-8 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-gray-100 relative">
          <button 
            onClick={onClose}
            className="md:hidden absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white shadow-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
          
          {product.image ? (
            <img src={product.image} alt={product.name} className="w-48 h-48 md:w-64 md:h-64 object-cover rounded-full shadow-lg mb-6 border-4 border-white" />
          ) : (
            <div className="w-48 h-48 md:w-64 md:h-64 rounded-full bg-white shadow-lg mb-6 flex items-center justify-center border-4 border-gray-100">
              <span className="text-gray-300 font-bold text-4xl">{product.name.charAt(0)}</span>
            </div>
          )}
          
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">{originalName}</h2>
          <p className="text-gray-500 text-center text-sm px-4 mb-4 line-clamp-3">
            {product.description || "Sin descripción"}
          </p>
        </div>

        {/* Right Column - Selection */}
        <div className="flex flex-col h-full overflow-hidden bg-white">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 hidden md:flex">
            <h3 className="font-bold text-lg text-gray-800">Arma tu combo</h3>
            <button 
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x text-gray-500"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {product.bundleSlots?.map(slot => {
              const currentSelection = selections[slot.id];
              const selectedOptionObj = slot.options?.find(o => o.id === currentSelection?.optionId);

              return (
                <div key={slot.id} className="mb-6 pb-6 border-b border-gray-100 last:border-0 last:pb-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-bold text-xs text-gray-400 uppercase tracking-wider">
                      {slot.name} {slot.minSelections > 0 && <span className="text-red-500">*</span>}
                    </span>
                    {slot.minSelections === 0 && (
                      <span className="text-xs text-gray-400 font-medium">(Opcional)</span>
                    )}
                  </div>

                  {/* Listado de opciones hacia abajo con checkbox */}
                  <div className="space-y-3 mb-4">
                    {slot.options?.map(opt => {
                      const isSelected = currentSelection?.optionId === opt.id;
                      const extraPrice = Math.round(opt.priceModifier * 1.19);
                      const isSingleOption = slot.options.length === 1;

                      return (
                        <div
                          key={opt.id}
                          onClick={() => {
                            if (!isSingleOption) {
                              handleSelectOption(slot.id, opt);
                            }
                          }}
                          className={`flex items-center justify-between p-4 border-2 rounded-2xl transition-all cursor-pointer select-none group ${
                            isSelected 
                              ? 'border-blue-600 bg-blue-50/50 shadow-sm' 
                              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50 bg-white'
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            {/* Checkbox Icon */}
                            <div className={`w-6 h-6 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                              isSelected 
                                ? 'border-blue-600 bg-blue-600 text-white' 
                                : 'border-gray-300 bg-white text-transparent group-hover:border-gray-400'
                            }`}>
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={4} stroke="currentColor" className="w-3.5 h-3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                            </div>
                            <span className="font-bold text-[15px] text-gray-900 leading-snug">{opt.name}</span>
                            {isSingleOption && (
                              <span className="text-[10px] text-gray-400 bg-gray-150 px-2 py-0.5 rounded font-extrabold uppercase tracking-wider">Incluido</span>
                            )}
                          </div>
                          {opt.priceModifier > 0 && (
                            <span className="text-[13px] font-bold text-blue-600 shrink-0 bg-blue-50 px-2.5 py-0.5 rounded-full">
                              +${extraPrice.toLocaleString('es-CL')}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Personalización anidada del producto seleccionado (Variantes e Ingredientes) */}
                  {selectedOptionObj && (
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-150 space-y-4">
                      
                      {/* Variantes del producto seleccionado */}
                      {selectedOptionObj.variants && selectedOptionObj.variants.length > 0 && !selectedOptionObj.variantId && (
                        <div>
                          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Tamaño / Opción</p>
                          <div className="flex flex-wrap gap-2">
                            {selectedOptionObj.variants.filter(v => v.is_active).map(v => {
                              const isVarSelected = currentSelection?.variant?.id === v.id;
                              const varPrice = Math.round(v.price_modifier * 1.19);
                              return (
                                <button
                                  key={v.id}
                                  onClick={() => handleSelectVariant(slot.id, v)}
                                  className={`px-3 py-2 rounded-lg text-sm transition-all border-2 ${
                                    isVarSelected 
                                      ? 'border-blue-600 bg-blue-50 text-blue-700 font-bold' 
                                      : 'border-gray-200 bg-white text-gray-600 font-semibold hover:border-gray-300 hover:bg-gray-50'
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
                          <div className="grid grid-cols-2 gap-2">
                            {selectedOptionObj.ingredients.filter(i => i.isExtra).map(ing => {
                              const isIngSelected = currentSelection?.selectedIngredients?.some(i => i.id === ing.id);
                              const ingPrice = Math.round(ing.price);
                              return (
                                <button
                                  key={ing.id}
                                  onClick={() => handleToggleIngredient(slot.id, ing)}
                                  className={`flex items-center justify-between px-3 py-2 border-2 rounded-lg text-sm transition-all text-left ${
                                    isIngSelected 
                                      ? 'border-orange-500 bg-orange-50/50 text-orange-700 font-bold' 
                                      : 'border-gray-200 bg-white text-gray-600 font-semibold hover:border-gray-300 hover:bg-gray-50'
                                  }`}
                                >
                                  <span className="truncate">{ing.name}</span>
                                  <span className="font-semibold shrink-0 text-gray-400 ml-1">+${ingPrice}</span>
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

          <div className="p-6 border-t border-gray-100 bg-white shrink-0">
            {editingItem && (
              <Button
                variant="destructive"
                size="lg"
                onClick={() => {
                  if (onDelete) onDelete(editingItem.cartItemId);
                  onClose();
                }}
                className="w-full mb-3 rounded-xl font-bold"
              >
                Eliminar combo
              </Button>
            )}
            <Button
              size="lg"
              onClick={handleConfirmClick}
              className="w-full flex items-center justify-between h-14 rounded-xl text-base px-6 shadow-md transition-transform active:scale-[0.98]"
            >
              <span className="font-bold">{editingItem ? 'Actualizar combo' : 'Agregar combo al carrito'}</span>
              <span className="font-black bg-white/20 px-3 py-1 rounded-lg">${(calculateTotal() * quantity).toLocaleString('es-CL')}</span>
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default BundleSelectionModal;
