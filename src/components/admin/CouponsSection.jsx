import React, { useState, useEffect } from 'react';
import { Loader2, Plus, Trash2, Check, Tag, CalendarIcon, Percent, DollarSign, Search, Copy, X } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { getCoupons, createCoupon, updateCoupon, deleteCoupon } from '../../services/couponService';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import Modal from '@/components/ui/Modal';

const CouponsSection = ({ orgId }) => {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    code: '',
    type: 'percentage',
    value: '',
    min_total: '',
    max_uses: '',
    expires_at: null,
    is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!orgId) return;
    loadCoupons();
  }, [orgId]);

  const loadCoupons = async () => {
    setLoading(true);
    try {
      const data = await getCoupons(orgId);
      setCoupons(data);
    } catch (err) {
      console.error('Error loading coupons:', err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm({ code: '', type: 'percentage', value: '', min_total: '', max_uses: '', expires_at: null, is_active: true });
    setEditingCoupon(null);
    setError('');
  };

  const openCreate = () => {
    resetForm();
    setModalOpen(true);
  };

  const openEdit = (coupon) => {
    setEditingCoupon(coupon);
    setForm({
      code: coupon.code,
      type: coupon.type,
      value: coupon.value.toString(),
      min_total: coupon.min_total?.toString() || '',
      max_uses: coupon.max_uses?.toString() || '',
      expires_at: coupon.expires_at ? new Date(coupon.expires_at) : null,
      is_active: coupon.is_active,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    resetForm();
  };

  const handleSave = async () => {
    if (!form.code.trim() || !form.value) {
      setError('Código y valor son obligatorios.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        organization_id: orgId,
        code: form.code.trim().toUpperCase(),
        type: form.type,
        value: Number(form.value),
        min_total: form.min_total ? Number(form.min_total) : 0,
        max_uses: form.max_uses ? Number(form.max_uses) : null,
        expires_at: form.expires_at ? new Date(form.expires_at.getFullYear(), form.expires_at.getMonth(), form.expires_at.getDate(), 23, 59, 59).toISOString() : null,
        is_active: form.is_active,
      };
      if (editingCoupon) {
        await updateCoupon(editingCoupon.id, payload);
      } else {
        await createCoupon(payload);
      }
      await loadCoupons();
      closeModal();
    } catch (err) {
      setError(err.message || 'Error al guardar el cupón.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este cupón permanentemente?')) return;
    try {
      await deleteCoupon(id);
      await loadCoupons();
    } catch (err) {
      console.error('Error deleting coupon:', err);
    }
  };

  const handleToggleActive = async (coupon) => {
    try {
      await updateCoupon(coupon.id, { is_active: !coupon.is_active });
      await loadCoupons();
    } catch (err) {
      console.error('Error toggling coupon:', err);
    }
  };

  const handleDuplicate = (coupon) => {
    setForm({
      code: coupon.code + '-COPIA',
      type: coupon.type,
      value: coupon.value.toString(),
      min_total: coupon.min_total?.toString() || '',
      max_uses: '',
      expires_at: null,
      is_active: true,
    });
    setEditingCoupon(null);
    setModalOpen(true);
  };

  const fmt = (n) => Number(n || 0).toLocaleString('es-CL');

  const filteredCoupons = coupons.filter((c) => {
    const q = search.toLowerCase();
    return c.code.toLowerCase().includes(q);
  });

  // ── Loading ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o código..."
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-black focus:ring-1 focus:ring-black transition-all placeholder:text-gray-400"
          />
        </div>
        <Button
          onClick={openCreate}
          className="flex items-center gap-2 px-5 py-2.5 bg-black text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-colors shrink-0"
        >
          <Plus className="h-4 w-4" />
          Crear cupón
        </Button>
      </div>

      {/* Empty state */}
      {coupons.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Tag className="h-7 w-7 text-gray-400" />
          </div>
          <h3 className="text-base font-bold text-gray-900 mb-1">No hay cupones</h3>
          <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
            Los cupones te permiten ofrecer descuentos a tus clientes. Crea uno para empezar.
          </p>
          <Button
            onClick={openCreate}
            className="flex items-center gap-2 px-6 py-2.5 bg-black text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-colors mx-auto"
          >
            <Plus className="h-4 w-4" />
            Crear primer cupón
          </Button>
        </div>
      ) : filteredCoupons.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-500">No se encontraron cupones con "{search}"</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_100px_90px_90px_50px_120px] gap-3 px-6 py-3 bg-gray-50 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase tracking-wider hidden md:grid">
            <span>Cupón</span>
            <span>Descuento</span>
            <span>Usos</span>
            <span>Expira</span>
            <span className="text-center">Activo</span>
            <span className="text-right">Acciones</span>
          </div>

          {/* Rows */}
          <div className="divide-y divide-gray-100">
            {filteredCoupons.map((coupon) => {
              const isExpired = coupon.expires_at && new Date(coupon.expires_at) < new Date();
              return (
                <div
                  key={coupon.id}
                  className={`grid grid-cols-1 md:grid-cols-[1fr_100px_90px_90px_50px_120px] gap-3 md:gap-3 px-6 py-4 items-center transition-colors hover:bg-gray-50 ${
                    !coupon.is_active ? 'opacity-60' : ''
                  }`}
                >
                  {/* Coupon info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <Tag className="h-4 w-4 text-gray-900 shrink-0" />
                    <div className="min-w-0">
                      <span className="font-bold text-sm text-gray-900 truncate block">{coupon.code}</span>
                    </div>
                  </div>

                  {/* Discount */}
                  <span className="text-sm font-bold text-gray-900">
                    {coupon.type === 'percentage' ? `${coupon.value}%` : `$${fmt(coupon.value)}`}
                  </span>

                  {/* Uses */}
                  <span className="text-sm text-gray-600">
                    {coupon.used_count || 0}{coupon.max_uses ? ` / ${coupon.max_uses}` : ''}
                  </span>

                  {/* Expires */}
                  <span className={`text-sm ${isExpired ? 'text-red-500 font-medium' : 'text-gray-500'}`}>
                    {coupon.expires_at
                      ? new Date(coupon.expires_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
                      : '—'}
                  </span>

                  {/* Active toggle */}
                  <div className="flex justify-center">
                    <Switch
                      checked={coupon.is_active}
                      onCheckedChange={() => handleToggleActive(coupon)}
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => openEdit(coupon)}
                      className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Editar"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDuplicate(coupon)}
                      className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Duplicar"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(coupon.id)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Modal: Crear / Editar Cupón ──────────────────── */}
      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingCoupon ? 'Editar cupón' : 'Nuevo cupón'}
        maxWidth="max-w-lg"
        footer={
          <div className="px-6 py-4 flex items-center justify-end gap-3">
            <button
              onClick={closeModal}
              className="px-5 py-2.5 text-sm font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <Button
              onClick={handleSave}
              disabled={saving || !form.code.trim() || !form.value}
              className="flex items-center gap-2 px-6 py-2.5 bg-black text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {editingCoupon ? 'Guardar cambios' : 'Crear cupón'}
            </Button>
          </div>
        }
      >
        <div className="p-6 space-y-6">
          {/* ── Código + Tipo ──────────────────────────────── */}
          <div className="grid grid-cols-[1fr_auto] gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Código del cupón</label>
              <p className="text-[11px] text-gray-400 mb-2">El código que ingresa el cliente.</p>
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="EJ: VERANO10"
                className="w-full h-11 px-4 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition-all uppercase placeholder:text-gray-300 placeholder:font-normal tracking-wide"
              />
            </div>
            <div className="pt-0.5">
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Tipo</label>
              <p className="text-[11px] text-transparent mb-2 select-none">.</p>
              <div className="flex h-11 rounded-xl border border-gray-200 overflow-hidden focus-within:border-gray-900 focus-within:ring-1 focus-within:ring-gray-900 transition-all">
                <button
                  onClick={() => setForm({ ...form, type: 'percentage' })}
                  className={`flex items-center gap-1.5 px-4 text-sm font-bold transition-all border-r border-gray-200 ${
                    form.type === 'percentage' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  <Percent className="h-3.5 w-3.5" />
                  %
                </button>
                <button
                  onClick={() => setForm({ ...form, type: 'fixed' })}
                  className={`flex items-center gap-1.5 px-4 text-sm font-bold transition-all ${
                    form.type === 'fixed' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  <DollarSign className="h-3.5 w-3.5" />
                  $
                </button>
              </div>
            </div>
          </div>

          {/* ── Valor del descuento ────────────────────────── */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              {form.type === 'percentage' ? 'Porcentaje de descuento' : 'Monto de descuento'}
            </label>
            <div className="flex items-center h-11 border border-gray-200 rounded-xl focus-within:border-gray-900 focus-within:ring-1 focus-within:ring-gray-900 transition-all">
              <span className="pl-4 text-gray-400 font-bold">{form.type === 'percentage' ? '%' : '$'}</span>
              <input
                type="number"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                placeholder={form.type === 'percentage' ? '10' : '5000'}
                min="1"
                className="flex-1 h-full bg-transparent outline-none text-lg font-bold px-3 placeholder:text-gray-300 placeholder:font-normal"
              />
              {form.type === 'percentage' && form.value && (
                <span className="pr-4 text-sm font-bold text-gray-400">%</span>
              )}
              {form.type === 'fixed' && form.value && (
                <span className="pr-4 text-sm font-bold text-gray-400">CLP</span>
              )}
            </div>
            {form.type === 'percentage' && form.value && Number(form.value) > 100 && (
              <p className="text-xs text-amber-600 mt-1.5">El descuento no puede superar el 100%.</p>
            )}
          </div>

          {/* ── Condiciones ────────────────────────────────── */}
          <div className="border-t border-gray-100 pt-5">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Condiciones</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Compra mínima</label>
                <div className="flex items-center h-10 border border-gray-200 rounded-xl focus-within:border-gray-900 focus-within:ring-1 focus-within:ring-gray-900 transition-all">
                  <span className="pl-3 text-gray-400 text-sm">$</span>
                  <input
                    type="number"
                    value={form.min_total}
                    onChange={(e) => setForm({ ...form, min_total: e.target.value })}
                    placeholder="0"
                    min="0"
                    className="flex-1 h-full bg-transparent outline-none text-sm font-medium px-2 placeholder:text-gray-300"
                  />
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Sin mínimo si es 0</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Usos totales</label>
                <input
                  type="number"
                  value={form.max_uses}
                  onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
                  placeholder="Ilimitado"
                  min="0"
                  className="w-full h-10 px-3 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition-all placeholder:text-gray-300"
                />
                <p className="text-[11px] text-gray-400 mt-1">Vacío = ilimitado</p>
              </div>
            </div>
          </div>

          {/* ── Expiración + Estado ────────────────────────── */}
          <div className="border-t border-gray-100 pt-5">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Activación</h4>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Fecha de expiración</label>
                <Popover>
                  <PopoverTrigger
                    render={
                      <Button
                        variant="outline"
                        data-empty={!form.expires_at}
                        className="w-full justify-start text-left font-normal data-[empty=true]:text-muted-foreground h-10 text-sm"
                      />
                    }
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.expires_at ? format(form.expires_at, 'PPP', { locale: es }) : <span>Sin fecha de expiración</span>}
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={form.expires_at}
                      onSelect={(date) => setForm({ ...form, expires_at: date })}
                      disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex items-center justify-between p-3.5 bg-gray-50 border border-gray-200 rounded-xl">
                <div>
                  <p className="text-sm font-bold text-gray-900">Cupón activo</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {form.is_active ? 'Los clientes pueden usar este cupón.' : 'No se puede usar mientras esté desactivado.'}
                  </p>
                </div>
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
                />
              </div>
            </div>
          </div>

          {/* ── Error ──────────────────────────────────────── */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-sm text-red-600 font-medium">{error}</p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default CouponsSection;
