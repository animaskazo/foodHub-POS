import { supabase } from '../lib/supabase';

export const getFirstOrganizationId = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data } = await supabase
      .from('staff')
      .select('organization_id')
      .eq('id', user.id)
      .maybeSingle();
    if (data?.organization_id) return data.organization_id;
  }
  const { data, error } = await supabase
    .from('organizations')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (error) {
    console.error('Error fetching organization:', error);
    return null;
  }
  return data.id;
};

export const getInventoryItems = async (organizationId) => {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('organization_id', organizationId)
    .order('name');

  if (error) {
    console.error('Error fetching inventory items:', error);
    return [];
  }
  return data;
};

export const getInventoryItemById = async (id) => {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
};

export const createInventoryItem = async (organizationId, itemData) => {
  const { data, error } = await supabase
    .from('inventory_items')
    .insert([{
      organization_id: organizationId,
      name: itemData.name,
      unit: itemData.unit || 'unit',
      unit_price: itemData.unit_price || 0,
      stock_quantity: itemData.stock_quantity || 0,
      low_stock_threshold: itemData.low_stock_threshold || null,
      is_active: itemData.is_active !== false,
    }])
    .select();

  if (error) throw error;

  // Record initial stock movement
  if (itemData.stock_quantity && parseFloat(itemData.stock_quantity) > 0) {
    await supabase
      .from('inventory_item_movements')
      .insert([{
        inventory_item_id: data[0].id,
        organization_id: organizationId,
        quantity: itemData.stock_quantity,
        movement_type: 'initial_stock',
        reference_type: 'manual',
        notes: 'Stock inicial',
      }]);
  }

  return data[0];
};

export const updateInventoryItem = async (id, itemData) => {
  const { data, error } = await supabase
    .from('inventory_items')
    .update({
      name: itemData.name,
      unit: itemData.unit,
      unit_price: itemData.unit_price || 0,
      low_stock_threshold: itemData.low_stock_threshold || null,
      is_active: itemData.is_active !== false,
    })
    .eq('id', id)
    .select();

  if (error) throw error;
  return data[0];
};

export const adjustInventoryStock = async (id, organizationId, quantity, notes, movementType = 'adjustment') => {
  // Get current item to adjust
  const item = await getInventoryItemById(id);

  const newQuantity = parseFloat(item.stock_quantity) + parseFloat(quantity);

  const { error: updateError } = await supabase
    .from('inventory_items')
    .update({ stock_quantity: newQuantity })
    .eq('id', id);

  if (updateError) throw updateError;

  const { error: movementError } = await supabase
    .from('inventory_item_movements')
    .insert([{
      inventory_item_id: id,
      organization_id: organizationId,
      quantity: quantity,
      movement_type: movementType,
      reference_type: 'manual',
      notes: notes || null,
    }]);

  if (movementError) throw movementError;

  return { new_quantity: newQuantity };
};

export const deleteInventoryItem = async (id) => {
  const { error } = await supabase
    .from('inventory_items')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

export const bulkDeleteInventoryItems = async (ids) => {
  if (!ids || ids.length === 0) return;
  const { error } = await supabase
    .from('inventory_items')
    .delete()
    .in('id', ids);

  if (error) throw error;
};

export const getMovements = async (inventoryItemId) => {
  const { data, error } = await supabase
    .from('inventory_item_movements')
    .select('*')
    .eq('inventory_item_id', inventoryItemId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching movements:', error);
    return [];
  }
  return data;
};

export const getProductRecipes = async (productId) => {
  const { data, error } = await supabase
    .from('product_recipes')
    .select('*, inventory_items(name, unit)')
    .eq('product_id', productId);

  if (error) {
    console.error('Error fetching product recipes:', error);
    return [];
  }
  return data;
};

export const saveProductRecipe = async (productId, inventoryItemId, quantity) => {
  const { data, error } = await supabase
    .from('product_recipes')
    .upsert([{
      product_id: productId,
      inventory_item_id: inventoryItemId,
      quantity: quantity,
    }], {
      onConflict: 'product_id, inventory_item_id',
    })
    .select();

  if (error) throw error;
  return data[0];
};

export const removeProductRecipe = async (productId, inventoryItemId) => {
  const { error } = await supabase
    .from('product_recipes')
    .delete()
    .eq('product_id', productId)
    .eq('inventory_item_id', inventoryItemId);

  if (error) throw error;
};

// Reemplaza la receta completa de un producto (borra y reinserta)
export const replaceProductRecipes = async (productId, recipes) => {
  const { error: delError } = await supabase
    .from('product_recipes')
    .delete()
    .eq('product_id', productId);

  if (delError) throw delError;

  const rows = (recipes || [])
    .filter(r => r.inventoryItemId && r.quantity > 0)
    .map(r => ({
      product_id: productId,
      inventory_item_id: r.inventoryItemId,
      quantity: parseFloat(r.quantity) || 0
    }));

  if (rows.length === 0) return;

  const { error } = await supabase
    .from('product_recipes')
    .insert(rows);

  if (error) throw error;
};

// ── INVENTORY DEDUCTION FOR ORDERS ───────────────────────────

export const checkInventoryStock = async (cartItems) => {
  // Collect product and extra ingredient entries
  const productEntries = [];
  const extraIngredientEntries = [];

  for (const item of cartItems) {
    const qty = item.quantity || 1;
    const productId = item.productId || item.id;

    if (productId) {
      productEntries.push({ productId, variantId: item.variant?.id || null, quantity: qty });
    }

    if (item.selectedIngredients) {
      for (const ing of item.selectedIngredients) {
        if (ing.id) {
          extraIngredientEntries.push({ ingredientId: ing.id, quantity: qty });
        }
      }
    }

    if (item.type === 'bundle' && item.selectedOptions) {
      for (const opt of item.selectedOptions) {
        const optQty = (opt.quantity || 1) * qty;
        const optProductId = opt.productId || opt.id;
        if (optProductId) {
          productEntries.push({ productId: optProductId, variantId: opt.variant?.id || null, quantity: optQty });
        }
        if (opt.selectedIngredients) {
          for (const ing of opt.selectedIngredients) {
            if (ing.id) {
              extraIngredientEntries.push({ ingredientId: ing.id, quantity: optQty });
            }
          }
        }
      }
    }
  }

  const consumption = {};

  // Check product base ingredients
  const productIds = [...new Set(productEntries.map(e => e.productId))];
  if (productIds.length > 0) {
    const { data: productIngredients } = await supabase
      .from('product_ingredients')
      .select(`
        product_id, ingredient_id, portion_multiplier, variant_option_id,
        ingredients(id, name, unit, stock_quantity, portion_quantity)
      `)
      .in('product_id', productIds)
      .eq('is_base', true);

    for (const pi of productIngredients || []) {
      const ing = pi.ingredients;
      if (!ing) continue;

      for (const entry of productEntries) {
        if (entry.productId !== pi.product_id) continue;

        if (pi.variant_option_id && pi.variant_option_id !== entry.variantId) continue;
        if (!pi.variant_option_id && entry.variantId) {
          const hasVariantSpecific = (productIngredients || []).some(
            p => p.product_id === pi.product_id && p.ingredient_id === pi.ingredient_id && p.variant_option_id === entry.variantId
          );
          if (hasVariantSpecific) continue;
        }

        const multiplier = parseFloat(pi.portion_multiplier || 1);
        const portionQty = parseFloat(ing.portion_quantity || 1);
        const totalNeeded = portionQty * multiplier * entry.quantity;

        const cid = ing.id;
        if (!consumption[cid]) {
          consumption[cid] = {
            inventory_item_id: cid,
            name: ing.name,
            unit: ing.unit || 'unit',
            needed: 0,
            available: parseFloat(ing.stock_quantity || 0),
          };
        }
        consumption[cid].needed += totalNeeded;
      }
    }
  }

  // Check extra ingredients
  if (extraIngredientEntries.length > 0) {
    const extraIngIds = [...new Set(extraIngredientEntries.map(e => e.ingredientId))];
    const { data: extraIngredients } = await supabase
      .from('ingredients')
      .select('id, name, unit, stock_quantity, portion_quantity')
      .in('id', extraIngIds);

    const extraIngMap = {};
    for (const ing of extraIngredients || []) {
      extraIngMap[ing.id] = ing;
    }

    for (const entry of extraIngredientEntries) {
      const ing = extraIngMap[entry.ingredientId];
      if (!ing) continue;
      const portionQty = parseFloat(ing.portion_quantity || 1);
      const totalNeeded = portionQty * entry.quantity;
      const cid = ing.id;
      if (!consumption[cid]) {
        consumption[cid] = {
          inventory_item_id: cid,
          name: ing.name,
          unit: ing.unit || 'unit',
          needed: 0,
          available: parseFloat(ing.stock_quantity || 0),
        };
      }
      consumption[cid].needed += totalNeeded;
    }
  }

  const consumptionList = Object.values(consumption);
  const insufficient = consumptionList.filter(c => c.needed > c.available);

  if (insufficient.length > 0) {
    const details = insufficient.map(i =>
      `${i.name}: necesitas ${i.needed.toFixed(1)} ${i.unit}, hay ${i.available.toFixed(1)} ${i.unit}`
    );
    throw new Error(`Stock insuficiente para:\n${details.join('\n')}`);
  }

  return consumptionList;
};

export const deductInventoryForOrder = async (orderId, organizationId, branchId) => {
  const { data: orderItems, error: itemsError } = await supabase
    .from('order_items')
    .select('id, product_id, quantity')
    .eq('order_id', orderId);

  if (itemsError) {
    console.error('Error fetching order items for deduction:', itemsError);
    return;
  }

  const orderItemIds = orderItems.map(oi => oi.id);
  const { data: itemVariants } = await supabase
    .from('order_item_variants')
    .select('order_item_id, variant_option_id')
    .in('order_item_id', orderItemIds);

  const variantMap = {};
  if (itemVariants) {
    for (const iv of itemVariants) {
      variantMap[iv.order_item_id] = iv.variant_option_id;
    }
  }

  const productQtys = {};
  const oiQtyMap = {};
  for (const oi of orderItems) {
    if (oi.product_id) {
      const variantId = variantMap[oi.id];
      if (!productQtys[oi.product_id]) {
        productQtys[oi.product_id] = { totalQty: 0, variants: {} };
      }
      productQtys[oi.product_id].totalQty += oi.quantity;
      if (variantId) {
        productQtys[oi.product_id].variants[variantId] = (productQtys[oi.product_id].variants[variantId] || 0) + oi.quantity;
      }
    }
    oiQtyMap[oi.id] = oi.quantity;
  }

  const productIds = Object.keys(productQtys);
  if (productIds.length === 0) return;

  const consumption = {};

  // Get product_ingredients for all products
  const { data: productIngredients } = await supabase
    .from('product_ingredients')
    .select(`
      product_id, ingredient_id, portion_multiplier, variant_option_id,
      ingredients(id, name, unit, stock_quantity, portion_quantity)
    `)
    .in('product_id', productIds)
    .eq('is_base', true);

  for (const pi of productIngredients || []) {
    const ing = pi.ingredients;
    if (!ing) continue;

    const prodInfo = productQtys[pi.product_id];
    if (!prodInfo) continue;

    let qty = 0;
    if (pi.variant_option_id) {
      qty = prodInfo.variants[pi.variant_option_id] || 0;
    } else {
      const hasVariantSpecific = (productIngredients || []).some(
        p => p.product_id === pi.product_id && p.ingredient_id === pi.ingredient_id && p.variant_option_id && prodInfo.variants[p.variant_option_id]
      );
      if (hasVariantSpecific) {
        const variantTotal = Object.values(prodInfo.variants).reduce((a, b) => a + b, 0);
        qty = prodInfo.totalQty - variantTotal;
      } else {
        qty = prodInfo.totalQty;
      }
    }

    if (qty <= 0) continue;

    const multiplier = parseFloat(pi.portion_multiplier || 1);
    const portionQty = parseFloat(ing.portion_quantity || 1);
    const totalNeeded = portionQty * multiplier * qty;

    const cid = ing.id;
    if (!consumption[cid]) {
      consumption[cid] = {
        inventory_item_id: cid,
        name: ing.name,
        unit: ing.unit || 'unit',
        needed: 0,
        available: parseFloat(ing.stock_quantity || 0),
      };
    }
    consumption[cid].needed += totalNeeded;
  }

  // ── Extra ingredients deduction ──
  const { data: orderItemIngredients } = await supabase
    .from('order_item_ingredients')
    .select('order_item_id, ingredient_id')
    .in('order_item_id', orderItemIds);

  if (orderItemIngredients && orderItemIngredients.length > 0) {
    const extraIngIds = [...new Set(orderItemIngredients.map(oii => oii.ingredient_id).filter(Boolean))];
    if (extraIngIds.length > 0) {
      const { data: extraIngredients } = await supabase
        .from('ingredients')
        .select('id, name, unit, stock_quantity, portion_quantity')
        .in('id', extraIngIds);

      const ingMap = {};
      for (const ing of extraIngredients || []) {
        ingMap[ing.id] = ing;
      }

      for (const oii of orderItemIngredients) {
        const ing = ingMap[oii.ingredient_id];
        if (!ing) continue;
        const qty = oiQtyMap[oii.order_item_id] || 1;
        const portionQty = parseFloat(ing.portion_quantity || 1);
        const totalNeeded = portionQty * qty;
        const cid = ing.id;
        if (!consumption[cid]) {
          consumption[cid] = {
            inventory_item_id: cid,
            name: ing.name,
            unit: ing.unit || 'unit',
            needed: 0,
            available: parseFloat(ing.stock_quantity || 0),
          };
        }
        consumption[cid].needed += totalNeeded;
      }
    }
  }

  for (const item of Object.values(consumption)) {
    if (item.needed <= 0) continue;
    const newStock = item.available - item.needed;

    const { error: updateError } = await supabase
      .from('ingredients')
      .update({ stock_quantity: newStock })
      .eq('id', item.inventory_item_id);

    if (updateError) {
      console.error(`Error updating stock for ${item.name}:`, updateError);
      continue;
    }

    const { error: movementError } = await supabase
      .from('ingredient_movements')
      .insert([{
        ingredient_id: item.inventory_item_id,
        organization_id: organizationId,
        branch_id: branchId || null,
        quantity: -item.needed,
        movement_type: 'sale',
        reference_type: 'order',
        reference_id: orderId,
        notes: `Venta #${orderId}`,
      }]);

    if (movementError) {
      console.error(`Error recording movement for ${item.name}:`, movementError);
    }
  }
};

// ── OUT OF STOCK CHECK FOR POS ──────────────────────────────

export const getOutOfStockProductIds = async (organizationId) => {
  const { data: productIngredients, error } = await supabase
    .from('product_ingredients')
    .select(`
      product_id,
      is_base,
      portion_multiplier,
      variant_option_id,
      ingredients!inner(id, stock_quantity, portion_quantity)
    `);

  if (error) {
    console.error('Error fetching product ingredients for stock check:', error);
    return [];
  }

  const productConsumption = {};
  for (const pi of productIngredients || []) {
    // Solo los ingredientes base determinan si el producto está sin stock.
    // Los ingredientes extra (opcionales) no deben bloquear la compra del producto.
    if (pi.is_base !== true) continue;

    const pid = pi.product_id;
    if (!productConsumption[pid]) productConsumption[pid] = {};
    const ingId = pi.ingredients.id;
    if (!productConsumption[pid][ingId]) {
      productConsumption[pid][ingId] = {
        needed: 0,
        available: parseFloat(pi.ingredients.stock_quantity || 0),
      };
    }
    const portionQty = parseFloat(pi.ingredients.portion_quantity || 1);
    const multiplier = parseFloat(pi.portion_multiplier || 1);
    productConsumption[pid][ingId].needed += portionQty * multiplier;
  }

  const outOfStock = [];
  for (const [productId, ingredients] of Object.entries(productConsumption)) {
    for (const invData of Object.values(ingredients)) {
      if (invData.needed > invData.available) {
        outOfStock.push(productId);
        break;
      }
    }
  }

  return outOfStock;
};

// ── INVENTORY USAGE STATS ──────────────────────────────────

export const getInventoryUsage = async (organizationId) => {
  const { data, error } = await supabase
    .from('inventory_item_movements')
    .select('inventory_item_id, quantity')
    .eq('organization_id', organizationId);

  if (error) {
    console.error('Error fetching inventory usage:', error);
    return {};
  }

  const usageMap = {};
  for (const m of data) {
    const id = m.inventory_item_id;
    if (!usageMap[id]) usageMap[id] = { totalIn: 0, totalOut: 0 };
    const qty = parseFloat(m.quantity);
    if (qty > 0) {
      usageMap[id].totalIn += qty;
    } else {
      usageMap[id].totalOut += Math.abs(qty);
    }
  }
  return usageMap;
};

// ── INGREDIENT STOCK FUNCTIONS ────────────────────────────

export const getIngredientUsage = async (organizationId) => {
  const { data, error } = await supabase
    .from('ingredient_movements')
    .select('ingredient_id, quantity')
    .eq('organization_id', organizationId);

  if (error) {
    console.error('Error fetching ingredient usage:', error);
    return {};
  }

  const usageMap = {};
  for (const m of data) {
    const id = m.ingredient_id;
    if (!usageMap[id]) usageMap[id] = { totalIn: 0, totalOut: 0 };
    const qty = parseFloat(m.quantity);
    if (qty > 0) {
      usageMap[id].totalIn += qty;
    } else {
      usageMap[id].totalOut += Math.abs(qty);
    }
  }
  return usageMap;
};

export const getIngredientMovements = async (ingredientId) => {
  const { data, error } = await supabase
    .from('ingredient_movements')
    .select('*')
    .eq('ingredient_id', ingredientId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching ingredient movements:', error);
    return [];
  }
  return data;
};

export const adjustIngredientStock = async (id, organizationId, quantity, notes, movementType = 'adjustment') => {
  const { data: item, error: fetchError } = await supabase
    .from('ingredients')
    .select('stock_quantity')
    .eq('id', id)
    .single();

  if (fetchError) throw fetchError;

  const newQuantity = parseFloat(item.stock_quantity) + parseFloat(quantity);

  const { error: updateError } = await supabase
    .from('ingredients')
    .update({ stock_quantity: newQuantity })
    .eq('id', id);

  if (updateError) throw updateError;

  const { error: movementError } = await supabase
    .from('ingredient_movements')
    .insert([{
      ingredient_id: id,
      organization_id: organizationId,
      quantity: quantity,
      movement_type: movementType,
      reference_type: 'manual',
      notes: notes || null,
    }]);

  if (movementError) throw movementError;

  return { new_quantity: newQuantity };
};

export const recordIngredientInitialStock = async (id, organizationId, quantity) => {
  if (!quantity || parseFloat(quantity) <= 0) return;
  const { error } = await supabase
    .from('ingredient_movements')
    .insert([{
      ingredient_id: id,
      organization_id: organizationId,
      quantity: quantity,
      movement_type: 'initial_stock',
      reference_type: 'manual',
      notes: 'Stock inicial',
    }]);
  if (error) console.error('Error recording initial stock:', error);
};
