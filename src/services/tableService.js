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
      orders(id, total, status, payments(id, status))
    `)
    .eq('branch_id', branchId);
  if (error) throw error;
  return data || [];
};

/* ── Invalidación de mesas ──────────────────────────────
   El mapa, el modal de selección y el desplegable del carrito mantienen cada
   uno su propia copia de getRestaurantTables, que solo se cargaba al montar.
   Como el cobro escribe en payments y orders (no en restaurant_tables), la mesa
   seguía mostrando el monto viejo —en rojo— hasta recargar la página.

   En vez de subir las mesas al PosView y bajarlas por props, los componentes se
   suscriben acá y el POS avisa después de cada acción que cambia pedidos o
   pagos. Cada componente sigue siendo autónomo, como hasta ahora. */
const tablesChangeListeners = new Set();

export const onTablesChanged = (listener) => {
  tablesChangeListeners.add(listener);
  return () => tablesChangeListeners.delete(listener);
};

export const notifyTablesChanged = () => {
  tablesChangeListeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.error('Error notificando cambio de mesas:', error);
    }
  });
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
