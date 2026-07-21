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

          {baseIngredients.length > 0 && (
            <div className="w-full text-xs text-gray-600 bg-white p-3 rounded-xl border border-gray-200 text-center">
              <span className="font-bold block mb-1">Incluye:</span>
              {baseIngredients.map(ing => ing.name).join(', ')}
            </div>
          )}
        </div>

        {/* Right Column - Selection */}
        <div className="flex flex-col h-full overflow-hidden bg-white">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 hidden md:flex">
            <h3 className="font-bold text-lg text-gray-800">Personaliza tu pedido</h3>
            <button 
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x text-gray-500"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {hasVariants && hasExtraIngredients && (
              <div className="flex gap-4 mb-6 border-b border-gray-100">
                <button
                  onClick={() => setActiveTab('variants')}
                  className={`pb-3 px-2 font-bold transition-colors border-b-2 text-[15px] ${activeTab === 'variants' ? 'text-blue-600 border-blue-600' : 'text-gray-400 border-transparent hover:text-gray-600'}`}
                >
                  Tamaño / Variante
                </button>
                <button
                  onClick={() => setActiveTab('ingredients')}
                  className={`pb-3 px-2 font-bold transition-colors border-b-2 text-[15px] flex items-center gap-2 ${activeTab === 'ingredients' ? 'text-blue-600 border-blue-600' : 'text-gray-400 border-transparent hover:text-gray-600'}`}
                >
                  Ingredientes Extra
                  {selectedIngredients.length > 0 && (
                    <span className="bg-orange-100 text-orange-600 text-[11px] px-2 py-0.5 rounded-full font-black">
                      {selectedIngredients.length}
                    </span>
                  )}
                </button>
              </div>
            )}

            {hasVariants && (!hasExtraIngredients || activeTab === 'variants') && (
              <div className="mb-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                {!hasExtraIngredients && (
                  <p className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">Elige tu variante</p>
                )}
                <div className="grid grid-cols-1 gap-3">
                  {product.variants.filter(v => v.is_active).map((variant) => {
                    const finalGrossPrice = Math.round((actualBasePrice + (variant.price_modifier || 0)) * 1.19);
                    const isSelected = selectedVariant?.id === variant.id;

                    return (
                      <button
                        key={variant.id}
                        onClick={() => setSelectedVariant(variant)}
                        className={`flex items-center justify-between p-4 border-2 rounded-2xl transition-all text-left group ${
                          isSelected ? 'border-blue-600 bg-blue-50/50 shadow-sm' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50 bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                            isSelected ? 'border-blue-600 bg-blue-600' : 'border-gray-300 bg-white group-hover:border-gray-400'
                          }`}>
                            {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                          </div>
                          <span className="font-bold text-[15px] text-gray-900">{variant.name}</span>
                        </div>
                        <span className="font-bold text-[15px] text-gray-900">
                          ${finalGrossPrice.toLocaleString('es-CL')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {hasExtraIngredients && (!hasVariants || activeTab === 'ingredients') && (
              <div className="mb-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                {!hasVariants && (
                  <p className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">Agrega extras</p>
                )}
                <div className="grid grid-cols-1 gap-3">
                  {extraIngredients.map((ing) => {
                    const isSelected = selectedIngredients.some(i => i.id === ing.id);
                    return (
                      <div
                        key={ing.id}
                        onClick={() => toggleIngredient(ing)}
                        className={`flex items-center justify-between p-4 border-2 rounded-2xl transition-all cursor-pointer select-none group ${
                          isSelected ? 'border-blue-600 bg-blue-50/50 shadow-sm' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50 bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${
                            isSelected ? 'border-blue-600 bg-blue-600' : 'border-gray-300 bg-white group-hover:border-gray-400'
                          }`}>
                            {isSelected && (
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={4} stroke="currentColor" className="w-3.5 h-3.5 text-white">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                            )}
                          </div>
                          <span className="font-bold text-[15px] text-gray-900">{ing.name}</span>
                        </div>
                        <span className="font-bold text-[15px] text-gray-900">
                          +${Math.round(ing.price).toLocaleString('es-CL')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Footer Footer */}
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
                Eliminar producto
              </Button>
            )}
            <Button
              size="lg"
              onClick={handleConfirm}
              disabled={hasVariants && !selectedVariant}
              className="w-full flex items-center justify-between h-14 rounded-xl text-base px-6 shadow-md transition-transform active:scale-[0.98]"
            >
              <span className="font-bold">{editingItem ? 'Actualizar Pedido' : 'Agregar al carrito'}</span>
              <span className="font-black bg-white/20 px-3 py-1 rounded-lg">${(totalGross * quantity).toLocaleString('es-CL')}</span>
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default VariantSelectionModal;
