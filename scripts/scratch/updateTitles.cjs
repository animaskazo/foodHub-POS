const fs = require('fs');
const path = require('path');

const pagesDir = path.join(__dirname, 'src/pages');
const files = fs.readdirSync(pagesDir).filter(f => f.endsWith('.jsx'));

const titles = {
  'CatalogManager.jsx': 'Artículos',
  'CategoriesList.jsx': 'Categorías',
  'CreateCategoryView.jsx': "isEditing ? 'Editar categoría' : 'Crear categoría'",
  'CreateProductView.jsx': "isEditing ? 'Editar artículo' : 'Crear artículo'",
  'DashboardView.jsx': 'Dashboard',
  'IngredientsManager.jsx': 'Ingredientes Adicionales',
  'KitchenView.jsx': 'Cocina',
  'LoginView.jsx': 'Iniciar sesión',
  'PosView.jsx': 'Punto de Venta',
  'SignupView.jsx': 'Crear cuenta',
  'SuperAdminView.jsx': 'Super Admin'
};

files.forEach(file => {
  const filePath = path.join(pagesDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  if (!content.includes('useDocumentTitle')) {
    // 1. Add import
    // Let's find the first import and add it after
    const firstImportMatch = content.match(/^import .*?;\n/m);
    if (firstImportMatch) {
        content = content.replace(firstImportMatch[0], `${firstImportMatch[0]}import { useDocumentTitle } from '../hooks/useDocumentTitle';\n`);
    } else {
        content = `import { useDocumentTitle } from '../hooks/useDocumentTitle';\n` + content;
    }
    
    // 2. Add hook call before the first return ( inside the main component block
    // We can assume the component is the one doing "return (" that is not indented too much, or just the first `return (` that is indented with 2 or 4 spaces.
    // A safer way: replace `  return (` (or similar) with `  useDocumentTitle(...);\n\n  return (`
    // Wait, DashboardView has `return (` inside some functions?
    // Let's just find `\n  return \(` and replace the FIRST occurrence.
    const title = titles[file] || 'FoodHub POS';
    const titleArg = (title.startsWith("isEditing") || title.startsWith("`")) ? title : `'${title}'`;
    
    const returnRegex = /\n(\s+)return \(/;
    content = content.replace(returnRegex, (match, p1) => {
        return `\n${p1}useDocumentTitle(${titleArg});\n\n${p1}return (`;
    });
    
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${file}`);
  }
});
