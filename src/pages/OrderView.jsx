import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import PublicHeader from '../components/public/PublicHeader';
import MenuSection from '../components/public/MenuSection';
import CartSummary from '../components/public/CartSummary';
import CheckoutForm from '../components/public/CheckoutForm';
import OrderConfirmation from '../components/public/OrderConfirmation';
import { getOrganizationByName, getPublicCatalog, createPublicOrder } from '../services/publicOrderService';

const OrderView = () => {
  const { slug } = useParams();
  const [step, setStep] = useState(1); // 1: menu, 2: cart, 3: checkout, 4: confirmation

  // Data
  const [org, setOrg] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Cart
  const [cartItems, setCartItems] = useState([]);

  // Submitted order
  const [submittedOrder, setSubmittedOrder] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Load catalog ──────────────────────────────────────────
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
      // Check if same product + same variant + same extras
      const variantId = product.variant?.id || null;
      const extraIds = (product.selectedIngredients || []).map(i => i.id).sort().join(',');

      const existing = prev.find(i =>
        i.id === product.id &&
        (i.variant?.id || null) === variantId &&
        (i.selectedIngredients || []).map(x => x.id).sort().join(',') === extraIds
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
      const order = await createPublicOrder({
        organizationId: org.id,
        cartItems,
        customer: {
          name: customerForm.name,
          phone: customerForm.phone,
          email: customerForm.email,
        },
        notes: customerForm.notes,
      });
      setSubmittedOrder(order);
      setStep(4);
    } catch (e) {
      console.error(e);
      alert('Error al enviar el pedido. Intenta nuevamente.');
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

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Set page title */}
      <title>{org?.name ? `${org.name} · Pedidos` : 'Pedir en línea'}</title>

      <PublicHeader
        org={org}
        cartCount={totalCartQty}
        step={step}
        onBack={handleBack}
      />

      <div className="flex-1 flex flex-col min-h-0">
        {step === 1 && (
          <MenuSection
            categories={categories}
            products={products}
            cartItems={cartItems}
            onAddItem={handleAddItem}
            onViewCart={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <CartSummary
            cartItems={cartItems}
            onUpdateQty={handleUpdateQty}
            onRemove={handleRemoveItem}
            onCheckout={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <CheckoutForm
            onSubmit={handleCheckout}
            isSubmitting={isSubmitting}
          />
        )}
        {step === 4 && (
          <OrderConfirmation
            order={submittedOrder}
            cartItems={cartItems}
            org={org}
          />
        )}
      </div>
    </div>
  );
};

export default OrderView;
