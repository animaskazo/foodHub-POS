fetch("https://api-pasarela-sandbox.mcdesaqa.cl/payment-gateway/v1/orders", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "apikey": "mKaTZ4yBm3rVFapqNctziKCvXsjD6fDO"
  },
  body: JSON.stringify({
    reference_id: "TEST-" + Date.now(),
    amount: {
      currency: "CLP",
      total: 1000
    },
    methods: ["tarjetas"],
    urls: {
      return_url: "https://foo-bar.vercel.app/p/my-slug-name?orderId=00000-0000-0000000000&status=success",
      cancel_url: "https://foo-bar.vercel.app/p/my-slug-name?orderId=00000-0000-0000000000&status=success"
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
