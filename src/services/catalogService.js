import { supabase } from '../lib/supabase';

export const getFirstOrganizationId = async () => {
  const { data, error } = await supabase
    .from('organizations')
    .select('id')
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
    .select('id, name, is_active, image_url, product_categories(product_id)')
    .eq('organization_id', organizationId)
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
      status,
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
        ingredients (
          id,
          name,
          price,
          is_active
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
  return data.map(product => {
    const categoryInfo = product.product_categories?.[0]?.categories;
    const variantGroup = product.variant_groups && product.variant_groups.length > 0 
      ? product.variant_groups[product.variant_groups.length - 1] 
      : null;

    return {
      id: product.id,
      name: product.name,
      price: product.base_price,
      description: product.description,
      category: categoryInfo?.name || 'General',
      categoryId: categoryInfo?.id || 'none',
      image: product.product_images?.[0]?.url || null,
      status: product.status === 'available' ? 'Disponible' : 'No disponible',
      variants: variantGroup?.variant_options || [],
      ingredients: product.product_ingredients?.map(pi => pi.ingredients).filter(Boolean) || []
    };
  });
};

export const createCategory = async (organizationId, categoryData) => {
  if (!organizationId) throw new Error("No organization ID");
  
  const { data, error } = await supabase
    .from('categories')
    .insert([
      { 
        organization_id: organizationId,
        name: categoryData.name,
        is_active: categoryData.posEnabled !== false,
        image_url: categoryData.imageUrl || null
      }
    ])
    .select();
    
  if (error) {
    console.error('Error creating category:', error);
    throw error;
  }
  return data[0];
};

export const createProduct = async (organizationId, productData) => {
  if (!organizationId) throw new Error("No organization ID");

  // First insert product
  const { data: product, error: prodError } = await supabase
    .from('products')
    .insert([
      {
        organization_id: organizationId,
        name: productData.name,
        description: productData.description || '',
        base_price: productData.price || 0,
        sku: productData.sku || null,
        gtin: productData.gtin || null,
        type: productData.type === 'Servicio' ? 'service' : 'physical',
        status: 'available'
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
      const { error: optionsError } = await supabase
        .from('variant_options')
        .insert(optionsToInsert);
        
      if (optionsError) console.error('Error creating variant options:', optionsError);
    }
  }

  // Guardar ingredientes
  if (productData.ingredients && productData.ingredients.length > 0) {
    const ingredientsToInsert = productData.ingredients.map(ingId => ({
      product_id: product.id,
      ingredient_id: ingId
    }));
    const { error: ingError } = await supabase
      .from('product_ingredients')
      .insert(ingredientsToInsert);
    if (ingError) console.error('Error assigning ingredients:', ingError);
  }
  
  return product;
};

export const getCategoryById = async (id) => {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
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
      is_active: categoryData.posEnabled !== false,
      image_url: categoryData.imageUrl || null
    })
    .eq('id', id)
    .select();
    
  if (error) throw error;
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
        ingredient_id
      )
    `)
    .eq('id', id)
    .single();
    
  if (error) throw error;
  
  if (data) {
    data.categoryId = data.product_categories?.[0]?.category_id || 'none';
    data.imageUrl = data.product_images?.[0]?.url || '';
    
    // Extraer variantes del último grupo (el más reciente)
    if (data.variant_groups && data.variant_groups.length > 0) {
      data.variants = data.variant_groups[data.variant_groups.length - 1].variant_options || [];
    } else {
      data.variants = [];
    }
    
    // Extraer ingredientes
    data.ingredients = data.product_ingredients?.map(pi => pi.ingredient_id) || [];
  }
  return data;
};

export const updateProduct = async (id, productData) => {
  const { data, error } = await supabase
    .from('products')
    .update({
      name: productData.name,
      description: productData.description || '',
      base_price: productData.price || 0,
      sku: productData.sku || null,
      gtin: productData.gtin || null,
      type: productData.type === 'Servicio' ? 'service' : 'physical',
    })
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
        await supabase.from('variant_options').insert(optionsToInsert);
      } else {
        console.error('Error creating variant group in update:', groupError);
      }
    }
  }

  // Actualizar ingredientes
  if (productData.ingredients) {
    await supabase.from('product_ingredients').delete().eq('product_id', id);
    if (productData.ingredients.length > 0) {
      const ingredientsToInsert = productData.ingredients.map(ingId => ({
        product_id: id,
        ingredient_id: ingId
      }));
      const { error: ingError } = await supabase
        .from('product_ingredients')
        .insert(ingredientsToInsert);
      if (ingError) console.error('Error updating ingredients:', ingError);
    }
  }

  return data;
};

export const quickUpdateProductStatus = async (id, status) => {
  const { error } = await supabase
    .from('products')
    .update({ status: status })
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
        is_active: ingredientData.is_active !== false
      }
    ])
    .select();
    
  if (error) throw error;
  return data[0];
};

export const updateIngredient = async (id, ingredientData) => {
  const { data, error } = await supabase
    .from('ingredients')
    .update({ 
      name: ingredientData.name,
      price: ingredientData.price || 0,
      is_active: ingredientData.is_active !== false
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

