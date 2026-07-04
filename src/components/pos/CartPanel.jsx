import React from 'react';
import { Trash2, Plus, Minus, ChevronDown, Monitor, X } from 'lucide-react';
import { Separator } from "@/components/ui/separator";

const CartPanel = ({ cartItems = [], onRemove, onUpdateQty, onCharge, onNewOrder, isMobile, onCloseMobile }) => {
  const items = cartItems;

  const totalQty = items.reduce((acc, i) => acc + i.quantity, 0);
  const subtotal = items.reduce((acc, i) => acc + (i.price * i.quantity), 0);
  const tax = Math.round(subtotal * 0.19);
  const total = subtotal + tax;

  const fmt = (n) => n.toLocaleString('es-CL');

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-100">

      {/* Header: Order Info */}
      <div className="px-5 pt-5 pb-4 border-b border-gray-100 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isMobile && (
              <button 
                onPointerDown={onCloseMobile}
                className="p-2 -ml-2 text-gray-500 active:bg-gray-100 rounded-full md:hidden select-none"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <X className="h-6 w-6" />
              </button>
            )}
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center hidden sm:flex">
              <Monitor className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <div className="flex items-center gap-1">
                <span className="font-bold text-[17px] leading-tight">Point of Sale 1</span>
                <ChevronDown className="h-4 w-4 text-gray-400 mt-0.5" />
              </div>
              <p className="text-xs text-gray-400 mt-0.5">{totalQty} {totalQty === 1 ? 'artículo' : 'artículos'}</p>
            </div>
          </div>
          <button
            onPointerDown={onNewOrder}
            className="text-sm font-semibold text-blue-600 px-4 py-2 rounded-xl bg-blue-50 active:bg-blue-100 select-none"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            + Nueva orden
          </button>
        </div>
      </div>

      {/* Items List */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-300 pb-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-1.4 5.6a1 1 0 00.9 1.4h11a1 1 0 00.9-1.4L17 13" />
              </svg>
            </div>
            <p className="font-semibold text-lg">Sin artículos</p>
            <p className="text-sm mt-1">Toca un producto para agregarlo</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {items.map((item) => (
              <div key={item.cartItemId} className="flex items-center gap-3 px-5 py-4">
                {/* Thumbnail */}
                <div
                  className="w-14 h-14 rounded-xl shrink-0 bg-gray-100 bg-cover bg-center"
                  style={{ backgroundImage: `url(${item.image})` }}
                />

                {/* Name + Controls */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[14px] leading-snug truncate">{item.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">${fmt(Math.round(item.price * 1.19))} c/u</p>

                  {/* Qty Controls */}
                  <div className="flex items-center gap-3 mt-2">
                    <button
                      onPointerDown={() => onUpdateQty && onUpdateQty(item.cartItemId, item.quantity - 1)}
                      className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center active:bg-gray-200 select-none"
                      style={{ WebkitTapHighlightColor: 'transparent' }}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="font-bold text-sm w-5 text-center">{item.quantity}</span>
                    <button
                      onPointerDown={() => onUpdateQty && onUpdateQty(item.cartItemId, item.quantity + 1)}
                      className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center active:bg-gray-200 select-none"
                      style={{ WebkitTapHighlightColor: 'transparent' }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Price + Delete */}
                <div className="flex flex-col items-end gap-3 shrink-0">
                  <span className="font-bold text-[15px]">${fmt(Math.round(item.price * 1.19) * item.quantity)}</span>
                  <button
                    onPointerDown={() => onRemove && onRemove(item.cartItemId)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-300 bg-gray-50 active:bg-red-50 active:text-red-500 select-none"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
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
        {/* Discount / Note quick actions */}
        <div className="flex gap-2">
          <button
            className="flex-1 py-3 md:py-2.5 rounded-xl bg-gray-100 text-gray-600 text-sm font-semibold active:bg-gray-200 select-none"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            % Descuento
          </button>
          <button
            className="flex-1 py-3 md:py-2.5 rounded-xl bg-gray-100 text-gray-600 text-sm font-semibold active:bg-gray-200 select-none"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            📝 Nota
          </button>
        </div>

        {/* Charge Button */}
        <button
          onPointerDown={onCharge}
          disabled={items.length === 0}
          className="w-full py-4 rounded-2xl bg-blue-600 text-white font-bold text-lg active:bg-blue-700 disabled:opacity-40 disabled:pointer-events-none select-none transition-colors"
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          Cobrar ${fmt(total)}
        </button>
      </div>
    </div>
  );
};

export default CartPanel;
