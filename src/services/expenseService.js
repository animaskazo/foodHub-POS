import { supabase } from '../lib/supabase';

export const DEFAULT_EXPENSE_CATEGORIES = [
  { name: 'Arriendo', type: 'fijo', color: '#8b5cf6' },
  { name: 'Sueldos base', type: 'fijo', color: '#3b82f6' },
  { name: 'Luz', type: 'fijo', color: '#f59e0b' },
  { name: 'Agua', type: 'fijo', color: '#06b6d4' },
  { name: 'Gas', type: 'fijo', color: '#f97316' },
  { name: 'Internet / Teléfono', type: 'fijo', color: '#6366f1' },
  { name: 'Contador / Patente', type: 'fijo', color: '#64748b' },
  { name: 'Patente municipal', type: 'fijo', color: '#475569' },
  { name: 'Seguro del local', type: 'fijo', color: '#0ea5e9' },
  { name: 'Alarma / Monitoreo', type: 'fijo', color: '#7c3aed' },
  { name: 'Software / Suscripciones', type: 'fijo', color: '#a855f7' },
  { name: 'Insumos / Mercadería', type: 'variable', color: '#10b981' },
  { name: 'Carnes y pollo', type: 'variable', color: '#dc2626' },
  { name: 'Pescados y mariscos', type: 'variable', color: '#0284c7' },
  { name: 'Frutas y verduras', type: 'variable', color: '#16a34a' },
  { name: 'Lácteos y huevos', type: 'variable', color: '#eab308' },
  { name: 'Pan y masas', type: 'variable', color: '#d97706' },
  { name: 'Bebidas y jugos', type: 'variable', color: '#0891b2' },
  { name: 'Cervezas y licores', type: 'variable', color: '#b45309' },
  { name: 'Café y té', type: 'variable', color: '#78350f' },
  { name: 'Aceite y abarrotes', type: 'variable', color: '#65a30d' },
  { name: 'Especias y salsas', type: 'variable', color: '#c2410c' },
  { name: 'Hielo y carbón', type: 'variable', color: '#67e8f9' },
  { name: 'Packaging / Desechables', type: 'variable', color: '#84cc16' },
  { name: 'Comisiones delivery', type: 'variable', color: '#ec4899' },
  { name: 'Flete y combustible', type: 'variable', color: '#57534e' },
  { name: 'Horas extra', type: 'variable', color: '#eab308' },
  { name: 'Mantención equipos', type: 'variable', color: '#78716c' },
  { name: 'Control de plagas', type: 'variable', color: '#4d7c0f' },
  { name: 'Uniformes personal', type: 'variable', color: '#334155' },
  { name: 'Lavandería / Manteles', type: 'variable', color: '#0d9488' },
  { name: 'Marketing', type: 'variable', color: '#ef4444' },
  { name: 'Limpieza', type: 'variable', color: '#14b8a6' },
  { name: 'Otros', type: 'variable', color: '#6b7280' },
];

const toISODate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// ── CATEGORIES ───────────────────────────────────────────────

export const getExpenseCategories = async (organizationId) => {
  const { data, error } = await supabase
    .from('expense_categories')
    .select('*')
    .eq('organization_id', organizationId)
    .order('type', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return data || [];
};

export const ensureDefaultCategories = async (organizationId) => {
  const existing = await getExpenseCategories(organizationId);
  if (existing.length > 0) return ensureMissingDefaultCategories(organizationId, existing);
  const rows = DEFAULT_EXPENSE_CATEGORIES.map((c) => ({
    organization_id: organizationId,
    name: c.name,
    type: c.type,
    color: c.color,
  }));
  const { data, error } = await supabase
    .from('expense_categories')
    .insert(rows)
    .select();
  if (error) throw error;
  return data || [];
};

// Inserta solo las categorías por defecto que falten (por nombre).
// Sirve para orgs creadas con el set antiguo de 16 categorías.
export const ensureMissingDefaultCategories = async (organizationId, existing = null) => {
  const list = existing || await getExpenseCategories(organizationId);
  const have = new Set((list || []).map((c) => c.name));
  const missing = DEFAULT_EXPENSE_CATEGORIES.filter((c) => !have.has(c.name));
  if (missing.length === 0) return list;
  const { data, error } = await supabase
    .from('expense_categories')
    .insert(missing.map((c) => ({
      organization_id: organizationId,
      name: c.name,
      type: c.type,
      color: c.color,
    })))
    .select();
  if (error) throw error;
  return [...(list || []), ...(data || [])];
};

export const createExpenseCategory = async (organizationId, { name, type, color }) => {
  const { data, error } = await supabase
    .from('expense_categories')
    .insert([{
      organization_id: organizationId,
      name: name.trim(),
      type: type || 'variable',
      color: color || '#6b7280',
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateExpenseCategory = async (id, { name, type, color, is_active }) => {
  const payload = {};
  if (name !== undefined) payload.name = name;
  if (type !== undefined) payload.type = type;
  if (color !== undefined) payload.color = color;
  if (is_active !== undefined) payload.is_active = is_active;
  const { data, error } = await supabase
    .from('expense_categories')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteExpenseCategory = async (id) => {
  const { error } = await supabase.from('expense_categories').delete().eq('id', id);
  if (error) throw error;
};

// ── EXPENSES ─────────────────────────────────────────────────

const baseSelect = '*, expense_categories ( id, name, type, color )';

export const getExpensesRaw = async (organizationId, { from, to } = {}) => {
  let query = supabase
    .from('expenses')
    .select(baseSelect)
    .eq('organization_id', organizationId)
    .order('expense_date', { ascending: false });
  // Traemos puntuales del rango + todas las madres recurrentes vigentes para expandir en cliente.
  // Para no perder recurrentes que nacieron antes del rango, no filtramos por fecha aquí
  // cuando hay rango: filtramos abajo en expand.
  if (!from && !to) {
    const { data, error } = await query.limit(500);
    if (error) throw error;
    return data || [];
  }
  const { data, error } = await query.limit(1000);
  if (error) throw error;
  return data || [];
};

/**
 * Expande gastos recurrentes mensuales en instancias virtuales.
 * Regla: una madre con expense_date=2026-01-15 genera una instancia el día 15
 * (o último día del mes si no existe) por cada mes entre max(inicio madre, from)
 * y min(recurrence_end, to).
 */
export const expandRecurringExpenses = (rows, fromISO, toISO) => {
  const from = new Date(fromISO + 'T12:00:00');
  const to = new Date(toISO + 'T12:00:00');
  const out = [];

  const lastDayOfMonth = (y, m) => new Date(y, m + 1, 0).getDate();

  for (const row of rows || []) {
    // Regla de negocio: lo que define fijo vs variable es el check de
    // recurrencia del gasto (is_recurring), NO el tipo de la categoría.
    if (!row.is_recurring) {
      if (row.expense_date >= fromISO && row.expense_date <= toISO) {
        out.push({ ...row, _virtual: false, _isFixed: false });
      }
      continue;
    }
    const startParts = row.expense_date.split('-').map(Number);
    const startDay = startParts[2];
    const endISO = row.recurrence_end || toISO;
    // Iterar meses del rango
    const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
    const endCursor = new Date(to.getFullYear(), to.getMonth(), 1);
    while (cursor <= endCursor) {
      const y = cursor.getFullYear();
      const m = cursor.getMonth();
      const monthStartISO = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const monthEndDay = lastDayOfMonth(y, m);
      const monthEndISO = `${y}-${String(m + 1).padStart(2, '0')}-${String(monthEndDay).padStart(2, '0')}`;
      // La serie solo existe desde el mes de inicio de la madre
      const seriesStartISO = row.expense_date.slice(0, 7);
      const cursorKey = `${y}-${String(m + 1).padStart(2, '0')}`;
      if (cursorKey >= seriesStartISO && monthEndISO >= fromISO && monthStartISO <= endISO) {
        const day = Math.min(startDay, monthEndDay);
        const occISO = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (occISO >= fromISO && occISO <= toISO && occISO >= row.expense_date && occISO <= endISO) {
          out.push({
            ...row,
            expense_date: occISO,
            _virtual: occISO !== row.expense_date,
            _occurrenceOf: row.id,
            _isFixed: true,
          });
        }
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }
  out.sort((a, b) => (a.expense_date < b.expense_date ? 1 : -1));
  return out;
};

export const getMonthExpenses = async (organizationId, year, monthIndex) => {
  const from = `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const to = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const raw = await getExpensesRaw(organizationId, { from, to });
  return expandRecurringExpenses(raw, from, to);
};

export const getAnnualExpenses = async (organizationId, year) => {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const raw = await getExpensesRaw(organizationId, { from, to });
  const expanded = expandRecurringExpenses(raw, from, to);
  const byMonth = Array.from({ length: 12 }, () => ({ total: 0, fixed: 0, variable: 0 }));
  for (const e of expanded) {
    const m = Number(e.expense_date.slice(5, 7)) - 1;
    const amt = Number(e.amount || 0);
    byMonth[m].total += amt;
    if (e.is_recurring) byMonth[m].fixed += amt;
    else byMonth[m].variable += amt;
  }
  return { expanded, byMonth };
};

export const summarizeExpenses = (expandedRows) => {
  let total = 0;
  let fixed = 0;
  let variable = 0;
  const byCategory = {};
  for (const e of expandedRows || []) {
    const amt = Number(e.amount || 0);
    total += amt;
    if (e.is_recurring) fixed += amt;
    else variable += amt;
    const key = e.category_id || 'sin-categoria';
    if (!byCategory[key]) {
      byCategory[key] = {
        categoryId: e.category_id,
        name: e.expense_categories?.name || 'Sin categoría',
        type: e.expense_categories?.type || 'variable',
        color: e.expense_categories?.color || '#6b7280',
        total: 0,
        count: 0,
      };
    }
    byCategory[key].total += amt;
    byCategory[key].count += 1;
  }
  return {
    total,
    fixed,
    variable,
    count: (expandedRows || []).length,
    byCategory: Object.values(byCategory).sort((a, b) => b.total - a.total),
  };
};

export const createExpense = async (organizationId, payload, userId) => {
  const { data, error } = await supabase
    .from('expenses')
    .insert([{
      organization_id: organizationId,
      branch_id: payload.branch_id || null,
      category_id: payload.category_id || null,
      amount: Number(payload.amount) || 0,
      expense_date: payload.expense_date || toISODate(new Date()),
      description: payload.description || '',
      supplier: payload.supplier || null,
      payment_method: payload.payment_method || null,
      is_recurring: !!payload.is_recurring,
      recurrence: 'monthly',
      recurrence_end: payload.recurrence_end || null,
      notes: payload.notes || null,
      created_by: userId || null,
      receipt_url: payload.receipt_url || null,
      receipt_type: payload.receipt_type || null,
      receipt_name: payload.receipt_name || null,
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateExpense = async (id, payload) => {
  const next = {};
  if (payload.category_id !== undefined) next.category_id = payload.category_id || null;
  if (payload.amount !== undefined) next.amount = Number(payload.amount) || 0;
  if (payload.expense_date !== undefined) next.expense_date = payload.expense_date;
  if (payload.description !== undefined) next.description = payload.description;
  if (payload.supplier !== undefined) next.supplier = payload.supplier || null;
  if (payload.payment_method !== undefined) next.payment_method = payload.payment_method || null;
  if (payload.is_recurring !== undefined) next.is_recurring = !!payload.is_recurring;
  if (payload.recurrence_end !== undefined) next.recurrence_end = payload.recurrence_end || null;
  if (payload.notes !== undefined) next.notes = payload.notes || null;
  if (payload.receipt_url !== undefined) next.receipt_url = payload.receipt_url || null;
  if (payload.receipt_type !== undefined) next.receipt_type = payload.receipt_type || null;
  if (payload.receipt_name !== undefined) next.receipt_name = payload.receipt_name || null;
  const { data, error } = await supabase
    .from('expenses')
    .update(next)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteExpense = async (id) => {
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) throw error;
};

export const duplicateExpense = async (organizationId, sourceRow, targetDateISO, userId) => {
  return createExpense(organizationId, {
    category_id: sourceRow.category_id,
    amount: sourceRow.amount,
    expense_date: targetDateISO,
    description: sourceRow.description,
    supplier: sourceRow.supplier,
    payment_method: sourceRow.payment_method,
    is_recurring: false,
    notes: sourceRow.notes,
  }, userId);
};
