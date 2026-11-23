const apiKey = Deno.env.get("KAPSO_API_KEY");
const phoneNumberId = "597907523413541"; // pizza-nostra
const to = "56995355996"; // user phone

const res = await fetch(`https://api.kapso.ai/meta/whatsapp/v24.0/${phoneNumberId}/messages`, {
  method: "POST",
  headers: {
    "X-API-Key": apiKey!,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { body: "Prueba desde consola" },
  }),
});

console.log("Status:", res.status);
console.log("Body:", await res.text());
