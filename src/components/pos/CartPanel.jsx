import React from 'react';
import { Trash2, Plus, Minus, ChevronDown, Monitor, X, Edit2 } from 'lucide-react';
import { Separator } from "@/components/ui/separator";
import { Button } from "../ui/button";

const CartPanel = ({ cartItems = [], onRemove, onUpdateQty, onCharge, onNewOrder, isMobile, onCloseMobile, onItemClick }) => {
  const items = cartItems;

  const totalQty = items.reduce((acc, i) => acc + i.quantity, 0);
  const total = items.reduce((acc, i) => acc + (Math.round(i.price) * i.quantity), 0);
  const subtotal = Math.round(total / 1.19);
  const tax = total - subtotal;

  const fmt = (n) => n.toLocaleString('es-CL');

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-100">

      {/* Header: Order Info */}
      <div className="px-5 pt-5 pb-4 border-b border-gray-100 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isMobile && (
              <button 
                onClick={onCloseMobile}
                className="p-2 -ml-2 text-gray-500 active:bg-gray-100 rounded-full md:hidden select-none"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <X className="h-6 w-6" />
              </button>
            )}
            <Monitor className="h-6 w-6 text-gray-900 hidden sm:block" />
            <div>
              <div className="flex items-center gap-1">
                <span className="font-bold text-[17px] leading-tight">Point of Sale 1</span>
                <ChevronDown className="h-4 w-4 text-gray-400 mt-0.5" />
              </div>
              <p className="text-xs text-gray-400 mt-0.5">{totalQty} {totalQty === 1 ? 'artículo' : 'artículos'}</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={onNewOrder}
          >
            + Nueva orden
          </Button>
        </div>
      </div>

      {/* Items List */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-300 pb-12">
            <svg className="h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-1.4 5.6a1 1 0 00.9 1.4h11a1 1 0 00.9-1.4L17 13" />
            </svg>
            <p className="font-semibold text-lg">Sin artículos</p>
            <p className="text-sm mt-1">Toca un producto para agregarlo</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {items.map((item) => {
              const hasVariants = item.variants && item.variants.length > 0 && item.variants.some(v => v.is_active);
              const hasExtras = item.ingredients && item.ingredients.length > 0 && item.ingredients.some(i => i.isExtra);
              const hasOptions = item.type === 'bundle' || hasVariants || hasExtras;
              const baseIngredients = item.ingredients?.filter(i => i.isBase) || [];
              
              return (
                <div key={item.cartItemId} className="flex items-center gap-3 px-5 py-4">
                  {/* Thumbnail */}
                  <div
                    className="w-14 h-14 rounded-xl shrink-0 bg-gray-100 bg-cover bg-center"
                    style={{ backgroundImage: `url(${item.image})` }}
                  />

                  {/* Name + Controls */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[14px] leading-snug truncate">{item.name}</p>
                    {baseIngredients.length > 0 && (
                      <p className="text-[11px] text-gray-400 mt-0.5 font-medium">
                        {baseIngredients.map(i => i.name).join(', ')}
                      </p>
                    )}
                    {item.selectedIngredients && item.selectedIngredients.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {item.selectedIngredients.map(i => (
                          <span key={i.id} className="text-[10px] text-orange-600 font-bold bg-orange-100 px-1.5 py-0.5 rounded">
                            + {i.name}
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
                    <p className="text-xs text-gray-400 mt-1">${fmt(Math.round(item.price))} c/u</p>

                    {/* Qty Controls */}
                    <div className="flex items-center gap-3 mt-2">
                      <Button
                        size="icon-sm"
                        variant="secondary"
                        onClick={() => onUpdateQty && onUpdateQty(item.cartItemId, item.quantity - 1)}
                      >
                        <Minus />
                      </Button>
                      <span className="font-bold text-sm w-5 text-center">{item.quantity}</span>
                      <Button
                        size="icon-sm"
                        variant="secondary"
                        onClick={() => onUpdateQty && onUpdateQty(item.cartItemId, item.quantity + 1)}
                      >
                        <Plus />
                      </Button>
                    </div>
                  </div>

                  {/* Price + Actions */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className="font-bold text-[15px]">${fmt(Math.round(item.price) * item.quantity)}</span>
                    <div className="flex items-center gap-1.5 mt-1">
                      {hasOptions && (
                        <Button
                          size="icon-sm"
                          variant="secondary"
                          onClick={() => onItemClick && onItemClick(item)}
                        >
                          <Edit2 />
                        </Button>
                      )}
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => onRemove && onRemove(item.cartItemId)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Totals */}
        {items.length > 0 && (
          <div className="px-5 py-4 space-y-2 bg-gray-50 border-t border-gray-100">
            <div className="flex justify-between items-center text-sm text-gray-500">
              <span>Subtotal</span>
              <span>${fmt(subtotal)}</span>
            </div>
            <div className="flex justify-between items-center text-sm text-gray-500">
              <span>IVA (19%)</span>
              <span>${fmt(tax)}</span>
            </div>
            <Separator className="my-2" />
            <div className="flex justify-between items-center">
              <span className="font-bold text-base">Total</span>
              <span className="font-bold text-xl">${fmt(total)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Footer CTA */}
      <div className="p-4 bg-white border-t border-gray-100 space-y-2.5 shrink-0 pb-safe">
        {/* Charge Button */}
        <Button
          size="lg"
          onClick={onCharge}
          disabled={items.length === 0}
          className="w-full text-lg"
        >
          Cobrar ${fmt(total)}
        </Button>
      </div>
    </div>
  );
};

export default CartPanel;
