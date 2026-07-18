import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import PublicHeader from '../components/public/PublicHeader';
import MenuSection from '../components/public/MenuSection';
import CartSummary from '../components/public/CartSummary';
import CheckoutForm from '../components/public/CheckoutForm';
import OrderConfirmation from '../components/public/OrderConfirmation';
import OrderError from '../components/public/OrderError';
import ProductDetailView from '../components/public/ProductDetailView';
import { getOrganizationByName, getPublicCatalog, createPublicOrder } from '../services/publicOrderService';
import { supabase } from '../lib/supabase';

const OrderView = () => {
  const { slug } = useParams();
  const searchParams = new URLSearchParams(window.location.search);
  
  let initialStep = 1;
  if (searchParams.get('orderId')) {
    initialStep = searchParams.get('status') === 'error' ? 5 : 4;
  }
  
  const [step, setStep] = useState(initialStep); // 1: menu, 2: cart, 3: checkout, 4: confirmation, 5: error

  // Data
  const [org, setOrg] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Cart
  const [cartItems, setCartItems] = useState(() => {
    try {
      const saved = localStorage.getItem(`cart_${slug}`);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Error loading cart:', e);
    }
    return [];
  });
  const [editingCartItem, setEditingCartItem] = useState(null);

  useEffect(() => {
    localStorage.setItem(`cart_${slug}`, JSON.stringify(cartItems));
  }, [cartItems, slug]);

  // Submitted order
  const [submittedOrder, setSubmittedOrder] = useState(() => {
    const orderId = searchParams.get('orderId');
    const orderNumberStr = searchParams.get('orderNumber');
    if (orderId && orderNumberStr) {
      return { id: orderId, order_number: orderNumberStr };
    }
    return null;
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const handleReturn = async () => {
      const orderId = searchParams.get('orderId');
      const status = searchParams.get('status');
      
      if (!orderId) return;

      if (status === 'error') {
        // Just clean URL for error, state is already step 5
        window.history.replaceState({}, '', `/order/${slug}`);
        return;
      }

      if (status === 'success' && !submittedOrder?.order_number) {
        // Attempt to recover pending order
        try {
          const pendingData = localStorage.getItem(`pending_order_${slug}`);
          if (pendingData) {
            setIsSubmitting(true);
            const { cartItems: pendingCart, customerForm, totalAmount } = JSON.parse(pendingData);
            
            // Only create if we have the org loaded or we can wait
            // Since this runs on mount, org might be null. 
            // We should ensure org is loaded before creating.
          }
        } catch (e) {
          console.error(e);
        }
      }
    };
    handleReturn();
  }, []);

  // Load Klap Checkout Flex JS library dynamically (Once only)
  useEffect(() => {
    const scriptId = 'klap-flex-checkout-script';
    if (document.getElementById(scriptId)) return;

    const isSandbox = window.location.hostname.includes('localhost') || 
                      window.location.hostname.includes('sandbox') || 
                      window.location.hostname.includes('127.0.0.1') ||
                      window.location.hostname.includes('digital-solutions.work');
    const scriptUrl = isSandbox 
      ? "https://sandbox.mcdesaqa.cl/pagos/checkout-flex/v1/main.min.js" 
      : "https://klap.cl/pagos/checkout-flex/v1/main.min.js";

    const script = document.createElement('script');
    script.id = scriptId;
    script.src = scriptUrl;
    script.type = "text/javascript";
    script.async = true;
    document.body.appendChild(script);
  }, []);

  // ── Load catalog ──────────────────────────────────────────
  // ── Load catalog and handle return ────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const orgData = await getOrganizationByName(slug);
        if (!orgData) {
          setError('No encontramos este local. Verifica el enlace.');
          return;
        }
        setOrg(orgData);

        const { categories: cats, products: prods } = await getPublicCatalog(orgData.id);
        setCategories(cats);
        setProducts(prods);
        
        // Handle Return from Klap Success (Requires orgData)
        const orderId = searchParams.get('orderId');
        const status = searchParams.get('status');
        
        if (orderId && status === 'success') {
          const pendingData = localStorage.getItem(`pending_order_${slug}`);
          if (pendingData) {
            const { cartItems: pendingCart, customerForm } = JSON.parse(pendingData);
            const order = await createPublicOrder({
              organizationId: orgData.id,
              cartItems: pendingCart,
              customer: customerForm.customer,
              notes: customerForm.notes,
              paymentMethod: 'online',
              paymentStatus: 'paid'
            });
            
            setSubmittedOrder({ id: orderId, order_number: order.order_number });
            setCartItems([]);
            localStorage.removeItem(`cart_${slug}`);
            localStorage.removeItem(`pending_order_${slug}`);
            window.history.replaceState({}, '', `/order/${slug}?orderId=${orderId}&orderNumber=${order.order_number}&status=success`);
          }
        }
        
      } catch (e) {
        console.error(e);
        setError('Error al cargar el menú. Intenta nuevamente.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [slug]);

  // ── Cart operations ───────────────────────────────────────
  const handleAddItem = useCallback((product) => {
    setCartItems(prev => {
      // Check if same product + same variant + same extras + same combo options
      const variantId = product.variant?.id || null;
      const extraIds = (product.selectedIngredients || []).map(i => i.id).sort().join(',');
      const optionIds = (product.selectedOptions || []).map(o => `${o.optionId}-${o.variant?.id || ''}-${(o.selectedIngredients || []).map(x => x.id).sort().join(',')}`).sort().join('|');

      const existing = prev.find(i =>
        i.id === product.id &&
        (i.variant?.id || null) === variantId &&
        (i.selectedIngredients || []).map(x => x.id).sort().join(',') === extraIds &&
        (i.selectedOptions || []).map(o => `${o.optionId}-${o.variant?.id || ''}-${(o.selectedIngredients || []).map(x => x.id).sort().join(',')}`).sort().join('|') === optionIds
      );

      if (existing) {
        return prev.map(i =>
          i.cartItemId === existing.cartItemId
            ? { ...i, quantity: i.quantity + (product.quantity || 1) }
            : i
        );
      }

      return [...prev, {
        ...product,
        cartItemId: `${product.id}-${Date.now()}-${Math.random()}`,
        quantity: product.quantity || 1,
        selectedIngredients: product.selectedIngredients || [],
        variant: product.variant || null,
        selectedOptions: product.selectedOptions || null,
      }];
    });
  }, []);

  const handleUpdateQty = useCallback((cartItemId, newQty) => {
    if (newQty <= 0) {
      setCartItems(prev => prev.filter(i => i.cartItemId !== cartItemId));
    } else {
      setCartItems(prev => prev.map(i =>
        i.cartItemId === cartItemId ? { ...i, quantity: newQty } : i
      ));
    }
  }, []);

  const handleRemoveItem = useCallback((cartItemId) => {
    setCartItems(prev => prev.filter(i => i.cartItemId !== cartItemId));
  }, []);

  // ── Checkout ──────────────────────────────────────────────
  const handleCheckout = async (customerForm) => {
    setIsSubmitting(true);
    try {
      if (customerForm.paymentMethod === 'online') {
        const totalAmount = cartItems.reduce((acc, item) => {
          const itemGross = Math.round(item.price * 1.19);
          const extrasGross = (item.selectedIngredients || []).reduce((s, i) => s + (i.price || 0), 0);
          return acc + (itemGross + extrasGross) * item.quantity;
        }, 0);

        const tempOrderId = crypto.randomUUID();
        const returnUrl = encodeURI(window.location.origin + `/order/${slug}?orderId=${tempOrderId}&status=success`);
        
        // Save pending order locally
        localStorage.setItem(`pending_order_${slug}`, JSON.stringify({
          cartItems,
          customerForm: {
            customer: {
              name: customerForm.name,
              phone: customerForm.phone,
              email: customerForm.email,
            },
            notes: customerForm.notes
          },
          totalAmount
        }));

        const { data, error } = await supabase.functions.invoke('klap-create-payment', {
          body: { orderId: tempOrderId, amount: totalAmount, returnUrl }
        });

        if (error || !data?.success) {
          throw new Error(error?.message || data?.error || 'Error al iniciar pago con Klap');
        }

        if (window.KLAP_FLEX && data.klap_order_id) {
          window.KLAP_FLEX.init({
            orderId: data.klap_order_id,
            useModal: true
          });
        } else {
          window.location.href = data.redirect_url;
        }
        return; 
      }

      // Offline flow
      const order = await createPublicOrder({
        organizationId: org.id,
        cartItems,
        customer: {
          name: customerForm.name,
          phone: customerForm.phone,
          email: customerForm.email,
        },
        notes: customerForm.notes,
        paymentMethod: 'cash',
        paymentStatus: 'pending'
      });

      setSubmittedOrder(order);
      setCartItems([]);
      localStorage.removeItem(`cart_${slug}`);
      setStep(4);
    } catch (e) {
      console.error(e);
      alert('Error al enviar el pedido. Intenta nuevamente. ' + (e.message || ''));
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Navigation ────────────────────────────────────────────
  const handleBack = () => setStep(s => Math.max(1, s - 1));

  const totalCartQty = cartItems.reduce((s, i) => s + i.quantity, 0);

  // ── Render ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-gray-200 border-t-black animate-spin" />
          <p className="text-gray-500 font-medium">Cargando menú…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">😕</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Página no encontrada</h1>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  const totalAmount = cartItems.reduce((acc, item) => {
    const itemGross = Math.round(item.price * 1.19);
    const extrasGross = (item.selectedIngredients || []).reduce((s, i) => s + (i.price || 0), 0);
    return acc + (itemGross + extrasGross) * item.quantity;
  }, 0);

  return (
    <div className="min-h-[100dvh] bg-gray-200/40 flex flex-col justify-start items-center">
      {/* Set page title */}
      <title>{org?.name ? `${org.name} · Pedidos` : 'Pedir en línea'}</title>

      {/* Centered Mobile App Frame for Desktop */}
      <div className="w-full max-w-3xl mx-auto flex-1 flex flex-col bg-white md:shadow-[0_0_60px_rgba(0,0,0,0.05)] md:min-h-[100dvh] relative">
        <PublicHeader
        org={org}
        cartCount={totalCartQty}
        step={step}
        onBack={handleBack}
      />

      <div className="flex-1 flex flex-col min-h-0">
        {step === 1 && (
          <MenuSection
            org={org}
            categories={categories}
            products={products}
            cartItems={cartItems}
            onAddItem={handleAddItem}
            onUpdateQty={handleUpdateQty}
            onRemoveItem={handleRemoveItem}
            onViewCart={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <CartSummary
            cartItems={cartItems}
            onUpdateQty={handleUpdateQty}
            onRemove={handleRemoveItem}
            onEditItem={(item) => setEditingCartItem(item)}
            onCheckout={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <CheckoutForm
            onSubmit={handleCheckout}
            isSubmitting={isSubmitting}
            totalAmount={totalAmount}
            acceptsOnlinePayments={org?.online_payments_allowed === true && org?.accepts_online_payments !== false}
            organizationId={org?.id}
          />
        )}
        {step === 4 && (
          <OrderConfirmation
            order={submittedOrder}
            org={org}
          />
        )}
        {step === 5 && (
          <OrderError 
            onRetry={() => {
              window.history.replaceState({}, '', `/order/${slug}`);
              setStep(2);
            }} 
          />
        )}
      </div>

      {editingCartItem && (
        <ProductDetailView
          product={editingCartItem}
          initialVariant={editingCartItem.variant}
          initialExtras={editingCartItem.selectedIngredients}
          initialQuantity={editingCartItem.quantity}
          onAdd={(updatedFields) => {
            setCartItems(prev => prev.map(item => 
              item.cartItemId === editingCartItem.cartItemId 
                ? { 
                    ...item, 
                    price: updatedFields.price, 
                    variant: updatedFields.variant, 
                    selectedIngredients: updatedFields.selectedIngredients, 
                    quantity: updatedFields.quantity 
                  }
                : item
            ));
            setEditingCartItem(null);
          }}
          onBack={() => setEditingCartItem(null)}
        />
      )}
      </div>
    </div>
  );
};

export default OrderView;
