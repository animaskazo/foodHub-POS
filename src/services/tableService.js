import { supabase } from '../lib/supabase';

// ── ZONES ───────────────────────────────────────────────────

export const getTableZones = async (branchId) => {
  if (!branchId) throw new Error('Branch ID is required');
  const { data, error } = await supabase
    .from('table_zones')
    .select('*')
    .eq('branch_id', branchId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
};

export const createTableZone = async (zoneData) => {
  const { data, error } = await supabase
    .from('table_zones')
    .insert([zoneData])
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateTableZone = async (id, zoneData) => {
  const { data, error } = await supabase
    .from('table_zones')
    .update(zoneData)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteTableZone = async (id) => {
  // First, delete all tables in this zone to ensure they are removed
  const { error: tablesError } = await supabase
    .from('restaurant_tables')
    .delete()
    .eq('zone_id', id);
  if (tablesError) throw tablesError;

  // Then delete the zone itself
  const { error } = await supabase
    .from('table_zones')
    .delete()
    .eq('id', id);
  if (error) throw error;
};


// ── TABLES ──────────────────────────────────────────────────

export const getRestaurantTables = async (branchId) => {
  if (!branchId) throw new Error('Branch ID is required');
  const { data, error } = await supabase
    .from('restaurant_tables')
    .select(`
      *,
      orders(id, total, status)
    `)
    .eq('branch_id', branchId);
  if (error) throw error;
  return data || [];
};

export const createRestaurantTable = async (tableData) => {
  const { data, error } = await supabase
    .from('restaurant_tables')
    .insert([tableData])
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateRestaurantTable = async (id, tableData) => {
  const { data, error } = await supabase
    .from('restaurant_tables')
    .update(tableData)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteRestaurantTable = async (id) => {
  const { error } = await supabase
    .from('restaurant_tables')
    .delete()
    .eq('id', id);
  if (error) throw error;
};

export const updateTablesBatch = async (tablesUpdates) => {
  const promises = tablesUpdates.map(t => {
    const { id, ...updates } = t;
    return supabase.from('restaurant_tables')
      .update(updates)
      .eq('id', id);
  });
  
  const results = await Promise.all(promises);
  const errors = results.filter(r => r.error);
  if (errors.length > 0) {
    console.error('Errors updating tables batch:', errors);
    throw new Error('Some tables failed to update.');
  }
};
