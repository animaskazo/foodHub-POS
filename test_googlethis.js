import google from 'googlethis';

async function test() {
  const images = await google.image('hamburguesa doble queso', { safe: false });
  console.log(JSON.stringify(images.slice(0, 3), null, 2));
}

test();
