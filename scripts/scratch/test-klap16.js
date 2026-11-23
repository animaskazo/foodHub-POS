fetch("https://api-pasarela-sandbox.mcdesaqa.cl/payment-gateway/v1/orders", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "apikey": "mKaTZ4yBm3rVFapqNctziKCvXsjD6fDO"
  },
  body: JSON.stringify({
    reference_id: "08ffceae-f0fb-4395-88c9-0a6dd2b367d0-" + Date.now(),
    amount: {
      currency: "CLP",
      total: 1000
    },
    methods: ["tarjetas"],
    urls: {
      return_url: "https://food-admin.digital-solutions.work/order/pizza%20nostra?orderId=08ffceae-f0fb-4395-88c9-0a6dd2b367d0&status=success",
      cancel_url: "https://food-admin.digital-solutions.work/order/pizza%20nostra?orderId=08ffceae-f0fb-4395-88c9-0a6dd2b367d0&status=error"
    },
    webhooks: {
      webhook_confirm: "https://fgvhbniauzjvzeuespmf.supabase.co/functions/v1/klap-webhook",
      webhook_reject: "https://fgvhbniauzjvzeuespmf.supabase.co/functions/v1/klap-webhook"
    },
    customs: [
      { key: "tarjetas_expiration_minutes", value: "30" }
    ]
  })
}).then(res => {
  console.log("Status:", res.status);
  return res.text();
}).then(text => console.log("Response:", text));
