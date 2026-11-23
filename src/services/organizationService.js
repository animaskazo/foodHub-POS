import { supabase } from '../lib/supabase';

export const getFirstOrganizationId = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data } = await supabase
      .from('staff')
      .select('organization_id')
      .eq('id', user.id)
      .maybeSingle();
      
    if (data?.organization_id) return data.organization_id;
  }
  
  // Fallback if no user is logged in
  const { data, error } = await supabase
    .from('organizations')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
    
  if (error) {
    console.error('Error fetching organization:', error);
    return null;
  }
  return data.id;
};

export const getOrganizationDetails = async (id) => {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
};

export const updateOrganizationDetails = async (id, updates) => {
  const { data, error } = await supabase
    .from('organizations')
    .update(updates)
    .eq('id', id)
    .select();

  if (error) throw error;
  return data[0];
};

export const getStaff = async (organizationId) => {
  const { data, error } = await supabase
    .from('staff')
    .select('*')
    .eq('organization_id', organizationId)
    .order('full_name');

  if (error) throw error;
  return data;
};

// ── Credenciales de terceros (Klap, Uber Direct) ──
// Viven en `organization_secrets`, que el navegador no puede leer. Solo se consulta
// si están configuradas y se guardan valores nuevos (owner/admin o super-admin).

export const getOrgSecretsStatus = async (organizationId) => {
  const { data, error } = await supabase.rpc('get_org_secrets_status', { p_organization_id: organizationId });
  if (error) throw error;
  return Array.isArray(data) ? data[0] || null : data;
};

// Cada valor: undefined/null → no cambia · '' → lo borra · texto → lo reemplaza.
export const setOrgSecrets = async (organizationId, { klapApiKey, uberClientId, uberClientSecret, uberCustomerId } = {}) => {
  const { error } = await supabase.rpc('set_org_secrets', {
    p_organization_id: organizationId,
    p_klap_api_key: klapApiKey ?? null,
    p_uber_client_id: uberClientId ?? null,
    p_uber_client_secret: uberClientSecret ?? null,
    p_uber_customer_id: uberCustomerId ?? null,
  });
  if (error) throw error;
};
