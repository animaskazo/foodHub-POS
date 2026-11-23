const fs = require('fs');
const path = require('path');

const pagesDir = path.join(__dirname, 'src/pages');

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // 1. Remove redundant classes from existing <Button> components
  // Since we made Button rounded-full and primary by default globally.
  content = content.replace(/rounded-full\s*/g, '');
  content = content.replace(/bg-black\s+text-white\s+hover:bg-gray-800\s*/g, '');
  content = content.replace(/className=["']\s+["']/g, '');
  content = content.replace(/className=["']\s+([^"']+)["']/g, 'className="$1"');

  // 2. We will not try to blindly change all <button> to <Button> because many 
  // <button> tags are used as simple clickable icons (like X buttons, sidebar toggles, etc.)
  // We ONLY want to change standard "action" buttons in the main menu.
  // Actually, we can just find them and leave them if they are simple icon buttons.
  
  fs.writeFileSync(filePath, content);
}

const files = fs.readdirSync(pagesDir).filter(f => f.endsWith('.jsx'));
files.forEach(file => {
  processFile(path.join(pagesDir, file));
});
console.log('Cleaned up redundant Button classes in pages.');
