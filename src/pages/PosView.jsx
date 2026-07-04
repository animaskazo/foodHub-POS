import React, { useState } from 'react';
import ProductGrid from '../components/pos/ProductGrid';
import CartPanel from '../components/pos/CartPanel';
import BottomNav from '../components/pos/BottomNav';
import PaymentModal from '../components/pos/PaymentModal';
import TransactionsView from '../components/pos/TransactionsView';
import VariantSelectionModal from '../components/pos/VariantSelectionModal';
import { createOrder } from '../services/orderService';

const PosView = () => {
  const [cartItems, setCartItems] = useState([]);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('pago');
  const [selectedProductForVariant, setSelectedProductForVariant] = useState(null);

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
  };

  const handleCharge = () => {
    setIsPaymentModalOpen(true);
  };

  const handlePaymentConfirm = async (method) => {
    try {
      const subtotal = cartItems.reduce((acc, i) => acc + (i.price * i.quantity), 0);
      const tax = Math.round(subtotal * 0.19);
      const total = subtotal + tax;
      
      await createOrder(cartItems, method, total, subtotal, tax);
      
      setCartItems([]);
      setIsPaymentModalOpen(false);
    } catch (error) {
      console.error('Error creating order:', error);
      alert(`Hubo un error al procesar el pago: ${error.message || JSON.stringify(error)}`);
    }
  };

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden">
      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'pago' && (
          <div className="flex h-full overflow-hidden">
            {/* Left Panel: Product Grid (60% width) */}
            <div className="w-[60%] overflow-hidden">
              <ProductGrid
                onProductClick={handleProductClick}
                cartItems={cartItems}
              />
            </div>

            {/* Right Panel: Cart (40% width) */}
            <div className="w-[40%] overflow-hidden">
              <CartPanel
                cartItems={cartItems}
                onRemove={handleRemove}
                onUpdateQty={handleUpdateQty}
                onCharge={handleCharge}
                onNewOrder={handleNewOrder}
              />
            </div>
          </div>
        )}
        
        {activeTab === 'transacciones' && (
          <TransactionsView />
        )}

        {/* Placeholders for other tabs */}
        {activeTab !== 'pago' && activeTab !== 'transacciones' && (
          <div className="flex flex-col items-center justify-center h-full bg-gray-50 text-gray-400">
            <p className="text-xl font-medium">Vista de {activeTab} en desarrollo</p>
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
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
