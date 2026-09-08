import React, { useEffect, useState } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { User, Calendar, Shield, Loader2, Building2, MessageSquare, DollarSign, ExternalLink, ArrowLeft, ChevronRight, PackageOpen, Package, X, Eye, MapPin, CreditCard, ShoppingBag, MessageCircle, RefreshCw, ToggleLeft, ToggleRight, Sparkles, Globe, Store } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getStoreUrl } from '../utils/tenant';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import AIImportModal from '../components/catalog/AIImportModal';
import EditProductModal from '../components/catalog/EditProductModal';
import OrderDetailModal from '../components/pos/OrderDetailModal';
import KlapReconciliationTab from '../components/superadmin/KlapReconciliationTab';
import { getPaymentMethod } from '../utils/orderUtils';

const SuperAdminView = () => {
  const [selectedOrganization, setSelectedOrganization] = useState(null);
  const [detailTab, setDetailTab] = useState('overview');
  
  const [users, setUsers] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [feedbacks, setFeedbacks] = useState([]);
  const [products, setProducts] = useState([]);
  
  const [orgOrders, setOrgOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAIImportOpen, setIsAIImportOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState(null);

  // ── Gestión de personal (solo Super Admin) ──
  const [supremos, setSupremos] = useState([]);
  const [staffBusy, setStaffBusy] = useState(null);
  const [showCreateSeller, setShowCreateSeller] = useState(false);
  const [newSellerName, setNewSellerName] = useState('');
  const [newSellerEmail, setNewSellerEmail] = useState('');
  const [createdPin, setCreatedPin] = useState(null);

  const ROLE_LABELS = { owner: 'Administrador', admin: 'Administrador', manager: 'Encargado', cashier: 'Vendedor', kitchen: 'Cocina', waiter: 'Mesero' };

  const callStaffFn = async (payload) => {
    const { data, error } = await supabase.functions.invoke('create-staff', { body: payload });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const fetchSupremos = async () => {
    const { data } = await supabase.from('super_admins').select('user_id');
    setSupremos((data || []).map(r => r.user_id));
  };

  const handleCreateSeller = async () => {
    if (!selectedOrganization || !newSellerEmail.trim()) return;
    setStaffBusy('create');
    setCreatedPin(null);
    try {
      const data = await callStaffFn({
        action: 'create',
        email: newSellerEmail.trim(),
        full_name: newSellerName.trim(),
        organization_id: selectedOrganization.id,
      });
      setCreatedPin({ email: newSellerEmail.trim(), pin: data.pin });
      setNewSellerEmail('');
      setNewSellerName('');
      await fetchUsers();
      toast.success('Vendedor creado');
    } catch (e) {
      console.error(e);
      toast.error(e.message || 'No se pudo crear el vendedor');
    } finally {
      setStaffBusy(null);
    }
  };

  const handleResetPin = async (userId) => {
    setStaffBusy(userId);
    try {
      const data = await callStaffFn({ action: 'reset-pin', user_id: userId });
      setCreatedPin({ email: null, pin: data.pin });
      toast.success('Nuevo PIN generado');
    } catch (e) {
      console.error(e);
      toast.error(e.message || 'No se pudo generar el PIN');
    } finally {
      setStaffBusy(null);
    }
  };

  const handleToggleActive = async (user) => {
    setStaffBusy(user.id);
    try {
      await callStaffFn({ action: 'set-active', user_id: user.id, is_active: user.isActive === false });
      await fetchUsers();
      toast.success(user.isActive === false ? 'Cuenta activada' : 'Cuenta desactivada');
    } catch (e) {
      console.error(e);
      toast.error(e.message || 'No se pudo actualizar');
    } finally {
      setStaffBusy(null);
    }
  };

  const handleToggleSupremo = async (user) => {
    const isSup = supremos.includes(user.id);
    setStaffBusy(user.id);
    try {
      await callStaffFn({ action: 'set-supremo', user_id: user.id, value: !isSup });
      await fetchSupremos();
      toast.success(!isSup ? 'Super Admin otorgado' : 'Super Admin revocado');
    } catch (e) {
      console.error(e);
      toast.error(e.message || 'No se pudo actualizar');
    } finally {
      setStaffBusy(null);
    }
  };

  const fetchOrgOrders = async (orgId) => {
    setLoadingOrders(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('orders')
        .select(`
          id,
          order_number,
          order_type,
          delivery_type,
          delivery_address,
          customer_name,
          customer_phone,
          status,
          total,
          subtotal,
          tax_amount,
          delivery_fee,
          delivery_notes,
          notes,
          created_at,
          scheduled_at,
          uber_delivery_id,
          uber_tracking_url,
          uber_status,
          is_klap_reconciled,
          payments ( method, status, reference_code ),
          order_items (
            *,
            products(description, product_images(url)),
            order_item_variants(variant_option_name),
            order_item_ingredients(ingredient_name, price)
          )
        `)
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      
      setOrgOrders(data || []);
    } catch (err) {
      console.error('Error fetching org orders:', err);
    } finally {
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    const handleReload = () => {
      if (selectedOrganization?.id) {
        fetchOrgOrders(selectedOrganization.id);
      }
    };
    window.addEventListener('reload-orders', handleReload);
    return () => window.removeEventListener('reload-orders', handleReload);
  }, [selectedOrganization]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([
        fetchUsers(),
        fetchSupremos(),
        fetchOrganizations(),
        fetchFeedbacks(),
        fetchProducts()
      ]);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    const { data, error: fetchError } = await supabase
      .from('staff')
      .select(`
        id,
        full_name,
        role,
        is_active,
        created_at,
        organization_id,
        uber_direct_enabled,
        whatsapp_enabled,
        organizations ( name )
      `)
      .order('created_at', { ascending: false });

    if (fetchError) throw fetchError;

    const formattedUsers = data.map(staff => ({
      id: staff.id,
      name: staff.full_name || 'Sin Nombre',
      email: 'N/A (Auth hidden)',
      organizationId: staff.organization_id,
      organizationName: staff.organizations?.name || 'Unknown',
      rawRole: staff.role,
      role: ROLE_LABELS[staff.role] || staff.role,
      isActive: staff.is_active !== false,
      createdAt: staff.created_at,
      uberDirectEnabled: staff.uber_direct_enabled || false,
      whatsappEnabled: staff.whatsapp_enabled || false,
    }));
    setUsers(formattedUsers);
  };

  const fetchOrganizations = async () => {
    const { data, error: fetchError } = await supabase
      .from('organizations')
      .select('id, name, slug, created_at, whatsapp_phone_number_id, whatsapp_inbox_url, whatsapp_inbox_enabled, uber_enabled, delivery_mode, uber_client_id, uber_customer_id, dine_in_enabled, orders(total)')
      .order('created_at', { ascending: false });

    if (fetchError) throw fetchError;

    const formattedOrgs = data.map(org => {
      const ordersArray = org.orders || [];
      const totalSales = ordersArray.reduce((sum, order) => sum + Number(order.total || 0), 0);
      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        createdAt: org.created_at,
        whatsappPhoneNumberId: org.whatsapp_phone_number_id,
        whatsappInboxUrl: org.whatsapp_inbox_url,
        whatsappInboxEnabled: org.whatsapp_inbox_enabled,
        uberEnabled: org.uber_enabled || false,
        dineInEnabled: org.dine_in_enabled === true, // default to false
        deliveryMode: org.delivery_mode || 'own',
        uberClientId: org.uber_client_id || '',
        uberCustomerId: org.uber_customer_id || '',
        orderCount: ordersArray.length,
        totalSales: totalSales,
      };
    });
    setOrganizations(formattedOrgs);
  };

  const fetchFeedbacks = async () => {
    const { data, error: fetchError } = await supabase
      .from('app_feedback')
      .select(`
        id,
        description,
        image_url,
        created_at,
        organization_id,
        organizations(name)
      `)
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.warn('Feedback table error:', fetchError);
      setFeedbacks([]);
      return;
    }

    const formattedFeedbacks = data.map(fb => ({
      id: fb.id,
      description: fb.description,
      imageUrl: fb.image_url,
      organizationId: fb.organization_id,
      organizationName: fb.organizations?.name || 'Desconocido',
      createdAt: fb.created_at
    }));
    setFeedbacks(formattedFeedbacks);
  };

  const fetchProducts = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, sku, base_price, status, organization_id, product_images(url)')
      .order('name');
    if (!error && data) setProducts(data);
  };

  useDocumentTitle('Super Admin');

  // Derived state for the selected organization
  const orgUsers = users.filter(u => u.organizationId === selectedOrganization?.id);
  const orgFeedbacks = feedbacks.filter(f => f.organizationId === selectedOrganization?.id);
  const orgProducts = products.filter(p => p.organization_id === selectedOrganization?.id);

  return (
    <div className="min-h-full bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-4 md:px-8 py-6 shrink-0 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Super Admin Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Gestión individualizada de negocios</p>
        </div>
      </header>

      {/* Content */}
      <div className="p-4 md:p-8">
        
        {error && (
          <div className="p-4 mb-6 bg-red-50 text-red-700 text-sm   border">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center py-32 bg-white rounded-xl border">
            <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
          </div>
        ) : !selectedOrganization ? (
          
          /* =========================================================
             MASTER VIEW: List of all Organizations
             ========================================================= */
          <div className="bg-white rounded-xl border overflow-hidden min-h-[400px]">
            <div className="px-6 py-4 border-b bg-gray-50">
              <h2 className="font-semibold text-gray-800">Negocios Registrados</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="bg-gray-50/50 border-b">
                    <th className="px-6 py-4 text-xs uppercase tracking-wider font-semibold text-gray-500">Negocio</th>
                    <th className="px-6 py-4 text-xs uppercase tracking-wider font-semibold text-gray-500">Órdenes</th>
                    <th className="px-6 py-4 text-xs uppercase tracking-wider font-semibold text-gray-500">Ventas Totales</th>
                    <th className="px-6 py-4 text-xs uppercase tracking-wider font-semibold text-gray-500">Registro</th>
                    <th className="px-6 py-4 text-xs uppercase tracking-wider font-semibold text-gray-500 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {organizations.map((org) => (
                    <tr 
                      key={org.id} 
                      onClick={() => {
                        setSelectedOrganization(org);
                        setDetailTab('overview');
                        fetchOrgOrders(org.id);
                      }}
                      className="hover:bg-gray-50 transition-colors cursor-pointer group"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10   bg-gray-100 border flex items-center justify-center shrink-0">
                            <Building2 className="h-5 w-5 text-gray-500" />
                          </div>
                          <span className="font-semibold text-gray-900">{org.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {org.orderCount}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 font-semibold text-green-700 bg-green-50 px-2.5 py-1   text-sm border border-green-100">
                          <DollarSign className="h-3 w-3" />
                          {org.totalSales.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(org.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button variant="ghost" className="text-blue-600 font-medium text-sm flex items-center opacity-0 group-hover:opacity-100 transition-opacity float-right hover:bg-blue-50">
                          Ver Detalles <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {organizations.length === 0 && (
                    <tr>
                      <td colSpan="5" className="text-center py-12 text-gray-500">
                        No hay negocios registrados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* =========================================================
             DETAIL VIEW: Specific Organization
             ========================================================= */
          <div className="space-y-6 animate-in slide-in-from-bottom-2 fade-in">
            {/* Detail Header & Back Button */}
            <div>
              <Button 
                variant="ghost"
                onClick={() => setSelectedOrganization(null)}
                className="flex items-center text-sm font-medium text-gray-500 hover:text-black hover:bg-transparent px-0 h-auto transition-colors mb-4"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Volver a Negocios
              </Button>
              
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-3xl font-bold text-gray-900">{selectedOrganization.name}</h2>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 mt-2">
                    <p className="text-sm text-gray-500 flex items-center gap-1.5">
                      <Calendar className="h-4 w-4 text-gray-400" /> 
                      Registrado el {new Date(selectedOrganization.createdAt).toLocaleDateString()}
                    </p>
                    
                    <a 
                      href={getStoreUrl(selectedOrganization.slug) || `/order/${encodeURIComponent(selectedOrganization.name)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 transition-colors w-fit rounded-md"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Ver eCommerce
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Detail Tabs */}
            <div className="flex space-x-1 border-b overflow-x-auto hide-scrollbar">
              <Button
                variant="ghost"
                onClick={() => setDetailTab('overview')}
                className={`px-4 py-3 h-auto rounded-none text-sm font-medium transition-colors border-b-2 hover:bg-gray-50 ${
                  detailTab === 'overview' ? '!border-b-black border-t-transparent border-x-transparent text-black bg-gray-50/50' : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                Resumen
              </Button>
              <Button
                variant="ghost"
                onClick={() => setDetailTab('orders')}
                className={`px-4 py-3 h-auto rounded-none text-sm font-medium transition-colors border-b-2 flex items-center gap-2 hover:bg-gray-50 ${
                  detailTab === 'orders' ? '!border-b-black border-t-transparent border-x-transparent text-black bg-gray-50/50' : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                Pedidos
                <span className="bg-gray-200 text-gray-700 py-0.5 px-2 rounded-full text-xs font-bold leading-none flex items-center">{orgOrders.length}</span>
              </Button>
              <Button
                variant="ghost"
                onClick={() => setDetailTab('users')}
                className={`px-4 py-3 h-auto rounded-none text-sm font-medium transition-colors border-b-2 flex items-center gap-2 hover:bg-gray-50 ${
                  detailTab === 'users' ? '!border-b-black border-t-transparent border-x-transparent text-black bg-gray-50/50' : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                Usuarios
                <span className="bg-gray-200 text-gray-700 py-0.5 px-2 rounded-full text-xs font-bold leading-none flex items-center">{orgUsers.length}</span>
              </Button>
              <Button
                variant="ghost"
                onClick={() => setDetailTab('products')}
                className={`px-4 py-3 h-auto rounded-none text-sm font-medium transition-colors border-b-2 flex items-center gap-2 hover:bg-gray-50 ${
                  detailTab === 'products' ? '!border-b-black border-t-transparent border-x-transparent text-black bg-gray-50/50' : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                Catálogo
                <span className="bg-gray-200 text-gray-700 py-0.5 px-2 rounded-full text-xs font-bold leading-none flex items-center">{orgProducts.length}</span>
              </Button>
              <Button
                variant="ghost"
                onClick={() => setDetailTab('klap')}
                className={`px-4 py-3 h-auto rounded-none text-sm font-medium transition-colors border-b-2 flex items-center gap-2 hover:bg-gray-50 ${
                  detailTab === 'klap' ? '!border-b-black border-t-transparent border-x-transparent text-black bg-gray-50/50' : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <DollarSign className="h-4 w-4" />
                Conciliación Klap
              </Button>
              <Button
                variant="ghost"
                onClick={() => setDetailTab('reports')}
                className={`px-4 py-3 h-auto rounded-none text-sm font-medium transition-colors border-b-2 flex items-center gap-2 hover:bg-gray-50 ${
                  detailTab === 'reports' ? '!border-b-black border-t-transparent border-x-transparent text-black bg-gray-50/50' : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                Reportes
                {orgFeedbacks.length > 0 && (
                  <span className="bg-red-100 text-red-600 py-0.5 px-2 rounded-full text-xs font-bold leading-none flex items-center">{orgFeedbacks.length}</span>
                )}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setDetailTab('integrations')}
                className={`px-4 py-3 h-auto rounded-none text-sm font-medium transition-colors border-b-2 flex items-center gap-2 hover:bg-gray-50 ${
                  detailTab === 'integrations' ? '!border-b-black border-t-transparent border-x-transparent text-black bg-gray-50/50' : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                Integraciones
              </Button>
            </div>

            {/* Detail Tab Contents */}
            <div className="bg-white rounded-xl border p-4 md:p-6 min-h-[300px]">
              


              {/* Orders */}
              {detailTab === 'orders' && (
                <div>
                  {loadingOrders ? (
                    <div className="flex justify-center items-center py-12">
                      <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
                    </div>
                  ) : orgOrders.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <ShoppingBag className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                      <p>Este negocio no tiene pedidos registrados.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto -mx-6 -my-6">
                      <table className="w-full text-left border-collapse whitespace-nowrap">
                        <thead>
                          <tr className="bg-gray-50 border-b">
                            <th className="px-6 py-4 text-xs uppercase tracking-wider font-semibold text-gray-500">Número</th>
                            <th className="px-6 py-4 text-xs uppercase tracking-wider font-semibold text-gray-500">Cliente</th>
                            <th className="px-6 py-4 text-xs uppercase tracking-wider font-semibold text-gray-500">Origen / Entrega</th>
                            <th className="px-6 py-4 text-xs uppercase tracking-wider font-semibold text-gray-500">Fecha</th>
                            <th className="px-6 py-4 text-xs uppercase tracking-wider font-semibold text-gray-500">Total</th>
                            <th className="px-6 py-4 text-xs uppercase tracking-wider font-semibold text-gray-500">Estado</th>
                            <th className="px-6 py-4 text-xs uppercase tracking-wider font-semibold text-gray-500 text-right">Acción</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {orgOrders.map((order) => {
                            const isDeliveryOrder = order.delivery_type === 'delivery';
                            const orderDate = new Date(order.created_at).toLocaleString('es-CL', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            });
                            return (
                              <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4 font-semibold text-gray-900">
                                  #{order.order_number}
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-700">
                                  {order.customer_name || 'Cliente'}
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-600">
                                  <span className="capitalize">{order.order_type}</span>
                                  {isDeliveryOrder ? (
                                    <span className="ml-2 text-xs bg-orange-50 border border-orange-100 text-orange-600 px-2 py-0.5 rounded">Despacho</span>
                                  ) : (
                                    <span className="ml-2 text-xs bg-green-50 border border-green-100 text-green-600 px-2 py-0.5 rounded">Retiro</span>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-500">
                                  {orderDate}
                                </td>
                                <td className="px-6 py-4">
                                  <div className="text-sm font-bold text-gray-900">
                                    ${Number(order.total || 0).toLocaleString('es-CL')}
                                  </div>
                                  <div 
                                    className="text-[10px] text-gray-500 mt-0.5 w-fit"
                                    title={order.payments?.find(p => p.reference_code)?.reference_code ? `Klap ID: ${order.payments.find(p => p.reference_code).reference_code}` : undefined}
                                  >
                                    <span className="flex items-center gap-1 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                                      <CreditCard className="w-3 h-3" />
                                      {getPaymentMethod(order)}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded ${
                                    order.status === 'scheduled' ? 'bg-indigo-100 text-indigo-800' :
                                    order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                    order.status === 'confirmed' ? 'bg-blue-100 text-blue-800' :
                                    order.status === 'preparing' ? 'bg-purple-100 text-purple-800' :
                                    order.status === 'ready' ? 'bg-indigo-100 text-indigo-800' :
                                    order.status === 'completed' ? 'bg-green-100 text-green-800' :
                                    'bg-red-100 text-red-800'
                                  }`}>
                                    {order.status === 'scheduled' ? 'Programado' :
                                     order.status === 'pending' ? 'Pendiente' :
                                     order.status === 'confirmed' ? 'Confirmado' :
                                     order.status === 'preparing' ? 'Preparando' :
                                     order.status === 'ready' ? 'Listo' :
                                     order.status === 'completed' ? 'Completado' :
                                     'Cancelado'}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <Button 
                                    variant="ghost" 
                                    onClick={() => setSelectedOrder(order)}
                                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 text-xs font-semibold px-2.5 py-1 float-right"
                                  >
                                    <Eye className="h-3.5 w-3.5 mr-1" />
                                    Ver Detalle
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Overview */}
              {detailTab === 'overview' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-6 rounded-xl border bg-gray-50 flex items-center gap-4">
                    <div className="h-12 w-12 bg-green-100 flex items-center justify-center shrink-0">
                      <DollarSign className="h-6 w-6 text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Ventas Totales</p>
                      <p className="text-2xl font-bold text-gray-900">
                        ${selectedOrganization.totalSales.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                  
                  <div className="p-6 rounded-xl border bg-gray-50 flex items-center gap-4">
                    <div className="h-12 w-12 bg-blue-100 flex items-center justify-center shrink-0">
                      <PackageOpen className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Órdenes Realizadas</p>
                      <p className="text-2xl font-bold text-gray-900">{selectedOrganization.orderCount}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Users */}
              {detailTab === 'users' && (
                <div className="p-4 md:p-6 space-y-4">
                  {/* Crear vendedor con PIN */}
                  {!showCreateSeller ? (
                    <Button onClick={() => { setShowCreateSeller(true); setCreatedPin(null); }} className="bg-black text-white font-bold text-sm hover:bg-gray-800 cursor-pointer">
                      + Crear vendedor (PIN)
                    </Button>
                  ) : (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                      <p className="font-bold text-sm text-gray-900">Nuevo vendedor para {selectedOrganization.name}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                          value={newSellerName}
                          onChange={(e) => setNewSellerName(e.target.value)}
                          placeholder="Nombre (ej: María)"
                          className="h-11 px-4 bg-white border border-gray-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black"
                        />
                        <input
                          value={newSellerEmail}
                          onChange={(e) => setNewSellerEmail(e.target.value)}
                          placeholder="Email (ej: maria@local.cl)"
                          type="email"
                          className="h-11 px-4 bg-white border border-gray-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={handleCreateSeller} disabled={staffBusy === 'create' || !newSellerEmail.trim()} className="bg-black text-white font-bold text-sm hover:bg-gray-800 disabled:opacity-50 cursor-pointer">
                          {staffBusy === 'create' ? 'Creando…' : 'Crear y generar PIN'}
                        </Button>
                        <Button variant="ghost" onClick={() => setShowCreateSeller(false)} className="text-sm cursor-pointer">
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}
                  {createdPin && (
                    <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
                      <p className="text-sm text-amber-900">
                        <span className="font-bold">PIN de un solo uso{createdPin.email ? ` para ${createdPin.email}` : ''}:</span>{' '}
                        <span className="font-black text-2xl tracking-[0.3em]">{createdPin.pin}</span>
                        <span className="block text-xs mt-1">Entrégalo ahora: no se volverá a mostrar. El vendedor deberá cambiarlo al ingresar.</span>
                      </p>
                      <Button
                        variant="ghost"
                        onClick={() => { navigator.clipboard.writeText(createdPin.pin); toast.success('PIN copiado'); }}
                        className="text-sm font-bold text-amber-900 hover:bg-amber-100 cursor-pointer shrink-0"
                      >
                        Copiar
                      </Button>
                    </div>
                  )}
                <div className="overflow-x-auto -mx-4 md:-mx-6">
                  <table className="w-full text-left border-collapse whitespace-nowrap">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="px-6 py-4 text-sm font-semibold text-gray-600">Usuario</th>
                        <th className="px-6 py-4 text-sm font-semibold text-gray-600">Rol</th>
                        <th className="px-6 py-4 text-sm font-semibold text-gray-600">Estado</th>
                        <th className="px-6 py-4 text-sm font-semibold text-gray-600">Registro</th>
                        <th className="px-6 py-4 text-sm font-semibold text-gray-600 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {orgUsers.map((user) => {
                        const isSup = supremos.includes(user.id);
                        const busy = staffBusy === user.id;
                        return (
                        <tr key={user.id} className={`transition-colors ${user.isActive ? 'hover:bg-gray-50' : 'bg-gray-50/60 opacity-70'}`}>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <User className="h-6 w-6 text-gray-900 mx-2" />
                              <div className="font-medium text-gray-900">{user.name}</div>
                              {isSup && <Shield className="h-4 w-4 text-purple-600" title="Super Admin" />}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium ${
                              isSup
                                ? 'bg-purple-100 text-purple-700'
                                : user.rawRole === 'cashier'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-blue-100 text-blue-700'
                            }`}>
                              {(isSup || user.rawRole === 'owner') && <Shield className="h-3 w-3" />}
                              {isSup ? 'Super Admin' : user.role}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${user.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                              {user.isActive ? 'Activo' : 'Desactivado'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">
                            <span className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-gray-400" />
                              {new Date(user.createdAt).toLocaleDateString()}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleResetPin(user.id)}
                                disabled={busy}
                                title="Generar nuevo PIN"
                                className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-50 cursor-pointer"
                              >
                                PIN
                              </button>
                              <button
                                onClick={() => handleToggleActive(user)}
                                disabled={busy}
                                title={user.isActive ? 'Desactivar cuenta' : 'Activar cuenta'}
                                className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-50 cursor-pointer"
                              >
                                {user.isActive
                                  ? <ToggleRight className="h-5 w-5 text-emerald-600" />
                                  : <ToggleLeft className="h-5 w-5 text-gray-400" />}
                              </button>
                              <button
                                onClick={() => handleToggleSupremo(user)}
                                disabled={busy}
                                title={isSup ? 'Quitar Super Admin' : 'Otorgar Super Admin'}
                                className={`p-1.5 rounded-lg disabled:opacity-50 cursor-pointer ${isSup ? 'bg-purple-100 hover:bg-purple-200' : 'hover:bg-gray-100'}`}
                              >
                                <Shield className={`h-5 w-5 ${isSup ? 'text-purple-700' : 'text-gray-300'}`} />
                              </button>
                            </div>
                          </td>
                        </tr>
                        );
                      })}
                      {orgUsers.length === 0 && (
                        <tr>
                          <td colSpan="5" className="text-center py-12 text-gray-500">
                            No hay usuarios en esta organización.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                </div>
              )}

              {/* Klap Reconciliation Tab */}
              {detailTab === 'klap' && (
                <div className="p-4 md:p-8 animate-in fade-in">
                  <KlapReconciliationTab orders={orgOrders} onReconciled={() => fetchOrgOrders(selectedOrganization.id)} />
                </div>
              )}

              {/* Reports */}
              {detailTab === 'reports' && (
                <div>
                  {orgFeedbacks.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <MessageSquare className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                      <p>Este negocio no tiene reportes de problemas.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {orgFeedbacks.map((fb) => (
                        <div key={fb.id} className="border rounded-xl overflow-hidden hover:border-gray-300 transition-colors bg-gray-50 flex flex-col">
                          {fb.imageUrl ? (
                            <div className="h-48 bg-gray-200 border-b relative group">
                              <img 
                                src={fb.imageUrl} 
                                alt="Screenshot" 
                                className="w-full h-full object-cover"
                              />
                              <a 
                                href={fb.imageUrl} 
                                target="_blank" 
                                rel="noreferrer"
                                className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"
                              >
                                <ExternalLink className="h-6 w-6" />
                              </a>
                            </div>
                          ) : (
                            <div className="h-48 bg-gray-200 border-b flex items-center justify-center text-gray-400 text-sm">
                              Sin captura
                            </div>
                          )}
                          <div className="p-4 flex-1 flex flex-col">
                            <div className="flex items-start justify-between mb-2">
                              <span className="text-xs text-gray-500 flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {new Date(fb.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-sm text-gray-700 mt-1">
                              {fb.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Integrations */}
              {detailTab === 'integrations' && (
                <div className="space-y-8">
                  {/* WhatsApp Integration */}
                  <div className="border rounded-xl overflow-hidden">
                    <div className="p-4 md:p-5 flex items-center justify-between border-b">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                          <MessageCircle className="h-5 w-5 text-green-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">WhatsApp</h3>
                          <p className="text-xs text-gray-500">Inbox de conversaciones</p>
                        </div>
                      </div>
                      <label className="flex items-center gap-3 cursor-pointer select-none">
                        <span className={`text-sm font-semibold ${selectedOrganization.whatsappInboxEnabled ? 'text-gray-900' : 'text-gray-400'}`}>
                          Visible en el menú
                        </span>
                        <Switch
                          checked={selectedOrganization.whatsappInboxEnabled}
                          onCheckedChange={async (checked) => {
                            const toastId = toast.loading(checked ? 'Habilitando WhatsApp...' : 'Deshabilitando WhatsApp...');
                            try {
                              const res = await supabase.functions.invoke('manage-inbox', {
                                body: { action: 'toggle', organization_id: selectedOrganization.id, enabled: checked }
                              });
                              if (res.error) throw res.error;
                              setSelectedOrganization(prev => ({ ...prev, whatsappInboxEnabled: checked }));
                              setOrganizations(prev => prev.map(o => o.id === selectedOrganization.id ? { ...o, whatsappInboxEnabled: checked } : o));
                              toast.success(checked ? 'WhatsApp habilitado' : 'WhatsApp deshabilitado', { id: toastId });
                            } catch (err) {
                              console.error(err);
                              toast.error('Error al cambiar estado', { id: toastId });
                            }
                          }}
                        />
                      </label>
                    </div>
                    <div className="px-4 md:px-5 py-3 bg-gray-50/50 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm">
                        {selectedOrganization.whatsappInboxUrl ? (
                          <span className="text-green-600 font-medium flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-green-500"></span>
                            Inbox generado
                          </span>
                        ) : (
                          <span className="text-gray-500">Inbox no generado</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {!selectedOrganization.whatsappInboxUrl ? (
                          <Button
                            size="sm"
                            onClick={async () => {
                              const toastId = toast.loading('Generando inbox...');
                              try {
                                const res = await supabase.functions.invoke('manage-inbox', {
                                  body: { action: 'create', organization_id: selectedOrganization.id }
                                });
                                if (res.error) throw new Error(res.error.message || 'Error');
                                const embedUrl = res.data?.embed_url;
                                if (!embedUrl) throw new Error('No se recibió la URL');
                                setSelectedOrganization(prev => ({ ...prev, whatsappInboxUrl: embedUrl, whatsappInboxEnabled: true }));
                                setOrganizations(prev => prev.map(o => o.id === selectedOrganization.id ? { ...o, whatsappInboxUrl: embedUrl, whatsappInboxEnabled: true } : o));
                                toast.success('Inbox generado', { id: toastId });
                              } catch (err) {
                                toast.error(err.message, { id: toastId });
                              }
                            }}
                          >
                            Generar Inbox
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              if (!confirm('¿Revocar acceso al Inbox?')) return;
                              const toastId = toast.loading('Revocando inbox...');
                              try {
                                const res = await supabase.functions.invoke('manage-inbox', {
                                  body: { action: 'revoke', organization_id: selectedOrganization.id }
                                });
                                if (res.error) throw res.error;
                                setSelectedOrganization(prev => ({ ...prev, whatsappInboxUrl: null, whatsappInboxEnabled: false }));
                                setOrganizations(prev => prev.map(o => o.id === selectedOrganization.id ? { ...o, whatsappInboxUrl: null, whatsappInboxEnabled: false } : o));
                                toast.success('Inbox revocado', { id: toastId });
                              } catch (err) {
                                toast.error('Error al revocar', { id: toastId });
                              }
                            }}
                            className="text-red-600 border-red-200 hover:bg-red-50"
                          >
                            Revocar
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Uber Direct Integration */}
                  <div className="border rounded-xl overflow-hidden">
                    <div className="p-4 md:p-5 flex items-center justify-between border-b">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                          <Globe className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">Uber Direct</h3>
                          <p className="text-xs text-gray-500">Delivery a través de Uber</p>
                        </div>
                      </div>
                      <label className="flex items-center gap-3 cursor-pointer select-none">
                        <span className={`text-sm font-semibold ${selectedOrganization.uberEnabled ? 'text-gray-900' : 'text-gray-400'}`}>
                          Visible en el menú
                        </span>
                        <Switch
                          checked={selectedOrganization.uberEnabled}
                          onCheckedChange={async (checked) => {
                            const toastId = toast.loading(checked ? 'Habilitando Uber Direct...' : 'Deshabilitando Uber Direct...');
                            try {
                              const { error } = await supabase
                                .from('organizations')
                                .update({ uber_enabled: checked })
                                .eq('id', selectedOrganization.id);
                              if (error) throw error;
                              setSelectedOrganization(prev => ({ ...prev, uberEnabled: checked }));
                              setOrganizations(prev => prev.map(o => o.id === selectedOrganization.id ? { ...o, uberEnabled: checked } : o));
                              toast.success(checked ? 'Uber Direct habilitado' : 'Uber Direct deshabilitado', { id: toastId });
                            } catch (err) {
                              console.error(err);
                              toast.error('Error al actualizar', { id: toastId });
                            }
                          }}
                        />
                      </label>
                    </div>
                    <div className="px-4 md:px-5 py-3 bg-gray-50/50 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm">
                        {selectedOrganization.uberClientId && selectedOrganization.uberCustomerId ? (
                          <span className="text-green-600 font-medium flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-green-500"></span>
                            Conectado
                          </span>
                        ) : (
                          <span className="text-amber-600 font-medium flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                            Sin conexión
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        {selectedOrganization.uberClientId ? (
                          <>Client ID: <span className="font-mono">{selectedOrganization.uberClientId}</span></>
                        ) : (
                          'Credenciales no configuradas'
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Dine-In Mode Integration */}
                  <div className="border rounded-xl overflow-hidden">
                    <div className="p-4 md:p-5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
                          <Store className="h-5 w-5 text-orange-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">Modo Salón (Mesas)</h3>
                          <p className="text-xs text-gray-500">Permite gestionar mesas y sectores en el POS</p>
                        </div>
                      </div>
                      <label className="flex items-center gap-3 cursor-pointer select-none">
                        <span className={`text-sm font-semibold ${selectedOrganization.dineInEnabled ? 'text-gray-900' : 'text-gray-400'}`}>
                          Habilitado
                        </span>
                        <Switch
                          checked={selectedOrganization.dineInEnabled}
                          onCheckedChange={async (checked) => {
                            const toastId = toast.loading(checked ? 'Habilitando modo mesas...' : 'Deshabilitando modo mesas...');
                            try {
                              const { error } = await supabase
                                .from('organizations')
                                .update({ dine_in_enabled: checked })
                                .eq('id', selectedOrganization.id);
                              if (error) throw error;
                              setSelectedOrganization(prev => ({ ...prev, dineInEnabled: checked }));
                              setOrganizations(prev => prev.map(o => o.id === selectedOrganization.id ? { ...o, dineInEnabled: checked } : o));
                              toast.success(checked ? 'Modo mesas habilitado' : 'Modo mesas deshabilitado', { id: toastId });
                            } catch (err) {
                              console.error(err);
                              toast.error('Error al actualizar', { id: toastId });
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Products */}
              {detailTab === 'products' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-gray-800">Productos del catálogo</h3>
                    <Button
                      variant="outline"
                      className="text-blue-600 border-blue-200 hover:bg-blue-50"
                      onClick={() => setIsAIImportOpen(true)}
                    >
                      <Sparkles className="h-4 w-4 mr-2" /> Importar menú con IA
                    </Button>
                  </div>
                  <div className="overflow-x-auto -mx-6 -my-6">
                    <table className="w-full text-left border-collapse whitespace-nowrap">
                      <thead>
                        <tr className="bg-gray-50 border-b">
                          <th className="px-6 py-4 text-sm font-semibold text-gray-600">Producto</th>
                          <th className="px-6 py-4 text-sm font-semibold text-gray-600">SKU</th>
                          <th className="px-6 py-4 text-sm font-semibold text-gray-600">Precio Base</th>
                          <th className="px-6 py-4 text-sm font-semibold text-gray-600">Estado</th>
                          <th className="px-6 py-4 text-sm font-semibold text-gray-600 text-right">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {orgProducts.map((prod) => (
                          <tr key={prod.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                {prod.product_images?.[0]?.url ? (
                                  <img src={prod.product_images[0].url} alt={prod.name} className="h-10 w-10   object-cover bg-gray-100 border border-gray-200" />
                                ) : (
                                  <div className="h-10 w-10   bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
                                    <Package className="h-5 w-5 text-gray-400" />
                                  </div>
                                )}
                                <span className="font-medium text-gray-900">{prod.name}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-500">
                              {prod.sku || '-'}
                            </td>
                            <td className="px-6 py-4 text-sm font-medium text-gray-900">
                              ${Number(prod.base_price).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center px-2.5 py-1 text-xs font-medium ${
                                prod.status === 'available' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                              }`}>
                                {prod.status === 'available' ? 'Disponible' : prod.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditingProductId(prod.id)}
                                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 text-xs font-semibold"
                              >
                                Editar
                              </Button>
                            </td>
                          </tr>
                        ))}
                        {orgProducts.length === 0 && (
                          <tr>
                            <td colSpan="5" className="text-center py-12 text-gray-500">
                              No hay productos registrados en este negocio.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <AIImportModal 
        isOpen={isAIImportOpen} 
        onClose={() => setIsAIImportOpen(false)} 
        onSuccess={() => {
          if (selectedOrganization) fetchProducts();
        }}
        organizationId={selectedOrganization?.id}
      />

      <EditProductModal
        isOpen={!!editingProductId}
        onClose={() => setEditingProductId(null)}
        onSuccess={() => {
          if (selectedOrganization) fetchProducts();
        }}
        productId={editingProductId}
        organizationId={selectedOrganization?.id}
      />

      {/* Order Detail Modal */}
      <OrderDetailModal
        isOpen={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        order={selectedOrder}
        organization={selectedOrganization}
        canCancel={false}
      />
    </div>
  );
};

export default SuperAdminView;
