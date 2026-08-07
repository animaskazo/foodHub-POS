import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import ProductGrid from '../components/pos/ProductGrid';
import CartPanel from '../components/pos/CartPanel';
import BottomNav from '../components/pos/BottomNav';
import PaymentModal from '../components/pos/PaymentModal';
import TransactionsView from '../components/pos/TransactionsView';
import PosFloorMap from '../components/pos/PosFloorMap';
import VariantSelectionModal from '../components/pos/VariantSelectionModal';
import BundleSelectionModal from '../components/pos/BundleSelectionModal';
import Modal from '../components/ui/Modal';
import { NAV_ITEMS } from '../components/pos/BottomNav';
import PrepTimeSelector from '../components/ui/PrepTimeSelector';
import { X, LogOut, Menu, Home, ChefHat, Clock } from 'lucide-react';
import { Button } from '../components/ui/button';
import { createOrder, updateOrderCustomer, getOpenOrderForTable, appendItemsToOrder } from '../services/orderService';
import { useAuth } from '../components/AuthContext';
import { getShiftSettings, getCurrentShift } from '../services/shiftService';
import { PosSkeleton } from '../components/ui/Skeleton';
import { defaultSelectionsForSlot, bundleHasChoices } from '../utils/bundleSelections';

const PosView = () => {
  const { organization } = useAuth();
  const taxRate = organization?.default_tax_rate ? Number(organization.default_tax_rate) / 100 : 0.19;

  const navigate = useNavigate();
  const [cartItems, setCartItems] = useState([]);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('pago');
  const [activeTable, setActiveTable] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);
  const [selectedProductForVariant, setSelectedProductForVariant] = useState(null);
  const [editingCartItem, setEditingCartItem] = useState(null);
  const [selectedProductForBundle, setSelectedProductForBundle] = useState(null);
  const [editingBundleItem, setEditingBundleItem] = useState(null);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [shiftSettings, setShiftSettings] = useState(null);
  const [currentShift, setCurrentShift] = useState(null);
  const [loadingShift, setLoadingShift] = useState(true);

  useEffect(() => {
    const loadShiftData = async () => {
      if (!organization?.id) return;
      try {
        const settings = await getShiftSettings(organization.id);
        setShiftSettings(settings);
        if (settings?.shifts_enabled) {
          const shift = await getCurrentShift(organization.id);
          setCurrentShift(shift);
        }
      } catch (err) {
        console.error('Error loading shift info:', err);
      } finally {
        setLoadingShift(false);
      }
    };
    loadShiftData();
  }, [organization?.id]);

  const isPosBlocked = !loadingShift && shiftSettings?.shifts_enabled && shiftSettings?.block_pos_when_closed && !currentShift;

  const addToCart = (product, variant, ingredients = []) => {
    const ingredientsIds = ingredients.map(i => i.id).sort().join(',');
    const cartItemId = `${product.id}${variant ? '-' + variant.id : ''}${ingredientsIds ? '-ing-' + ingredientsIds : ''}`;
    
    const basePrice = product.basePrice !== undefined ? product.basePrice : product.price;
    const originalName = product.originalName || product.name;

    const baseNet = variant ? basePrice + (variant.price_modifier || 0) : basePrice;
    const baseGross = Math.round(baseNet);
    const ingredientsGross = ingredients.reduce((sum, i) => sum + (i.price || 0), 0);
    const totalGross = baseGross + ingredientsGross;
    const itemPrice = totalGross;
    
    const itemName = variant ? `${originalName} (${variant.name})` : originalName;
    
    setCartItems(prev => {
      const existing = prev.find(i => i.cartItemId === cartItemId);
      if (existing) {
        return prev.map(i =>
          i.cartItemId === cartItemId ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { 
        ...product, 
        cartItemId, 
        productId: product.id, 
        name: itemName, 
        originalName,
        basePrice,
        price: itemPrice, 
        quantity: 1, 
        variant: variant || null,
        selectedIngredients: ingredients
      }];
    });
  };

  const handleProductClick = (product) => {
    if (product.type === 'bundle') {
      const hasChoices = bundleHasChoices(product.bundleSlots);

      if (!hasChoices) {
        // Generar selecciones por defecto y agregar directamente calculando precios y variantes correctas
        const baseNet = product.price || 0;
        let totalGross = Math.round(baseNet);

        const defaultOptionsList = product.bundleSlots?.flatMap(slot => {
          return defaultSelectionsForSlot(slot).map(sel => {
            // Sumar modificadores al precio bruto
            totalGross += Math.round(sel.priceModifier || 0);
            if (sel.variant) {
              totalGross += Math.round(sel.variant.price_modifier || 0);
            }

            let fullName = sel.name;
            if (sel.variant) {
              fullName += ` (${sel.variant.name})`;
            }

            const optPriceNet = (sel.priceModifier || 0) + (sel.variant?.price_modifier || 0);

            return {
              slotId: slot.id,
              slotName: slot.name,
              optionId: sel.optionId,
              productId: sel.productId,
              name: fullName,
              originalName: sel.name,
              price: optPriceNet,
              quantity: 1,
              variant: sel.variant,
              selectedIngredients: []
            };
          });
        }) || [];

        const comboTotalNet = totalGross;

        handleBundleSelect({
          ...product,
          price: comboTotalNet,
          selectedOptions: defaultOptionsList,
          editingItem: null
        });
        return;
      }

      setSelectedProductForBundle(product);
      return;
    }

    const hasVariants = product.variants && product.variants.length > 0 && product.variants.some(v => v.is_active);
    const hasExtras = product.ingredients && product.ingredients.length > 0 && product.ingredients.some(i => i.isExtra);
    
    if (hasVariants || hasExtras) {
      setSelectedProductForVariant(product);
      return;
    }
    addToCart(product, null, []);
  };

  const handleVariantSelect = (variant, ingredients = [], editingItem = null) => {
    if (editingItem && selectedProductForVariant) {
      const basePrice = selectedProductForVariant.basePrice !== undefined ? selectedProductForVariant.basePrice : selectedProductForVariant.price;
      const originalName = selectedProductForVariant.originalName || selectedProductForVariant.name;

      const ingredientsIds = ingredients.map(i => i.id).sort().join(',');
      const newCartItemId = `${selectedProductForVariant.productId || selectedProductForVariant.id}${variant ? '-' + variant.id : ''}${ingredientsIds ? '-ing-' + ingredientsIds : ''}`;
      
      const baseNet = variant ? basePrice + (variant.price_modifier || 0) : basePrice;
      const baseGross = Math.round(baseNet);
      const ingredientsGross = ingredients.reduce((sum, i) => sum + (i.price || 0), 0);
      const totalGross = baseGross + ingredientsGross;
      const itemPrice = totalGross;
      const itemName = variant ? `${originalName} (${variant.name})` : originalName;

      setCartItems(prev => {
        const withoutOld = prev.filter(i => i.cartItemId !== editingItem.cartItemId);
        const existing = withoutOld.find(i => i.cartItemId === newCartItemId);
        
        if (existing) {
          return withoutOld.map(i =>
            i.cartItemId === newCartItemId ? { ...i, quantity: i.quantity + editingItem.quantity } : i
          );
        } else {
          return [...withoutOld, { 
            ...selectedProductForVariant, 
            cartItemId: newCartItemId, 
            productId: selectedProductForVariant.productId || selectedProductForVariant.id, 
            name: itemName,
            originalName,
            basePrice,
            price: itemPrice, 
            quantity: editingItem.quantity, 
            variant: variant || null,
            selectedIngredients: ingredients
          }];
        }
      });
      setSelectedProductForVariant(null);
      setEditingCartItem(null);
    } else if (selectedProductForVariant) {
      addToCart(selectedProductForVariant, variant, ingredients);
      setSelectedProductForVariant(null);
    }
  };

  const handleBundleSelect = (configuredBundle) => {
    const { editingItem } = configuredBundle;
    
    // Generar un cartItemId único para esta configuración específica del combo.
    const selectionsKey = configuredBundle.selectedOptions
      .map(opt => {
        const varId = opt.variant ? '-' + opt.variant.id : '';
        const ingIds = opt.selectedIngredients?.map(i => i.id).sort().join(',') || '';
        return `${opt.optionId}:${opt.productId}${varId}${ingIds ? '-ing-' + ingIds : ''}`;
      })
      .sort()
      .join('|');

    const cartItemId = `${configuredBundle.id}-bundle-${selectionsKey}`;

    if (editingItem) {
      setCartItems(prev => {
        const withoutOld = prev.filter(i => i.cartItemId !== editingItem.cartItemId);
        const existing = withoutOld.find(i => i.cartItemId === cartItemId);
        
        if (existing) {
          return withoutOld.map(i =>
            i.cartItemId === cartItemId ? { ...i, quantity: i.quantity + editingItem.quantity } : i
          );
        } else {
          return [...withoutOld, { 
            ...configuredBundle, 
            cartItemId, 
            productId: configuredBundle.id, 
            quantity: editingItem.quantity
          }];
        }
      });
      setSelectedProductForBundle(null);
      setEditingBundleItem(null);
    } else {
      setCartItems(prev => {
        const existing = prev.find(i => i.cartItemId === cartItemId);
        if (existing) {
          return prev.map(i =>
            i.cartItemId === cartItemId ? { ...i, quantity: i.quantity + 1 } : i
          );
        }
        return [...prev, { 
          ...configuredBundle, 
          cartItemId, 
          productId: configuredBundle.id, 
          quantity: 1
        }];
      });
      setSelectedProductForBundle(null);
    }
  };

  const handleUpdateQty = (cartItemId, newQty) => {
    if (newQty <= 0) {
      setCartItems(prev => prev.filter(i => i.cartItemId !== cartItemId));
    } else {
      setCartItems(prev =>
        prev.map(i => i.cartItemId === cartItemId ? { ...i, quantity: newQty } : i)
      );
    }
  };

  const handleRemove = (cartItemId) => {
    setItemToDelete(cartItemId);
  };

  const confirmRemove = () => {
    if (itemToDelete) {
      setCartItems(prev => prev.filter(i => i.cartItemId !== itemToDelete));
      setItemToDelete(null);
    }
  };

  const handleTableSelect = async (table) => {
    setActiveTable(table);
    setActiveTab('pago');
    
    if (table.status === 'occupied') {
      try {
        const order = await getOpenOrderForTable(table.id);
        if (order) {
          setActiveOrder(order);
          // Map order_items to cartItems format
          // Filter out child items (parent_item_id is not null) as they are handled inside bundles
          const parents = order.order_items.filter(i => !i.parent_item_id);
          const mappedItems = parents.map(item => {
            const variantInfo = item.order_item_variants?.[0];
            const variant = variantInfo ? { id: variantInfo.variant_option_id, name: variantInfo.variant_option_name, price_modifier: variantInfo.price_modifier } : null;
            
            const selectedIngredients = (item.order_item_ingredients || []).map(ing => ({
              id: ing.ingredient_id,
              name: ing.ingredient_name,
              price: ing.price
            }));
            
            // Reconstruct bundle options if any
            const children = order.order_items.filter(i => i.parent_item_id === item.id);
            const isBundle = children.length > 0;
            const selectedOptions = isBundle ? children.map(child => {
              const childVariant = child.order_item_variants?.[0];
              const childIngs = (child.order_item_ingredients || []).map(ing => ({ name: ing.ingredient_name, price: ing.price }));
              let optName = child.product_name;
              if (childVariant) optName += ` (${childVariant.variant_option_name})`;
              return {
                name: optName,
                price: child.unit_price,
                selectedIngredients: childIngs
              };
            }) : [];
            
            return {
              cartItemId: `saved-${item.id}`,
              productId: item.product_id,
              name: item.product_name + (variant ? ` (${variant.name})` : ''),
              image: item.products?.product_images?.[0]?.url || null,
              price: item.unit_price - (variant?.price_modifier || 0), // Base price
              quantity: item.quantity,
              variant,
              selectedIngredients,
              type: isBundle ? 'bundle' : 'standard',
              selectedOptions,
              isSaved: true
            };
          });
          
          setCartItems(mappedItems);
        } else {
          setActiveOrder(null);
          setCartItems([]);
        }
      } catch (err) {
        console.error("Error loading open order", err);
      }
    } else {
      setActiveOrder(null);
      setCartItems([]);
    }
  };

  const handleNewOrder = () => {
    setCartItems([]);
    setIsMobileCartOpen(false);
  };

  const handleCharge = () => {
    setIsPaymentModalOpen(true);
  };

  const handlePaymentConfirm = async (method, orderType, deliveryInfo, orderNotes) => {
    try {
      const cartTotal = cartItems.reduce((acc, i) => acc + (Math.round(i.price) * i.quantity), 0);
      const deliveryFee = deliveryInfo?.deliveryFee || 0;
      const total = cartTotal + deliveryFee;
      const subtotal = Math.round(cartTotal / (1 + taxRate));
      const tax = cartTotal - subtotal;
      
      let finalOrder;
      
      if (activeOrder) {
        const newItems = cartItems.filter(i => !i.isSaved);
        if (newItems.length > 0) {
          const newTotal = newItems.reduce((acc, i) => acc + (Math.round(i.price) * i.quantity), 0);
          const newSubtotal = Math.round(newTotal / (1 + taxRate));
          const newTax = newTotal - newSubtotal;
          await appendItemsToOrder(activeOrder.id, newItems, newTotal, newSubtotal, newTax);
        }
        
        const { supabase } = await import('../lib/supabase');
        
        const { data: existingPayments } = await supabase.from('payments').select('id').eq('order_id', activeOrder.id).eq('status', 'pending');
        if (existingPayments && existingPayments.length > 0) {
           await supabase.from('payments').update({ method, status: 'paid', amount: total, paid_at: new Date().toISOString() }).eq('id', existingPayments[0].id);
        } else {
           await supabase.from('payments').insert({ order_id: activeOrder.id, method, amount: total, status: 'paid', paid_at: new Date().toISOString() });
        }
        
        if (activeOrder.table_id || activeTable?.id) {
          await supabase.from('restaurant_tables').update({ status: 'free' }).eq('id', activeOrder.table_id || activeTable?.id);
        }
        finalOrder = activeOrder;
      } else {
        finalOrder = await createOrder(cartItems, method, orderType, total, subtotal, tax, deliveryInfo, orderNotes, deliveryFee, activeTable?.id);
      }
      
      setCartItems([]);
      setIsMobileCartOpen(false);
      setActiveTable(null);
      setActiveOrder(null);
      return finalOrder;
    } catch (error) {
      console.error('Error creating order:', error);
      alert(`Hubo un error al procesar el pago: ${error.message || JSON.stringify(error)}`);
    }
  };

  const handleSaveOrder = async () => {
    try {
      const newItems = cartItems.filter(i => !i.isSaved);
      if (newItems.length === 0) return;

      const newTotal = newItems.reduce((acc, i) => acc + (Math.round(i.price) * i.quantity), 0);
      const newSubtotal = Math.round(newTotal / (1 + taxRate));
      const newTax = newTotal - newSubtotal;

      if (activeOrder) {
        await appendItemsToOrder(activeOrder.id, newItems, newTotal, newSubtotal, newTax);
      } else {
        await createOrder(newItems, 'pending', 'table', newTotal, newSubtotal, newTax, null, '', 0, activeTable?.id);
      }
      
      setCartItems([]);
      setIsMobileCartOpen(false);
      setActiveTable(null);
      setActiveOrder(null);
    } catch (error) {
      console.error('Error saving order:', error);
      alert(`Hubo un error al guardar el pedido: ${error.message || JSON.stringify(error)}`);
    }
  };

  const totalQty = cartItems.reduce((acc, i) => acc + i.quantity, 0);
  const total = cartItems.reduce((acc, i) => acc + (Math.round(i.price) * i.quantity), 0);
  const subtotal = total / 1.19;

  useDocumentTitle('Punto de Venta');

  if (isPosBlocked) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 text-center p-6">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full">
          <div className="bg-red-50 p-4 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-6">
            <LogOut className="h-10 w-10 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Caja Cerrada</h2>
          <p className="text-gray-500 mb-8">El terminal de ventas está bloqueado porque el turno actual se encuentra cerrado. Para poder recibir pagos y procesar órdenes, por favor abre la caja desde el Dashboard administrativo.</p>
          <Button 
            onClick={() => navigate('/')} 
            className="w-full bg-black hover:bg-gray-800 text-white font-bold h-12"
          >
            Ir al Dashboard
          </Button>
        </div>
      </div>
    );
  }

  if (loadingShift) return <PosSkeleton />

  return (
    <div className="h-[100dvh] w-full flex flex-col overflow-hidden">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative min-h-0">
        {activeTab === 'pago' && (
          <div className="flex-1 flex overflow-hidden w-full">
            {/* Left Panel: Product Grid (100% on mobile, 60% on desktop) */}
            <div className="w-full md:w-[60%] overflow-hidden relative">
              <ProductGrid
                organizationId={organization?.id}
                onProductClick={handleProductClick}
                cartItems={cartItems}
                onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
              />
              
              {/* Floating Cart Button for Mobile */}
              {cartItems.length > 0 && (
                <div className="fixed bottom-6 left-4 right-4 z-40 md:hidden pb-safe">
                  <Button
                    onPointerDown={() => setIsMobileCartOpen(true)}
                    className="relative w-full flex items-center justify-center h-14 px-5 bg-black hover:bg-black text-white rounded-full shadow-2xl transition-transform active:scale-[0.98]"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                    <div className="absolute left-3 bg-white text-black flex items-center justify-center h-8 w-8 rounded-full text-sm font-bold shadow-sm">
                      {totalQty}
                    </div>
                    <span className="font-bold text-[17px] tracking-wide">Ver Pedido ${total.toLocaleString('es-CL')}</span>
                  </Button>
                </div>
              )}
            </div>

            {/* Right Panel: Cart (Hidden on mobile unless open, 40% on desktop) */}
            <div className={`
              ${isMobileCartOpen ? 'fixed inset-0 z-40 bg-white' : 'hidden'}
              md:block md:relative md:w-[40%] overflow-hidden md:z-auto
            `}>
              <CartPanel
                cartItems={cartItems}
                activeTable={activeTable}
                onClearTable={() => {
                  setActiveTable(null);
                  setActiveOrder(null);
                  setCartItems([]);
                }}
                onSaveOrder={handleSaveOrder}
                onTableSelect={handleTableSelect}
                onRemove={handleRemove}
                onUpdateQty={handleUpdateQty}
                onCharge={handleCharge}
                onNewOrder={handleNewOrder}
                isMobile={true}
                onCloseMobile={() => setIsMobileCartOpen(false)}
                taxRate={taxRate}
                onItemClick={(item) => {
                  if (item.type === 'bundle') {
                    setSelectedProductForBundle(item);
                    setEditingBundleItem(item);
                    return;
                  }
                  
                  const hasVariants = item.variants && item.variants.length > 0 && item.variants.some(v => v.is_active);
                  const hasExtras = item.ingredients && item.ingredients.length > 0 && item.ingredients.some(i => i.isExtra);
                  if (hasVariants || hasExtras) {
                    setSelectedProductForVariant(item);
                    setEditingCartItem(item);
                  }
                }}
              />
            </div>
          </div>
        )}
        
        {activeTab === 'transacciones' && (
          <div className="flex-1 w-full overflow-y-auto">
            <TransactionsView onOpenMobileMenu={() => setIsMobileMenuOpen(true)} />
          </div>
        )}

        {activeTab === 'mesas' && (
          <div className="flex-1 w-full h-full flex flex-col relative">
            {/* Mobile menu trigger */}
            <div className="md:hidden absolute top-4 left-4 z-20">
              <Button 
                onClick={() => setIsMobileMenuOpen(true)}
                className="p-2 bg-white shadow-md rounded-full text-gray-700"
              >
                <Menu className="w-5 h-5" />
              </Button>
            </div>
            <PosFloorMap onTableSelect={handleTableSelect} />
          </div>
        )}

        {/* Placeholders for other tabs */}
        {activeTab !== 'pago' && activeTab !== 'transacciones' && activeTab !== 'mesas' && (
          <div className="flex flex-col items-center justify-center h-full bg-gray-50 text-gray-400">
            <p className="text-xl font-medium">Vista de {activeTab} en desarrollo</p>
          </div>
        )}
      </div>

      {/* Mobile Burger Drawer */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50"
            onPointerDown={() => setIsMobileMenuOpen(false)}
          />
          {/* Drawer */}
          <div className="relative w-4/5 max-w-xs bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-bold text-lg">Menú</h2>
              <Button 
                onPointerDown={() => setIsMobileMenuOpen(false)}
                className="p-2 -mr-2 text-gray-500 bg-gray-50 active:bg-gray-100 "
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto py-4">
              {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
                <Button
                  key={id}
                  variant="ghost"
                  onPointerDown={() => {
                    if (id === 'cocina') {
                      navigate('/kitchen');
                    } else if (id === 'dashboard') {
                      navigate('/');
                    } else {
                      setActiveTab(id);
                    }
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-start gap-5 px-8 h-16 transition-colors rounded-none ${
                    activeTab === id ? 'text-black font-extrabold bg-gray-50' : 'text-gray-500 font-semibold hover:bg-gray-50'
                  }`}
                >
                  <Icon className={`h-8 w-8 ${activeTab === id ? 'text-black' : 'text-gray-400'}`} />
                  <span className="text-lg">{label}</span>
                </Button>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-700">Tiempo de cocina</span>
              <PrepTimeSelector compact />
            </div>
            <div className="p-5 border-t border-gray-100">
              <Button
                variant="ghost"
                onPointerDown={() => window.location.href = '/'}
                className="w-full flex items-center justify-start gap-4 px-6 h-16 text-red-600 font-bold active:bg-red-50 hover:bg-red-50 rounded-xl"
              >
                <LogOut className="h-8 w-8" />
                <span className="text-lg">Cerrar Sesión</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation (Hidden on mobile) */}
      <BottomNav active={activeTab} onChange={setActiveTab} />

      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        cartItems={cartItems}
        onConfirm={handlePaymentConfirm}
        taxRate={taxRate}
        onSaveCustomer={async (id, name, phone) => {
          await updateOrderCustomer(id, name, phone);
        }}
      />
      
      <VariantSelectionModal
        isOpen={selectedProductForVariant !== null}
        onClose={() => {
          setSelectedProductForVariant(null);
          setEditingCartItem(null);
        }}
        product={selectedProductForVariant}
        onSelectVariant={handleVariantSelect}
        editingItem={editingCartItem}
        cartItems={cartItems}
        onDelete={(cartItemId) => {
          handleRemove(cartItemId);
          setEditingCartItem(null);
          setSelectedProductForVariant(null);
        }}
      />

      <BundleSelectionModal
        isOpen={selectedProductForBundle !== null}
        onClose={() => {
          setSelectedProductForBundle(null);
          setEditingBundleItem(null);
        }}
        product={selectedProductForBundle}
        onConfirm={handleBundleSelect}
        editingItem={editingBundleItem}
        onDelete={(cartItemId) => {
          handleRemove(cartItemId);
          setEditingBundleItem(null);
          setSelectedProductForBundle(null);
        }}
      />

      <Modal
        isOpen={!!itemToDelete}
        onClose={() => setItemToDelete(null)}
        title="Confirmar eliminación"
        maxWidth="max-w-sm"
      >
        <div className="p-6">
          <p className="text-gray-600 mb-6">
            ¿Estás seguro de que deseas eliminar <strong>{cartItems.find(i => i.cartItemId === itemToDelete)?.name}</strong> del pedido?
          </p>
          <div className="flex gap-3">
            <Button
              onClick={() => setItemToDelete(null)}
              className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 transition-colors"
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmRemove}
              className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold hover: 700" transition-colors variant="destructive">
              Eliminar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default PosView;
