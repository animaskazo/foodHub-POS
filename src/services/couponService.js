import { supabase } from '../lib/supabase';

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
    .insert([coupon])
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateCoupon = async (id, updates) => {
  const { data, error } = await supabase
    .from('coupons')
    .update(updates)
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

export const validateCoupon = (coupon, cartTotal) => {
  if (!coupon) return { valid: false, error: 'Cupón no encontrado.' };
  if (!coupon.is_active) return { valid: false, error: 'Este cupón está desactivado.' };
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return { valid: false, error: 'Este cupón ha expirado.' };
  }
  if (coupon.max_uses != null && coupon.used_count >= coupon.max_uses) {
    return { valid: false, error: 'Este cupón ha alcanzado el máximo de usos.' };
  }
  if (cartTotal < coupon.min_total) {
    return { valid: false, error: `Compra mínima para este cupón: $${Math.round(coupon.min_total).toLocaleString('es-CL')}` };
  }
  return { valid: true, error: null };
};

export const calculateDiscount = (coupon, cartTotal) => {
  if (!coupon) return 0;
  if (coupon.type === 'percentage') {
    return Math.round(cartTotal * (coupon.value / 100));
  }
  return Math.min(Math.round(coupon.value), cartTotal);
};

export const applyCouponCode = async (code, organizationId, cartTotal) => {
  const { data: coupon, error } = await supabase
    .from('coupons')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('code', code.trim().toUpperCase())
    .single();
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
