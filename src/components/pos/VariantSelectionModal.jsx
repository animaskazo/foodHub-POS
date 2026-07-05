import React, { useState, useEffect } from 'react';
import Modal from '../ui/Modal';

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

  const hasVariants = product.variants && product.variants.length > 0 && product.variants.some(v => v.is_active);
  const hasIngredients = product.ingredients && product.ingredients.length > 0;

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
  const basePrice = selectedVariant ? product.price + (selectedVariant.price_modifier || 0) : product.price;
  const baseGross = Math.round(basePrice * 1.19);
  const ingredientsGross = Math.round(selectedIngredients.reduce((sum, ing) => sum + (ing.price || 0), 0));
  const totalGross = baseGross + ingredientsGross;
  const quantity = editingItem?.quantity || 1;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Opciones para ${product.name}`}>
      <div className="p-6">
        
        {hasVariants && hasIngredients && (
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

        {hasVariants && (!hasIngredients || activeTab === 'variants') && (
          <div className="mb-6">
            {!hasIngredients && (
              <p className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wider">Variante</p>
            )}
            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={() => setSelectedVariant(null)}
                className={`flex items-center justify-between p-4 border rounded-xl transition-all text-left ${selectedVariant === null ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <div>
                  <span className="block font-semibold text-gray-900">Original (Por defecto)</span>
                </div>
                <span className="font-bold text-gray-900">
                  ${Math.round(product.price * 1.19).toLocaleString('es-CL')}
                </span>
              </button>

              {product.variants.filter(v => v.is_active).map((variant) => {
                const finalGrossPrice = Math.round((product.price + (variant.price_modifier || 0)) * 1.19);
                return (
                  <button
                    key={variant.id}
                    onClick={() => setSelectedVariant(variant)}
                    className={`flex items-center justify-between p-4 border rounded-xl transition-all text-left ${selectedVariant?.id === variant.id ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' : 'border-gray-200 hover:border-gray-300'}`}
                  >
                    <div>
                      <span className="block font-semibold text-gray-900">{variant.name}</span>
                    </div>
                    <span className="font-bold text-gray-900">
                      ${finalGrossPrice.toLocaleString('es-CL')}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {hasIngredients && (!hasVariants || activeTab === 'ingredients') && (
          <div className="mb-6">
            {!hasVariants && (
              <p className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wider">Ingredientes Extra</p>
            )}
            <div className="grid grid-cols-1 gap-2">
              {product.ingredients.map((ing) => {
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

        <div className="pt-4 border-t border-gray-100 mt-2">
          {editingItem && (
            <button
              onClick={() => {
                if (onDelete) onDelete(editingItem.cartItemId);
                onClose();
              }}
              className="w-full mb-3 bg-red-50 text-red-600 font-bold py-3.5 rounded-xl hover:bg-red-100 transition-colors"
            >
              Eliminar producto
            </button>
          )}
          <button
            onClick={handleConfirm}
            className="w-full bg-black text-white font-bold py-4 rounded-xl hover:bg-gray-800 transition-colors flex items-center justify-between px-6"
          >
            <span>{editingItem ? 'Actualizar' : 'Agregar al carrito'}</span>
            <span>${(totalGross * quantity).toLocaleString('es-CL')}</span>
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default VariantSelectionModal;
