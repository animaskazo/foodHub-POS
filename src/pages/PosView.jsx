import React, { useState } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import ProductGrid from '../components/pos/ProductGrid';
import CartPanel from '../components/pos/CartPanel';
import BottomNav from '../components/pos/BottomNav';
import PaymentModal from '../components/pos/PaymentModal';
import TransactionsView from '../components/pos/TransactionsView';
import VariantSelectionModal from '../components/pos/VariantSelectionModal';
import Modal from '../components/ui/Modal';
import { NAV_ITEMS } from '../components/pos/BottomNav';
import { X, LogOut, Menu } from 'lucide-react';
import { createOrder } from '../services/orderService';

const PosView = () => {
  const [cartItems, setCartItems] = useState([]);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('pago');
  const [selectedProductForVariant, setSelectedProductForVariant] = useState(null);
  const [editingCartItem, setEditingCartItem] = useState(null);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const addToCart = (product, variant, ingredients = []) => {
    const ingredientsIds = ingredients.map(i => i.id).sort().join(',');
    const cartItemId = `${product.id}${variant ? '-' + variant.id : ''}${ingredientsIds ? '-ing-' + ingredientsIds : ''}`;
    
    const basePrice = product.basePrice !== undefined ? product.basePrice : product.price;
    const originalName = product.originalName || product.name;

    const baseNet = variant ? basePrice + (variant.price_modifier || 0) : basePrice;
    const baseGross = Math.round(baseNet * 1.19);
    const ingredientsGross = ingredients.reduce((sum, i) => sum + (i.price || 0), 0);
    const totalGross = baseGross + ingredientsGross;
    const itemPrice = Math.round(totalGross / 1.19);
    
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
    const hasVariants = product.variants && product.variants.length > 0 && product.variants.some(v => v.is_active);
    const hasIngredients = product.ingredients && product.ingredients.length > 0;
    
    if (hasVariants || hasIngredients) {
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
      const baseGross = Math.round(baseNet * 1.19);
      const ingredientsGross = ingredients.reduce((sum, i) => sum + (i.price || 0), 0);
      const totalGross = baseGross + ingredientsGross;
      const itemPrice = Math.round(totalGross / 1.19);
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

  const handleNewOrder = () => {
    setCartItems([]);
    setIsMobileCartOpen(false);
  };

  const handleCharge = () => {
    setIsPaymentModalOpen(true);
  };

  const handlePaymentConfirm = async (method, orderType) => {
    try {
      const total = cartItems.reduce((acc, i) => acc + (Math.round(i.price * 1.19) * i.quantity), 0);
      const subtotal = Math.round(total / 1.19);
      const tax = total - subtotal;
      
      const order = await createOrder(cartItems, method, orderType, total, subtotal, tax);
      
      setCartItems([]);
      setIsMobileCartOpen(false);
      return order;
    } catch (error) {
      console.error('Error creating order:', error);
      alert(`Hubo un error al procesar el pago: ${error.message || JSON.stringify(error)}`);
    }
  };

  const totalQty = cartItems.reduce((acc, i) => acc + i.quantity, 0);
  const total = cartItems.reduce((acc, i) => acc + (Math.round(i.price * 1.19) * i.quantity), 0);
  const subtotal = Math.round(total / 1.19);

  useDocumentTitle('Punto de Venta');


  return (
    <div className="h-[100dvh] w-full flex flex-col overflow-hidden">
      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'pago' && (
          <div className="flex h-full overflow-hidden">
            {/* Left Panel: Product Grid (100% on mobile, 60% on desktop) */}
            <div className="w-full md:w-[60%] overflow-hidden relative">
              <ProductGrid
                onProductClick={handleProductClick}
                cartItems={cartItems}
                onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
              />
              
              {/* Floating Cart Button for Mobile */}
              {cartItems.length > 0 && (
                <div className="fixed bottom-6 left-4 right-4 z-40 md:hidden pb-safe">
                  <button
                    onPointerDown={() => setIsMobileCartOpen(true)}
                    className="w-full bg-blue-600 text-white rounded-2xl shadow-lg p-4 flex items-center justify-between active:bg-blue-700 transition-colors"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="bg-white/20 px-3 py-1 rounded-full text-sm font-bold">
                        {totalQty}
                      </div>
                      <span className="font-bold">Ver Pedido</span>
                    </div>
                    <span className="font-bold">${total.toLocaleString('es-CL')}</span>
                  </button>
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
                onRemove={handleRemove}
                onUpdateQty={handleUpdateQty}
                onCharge={handleCharge}
                onNewOrder={handleNewOrder}
                isMobile={true}
                onCloseMobile={() => setIsMobileCartOpen(false)}
                onItemClick={(item) => {
                  const hasVariants = item.variants && item.variants.length > 0 && item.variants.some(v => v.is_active);
                  const hasIngredients = item.ingredients && item.ingredients.length > 0;
                  if (hasVariants || hasIngredients) {
                    setSelectedProductForVariant(item);
                    setEditingCartItem(item);
                  }
                }}
              />
            </div>
          </div>
        )}
        
        {activeTab === 'transacciones' && (
          <TransactionsView onOpenMobileMenu={() => setIsMobileMenuOpen(true)} />
        )}

        {/* Placeholders for other tabs */}
        {activeTab !== 'pago' && activeTab !== 'transacciones' && (
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
              <button 
                onPointerDown={() => setIsMobileMenuOpen(false)}
                className="p-2 -mr-2 text-gray-500 bg-gray-50 active:bg-gray-100 rounded-full"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-4">
              {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onPointerDown={() => {
                    setActiveTab(id);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-4 px-6 py-4 transition-colors ${
                    activeTab === id ? 'bg-blue-50 text-blue-600 font-bold border-r-4 border-blue-600' : 'text-gray-600 font-medium'
                  }`}
                >
                  <Icon className="h-6 w-6" />
                  <span className="text-base">{label}</span>
                </button>
              ))}
            </div>
            <div className="p-5 border-t border-gray-100">
              <button
                onPointerDown={() => window.location.href = '/'}
                className="w-full flex items-center gap-3 px-4 py-3 text-red-600 font-semibold active:bg-red-50 rounded-xl"
              >
                <LogOut className="h-5 w-5" />
                <span>Cerrar Sesión</span>
              </button>
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
      />
      
      <VariantSelectionModal
        isOpen={!!selectedProductForVariant}
        onClose={() => {
          setSelectedProductForVariant(null);
          setEditingCartItem(null);
        }}
        product={selectedProductForVariant}
        onSelectVariant={handleVariantSelect}
        editingItem={editingCartItem}
        onDelete={(cartItemId) => {
          handleRemove(cartItemId);
          setEditingCartItem(null);
          setSelectedProductForVariant(null);
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
            <button
              onClick={() => setItemToDelete(null)}
              className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={confirmRemove}
              className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 transition-colors"
            >
              Eliminar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default PosView;
