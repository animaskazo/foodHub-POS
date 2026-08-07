import React from 'react';
import { Trash2, Plus, Minus, ChevronDown, Monitor, X, Edit2 } from 'lucide-react';
import { Separator } from "@/components/ui/separator";
import { Button } from "../ui/button";

const CartPanel = ({ cartItems = [], activeTable, onClearTable, onRemove, onUpdateQty, onCharge, onNewOrder, isMobile, onCloseMobile, onItemClick, taxRate = 0.19 }) => {
  const items = cartItems;

  const totalQty = items.reduce((acc, i) => acc + i.quantity, 0);
  const total = items.reduce((acc, i) => {
    let unitPrice = Math.round(i.price);
    if (i.selectedIngredients) {
      unitPrice += i.selectedIngredients.reduce((s, ing) => s + (ing.price || 0), 0);
    }
    if (i.selectedOptions) {
      unitPrice += i.selectedOptions.reduce((s, o) => {
        let optTotal = o.price || 0;
        if (o.selectedIngredients) {
          optTotal += o.selectedIngredients.reduce((s2, i2) => s2 + (i2.price || 0), 0);
        }
        return s + optTotal;
      }, 0);
    }
    return acc + (unitPrice * i.quantity);
  }, 0);
  const subtotal = Math.round(total / (1 + taxRate));
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
                {activeTable ? (
                  <>
                    <span className="font-bold text-[17px] leading-tight text-blue-700">Mesa: {activeTable.name}</span>
                    <button 
                      onClick={onClearTable}
                      className="ml-1 p-0.5 text-gray-400 hover:text-red-500 rounded-full bg-gray-100 hover:bg-red-50 transition"
                      title="Quitar mesa"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="font-bold text-[17px] leading-tight">Venta Directa</span>
                    <ChevronDown className="h-4 w-4 text-gray-400 mt-0.5" />
                  </>
                )}
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
                    <div className={`inline-flex items-center bg-gray-100/80 rounded-full mt-2.5 ${item.isSaved ? 'opacity-50 pointer-events-none' : ''}`}>
                      <button
                        onClick={() => !item.isSaved && onUpdateQty && onUpdateQty(item.cartItemId, item.quantity - 1)}
                        className="w-9 h-9 flex items-center justify-center text-gray-600 hover:text-black hover:bg-gray-200 rounded-full transition-colors active:scale-95"
                        disabled={item.isSaved}
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="font-bold text-[15px] w-7 text-center text-gray-900">{item.quantity}</span>
                      <button
                        onClick={() => !item.isSaved && onUpdateQty && onUpdateQty(item.cartItemId, item.quantity + 1)}
                        className="w-9 h-9 flex items-center justify-center text-gray-600 hover:text-black hover:bg-gray-200 rounded-full transition-colors active:scale-95"
                        disabled={item.isSaved}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Price + Actions */}
                  <div className="flex flex-col items-end justify-between min-h-[4rem] pl-2">
                    <span className="font-bold text-[16px]">${fmt((() => {
                    let unitPrice = Math.round(item.price);
                    if (item.selectedIngredients) {
                      unitPrice += item.selectedIngredients.reduce((s, ing) => s + (ing.price || 0), 0);
                    }
                    if (item.selectedOptions) {
                      unitPrice += item.selectedOptions.reduce((s, o) => {
                        let optTotal = o.price || 0;
                        if (o.selectedIngredients) {
                          optTotal += o.selectedIngredients.reduce((s2, i2) => s2 + (i2.price || 0), 0);
                        }
                        return s + optTotal;
                      }, 0);
                    }
                    return unitPrice * item.quantity;
                  })())}</span>
                    
                    <div className="flex items-center gap-1">
                      {hasOptions && !item.isSaved && (
                        <button
                          onClick={() => onItemClick && onItemClick(item)}
                          className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors active:scale-95"
                        >
                          <Edit2 className="h-[18px] w-[18px]" />
                        </button>
                      )}
                      {!item.isSaved ? (
                        <button
                          onClick={() => onRemove && onRemove(item.cartItemId)}
                          className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors active:scale-95"
                        >
                          <Trash2 className="h-[18px] w-[18px]" />
                        </button>
                      ) : (
                        <div className="w-9 h-9 flex items-center justify-center text-gray-300" title="Enviado a cocina">
                          <ChefHat className="h-[18px] w-[18px]" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Area (Sticky at bottom) */}
      <div className="shrink-0 flex flex-col bg-white border-t border-gray-100 pb-safe shadow-[0_-20px_40px_rgba(0,0,0,0.04)] md:shadow-none z-20">
        
        {/* Totals */}
        {items.length > 0 && (
          <div className="px-5 py-4 space-y-2 bg-gray-50/80 border-b border-gray-100">
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
              <span className="font-bold text-base text-gray-900">Total</span>
              <span className="font-black text-xl text-gray-900">${fmt(total)}</span>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="p-4 flex gap-2">
          {items.some(i => !i.isSaved) && activeTable && (
            <Button
              onClick={onSaveOrder}
              disabled={items.length === 0}
              variant="outline"
              className="flex-1 flex items-center justify-center h-14 bg-white border-gray-200 hover:bg-gray-50 text-gray-900 rounded-full shadow-sm transition-transform active:scale-[0.98]"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <ChefHat className="h-5 w-5 mr-2" />
              <span className="font-bold tracking-wide">A Cocina</span>
            </Button>
          )}
          <Button
            onClick={onCharge}
            disabled={items.length === 0}
            className="flex-1 flex items-center justify-center h-14 bg-black hover:bg-black text-white rounded-full shadow-2xl transition-transform active:scale-[0.98]"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <span className="font-bold tracking-wide">Cobrar ${fmt(total)}</span>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CartPanel;
