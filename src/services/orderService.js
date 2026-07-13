import { supabase } from '../lib/supabase';

export const createOrder = async (cartItems, paymentMethod, orderType, total, subtotal, tax) => {
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

    // 2. Generate an order number sequentially per branch
    const { data: lastOrder } = await supabase
      .from('orders')
      .select('order_number')
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let nextNumber = 0;
    if (lastOrder && lastOrder.order_number) {
      const parsed = parseInt(lastOrder.order_number, 10);
      if (!isNaN(parsed)) {
        nextNumber = parsed + 1;
      }
    }
    const orderNumber = nextNumber.toString().padStart(4, '0');

    // 3. Insert order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert([
        {
          organization_id: organizationId,
          branch_id: branchId,
          order_type: orderType,
          order_number: orderNumber,
          status: 'confirmed', 
          subtotal: subtotal,
          tax_amount: tax,
          total: total,
        }
      ])
      .select()
      .single();

    if (orderError) throw orderError;

    // 4. Insert order items
    const itemsToInsert = cartItems.map(item => ({
      order_id: order.id,
      product_id: item.productId || item.id,
      product_name: item.name,
      quantity: item.quantity,
      unit_price: item.price,
      total_price: item.price * item.quantity,
    }));

    const { data: insertedItems, error: itemsError } = await supabase
      .from('order_items')
      .insert(itemsToInsert)
      .select();

    if (itemsError) throw itemsError;

    // 4.1 Insert variants
    const variantInserts = [];
    cartItems.forEach((item, index) => {
      if (item.variant) {
        const insertedItem = insertedItems[index];
        if (insertedItem) {
          variantInserts.push({
            order_item_id: insertedItem.id,
            variant_group_id: item.variant.variant_group_id || null,
            variant_option_id: item.variant.id,
            variant_group_name: 'Variantes',
            variant_option_name: item.variant.name,
            price_modifier: item.variant.price_modifier || 0
          });
        }
      }
    });

    if (variantInserts.length > 0) {
      const { error: variantError } = await supabase
        .from('order_item_variants')
        .insert(variantInserts);
      if (variantError) console.error("Error inserting variants:", variantError);
    }

    // 4.2 Insert ingredients
    const ingredientInserts = [];
    cartItems.forEach((item, index) => {
      if (item.selectedIngredients && item.selectedIngredients.length > 0) {
        const insertedItem = insertedItems[index];
        if (insertedItem) {
          item.selectedIngredients.forEach(ing => {
            ingredientInserts.push({
              order_item_id: insertedItem.id,
              ingredient_id: ing.id,
              ingredient_name: ing.name,
              price: ing.price || 0
            });
          });
        }
      }
    });

    if (ingredientInserts.length > 0) {
      const { error: ingError } = await supabase
        .from('order_item_ingredients')
        .insert(ingredientInserts);
      if (ingError) console.error("Error inserting ingredients:", ingError);
    }

    // 5. Insert payment
    // Map debit/credit to 'card'
    let method = paymentMethod;
    if (method === 'debit' || method === 'credit') method = 'card';

    const { error: paymentError } = await supabase
      .from('payments')
      .insert([
        {
          order_id: order.id,
          method: method,
          status: 'paid',
          amount: total,
          paid_at: new Date().toISOString(),
        }
      ]);

    if (paymentError) throw paymentError;

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
        order_items(*, products(description, product_images(url)), order_item_variants(variant_option_name), order_item_ingredients(ingredient_name))
      `)
      .eq('branch_id', branchData.id)
      .in('status', ['pending', 'confirmed', 'preparing'])
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Error fetching kitchen orders:", error);
    return [];
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
      const { data: existingCustomer } = await supabase
        .from('customers')
        .select('id, full_name')
        .eq('organization_id', organizationId)
        .eq('phone', phone)
        .maybeSingle();
      
      if (existingCustomer) {
        customerId = existingCustomer.id;
        if (name && existingCustomer.full_name !== name) {
          await supabase.from('customers').update({ full_name: name }).eq('id', customerId);
        }
      } else {
        const { data: newCustomer, error: insertError } = await supabase
          .from('customers')
          .insert([{ organization_id: organizationId, phone, full_name: name || null }])
          .select()
          .single();
          
        if (insertError) throw insertError;
        customerId = newCustomer.id;
      }
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
    console.error("Error updating order customer:", error);
    throw error;
  }
};
