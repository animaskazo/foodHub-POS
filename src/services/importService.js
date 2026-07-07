import { getFirstOrganizationId, createCategory, createIngredient, createProduct } from './catalogService';

/**
 * Procesa y guarda el JSON de menú estructurado en Supabase
 */
export const processAndSaveMenu = async (menuData) => {
  const orgId = await getFirstOrganizationId();
  if (!orgId) throw new Error("Organización no encontrada");

  const categoryMap = {}; // name -> id
  const ingredientMap = {}; // name -> id
  
  // 1. Guardar Categorías
  if (menuData.categories && menuData.categories.length > 0) {
    for (const catName of menuData.categories) {
      try {
        const cat = await createCategory(orgId, {
          name: catName,
          posEnabled: true,
          imageUrl: ''
        });
        categoryMap[catName] = cat.id;
      } catch (e) {
        console.error(`Error creando categoría ${catName}`, e);
      }
    }
  }

  // 2. Guardar Ingredientes
  if (menuData.ingredients && menuData.ingredients.length > 0) {
    for (const ing of menuData.ingredients) {
      try {
        const createdIng = await createIngredient(orgId, {
          name: ing.name,
          price: ing.price || 0,
          is_active: true
        });
        ingredientMap[ing.name] = createdIng.id;
      } catch (e) {
        console.error(`Error creando ingrediente ${ing.name}`, e);
      }
    }
  }

  // 3. Guardar Productos
  if (menuData.products && menuData.products.length > 0) {
    for (const prod of menuData.products) {
      try {
        const catId = categoryMap[prod.category] || 'none';
        
        // Mapear los nombres de ingredientes a IDs
        const ingredientIds = [];
        if (prod.ingredients && prod.ingredients.length > 0) {
          for (const ingName of prod.ingredients) {
            if (ingredientMap[ingName]) {
              ingredientIds.push(ingredientMap[ingName]);
            }
          }
        }

        await createProduct(orgId, {
          name: prod.name,
          description: prod.description || '',
          price: prod.price || 0,
          categoryId: catId,
          type: 'Producto físico',
          ingredients: ingredientIds,
          status: 'available'
        });
      } catch (e) {
        console.error(`Error creando producto ${prod.name}`, e);
      }
    }
  }

  return true;
};
