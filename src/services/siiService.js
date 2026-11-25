import { supabase } from '../lib/supabase';
import { validateSiiProfile, calculateSimulation } from '../utils/sii';

function check(error) {
  if (!error) return;
  if (['42P01', 'PGRST202', 'PGRST204', 'PGRST205'].includes(error.code)) {
    throw new Error('La integración SII aún no está habilitada en este ambiente. Contacta al administrador para activarla.');
  }
  throw new Error(error.message || 'No se pudo completar la operación.');
}

export async function getSiiWorkspace(organizationId) {
  const [profile, simulations] = await Promise.all([
    supabase.from('sii_issuer_profiles').select('*').eq('organization_id', organizationId).maybeSingle(),
    supabase.from('sii_receipt_simulations').select('*').eq('organization_id', organizationId)
      .order('created_at', { ascending: false }).limit(20),
  ]);
  check(profile.error);
  check(simulations.error);
  return { profile: profile.data, simulations: simulations.data };
}

export async function saveSiiProfile(organizationId, profile) {
  const { data, error } = await supabase.from('sii_issuer_profiles').upsert({
    organization_id: organizationId,
    ...validateSiiProfile(profile),
  }, { onConflict: 'organization_id' }).select().single();
  check(error);
  return data;
}

export async function simulateSiiReceipt(organizationId, requestId, items) {
  calculateSimulation(items);
  const { data, error } = await supabase.rpc('simulate_sii_receipt', {
    p_organization_id: organizationId, p_request_id: requestId, p_items: items,
  });
  check(error);
  return data;
}
