import React, { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import { Button } from '../ui/button';

const VariantSelectionModal = ({ isOpen, onClose, product, onSelectVariant, editingItem, onDelete, cartItems = [] }) => {
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [selectedIngredients, setSelectedIngredients] = useState([]);
  const [activeTab, setActiveTab] = useState('variants');

  useEffect(() => {
    if (isOpen && product) {
      if (editingItem) {
        setSelectedVariant(editingItem.variant || null);
        setSelectedIngredients(editingItem.selectedIngredients || []);
      } else {
        const alreadyInCart = cartItems.some(item => item.productId === product.id);
        if (alreadyInCart) {
          setSelectedVariant(null);
        } else {
          const activeVariants = product.variants?.filter(v => v.is_active) || [];
          const cheapest = activeVariants.reduce((min, v) => {
            if (!min) return v;
            return (v.price_modifier || 0) < (min.price_modifier || 0) ? v : min;
          }, null);
          setSelectedVariant(cheapest);
        }
        setSelectedIngredients([]);
      }
      const productHasVariants = product.variants && product.variants.length > 0 && product.variants.some(v => v.is_active);
      setActiveTab(productHasVariants ? 'variants' : 'ingredients');
    }
  }, [isOpen, product, editingItem, cartItems]);

  if (!product) return null;

  const baseIngredients = product.ingredients?.filter(ing => ing.isBase) || [];
  const extraIngredients = product.ingredients?.filter(ing => ing.isExtra) || [];

  const hasVariants = product.variants && product.variants.length > 0 && product.variants.some(v => v.is_active);
  const hasExtraIngredients = extraIngredients.length > 0;

  const handleConfirm = () => {
    onSelectVariant(selectedVariant, selectedIngredients, editingItem);
  };

  const toggleIngredient = (ing) => {
    if (selectedIngredients.some(i => i.id === ing.id)) {
      setSelectedIngredients(prev => prev.filter(i => i.id !== ing.id));
    } else {
      setSelectedIngredients(prev => [...prev, ing]);
    }
  };

  // Calculate dynamic price
  const actualBasePrice = product.basePrice !== undefined ? product.basePrice : product.price;
  const originalName = product.originalName || product.name;

  const basePrice = selectedVariant ? actualBasePrice + (selectedVariant.price_modifier || 0) : actualBasePrice;
  const baseGross = Math.round(basePrice * 1.19);
  const ingredientsGross = Math.round(selectedIngredients.reduce((sum, ing) => sum + (ing.price || 0), 0));
  const totalGross = baseGross + ingredientsGross;
  const quantity = editingItem?.quantity || 1;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Opciones para ${originalName}`} maxWidth="max-w-xl">
      <div className="p-4 sm:p-6 max-h-[75vh] overflow-y-auto">
        
        {baseIngredients.length > 0 && (
          <div className="mb-4 text-sm text-gray-600 bg-gray-50 p-3 rounded-lg border border-gray-100">
            <span className="font-semibold text-gray-800">Incluye:</span> {baseIngredients.map(ing => ing.name).join(', ')}
          </div>
        )}

        {hasVariants && hasExtraIngredients && (
          <div className="flex gap-4 mb-6 border-b border-gray-100">
            <button
              onClick={() => setActiveTab('variants')}
              className={`pb-3 px-2 font-semibold transition-colors border-b-2 text-sm ${activeTab === 'variants' ? 'text-black border-black' : 'text-gray-400 border-transparent hover:text-gray-600'}`}
            >
              Variante
            </button>
            <button
              onClick={() => setActiveTab('ingredients')}
              className={`pb-3 px-2 font-semibold transition-colors border-b-2 text-sm flex items-center gap-2 ${activeTab === 'ingredients' ? 'text-black border-black' : 'text-gray-400 border-transparent hover:text-gray-600'}`}
            >
              Ingredientes Extra
              {selectedIngredients.length > 0 && (
                <span className="bg-orange-100 text-orange-600 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                  {selectedIngredients.length}
                </span>
              )}
            </button>
          </div>
        )}

        {hasVariants && (!hasExtraIngredients || activeTab === 'variants') && (
          <div className="mb-6">
            {!hasExtraIngredients && (
              <p className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wider">Variante</p>
            )}
            <div className="grid grid-cols-1 gap-2">
              {product.variants.filter(v => v.is_active).map((variant) => {
                const finalGrossPrice = Math.round((actualBasePrice + (variant.price_modifier || 0)) * 1.19);
                const isSelected = selectedVariant?.id === variant.id;

                return (
                  <button
                    key={variant.id}
                    onClick={() => setSelectedVariant(variant)}
                    className={`flex items-center justify-between p-4 border-2 rounded-2xl transition-all text-left ${
                      isSelected ? 'border-blue-600 bg-blue-50/30' : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${
                        isSelected ? 'border-blue-600 bg-blue-600' : 'border-gray-300 bg-white'
                      }`}>
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <span className="font-bold text-[15px] sm:text-sm text-gray-900 leading-snug">{variant.name}</span>
                    </div>
                    <span className="font-bold text-[15px] sm:text-sm text-gray-900 shrink-0 ml-2">
                      ${finalGrossPrice.toLocaleString('es-CL')}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {hasExtraIngredients && (!hasVariants || activeTab === 'ingredients') && (
          <div className="mb-6">
            {!hasVariants && (
              <p className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wider">Ingredientes Extra</p>
            )}
            <div className="grid grid-cols-1 gap-2">
              {extraIngredients.map((ing) => {
                const isSelected = selectedIngredients.some(i => i.id === ing.id);
                return (
                  <div
                    key={ing.id}
                    onClick={() => toggleIngredient(ing)}
                    className={`flex items-center justify-between p-4 border-2 rounded-xl transition-all cursor-pointer select-none ${
                      isSelected ? 'border-blue-600 bg-blue-50/30' : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0 ${
                        isSelected ? 'border-blue-600 bg-blue-600' : 'border-gray-300 bg-white'
                      }`}>
                        {isSelected && (
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3.5} stroke="currentColor" className="w-3 h-3 text-white">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        )}
                      </div>
                      <span className="font-bold text-[15px] sm:text-sm text-gray-900 leading-snug">{ing.name}</span>
                    </div>
                    <span className="font-bold text-[15px] sm:text-sm text-gray-900 shrink-0 ml-2">
                      +${Math.round(ing.price).toLocaleString('es-CL')}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-gray-100 mt-2 space-y-3">
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
              Eliminar producto
            </Button>
          )}
          <Button
            size="lg"
            onClick={handleConfirm}
            disabled={hasVariants && !selectedVariant}
            className="w-full flex items-center justify-between"
          >
            <span>{editingItem ? 'Actualizar' : 'Agregar al carrito'}</span>
            <span>${(totalGross * quantity).toLocaleString('es-CL')}</span>
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default VariantSelectionModal;
