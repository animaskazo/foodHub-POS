import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../components/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { 
  Users, 
  Search, 
  Phone, 
  Mail, 
  ShoppingBag, 
  DollarSign, 
  Calendar, 
  Clock, 
  FileText, 
  Loader2,
  ChevronRight,
  Store,
  Globe,
  MessageCircle,
  MapPin
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import Modal from '../components/ui/Modal';
import PageHeader from '../components/ui/PageHeader';

const CustomersView = () => {
  const { organization, loading: authLoading } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal State
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [customerOrders, setCustomerOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  useDocumentTitle('Clientes');

  useEffect(() => {
    if (authLoading) return;
    if (organization?.id) {
      fetchCustomers();
    } else {
      setLoading(false);
      setError('No tienes una organización asignada.');
    }
  }, [organization?.id, authLoading]);

  const fetchCustomers = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('customers')
        .select(`
          *,
          orders (
            id,
            total,
            status
          )
        `)
        .eq('organization_id', organization.id);

      if (fetchError) throw fetchError;

      const processed = (data || []).map(customer => {
        const validOrders = (customer.orders || []).filter(
          o => o.status !== 'cancelled' && o.status !== 'refunded'
        );
        const calculatedOrders = validOrders.length;
        const calculatedSpent = validOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
        
        return {
          ...customer,
          total_orders: calculatedOrders,
          total_spent: calculatedSpent
        };
      });

      // Sort by full_name ascending
      processed.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
      setCustomers(processed);
    } catch (err) {
      console.error('Error fetching customers:', err);
      setError('No se pudieron cargar los clientes.');
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomerOrders = async (customerId) => {
    setLoadingOrders(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('orders')
        .select(`
          id,
          order_number,
          order_type,
          status,
          total,
          created_at,
          notes,
          order_items (
            id,
            product_name,
            quantity,
            unit_price,
            order_item_variants (variant_option_name),
            order_item_ingredients (ingredient_name)
          )
        `)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setCustomerOrders(data || []);
    } catch (err) {
      console.error('Error fetching customer orders:', err);
    } finally {
      setLoadingOrders(false);
    }
  };

  const handleOpenCustomerDetails = (customer) => {
    setSelectedCustomer(customer);
    setIsModalOpen(true);
    fetchCustomerOrders(customer.id);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setTimeout(() => {
      setSelectedCustomer(null);
      setCustomerOrders([]);
    }, 300);
  };

  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return customers;
    const query = searchQuery.toLowerCase();
    return customers.filter(c => 
      (c.full_name || '').toLowerCase().includes(query) ||
      (c.phone || '').toLowerCase().includes(query) ||
      (c.email || '').toLowerCase().includes(query)
    );
  }, [customers, searchQuery]);

  const fmt = (n) => Number(n).toLocaleString('es-CL');

  const getStatusTag = (status) => {
    const statusMap = {
      pending: { label: 'Pendiente', variant: 'grayOutline' },
      confirmed: { label: 'Confirmado', variant: 'info' },
      preparing: { label: 'Preparando', variant: 'warning' },
      ready: { label: 'Listo', variant: 'success' },
      delivered: { label: 'Entregado', variant: 'purple' },
      cancelled: { label: 'Cancelado', variant: 'error' },
      refunded: { label: 'Reembolsado', variant: 'error' },
    };
    const mapped = statusMap[status] || { label: status, variant: 'grayOutline' };
    return (
      <Badge variant={mapped.variant}>
        {mapped.label}
      </Badge>
    );
  };

  const getChannelChip = (orderType) => {
    const channelMap = {
      table:    { label: 'Local',    Icon: Store,       color: 'bg-gray-100 text-gray-700' },
      takeaway: { label: 'Llevar',   Icon: ShoppingBag,  color: 'bg-gray-100 text-gray-700' },
      pickup:   { label: 'Retiro',   Icon: ShoppingBag,  color: 'bg-gray-100 text-gray-700' },
      online:   { label: 'Online',   Icon: Globe,        color: 'bg-gray-100 text-gray-700' },
      whatsapp: { label: 'WhatsApp', Icon: MessageCircle, color: 'bg-gray-100 text-gray-700' },
    };
    const ch = channelMap[orderType] || { label: orderType, Icon: Store, color: 'bg-gray-100 text-gray-700' };
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg font-medium text-xs ${ch.color}`}>
        <ch.Icon className="h-3 w-3" />
        {ch.label}
      </span>
    );
  };

  return (
    <div className="flex-1 overflow-auto bg-gray-50 p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader 
          title="Clientes"
          subtitle="Historial de consumo y datos de contacto de tus clientes"
        />

          {/* Search Bar */}
          <div className="relative max-w-md bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
              <Search className="h-4 w-4" />
            </div>
            <input 
              type="text" 
              placeholder="Buscar por nombre, teléfono o email..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-white text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none transition-colors border-0"
            />
          </div>

          {error && (
            <div className="p-4 bg-red-50 text-red-700 rounded-2xl border border-red-100 text-sm font-medium">
              {error}
            </div>
          )}

          {/* Loading state */}
          {loading ? (
            <div className="py-24 text-center text-gray-500 flex flex-col items-center justify-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-black" />
              <p className="font-semibold text-sm">Cargando listado de clientes...</p>
            </div>
          ) : filteredCustomers.length > 0 ? (
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 text-xs font-bold uppercase tracking-wider border-b border-gray-150">
                        <th className="px-6 py-4">Nombre</th>
                        <th className="px-6 py-4">Teléfono</th>
                        <th className="px-6 py-4">Email</th>
                        <th className="px-6 py-4">Dirección</th>
                        <th className="px-6 py-4 text-center">Pedidos</th>
                        <th className="px-6 py-4 text-right">Consumo Total</th>
                        <th className="px-6 py-4 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm">
                      {filteredCustomers.map((customer) => (
                        <tr 
                          key={customer.id}
                          onClick={() => handleOpenCustomerDetails(customer)}
                          className="hover:bg-gray-50 transition-colors cursor-pointer group"
                        >
                          <td className="px-6 py-4 font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                            {customer.full_name || <span className="text-gray-400 font-normal">—</span>}
                          </td>
                          <td className="px-6 py-4 text-gray-600 font-medium">
                            {customer.phone || <span className="text-gray-400 font-normal">—</span>}
                          </td>
                          <td className="px-6 py-4 text-gray-600">
                            {customer.email || <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-6 py-4 text-gray-500 max-w-xs truncate">
                            {customer.address || <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-6 py-4 text-center font-bold text-gray-900">
                            {customer.total_orders || 0}
                          </td>
                          <td className="px-6 py-4 text-right font-black text-gray-900">
                            ${fmt(customer.total_spent || 0)}
                          </td>
                          <td className="px-6 py-4 text-right text-gray-400">
                            <ChevronRight className="h-5 w-5 group-hover:text-blue-600 transition-colors" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Cards View */}
              <div className="md:hidden flex flex-col gap-3">
                {filteredCustomers.map((customer) => (
                  <div 
                    key={customer.id}
                    onClick={() => handleOpenCustomerDetails(customer)}
                    className="bg-white p-4 rounded-xl border border-gray-200 active:bg-gray-50 flex items-center justify-between transition-all"
                  >
                    <div className="flex-1 min-w-0 pr-3 space-y-1">
                      <h3 className="font-bold text-gray-900 truncate">
                        {customer.full_name || <span className="text-gray-400 font-normal">—</span>}
                      </h3>
                      {customer.phone && (
                        <p className="text-xs text-gray-500 font-medium flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {customer.phone}
                        </p>
                      )}
                      <div className="flex gap-3 pt-1 text-[11px] font-bold text-gray-600">
                        <span>{customer.total_orders || 0} ped.</span>
                        <span className="text-gray-900">${fmt(customer.total_spent || 0)} gastado</span>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-gray-400 shrink-0" />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 py-16 text-center text-gray-500">
              <Users className="h-12 w-12 mx-auto text-gray-300 mb-3" />
              <p className="font-semibold text-lg text-gray-700">No se encontraron clientes</p>
              <p className="text-sm mt-1">Prueba a realizar otra búsqueda.</p>
            </div>
          )}
        </div>

      {/* Details Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        maxWidth="max-w-2xl"
        title={
          selectedCustomer ? (
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {selectedCustomer.full_name || 'Detalles de Cliente'}
              </h2>
              {selectedCustomer.phone && (
                <p className="text-sm text-gray-500 mt-0.5">{selectedCustomer.phone}</p>
              )}
            </div>
          ) : 'Detalles de Cliente'
        }
      >
        {selectedCustomer && (
          <div className="flex flex-col h-full">
            {/* Modal Body Scroll */}
            <div className="p-6 space-y-6">
              
              {/* Customer Stats Cards */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex flex-col">
                  <span className="text-[11px] text-gray-400 font-bold uppercase tracking-wider mb-1">Pedidos Totales</span>
                  <span className="text-2xl font-black text-gray-900">{selectedCustomer.total_orders || 0}</span>
                </div>
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex flex-col">
                  <span className="text-[11px] text-gray-400 font-bold uppercase tracking-wider mb-1">Total Consumido</span>
                  <span className="text-2xl font-black text-gray-900">${fmt(selectedCustomer.total_spent || 0)}</span>
                </div>
              </div>

              {/* Personal Data */}
              <div className="space-y-3 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Datos de contacto</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  {selectedCustomer.email && (
                    <div className="flex items-center gap-2.5 text-gray-700">
                      <Mail className="h-4 w-4 text-gray-400" />
                      <span className="truncate">{selectedCustomer.email}</span>
                    </div>
                  )}
                  {selectedCustomer.phone && (
                    <div className="flex items-center gap-2.5 text-gray-700">
                      <Phone className="h-4 w-4 text-gray-400" />
                      <span>{selectedCustomer.phone}</span>
                    </div>
                  )}
                  {selectedCustomer.address && (
                    <div className="flex items-center gap-2.5 text-gray-700 md:col-span-2">
                      <MapPin className="h-4 w-4 text-gray-400 shrink-0" />
                      <span className="leading-tight">{selectedCustomer.address}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Orders History list */}
              <div>
                <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-2">
                  <h3 className="font-bold text-lg text-gray-950 flex items-center gap-2">
                    <ShoppingBag className="h-5 w-5 text-gray-450" />
                    Historial de Pedidos
                  </h3>
                  <span className="text-xs text-gray-500 font-medium">{customerOrders.length} registros</span>
                </div>

                {loadingOrders ? (
                  <div className="py-12 text-center text-gray-500 flex flex-col items-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-black" />
                    <p className="text-xs font-semibold">Cargando historial...</p>
                  </div>
                ) : customerOrders.length > 0 ? (
                  <div className="space-y-4">
                    {customerOrders.map((order) => {
                      const date = new Date(order.created_at);
                      const formattedDate = date.toLocaleDateString('es-CL', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      });

                      return (
                        <div key={order.id} className="bg-white border border-gray-150 rounded-xl p-4 space-y-3">
                          {/* Order Card Header */}
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-gray-900">#{order.order_number}</span>
                              {getChannelChip(order.order_type)}
                              {getStatusTag(order.status)}
                            </div>
                            <span className="font-black text-gray-900">${fmt(order.total || 0)}</span>
                          </div>

                          {/* Date & notes */}
                          <div className="text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1 font-medium">
                            <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {formattedDate}</span>
                            {order.notes && (
                              <span className="flex items-center gap-1 text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                                <FileText className="h-3 w-3" /> Nota: {order.notes}
                              </span>
                            )}
                          </div>

                          {/* Order Products List */}
                          <div className="border-t border-gray-50 pt-2 space-y-1.5">
                            {order.order_items?.map((item) => (
                              <div key={item.id} className="flex justify-between items-baseline text-xs">
                                <div className="text-gray-800 flex-1 pr-3">
                                  <span className="font-bold text-gray-900 mr-1.5">{item.quantity}x</span>
                                  <span>{item.product_name}</span>
                                  {item.order_item_variants?.[0]?.variant_option_name && (
                                    <span className="text-gray-400 text-[10px] ml-1">
                                      ({item.order_item_variants[0].variant_option_name})
                                    </span>
                                  )}
                                  {item.order_item_ingredients?.length > 0 && (
                                    <span className="text-orange-500/80 text-[10px] block mt-0.5 pl-5">
                                      + {item.order_item_ingredients.map(ing => ing.ingredient_name).join(', ')}
                                    </span>
                                  )}
                                </div>
                                <span className="font-semibold text-gray-650">${fmt(item.unit_price * item.quantity)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-12 text-center text-gray-400 text-sm">
                    No se registran pedidos asociados.
                  </div>
                )}
              </div>

            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default CustomersView;
