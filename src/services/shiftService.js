import { supabase } from '../lib/supabase';

// Roles con permiso RLS para abrir/cerrar caja (ver migración 069_shifts_cashier_policies).
export const SHIFT_MANAGER_ROLES = ['owner', 'admin', 'manager', 'cashier'];

export const canManageShifts = (role, isSuperAdmin = false) =>
  isSuperAdmin || SHIFT_MANAGER_ROLES.includes(role);

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

const attachOpenedByName = async (shift) => {
  if (!shift?.opened_by) return shift;
  const { data } = await supabase
    .from('staff')
    .select('full_name')
    .eq('id', shift.opened_by)
    .maybeSingle();
  return { ...shift, opened_by_name: data?.full_name || null };
};

// Turno abierto actual (o null). Tolera filas duplicadas heredadas tomando la más reciente.
export const getCurrentShift = async (organizationId) => {
  const { data, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('status', 'open')
    .order('start_time', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error fetching current shift:', error);
    throw error;
  }
  return data ? attachOpenedByName(data) : null;
};

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
    // 23505: índice único shifts_one_open_per_org → alguien abrió la caja antes.
    if (error.code === '23505') {
      throw new Error('Ya hay una caja abierta. Actualiza la pantalla para verla.');
    }
    console.error('Error opening shift:', error);
    throw error;
  }
  return data;
};

const isMissingColumnError = (error) =>
  error?.code === 'PGRST204' || error?.code === '42703';

// Cierra el turno guardando el arqueo. Solo actúa si el turno sigue abierto,
// para que dos cierres simultáneos no se pisen.
export const closeShift = async ({ shiftId, countedCash, expectedCash, totalSales, userId }) => {
  const base = {
    ending_balance: countedCash,
    reported_balance: countedCash,
    total_sales: totalSales,
    status: 'closed',
    end_time: new Date().toISOString(),
    closed_by: userId,
  };
  const withAudit = {
    ...base,
    expected_cash: expectedCash,
    // Sin conteo (cuando no es obligatorio) no hay diferencia que registrar.
    cash_difference: countedCash == null ? null : countedCash - expectedCash,
  };

  const run = (payload) => supabase
    .from('shifts')
    .update(payload)
    .eq('id', shiftId)
    .eq('status', 'open')
    .select()
    .maybeSingle();

  let { data, error } = await run(withAudit);
  // Compatibilidad mientras la migración 20261123120000_harden_shifts no esté aplicada.
  if (error && isMissingColumnError(error)) {
    ({ data, error } = await run(base));
  }

  if (error) {
    console.error('Error closing shift:', error);
    throw error;
  }
  if (!data) {
    throw new Error('Este turno ya fue cerrado por otra persona.');
  }
  return data;
};

const classifyMethod = (rawMethod) => {
  const method = (rawMethod || '').toLowerCase();
  if (method.includes('cash') || method === 'efectivo') return 'cash';
  if (method.includes('card') || ['tarjeta', 'debito', 'credito'].includes(method)) return 'card';
  if (method.includes('transfer') || method === 'transferencia') return 'transfer';
  if (method.includes('online') || ['klap', 'webpay', 'gateway'].includes(method)) return 'online';
  return 'other';
};

// Ventas del turno: pagos cobrados (paid_at) entre la apertura y `endTime` (por defecto, ahora).
// Se cuenta por hora de cobro, así una orden creada antes de abrir caja y pagada
// durante el turno entra en este arqueo. paid_at lo garantiza el trigger
// payments_set_paid_at (migración 20261123130000).
// `expectedCashInRegister` = fondo inicial + ventas en efectivo: es la única fuente de verdad del arqueo.
export const getShiftSalesBreakdown = async (shift, endTime = new Date().toISOString()) => {
  const { data, error } = await supabase
    .from('payments')
    .select('order_id, method, amount, status, paid_at, orders!inner ( id, organization_id, status )')
    .eq('orders.organization_id', shift.organization_id)
    .neq('orders.status', 'cancelled')
    .eq('status', 'paid')
    .gte('paid_at', shift.start_time)
    .lte('paid_at', endTime)
    .order('paid_at', { ascending: true });

  if (error) {
    console.error('Error fetching shift sales:', error);
    throw error;
  }

  const totals = { cash: 0, card: 0, transfer: 0, online: 0, other: 0 };
  const payments = data || [];
  const orderIds = new Set();
  let totalSales = 0;

  payments.forEach(p => {
    const amount = Number(p.amount || 0);
    totalSales += amount;
    totals[classifyMethod(p.method)] += amount;
    orderIds.add(p.order_id);
  });

  const startingBalance = Number(shift.starting_balance || 0);

  return {
    totalSales,
    cashSales: totals.cash,
    cardSales: totals.card,
    transferSales: totals.transfer,
    onlineSales: totals.online,
    otherSales: totals.other,
    electronicSales: totals.card + totals.transfer + totals.online + totals.other,
    startingBalance,
    expectedCashInRegister: startingBalance + totals.cash,
    orderCount: orderIds.size,
    payments,
  };
};
