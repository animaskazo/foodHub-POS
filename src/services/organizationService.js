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
