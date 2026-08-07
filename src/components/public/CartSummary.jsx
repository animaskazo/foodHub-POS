import React, { useState } from 'react';
import { Trash2, Plus, Minus, ChevronRight, X, ShoppingBag } from 'lucide-react';
import IngredientIcon from '../ui/IngredientIcon';

const fmt = (n) => n.toLocaleString('es-CL');

const CartSummary = ({ cartItems, onUpdateQty, onRemove, onEditItem, onCheckout, isOpen }) => {
  const [previewImage, setPreviewImage] = useState(null);
  const total = cartItems.reduce((acc, item) => {
    let unitPrice = Math.round(item.price);
    if (item.selectedIngredients) {
      unitPrice += item.selectedIngredients.reduce((s, i) => s + (i.price || 0), 0);
    }
    return acc + unitPrice * item.quantity;
  }, 0);

  if (cartItems.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 mt-12 text-center">
        <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-6">
          <ShoppingBag className="h-10 w-10 text-gray-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Tu pedido está vacío</h2>
        <p className="text-sm text-gray-500 max-w-xs mx-auto">
          Aún no has agregado productos. Vuelve al menú para elegir qué pedir.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-0">
      {/* Items list */}
      <div>
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="space-y-3">
          {cartItems.map((item) => {
            let unitPrice = Math.round(item.price);
            if (item.selectedIngredients) {
              unitPrice += item.selectedIngredients.reduce((s, i) => s + (i.price || 0), 0);
            }
            const lineTotal = unitPrice * item.quantity;

            return (
              <div key={item.cartItemId} className="bg-white rounded-2xl border border-gray-100 p-4 flex gap-4">
                {/* Image */}
                <div
                  className="w-16 h-16 rounded-xl shrink-0 bg-gray-100 bg-cover bg-center cursor-pointer"
                  style={{ backgroundImage: item.image ? `url(${item.image})` : undefined }}
                  onClick={(e) => {
                    if (item.image) {
                      e.stopPropagation();
                      setPreviewImage(item.image);
                    }
                  }}
                />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm leading-snug">{item.name}</p>

                  {item.variant && (
                    <p className="text-xs text-gray-500 mt-0.5">{item.variant.name}</p>
                  )}

                  {item.description && (
                    <p className="text-[10px] text-gray-400 leading-relaxed mt-1 line-clamp-2">{item.description}</p>
                  )}

                  {item.selectedIngredients?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {item.selectedIngredients.map(ing => (
                        <span key={ing.id} className="inline-flex items-center gap-1 text-[10px] bg-orange-100 text-orange-700 font-bold px-2 py-0.5 rounded-full">
                          <IngredientIcon name={ing.name} icon={ing.icon} size={11} className="text-orange-600 shrink-0" />
                          {ing.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {item.type === 'bundle' && item.selectedOptions && item.selectedOptions.length > 0 && (
                    <div className="mt-1.5 space-y-1 bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                      {item.selectedOptions.map((opt, idx) => (
                        <div key={idx} className="text-[11px] text-gray-600 font-medium">
                          <span className="text-blue-500 font-bold">•</span> {opt.name}
                          {opt.selectedIngredients && opt.selectedIngredients.length > 0 && (
                            <span className="text-[10px] text-orange-600 font-semibold ml-1">
                              (+ {opt.selectedIngredients.map(i => i.name).join(', ')})
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {(item.type === 'bundle' || item.variants?.length > 0 || item.ingredients?.some(i => i.isExtra)) && (
                    <button
                      onClick={() => onEditItem(item)}
                      className="text-xs font-bold text-blue-600 hover:text-blue-700 mt-2.5 inline-flex items-center"
                    >
                      Editar opciones
                    </button>
                  )}

                  {/* Controls */}
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center bg-blue-600 text-white rounded-full h-8 p-0.5 gap-1.5 shadow-sm">
                      <button
                        onClick={() => {
                          if (item.quantity === 1) {
                            onRemove(item.cartItemId);
                          } else {
                            onUpdateQty(item.cartItemId, item.quantity - 1);
                          }
                        }}
                        className="w-7 h-7 rounded-full flex items-center justify-center font-bold hover:bg-blue-700 active:scale-90 transition-transform text-white text-sm"
                      >
                        {item.quantity === 1 ? (
                          <Trash2 className="h-3.5 w-3.5 text-white" />
                        ) : (
                          '−'
                        )}
                      </button>
                      <span className="font-extrabold text-sm min-w-[12px] text-center">{item.quantity}</span>
                      <button
                        onClick={() => onUpdateQty(item.cartItemId, item.quantity + 1)}
                        className="w-7 h-7 rounded-full flex items-center justify-center font-bold hover:bg-blue-700 active:scale-90 transition-transform text-white text-sm"
                      >
                        +
                      </button>
                    </div>
                    <span className="font-bold text-gray-900 text-sm">${fmt(lineTotal)}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Total summary */}
          <div className="sticky bottom-24 bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex justify-between items-center">
              <span className="font-bold text-gray-900 text-base">Total a pagar</span>
              <span className="font-black text-gray-900 text-xl">${fmt(total)}</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">IVA incluido · Pago en local al retirar</p>
          </div>

          <div className="h-24" />
          </div>
        </div>
      </div>

      {/* Checkout CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-20 p-4 bg-gradient-to-t from-gray-50 via-gray-50/90 to-transparent pt-8">
        <div className="max-w-3xl mx-auto flex flex-col items-center">
          <button
            onClick={onCheckout}
            className="w-full h-16 bg-black text-white font-bold rounded-full flex items-center justify-center gap-2 shadow-2xl hover:bg-gray-900 transition-colors active:scale-[0.98] px-8 text-[17px] tracking-wide"
          >
            Continuar con mis datos
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Image lightbox */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <button
            onClick={() => setPreviewImage(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/25 transition-colors z-10"
            aria-label="Cerrar imagen"
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={previewImage}
            alt="Producto"
            className="max-w-full max-h-full object-contain rounded-xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};

export default CartSummary;
