import { image_search } from 'duckduckgo-images-api';

async function test() {
  const results = await image_search({ query: "hamburguesa doble queso", moderate: true });
  console.log(JSON.stringify(results.slice(0, 3), null, 2));
}

test();
