
import { getFirstOrganizationId, createCategory, createIngredient, createProduct } from './catalogService';
import { recommendIngredientIcon, FOOD_ICONS } from '../utils/ingredientIcons';

/**
 * Normaliza la cadena de unidad de medida ingresada en Excel a las permitidas por el sistema.
 */
const normalizeUnit = (rawUnit) => {
  if (!rawUnit) return 'unit';
  const u = String(rawUnit).trim().toLowerCase();
  if (['g', 'gr', 'gramo', 'gramos'].includes(u)) return 'g';
  if (['kg', 'kgs', 'kilo', 'kilos', 'kilogramo', 'kilogramos'].includes(u)) return 'kg';
  if (['ml', 'cc', 'mililitro', 'mililitros'].includes(u)) return 'ml';
  if (['l', 'lt', 'lts', 'litro', 'litros'].includes(u)) return 'l';
  if (['oz', 'onza', 'onzas'].includes(u)) return 'oz';
  if (['lb', 'lbs', 'libra', 'libras'].includes(u)) return 'lb';
  return 'unit';
};

/**
 * Normaliza las llaves de encabezado de Excel para emparejar campos sin importar mayúsculas, acentos o espacios.
 */
const normalizeHeaderKey = (headerKey) => {
  return String(headerKey)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
};

/**
 * Lee y parsea un archivo Excel (.xlsx, .xls, .csv) convirtiéndolo en un arreglo de ingredientes estructurados.
 */
export const parseIngredientsExcel = async (file) => {
  const XLSX = await import('xlsx');
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

  if (!rawRows || rawRows.length === 0) {
    throw new Error("El archivo Excel está vacío o no contiene filas procesables.");
  }

  const parsedIngredients = rawRows.map((row, index) => {
    let name = '';
    let price = 0;
    let unit = 'unit';
    let stock_quantity = 0;
    let low_stock_threshold = null;
    let portion_quantity = 0;
    let icon = null;

    for (const [key, val] of Object.entries(row)) {
      const normKey = normalizeHeaderKey(key);
      const valStr = String(val).trim();

      if (normKey.includes('nombre') || normKey.includes('ingrediente') || normKey === 'name' || normKey === 'item') {
        if (!name) name = valStr;
      } else if (normKey.includes('precio') || normKey.includes('costo') || normKey.includes('price')) {
        const parsedVal = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
        if (!isNaN(parsedVal)) price = parsedVal;
      } else if (normKey.includes('unidad') || normKey.includes('medida') || normKey === 'unit' || normKey === 'uom') {
        unit = normalizeUnit(valStr);
      } else if (normKey.includes('porcion') || normKey.includes('portion')) {
        const parsedVal = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
        if (!isNaN(parsedVal)) portion_quantity = parsedVal;
      } else if (normKey.includes('umbral') || normKey.includes('minimo') || normKey.includes('threshold')) {
        const parsedVal = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
        if (!isNaN(parsedVal)) low_stock_threshold = parsedVal;
      } else if (normKey.includes('stock') || normKey.includes('existencia') || normKey.includes('cantidad')) {
        const parsedVal = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
        if (!isNaN(parsedVal)) stock_quantity = parsedVal;
      } else if (normKey.includes('icono') || normKey.includes('icon')) {
        if (valStr) icon = valStr;
      }
    }

    // Sugerir icono automáticamente si no viene especificado o no es válido
    if (name && (!icon || !FOOD_ICONS.some(i => i.name === icon))) {
      const rec = recommendIngredientIcon(name);
      if (rec) icon = rec;
    }

    return {
      rowIndex: index + 2, // Fila en el Excel considerando encabezado
      name,
      price: Math.max(0, price),
      unit,
      stock_quantity: Math.max(0, stock_quantity),
      low_stock_threshold: low_stock_threshold !== null && low_stock_threshold >= 0 ? low_stock_threshold : null,
      portion_quantity: Math.max(0, portion_quantity),
      icon,
      is_active: true,
      isValid: Boolean(name && name.length > 0),
      error: !name ? 'Nombre de ingrediente requerido' : null
    };
  });

  return parsedIngredients;
};

/**
 * Importa de manera masiva un arreglo de ingredientes validados a Supabase.
 */
export const bulkImportIngredients = async (organizationId, ingredientsList, overrideOrgId = null) => {
  const orgId = overrideOrgId || organizationId || await getFirstOrganizationId();
  if (!orgId) throw new Error("Organización no encontrada");

  const validItems = ingredientsList.filter(item => item.isValid);
  if (validItems.length === 0) {
    throw new Error("No hay ingredientes válidos para importar.");
  }

  let successCount = 0;
  let failCount = 0;
  const errors = [];

  for (const ing of validItems) {
    try {
      await createIngredient(orgId, {
        name: ing.name,
        price: ing.price || 0,
        unit: ing.unit || 'unit',
        stock_quantity: ing.stock_quantity || 0,
        low_stock_threshold: ing.low_stock_threshold ?? null,
        portion_quantity: ing.portion_quantity || 0,
        icon: ing.icon || null,
        is_active: ing.is_active !== false
      });
      successCount++;
    } catch (err) {
      console.error(`Error creando ingrediente "${ing.name}":`, err);
      failCount++;
      errors.push({ name: ing.name, error: err.message });
    }
  }

  return {
    total: validItems.length,
    successCount,
    failCount,
    errors
  };
};

/**
 * Descarga una plantilla de Excel con la estructura esperada para cargar ingredientes.
 */
export const downloadIngredientExcelTemplate = async () => {
  const XLSX = await import('xlsx');
  const templateData = [
    {
      "Nombre": "Queso Mozzarella",
      "Precio Adicional": 1000,
      "Unidad": "g",
      "Porción": 50,
      "Stock Inicial": 5000,
      "Umbral Mínimo (%)": 20,
      "Icono (Opcional)": "CheeseIcon"
    },
    {
      "Nombre": "Carne de Res",
      "Precio Adicional": 1500,
      "Unidad": "g",
      "Porción": 150,
      "Stock Inicial": 10000,
      "Umbral Mínimo (%)": 15,
      "Icono (Opcional)": "BeefIcon"
    },
    {
      "Nombre": "Salsa BBQ",
      "Precio Adicional": 500,
      "Unidad": "ml",
      "Porción": 30,
      "Stock Inicial": 2000,
      "Umbral Mínimo (%)": 25,
      "Icono (Opcional)": "BbqGrillIcon"
    },
    {
      "Nombre": "Papas Fritas Extra",
      "Precio Adicional": 1200,
      "Unidad": "unid",
      "Porción": 1,
      "Stock Inicial": 100,
      "Umbral Mínimo (%)": 10,
      "Icono (Opcional)": "FrenchFries01Icon"
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(templateData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Ingredientes");

  worksheet['!cols'] = [
    { wch: 25 },
    { wch: 18 },
    { wch: 10 },
    { wch: 12 },
    { wch: 15 },
    { wch: 18 },
    { wch: 18 },
  ];

  XLSX.writeFile(workbook, "plantilla_ingredientes_foodhub.xlsx");
};

/**
 * Procesa y guarda el JSON de menú estructurado en Supabase
 */
export const processAndSaveMenu = async (menuData, overrideOrgId = null) => {
  const orgId = overrideOrgId || await getFirstOrganizationId();
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

