import { supabase } from '../lib/supabase';

export const getFirstOrganizationId = async () => {
  const { data, error } = await supabase
    .from('organizations')
    .select('id')
    .limit(1)
    .single();
    
  if (error) {
    console.error('Error fetching organization:', error);
    return null;
  }
  return data?.id;
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
