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

/* ── Cache de mesas ─────────────────────────────────────
   Mapa, modal de selección y desplegable del carrito piden las mesas al
   montar, casi siempre contra la misma sucursal y en el mismo instante. La
   lista cambia muy pocas veces (solo al agregar, renombrar o reordenar mesas),
   así que se cachea.

   Se guarda la promesa y no solo el resultado: eso además deduplica las
   llamadas simultáneas, que de otro modo harían tres consultas idénticas. El
   TTL es solo una red de seguridad; lo que mantiene los datos al día es la
   invalidación explícita (notifyTablesChanged / invalidateTablesCache). */
const TABLES_CACHE_TTL = 30_000;
const tablesCache = new Map();

export const getRestaurantTables = async (branchId) => {
  if (!branchId) throw new Error('Branch ID is required');

  const cached = tablesCache.get(branchId);
  if (cached && Date.now() - cached.at < TABLES_CACHE_TTL) {
    return cached.promise;
  }

  const entry = { at: Date.now(), promise: null };
  entry.promise = supabase
    .from('restaurant_tables')
    .select(`
      *,
      orders(id, total, status, payments(id, status))
    `)
    .eq('branch_id', branchId)
    .then(({ data, error }) => {
      if (error) {
        // Un fallo no se cachea: se reintenta en la próxima llamada.
        tablesCache.delete(branchId);
        throw error;
      }
      entry.at = Date.now();
      return data || [];
    });

  tablesCache.set(branchId, entry);
  // Si nadie espera la promesa, este catch evita el unhandled rejection.
  entry.promise.catch(() => {});

  return entry.promise;
};

export const invalidateTablesCache = () => tablesCache.clear();

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
  // Primero se limpia la cache: los listeners van a releer y tienen que recibir
  // datos frescos, no la copia cacheada que acabou de quedar vieja.
  invalidateTablesCache();

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
