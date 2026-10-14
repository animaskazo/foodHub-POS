import { supabase } from '../lib/supabase';

// Helper: Ensure the organization settings are fetched to check if shifts are enabled
export const getShiftSettings = async (organizationId) => {
  const { data, error } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', organizationId)
    .single();

  if (error) {
    console.error('Error fetching shift settings:', error);
    return null;
  }
  return data?.settings || {};
};

// Check if there is currently an open shift
export const getCurrentShift = async (organizationId) => {
  const { data, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('status', 'open')
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 is the code for "no rows returned" in single()
    console.error('Error fetching current shift:', error);
    throw error;
  }
  
  return data || null;
};

// Open a new shift
export const openShift = async (organizationId, startingBalance = 0, userId) => {
  const { data, error } = await supabase
    .from('shifts')
    .insert([{
      organization_id: organizationId,
      starting_balance: startingBalance,
      status: 'open',
      opened_by: userId,
      start_time: new Date().toISOString()
    }])
    .select()
    .single();

  if (error) {
    console.error('Error opening shift:', error);
    throw error;
  }
  
  return data;
};

// Close a shift
export const closeShift = async (shiftId, endingBalance = 0, reportedBalance = 0, totalSales = 0, userId) => {
  const { data, error } = await supabase
    .from('shifts')
    .update({
      ending_balance: endingBalance,
      reported_balance: reportedBalance,
      total_sales: totalSales,
      status: 'closed',
      end_time: new Date().toISOString(),
      closed_by: userId
    })
    .eq('id', shiftId)
    .select()
    .single();

  if (error) {
    console.error('Error closing shift:', error);
    throw error;
  }
  
  return data;
};

// Get shift sales breakdown (orders since shift started)
export const getShiftSalesBreakdown = async (organizationId, shiftStartTime) => {
  const { data, error } = await supabase
    .from('orders')
    .select('id, total, payments ( method, amount, status ), order_type, created_at, status')
    .eq('organization_id', organizationId)
    .gte('created_at', shiftStartTime)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching shift sales:', error);
    throw error;
  }

  const orders = data || [];
  const paidOrders = orders.filter(o => o.payments?.some(p => p.status === 'paid'));

  let totalSales = 0;
  let cashSales = 0;
  let cardSales = 0;
  let transferSales = 0;
  let onlineSales = 0;
  let otherSales = 0;

  paidOrders.forEach(order => {
    const orderTotal = Number(order.total || 0);
    totalSales += orderTotal;

    if (order.payments && order.payments.length > 0) {
      order.payments
        .filter(p => p.status === 'paid')
        .forEach(payment => {
          const amount = Number(payment.amount || 0);
          const method = (payment.method || '').toLowerCase();
          
          if (method.includes('cash') || method === 'efectivo') {
            cashSales += amount;
          } else if (method.includes('card') || method === 'tarjeta' || method === 'debito' || method === 'credito') {
            cardSales += amount;
          } else if (method.includes('transfer') || method === 'transferencia') {
            transferSales += amount;
          } else if (method.includes('online') || method === 'klap' || method === 'webpay' || method === 'gateway') {
            onlineSales += amount;
          } else {
            otherSales += amount;
          }
        });
    } else {
      // Fallback to order.payment_method if no payments array
      const method = (order.payment_method || '').toLowerCase();
      if (method.includes('cash') || method === 'efectivo') {
        cashSales += orderTotal;
      } else if (method.includes('card') || method === 'tarjeta') {
        cardSales += orderTotal;
      } else if (method.includes('transfer') || method === 'transferencia') {
        transferSales += orderTotal;
      } else if (method.includes('online') || method === 'klap') {
        onlineSales += orderTotal;
      } else {
        otherSales += orderTotal;
      }
    }
  });

  const electronicSales = cardSales + transferSales + onlineSales + otherSales;
  const expectedCashInRegister = cashSales;

  return {
    totalSales,
    cashSales,
    cardSales,
    transferSales,
    onlineSales,
    otherSales,
    electronicSales,
    expectedCashInRegister,
    orderCount: paidOrders.length,
    orders: paidOrders
  };
};
