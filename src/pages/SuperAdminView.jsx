import React, { useEffect, useState } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { User, Calendar, Shield, Loader2, Building2, MessageSquare, DollarSign, ExternalLink, ArrowLeft, ChevronRight, PackageOpen, Package, X, Eye, MapPin, CreditCard, ShoppingBag, MessageCircle, RefreshCw, ToggleLeft, ToggleRight, Sparkles, Globe } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import AIImportModal from '../components/catalog/AIImportModal';
import EditProductModal from '../components/catalog/EditProductModal';

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
          delivery_fee,
          created_at,
          uber_delivery_id,
          uber_tracking_url,
          uber_status,
          payments ( method, status ),
          order_items (
            id,
            product_name,
            quantity,
            unit_price,
            total_price,
            parent_item_id
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
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([
        fetchUsers(),
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
      role: staff.role === 'owner' ? 'Client Admin' : staff.role,
      createdAt: staff.created_at,
      uberDirectEnabled: staff.uber_direct_enabled || false,
      whatsappEnabled: staff.whatsapp_enabled || false,
    }));
    setUsers(formattedUsers);
  };

  const fetchOrganizations = async () => {
    const { data, error: fetchError } = await supabase
      .from('organizations')
      .select('id, name, slug, created_at, whatsapp_phone_number_id, whatsapp_inbox_url, whatsapp_inbox_enabled, uber_enabled, delivery_mode, uber_client_id, uber_customer_id, orders(total)')
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
                      href={`/order/${selectedOrganization.slug || encodeURIComponent(selectedOrganization.name)}`}
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
                                <td className="px-6 py-4 text-sm font-bold text-gray-900">
                                  ${Number(order.total || 0).toLocaleString('es-CL')}
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
                <div className="overflow-x-auto -mx-6 -my-6">
                  <table className="w-full text-left border-collapse whitespace-nowrap">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="px-6 py-4 text-sm font-semibold text-gray-600">Usuario</th>
                        <th className="px-6 py-4 text-sm font-semibold text-gray-600">Rol</th>
                        <th className="px-6 py-4 text-sm font-semibold text-gray-600">Registro</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {orgUsers.map((user) => (
                        <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <User className="h-6 w-6 text-gray-900 mx-2" />
                              <div className="font-medium text-gray-900">{user.name}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium ${
                              user.role === 'Client Admin' 
                                ? 'bg-purple-100 text-purple-700' 
                                : 'bg-blue-100 text-blue-700'
                            }`}>
                              {user.role === 'Client Admin' && <Shield className="h-3 w-3" />}
                              {user.role}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500 flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-gray-400" />
                            {new Date(user.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                      {orgUsers.length === 0 && (
                        <tr>
                          <td colSpan="3" className="text-center py-12 text-gray-500">
                            No hay usuarios en esta organización.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
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
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl overflow-hidden border flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50">
              <div>
                <h3 className="font-bold text-lg text-gray-900">Pedido #{selectedOrder.order_number}</h3>
                <p className="text-xs text-gray-500 mt-0.5">Creado el {new Date(selectedOrder.created_at).toLocaleString()}</p>
              </div>
              <button 
                onClick={() => setSelectedOrder(null)}
                className="text-gray-400 hover:text-gray-700 p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Status and Method Info */}
              <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg border text-sm">
                <div>
                  <span className="text-gray-500 block text-xs uppercase font-bold tracking-wider">Estado de preparación</span>
                  <span className={`inline-block mt-1 px-2.5 py-0.5 rounded text-xs font-bold ${
                    selectedOrder.status === 'scheduled' ? 'bg-indigo-100 text-indigo-800' :
                    selectedOrder.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                    selectedOrder.status === 'confirmed' ? 'bg-blue-100 text-blue-800' :
                    selectedOrder.status === 'preparing' ? 'bg-purple-100 text-purple-800' :
                    selectedOrder.status === 'ready' ? 'bg-indigo-100 text-indigo-800' :
                    selectedOrder.status === 'completed' ? 'bg-green-100 text-green-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {selectedOrder.status}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block text-xs uppercase font-bold tracking-wider">Canal / Entrega</span>
                  <div className="mt-1 font-semibold text-gray-900 flex items-center gap-1.5">
                    <span className="capitalize">{selectedOrder.order_type}</span>
                    <span>•</span>
                    <span className="text-xs bg-gray-200 px-2 py-0.5 rounded text-gray-700">
                      {selectedOrder.delivery_type === 'delivery' ? 'Despacho' : 'Retiro'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Customer Details */}
              <div className="space-y-2">
                <h4 className="font-bold text-gray-900 border-b pb-1 text-sm uppercase tracking-wider text-gray-500">Datos del Cliente</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500 block">Nombre:</span>
                    <span className="font-semibold text-gray-800">{selectedOrder.customer_name || 'Cliente'}</span>
                  </div>
                  {selectedOrder.customer_phone && (
                    <div>
                      <span className="text-gray-500 block">Teléfono:</span>
                      <span className="font-semibold text-gray-800">{selectedOrder.customer_phone}</span>
                    </div>
                  )}
                </div>

                {selectedOrder.delivery_type === 'delivery' && selectedOrder.delivery_address && (
                  <div className="mt-3 bg-orange-50/50 border border-orange-100 p-3 rounded-lg flex gap-2.5">
                    <MapPin className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <span className="text-gray-500 block text-xs font-semibold uppercase tracking-wider">Dirección de Despacho</span>
                      <span className="text-sm font-medium text-gray-800">{selectedOrder.delivery_address}</span>
                      {selectedOrder.uber_tracking_url && (
                        <a
                          href={selectedOrder.uber_tracking_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-green-600 bg-green-50 hover:bg-green-100 px-2.5 py-1 rounded-lg border border-green-200 transition-colors"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Seguir delivery en vivo
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Order Items */}
              <div className="space-y-2">
                <h4 className="font-bold text-gray-900 border-b pb-1 text-sm uppercase tracking-wider text-gray-500">Productos del Pedido</h4>
                <div className="divide-y border rounded-lg overflow-hidden">
                  {selectedOrder.order_items?.map((item) => {
                    if (item.parent_item_id) return null; // Render child combo items nested
                    const childItems = selectedOrder.order_items.filter(child => child.parent_item_id === item.id);
                    return (
                      <div key={item.id} className="p-3 bg-white hover:bg-gray-50/50 transition-colors">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-semibold text-gray-900 text-sm">
                              {item.quantity}x {item.product_name}
                            </div>
                            {childItems.length > 0 && (
                              <div className="ml-4 mt-1 space-y-0.5 text-xs text-gray-500 border-l pl-2.5">
                                {childItems.map(child => (
                                  <div key={child.id}>
                                    {child.quantity}x {child.product_name}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <span className="font-semibold text-sm text-gray-800">
                            ${Number(item.total_price || 0).toLocaleString('es-CL')}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Financial Breakdown */}
              <div className="bg-gray-50 p-4 rounded-lg border text-sm space-y-2.5">
                {selectedOrder.delivery_type === 'delivery' && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Subtotal</span>
                      <span className="font-medium text-gray-800">${Number(selectedOrder.subtotal || selectedOrder.total - (selectedOrder.delivery_fee || 0)).toLocaleString('es-CL')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Costo de envío</span>
                      <span className="font-medium text-gray-800">${Number(selectedOrder.delivery_fee || 0).toLocaleString('es-CL')}</span>
                    </div>
                    <div className="border-t my-1"></div>
                  </>
                )}
                <div className="flex justify-between text-base font-bold text-gray-900">
                  <span>Total</span>
                  <span>${Number(selectedOrder.total || 0).toLocaleString('es-CL')}</span>
                </div>
              </div>

              {/* Payment Details */}
              {selectedOrder.payments?.length > 0 && (
                <div className="bg-gray-50 p-4 rounded-lg border text-sm flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-gray-400" />
                    <span className="text-gray-600">Método de pago:</span>
                    <span className="font-semibold text-gray-800 capitalize">{selectedOrder.payments[0].method}</span>
                  </div>
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded ${
                    selectedOrder.payments[0].status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {selectedOrder.payments[0].status === 'completed' ? 'Pagado' : 'Pendiente'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminView;
