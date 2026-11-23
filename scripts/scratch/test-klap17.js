fetch("https://api-pasarela-sandbox.mcdesaqa.cl/payment-gateway/v1/orders", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "apikey": "mKaTZ4yBm3rVFapqNctziKCvXsjD6fDO"
  },
  body: JSON.stringify({
    reference_id: "08ffceae-f0fb-4395-88c9-0a6dd2b367d0-" + Date.now(),
    amount: { currency: "CLP", total: 1000 },
    methods: ["tarjetas"],
    urls: {
      return_url: "https://food-admin.digital-solutions.work/order/pizza nostra?status=success",
      cancel_url: "https://food-admin.digital-solutions.work/order/pizza nostra?status=error"
    }
  })
}).then(res => {
  console.log("Status:", res.status);
  return res.text();
}).then(text => console.log("Response:", text));
