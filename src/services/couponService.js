import { supabase } from '../lib/supabase';

// ── Normalización ───────────────────────────────────────────
// Garantiza formato consistente aunque el llamante no lo haga.
export const normalizeCode = (code) => String(code || '').trim().toUpperCase();

export const normalizeCouponPayload = ({ organization_id, code, type, value, min_total, max_uses, expires_at, is_active }) => {
  const safeType = type === 'fixed' ? 'fixed' : 'percentage';
  const safeValue = Math.max(0, Number(value) || 0);
  const usesNum = max_uses === '' || max_uses == null ? null : Math.floor(Number(max_uses));
  return {
    organization_id,
    code: normalizeCode(code),
    type: safeType,
    // El porcentaje se topa en 100 para no generar descuentos negativos.
    value: safeType === 'percentage' ? Math.min(100, safeValue) : safeValue,
    min_total: Math.max(0, Number(min_total) || 0),
    max_uses: usesNum != null && usesNum > 0 ? usesNum : null,
    expires_at: expires_at || null,
    is_active: is_active !== false,
  };
};

// ── CRUD ──────────────────────────────────────────────────

export const getCoupons = async (organizationId) => {
  const { data, error } = await supabase
    .from('coupons')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
};

export const createCoupon = async (coupon) => {
  const { data, error } = await supabase
    .from('coupons')
    .insert([normalizeCouponPayload(coupon)])
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateCoupon = async (id, updates) => {
  const payload = { ...updates };
  if (payload.code !== undefined) payload.code = normalizeCode(payload.code);
  if (payload.value !== undefined) {
    const v = Math.max(0, Number(payload.value) || 0);
    // Solo se topa en 100 cuando sabemos que es porcentaje.
    payload.value = payload.type === 'percentage' ? Math.min(100, v) : v;
  }
  if (payload.min_total !== undefined && payload.min_total !== null) {
    payload.min_total = Math.max(0, Number(payload.min_total) || 0);
  }
  const { data, error } = await supabase
    .from('coupons')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteCoupon = async (id) => {
  const { error } = await supabase
    .from('coupons')
    .delete()
    .eq('id', id);
  if (error) throw error;
};

// ── Validación y aplicación ───────────────────────────────
// Única fuente de verdad: POS, checkout público y backends la usan.

export const validateCoupon = (coupon, cartTotal) => {
  if (!coupon) return { valid: false, error: 'Cupón no encontrado.' };
  if (!coupon.is_active) return { valid: false, error: 'Este cupón está desactivado.' };
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return { valid: false, error: 'Este cupón ha expirado.' };
  }
  if (coupon.max_uses != null && (coupon.used_count || 0) >= coupon.max_uses) {
    return { valid: false, error: 'Este cupón ha alcanzado el máximo de usos.' };
  }
  if (cartTotal < (coupon.min_total || 0)) {
    return { valid: false, error: `Compra mínima para este cupón: $${Math.round(coupon.min_total).toLocaleString('es-CL')}` };
  }
  if (coupon.type === 'percentage' && (Number(coupon.value) || 0) > 100) {
    return { valid: false, error: 'Cupón inválido (descuento mayor a 100%).' };
  }
  if ((Number(coupon.value) || 0) <= 0) {
    return { valid: false, error: 'Cupón inválido.' };
  }
  return { valid: true, error: null };
};

// Descuento en $ (entero), siempre topado al total del carro.
export const calculateDiscount = (coupon, cartTotal) => {
  if (!coupon || !cartTotal) return 0;
  const total = Math.round(Number(cartTotal) || 0);
  if (total <= 0) return 0;
  if (coupon.type === 'percentage') {
    const pct = Math.min(100, Math.max(0, Number(coupon.value) || 0));
    return Math.min(total, Math.round((total * pct) / 100));
  }
  return Math.min(total, Math.max(0, Math.round(Number(coupon.value) || 0)));
};

export const applyCouponCode = async (code, organizationId, cartTotal) => {
  const normalized = normalizeCode(code);
  if (!normalized) return { valid: false, error: 'Ingresa un código.' };
  const { data: coupon, error } = await supabase
    .from('coupons')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('code', normalized)
    .maybeSingle();
  if (error || !coupon) return { valid: false, error: 'Cupón no encontrado.' };

  const validation = validateCoupon(coupon, cartTotal);
  if (!validation.valid) return validation;

  const discount = calculateDiscount(coupon, cartTotal);
  return { valid: true, coupon, discount, error: null };
};

// Incrementar usos (llamar al confirmar la orden)
export const incrementCouponUsage = async (couponId) => {
  if (!couponId) return;
  const { data: coupon } = await supabase.from('coupons').select('used_count').eq('id', couponId).single();
  if (coupon) {
    await supabase.from('coupons').update({ used_count: (coupon.used_count || 0) + 1 }).eq('id', couponId);
  }
};
