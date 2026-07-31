import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (err) => errors.push('PAGEERROR: ' + err.message.slice(0, 150)));

await page.goto('http://localhost:5199/', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise(r => setTimeout(r, 1000));

const out = await page.evaluate(async () => {
  const results = {};
  try {
    const dep = await import('/node_modules/.vite/deps/@hugeicons_core-free-icons.js');
    results.depBeefBefore = typeof dep.BeefIcon;
  } catch (e) {
    results.depError = e.message;
  }
  try {
    const m = await import('/src/utils/ingredientIcons.js');
    results.utilsLoaded = true;
    results.getIcon = typeof m.getIngredientIcon('BeefIcon');
  } catch (e) {
    results.utilsError = e.message;
  }
  try {
    const dep2 = await import('/node_modules/.vite/deps/@hugeicons_core-free-icons.js');
    results.depBeefAfter = typeof dep2.BeefIcon;
  } catch (e) {
    results.depErrorAfter = e.message;
  }
  return results;
});

console.log(JSON.stringify(out, null, 2));
console.log('PAGEERRORS:', errors.join(' | ') || '(none)');
await browser.close();
