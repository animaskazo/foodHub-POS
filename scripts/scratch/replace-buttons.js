const fs = require('fs');
const path = require('path');

const pagesDir = path.join(__dirname, 'src/pages');
const componentsDir = path.join(__dirname, 'src/components');

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // Make sure Button is imported if we are going to add <Button>
  const hasButtonImport = /import\s+\{\s*Button\s*\}\s+from\s+['"]@\/components\/ui\/button['"]/.test(content);
  
  // Replace simple buttons that look like primary or secondary
  // This is a naive regex for the most common ones
  
  // Replace <button className="... bg-black text-white ..."> with <Button variant="default">
  content = content.replace(/<button([^>]*)className=["']([^"']*)bg-black text-white([^"']*)["']([^>]*)>/g, '<Button$1className="$2 $3"$4 variant="default">');
  
  // Replace <button className="... bg-gray-100 ..."> with <Button variant="secondary">
  content = content.replace(/<button([^>]*)className=["']([^"']*)bg-gray-100([^"']*)["']([^>]*)>/g, '<Button$1className="$2 $3"$4 variant="secondary">');

  // Replace closing </button> with </Button> ONLY IF it was opened with <Button
  // To be safe, we'll just fix up <button> tags that we matched manually if needed, 
  // but it's easier to just find all <button> tags that have standard text and replace them.
  // Actually, let's just do a blanket replace of all <button to <Button if they look like action buttons.
  
  // Clean up redundant classes from existing <Button>
  content = content.replace(/className=["']([^"']*)rounded-full([^"']*)["']/g, 'className="$1 $2"');
  content = content.replace(/className=["']([^"']*)bg-black text-white hover:bg-gray-800([^"']*)["']/g, 'className="$1 $2"');
  
  // Clean up empty classNames
  content = content.replace(/className=["']\s+["']/g, '');

  if (content !== originalContent) {
    // If we changed something and don't have Button imported, try to add it
    if (!hasButtonImport && content.includes('<Button')) {
       // Insert import after the last import
       const lastImportIndex = content.lastIndexOf('import ');
       if (lastImportIndex !== -1) {
          const endOfLine = content.indexOf('\n', lastImportIndex);
          content = content.slice(0, endOfLine + 1) + "import { Button } from '@/components/ui/button';\n" + content.slice(endOfLine + 1);
       }
    }
    
    // Also change corresponding </button> to </Button>
    // This regex balances <Button> and </Button>. A simpler way is to just replace all </button> if we replace <button. 
    // But we might have left some <button>.
    // Let's just fix the closing tags where the opening tag is <Button.
  }

  // To be perfectly safe, let's just use standard sed or manual replacements for the main views
}

// Actually let's just do this via sed on the terminal for simplicity and control.
