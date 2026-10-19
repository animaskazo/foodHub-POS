import {
  ShoppingCart,
  Trash2,
  Plus,
  Monitor,
  X,
  Pencil as Edit2,
  ChefHat,
  Tag,
  Check,
  RotateCcw,
  ArrowLeftRight
} from 'lucide-react';
import { QuantityStepper } from '../ui/QuantityStepper';
import { IconButton } from '../ui/IconButton';
import React from 'react';

import { Separator } from "@/components/ui/separator";
import { getOpenOrders, sumOpenOrdersTotal } from '../../services/orderService';
import { Button } from "../ui/button";
import { getFirstOrganizationId } from '../../services/organizationService';
import { supabase } from '../../lib/supabase';
import { getRestaurantTables, onTablesChanged } from '../../services/tableService';
import { getCartItemUnitPrice, getCartTotal } from '../../utils/cartTotals';
import { calculateDiscount } from '../../services/couponService';

const CartPanel = ({ cartItems = [], dineInEnabled = false, activeTable, onClearTable, onRemove, onUpdateQty, onCharge, onNewOrder, onResetOrder, isMobile, onCloseMobile, onChangeTableMobile, onItemClick, onSaveOrder, onTableSelect, taxRate = 0.19, coupon, onApplyCoupon, onRemoveCoupon, couponError, couponLoading, isSavingOrder = false }) => {
  const items = cartItems;
  const [tables, setTables] = React.useState([]);
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false);
  const [couponCode, setCouponCode] = React.useState('');
  const [couponOpen, setCouponOpen] = React.useState(false);

  const loadTables = React.useCallback(async () => {
    if (!dineInEnabled) return;
    try {
      const orgId = await getFirstOrganizationId();
      if (!orgId) return;
      const { data: branchData } = await supabase.from('branches').select('id').eq('organization_id', orgId).limit(1).single();
      if (branchData) {
        const loaded = await getRestaurantTables(branchData.id);
        setTables(loaded);
      }
    } catch (err) {
      console.error("Error loading tables in CartPanel", err);
    }
  }, [dineInEnabled]);

  React.useEffect(() => {
    loadTables();
    // El POS avisa tras cobrar o enviar a cocina; sin esto el monto de la mesa
    // quedaba desactualizado hasta recargar la página.
    return onTablesChanged(loadTables);
  }, [loadTables]);

  // `getCartTotal`: estándar = base + extras; combo = `price` ya es el total
  // (no se suman `selectedOptions` de nuevo para no duplicar).
  const cartTotal = getCartTotal(items);
  const discountAmount = coupon ? calculateDiscount(coupon, cartTotal) : 0;
  const total = Math.max(0, cartTotal - discountAmount);
  const subtotal = Math.round(total / (1 + taxRate));
  const tax = total - subtotal;

  const fmt = (n) => n.toLocaleString('es-CL');

  const canResetOrder = items.length > 0 || !!activeTable || !!coupon;

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-100">

      {/* Header: Order Info */}
      <div className="px-5 pt-5 pb-4 border-b border-gray-100 shrink-0">
        <div className="flex items-center justify-between gap-2">
          {/* Izquierda: cerrar el carrito (solo móvil) */}
          <div className="flex items-center md:hidden">
            {isMobile && (
              <IconButton
                onClick={onCloseMobile}
                className="-ml-2 text-gray-500 active:bg-gray-100 select-none"
                style={{ WebkitTapHighlightColor: 'transparent' }}
               label="Cerrar" variant="ghost">
                <X className="h-6 w-6" aria-hidden="true" />
              </IconButton>
            )}
          </div>
          {/* Centro: selector de mesa. En móvil ocupa el espacio libre y centra
              el botón de verdad; en desktop vuelve a la izquierda. */}
          <div className="flex-1 flex justify-center md:flex-none md:justify-start">
              <div className="relative z-50">
                {dineInEnabled ? (
                  <div className="flex items-stretch select-none">
                    <button
                      type="button"
                      onClick={() => {
                        if (onChangeTableMobile) {
                          onChangeTableMobile();
                        } else if (window.innerWidth >= 768) {
                          setIsDropdownOpen(!isDropdownOpen);
                        }
                      }}
                      aria-label={activeTable ? `Cambiar mesa ${activeTable.name}` : 'Elegir mesa'}
                      style={{ WebkitTapHighlightColor: 'transparent' }}
                      className={`flex items-center gap-2 h-10 md:h-12 px-3 md:px-3.5 border text-sm md:text-base font-semibold touch-manipulation transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                        activeTable
                          ? 'rounded-l-xl bg-blue-50 text-blue-800 border-blue-200 border-r-0'
                          : 'rounded-xl bg-white text-gray-900 border-blue-200'
                      }`}
                    >
                      <Monitor className="h-4 w-4 md:h-5 md:w-5 shrink-0" />
                      {activeTable ? (
                        <span className="whitespace-nowrap">
                          {!/^mesa\b/i.test(activeTable.name) && (
                            <span className="text-xs font-medium opacity-60 mr-1">Mesa</span>
                          )}
                          {activeTable.name}
                        </span>
                      ) : (
                        <>
                          <span className="md:hidden">Mesa</span>
                          <span className="hidden md:inline">Venta Directa</span>
                        </>
                      )}
                      <ArrowLeftRight className="hidden md:block h-4 w-4 shrink-0" />
                    </button>
                    {activeTable && (
                      <button data-icon-button="true"
                        type="button"
                        onClick={onClearTable}
                        title="Quitar mesa"
                        aria-label={`Quitar mesa ${activeTable.name}`}
                        style={{ WebkitTapHighlightColor: 'transparent' }}
                        className="flex items-center px-2.5 h-10 md:h-12 rounded-r-xl bg-blue-50 border border-blue-200 border-l-0 text-blue-400 transition-colors touch-manipulation hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 h-10 md:h-12 select-none">
                    <Monitor className="h-4 w-4 md:h-5 md:w-5 shrink-0" />
                    <span className="text-sm md:text-base font-semibold text-gray-900">Venta Directa</span>
                  </div>
                )}
                
                {/* Dropdown Menu */}
                {isDropdownOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setIsDropdownOpen(false)}
                    />
                    <div className="absolute left-0 top-full mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-50 max-h-64 overflow-y-auto">
                      <div 
                        className="px-4 py-2 hover:bg-gray-50 cursor-pointer font-medium text-sm flex items-center justify-between"
                        onClick={() => {
                          onClearTable();
                          setIsDropdownOpen(false);
                        }}
                      >
                        <span>Venta Directa</span>
                      </div>
                      <div className="h-px bg-gray-100 my-1"></div>
                      <div className="px-3 pb-1 pt-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Mesas</div>
                      {tables.length === 0 ? (
                        <div className="px-4 py-2 text-xs text-gray-500">No hay mesas configuradas</div>
                      ) : (
                        tables.map(table => {
                          const openOrders = getOpenOrders(table.orders);
                          const currentTotal = sumOpenOrdersTotal(table.orders);
                          const isOccupied = openOrders.length > 0;
                          return (
                          <div 
                            key={table.id}
                            className={`px-4 py-2 hover:bg-gray-50 cursor-pointer text-sm flex items-center justify-between ${activeTable?.id === table.id ? 'bg-blue-50 text-blue-700 font-bold' : 'text-gray-700 font-medium'}`}
                            onClick={() => {
                              onTableSelect && onTableSelect(table);
                              setIsDropdownOpen(false);
                            }}
                          >
                            <span className="flex items-center gap-2">
                              {table.name}
                              {isOccupied && currentTotal > 0 && (
                                <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-md font-bold">
                                  ${fmt(currentTotal)}
                                </span>
                              )}
                            </span>
                            {isOccupied && (
                              <span className="w-2 h-2 rounded-full bg-red-500"></span>
                            )}
                            {!isOccupied && table.status === 'free' && (
                              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            )}
                          </div>
                        )})
                      )}
                    </div>
                  </>
                )}
               </div>
             </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onResetOrder}
              disabled={!canResetOrder}
              className="text-gray-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 disabled:opacity-40 disabled:hover:text-gray-500 disabled:hover:border-gray-200 disabled:hover:bg-transparent"
              title="Resetear pedido: vaciar carrito, mesa y cupón"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              <span className="hidden lg:inline">Resetear</span>
            </Button>
            {/* "Nuevo pedido" solo en desktop: en móvil el header no tiene
                sitio y la acción se hace desde el catálogo. */}
            <Button
              size="sm"
              variant="outline"
              onClick={onNewOrder}
              className="hidden md:inline-flex"
            >
              <Plus className="size-4" aria-hidden="true" /> Nuevo pedido
            </Button>
          </div>
        </div>
      </div>

      {/* Items List */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-300 pb-12">
            <ShoppingCart className="h-12 w-12 mb-4" aria-hidden="true" />
            <p className="font-semibold text-lg">Sin artículos</p>
            <p className="text-sm mt-1">Toca un producto para agregarlo</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {items.map((item, index) => {
              const hasVariants = item.variants && item.variants.length > 0 && item.variants.some(v => v.is_active);
              const hasExtras = item.ingredients && item.ingredients.length > 0 && item.ingredients.some(i => i.isExtra);
              const hasOptions = item.type === 'bundle' || hasVariants || hasExtras;
              const baseIngredients = item.ingredients?.filter(i => i.isBase) || [];
              
              const isFirstNewItem = items.some(i => i.isSaved) && !item.isSaved && (index === 0 || items[index - 1].isSaved);
              
              return (
                <React.Fragment key={item.cartItemId}>
                  {isFirstNewItem && (
                    <div className="flex items-center px-5 py-3 bg-gray-50/80">
                      <div className="flex-1 border-t border-dashed border-gray-300"></div>
                      <span className="px-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Nuevos Añadidos</span>
                      <div className="flex-1 border-t border-dashed border-gray-300"></div>
                    </div>
                  )}
                  <div className="flex items-center gap-3 px-5 py-4 bg-white">
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
                    <p className="text-xs text-gray-400 mt-1">${fmt(getCartItemUnitPrice(item))} c/u</p>

                    {/* Qty Controls */}
                    <QuantityStepper
                      className="mt-2.5"
                      value={item.quantity} label={item.name}
                      disabled={item.isSaved}
                      removeOnDecrease={item.quantity === 1}
                      onDecrease={() => onUpdateQty?.(item.cartItemId, item.quantity - 1)}
                      onIncrease={() => onUpdateQty?.(item.cartItemId, item.quantity + 1)}
                    />
                  </div>

                  {/* Price + Actions */}
                  <div className="flex flex-col items-end justify-between min-h-[4rem] pl-2">
                    <span className="font-bold text-[16px]">${fmt(getCartItemUnitPrice(item) * item.quantity)}</span>
                    
                    <div className="flex items-center gap-1">
                      {hasOptions && !item.isSaved && (
                        <IconButton label={`Editar ${item.name}`}
                          onClick={() => onItemClick && onItemClick(item)}
                          className="text-gray-600"
                        >
                          <Edit2 className="h-[18px] w-[18px]" aria-hidden="true" />
                        </IconButton>
                      )}
                      {!item.isSaved ? (
                        <IconButton label={`Eliminar ${item.name}`}
                          onClick={() => onRemove && onRemove(item.cartItemId)}
                          variant="destructive"
                        >
                          <Trash2 className="h-[18px] w-[18px]" aria-hidden="true" />
                        </IconButton>
                      ) : (
                        <div className="flex items-center gap-1.5 bg-orange-50 text-orange-600 px-2 py-1 rounded-full border border-orange-200 shadow-sm" title="En preparación en cocina">
                          <ChefHat className="h-3.5 w-3.5" />
                          <span className="text-[9px] font-bold uppercase tracking-wider whitespace-nowrap">En Prep</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Area — su alto depende de lo que renderice (cupón, totales y
          1 o 2 botones). Va en el flujo, no fixed: así el `flex-1 overflow-y-auto`
          de la lista se encoge solo cuando aparece el segundo botón y nada queda
          tapado. */}
      <div className="shrink-0 flex flex-col bg-white border-t border-gray-100 pb-safe md:px-4 md:pt-4 md:pb-4 z-20">
        
        {/* Cupón de descuento */}
        {items.length > 0 && (
          <div className="px-4 pt-3 md:px-0 md:pt-0 md:mb-3">
            {!coupon ? (
              <button
                onClick={() => setCouponOpen(!couponOpen)}
                className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700 transition-colors w-full"
              >
                <Tag className="h-3.5 w-3.5" />
                <span>{couponOpen ? 'Ocultar cupón' : '¿Tienes un cupón de descuento?'}</span>
              </button>
            ) : (
              <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  <span className="text-xs font-semibold text-green-700">{coupon.code}</span>
                  <span className="text-xs text-green-600">
                    {coupon.type === 'percentage' ? `-${coupon.value}%` : `-$${coupon.value.toLocaleString('es-CL')}`}
                  </span>
                </div>
                <Button
                  onClick={onRemoveCoupon}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                 variant="ghost" size="sm">
                  Quitar
                </Button>
              </div>
            )}
            {couponOpen && !coupon && (
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  placeholder="Código del cupón"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200 uppercase placeholder:text-gray-400"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && couponCode.trim()) {
                      onApplyCoupon?.(couponCode.trim());
                    }
                  }}
                />
                <Button
                  onClick={() => {
                    if (couponCode.trim()) onApplyCoupon?.(couponCode.trim());
                  }}
                  disabled={!couponCode.trim() || couponLoading}
                  className="bg-gray-900 text-white disabled:opacity-40 hover:bg-gray-800 transition-colors"
                 variant="default" size="sm">
                  {couponLoading ? '...' : 'Aplicar'}
                </Button>
              </div>
            )}
            {couponError && !coupon && (
              <p className="text-[11px] text-red-500 mt-1">{couponError}</p>
            )}
          </div>
        )}

        {/* Totals summary */}
        {items.length > 0 && (
          <div className="px-4 pt-3 space-y-1.5 md:px-0 md:pt-0 md:mb-3">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Subtotal</span>
              <span>${fmt(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-xs text-green-600 font-medium">
                <span>Descuento ({coupon.code})</span>
                <span>-${fmt(discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-xs text-gray-500">
              <span>IVA (19%)</span>
              <span>${fmt(tax)}</span>
            </div>
          </div>
        )}

        {/* Botones de acción. "Agregar" y "Cobrar" van uno al lado del otro
            siempre, también en móvil: son las dos acciones del paso y el cajero
            elige entre ellas, no las recorre en el tiempo. Antes se apilaban en
            columna y el footer crecía cuando aparecía el segundo, lo que empujaba
            la lista de productos hacia arriba en cada cobro.

            Cuando solo existe "Cobrar" (no hay ítems nuevos por guardar) ese
            botón ocupa la fila completa.

            El inset de 16px recupera el margen que tenía la barra cuando iba en
            `fixed left-4 right-4`, y alinea los botones con el cupón y los
            totales, que también usan px-4. */}
        <div className="flex flex-row gap-3 mt-3 mx-4 mb-6 md:mt-0 md:mx-0 md:mb-0">
          {(() => {
            const hasNewItems = items.some(i => !i.isSaved) && activeTable;
            
            return (
              <>
                {hasNewItems && (
                  <Button
                    onClick={onSaveOrder}
                    disabled={items.length === 0}
                    loading={isSavingOrder}
                    loadingText="Enviando…"
                    size="pos"
                    className="flex-1 min-w-0 px-3 md:px-5"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                    <span className="truncate md:hidden">Agregar</span>
                    <span className="truncate hidden md:inline">Agregar al pedido</span>
                  </Button>
                )}
                <Button
                  onClick={onCharge}
                  disabled={items.length === 0}
                  variant={hasNewItems ? "outline" : "default"}
                  size="pos"
                  className={`flex-1 min-w-0 px-3 md:px-5 ${
                    hasNewItems 
                      ? "bg-white border-gray-200 hover:bg-gray-50 text-gray-900" 
                      : "bg-black hover:bg-gray-900 text-white"
                  }`}
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <span className="truncate">Cobrar ${fmt(total)}</span>
                </Button>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
};

export default CartPanel;
