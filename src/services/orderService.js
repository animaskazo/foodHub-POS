import { supabase } from '../lib/supabase';
import { checkInventoryStock, deductInventoryForOrder } from './inventoryService';
import { upsertCustomerForOrder } from './customerService';

export const createOrder = async (cartItems, paymentMethod, orderType, total, subtotal, tax, deliveryInfo = null, orderNotes = '', deliveryFee = 0, tableId = null) => {
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
    const orderPayload = {
      organization_id: organizationId,
      branch_id: branchId,
      order_type: orderType,
      status: 'confirmed', 
      subtotal: subtotal,
      tax_amount: tax,
      total: total,
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

    // 4. Insert order items & their variants/ingredients
    for (const item of cartItems) {
      // Insert parent item
      const { data: insertedItem, error: itemError } = await supabase
        .from('order_items')
        .insert({
          order_id: order.id,
          product_id: item.productId || item.id,
          product_name: item.name,
          quantity: item.quantity,
          unit_price: item.price,
          total_price: item.price * item.quantity,
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
      if (item.type === 'bundle' && item.selectedOptions && item.selectedOptions.length > 0) {
        for (const option of item.selectedOptions) {
          const childQty = (option.quantity || 1) * item.quantity;
          const childPrice = option.price || 0;
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

export const getOrders = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return [];

    const { data: staffData } = await supabase
      .from('staff')
      .select('organization_id')
      .eq('id', session.user.id)
      .single();

    if (!staffData) return [];

    const { data: branchData } = await supabase
      .from('branches')
      .select('id')
      .eq('organization_id', staffData.organization_id)
      .limit(1)
      .single();
      
    if (!branchData) return [];
    
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        payments(*),
        order_items(*, order_item_variants(*), order_item_ingredients(*))
      `)
      .eq('branch_id', branchData.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Error fetching orders:", error);
    return [];
  }
};

export const getKitchenOrders = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return [];

    const { data: staffData } = await supabase
      .from('staff')
      .select('organization_id')
      .eq('id', session.user.id)
      .single();

    if (!staffData) return [];

    const { data: branchData } = await supabase
      .from('branches')
      .select('id')
      .eq('organization_id', staffData.organization_id)
      .limit(1)
      .single();
      
    if (!branchData) return [];
    
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        restaurant_tables(name, table_zones(name)),
        order_items(*, products(description, product_images(url)), order_item_variants(variant_option_name), order_item_ingredients(ingredient_name))
      `)
      .eq('branch_id', branchData.id)
      .in('status', ['scheduled', 'pending', 'confirmed', 'preparing'])
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Excluir pedidos programados futuros (aún no les llegó su hora)
    const now = Date.now();
    return (data || []).filter(o => !o.scheduled_at || new Date(o.scheduled_at).getTime() <= now);
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
            .select('name, logo_url, address, delivery_mode, uber_client_id, uber_client_secret, uber_customer_id')
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

export const getOpenOrderForTable = async (tableId) => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        payments(*),
        order_items(*, order_item_variants(*), order_item_ingredients(*), products(product_images(url)))
      `)
      .eq('table_id', tableId)
      .in('status', ['pending', 'confirmed', 'preparing', 'ready'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 is not found
    return data;
  } catch (error) {
    console.error("Error fetching open order for table:", error);
    return null;
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
      const { data: insertedItem, error: itemError } = await supabase
        .from('order_items')
        .insert({
          order_id: orderId,
          product_id: item.productId || item.id,
          product_name: item.name,
          quantity: item.quantity,
          unit_price: item.price,
          total_price: item.price * item.quantity,
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
      
      // Handle bundles similar to createOrder if needed (simplified for brevity)
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
