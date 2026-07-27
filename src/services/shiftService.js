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
