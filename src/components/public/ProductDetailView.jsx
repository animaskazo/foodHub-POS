import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';

const ProductDetailView = ({ product, onAdd, onBack, initialVariant = null, initialExtras = [], initialQuantity = 1 }) => {
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

  const basePrice = product.originalPrice || product.price;

  const actualBasePrice = selectedVariant
    ? basePrice + (selectedVariant.price_modifier || 0)
    : basePrice;
  const baseGross = Math.round(actualBasePrice * 1.19);
  const extrasTotal = selectedExtras.reduce((s, i) => s + (i.price || 0), 0);
  const totalGross = baseGross + extrasTotal;

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
    <div className="fixed inset-0 z-50 flex justify-center sm:p-4 bg-gray-50 sm:bg-black/40 sm:backdrop-blur-sm">
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
          {/* Base Ingredients */}
          {baseIngredients.length > 0 && (
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-3">Incluye</p>
              <p className="text-sm text-gray-700 font-medium leading-relaxed">
                {baseIngredients.map(i => i.name).join(', ')}
              </p>
            </div>
          )}

          {/* Variants */}
          {hasVariants && (
            <div>
              <div className="flex items-center justify-between mb-4 px-1">
                <p className="text-sm font-bold text-gray-900">Selecciona tu variante</p>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-100 text-amber-800 rounded uppercase tracking-wider">Obligatorio</span>
              </div>
              <div className="space-y-2.5">
                {product.variants.map(v => {
                  const gross = Math.round((basePrice + (v.price_modifier || 0)) * 1.19);
                  const isSelected = selectedVariant?.id === v.id;
                  return (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVariant(v)}
                      className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all text-left ${
                        isSelected ? 'border-black bg-black text-white' : 'border-gray-200 bg-white text-gray-800 hover:border-gray-300'
                      }`}
                    >
                      <span className="font-semibold text-base">{v.name}</span>
                      <span className="font-bold text-base">${gross.toLocaleString('es-CL')}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Extras */}
          {hasExtras && (
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
                        selected ? 'border-black bg-black text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <span className="font-semibold text-base">{ing.name}</span>
                      <span className="font-bold text-base">
                        {ing.price ? `+$${Math.round(ing.price).toLocaleString('es-CL')}` : 'Gratis'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
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
            disabled={hasVariants && !selectedVariant}
            className="flex-1 h-14 bg-blue-600 text-white font-bold rounded-full flex items-center justify-between px-6 hover:bg-blue-700 transition-colors active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 shadow-md shadow-blue-600/20"
          >
            <span>Agregar</span>
            <span className="text-lg">${(totalGross * quantity).toLocaleString('es-CL')}</span>
          </button>
        </div>
      </div>
    </div>
    </div>
  );
};

export default ProductDetailView;
