import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import PublicHeader from '../components/public/PublicHeader';
import MenuSection from '../components/public/MenuSection';
import CartSummary from '../components/public/CartSummary';
import CheckoutForm from '../components/public/CheckoutForm';
import OrderConfirmation from '../components/public/OrderConfirmation';
import OrderError from '../components/public/OrderError';
import ProductDetailView from '../components/public/ProductDetailView';
import { getOrganizationByName, getPublicCatalog, createPublicOrder } from '../services/publicOrderService';
import { getAccessToken, createQuote, createDelivery } from '../services/uberDirectService';
import { geocodeAddress } from '../utils/geo';
import { sendEmail } from '../services/emailService';
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
  const [isOpen, setIsOpen] = useState(true);

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
          const { getPublicOrderById } = await import('../services/publicOrderService');
          const orderData = await getPublicOrderById(orderId);
          if (orderData) {
            setSubmittedOrder(orderData);
            setCartItems([]);
            localStorage.removeItem(`cart_${slug}`);
            setStep(4);

            // Send confirmation email after Klap payment
            const { data: customerData } = await supabase
              .from('customers')
              .select('email')
              .eq('organization_id', orgData.id)
              .eq('phone', orderData.customer_phone)
              .maybeSingle()
            if (customerData?.email) {
              const items = (orderData.order_items || [])
                .filter(item => !item.parent_item_id)
                .map(item => ({
                  product_name: item.product_name,
                  quantity: item.quantity,
                  total_price: item.total_price,
                }))
              sendEmail({
                type: 'order_confirmed',
                email: customerData.email,
                data: {
                  order_number: orderData.order_number,
                  delivery_type: orderData.delivery_type,
                  delivery_address: orderData.delivery_address,
                  customer_name: orderData.customer_name || 'Cliente',
                  total: orderData.total,
                  subtotal: orderData.total - (orderData.delivery_fee || 0),
                  delivery_fee: orderData.delivery_fee || 0,
                  uber_tracking_url: orderData.uber_tracking_url,
                  payment_method: 'online_gateway',
                  items,
                  branch: { name: orgData.name, address: orgData.address || '' },
                  organization: { name: orgData.name, logo_url: orgData.logo_url || null },
                },
              })
            }

            window.history.replaceState({}, '', `/order/${slug}`);
          } else {
            setError('No se pudo cargar la información del pedido.');
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

  // ── Calculate isOpen ──────────────────────────────────────
  useEffect(() => {
    if (!org || !org.business_hours) return;
    
    const checkIsOpen = () => {
      const now = new Date();
      const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
      const todayStr = days[now.getDay()];
      const todayHours = org.business_hours[todayStr];
      
      if (!todayHours || todayHours.closed) return false;
      
      const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();
      const parseTime = (timeStr) => {
        if (!timeStr) return 0;
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
      };
      
      const openMinutes = parseTime(todayHours.open);
      const closeMinutes = parseTime(todayHours.close);
      
      if (closeMinutes < openMinutes) { // midnight cross
        return currentTotalMinutes >= openMinutes || currentTotalMinutes <= closeMinutes;
      }
      return currentTotalMinutes >= openMinutes && currentTotalMinutes <= closeMinutes;
    };

    setIsOpen(checkIsOpen());
    const interval = setInterval(() => setIsOpen(checkIsOpen()), 60000);
    return () => clearInterval(interval);
  }, [org]);

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
    const scheduledAt = customerForm.scheduleType === 'scheduled' && customerForm.scheduledAt ? customerForm.scheduledAt : null;
    const scheduledAtMs = scheduledAt ? new Date(scheduledAt).getTime() : null;
    const deliveryWindow = scheduledAtMs ? (() => {
      const t = scheduledAtMs;
      const now = Date.now();
      const pickupReady = Math.max(t - 30 * 60000, now + 15 * 60000);
      const pickupDeadline = Math.max(t, pickupReady + 30 * 60000);
      return {
        pickup_ready_dt: new Date(pickupReady).toISOString(),
        pickup_deadline_dt: new Date(pickupDeadline).toISOString(),
        dropoff_ready_dt: new Date(t).toISOString(),
        dropoff_deadline_dt: new Date(Math.max(t + 60 * 60000, pickupReady + 90 * 60000)).toISOString(),
      };
    })() : null;
    try {
      // First, create the order in the database with status pending
      const order = await createPublicOrder({
        organizationId: org.id,
        cartItems,
        customer: {
          name: customerForm.name,
          phone: customerForm.phone,
          email: customerForm.email,
        },
        notes: customerForm.notes,
        paymentMethod: customerForm.paymentMethod === 'online' ? 'online_gateway' : 'cash',
        paymentStatus: 'pending',
        deliveryType: customerForm.deliveryType,
        deliveryAddress: customerForm.deliveryAddress,
        deliveryFee: customerForm.deliveryFee,
        scheduledAt,
      });

      // ── Uber Direct: create delivery if mode is uber_direct (immediate or scheduled) ──
      if (org.delivery_mode === 'uber_direct' && org.uber_enabled !== false && customerForm.deliveryType === 'delivery') {
        try {
          const tokenRes = await getAccessToken(org.uber_client_id, org.uber_client_secret)
          const token = tokenRes.access_token

          let dropoffCoords = customerForm.deliveryCoords
          if (!dropoffCoords || !dropoffCoords.address) {
            const fresh = await geocodeAddress(customerForm.deliveryAddress)
            dropoffCoords = fresh || dropoffCoords
          }

          const city = dropoffCoords?.address?.city || dropoffCoords?.address?.town || dropoffCoords?.address?.village || dropoffCoords?.address?.county || 'Santiago'
          const zip = dropoffCoords?.address?.postcode || ''
          const state = dropoffCoords?.address?.state || 'RM'

          const pickupAddr = {
            street_address: [org.address || 'Dirección del local'],
            state,
            city,
            zip_code: zip,
            country: 'CL',
          }
          const dropoffAddr = {
            street_address: [customerForm.deliveryAddress],
            state,
            city,
            zip_code: zip,
            country: 'CL',
          }

          let pickupLat = org.store_lat
          let pickupLng = org.store_lng
          if (!pickupLat || !pickupLng) {
            const cleanAddr = (org.address || '')
              .replace(/\s+(LOCAL|DEPTO|OF|DPTO|CASA|PISO)\s*\d+/gi, '')
              .replace(/^(Calle|Av\.?|Avda\.?|Pasaje|Pje\.?|Camino)\s+/i, '')
              .replace(/,?\s*\d{5,}\s*/g, ',')
              .replace(/\s*,\s*CL$/i, '')
              .replace(/,+/g, ',')
              .split(',').map(s => s.trim()).filter(Boolean).slice(0, 2).join(', ')
              .trim()
            const orgCoords = await geocodeAddress(cleanAddr ? cleanAddr + ', Chile' : 'Villa Alemana, Chile')
            if (orgCoords) {
              pickupLat = orgCoords.lat
              pickupLng = orgCoords.lng
            }
          }

          const normalizePhone = (phone) => {
            if (!phone) return ''
            let n = (phone || '').replace(/^0+/, '').replace(/[^\d+]/g, '')
            if (n.startsWith('+')) return n
            if (n.startsWith('56')) return `+${n}`
            return `+56${n}`
          }
          const normalizedPickupPhone = normalizePhone(org.phone)

          let quoteId = scheduledAt ? null : customerForm.quoteId
          if (!quoteId) {
            const quote = await createQuote(org.uber_customer_id, token, {
              external_store_id: org.id,
              pickup_address: JSON.stringify(pickupAddr),
              dropoff_address: JSON.stringify(dropoffAddr),
              pickup_latitude: pickupLat,
              pickup_longitude: pickupLng,
              dropoff_latitude: dropoffCoords?.lat,
              dropoff_longitude: dropoffCoords?.lng,
              pickup_phone_number: normalizedPickupPhone,
              dropoff_phone_number: normalizePhone(customerForm.phone),
              manifest_items: cartItems.map(item => ({
                name: item.product_name || item.name || 'Producto',
                quantity: item.quantity || 1,
                value: item.price || 0,
              })),
              ...(deliveryWindow || {}),
            })
            quoteId = quote.id
          }

          const delivery = await createDelivery(org.uber_customer_id, token, {
            quote_id: quoteId,
            external_store_id: org.id,
            pickup_address: JSON.stringify(pickupAddr),
            pickup_name: org.name,
            pickup_phone_number: normalizedPickupPhone,
            pickup_latitude: pickupLat,
            pickup_longitude: pickupLng,
            dropoff_address: JSON.stringify(dropoffAddr),
            dropoff_name: customerForm.name,
            dropoff_phone_number: normalizePhone(customerForm.phone),
            dropoff_latitude: dropoffCoords?.lat,
            dropoff_longitude: dropoffCoords?.lng,
            manifest_items: cartItems.map(item => ({
              name: item.product_name || item.name || 'Producto',
              quantity: item.quantity || 1,
              value: item.price || 0,
            })),
            ...(deliveryWindow || {}),
          })

          const deliveryFee = delivery.fee ? ((delivery.currency || '').toUpperCase() === 'CLP' ? Math.round(delivery.fee / 100) : delivery.fee / 100) : customerForm.deliveryFee
          const adjustedTotal = order.total - (customerForm.deliveryFee || 0) + deliveryFee

          const { error: updateError } = await supabase
            .from('orders')
            .update({
              uber_delivery_id: delivery.id,
              uber_tracking_url: delivery.tracking_url,
              uber_status: delivery.status,
              delivery_fee: deliveryFee,
              total: adjustedTotal,
            })
            .eq('id', order.id)

          if (!updateError) {
            order.uber_delivery_id = delivery.id
            order.uber_tracking_url = delivery.tracking_url
            order.uber_status = delivery.status
            order.delivery_fee = deliveryFee
            order.total = adjustedTotal
          } else {
            console.error('[Uber] Failed to update order with delivery info:', updateError)
          }
        } catch (uberError) {
          console.error('Uber Direct delivery creation failed:', uberError)
        }
      }

      const finalDeliveryFee = order.delivery_fee || customerForm.deliveryFee || 0

      if (customerForm.paymentMethod === 'online') {
        const returnUrl = window.location.origin + `/order/${slug}?orderId=${order.id}&status=success`;

        const { data, error } = await supabase.functions.invoke('klap-create-payment', {
          body: { orderId: order.id, amount: order.total, returnUrl }
        });

        if (error || !data?.success) {
          const klapDetails = data?.details ? JSON.stringify(data.details) : '';
          const errMsg = `${data?.error || error?.message || 'Error desconocido'}${klapDetails ? ` | Klap: ${klapDetails}` : ''}`;
          console.error('[Klap Debug] Full error:', errMsg);
          throw new Error(errMsg);
        }

        if (data.redirect_url) {
          window.location.href = data.redirect_url;
        } else {
          throw new Error('Klap no retornó una URL de pago válida');
        }
        return; 
      }

      // Send confirmation email (offline flow only)
      if (customerForm.email) {
        const items = cartItems.map(item => ({
          product_name: item.name + (item.variant ? ` (${item.variant.name})` : ''),
          quantity: item.quantity,
          total_price: item.price * item.quantity,
          image_url: item.image || item.image_url || item.imageUrl || null,
        }))
        sendEmail({
          type: 'order_confirmed',
          email: customerForm.email,
          data: {
            order_number: order.order_number,
            delivery_type: customerForm.deliveryType,
            delivery_address: customerForm.deliveryAddress,
            customer_name: customerForm.name || 'Cliente',
            total: order.total,
            subtotal: order.total - finalDeliveryFee,
            delivery_fee: finalDeliveryFee,
            uber_tracking_url: order.uber_tracking_url,
            payment_method: 'cash',
            items,
            branch: { name: org.name, address: org.address || '' },
            organization: { name: org.name, logo_url: org.logo_url || null },
          },
        })
      }

      // Send WhatsApp with tracking link (offline flow only)
      if (order.uber_tracking_url && customerForm.phone) {
        try {
          const { sendWhatsApp } = await import('../services/whatsappService')
          const greeting = customerForm.name ? `¡Hola, ${customerForm.name.split(' ')[0]}! 👋` : '¡Hola! 👋'
          await sendWhatsApp({
            organizationId: org.id,
            phone: customerForm.phone,
            fromNumber: org.whatsapp_phone_number_id,
            message: `${greeting}\n\nTu pedido *${order.order_number}* en *${org.name}* fue recibido y está siendo preparado. 🎉\n\n🛵 *Sigue tu delivery en vivo:*\n${order.uber_tracking_url}`,
          })
        } catch (wpErr) {
          console.error('WhatsApp notification failed:', wpErr)
        }
      }

      setSubmittedOrder(order);
      setCartItems([]);
      localStorage.removeItem(`cart_${slug}`);
      setStep(4);
    } catch (e) {
      console.error(e);
      if (e.message && e.message.includes('violates foreign key constraint')) {
        alert('Lo sentimos, uno o más productos de tu carrito ya no están disponibles. Tu carrito ha sido actualizado.');
        setCartItems([]);
        localStorage.removeItem(`cart_${slug}`);
        setStep(1);
      } else {
        alert('Error al enviar el pedido. Intenta nuevamente. ' + (e.message || ''));
      }
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
          <div className="w-12 h-12 border-4 border-gray-200 border-t-black animate-spin rounded-full" />
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
    let unitPrice = Math.round(item.price);
    if (item.selectedIngredients) {
      unitPrice += item.selectedIngredients.reduce((s, i) => s + (i.price || 0), 0);
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
    return acc + unitPrice * item.quantity;
  }, 0);

  return (
    <div className="min-h-[100dvh] bg-gray-200/40 flex flex-col justify-start items-center">
      <Helmet>
        <title>{org?.name ? `${org.name} · Pedidos` : 'Pedir en línea'}</title>
        {org && (
          <>
            <meta name="description" content={org.description || `Pide online en ${org.name}`} />
            <meta property="og:title" content={org.name} />
            <meta property="og:description" content={org.description || `Pide online en ${org.name}`} />
            <meta property="og:image" content={org.logo_url || org.cover_url} />
            <meta property="og:url" content={`${window.location.origin}/order/${slug}`} />
            <meta property="og:type" content="website" />
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content={org.name} />
            <meta name="twitter:description" content={org.description || `Pide online en ${org.name}`} />
            <meta name="twitter:image" content={org.logo_url || org.cover_url} />
          </>
        )}
      </Helmet>

      {/* Centered Mobile App Frame for Desktop */}
      <div className="w-full max-w-3xl mx-auto flex-1 flex flex-col bg-white md:shadow-[0_0_60px_rgba(0,0,0,0.05)] md:min-h-[100dvh] relative">
        <PublicHeader
          org={org}
          cartCount={totalCartQty}
          step={step}
          onBack={handleBack}
          isOpen={isOpen}
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
            isOpen={isOpen}
          />
        )}
        {step === 2 && (
          <CartSummary
            cartItems={cartItems}
            onUpdateQty={handleUpdateQty}
            onRemove={handleRemoveItem}
            onEditItem={(item) => setEditingCartItem(item)}
            onCheckout={() => setStep(3)}
            isOpen={isOpen}
          />
        )}
        {step === 3 && (
          <CheckoutForm
            onSubmit={handleCheckout}
            isSubmitting={isSubmitting}
            totalAmount={totalAmount}
            acceptsOnlinePayments={org?.online_payments_allowed === true && org?.accepts_online_payments !== false}
            organizationId={org?.id}
            isOpen={isOpen}
            org={org}
            cartItems={cartItems}
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
