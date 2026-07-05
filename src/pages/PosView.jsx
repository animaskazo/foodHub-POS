import React, { useState } from 'react';
import ProductGrid from '../components/pos/ProductGrid';
import CartPanel from '../components/pos/CartPanel';
import BottomNav from '../components/pos/BottomNav';
import PaymentModal from '../components/pos/PaymentModal';
import TransactionsView from '../components/pos/TransactionsView';
import VariantSelectionModal from '../components/pos/VariantSelectionModal';
import { NAV_ITEMS } from '../components/pos/BottomNav';
import { X, LogOut, Menu } from 'lucide-react';
import { createOrder } from '../services/orderService';

const PosView = () => {
  const [cartItems, setCartItems] = useState([]);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('pago');
  const [selectedProductForVariant, setSelectedProductForVariant] = useState(null);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const addToCart = (product, variant) => {
    const cartItemId = variant ? `${product.id}-${variant.id}` : product.id;
    const itemPrice = variant ? product.price + (variant.price_modifier || 0) : product.price;
    const itemName = variant ? `${product.name} (${variant.name})` : product.name;
    
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
        price: itemPrice, 
        quantity: 1, 
        variant: variant || null 
      }];
    });
  };

  const handleProductClick = (product) => {
    if (product.variants && product.variants.length > 0 && product.variants.some(v => v.is_active)) {
      setSelectedProductForVariant(product);
      return;
    }
    addToCart(product, null);
  };

  const handleVariantSelect = (variant) => {
    if (selectedProductForVariant) {
      addToCart(selectedProductForVariant, variant);
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
    setCartItems(prev => prev.filter(i => i.cartItemId !== cartItemId));
  };

  const handleNewOrder = () => {
    setCartItems([]);
    setIsMobileCartOpen(false);
  };

  const handleCharge = () => {
    setIsPaymentModalOpen(true);
  };

  const handlePaymentConfirm = async (method) => {
    try {
      const subtotal = cartItems.reduce((acc, i) => acc + (i.price * i.quantity), 0);
      const tax = Math.round(subtotal * 0.19);
      const total = subtotal + tax;
      
      const order = await createOrder(cartItems, method, total, subtotal, tax);
      
      setCartItems([]);
      setIsMobileCartOpen(false);
      return order;
    } catch (error) {
      console.error('Error creating order:', error);
      alert(`Hubo un error al procesar el pago: ${error.message || JSON.stringify(error)}`);
    }
  };

  const totalQty = cartItems.reduce((acc, i) => acc + i.quantity, 0);
  const subtotal = cartItems.reduce((acc, i) => acc + (i.price * i.quantity), 0);
  const total = subtotal + Math.round(subtotal * 0.19);

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
        onClose={() => setSelectedProductForVariant(null)}
        product={selectedProductForVariant}
        onSelectVariant={handleVariantSelect}
      />
    </div>
  );
};

export default PosView;
