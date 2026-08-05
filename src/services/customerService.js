import { supabase } from '../lib/supabase';

// Normaliza el teléfono y arma patrones de búsqueda flexible (formato chileno)
// para no duplicar clientes cuando cambia el formato: "+56 9 XXXX XXXX", "9 XXXX XXXX", "569XXXXXXX", etc.
const phoneSearch = (phone) => {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length < 9) return null;
  const suffix = digits.slice(-9);
  const spaced = `%${suffix[0]}%${suffix.slice(1, 5)}%${suffix.slice(5)}`;
  return {
    or: `phone.eq.${suffix},phone.eq.+56${suffix},phone.eq.56${suffix},phone.ilike.${spaced}`,
  };
};

export const findCustomerByPhone = async (organizationId, phone) => {
  const search = phoneSearch(phone);
  if (!organizationId || !search) return null;

  const { data, error } = await supabase
    .from('customers')
    .select('id, full_name, email, phone, address')
    .eq('organization_id', organizationId)
    .or(search.or)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error fetching customer by phone:', error);
    return null;
  }
  return data;
};

// Busca por teléfono; si existe actualiza nombre/email con los datos nuevos,
// si no existe lo crea. Devuelve el id del cliente.
export const upsertCustomerForOrder = async (organizationId, { phone, name, email }) => {
  if (!organizationId || !phone) return null;

  const existing = await findCustomerByPhone(organizationId, phone);
  if (existing) {
    const updates = {};
    if (name) updates.full_name = name;
    if (email) updates.email = email;
    if (Object.keys(updates).length > 0) {
      const { error } = await supabase.from('customers').update(updates).eq('id', existing.id);
      if (error) console.error('Error updating customer:', error);
    }
    return existing.id;
  }

  const { data: newCustomer, error } = await supabase
    .from('customers')
    .insert([{
      organization_id: organizationId,
      phone,
      full_name: name || null,
      email: email || null,
    }])
    .select('id')
    .single();

  if (error) {
    console.error('Error creating customer:', error);
    return null;
  }
  return newCustomer?.id || null;
};

export const updateCustomer = async (id, data) => {
  const { error } = await supabase
    .from('customers')
    .update({
      full_name: data.full_name || null,
      phone: data.phone || null,
      email: data.email || null,
      address: data.address || null,
      notes: data.notes || null,
    })
    .eq('id', id);
  if (error) throw error;
};

export const deleteCustomer = async (id) => {
  // Desvincula los pedidos (mantienen su snapshot customer_name/customer_phone)
  await supabase.from('orders').update({ customer_id: null }).eq('customer_id', id);
  const { error } = await supabase.from('customers').delete().eq('id', id);
  if (error) throw error;
};

export const bulkDeleteCustomers = async (ids) => {
  if (!ids || ids.length === 0) return;
  await supabase.from('orders').update({ customer_id: null }).in('customer_id', ids);
  const { error } = await supabase.from('customers').delete().in('id', ids);
  if (error) throw error;
};
