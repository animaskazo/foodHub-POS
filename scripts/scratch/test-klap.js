fetch("https://api.pasarela.multicaja.cl/api/v1/payments", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer mKaTZ4yBm3rVFapqNctziKCvXsjD6fDO`
  },
  body: JSON.stringify({
    amount: 1000,
    buy_order: "TEST-123",
    session_id: "session-TEST-123",
    return_url: "http://localhost:3000/return"
  })
}).then(res => {
  console.log("Status:", res.status);
  return res.text();
}).then(text => console.log("Response:", text));
