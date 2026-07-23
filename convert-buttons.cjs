const fs = require('fs');
const path = require('path');

const pagesDir = path.join(__dirname, 'src/pages');

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // Find all <button ... > tags
  // Replace <button with <Button
  // Replace </button> with </Button>
  
  if (content.includes('<button')) {
    content = content.replace(/<button/g, '<Button');
    content = content.replace(/<\/button>/g, '</Button>');
    
    // Add import if missing
    if (!content.includes('import { Button }')) {
       // Insert import after the last import
       const lastImportIndex = content.lastIndexOf('import ');
       if (lastImportIndex !== -1) {
          const endOfLine = content.indexOf('\n', lastImportIndex);
          content = content.slice(0, endOfLine + 1) + "import { Button } from '@/components/ui/button';\n" + content.slice(endOfLine + 1);
       } else {
          content = "import { Button } from '@/components/ui/button';\n" + content;
       }
    }
  }

  // Cleanup: any Button that used to be a ghost or icon button might look weird if it gets default variant (black pill)
  // I will add variant="outline" if it had border, or variant="secondary" if it had bg-gray-100.
  // Actually, standardizing them to default or secondary is what the user wants.
  
  // Let's do some heuristic variant injection based on className
  // If it has bg-black, bg-blue-600, bg-indigo-600 -> default (we can just leave it, or add variant="default")
  // Since default is default, we don't need to add it.
  // If it has bg-gray-100, bg-gray-200 -> variant="secondary"
  content = content.replace(/<Button([^>]*)className=["']([^"']*)bg-gray-100([^"']*)["']([^>]*)>/g, '<Button$1className="$2 $3"$4 variant="secondary">');
  content = content.replace(/<Button([^>]*)className=["']([^"']*)bg-gray-50([^"']*)["']([^>]*)>/g, '<Button$1className="$2 $3"$4 variant="secondary">');
  // If it has bg-red-600, text-red-600 -> variant="destructive"
  content = content.replace(/<Button([^>]*)className=["']([^"']*)bg-red-([0-9]{3})([^"']*)["']([^>]*)>/g, '<Button$1className="$2 $3"$4 variant="destructive">');
  content = content.replace(/<Button([^>]*)className=["']([^"']*)text-red-([0-9]{3})([^"']*)["']([^>]*)>/g, '<Button$1className="$2 $3"$4 variant="destructive">');
  
  // If it has border but no bg-black -> variant="outline"
  content = content.replace(/<Button([^>]*)className=["']([^"']*)border([^"']*)["']([^>]*)>/g, (match, p1, p2, p3, p4) => {
    if (match.includes('variant=') || match.includes('bg-black') || match.includes('bg-gray-900') || match.includes('bg-primary')) return match;
    return `<Button${p1}className="${p2}${p3}"${p4} variant="outline">`;
  });
  
  // If it has no variant and it's just an icon or small button (like p-1, p-2) with no background, we should probably make it ghost
  content = content.replace(/<Button([^>]*)className=["']([^"']*)p-[12]([^"']*)["']([^>]*)>/g, (match, p1, p2, p3, p4) => {
    if (match.includes('variant=') || match.includes('bg-')) return match;
    return `<Button${p1}className="${p2}p-2${p3}"${p4} variant="ghost" size="icon">`;
  });
  
  // Remove redundant base classes
  content = content.replace(/className=["']([^"']*)rounded-(lg|md|sm|full)([^"']*)["']/g, 'className="$1 $3"');
  content = content.replace(/className=["']([^"']*)bg-black text-white hover:bg-gray-800([^"']*)["']/g, 'className="$1 $2"');
  content = content.replace(/className=["']([^"']*)bg-gray-900 text-white hover:bg-gray-800([^"']*)["']/g, 'className="$1 $2"');
  content = content.replace(/className=["']([^"']*)bg-blue-600 text-white hover:bg-blue-700([^"']*)["']/g, 'className="$1 $2"');
  content = content.replace(/className=["']([^"']*)px-4 py-2([^"']*)["']/g, 'className="$1 $2"');
  content = content.replace(/className=["']\s+["']/g, '');
  content = content.replace(/className=["']\s+([^"']+)["']/g, 'className="$1"');

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
  }
}

const files = fs.readdirSync(pagesDir).filter(f => f.endsWith('.jsx'));
files.forEach(file => {
  processFile(path.join(pagesDir, file));
});
console.log('Converted all <button> to <Button> successfully.');
