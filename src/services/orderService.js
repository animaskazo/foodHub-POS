import { supabase } from '../lib/supabase';
import { checkInventoryStock, deductInventoryForOrder } from './inventoryService';
import { upsertCustomerForOrder } from './customerService';
import { getCartItemUnitPrice, getBundleOptionUnitPrice } from '../utils/cartTotals';

// Una orden sigue "abierta" para el POS mientras su estado esté en esta lista.
export const OPEN_ORDER_STATUSES = ['pending', 'confirmed', 'preparing', 'ready'];

// Estados de pago que consideran una orden cobrada.
export const PAID_PAYMENT_STATUSES = ['paid', 'completed'];

// Una orden está "abierta" para el POS si su estado es activo Y no tiene pago
// confirmado. El estado por sí solo no alcanza: `createOrder` deja la orden en
// 'confirmed' aunque ya esté pagada, y el cobro de mesa nunca avanza el estado a
// 'delivered'. Sin este filtro, una mesa cobrada seguiría apareciendo ocupada y
// su venta volvería a cargarse al carrito.
export const isOrderOpen = (order) =>
  !!order &&
  OPEN_ORDER_STATUSES.includes(order.status) &&
  !(order.payments || []).some((p) => PAID_PAYMENT_STATUSES.includes(p.status));

export const getOpenOrders = (orders = []) => (orders || []).filter(isOrderOpen);

export const sumOpenOrdersTotal = (orders = []) =>
  getOpenOrders(orders).reduce((acc, o) => acc + Number(o.total || 0), 0);

export const createOrder = async (cartItems, paymentMethod, orderType, total, subtotal, tax, deliveryInfo = null, orderNotes = '', deliveryFee = 0, tableId = null, discountAmount = 0, couponId = null) => {
  try {
    // 1. Get the current logged-in user's organization and branch
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("No hay sesión activa.");

    const { data: staffData } = await supabase
      .from('staff')
      .select('organization_id')
      .eq('id', session.user.id)
      .single();

    if (!staffData) throw new Error("El usuario no está asignado a ninguna organización.");
    const organizationId = staffData.organization_id;

    // Get the first branch for this specific organization
    const { data: branchData, error: branchError } = await supabase
      .from('branches')
      .select('id')
      .eq('organization_id', organizationId)
      .limit(1)
      .single();

    if (branchError || !branchData) throw new Error("No branch found for this organization. " + (branchError?.message || ''));
    const branchId = branchData.id;

    // 2b. Check inventory stock before creating order
    await checkInventoryStock(cartItems);

    // 3. Generate an order number sequentially per branch
    // (Handled automatically by database trigger `set_order_number_trigger`)

    // 3. Insert order
    const dbOrderType = orderType === 'table' ? 'table' : (['online', 'whatsapp'].includes(orderType) ? orderType : 'pickup');
    const deliveryType = orderType === 'delivery' || (deliveryInfo && (deliveryInfo.deliveryAddress || deliveryInfo.customerName)) ? 'delivery' : 'pickup';

    const orderPayload = {
      organization_id: organizationId,
      branch_id: branchId,
      order_type: dbOrderType,
      delivery_type: deliveryType,
      status: 'confirmed', 
      subtotal: subtotal,
      tax_amount: tax,
      total: total,
      discount_amount: discountAmount || 0,
      coupon_id: couponId || null,
      notes: orderNotes,
      delivery_fee: deliveryFee,
      table_id: tableId
    };
    
    if (deliveryInfo) {
      orderPayload.customer_name = deliveryInfo.customerName;
      orderPayload.customer_phone = deliveryInfo.customerPhone;
      orderPayload.delivery_address = deliveryInfo.deliveryAddress;
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert([orderPayload])
      .select()
      .single();

    if (orderError) throw orderError;
    
    // Set a flag in localStorage to identify that this device just created this order
    try {
      localStorage.setItem('last_pos_order_id', order.id);
      localStorage.setItem('last_pos_order_time', Date.now().toString());
    } catch(e) {}

    // 4. Insert order items & their variants/ingredients
    for (const item of cartItems) {
      const lineUnitPrice = getCartItemUnitPrice(item);
      // Insert parent item
      const { data: insertedItem, error: itemError } = await supabase
        .from('order_items')
        .insert({
          order_id: order.id,
          product_id: item.productId || item.id,
          product_name: item.name,
          quantity: item.quantity,
          unit_price: lineUnitPrice,
          total_price: lineUnitPrice * item.quantity,
        })
        .select()
        .single();

      if (itemError) throw itemError;

      // Insert parent variants
      if (item.variant) {
        const { error: variantError } = await supabase
          .from('order_item_variants')
          .insert({
            order_item_id: insertedItem.id,
            variant_group_id: item.variant.variant_group_id || null,
            variant_option_id: item.variant.id,
            variant_group_name: 'Variantes',
            variant_option_name: item.variant.name,
            price_modifier: item.variant.price_modifier || 0
          });
        if (variantError) console.error("Error inserting parent variant:", variantError);
      }

      // Insert parent ingredients
      if (item.selectedIngredients && item.selectedIngredients.length > 0) {
        const ingredientInserts = item.selectedIngredients.map(ing => ({
          order_item_id: insertedItem.id,
          ingredient_id: ing.id,
          ingredient_name: ing.name,
          price: ing.price || 0
        }));
        const { error: ingError } = await supabase
          .from('order_item_ingredients')
          .insert(ingredientInserts);
        if (ingError) console.error("Error inserting parent ingredients:", ingError);
      }

      // If it is a bundle/combo, insert child options
      // El desglose hijo incluye variante + extras para que sume el total del combo.
      if (item.type === 'bundle' && item.selectedOptions && item.selectedOptions.length > 0) {
        for (const option of item.selectedOptions) {
          const childQty = (option.quantity || 1) * item.quantity;
          const childPrice = getBundleOptionUnitPrice({
            priceModifier: option.priceModifier ?? option.price ?? 0,
            variant: option.variant,
            selectedIngredients: option.selectedIngredients,
          });
          const { data: insertedChild, error: childError } = await supabase
            .from('order_items')
            .insert({
              order_id: order.id,
              product_id: option.productId || option.id,
              product_name: option.name,
              quantity: childQty,
              unit_price: childPrice,
              total_price: childPrice * childQty,
              parent_item_id: insertedItem.id
            })
            .select()
            .single();

          if (childError) {
            console.error("Error inserting child bundle option:", childError);
            continue;
          }

          // Insert child variant (if any)
          if (option.variant) {
            const { error: variantError } = await supabase
              .from('order_item_variants')
              .insert({
                order_item_id: insertedChild.id,
                variant_group_id: option.variant.variant_group_id || null,
                variant_option_id: option.variant.id,
                variant_group_name: 'Variantes',
                variant_option_name: option.variant.name,
                price_modifier: option.variant.price_modifier || 0
              });
            if (variantError) console.error("Error inserting child variant:", variantError);
          }

          // Insert child ingredients (if any)
          if (option.selectedIngredients && option.selectedIngredients.length > 0) {
            const ingredientInserts = option.selectedIngredients.map(ing => ({
              order_item_id: insertedChild.id,
              ingredient_id: ing.id,
              ingredient_name: ing.name,
              price: ing.price || 0
            }));
            const { error: ingError } = await supabase
              .from('order_item_ingredients')
              .insert(ingredientInserts);
            if (ingError) console.error("Error inserting child ingredients:", ingError);
          }
        }
      }
    }

    // 5. Insert payment
    // Map debit/credit to 'card'
    let method = paymentMethod;
    if (method === 'debit' || method === 'credit') method = 'card';

    const paymentStatus = method === 'pending' ? 'pending' : 'paid';
    const paymentMethodToSave = method === 'pending' ? 'cash' : method; // cash as placeholder for pending

    const { error: paymentError } = await supabase
      .from('payments')
      .insert([
        {
          order_id: order.id,
          method: paymentMethodToSave,
          status: paymentStatus,
          amount: total,
          paid_at: paymentStatus === 'paid' ? new Date().toISOString() : null,
        }
      ]);

    if (paymentError) throw paymentError;

    // Update table status if tableId is provided
    if (tableId) {
      await supabase
        .from('restaurant_tables')
        .update({ status: paymentStatus === 'paid' ? 'free' : 'occupied' })
        .eq('id', tableId);
    }

    // 6. Deduct inventory (non-blocking)
    try {
      await deductInventoryForOrder(order.id, organizationId, branchId);
    } catch (invError) {
      console.error("Error deducting inventory:", invError);
    }

    // 7. Save/update customer record and associate with order
    if (deliveryInfo?.customerPhone) {
      try {
        const customerId = await upsertCustomerForOrder(organizationId, {
          phone: deliveryInfo.customerPhone,
          name: deliveryInfo.customerName,
        });
        if (customerId) {
          await supabase.from('orders').update({ customer_id: customerId }).eq('id', order.id);
        }
      } catch (custError) {
        console.error("Error saving customer record:", custError);
        // Non-blocking: order was already created successfully
      }
    }

    return order;
  } catch (error) {
    console.error("Error creating order:", error);
    throw error;
  }
};

let cachedUserBranchId = null;

const getUserBranchId = async () => {
  if (cachedUserBranchId) return cachedUserBranchId;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data: staffData } = await supabase
    .from('staff')
    .select('organization_id')
    .eq('id', session.user.id)
    .single();

  if (!staffData) return null;

  const { data: branchData } = await supabase
    .from('branches')
    .select('id')
    .eq('organization_id', staffData.organization_id)
    .limit(1)
    .single();

  if (branchData?.id) {
    cachedUserBranchId = branchData.id;
  }
  return cachedUserBranchId;
};

// Reset cache on auth state changes
supabase.auth.onAuthStateChange(() => {
  cachedUserBranchId = null;
});

export const getOrders = async (startDate, endDate) => {
  try {
    const branchId = await getUserBranchId();
    if (!branchId) return [];
    
    let query = supabase
      .from('orders')
      .select(`
        id, organization_id, branch_id, order_type, order_number, delivery_type,
        status, subtotal, tax_amount, discount_amount, total, notes,
        estimated_ready_at, confirmed_at, ready_at, delivered_at, cancelled_at,
        created_at, updated_at, table_id, customer_name, customer_phone,
        customer_id, delivery_address, delivery_notes, delivery_fee,
        coupon_id, scheduled_at, uber_delivery_id, uber_tracking_url, uber_status,
        whatsapp_msg_id,
        payments(*),
        order_items(*, order_item_variants(*), order_item_ingredients(*))
      `)
      .eq('branch_id', branchId);

    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Error fetching orders:", error);
    return [];
  }
};

export const getKitchenOrders = async () => {
  try {
    const branchId = await getUserBranchId();
    if (!branchId) return [];
    
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *, discount_amount,
        payments(*),
        restaurant_tables(name, table_zones(name)),
        order_items(*, order_item_variants(variant_option_name), order_item_ingredients(ingredient_name))
      `)
      .eq('branch_id', branchId)
      .in('status', ['scheduled', 'pending', 'confirmed', 'preparing'])
      .order('created_at', { ascending: true });

    if (error) throw error;

    const validOrders = data?.filter(order => {
      if (order.order_type !== 'online' || order.status !== 'pending') return true;
      const hasUnpaidOnlinePayment = order.payments?.some(p => p.method === 'online_gateway' && p.status === 'pending');
      const hasPaidPayment = order.payments?.some(p => p.status === 'paid');
      return !(hasUnpaidOnlinePayment && !hasPaidPayment);
    }) || [];

    return validOrders;
  } catch (error) {
    console.error("Error fetching kitchen orders:", error);
    return [];
  }
};

// Activa pedidos programados cuya hora ya llegó (scheduled/pending -> confirmed)
export const activateDueScheduledOrders = async () => {
  try {
    const { error } = await supabase
      .from('orders')
      .update({ status: 'confirmed' })
      .in('status', ['pending', 'scheduled'])
      .not('scheduled_at', 'is', null)
      .lte('scheduled_at', new Date().toISOString());
    if (error) throw error;
  } catch (error) {
    console.error('Error activating scheduled orders:', error);
  }
};

export const updateOrderStatus = async (orderId, status) => {
  try {
    const updateData = { status };
    if (status === 'ready') {
      updateData.ready_at = new Date().toISOString();
    }
    const { error } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', orderId);

    if (error) throw error;

    // ── Uber Direct: update local status ──
    if ((status === 'ready' || status === 'preparing') && orderId) {
      const { data: uberCheck } = await supabase
        .from('orders')
        .select('uber_delivery_id')
        .eq('id', orderId)
        .single()

      if (uberCheck?.uber_delivery_id) {
        const uberStatus = status === 'ready' ? 'ready' : 'preparing'
        console.log('[Uber] Updating local uber_status to', uberStatus)
        await supabase.from('orders').update({ uber_status: uberStatus }).eq('id', orderId)
      }
    }

    if (status === 'ready') {
      // Fetch order details for the email
      const { data: order } = await supabase
        .from('orders')
        .select(`
          order_number,
          order_type,
          delivery_type,
          delivery_address,
          customer_name,
          total,
          subtotal,
          delivery_fee,
          uber_delivery_id,
          uber_tracking_url,
          branch_id,
          customer_id,
          payments ( method, status, reference_code ),
          order_items (
            product_name,
            quantity,
            total_price,
            products (
              product_images ( url )
            )
          )
        `)
        .eq('id', orderId)
        .single();

      if (order && order.customer_id) {
          // Fetch customer email and branch/org separately for reliability
        const [customerResult, branchResult] = await Promise.all([
          supabase
            .from('customers')
            .select('email')
            .eq('id', order.customer_id)
            .single(),
          order.branch_id
            ? supabase
                .from('branches')
                .select('id, name, address, organization_id')
                .eq('id', order.branch_id)
                .single()
            : Promise.resolve({ data: null }),
        ]);

        const customer = customerResult.data;
        const branch = branchResult.data;

        // Fetch organization data directly for reliability
        let orgData = null;
        if (branch?.organization_id) {
          const { data: org } = await supabase
            .from('organizations')
            .select('name, logo_url, address, delivery_mode, uber_client_id, uber_client_secret, uber_customer_id, email')
            .eq('id', branch.organization_id)
            .single();
          orgData = org;
        }

        if (customer && customer.email) {
          const paymentMethod = order.payments?.length > 0 ? order.payments[0].method : 'En local';
          // Filter out placeholder addresses
          const PLACEHOLDER_ADDRESSES = ['por definir', 'principal'];
          const isPlaceholder = (addr) =>
            !addr || PLACEHOLDER_ADDRESSES.some(p => addr.toLowerCase().includes(p));

          // Prefer branch address, then org address, filtering out placeholders
          const rawAddress = (!isPlaceholder(branch?.address) && branch?.address)
            || orgData?.address
            || '';
          const branchAddress = isPlaceholder(rawAddress) ? '' : rawAddress;
          const emailData = {
            order_number: order.order_number,
            order_id: order.id,
            order_type: order.order_type,
            delivery_type: order.delivery_type,
            delivery_address: order.delivery_address,
            customer_name: order.customer_name || 'Cliente',
            total: order.total,
            subtotal: order.total - (order.delivery_fee || 0),
            delivery_fee: order.delivery_fee,
            payment_method: paymentMethod,
            payment_reference: order.payments?.[0]?.reference_code || null,
            uber_tracking_url: order.uber_tracking_url,
            items: order.order_items || [],
            branch: {
              name: branch?.name || '',
              address: branchAddress,
            },
            organization: {
              name: orgData?.name || 'FoodHub',
              logo_url: orgData?.logo_url || null,
              email: orgData?.email || null,
            }
          };
          
          import('./emailService').then(({ sendEmail }) => {
            sendEmail({ type: 'order_ready', email: customer.email, data: emailData });
          });
        }
      }
    }

    return true;
  } catch (error) {
    console.error("Error updating order status:", error);
    throw error;
  }
};

export const markOrderAsPaid = async (orderId) => {
  try {
    const { error } = await supabase
      .from('payments')
      .update({ status: 'completed' })
      .eq('order_id', orderId)
      .eq('status', 'pending');

    if (error) throw error;
    return true;
  } catch (error) {
    console.error("Error marking order as paid:", error);
    return false;
  }
};

export const updateOrderCustomer = async (orderId, name, phone) => {
  try {
    const { data: orderData } = await supabase
      .from('orders')
      .select('organization_id')
      .eq('id', orderId)
      .single();
      
    if (!orderData) throw new Error("Order not found");
    const organizationId = orderData.organization_id;

    let customerId = null;

    if (phone) {
      customerId = await upsertCustomerForOrder(organizationId, { phone, name });
    } else if (name) {
      const { data: newCustomer, error: insertError } = await supabase
        .from('customers')
        .insert([{ organization_id: organizationId, full_name: name }])
        .select()
        .single();
        
      if (insertError) throw insertError;
      customerId = newCustomer.id;
    }

    const updateData = {};
    if (name) updateData.customer_name = name;
    if (phone) updateData.customer_phone = phone;
    if (customerId) updateData.customer_id = customerId;
    
    if (Object.keys(updateData).length > 0) {
      const { error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', orderId);

      if (error) throw error;
    }
    return true;
  } catch (error) {
    console.error("Error updating customer info:", error);
    throw error;
  }
};

export const getOpenOrdersForTable = async (tableId) => {
  if (!tableId) return [];
  try {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        payments(id, status, amount),
        order_items(*, order_item_variants(*), order_item_ingredients(*), products(product_images(url)))
      `)
      .eq('table_id', tableId)
      .in('status', OPEN_ORDER_STATUSES)
      .order('created_at', { ascending: true }); // la más antigua es la canónica

    if (error) throw error;
    return getOpenOrders(data || []);
  } catch (error) {
    console.error("Error fetching open orders for table:", error);
    return [];
  }
};

export const appendItemsToOrder = async (orderId, newCartItems, additionalTotal, additionalSubtotal, additionalTax) => {
  try {
    // 1. Fetch current order to update totals
    const { data: currentOrder, error: orderError } = await supabase
      .from('orders')
      .select('total, subtotal, tax_amount')
      .eq('id', orderId)
      .single();
      
    if (orderError) throw orderError;

    // 2. Insert new order items
    for (const item of newCartItems) {
      const lineUnitPrice = getCartItemUnitPrice(item);
      const { data: insertedItem, error: itemError } = await supabase
        .from('order_items')
        .insert({
          order_id: orderId,
          product_id: item.productId || item.id,
          product_name: item.name,
          quantity: item.quantity,
          unit_price: lineUnitPrice,
          total_price: lineUnitPrice * item.quantity,
        })
        .select()
        .single();

      if (itemError) throw itemError;

      if (item.variant) {
        await supabase.from('order_item_variants').insert({
          order_item_id: insertedItem.id,
          variant_group_id: item.variant.variant_group_id || null,
          variant_option_id: item.variant.id,
          variant_group_name: 'Variantes',
          variant_option_name: item.variant.name,
          price_modifier: item.variant.price_modifier || 0
        });
      }

      if (item.selectedIngredients && item.selectedIngredients.length > 0) {
        const ingredientInserts = item.selectedIngredients.map(ing => ({
          order_item_id: insertedItem.id,
          ingredient_id: ing.id,
          ingredient_name: ing.name,
          price: ing.price || 0
        }));
        await supabase.from('order_item_ingredients').insert(ingredientInserts);
      }
      // If it is a bundle/combo, insert child options
      if (item.type === 'bundle' && item.selectedOptions && item.selectedOptions.length > 0) {
        for (const option of item.selectedOptions) {
          const childQty = (option.quantity || 1) * item.quantity;
          const childPrice = getBundleOptionUnitPrice({
            priceModifier: option.priceModifier ?? option.price ?? 0,
            variant: option.variant,
            selectedIngredients: option.selectedIngredients,
          });
          const { data: insertedChild, error: childError } = await supabase
            .from('order_items')
            .insert({
              order_id: orderId,
              product_id: option.productId || option.id,
              product_name: option.name,
              quantity: childQty,
              unit_price: childPrice,
              total_price: childPrice * childQty,
              parent_item_id: insertedItem.id
            })
            .select()
            .single();

          if (childError) {
            console.error("Error inserting child bundle option:", childError);
            continue;
          }

          // Insert child variant (if any)
          if (option.variant) {
            const { error: variantError } = await supabase
              .from('order_item_variants')
              .insert({
                order_item_id: insertedChild.id,
                variant_group_id: option.variant.variant_group_id || null,
                variant_option_id: option.variant.id,
                variant_group_name: 'Variantes',
                variant_option_name: option.variant.name,
                price_modifier: option.variant.price_modifier || 0
              });
            if (variantError) console.error("Error inserting child variant:", variantError);
          }

          // Insert child ingredients (if any)
          if (option.selectedIngredients && option.selectedIngredients.length > 0) {
            const ingredientInserts = option.selectedIngredients.map(ing => ({
              order_item_id: insertedChild.id,
              ingredient_id: ing.id,
              ingredient_name: ing.name,
              price: ing.price || 0
            }));
            const { error: ingError } = await supabase
              .from('order_item_ingredients')
              .insert(ingredientInserts);
            if (ingError) console.error("Error inserting child ingredients:", ingError);
          }
        }
      }
    }

    // 3. Update order totals and status
    const newTotal = Number(currentOrder.total) + additionalTotal;
    const newSubtotal = Number(currentOrder.subtotal) + additionalSubtotal;
    const newTax = Number(currentOrder.tax_amount) + additionalTax;
    
    await supabase.from('orders').update({
      total: newTotal,
      subtotal: newSubtotal,
      tax_amount: newTax,
      status: 'confirmed' // Ensures kitchen receives the updated state
    }).eq('id', orderId);

    // 4. Update pending payment amount if it exists
    const { data: pendingPayment } = await supabase
      .from('payments')
      .select('id, amount')
      .eq('order_id', orderId)
      .eq('status', 'pending')
      .single();
      
    if (pendingPayment) {
      await supabase.from('payments').update({
        amount: Number(pendingPayment.amount) + additionalTotal
      }).eq('id', pendingPayment.id);
    }

    return true;
  } catch (error) {
    console.error("Error appending items to order:", error);
    throw error;
  }
};

export const updateOrderItemsStatus = async (itemIds, newStatus, orderId) => {
  try {
    // 1. Update the parent items
    const { error } = await supabase
      .from('order_items')
      .update({ status: newStatus })
      .in('id', itemIds);

    if (error) throw error;

    // 2. Update their child items (modifiers, combos) to match the parent status
    const { error: childrenError } = await supabase
      .from('order_items')
      .update({ status: newStatus })
      .in('parent_item_id', itemIds);

    if (childrenError) throw childrenError;

    // Check if all items in this order are now ready
    if (newStatus === 'ready' && orderId) {
      const { data: items, error: fetchError } = await supabase
        .from('order_items')
        .select('status')
        .eq('order_id', orderId);
        
      if (!fetchError && items) {
        const allReady = items.every(i => i.status === 'ready');
        if (allReady) {
          // Call updateOrderStatus so emails and Uber Direct webhooks are fired correctly
          await updateOrderStatus(orderId, 'ready');
        }
      }
    }
  } catch (error) {
    console.error("Error updating order items status:", error);
    throw error;
  }
};

export const deleteOrder = async (orderId) => {
  try {
    await supabase.from('order_items').delete().eq('order_id', orderId);
    await supabase.from('payments').delete().eq('order_id', orderId);
    const { error } = await supabase.from('orders').delete().eq('id', orderId);
    if (error) throw error;
    return true;
  } catch (error) {
    console.error("Error deleting order:", error);
    throw error;
  }
};

export const bulkDeleteOrders = async (orderIds) => {
  if (!orderIds || orderIds.length === 0) return true;
  try {
    await supabase.from('order_items').delete().in('order_id', orderIds);
    await supabase.from('payments').delete().in('order_id', orderIds);
    const { error } = await supabase.from('orders').delete().in('id', orderIds);
    if (error) throw error;
    return true;
  } catch (error) {
    console.error("Error bulk deleting orders:", error);
    throw error;
  }
};

export const bulkCancelOrders = async (orderIds) => {
  if (!orderIds || orderIds.length === 0) return true;
  try {
    const { error } = await supabase
      .from('orders')
      .update({ status: 'cancelled' })
      .in('id', orderIds);
    if (error) throw error;
    return true;
  } catch (error) {
    console.error("Error bulk cancelling orders:", error);
    throw error;
  }
};

// Cierra en cocina varias órdenes de una vez (botón "Todos listos").
// Devuelve un conteo porque cada orden se procesa por separado y una falla no
// debe abortar el resto. `onProgress(done, total)` permite mostrar avance: con
// decenas de pedidos la operación tarda y sin eso parece colgada.
export const bulkMarkOrdersReady = async (orderIds, onProgress) => {
  const empty = { updated: 0, skipped: 0, failed: 0 };
  if (!orderIds || orderIds.length === 0) return empty;

  const { data: orders, error: fetchError } = await supabase
    .from('orders')
    .select('id, status, scheduled_at, order_items(id, status, parent_item_id)')
    .in('id', orderIds);

  if (fetchError) throw fetchError;

  const now = Date.now();
  const pendingByOrder = new Map();
  let skipped = 0;

  for (const order of orders || []) {
    // Un pedido programado cuya hora todavía no llega no se marca como listo:
    // la cocina lo cerraría como entregado antes de tiempo.
    const isFutureScheduled =
      order.status === 'scheduled' &&
      order.scheduled_at &&
      new Date(order.scheduled_at).getTime() > now;

    if (isFutureScheduled) {
      skipped++;
      continue;
    }

    // Solo los ítems padre pendientes: updateOrderItemsStatus se encarga de
    // propagar el estado a los hijos de cada combo.
    const itemIds = (order.order_items || [])
      .filter((i) => !i.parent_item_id && i.status !== 'ready')
      .map((i) => i.id);

    if (itemIds.length > 0) pendingByOrder.set(order.id, itemIds);
  }

  if (pendingByOrder.size === 0) return { ...empty, skipped };

  // updateOrderItemsStatus, al dejar la orden completa, llama a
  // updateOrderStatus: eso dispara el email de "pedido listo" y el webhook de
  // Uber Direct, igual que cuando se marca un ticket a mano.
  //
  //(updateOrderItemsStatus hace varias consultas más, entre ellas el envío del
  // email, por eso se limita la concurrencia en vez de disparar las N de una.)
  const entries = [...pendingByOrder.entries()];
  const CONCURRENCY = 5;
  let next = 0;
  let done = 0;
  let failed = 0;

  const worker = async () => {
    while (next < entries.length) {
      const [orderId, itemIds] = entries[next++];
      try {
        await updateOrderItemsStatus(itemIds, 'ready', orderId);
      } catch (error) {
        console.error('Error marking order as ready:', orderId, error);
        failed++;
      } finally {
        done++;
        onProgress?.(done, entries.length);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, entries.length) }, () => worker())
  );

  return { updated: entries.length - failed, skipped, failed };
};

