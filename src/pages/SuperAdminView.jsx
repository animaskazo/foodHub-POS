import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { User, Calendar, Clock, Shield, Loader2, Building2, MessageSquare, DollarSign, ExternalLink, ArrowLeft, ChevronRight, PackageOpen, Package, X, Eye, MapPin, CreditCard, ShoppingBag, MessageCircle, RefreshCw, ToggleLeft, ToggleRight, Sparkles, Globe, Store, Plus, Pencil, Tags, Copy, Trash2, Mail, KeyRound } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getStoreUrl } from '../utils/tenant';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import AIImportModal from '../components/catalog/AIImportModal';
import EditProductModal from '../components/catalog/EditProductModal';
import OrderDetailModal from '../components/pos/OrderDetailModal';
import Modal from '../components/ui/Modal';
import KlapReconciliationTab from '../components/superadmin/KlapReconciliationTab';
import OrgBrandingTab from '../components/superadmin/OrgBrandingTab';
import OrgHoursTab from '../components/superadmin/OrgHoursTab';
import ProductImageFallback from '../components/ui/ProductImageFallback';
import { getPaymentMethod } from '../utils/orderUtils';
import { getCategories, quickUpdateCategoryStatus, deleteCategory, duplicateCategory } from '../services/catalogService';

const SuperAdminView = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedOrganization, setSelectedOrganization] = useState(null);
  const [detailTab, setDetailTab] = useState('overview');
  
  const [users, setUsers] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [feedbacks, setFeedbacks] = useState([]);
  const [products, setProducts] = useState([]);
  const [orgCategories, setOrgCategories] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  
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
    if (error) {
      try {
        const ctx = error.context;
        if (ctx && typeof ctx.json === 'function') {
          const clone = ctx.clone ? ctx.clone() : ctx;
          const bodyErr = await clone.json().catch(() => null);
          if (bodyErr?.error) throw new Error(bodyErr.error);
        }
      } catch (parseErr) {
        if (parseErr instanceof Error && parseErr.message && !parseErr.message.includes('Failed to send')) throw parseErr;
      }
      throw error;
    }
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

  // Abre la interfaz completa de edición (igual que la tienda) para un producto
  const openFullProductEditor = (productId) => {
    if (!selectedOrganization?.id) return;
    const params = new URLSearchParams({
      org: selectedOrganization.id,
      from: 'superadmin',
      orgName: selectedOrganization.name || '',
    });
    navigate(`/products/${productId}?${params.toString()}`);
  };

  const openNewProductEditor = () => {
    if (!selectedOrganization?.id) return;
    const params = new URLSearchParams({
      org: selectedOrganization.id,
      from: 'superadmin',
      orgName: selectedOrganization.name || '',
    });
    navigate(`/products/new?${params.toString()}`);
  };

  // Abre la interfaz completa de edición para una categoría del negocio
  const openFullCategoryEditor = (categoryId) => {
    if (!selectedOrganization?.id) return;
    const params = new URLSearchParams({
      org: selectedOrganization.id,
      from: 'superadmin',
      orgName: selectedOrganization.name || '',
    });
    navigate(`/categories/${categoryId}?${params.toString()}`);
  };

  const openNewCategoryEditor = () => {
    if (!selectedOrganization?.id) return;
    const params = new URLSearchParams({
      org: selectedOrganization.id,
      from: 'superadmin',
      orgName: selectedOrganization.name || '',
    });
    navigate(`/categories/new?${params.toString()}`);
  };

  const selectOrganization = (org, tab = 'overview') => {
    setSelectedOrganization(org);
    setDetailTab(tab);
    setSearchParams(org ? { org: org.id } : {});
    if (org) {
      fetchOrgOrders(org.id);
      fetchOrgCategories(org.id);
    }
  };

  const clearSelectedOrganization = () => {
    setSelectedOrganization(null);
    setSearchParams({});
  };

  // Reenvío manual del email de bienvenida al dueño del negocio.
  // La edge function resuelve el email con el organization_id.
  // Se pide confirmación antes de enviar.
  const [welcomeTarget, setWelcomeTarget] = useState(null);
  const [sendingWelcomeId, setSendingWelcomeId] = useState(null);
  const handleSendWelcome = async (org) => {
    if (!org?.id || sendingWelcomeId) return;
    setWelcomeTarget(null);
    const toastId = toast.loading(`Enviando bienvenida a ${org.name}...`);
    setSendingWelcomeId(org.id);
    try {
      const { error } = await supabase.functions.invoke('send-email', {
        body: {
          type: 'welcome',
          organization_id: org.id,
          data: { organization_id: org.id, app_url: window.location.origin },
        },
      });
      if (error) throw error;
      toast.success('Email de bienvenida enviado', { id: toastId });
    } catch (e) {
      console.error('Error enviando bienvenida:', e);
      toast.error('No se pudo enviar el email', { id: toastId });
    } finally {
      setSendingWelcomeId(null);
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
          discount_amount,
          delivery_fee,
          delivery_notes,
          notes,
          created_at,
          scheduled_at,
          uber_delivery_id,
          uber_tracking_url,
          uber_status,
          is_klap_reconciled,
          payments ( id, method, status, reference_code, payment_details ),
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

  const fetchOrgCategories = async (orgId) => {
    setLoadingCategories(true);
    try {
      const data = await getCategories(orgId);
      setOrgCategories(data || []);
    } catch (err) {
      console.error('Error fetching org categories:', err);
      setOrgCategories([]);
    } finally {
      setLoadingCategories(false);
    }
  };

  useEffect(() => {
    const handleReload = () => {
      if (selectedOrganization?.id) {
        fetchOrgOrders(selectedOrganization.id);
        fetchOrgCategories(selectedOrganization.id);
      }
    };
    window.addEventListener('reload-orders', handleReload);
    return () => window.removeEventListener('reload-orders', handleReload);
  }, [selectedOrganization]);

  useEffect(() => {
    fetchData();
  }, []);

  // Restaura el negocio seleccionado al volver del editor completo
  // (/products/:id?org=<id>&from=superadmin → /superadmin?org=<id>)
  // (/categories/:id?org=<id>&from=superadmin → /superadmin?org=<id>)
  useEffect(() => {
    const orgIdFromUrl = searchParams.get('org');
    if (orgIdFromUrl && organizations.length > 0 && !selectedOrganization) {
      const match = organizations.find((o) => o.id === orgIdFromUrl);
      if (match) {
        setSelectedOrganization(match);
        setDetailTab('products');
        fetchOrgOrders(match.id);
        fetchOrgCategories(match.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizations]);

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
      .select('id, name, slug, logo_url, cover_url, cover_is_video, description, force_closed, closed_message, created_at, whatsapp_phone_number_id, whatsapp_inbox_url, whatsapp_inbox_enabled, uber_enabled, delivery_mode, delivery_modes, uber_client_id, uber_customer_id, dine_in_enabled, orders(total)')
      .order('created_at', { ascending: false });

    if (fetchError) throw fetchError;

    // Visitas de los últimos 30 días por tienda (una sola consulta)
    const since = new Date();
    since.setDate(since.getDate() - 29);
    const sinceStr = since.toISOString().split('T')[0];
    let visitsByOrg = {};
    try {
      const { data: visitsData, error: visitsError } = await supabase
        .from('store_visits')
        .select('organization_id, visit_count')
        .gte('date', sinceStr);
      if (visitsError) throw visitsError;
      visitsByOrg = (visitsData || []).reduce((acc, v) => {
        acc[v.organization_id] = (acc[v.organization_id] || 0) + (v.visit_count || 0);
        return acc;
      }, {});
    } catch (visitsErr) {
      console.warn('Visits table error:', visitsErr);
    }

    const formattedOrgs = data.map(org => {
      const ordersArray = org.orders || [];
      const totalSales = ordersArray.reduce((sum, order) => sum + Number(order.total || 0), 0);
      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        logoUrl: org.logo_url || null,
        coverUrl: org.cover_url || null,
        coverIsVideo: org.cover_is_video === true,
        description: org.description || '',
        forceClosed: org.force_closed === true,
        closedMessage: org.closed_message || '',
        createdAt: org.created_at,
        whatsappPhoneNumberId: org.whatsapp_phone_number_id,
        whatsappInboxUrl: org.whatsapp_inbox_url,
        whatsappInboxEnabled: org.whatsapp_inbox_enabled,
        uberEnabled: org.uber_enabled || false,
        dineInEnabled: org.dine_in_enabled === true, // default to false
        deliveryMode: org.delivery_mode || 'own',
        deliveryModes: org.delivery_modes || null,
        uberClientId: org.uber_client_id || '',
        uberCustomerId: org.uber_customer_id || '',
        orderCount: ordersArray.length,
        totalSales: totalSales,
        visits30d: visitsByOrg[org.id] || 0,
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
      <header className="bg-white border-b px-4 md:px-8 py-4 md:py-6 shrink-0 flex items-center justify-between sticky top-0 z-10">
        <div className="min-w-0">
          <h1 className="text-lg md:text-2xl font-bold text-gray-900 truncate">Super Admin Dashboard</h1>
          <p className="text-xs md:text-sm text-gray-500 mt-0.5 md:mt-1">Gestión individualizada de negocios</p>
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
          <div className="bg-white rounded-xl border overflow-hidden min-h-[400px] [&_button]:rounded-full">
            <div className="px-4 md:px-6 py-4 border-b flex items-baseline gap-2">
              <h2 className="text-[15px] font-semibold text-gray-900">Negocios registrados</h2>
              <span className="text-xs text-gray-400 tabular-nums">{organizations.length}</span>
            </div>
            {/* Mobile: cards */}
            <div className="divide-y md:hidden">
              {organizations.map((org) => (
                <div
                  key={org.id}
                  className="w-full flex items-center gap-1 pl-4 pr-2 py-3 active:bg-gray-50 transition-colors"
                >
                  <button
                    onClick={() => selectOrganization(org, 'overview')}
                    className="flex-1 flex items-center gap-3 min-w-0 text-left py-1"
                  >
                    {org.logoUrl ? (
                      <img src={org.logoUrl} alt={org.name} className="h-10 w-10 rounded-full object-cover bg-gray-100 shrink-0" />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                        <span className="text-sm font-semibold text-gray-500">{org.name.charAt(0).toUpperCase()}</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-gray-900 truncate">
                        {org.name}
                        {org.forceClosed && (
                          <span className="font-normal text-red-600"> · Cerrada</span>
                        )}
                      </span>
                      <p className="text-xs text-gray-400 mt-0.5 tabular-nums truncate">
                        {org.orderCount} {org.orderCount === 1 ? 'orden' : 'órdenes'} · ${org.totalSales.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · {(org.visits30d || 0).toLocaleString('es-CL')} visitas
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    title="Enviar email de bienvenida"
                    aria-label={`Enviar email de bienvenida a ${org.name}`}
                    disabled={sendingWelcomeId === org.id}
                    onClick={() => setWelcomeTarget(org)}
                    className="p-2.5 text-gray-400 transition-colors hover:text-gray-900 disabled:opacity-50 shrink-0"
                  >
                    {sendingWelcomeId === org.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Mail className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    aria-label={`Ver ${org.name}`}
                    onClick={() => selectOrganization(org, 'overview')}
                    className="p-2.5 text-gray-300 shrink-0"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              ))}
              {organizations.length === 0 && (
                <p className="text-center py-12 text-gray-500 text-sm">
                  No hay negocios registrados.
                </p>
              )}
            </div>
            {/* Desktop: table */}
            <div className="overflow-x-auto hidden md:block">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="border-b">
                    <th className="px-6 py-3 text-[13px] font-medium text-gray-500">Negocio</th>
                    <th className="px-6 py-3 text-[13px] font-medium text-gray-500 tabular-nums">Órdenes</th>
                    <th className="px-6 py-3 text-[13px] font-medium text-gray-500">Ventas totales</th>
                    <th className="px-6 py-3 text-[13px] font-medium text-gray-500">Visitas 30d</th>
                    <th className="px-6 py-3 text-[13px] font-medium text-gray-500">Registro</th>
                    <th className="px-6 py-3 text-[13px] font-medium text-gray-500 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {organizations.map((org) => (
                    <tr 
                      key={org.id} 
                      onClick={() => selectOrganization(org, 'overview')}
                      className="hover:bg-gray-50 transition-colors cursor-pointer group"
                    >
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          {org.logoUrl ? (
                            <img src={org.logoUrl} alt={org.name} className="h-9 w-9 rounded-full object-cover bg-gray-100 shrink-0" />
                          ) : (
                            <div className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                              <span className="text-sm font-semibold text-gray-500">{org.name.charAt(0).toUpperCase()}</span>
                            </div>
                          )}
                          <span className="text-sm font-semibold text-gray-900">
                            {org.name}
                            {org.forceClosed && (
                              <span className="font-normal text-red-600"> · Cerrada</span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-3.5 text-sm tabular-nums text-gray-900">
                        {org.orderCount}
                      </td>
                      <td className="px-6 py-3.5 text-sm tabular-nums text-gray-900">
                        ${org.totalSales.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-3.5 text-sm tabular-nums text-gray-500">
                        {org.visits30d.toLocaleString('es-CL')}
                      </td>
                      <td className="px-6 py-3.5 text-sm tabular-nums text-gray-400">
                        {new Date(org.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <div className="flex items-center justify-end">
                          <button
                            type="button"
                            title="Enviar email de bienvenida"
                            aria-label={`Enviar email de bienvenida a ${org.name}`}
                            disabled={sendingWelcomeId === org.id}
                            onClick={(e) => { e.stopPropagation(); setWelcomeTarget(org); }}
                            className="p-2 text-gray-400 transition-colors hover:text-gray-900 disabled:opacity-50"
                          >
                            {sendingWelcomeId === org.id
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <Mail className="h-4 w-4" />}
                          </button>
                          <span className="p-2 text-gray-300">
                            <ChevronRight className="h-4 w-4" />
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {organizations.length === 0 && (
                    <tr>
                      <td colSpan="6" className="text-center py-12 text-gray-500">
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
                onClick={clearSelectedOrganization}
                className="flex items-center text-[13px] font-medium text-gray-400 hover:text-gray-900 hover:bg-transparent px-0 h-auto transition-colors mb-3"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Negocios
              </Button>

              <div className="flex items-center gap-3">
                {selectedOrganization.logoUrl ? (
                  <img src={selectedOrganization.logoUrl} alt={selectedOrganization.name} className="h-12 w-12 rounded-full object-cover bg-gray-100 shrink-0" />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                    <span className="text-lg font-semibold text-gray-500">{selectedOrganization.name.charAt(0).toUpperCase()}</span>
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className="text-lg md:text-2xl font-semibold text-gray-900 truncate">
                    {selectedOrganization.name}
                    {selectedOrganization.forceClosed && (
                      <span className="font-normal text-red-600"> · Cerrada</span>
                    )}
                  </h2>
                  <p className="text-[13px] text-gray-400 mt-0.5 tabular-nums truncate">
                    Cliente desde {new Date(selectedOrganization.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 mt-4">
                <a
                  href={getStoreUrl(selectedOrganization.slug) || `/order/${encodeURIComponent(selectedOrganization.name)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full bg-gray-900 hover:bg-gray-700 px-4 py-2 text-sm font-medium text-white transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                  Ver tienda
                </a>
                <button
                  type="button"
                  disabled={sendingWelcomeId === selectedOrganization.id}
                  onClick={() => setWelcomeTarget(selectedOrganization)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 hover:border-gray-900 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors disabled:opacity-50"
                >
                  {sendingWelcomeId === selectedOrganization.id
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Mail className="h-4 w-4" />}
                  Enviar bienvenida
                </button>
              </div>
            </div>

            {/* Detail Tabs: selector compacto en mobile */}
            <div className="md:hidden -mx-4 px-4">
              <select
                value={detailTab}
                onChange={(e) => setDetailTab(e.target.value)}
                aria-label="Sección del negocio"
                className="w-full appearance-none bg-white border border-gray-200 text-gray-900 rounded-xl pl-4 pr-10 py-3 text-sm font-semibold outline-none focus:border-gray-900 cursor-pointer"
                style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.2em 1.2em' }}
              >
                <option value="overview">Resumen</option>
                <option value="branding">Perfil</option>
                <option value="hours">Horarios</option>
                <option value="orders">Pedidos ({orgOrders.length})</option>
                <option value="users">Usuarios ({orgUsers.length})</option>
                <option value="products">Catálogo ({orgProducts.length})</option>
                <option value="categories">Categorías ({orgCategories.length})</option>
                <option value="klap">Conciliación Klap</option>
                <option value="reports">Reportes{orgFeedbacks.length > 0 ? ` (${orgFeedbacks.length})` : ''}</option>
                <option value="integrations">Integraciones</option>
              </select>
            </div>
            {/* Detail Tabs: pills en desktop */}
            <div className="hidden md:flex gap-1.5 overflow-x-auto hide-scrollbar py-2">
              <Button
                variant="ghost"
                onClick={() => setDetailTab('overview')}
                className={`shrink-0 h-auto rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors ${
                  detailTab === 'overview' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                Resumen
              </Button>
              <Button
                variant="ghost"
                onClick={() => setDetailTab('branding')}
                className={`shrink-0 h-auto rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors flex items-center gap-2 ${
                  detailTab === 'branding' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <Store className="h-4 w-4" />
                Perfil
              </Button>
              <Button
                variant="ghost"
                onClick={() => setDetailTab('hours')}
                className={`shrink-0 h-auto rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors flex items-center gap-2 ${
                  detailTab === 'hours' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <Clock className="h-4 w-4" />
                Horarios
              </Button>
              <Button
                variant="ghost"
                onClick={() => setDetailTab('orders')}
                className={`shrink-0 h-auto rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors flex items-center gap-2 ${
                  detailTab === 'orders' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                Pedidos
                <span className="tabular-nums text-xs opacity-70 leading-none flex items-center">{orgOrders.length}</span>
              </Button>
              <Button
                variant="ghost"
                onClick={() => setDetailTab('users')}
                className={`shrink-0 h-auto rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors flex items-center gap-2 ${
                  detailTab === 'users' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                Usuarios
                <span className="tabular-nums text-xs opacity-70 leading-none flex items-center">{orgUsers.length}</span>
              </Button>
              <Button
                variant="ghost"
                onClick={() => setDetailTab('products')}
                className={`shrink-0 h-auto rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors flex items-center gap-2 ${
                  detailTab === 'products' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                Catálogo
                <span className="tabular-nums text-xs opacity-70 leading-none flex items-center">{orgProducts.length}</span>
              </Button>
              <Button
                variant="ghost"
                onClick={() => setDetailTab('categories')}
                className={`shrink-0 h-auto rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors flex items-center gap-2 ${
                  detailTab === 'categories' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <Tags className="h-4 w-4" />
                Categorías
                <span className="tabular-nums text-xs opacity-70 leading-none flex items-center">{orgCategories.length}</span>
              </Button>
              <Button
                variant="ghost"
                onClick={() => setDetailTab('klap')}
                className={`shrink-0 h-auto rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors flex items-center gap-2 ${
                  detailTab === 'klap' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <DollarSign className="h-4 w-4" />
                Conciliación Klap
              </Button>
              <Button
                variant="ghost"
                onClick={() => setDetailTab('reports')}
                className={`shrink-0 h-auto rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors flex items-center gap-2 ${
                  detailTab === 'reports' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                Reportes
                {orgFeedbacks.length > 0 && (
                  <span className="tabular-nums text-xs opacity-80 leading-none flex items-center text-red-500">{orgFeedbacks.length}</span>
                )}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setDetailTab('integrations')}
                className={`shrink-0 h-auto rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors flex items-center gap-2 ${
                  detailTab === 'integrations' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                Integraciones
              </Button>
            </div>

            {/* Detail Tab Contents */}
            <div className="bg-white rounded-xl border p-4 md:p-6 min-h-[300px] [&_button]:rounded-full">
              


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
                    <>
                    {/* Mobile: cards */}
                    <div className="divide-y md:hidden -m-4 md:m-0">
                      {orgOrders.map((order) => {
                        const orderDate = new Date(order.created_at).toLocaleString('es-CL', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        });
                        return (
                          <button
                            key={order.id}
                            onClick={() => setSelectedOrder(order)}
                            className="w-full px-4 py-4 flex items-center gap-3 text-left active:bg-gray-50 transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-sm text-gray-900">#{order.order_number}</span>
                                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                  order.status === 'cancelled' ? 'bg-red-500' :
                                  order.status === 'completed' || order.status === 'ready' ? 'bg-green-500' :
                                  'bg-amber-400'
                                }`} />
                                <span className="text-xs text-gray-500">
                                  {order.status === 'scheduled' ? 'Programado' :
                                   order.status === 'pending' ? 'Pendiente' :
                                   order.status === 'confirmed' ? 'Confirmado' :
                                   order.status === 'preparing' ? 'Preparando' :
                                   order.status === 'ready' ? 'Listo' :
                                   order.status === 'completed' ? 'Completado' :
                                   'Cancelado'}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 mt-1 truncate">
                                {order.customer_name || 'Cliente'} · <span className="capitalize">{order.order_type}</span>{order.delivery_type === 'delivery' ? ' · Despacho' : ' · Retiro'} · {orderDate}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-bold text-gray-900">${Number(order.total || 0).toLocaleString('es-CL')}</p>
                              <p className="text-[10px] text-gray-500 mt-0.5">{getPaymentMethod(order)}</p>
                            </div>
                            <ChevronRight className="h-5 w-5 text-gray-300 shrink-0" />
                          </button>
                        );
                      })}
                    </div>
                    {/* Desktop: table */}
                    <div className="overflow-x-auto -mx-6 -my-6 hidden md:block">
                      <table className="w-full text-left border-collapse whitespace-nowrap">
                        <thead>
                          <tr className="border-b">
                            <th className="px-6 py-3 text-[13px] font-medium text-gray-500">Número</th>
                            <th className="px-6 py-3 text-[13px] font-medium text-gray-500">Cliente</th>
                            <th className="px-6 py-3 text-[13px] font-medium text-gray-500">Origen / Entrega</th>
                            <th className="px-6 py-3 text-[13px] font-medium text-gray-500">Fecha</th>
                            <th className="px-6 py-3 text-[13px] font-medium text-gray-500">Total</th>
                            <th className="px-6 py-3 text-[13px] font-medium text-gray-500">Estado</th>
                            <th className="px-6 py-3 text-[13px] font-medium text-gray-500 text-right">Acción</th>
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
                                <td className="px-6 py-3.5 text-sm font-semibold text-gray-900">
                                  #{order.order_number}
                                </td>
                                <td className="px-6 py-3.5 text-sm text-gray-600">
                                  {order.customer_name || 'Cliente'}
                                </td>
                                <td className="px-6 py-3.5 text-sm text-gray-500">
                                  <span className="capitalize">{order.order_type}</span>
                                  <span className="text-gray-300"> · </span>{isDeliveryOrder ? 'Despacho' : 'Retiro'}
                                </td>
                                <td className="px-6 py-3.5 text-sm tabular-nums text-gray-400">
                                  {orderDate}
                                </td>
                                <td className="px-6 py-3.5">
                                  <div className="text-sm font-semibold tabular-nums text-gray-900">
                                    ${Number(order.total || 0).toLocaleString('es-CL')}
                                  </div>
                                  <div
                                    className="text-xs text-gray-400 mt-0.5 w-fit"
                                    title={order.payments?.find(p => p.reference_code)?.reference_code ? `Klap ID: ${order.payments.find(p => p.reference_code).reference_code}` : undefined}
                                  >
                                    {getPaymentMethod(order)}
                                  </div>
                                </td>
                                <td className="px-6 py-3.5">
                                  <span className="inline-flex items-center gap-1.5 text-[13px] text-gray-600">
                                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                      order.status === 'cancelled' ? 'bg-red-500' :
                                      order.status === 'completed' || order.status === 'ready' ? 'bg-green-500' :
                                      'bg-amber-400'
                                    }`} />
                                    {order.status === 'scheduled' ? 'Programado' :
                                     order.status === 'pending' ? 'Pendiente' :
                                     order.status === 'confirmed' ? 'Confirmado' :
                                     order.status === 'preparing' ? 'Preparando' :
                                     order.status === 'ready' ? 'Listo' :
                                     order.status === 'completed' ? 'Completado' :
                                     'Cancelado'}
                                  </span>
                                </td>
                                <td className="px-6 py-3.5 text-right">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedOrder(order)}
                                    aria-label={`Ver pedido ${order.order_number}`}
                                    className="p-2 text-gray-400 transition-colors hover:text-gray-900"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    </>
                  )}
                </div>
              )}

              {/* Overview */}
              {detailTab === 'overview' && (
                <div className="grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-4">
                  <div>
                    <p className="text-xl md:text-2xl font-semibold tabular-nums text-gray-900 truncate">
                      ${selectedOrganization.totalSales.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-[13px] text-gray-400 mt-1">Ventas totales</p>
                  </div>

                  <div>
                    <p className="text-xl md:text-2xl font-semibold tabular-nums text-gray-900">{selectedOrganization.orderCount}</p>
                    <p className="text-[13px] text-gray-400 mt-1">Órdenes</p>
                  </div>

                  <div>
                    <p className="text-xl md:text-2xl font-semibold tabular-nums text-gray-900">{(selectedOrganization.visits30d || 0).toLocaleString('es-CL')}</p>
                    <p className="text-[13px] text-gray-400 mt-1">Visitas 30d</p>
                  </div>
                </div>
              )}

              {/* Branding */}
              {detailTab === 'branding' && (
                <OrgBrandingTab
                  organizationId={selectedOrganization.id}
                  onSaved={(updated) => {
                    setSelectedOrganization((prev) => ({
                      ...prev,
                      name: updated.name,
                      slug: updated.slug,
                      logoUrl: updated.logo_url || null,
                      coverUrl: updated.cover_url || null,
                      coverIsVideo: updated.cover_is_video === true,
                      description: updated.description || '',
                      forceClosed: updated.force_closed === true,
                      closedMessage: updated.closed_message || '',
                    }));
                    setOrganizations((prev) => prev.map((o) => o.id === selectedOrganization.id
                      ? {
                        ...o,
                        name: updated.name,
                        slug: updated.slug,
                        logoUrl: updated.logo_url || null,
                        coverUrl: updated.cover_url || null,
                        coverIsVideo: updated.cover_is_video === true,
                        description: updated.description || '',
                        forceClosed: updated.force_closed === true,
                        closedMessage: updated.closed_message || '',
                      }
                      : o));
                  }}
                />
              )}

              {/* Hours */}
              {detailTab === 'hours' && (
                <OrgHoursTab organizationId={selectedOrganization.id} />
              )}

              {/* Users */}
              {detailTab === 'users' && (
                <div className="p-4 md:p-6 space-y-4">
                  {/* Crear vendedor con PIN */}
                  {!showCreateSeller ? (
                    <Button size="sm" onClick={() => { setShowCreateSeller(true); setCreatedPin(null); }}>
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
                        <Button size="sm" onClick={handleCreateSeller} disabled={staffBusy === 'create' || !newSellerEmail.trim()}>
                          {staffBusy === 'create' ? 'Creando…' : 'Crear y generar PIN'}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setShowCreateSeller(false)}>
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
                        size="sm"
                        onClick={() => { navigator.clipboard.writeText(createdPin.pin); toast.success('PIN copiado'); }}
                      >
                        Copiar
                      </Button>
                    </div>
                  )}
                {/* Mobile: cards */}
                <div className="divide-y md:hidden -m-4 md:m-0">
                  {orgUsers.map((user) => {
                    const isSup = supremos.includes(user.id);
                    const busy = staffBusy === user.id;
                    return (
                    <div key={user.id} className={`px-4 py-4 flex items-center gap-3 ${user.isActive ? '' : 'opacity-60'}`}>
                      <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                        <User className="h-5 w-5 text-gray-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate flex items-center gap-1.5">{user.name} {isSup && <Shield className="h-3.5 w-3.5 text-purple-600" />}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {isSup ? 'Super Admin' : user.role} · {user.isActive ? 'Activo' : 'Desactivado'} · {new Date(user.createdAt).toLocaleDateString()}
                        </p>
                        <div className="flex items-center gap-1.5 mt-2">
                          {!isSup && !['owner', 'admin'].includes(user.rawRole) && (
                            <Button variant="outline" size="sm" onClick={() => handleResetPin(user.id)} disabled={busy}>
                              <KeyRound />
                              Resetear PIN
                            </Button>
                          )}
                          <Button variant="secondary" size="sm" onClick={() => handleToggleActive(user)} disabled={busy}>{user.isActive ? 'Desactivar' : 'Activar'}</Button>
                          <Button variant="ghost" size="sm" onClick={() => handleToggleSupremo(user)} disabled={busy}>{isSup ? 'Quitar Supremo' : 'Hacer Supremo'}</Button>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                  {orgUsers.length === 0 && (
                    <p className="text-center py-12 text-gray-500 text-sm">
                      No hay usuarios en esta organización.
                    </p>
                  )}
                </div>
                {/* Desktop: table */}
                <div className="overflow-x-auto -mx-6 -my-6 hidden md:block">
                  <table className="w-full text-left border-collapse whitespace-nowrap">
                    <thead>
                      <tr className="border-b">
                        <th className="px-6 py-3 text-[13px] font-medium text-gray-500">Usuario</th>
                        <th className="px-6 py-3 text-[13px] font-medium text-gray-500">Rol</th>
                        <th className="px-6 py-3 text-[13px] font-medium text-gray-500">Estado</th>
                        <th className="px-6 py-3 text-[13px] font-medium text-gray-500">Registro</th>
                        <th className="px-6 py-3 text-[13px] font-medium text-gray-500 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {orgUsers.map((user) => {
                        const isSup = supremos.includes(user.id);
                        const busy = staffBusy === user.id;
                        return (
                        <tr key={user.id} className={`transition-colors ${user.isActive ? 'hover:bg-gray-50' : 'bg-gray-50/60 opacity-70'}`}>
                          <td className="px-6 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                                <User className="h-4 w-4 text-gray-400" />
                              </div>
                              <div className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">{user.name} {isSup && <Shield className="h-4 w-4 text-purple-600" />}</div>
                            </div>
                          </td>
                          <td className="px-6 py-3.5 text-sm text-gray-500">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full ${isSup ? 'bg-purple-100 text-purple-700' : user.rawRole === 'cashier' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                              {isSup ? 'Super Admin' : user.role}
                            </span>
                          </td>
                          <td className="px-6 py-3.5">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${user.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                              {user.isActive ? 'Activo' : 'Desactivado'}
                            </span>
                          </td>
                          <td className="px-6 py-3.5 text-sm tabular-nums text-gray-400">
                            {new Date(user.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-3.5">
                            <div className="flex items-center justify-end gap-1.5">
                              {!isSup && !['owner', 'admin'].includes(user.rawRole) && (
                                <Button variant="outline" size="sm" onClick={() => handleResetPin(user.id)} disabled={busy} title="Resetear PIN">
                                  <KeyRound />
                                  Resetear PIN
                                </Button>
                              )}
                              <Button variant="ghost" size="icon-sm" onClick={() => handleToggleActive(user)} disabled={busy} title={user.isActive ? 'Desactivar cuenta' : 'Activar cuenta'}>
                                {user.isActive ? <ToggleRight className="h-5 w-5 text-emerald-600" /> : <ToggleLeft className="h-5 w-5 text-gray-400" />}
                              </Button>
                              <Button variant="ghost" size="icon-sm" onClick={() => handleToggleSupremo(user)} disabled={busy} title={isSup ? 'Quitar Super Admin' : 'Otorgar Super Admin'}>
                                <Shield className={`h-5 w-5 ${isSup ? 'text-purple-700' : 'text-gray-300'}`} />
                              </Button>
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
                <div className="animate-in fade-in">
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
                    <div className="p-4 md:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between border-b">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                          <MessageCircle className="h-5 w-5 text-green-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">WhatsApp</h3>
                          <p className="text-xs text-gray-500">Inbox de conversaciones</p>
                        </div>
                      </div>
                      <label className="flex items-center justify-between sm:justify-end gap-3 cursor-pointer select-none w-full sm:w-auto">
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
                    <div className="px-4 md:px-5 py-3 bg-gray-50/50 flex items-center justify-between gap-2 flex-wrap">
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
                    <div className="p-4 md:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between border-b">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                          <Globe className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">Uber Direct</h3>
                          <p className="text-xs text-gray-500">Delivery a través de Uber</p>
                        </div>
                      </div>
                      <label className="flex items-center justify-between sm:justify-end gap-3 cursor-pointer select-none w-full sm:w-auto">
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
                    <div className="px-4 md:px-5 py-3 bg-gray-50/50 flex items-center justify-between gap-2 flex-wrap">
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
                    <div className="p-4 md:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
                          <Store className="h-5 w-5 text-orange-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">Modo Salón (Mesas)</h3>
                          <p className="text-xs text-gray-500">Permite gestionar mesas y sectores en el POS</p>
                        </div>
                      </div>
                      <label className="flex items-center justify-between sm:justify-end gap-3 cursor-pointer select-none w-full sm:w-auto">
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
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <div>
                      <h3 className="font-semibold text-gray-800">Productos del catálogo</h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Abre el editor completo de cada producto, con la misma interfaz que usa la tienda.
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <Button
                        variant="outline"
                        className="w-full sm:w-auto text-blue-600 border-blue-200 hover:bg-blue-50"
                        onClick={() => setIsAIImportOpen(true)}
                      >
                        <Sparkles className="h-4 w-4 mr-2" /> Importar menú con IA
                      </Button>
                      <Button onClick={openNewProductEditor} className="w-full sm:w-auto">
                        <Plus className="h-4 w-4 mr-2" /> Nuevo artículo
                      </Button>
                    </div>
                  </div>
                  {/* Mobile: cards */}
                  <div className="divide-y md:hidden -m-4 md:m-0">
                    {orgProducts.map((prod) => (
                      <div key={prod.id} className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          {prod.product_images?.[0]?.url ? (
                            <img src={prod.product_images[0].url} alt={prod.name} className="h-12 w-12 rounded-xl object-cover bg-gray-100 border border-gray-200 shrink-0" />
                          ) : (
                            <ProductImageFallback logoUrl={selectedOrganization?.logoUrl} alt={prod.name} className="h-12 w-12 rounded-xl shrink-0 border border-gray-200" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 truncate">{prod.name}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {prod.sku || 'Sin SKU'} · ${Number(prod.base_price).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 shrink-0">
                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${prod.status === 'available' ? 'bg-green-500' : 'bg-gray-300'}`} />
                            {prod.status === 'available' ? 'Disponible' : prod.status}
                          </span>
                        </div>
                        <div className="flex gap-2 mt-3">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => openFullProductEditor(prod.id)}
                            className="flex-1 text-xs font-semibold h-10"
                          >
                            <Pencil className="h-3.5 w-3.5 mr-1.5" />
                            Editar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingProductId(prod.id)}
                            className="flex-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50 text-xs font-semibold h-10 border border-blue-100"
                          >
                            Rápido
                          </Button>
                        </div>
                      </div>
                    ))}
                    {orgProducts.length === 0 && (
                      <p className="text-center py-12 text-gray-500 text-sm">
                        No hay productos registrados en este negocio.
                      </p>
                    )}
                  </div>
                  {/* Desktop: table */}
                  <div className="overflow-x-auto -mx-6 -my-6 hidden md:block">
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
                                  <ProductImageFallback logoUrl={selectedOrganization?.logoUrl} alt={prod.name} className="h-10 w-10   shrink-0 border border-gray-200" />
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
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => openFullProductEditor(prod.id)}
                                  className="text-xs font-semibold"
                                  title="Abrir el editor completo, igual que la tienda (variantes, ingredientes, imagen, combos, receta)"
                                >
                                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                                  Editar
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setEditingProductId(prod.id)}
                                  className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 text-xs font-semibold"
                                  title="Edición rápida (nombre, precio, SKU, categoría y estado)"
                                >
                                  Rápido
                                </Button>
                              </div>
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

              {/* Categories */}
              {detailTab === 'categories' && (
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <div>
                      <h3 className="font-semibold text-gray-800">Categorías del negocio</h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Abre el editor completo de cada categoría, con la misma interfaz que usa la tienda.
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => selectedOrganization?.id && fetchOrgCategories(selectedOrganization.id)}
                        disabled={loadingCategories}
                        className="w-full sm:w-auto h-10"
                      >
                        <RefreshCw className={`h-4 w-4 mr-2 ${loadingCategories ? 'animate-spin' : ''}`} /> Recargar
                      </Button>
                      <Button onClick={openNewCategoryEditor} className="w-full sm:w-auto h-10">
                        <Plus className="h-4 w-4 mr-2" /> Nueva categoría
                      </Button>
                    </div>
                  </div>
                  {loadingCategories ? (
                    <div className="flex justify-center items-center py-12">
                      <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
                    </div>
                  ) : (
                    <>
                    {/* Mobile: cards */}
                    <div className="divide-y md:hidden -m-4 md:m-0">
                      {orgCategories.map((cat) => (
                        <div key={cat.id} className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            {cat.image_url ? (
                              <img src={cat.image_url} alt={cat.name} className="h-12 w-12 object-cover bg-gray-100 border border-gray-200 rounded-xl shrink-0" />
                            ) : (
                              <div className="h-12 w-12 bg-gray-100 border border-gray-200 rounded-xl flex items-center justify-center shrink-0">
                                <Tags className="h-5 w-5 text-gray-400" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 truncate">{cat.name}</p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                <span className="font-semibold text-gray-900">{cat.product_count || 0}</span>{' '}
                                {(cat.product_count || 0) === 1 ? 'artículo' : 'artículos'} · {cat.is_active ? 'Activa' : 'Inactiva'}
                              </p>
                            </div>
                            <Switch
                              checked={cat.is_active}
                              onCheckedChange={async (checked) => {
                                const toastId = toast.loading(checked ? 'Activando categoría...' : 'Desactivando categoría...');
                                try {
                                  await quickUpdateCategoryStatus(cat.id, checked);
                                  setOrgCategories((prev) => prev.map((c) => c.id === cat.id ? { ...c, is_active: checked } : c));
                                  toast.success(checked ? 'Categoría activada' : 'Categoría desactivada', { id: toastId });
                                } catch (err) {
                                  console.error(err);
                                  toast.error('Error al actualizar estado', { id: toastId });
                                }
                              }}
                            />
                          </div>
                          <div className="flex gap-2 mt-3">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => openFullCategoryEditor(cat.id)}
                              className="flex-1 text-xs font-semibold h-10"
                            >
                              <Pencil className="h-3.5 w-3.5 mr-1.5" />
                              Editar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                const toastId = toast.loading('Duplicando categoría...');
                                try {
                                  await duplicateCategory(cat.id);
                                  await fetchOrgCategories(selectedOrganization.id);
                                  toast.success('Categoría duplicada', { id: toastId });
                                } catch (err) {
                                  console.error(err);
                                  toast.error('Error al duplicar', { id: toastId });
                                }
                              }}
                              className="flex-1 text-gray-600 text-xs font-semibold h-10 border border-gray-200"
                            >
                              <Copy className="h-3.5 w-3.5 mr-1.5" />
                              Duplicar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                if (!confirm(`¿Eliminar la categoría "${cat.name}"? Sus artículos quedarán sin categoría.`)) return;
                                const toastId = toast.loading('Eliminando categoría...');
                                try {
                                  await deleteCategory(cat.id);
                                  setOrgCategories((prev) => prev.filter((c) => c.id !== cat.id));
                                  toast.success('Categoría eliminada', { id: toastId });
                                } catch (err) {
                                  console.error(err);
                                  toast.error('Error al eliminar', { id: toastId });
                                }
                              }}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50 text-xs font-semibold h-10 px-3 border border-red-100"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      {orgCategories.length === 0 && (
                        <p className="text-center py-12 text-gray-500 text-sm">
                          No hay categorías registradas en este negocio.
                        </p>
                      )}
                    </div>
                    {/* Desktop: table */}
                    <div className="overflow-x-auto -mx-6 -my-6 hidden md:block">
                      <table className="w-full text-left border-collapse whitespace-nowrap">
                        <thead>
                          <tr className="bg-gray-50 border-b">
                            <th className="px-6 py-4 text-sm font-semibold text-gray-600">Categoría</th>
                            <th className="px-6 py-4 text-sm font-semibold text-gray-600">Artículos</th>
                            <th className="px-6 py-4 text-sm font-semibold text-gray-600">Estado</th>
                            <th className="px-6 py-4 text-sm font-semibold text-gray-600 text-right">Acción</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {orgCategories.map((cat) => (
                            <tr key={cat.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  {cat.image_url ? (
                                    <img src={cat.image_url} alt={cat.name} className="h-10 w-10 object-cover bg-gray-100 border border-gray-200 rounded-md" />
                                  ) : (
                                    <div className="h-10 w-10 bg-gray-100 border border-gray-200 rounded-md flex items-center justify-center shrink-0">
                                      <Tags className="h-5 w-5 text-gray-400" />
                                    </div>
                                  )}
                                  <span className="font-medium text-gray-900">{cat.name}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-600">
                                <span className="font-semibold text-gray-900">{cat.product_count || 0}</span>{' '}
                                {(cat.product_count || 0) === 1 ? 'artículo' : 'artículos'}
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <Switch
                                    checked={cat.is_active}
                                    onCheckedChange={async (checked) => {
                                      const toastId = toast.loading(checked ? 'Activando categoría...' : 'Desactivando categoría...');
                                      try {
                                        await quickUpdateCategoryStatus(cat.id, checked);
                                        setOrgCategories((prev) => prev.map((c) => c.id === cat.id ? { ...c, is_active: checked } : c));
                                        toast.success(checked ? 'Categoría activada' : 'Categoría desactivada', { id: toastId });
                                      } catch (err) {
                                        console.error(err);
                                        toast.error('Error al actualizar estado', { id: toastId });
                                      }
                                    }}
                                  />
                                  <span className={`text-xs font-medium ${cat.is_active ? 'text-green-700' : 'text-gray-500'}`}>
                                    {cat.is_active ? 'Activa' : 'Inactiva'}
                                  </span>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => openFullCategoryEditor(cat.id)}
                                    className="text-xs font-semibold"
                                    title="Abrir el editor completo, igual que la tienda (nombre, artículos, canales)"
                                  >
                                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                                    Editar
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={async () => {
                                      const toastId = toast.loading('Duplicando categoría...');
                                      try {
                                        await duplicateCategory(cat.id);
                                        await fetchOrgCategories(selectedOrganization.id);
                                        toast.success('Categoría duplicada', { id: toastId });
                                      } catch (err) {
                                        console.error(err);
                                        toast.error('Error al duplicar', { id: toastId });
                                      }
                                    }}
                                    className="text-gray-600 hover:text-gray-900 text-xs font-semibold"
                                    title="Duplicar categoría"
                                  >
                                    <Copy className="h-3.5 w-3.5 mr-1.5" />
                                    Duplicar
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={async () => {
                                      if (!confirm(`¿Eliminar la categoría "${cat.name}"? Sus artículos quedarán sin categoría.`)) return;
                                      const toastId = toast.loading('Eliminando categoría...');
                                      try {
                                        await deleteCategory(cat.id);
                                        setOrgCategories((prev) => prev.filter((c) => c.id !== cat.id));
                                        toast.success('Categoría eliminada', { id: toastId });
                                      } catch (err) {
                                        console.error(err);
                                        toast.error('Error al eliminar', { id: toastId });
                                      }
                                    }}
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50 text-xs font-semibold"
                                    title="Eliminar categoría"
                                  >
                                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                                    Eliminar
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {orgCategories.length === 0 && (
                            <tr>
                              <td colSpan="4" className="text-center py-12 text-gray-500">
                                No hay categorías registradas en este negocio.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    </>
                  )}
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
        userRole="superadmin"
      />

      {/* Confirmación de envío de bienvenida */}
      <Modal
        isOpen={!!welcomeTarget}
        onClose={() => setWelcomeTarget(null)}
        title="Enviar email de bienvenida"
        maxWidth="max-w-md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setWelcomeTarget(null)} className="rounded-full">
              Cancelar
            </Button>
            <Button
              disabled={sendingWelcomeId === welcomeTarget?.id}
              onClick={() => handleSendWelcome(welcomeTarget)}
              className="rounded-full bg-gray-900 text-white hover:bg-gray-700"
            >
              {sendingWelcomeId === welcomeTarget?.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Enviar'
              )}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-gray-600 leading-relaxed">
          Se enviará el email de bienvenida al dueño de{' '}
          <span className="font-bold text-gray-900">{welcomeTarget?.name}</span>{' '}
          con los primeros pasos para poner su tienda en marcha. ¿Continuar?
        </p>
      </Modal>
    </div>
  );
};

export default SuperAdminView;
