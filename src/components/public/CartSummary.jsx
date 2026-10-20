import { QuantityStepper } from '../ui/QuantityStepper';
import { Button } from '../ui/button';
import React, { useState } from 'react';
import { ChevronRight, X, ShoppingBag } from 'lucide-react';
import IngredientIcon from '../ui/IngredientIcon';
import ProductImageFallback from '../ui/ProductImageFallback';
import { getCartItemUnitPrice, getCartTotal } from '../../utils/cartTotals';

const fmt = (n) => n.toLocaleString('es-CL');

const CartSummary = ({ cartItems, onUpdateQty, onRemove, onEditItem, onCheckout, isOpen, orderingBlocked = false, logoUrl = null }) => {
  const [previewImage, setPreviewImage] = useState(null);
  const total = getCartTotal(cartItems);

  if (cartItems.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 mt-12 text-center">
        <ShoppingBag className="mb-6 h-10 w-10" />
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
            const unitPrice = getCartItemUnitPrice(item);
            const lineTotal = unitPrice * item.quantity;

            return (
              <div key={item.cartItemId} className="bg-white rounded-2xl border border-gray-100 p-4 flex gap-4">
                {/* Image */}
                {item.image ? (
                  <div
                    className="w-16 h-16 rounded-xl shrink-0 bg-gray-100 bg-cover bg-center cursor-pointer"
                    style={{ backgroundImage: `url(${item.image})` }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewImage(item.image);
                    }}
                  />
                ) : (
                  <ProductImageFallback logoUrl={logoUrl} alt={item.name} className="w-16 h-16 rounded-xl shrink-0" />
                )}

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
                          <IngredientIcon name={ing.name} icon={ing.icon} size={11} className="shrink-0" />
                          {ing.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {item.type === 'bundle' && item.selectedOptions && item.selectedOptions.length > 0 && (
                    <div className="mt-1.5 space-y-1 bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                      {item.selectedOptions.map((opt, idx) => (
                        <div key={idx} className="text-[11px] text-gray-600 font-medium">
                          <span className="text-blue-500 font-bold">•</span> {opt.quantity > 1 && <span className="font-bold text-gray-800">{opt.quantity}x </span>}{opt.name}
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
                    <Button
                      onClick={() => onEditItem(item)}
                      className="text-blue-600 hover:text-blue-700 mt-2.5 inline-flex items-center"
                     variant="ghost" size="sm">
                      Editar opciones
                    </Button>
                  )}

                  {/* Controls */}
                  <div className="flex items-center justify-between mt-3">
                    <QuantityStepper
                      value={item.quantity} label={item.name}
                      removeOnDecrease={item.quantity === 1}
                      onDecrease={() => item.quantity === 1
                        ? onRemove(item.cartItemId)
                        : onUpdateQty(item.cartItemId, item.quantity - 1)}
                      onIncrease={() => onUpdateQty(item.cartItemId, item.quantity + 1)}
                    />
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
            <p className="text-xs text-gray-400 mt-1">IVA incluido</p>
          </div>

          <div className="h-24" />
          </div>
        </div>
      </div>

      {/* Checkout CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-20 p-4 bg-gradient-to-t from-gray-50 via-gray-50/90 to-transparent pt-8">
        <div className="max-w-3xl mx-auto flex flex-col items-center">
          <Button size="pos"
            onClick={onCheckout}
            disabled={orderingBlocked}
            className="w-full shadow-lg"
          >
            {orderingBlocked ? 'Tienda cerrada temporalmente' : (
              <>
                Continuar con mis datos
                <ChevronRight className="h-5 w-5" />
              </>
            )}
          </Button>
          {orderingBlocked && (
            <p className="text-xs text-red-600 font-semibold mt-2">No hay horarios disponibles ni pedidos para ahora.</p>
          )}
        </div>
      </div>

      {/* Image lightbox */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-white/95 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <button data-icon-button="true"
            onClick={() => setPreviewImage(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/25 transition-colors z-10"
            aria-label="Cerrar imagen"
          >
            <X className="h-6 w-6" aria-hidden="true" />
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
