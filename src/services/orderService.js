import { supabase } from '../lib/supabase';

export const createOrder = async (cartItems, paymentMethod, total, subtotal, tax) => {
  try {
    // 1. Get first org and branch (as demo fallback)
    const { data: orgData, error: orgError } = await supabase.from('organizations').select('id').limit(1).single();
    if (orgError || !orgData) throw new Error("No organization found. " + (orgError?.message || ''));

    const { data: branchData, error: branchError } = await supabase.from('branches').select('id').limit(1).single();
    if (branchError || !branchData) throw new Error("No branch found. " + (branchError?.message || ''));

    const organizationId = orgData.id;
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
          order_type: 'table',
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
    const { data: branchData } = await supabase.from('branches').select('id').limit(1).single();
    if (!branchData) return [];
    
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        payments(method, status),
        order_items(*)
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
    const { data: branchData } = await supabase.from('branches').select('id').limit(1).single();
    if (!branchData) return [];
    
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items(*, products(description))
      `)
      .eq('branch_id', branchData.id)
      .in('status', ['confirmed', 'preparing'])
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
    const { error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', orderId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error("Error updating order status:", error);
    throw error;
  }
};
