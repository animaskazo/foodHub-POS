import React from 'react';
import { Trash2, Plus, Minus, ChevronRight } from 'lucide-react';

const fmt = (n) => n.toLocaleString('es-CL');

const CartSummary = ({ cartItems, onUpdateQty, onRemove, onEditItem, onCheckout, isOpen }) => {
  const total = cartItems.reduce((acc, item) => {
    const itemGross = Math.round(item.price);
    const extrasGross = (item.selectedIngredients || []).reduce((s, i) => s + (i.price || 0), 0);
    return acc + (itemGross + extrasGross) * item.quantity;
  }, 0);

  return (
    <div className="flex flex-col min-h-0">
      {/* Items list */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-4 space-y-3">
          {cartItems.map((item) => {
            const itemGross = Math.round(item.price);
            const extrasGross = (item.selectedIngredients || []).reduce((s, i) => s + (i.price || 0), 0);
            const lineTotal = (itemGross + extrasGross) * item.quantity;

            return (
              <div key={item.cartItemId} className="bg-white rounded-2xl border border-gray-100 p-4 flex gap-4">
                {/* Image */}
                <div
                  className="w-16 h-16 rounded-xl shrink-0 bg-gray-100 bg-cover bg-center"
                  style={{ backgroundImage: item.image ? `url(${item.image})` : undefined }}
                />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm leading-snug">{item.name}</p>

                  {item.variant && (
                    <p className="text-xs text-gray-500 mt-0.5">{item.variant.name}</p>
                  )}

                  {item.selectedIngredients?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {item.selectedIngredients.map(ing => (
                        <span key={ing.id} className="text-[10px] bg-orange-100 text-orange-700 font-bold px-2 py-0.5 rounded-full">
                          + {ing.name}
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
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex justify-between items-center">
              <span className="font-bold text-gray-900 text-base">Total a pagar</span>
              <span className="font-black text-gray-900 text-xl">${fmt(total)}</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">IVA incluido · Pago en local al retirar</p>
          </div>

          <div className="h-24" />
        </div>
      </div>

      {/* Checkout CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-20 p-4 bg-gradient-to-t from-gray-50 via-gray-50/90 to-transparent pt-8">
        <div className="max-w-3xl mx-auto flex flex-col items-center">
          {!isOpen && (
            <span className="text-[11px] text-red-600 font-bold mb-2 px-3 py-1 bg-red-100 rounded-full border border-red-200 shadow-sm animate-pulse">
              El local se encuentra cerrado
            </span>
          )}
          <button
            onClick={onCheckout}
            disabled={!isOpen}
            className={`w-full h-16 text-white font-bold rounded-full flex items-center justify-center gap-2 shadow-2xl transition-colors active:scale-[0.98] px-8 text-[17px] tracking-wide ${isOpen ? 'bg-black hover:bg-gray-900' : 'bg-gray-400 cursor-not-allowed opacity-90'}`}
          >
            {isOpen ? 'Continuar con mis datos' : 'Local Cerrado'}
            {isOpen && <ChevronRight className="h-5 w-5" />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CartSummary;
