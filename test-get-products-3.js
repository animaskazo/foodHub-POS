import { getFirstOrganizationId, getProducts } from './src/services/catalogService.js';

async function run() {
  const orgId = await getFirstOrganizationId();
  const products = await getProducts(orgId);
  const peperoni = products.find(p => p.name.includes("Peperoni"));
  console.log(JSON.stringify(peperoni, null, 2));
}
run();
