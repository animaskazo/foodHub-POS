import React, { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import { Button } from '../ui/button';

const VariantSelectionModal = ({ isOpen, onClose, product, onSelectVariant, editingItem, onDelete }) => {
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [selectedIngredients, setSelectedIngredients] = useState([]);
  const [activeTab, setActiveTab] = useState('variants');

  useEffect(() => {
    if (isOpen && product) {
      if (editingItem) {
        setSelectedVariant(editingItem.variant || null);
        setSelectedIngredients(editingItem.selectedIngredients || []);
      } else {
        setSelectedVariant(null);
        setSelectedIngredients([]);
      }
      const productHasVariants = product.variants && product.variants.length > 0 && product.variants.some(v => v.is_active);
      setActiveTab(productHasVariants ? 'variants' : 'ingredients');
    }
  }, [isOpen, product, editingItem]);

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
    <Modal isOpen={isOpen} onClose={onClose} title={`Opciones para ${originalName}`}>
      <div className="p-6">
        
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
              <button
                onClick={() => setSelectedVariant(null)}
                className={`flex items-center justify-between p-4 border rounded-2xl transition-all text-left ${selectedVariant === null ? 'border-black bg-black text-white shadow-md' : 'border-gray-200 hover:border-gray-300 bg-white'}`}
              >
                <div>
                  <span className={`block font-semibold ${selectedVariant === null ? 'text-white' : 'text-gray-900'}`}>Original (Por defecto)</span>
                </div>
                <span className={`font-bold ${selectedVariant === null ? 'text-white' : 'text-gray-900'}`}>
                  ${Math.round(actualBasePrice * 1.19).toLocaleString('es-CL')}
                </span>
              </button>

              {product.variants.filter(v => v.is_active).map((variant) => {
                const finalGrossPrice = Math.round((actualBasePrice + (variant.price_modifier || 0)) * 1.19);

                return (
                  <button
                    key={variant.id}
                    onClick={() => setSelectedVariant(variant)}
                    className={`flex items-center justify-between p-4 border rounded-2xl transition-all text-left ${selectedVariant?.id === variant.id ? 'border-black bg-black text-white shadow-md' : 'border-gray-200 hover:border-gray-300 bg-white'}`}
                  >
                    <div>
                      <span className={`block font-semibold ${selectedVariant?.id === variant.id ? 'text-white' : 'text-gray-900'}`}>{variant.name}</span>
                    </div>
                    <span className={`font-bold ${selectedVariant?.id === variant.id ? 'text-white' : 'text-gray-900'}`}>
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
                  <label
                    key={ing.id}
                    className={`flex items-center justify-between p-4 border rounded-xl transition-all cursor-pointer ${isSelected ? 'border-orange-500 bg-orange-50 ring-1 ring-orange-500' : 'border-gray-200 hover:border-gray-300'}`}
                  >
                    <div className="flex items-center gap-3">
                      <input 
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleIngredient(ing)}
                        className="h-5 w-5 rounded border-gray-300 text-orange-600 focus:ring-orange-600"
                      />
                      <span className="block font-semibold text-gray-900">{ing.name}</span>
                    </div>
                    <span className="font-bold text-gray-900">
                      +${Math.round(ing.price).toLocaleString('es-CL')}
                    </span>
                  </label>
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
