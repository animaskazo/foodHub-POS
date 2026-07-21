import React, { useEffect, useState } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Search, User, Mail, Calendar, Shield, Loader2, Building2, MessageSquare, DollarSign, ExternalLink, ArrowLeft, ChevronRight, PackageOpen, Package } from 'lucide-react';
import { supabase } from '../lib/supabase';

const SuperAdminView = () => {
  const [selectedOrganization, setSelectedOrganization] = useState(null);
  const [detailTab, setDetailTab] = useState('overview');
  
  const [users, setUsers] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [feedbacks, setFeedbacks] = useState([]);
  const [products, setProducts] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
      createdAt: staff.created_at
    }));
    setUsers(formattedUsers);
  };

  const fetchOrganizations = async () => {
    const { data, error: fetchError } = await supabase
      .from('organizations')
      .select('id, name, slug, created_at, orders(total)')
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
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-8 py-6 shrink-0 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Super Admin Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Gestión individualizada de negocios</p>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-8">
        
        {error && (
          <div className="p-4 mb-6 bg-red-50 text-red-700 text-sm rounded-lg border">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center py-32 bg-white rounded-xl shadow-sm border">
            <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
          </div>
        ) : !selectedOrganization ? (
          
          /* =========================================================
             MASTER VIEW: List of all Organizations
             ========================================================= */
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden min-h-[400px]">
            <div className="px-6 py-4 border-b bg-gray-50">
              <h2 className="font-semibold text-gray-800">Negocios Registrados</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
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
                      }}
                      className="hover:bg-gray-50 transition-colors cursor-pointer group"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-gray-100 border flex items-center justify-center shrink-0">
                            <Building2 className="h-5 w-5 text-gray-500" />
                          </div>
                          <span className="font-semibold text-gray-900">{org.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {org.orderCount}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 font-semibold text-green-700 bg-green-50 px-2.5 py-1 rounded-md text-sm border border-green-100">
                          <DollarSign className="h-3 w-3" />
                          {org.totalSales.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(org.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button className="text-blue-600 font-medium text-sm flex items-center justify-end w-full opacity-0 group-hover:opacity-100 transition-opacity">
                          Ver Detalles <ChevronRight className="h-4 w-4 ml-1" />
                        </button>
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
              <button 
                onClick={() => setSelectedOrganization(null)}
                className="flex items-center text-sm font-medium text-gray-500 hover:text-black transition-colors mb-4"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Volver a Negocios
              </button>
              
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
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-md transition-colors w-fit"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Ver eCommerce
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Detail Tabs */}
            <div className="flex space-x-1 border-b">
              <button
                onClick={() => setDetailTab('overview')}
                className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                  detailTab === 'overview' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
                }`}
              >
                Resumen
              </button>
              <button
                onClick={() => setDetailTab('users')}
                className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${
                  detailTab === 'users' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
                }`}
              >
                Usuarios
                <span className="bg-gray-100 text-gray-600 py-0.5 px-2 rounded-full text-xs">{orgUsers.length}</span>
              </button>
              <button
                onClick={() => setDetailTab('products')}
                className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${
                  detailTab === 'products' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
                }`}
              >
                Catálogo
                <span className="bg-gray-100 text-gray-600 py-0.5 px-2 rounded-full text-xs">{orgProducts.length}</span>
              </button>
              <button
                onClick={() => setDetailTab('reports')}
                className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${
                  detailTab === 'reports' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
                }`}
              >
                Reportes
                {orgFeedbacks.length > 0 && (
                  <span className="bg-red-100 text-red-600 py-0.5 px-2 rounded-full text-xs">{orgFeedbacks.length}</span>
                )}
              </button>
            </div>

            {/* Detail Tab Contents */}
            <div className="bg-white rounded-xl shadow-sm border p-6 min-h-[300px]">
              
              {/* Overview */}
              {detailTab === 'overview' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-6 rounded-xl border bg-gray-50 flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center shrink-0">
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
                    <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
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
                  <table className="w-full text-left border-collapse">
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
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
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
                        <div key={fb.id} className="border rounded-xl overflow-hidden hover:shadow-md transition-shadow bg-gray-50 flex flex-col">
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

              {/* Products */}
              {detailTab === 'products' && (
                <div className="overflow-x-auto -mx-6 -my-6">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="px-6 py-4 text-sm font-semibold text-gray-600">Producto</th>
                        <th className="px-6 py-4 text-sm font-semibold text-gray-600">SKU</th>
                        <th className="px-6 py-4 text-sm font-semibold text-gray-600">Precio Base</th>
                        <th className="px-6 py-4 text-sm font-semibold text-gray-600">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {orgProducts.map((prod) => (
                        <tr key={prod.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              {prod.product_images?.[0]?.url ? (
                                <img src={prod.product_images[0].url} alt={prod.name} className="h-10 w-10 rounded-lg object-cover bg-gray-100 border border-gray-200" />
                              ) : (
                                <div className="h-10 w-10 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
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
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                              prod.status === 'available' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                            }`}>
                              {prod.status === 'available' ? 'Disponible' : prod.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {orgProducts.length === 0 && (
                        <tr>
                          <td colSpan="4" className="text-center py-12 text-gray-500">
                            No hay productos registrados en este negocio.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SuperAdminView;
