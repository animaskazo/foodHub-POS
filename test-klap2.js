fetch("https://api.pasarela.multicaja.cl/payment-gateway/v1/orders", {
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
      return_url: "http://localhost:3000/return",
      cancel_url: "http://localhost:3000/return"
    },
    webhooks: {
      webhook_confirm: "https://fgvhbniauzjvzeuespmf.supabase.co/functions/v1/klap-webhook",
      webhook_reject: "https://fgvhbniauzjvzeuespmf.supabase.co/functions/v1/klap-webhook"
    }
  })
}).then(res => {
  console.log("Status:", res.status);
  return res.text();
}).then(text => console.log("Response:", text));
