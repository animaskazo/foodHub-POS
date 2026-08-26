import { supabase } from '../lib/supabase';

export const parseBundleLimits = (description) => {
  if (!description) return { cleanDescription: '', bundleMinTotal: null, bundleMaxTotal: null };
  const match = description.match(/<!--BUNDLE_LIMITS:(.*?)-->/);
  let bundleMinTotal = null;
  let bundleMaxTotal = null;
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      bundleMinTotal = parsed.min !== undefined && parsed.min !== null ? Number(parsed.min) : null;
      bundleMaxTotal = parsed.max !== undefined && parsed.max !== null ? Number(parsed.max) : null;
    } catch (e) {}
  }
  const cleanDescription = description.replace(/<!--BUNDLE_LIMITS:.*?-->/g, '').trim();
  return { cleanDescription, bundleMinTotal, bundleMaxTotal };
};

export const formatDescriptionWithLimits = (description, minTotal, maxTotal) => {
  const baseDesc = (description || '').replace(/<!--BUNDLE_LIMITS:.*?-->/g, '').trim();
  const minVal = minTotal !== '' && minTotal !== null && minTotal !== undefined && !isNaN(minTotal) ? Number(minTotal) : null;
  const maxVal = maxTotal !== '' && maxTotal !== null && maxTotal !== undefined && !isNaN(maxTotal) ? Number(maxTotal) : null;
  if (minVal !== null || maxVal !== null) {
    const tag = `<!--BUNDLE_LIMITS:${JSON.stringify({ min: minVal, max: maxVal })}-->`;
    return baseDesc ? `${baseDesc} ${tag}` : tag;
  }
  return baseDesc;
};

// Deduplica filas de product_ingredients por ingrediente: el PK es (product_id, ingredient_id),
// así que un mismo ingrediente no puede repetirse (ej. seleccionado como base Y extra, o con
// entradas por variante). Se priorizan las entradas a nivel de producto (variant_option_id null).
const buildIngredientsRows = (productId, baseIngredients, extraIngredients, variantIdMap) => {
  const base = baseIngredients || [];
  const extra = extraIngredients || [];
  const all = [...base, ...extra];
  const rows = [];
  const seen = new Set();

  const getFlags = (ingId) => ({
    isBase: base.some(i => (typeof i === 'string' ? i : i.ingredientId) === ingId),
    isExtra: extra.some(i => (typeof i === 'string' ? i : i.ingredientId) === ingId)
  });

  const pushRow = (ing, ingId) => {
    if (!ingId || seen.has(ingId)) return;
    seen.add(ingId);
    const { isBase, isExtra } = getFlags(ingId);
    const rawVariantId = (typeof ing === 'string' ? null : ing.variantOptionId) || null;
    rows.push({
      product_id: productId,
      ingredient_id: ingId,
      is_base: isBase,
      is_extra: isExtra,
      portion_multiplier: (typeof ing === 'string' ? 1 : ing.portionMultiplier) || 1,
      variant_option_id: rawVariantId ? (variantIdMap[rawVariantId] || rawVariantId) : null
    });
  };

  // Primero las entradas a nivel de producto
  for (const ing of all) {
    const ingId = typeof ing === 'string' ? ing : ing.ingredientId;
    if (ing && (typeof ing === 'string' || !ing.variantOptionId)) pushRow(ing, ingId);
  }
  // Luego las entradas por variante (solo si el ingrediente aún no está)
  for (const ing of all) {
    const ingId = typeof ing === 'string' ? ing : ing.ingredientId;
    if (ing && typeof ing !== 'string' && ing.variantOptionId) pushRow(ing, ingId);
  }

  return rows;
};

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
  
  // Fallback if no user is logged in
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

export const getCategories = async (organizationId) => {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, is_active, image_url, sort_order, show_in_pos, show_online, show_in_whatsapp, product_categories(product_id)')
    .eq('organization_id', organizationId)
    .order('sort_order')
    .order('name');
    
  if (error) {
    console.error('Error fetching categories:', error);
    return [];
  }
  
  return data.map(c => ({
    ...c,
    product_count: c.product_categories?.length || 0
  }));
};

export const getProducts = async (organizationId, filters = {}) => {
  if (!organizationId) return [];
  
  let query = supabase
    .from('products')
    .select(`
      id,
      name,
      base_price,
      description,
      type,
      status,
      sort_order,
      product_categories (
        categories (
          id,
          name
        )
      ),
      product_images (
        url
      ),
      variant_groups(
        id,
        name,
        variant_options(
          id,
          variant_group_id,
          name,
          sku,
          price_modifier,
          is_active
        )
      ),
      product_ingredients (
        is_base,
        is_extra,
        portion_multiplier,
        variant_option_id,
        ingredients (
          id,
          name,
          price,
          is_active,
          unit,
          stock_quantity,
          low_stock_threshold,
          portion_quantity,
          icon
        )
      ),
      bundle_slots (
        id,
        name,
        min_selections,
        max_selections,
        bundle_slot_options (
          id,
          product_id,
          variant_id,
          price_modifier,
          is_default,
          products (
            id,
            name,
            base_price,
            status,
            variant_groups(
              id,
              name,
              variant_options(
                id,
                variant_group_id,
                name,
                sku,
                price_modifier,
                is_active
              )
            ),
            product_ingredients (
              is_base,
              is_extra,
              portion_multiplier,
              variant_option_id,
              ingredients (
                id,
                name,
                price,
                is_active,
                unit,
                stock_quantity,
                low_stock_threshold,
                portion_quantity,
                icon
              )
            )
          )
        )
      )
    `)
    .eq('organization_id', organizationId);

  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching products:', error);
    return [];
  }
  
  // Transform the nested Supabase relation into a flat object for the UI
  const formattedData = data.map(product => {
    const categoryInfo = product.product_categories?.[0]?.categories;
    const variantGroup = product.variant_groups && product.variant_groups.length > 0 
      ? product.variant_groups[product.variant_groups.length - 1] 
      : null;
    const { cleanDescription, bundleMinTotal, bundleMaxTotal } = parseBundleLimits(product.description);

    return {
      id: product.id,
      name: product.name,
      price: product.base_price,
      description: cleanDescription,
      bundleMinTotal,
      bundleMaxTotal,
      type: product.type || 'physical',
      sortOrder: product.sort_order ?? Number.MAX_SAFE_INTEGER,
      category: categoryInfo?.name || 'General',
      categoryId: categoryInfo?.id || 'none',
      image: product.product_images?.[0]?.url || null,
      status: product.status === 'available' ? 'Disponible' : 'No disponible',
      variants: variantGroup?.variant_options || [],
      ingredients: product.product_ingredients?.map(pi => {
        if (!pi.ingredients) return null;
        return {
          ...pi.ingredients,
          isBase: pi.is_base !== false,
          isExtra: pi.is_extra === true,
          portionMultiplier: pi.portion_multiplier || 1,
          variantOptionId: pi.variant_option_id || null
        };
      }).filter(Boolean) || [],
      bundleSlots: product.bundle_slots?.map(slot => ({
        id: slot.id,
        name: slot.name,
        minSelections: slot.min_selections,
        maxSelections: slot.max_selections,
        options: slot.bundle_slot_options?.map(opt => {
          const optProd = opt.products;
          const optVariants = optProd?.variant_groups?.[optProd.variant_groups.length - 1]?.variant_options || [];
          return {
            id: opt.id,
            productId: opt.product_id,
            variantId: opt.variant_id || null,
            priceModifier: parseFloat(opt.price_modifier || 0),
            isDefault: opt.is_default || false,
            name: optProd?.name || '',
            basePrice: optProd?.base_price || 0,
            status: optProd?.status || 'available',
            variants: optVariants,
            ingredients: optProd?.product_ingredients?.map(pi => {
              if (!pi.ingredients) return null;
              return {
                ...pi.ingredients,
                isBase: pi.is_base !== false,
                isExtra: pi.is_extra === true,
                portionMultiplier: pi.portion_multiplier || 1,
                variantOptionId: pi.variant_option_id || null
              };
            }).filter(Boolean) || []
          };
        }) || []
      })) || []
    };
  });

  return formattedData.sort((a, b) => {
    const so = (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER)
    if (so !== 0) return so
    return (a.name || '').localeCompare(b.name || '')
  });
};

export const createCategory = async (organizationId, categoryData) => {
  if (!organizationId) throw new Error("No organization ID");

  // Las categorías nuevas se agregan al final del orden
  const { data: lastRow } = await supabase
    .from('categories')
    .select('sort_order')
    .eq('organization_id', organizationId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSortOrder = (lastRow?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from('categories')
    .insert([
      { 
        organization_id: organizationId,
        name: categoryData.name,
        is_active: true, // global switch, kept true by default
        show_in_pos: categoryData.show_in_pos !== false,
        show_online: categoryData.show_online !== false,
        show_in_whatsapp: categoryData.show_in_whatsapp !== false,
        image_url: categoryData.imageUrl || null,
        sort_order: nextSortOrder
      }
    ])
    .select();
    
  if (error) {
    console.error('Error creating category:', error);
    throw error;
  }
  
  const categoryId = data[0].id;
  
  // Assign items if provided
  if (categoryData.items && categoryData.items.length > 0) {
    // First remove these products from ANY other categories (enforce 1 category per product in UI logic)
    await supabase.from('product_categories').delete().in('product_id', categoryData.items);

    const pcData = categoryData.items.map(productId => ({
      product_id: productId,
      category_id: categoryId
    }));
    const { error: pcError } = await supabase.from('product_categories').insert(pcData);
    if (pcError) console.error('Error linking products to category:', pcError);
  }
  
  return data[0];
};

export const createProduct = async (organizationId, productData) => {
  if (!organizationId) throw new Error("No organization ID");

  // Los productos nuevos se agregan al final del orden
  const { data: lastRow } = await supabase
    .from('products')
    .select('sort_order')
    .eq('organization_id', organizationId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSortOrder = (lastRow?.sort_order ?? -1) + 1;

  // First insert product
  const { data: product, error: prodError } = await supabase
    .from('products')
    .insert([
      {
        organization_id: organizationId,
        name: productData.name,
        description: formatDescriptionWithLimits(productData.description, productData.bundleMinTotal, productData.bundleMaxTotal),
        base_price: productData.price || 0,
        sku: productData.sku || null,
        gtin: productData.gtin || null,
        type: productData.type === 'Servicio' ? 'service' : (productData.type === 'Combo / Promoción' || productData.type === 'bundle' ? 'bundle' : 'physical'),
        status: productData.status || 'available',
        sort_order: nextSortOrder
      }
    ])
    .select()
    .single();
    
  if (prodError) {
    console.error('Error creating product:', prodError);
    throw prodError;
  }
  
  // Guardar categoría si fue seleccionada
  if (productData.categoryId && productData.categoryId !== 'none') {
    const { error: catError } = await supabase
      .from('product_categories')
      .insert([
        { product_id: product.id, category_id: productData.categoryId }
      ]);
    if (catError) console.error('Error assigning category:', catError);
  }

  // Guardar imagen si fue ingresada
  if (productData.imageUrl) {
    const { error: imgError } = await supabase
      .from('product_images')
      .insert([
        { product_id: product.id, url: productData.imageUrl, is_primary: true }
      ]);
    if (imgError) console.error('Error assigning image:', imgError);
  }
  
  // Guardar variantes
  let variantIdMap = {};
  if (productData.variants && productData.variants.length > 0) {
    const { data: variantGroup, error: groupError } = await supabase
      .from('variant_groups')
      .insert([{ product_id: product.id, name: 'Variantes' }])
      .select()
      .single();

    if (groupError) {
      console.error('Error creating variant group:', groupError);
    } else {
      const optionsToInsert = productData.variants.map(v => ({
        variant_group_id: variantGroup.id,
        name: v.name,
        sku: v.sku,
        price_modifier: v.price_modifier,
        is_active: v.is_active
      }));
      const { data: createdOptions, error: optionsError } = await supabase
        .from('variant_options')
        .insert(optionsToInsert)
        .select('id');
        
      if (optionsError) {
        console.error('Error creating variant options:', optionsError);
      } else {
        (productData.variants || []).forEach((v, i) => {
          if (createdOptions && createdOptions[i]) {
            if (v.uiId) variantIdMap[v.uiId] = createdOptions[i].id;
            if (v.id) variantIdMap[v.id] = createdOptions[i].id;
          }
        });
      }
    }
  }

  // Guardar ingredientes
  if (productData.baseIngredients || productData.extraIngredients) {
    const ingredientsToInsert = buildIngredientsRows(product.id, productData.baseIngredients, productData.extraIngredients, variantIdMap);
    
    if (ingredientsToInsert.length > 0) {
      const { error: ingError } = await supabase
        .from('product_ingredients')
        .insert(ingredientsToInsert);
      if (ingError) console.error('Error assigning ingredients:', ingError);
    }
  }

  // Guardar slots y opciones de combo
  if ((productData.type === 'Combo / Promoción' || productData.type === 'bundle') && productData.bundleSlots && productData.bundleSlots.length > 0) {
    for (const slot of productData.bundleSlots) {
      const { data: insertedSlot, error: slotError } = await supabase
        .from('bundle_slots')
        .insert([{
          bundle_id: product.id,
          name: slot.name,
          min_selections: slot.minSelections !== undefined ? slot.minSelections : (slot.min_selections || 1),
          max_selections: slot.maxSelections !== undefined ? slot.maxSelections : (slot.max_selections || 1),
          sort_order: slot.sort_order || 0
        }])
        .select()
        .single();

      if (slotError) {
        console.error('Error creating bundle slot:', slotError);
        continue;
      }

      if (slot.options && slot.options.length > 0) {
        const optionsToInsert = slot.options.map(opt => ({
          bundle_slot_id: insertedSlot.id,
          product_id: opt.productId || opt.product_id,
          variant_id: opt.variantId || opt.variant_id || null,
          price_modifier: opt.priceModifier !== undefined ? opt.priceModifier : (opt.price_modifier || 0),
          is_default: opt.isDefault !== undefined ? opt.isDefault : (opt.is_default || false),
          sort_order: opt.sort_order || 0
        }));

        const { error: optsError } = await supabase
          .from('bundle_slot_options')
          .insert(optionsToInsert);

        if (optsError) {
          console.error('Error creating bundle slot options:', optsError);
        }
      }
    }
  }
  
  return product;
};

export const getCategoryById = async (id) => {
  const { data, error } = await supabase
    .from('categories')
    .select(`
      *,
      product_categories(product_id)
    `)
    .eq('id', id)
    .single();
    
  if (error) throw error;
  return data;
};

export const updateCategory = async (id, categoryData) => {
  const { data, error } = await supabase
    .from('categories')
    .update({ 
      name: categoryData.name,
      show_in_pos: categoryData.show_in_pos !== false,
      show_online: categoryData.show_online !== false,
      show_in_whatsapp: categoryData.show_in_whatsapp !== false,
      image_url: categoryData.imageUrl || null
    })
    .eq('id', id)
    .select();
    
  if (error) throw error;
  
  // Update items if provided
  if (categoryData.items) {
    // Delete all current associations for this category
    await supabase.from('product_categories').delete().eq('category_id', id);
    
    // Insert new ones
    if (categoryData.items.length > 0) {
      // First remove these products from ANY other categories (enforce 1 category per product in UI logic)
      await supabase.from('product_categories').delete().in('product_id', categoryData.items);

      const pcData = categoryData.items.map(productId => ({
        product_id: productId,
        category_id: id
      }));
      const { error: pcError } = await supabase.from('product_categories').insert(pcData);
      if (pcError) console.error('Error linking products to category:', pcError);
    }
  }

  return data[0];
};

export const getProductById = async (id) => {
  const { data, error } = await supabase
    .from('products')
    .select(`
      *,
      product_categories(category_id),
      product_images(url),
      variant_groups(
        id,
        name,
        variant_options(
          id,
          variant_group_id,
          name,
          sku,
          price_modifier,
          is_active
        )
      ),
      product_ingredients (
        ingredient_id,
        is_base,
        is_extra,
        portion_multiplier,
        variant_option_id
      ),
      bundle_slots (
        id,
        name,
        min_selections,
        max_selections,
        bundle_slot_options (
          id,
          product_id,
          variant_id,
          price_modifier,
          is_default,
          products (
            name
          )
        )
      )
    `)
    .eq('id', id)
    .single();
    
  if (error) throw error;
  
  if (data) {
    const { cleanDescription, bundleMinTotal, bundleMaxTotal } = parseBundleLimits(data.description);
    data.rawDescription = data.description;
    data.description = cleanDescription;
    data.bundleMinTotal = bundleMinTotal;
    data.bundleMaxTotal = bundleMaxTotal;
    data.categoryId = data.product_categories?.[0]?.category_id || 'none';
    data.imageUrl = data.product_images?.[0]?.url || '';
    
    // Extraer variantes del último grupo (el más reciente)
    if (data.variant_groups && data.variant_groups.length > 0) {
      data.variants = data.variant_groups[data.variant_groups.length - 1].variant_options || [];
    } else {
      data.variants = [];
    }
    
    // Extraer ingredientes
    data.baseIngredients = data.product_ingredients?.filter(pi => pi.is_base !== false).map(pi => ({
      ingredientId: pi.ingredient_id,
      portionMultiplier: pi.portion_multiplier || 1,
      variantOptionId: pi.variant_option_id || null
    })) || [];
    data.extraIngredients = data.product_ingredients?.filter(pi => pi.is_extra === true).map(pi => ({
      ingredientId: pi.ingredient_id,
      portionMultiplier: pi.portion_multiplier || 1,
      variantOptionId: pi.variant_option_id || null
    })) || [];

    // Extraer slots y opciones de combo
    if (data.bundle_slots) {
      data.bundleSlots = data.bundle_slots.map(slot => ({
        id: slot.id,
        name: slot.name,
        minSelections: slot.min_selections,
        maxSelections: slot.max_selections,
        options: slot.bundle_slot_options?.map(opt => ({
          id: opt.id,
          productId: opt.product_id,
          variantId: opt.variant_id || null,
          priceModifier: parseFloat(opt.price_modifier || 0),
          isDefault: opt.is_default || false,
          name: opt.products?.name || ''
        })) || []
      }));
    } else {
      data.bundleSlots = [];
    }
  }
  return data;
};

export const updateProduct = async (id, productData) => {
  const updatePayload = {
    name: productData.name,
    description: formatDescriptionWithLimits(productData.description, productData.bundleMinTotal, productData.bundleMaxTotal),
    base_price: productData.price || 0,
    sku: productData.sku || null,
    gtin: productData.gtin || null,
    type: productData.type === 'Servicio' ? 'service' : (productData.type === 'Combo / Promoción' || productData.type === 'bundle' ? 'bundle' : 'physical'),
  };
  
  if (productData.status !== undefined) {
    updatePayload.status = productData.status;
  }

  const { data, error } = await supabase
    .from('products')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single();
    
  if (error) throw error;

  // Actualizar categoría
  if (productData.categoryId) {
    // 1. Eliminar categoría actual
    await supabase.from('product_categories').delete().eq('product_id', id);
    
    // 2. Insertar nueva (si no es 'none')
    if (productData.categoryId !== 'none') {
      const { error: catError } = await supabase
        .from('product_categories')
        .insert([{ product_id: id, category_id: productData.categoryId }]);
      if (catError) console.error('Error updating category assignment:', catError);
    }
  }

  // Actualizar imagen
  if (productData.imageUrl !== undefined) {
    await supabase.from('product_images').delete().eq('product_id', id);
    if (productData.imageUrl.trim() !== '') {
      const { error: imgError } = await supabase
        .from('product_images')
        .insert([{ product_id: id, url: productData.imageUrl, is_primary: true }]);
      if (imgError) console.error('Error updating image assignment:', imgError);
    }
  }

  // Actualizar variantes
  let variantIdMap = {};
  if (productData.variants) {
    // Eliminar grupos actuales (elimina opciones en cascada)
    await supabase.from('variant_groups').delete().eq('product_id', id);
    
    if (productData.variants.length > 0) {
      const { data: variantGroup, error: groupError } = await supabase
        .from('variant_groups')
        .insert([{ product_id: id, name: 'Variantes' }])
        .select()
        .single();
        
      if (!groupError) {
        const optionsToInsert = productData.variants.map(v => ({
          variant_group_id: variantGroup.id,
          name: v.name,
          sku: v.sku,
          price_modifier: v.price_modifier,
          is_active: v.is_active
        }));
        const { data: createdOptions, error: optionsError } = await supabase
          .from('variant_options')
          .insert(optionsToInsert)
          .select('id');

        if (optionsError) {
          console.error('Error creating variant options in update:', optionsError);
        } else {
          (productData.variants || []).forEach((v, i) => {
            if (createdOptions && createdOptions[i]) variantIdMap[v.uiId] = createdOptions[i].id;
          });
        }
      } else {
        console.error('Error creating variant group in update:', groupError);
      }
    }
  }

  // Actualizar ingredientes
  if (productData.baseIngredients !== undefined || productData.extraIngredients !== undefined) {
    await supabase.from('product_ingredients').delete().eq('product_id', id);
    
    const ingredientsToInsert = buildIngredientsRows(id, productData.baseIngredients, productData.extraIngredients, variantIdMap);
    
    if (ingredientsToInsert.length > 0) {
      const { error: ingError } = await supabase
        .from('product_ingredients')
        .insert(ingredientsToInsert);
      if (ingError) console.error('Error updating ingredients:', ingError);
    }
  }

  // Actualizar slots y opciones de combo
  if (productData.type === 'Combo / Promoción' || productData.type === 'bundle' || productData.bundleSlots) {
    // Eliminar slots actuales (elimina opciones en cascada)
    await supabase.from('bundle_slots').delete().eq('bundle_id', id);

    if (productData.bundleSlots && productData.bundleSlots.length > 0) {
      for (const slot of productData.bundleSlots) {
        const { data: insertedSlot, error: slotError } = await supabase
          .from('bundle_slots')
          .insert([{
            bundle_id: id,
            name: slot.name,
            min_selections: slot.minSelections !== undefined ? slot.minSelections : (slot.min_selections || 1),
            max_selections: slot.maxSelections !== undefined ? slot.maxSelections : (slot.max_selections || 1),
            sort_order: slot.sort_order || 0
          }])
          .select()
          .single();

        if (slotError) {
          console.error('Error creating bundle slot in update:', slotError);
          continue;
        }

        if (slot.options && slot.options.length > 0) {
          const optionsToInsert = slot.options.map(opt => ({
            bundle_slot_id: insertedSlot.id,
            product_id: opt.productId || opt.product_id,
            variant_id: opt.variantId || opt.variant_id || null,
            price_modifier: opt.priceModifier !== undefined ? opt.priceModifier : (opt.price_modifier || 0),
            is_default: opt.isDefault !== undefined ? opt.isDefault : (opt.is_default || false),
            sort_order: opt.sort_order || 0
          }));

          const { error: optsError } = await supabase
            .from('bundle_slot_options')
            .insert(optionsToInsert);

          if (optsError) {
            console.error('Error creating bundle slot options in update:', optsError);
          }
        }
      }
    }
  }

  return data;
};

export const reorderProducts = async (orderedProducts) => {
  if (!orderedProducts || orderedProducts.length === 0) return;
  const updates = orderedProducts.map(p => (
    supabase.from('products').update({ sort_order: p.sort_order }).eq('id', p.id)
  ));
  const results = await Promise.all(updates);
  const err = results.find(r => r.error);
  if (err) throw err.error;
};

export const reorderCategories = async (orderedCategories) => {
  if (!orderedCategories || orderedCategories.length === 0) return;
  const updates = orderedCategories.map(c => (
    supabase.from('categories').update({ sort_order: c.sort_order }).eq('id', c.id)
  ));
  const results = await Promise.all(updates);
  const err = results.find(r => r.error);
  if (err) throw err.error;
};

export const quickUpdateProductStatus = async (id, status) => {
  const enumStatus = typeof status === 'boolean' ? (status ? 'available' : 'unavailable') : status;
  const { error } = await supabase
    .from('products')
    .update({ status: enumStatus })
    .eq('id', id);
  if (error) throw error;
};

export const quickUpdateProductCategory = async (id, categoryId) => {
  await supabase.from('product_categories').delete().eq('product_id', id);
  if (categoryId !== 'none') {
    const { error } = await supabase
      .from('product_categories')
      .insert([{ product_id: id, category_id: categoryId }]);
    if (error) throw error;
  }
};

export const quickUpdateCategoryStatus = async (id, isActive) => {
  const { error } = await supabase
    .from('categories')
    .update({ is_active: isActive })
    .eq('id', id);
  if (error) throw error;
};

// ── INGREDIENTS CRUD ──────────────────────────────────────────────

export const getIngredients = async (organizationId) => {
  const { data, error } = await supabase
    .from('ingredients')
    .select('*')
    .eq('organization_id', organizationId)
    .order('name');
    
  if (error) {
    console.error('Error fetching ingredients:', error);
    return [];
  }
  return data;
};

export const createIngredient = async (organizationId, ingredientData) => {
  const { data, error } = await supabase
    .from('ingredients')
    .insert([
      { 
        organization_id: organizationId,
        name: ingredientData.name,
        price: ingredientData.price || 0,
        is_active: ingredientData.is_active !== false,
        image_url: ingredientData.image_url || null,
        icon: ingredientData.icon || null,
        unit: ingredientData.unit || 'unit',
        stock_quantity: ingredientData.stock_quantity || 0,
        low_stock_threshold: ingredientData.low_stock_threshold || null,
        portion_quantity: ingredientData.portion_quantity || 0
      }
    ])
    .select();
    
  if (error) throw error;

  if (ingredientData.stock_quantity && parseFloat(ingredientData.stock_quantity) > 0) {
    await supabase
      .from('ingredient_movements')
      .insert([{
        ingredient_id: data[0].id,
        organization_id: organizationId,
        quantity: ingredientData.stock_quantity,
        movement_type: 'initial_stock',
        reference_type: 'manual',
        notes: 'Stock inicial',
      }]);
  }

  return data[0];
};

export const updateIngredient = async (id, ingredientData) => {
  const { data, error } = await supabase
    .from('ingredients')
    .update({ 
      name: ingredientData.name,
      price: ingredientData.price || 0,
      is_active: ingredientData.is_active !== false,
      image_url: ingredientData.image_url !== undefined ? ingredientData.image_url : null,
      icon: ingredientData.icon !== undefined ? ingredientData.icon : null,
      unit: ingredientData.unit !== undefined ? ingredientData.unit : undefined,
      stock_quantity: ingredientData.stock_quantity !== undefined ? ingredientData.stock_quantity : undefined,
      low_stock_threshold: ingredientData.low_stock_threshold !== undefined ? ingredientData.low_stock_threshold : null,
      portion_quantity: ingredientData.portion_quantity !== undefined ? ingredientData.portion_quantity : 0
    })
    .eq('id', id)
    .select();
    
  if (error) throw error;
  return data[0];
};

export const deleteIngredient = async (id) => {
  const { error } = await supabase
    .from('ingredients')
    .delete()
    .eq('id', id);
    
  if (error) throw error;
};

// ── BULK CRUD & DUPLICATION ──────────────────────────────────────────────

export const deleteCategory = async (id) => {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw error;
};

export const bulkDeleteCategories = async (ids) => {
  if (!ids || ids.length === 0) return;
  const { error } = await supabase.from('categories').delete().in('id', ids);
  if (error) throw error;
};

export const duplicateCategory = async (id) => {
  const cat = await getCategoryById(id);
  const { data, error } = await supabase
    .from('categories')
    .insert([{
      organization_id: cat.organization_id,
      name: `Copia de ${cat.name}`,
      is_active: cat.is_active,
      image_url: cat.image_url
    }])
    .select();
  if (error) throw error;
  return data[0];
};

export const deleteProduct = async (id) => {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
};

export const bulkDeleteProducts = async (ids) => {
  if (!ids || ids.length === 0) return;
  const { error } = await supabase.from('products').delete().in('id', ids);
  if (error) throw error;
};

export const bulkUpdateProductCategory = async (ids, categoryId) => {
  if (!ids || ids.length === 0) return;
  await supabase.from('product_categories').delete().in('product_id', ids);
  
  if (categoryId !== 'none') {
    const records = ids.map(id => ({ product_id: id, category_id: categoryId }));
    const { error } = await supabase.from('product_categories').insert(records);
    if (error) throw error;
  }
};

export const bulkUpdateProductStatus = async (ids, status) => {
  if (!ids || ids.length === 0) return;
  const { error } = await supabase.from('products').update({ status }).in('id', ids);
  if (error) throw error;
};

export const duplicateProduct = async (id) => {
  const prod = await getProductById(id);
  const newProductData = {
    name: `DUPLICADO de "${prod.name}"`,
    description: prod.description,
    bundleMinTotal: prod.bundleMinTotal,
    bundleMaxTotal: prod.bundleMaxTotal,
    price: prod.base_price,
    sku: prod.sku,
    gtin: prod.gtin,
    type: prod.type === 'service' ? 'Servicio' : (prod.type === 'bundle' ? 'bundle' : 'physical'),
    status: prod.status || 'available',
    categoryId: prod.categoryId,
    imageUrl: prod.imageUrl,
    variants: prod.variants,
    baseIngredients: prod.baseIngredients,
    extraIngredients: prod.extraIngredients,
    bundleSlots: prod.bundleSlots
  };
  return await createProduct(prod.organization_id, newProductData);
};

export const bulkDeleteIngredients = async (ids) => {
  if (!ids || ids.length === 0) return;
  const { error } = await supabase.from('ingredients').delete().in('id', ids);
  if (error) throw error;
};

export const duplicateIngredient = async (id) => {
  const { data: ing, error: fetchErr } = await supabase
    .from('ingredients')
    .select('*')
    .eq('id', id)
    .single();
  if (fetchErr) throw fetchErr;

  const newIngData = {
    name: `Copia de ${ing.name}`,
    price: ing.price,
    is_active: ing.is_active,
    image_url: ing.image_url,
    icon: ing.icon,
    unit: ing.unit,
    stock_quantity: ing.stock_quantity,
    low_stock_threshold: ing.low_stock_threshold,
    portion_quantity: ing.portion_quantity
  };
  return await createIngredient(ing.organization_id, newIngData);
};

