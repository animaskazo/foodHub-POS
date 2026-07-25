const url = 'https://fgvhbniauzjvzeuespmf.supabase.co/functions/v1/send-email';
const headers = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZndmhibmlhdXpqdnpldWVzcG1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NDY3MTEsImV4cCI6MjA5ODUyMjcxMX0.VOPzKRt8QB8w2RMoUQ7_wuzCRb8diA30p5DlLBPjkdE'
};

const commonData = {
  customer_name: 'Fernando',
  order_number: 'TEST-001',
  items: [
    { name: 'Hamburguesa Doble', quantity: 2, total_price: 15000, image_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500&h=500&fit=crop' },
    { name: 'Papas Fritas Grandes', quantity: 1, total_price: 4500, image_url: null }
  ],
  organization: {
    name: 'FoodHub Test Demo',
    logo_url: null
  },
  branch: {
    name: 'Sucursal Principal',
    address: 'Av Siempre Viva 123'
  }
};

const testCases = [
  {
    type: 'order_confirmed',
    email: 'fernando.rg@live.cl',
    data: {
      ...commonData,
      order_type: 'online',
      delivery_type: 'delivery',
      delivery_address: 'Mi casa, Depto 12',
      payment_method: 'online',
      total: 22000,
      subtotal: 19500,
      delivery_fee: 2500
    }
  },
  {
    type: 'order_confirmed',
    email: 'fernando.rg@live.cl',
    data: {
      ...commonData,
      order_number: 'TEST-002',
      order_type: 'online',
      delivery_type: 'pickup',
      delivery_address: null,
      payment_method: 'cash',
      total: 19500,
      subtotal: 19500,
      delivery_fee: 0
    }
  },
  {
    type: 'order_ready',
    email: 'fernando.rg@live.cl',
    data: {
      ...commonData,
      order_number: 'TEST-003',
      order_type: 'online',
      delivery_type: 'delivery',
      delivery_address: 'Mi casa, Depto 12',
      payment_method: 'online_gateway',
      total: 22000,
      subtotal: 19500,
      delivery_fee: 2500
    }
  }
];

async function run() {
  for (let i = 0; i < testCases.length; i++) {
    const payload = testCases[i];
    console.log(`Sending case ${i + 1}...`);
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
    const text = await res.text();
    console.log(`Response ${i + 1}: ${res.status} - ${text}`);
  }
}

run();
