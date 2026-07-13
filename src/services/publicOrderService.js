import { supabase } from '../lib/supabase';

// ── Get organization by its name (used as public identifier) ──
export const getOrganizationByName = async (orgName) => {
  const decoded = decodeURIComponent(orgName).toLowerCase();

  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, slug, logo_url, cover_url, description, primary_color, phone, email, address, default_tax_rate, currency')
    .ilike('name', decoded)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) {
    // Try by slug as fallback
    const { data: bySlug, error: slugError } = await supabase
      .from('organizations')
      .select('id, name, slug, logo_url, cover_url, description, primary_color, phone, email, address, default_tax_rate, currency')
      .ilike('slug', decoded)
      .eq('is_active', true)
      .maybeSingle();
    if (slugError) throw slugError;
    return bySlug;
  }
  return data;
};

// ── Get public catalog (categories + products) ──
export const getPublicCatalog = async (organizationId) => {
  const [categoriesResult, productsResult] = await Promise.all([
    supabase
      .from('categories')
      .select('id, name, image_url')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('products')
      .select(`
        id,
        name,
        base_price,
        description,
        status,
        product_categories (
          categories ( id, name )
        ),
        product_images ( url ),
        variant_groups (
          id, name,
          variant_options ( id, variant_group_id, name, price_modifier, is_active )
        ),
        product_ingredients (
          is_base, is_extra,
          ingredients ( id, name, price, is_active )
        )
      `)
      .eq('organization_id', organizationId)
      .eq('status', 'available')
  ]);

  if (categoriesResult.error) throw categoriesResult.error;
  if (productsResult.error) throw productsResult.error;

  const categories = categoriesResult.data || [];
  const rawProducts = productsResult.data || [];

  const products = rawProducts.map(p => {
    const catInfo = p.product_categories?.[0]?.categories;
    const variantGroup = p.variant_groups?.length > 0
      ? p.variant_groups[p.variant_groups.length - 1]
      : null;

    return {
      id: p.id,
      name: p.name,
      price: p.base_price,
      description: p.description,
      category: catInfo?.name || 'General',
      categoryId: catInfo?.id || 'none',
      image: p.product_images?.[0]?.url || null,
      variants: variantGroup?.variant_options?.filter(v => v.is_active) || [],
      ingredients: (p.product_ingredients || []).map(pi => {
        if (!pi.ingredients || !pi.ingredients.is_active) return null;
        return { ...pi.ingredients, isBase: pi.is_base, isExtra: pi.is_extra };
      }).filter(Boolean)
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  return { categories, products };
};

// ── Create a public (online) order ──
export const createPublicOrder = async ({ organizationId, cartItems, customer, notes, paymentMethod = 'cash', paymentStatus = 'pending' }) => {
  // Get first active branch
  const { data: branch, error: branchError } = await supabase
    .from('branches')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (branchError || !branch) throw new Error('No se encontró una sucursal activa.');

  // Generate order number
  const { data: lastOrder } = await supabase
    .from('orders')
    .select('order_number')
    .eq('branch_id', branch.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let nextNumber = 0;
  if (lastOrder?.order_number) {
    const parsed = parseInt(lastOrder.order_number, 10);
    if (!isNaN(parsed)) nextNumber = parsed + 1;
  }
  const orderNumber = nextNumber.toString().padStart(4, '0');

  // Calculate totals (all prices already include IVA for display)
  const total = cartItems.reduce((acc, item) => {
    const itemPrice = Math.round(item.price * 1.19);
    const extrasPrice = (item.selectedIngredients || []).reduce((s, i) => s + (i.price || 0), 0);
    return acc + (itemPrice + extrasPrice) * item.quantity;
  }, 0);

  const taxRate = 0.19;
  const subtotal = Math.round(total / (1 + taxRate));
  const tax = total - subtotal;

  // Insert order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert([{
      organization_id: organizationId,
      branch_id: branch.id,
      order_type: 'online',
      order_number: orderNumber,
      status: 'confirmed',
      customer_name: customer.name,
      customer_phone: customer.phone || null,
      notes: notes || null,
      subtotal,
      tax_amount: tax,
      total,
    }])
    .select()
    .single();

  if (orderError) throw orderError;

  // Insert items
  const itemsToInsert = cartItems.map(item => {
    const itemPrice = Math.round(item.price * 1.19);
    const extrasPrice = (item.selectedIngredients || []).reduce((s, i) => s + (i.price || 0), 0);
    return {
      order_id: order.id,
      product_id: item.id,
      product_name: item.name,
      quantity: item.quantity,
      unit_price: item.price,
      total_price: (itemPrice + extrasPrice) * item.quantity,
    };
  });

  const { data: insertedItems, error: itemsError } = await supabase
    .from('order_items')
    .insert(itemsToInsert)
    .select();

  if (itemsError) throw itemsError;

  // Insert variants
  const variantInserts = [];
  cartItems.forEach((item, index) => {
    if (item.variant && insertedItems[index]) {
      variantInserts.push({
        order_item_id: insertedItems[index].id,
        variant_group_id: item.variant.variant_group_id || null,
        variant_option_id: item.variant.id,
        variant_group_name: 'Variantes',
        variant_option_name: item.variant.name,
        price_modifier: item.variant.price_modifier || 0
      });
    }
  });
  if (variantInserts.length > 0) {
    await supabase.from('order_item_variants').insert(variantInserts);
  }

  // Insert extra ingredients
  const ingInserts = [];
  cartItems.forEach((item, index) => {
    (item.selectedIngredients || []).forEach(ing => {
      if (insertedItems[index]) {
        ingInserts.push({
          order_item_id: insertedItems[index].id,
          ingredient_id: ing.id,
          ingredient_name: ing.name,
          price: ing.price || 0
        });
      }
    });
  });
  if (ingInserts.length > 0) {
    await supabase.from('order_item_ingredients').insert(ingInserts);
  }

  // Insert payment
  await supabase.from('payments').insert([{
    order_id: order.id,
    method: paymentMethod,
    status: paymentStatus,
    amount: total,
  }]);

  // Save/update customer record
  if (customer.phone) {
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('phone', customer.phone)
      .maybeSingle();

    if (existingCustomer) {
      if (customer.name) {
        await supabase.from('customers').update({ full_name: customer.name, email: customer.email || null })
          .eq('id', existingCustomer.id);
      }
      await supabase.from('orders').update({ customer_id: existingCustomer.id }).eq('id', order.id);
    } else {
      const { data: newCustomer } = await supabase
        .from('customers')
        .insert([{ organization_id: organizationId, phone: customer.phone, full_name: customer.name, email: customer.email || null }])
        .select().single();
      if (newCustomer) {
        await supabase.from('orders').update({ customer_id: newCustomer.id }).eq('id', order.id);
      }
    }
  }

  return order;
};
