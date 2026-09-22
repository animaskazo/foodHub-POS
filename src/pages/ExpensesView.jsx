import React, { useState, useEffect, useMemo } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useAuth } from '../components/AuthContext';
import { supabase } from '../lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import Modal from '../components/ui/Modal';
import ConfirmDeleteModal from '../components/ui/ConfirmDeleteModal';
import { resolveCategoryIcon } from '../utils/expenseCategoryIcons';
import {
  Plus, Search, Loader2, ChevronLeft, ChevronRight, Repeat,
  Wallet, TrendingUp, TrendingDown, Eye, Pencil, Settings2, Trash2,
  Paperclip, FileText, X, Sparkles, ExternalLink, Receipt,
} from 'lucide-react';
import { uploadReceipt, deleteReceipt } from '../services/storageService';
import { extractReceiptData } from '../services/aiService';
import { toast } from 'sonner';
import {
  getExpenseCategories,
  ensureDefaultCategories,
  createExpenseCategory,
  deleteExpenseCategory,
  getMonthExpenses,
  summarizeExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
} from '../services/expenseService';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const fmt = (n) => '$' + Number(n || 0).toLocaleString('es-CL');
const toISODate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'card', label: 'Tarjeta' },
  { value: 'transfer', label: 'Transferencia' },
];

// Base UI solo resuelve el texto del ítem cuando el popup ya se abrió;
// antes muestra el valor crudo (ej. el UUID). Resolvemos la etiqueta
// explícitamente para mostrar siempre el nombre.
const SelectDisplay = ({ value, placeholder, options }) => {
  const found = (options || []).find((o) => o.value === value);
  if (!found) return <SelectValue placeholder={placeholder} />;
  const Icon = found.icon;
  return (
    <span className="flex flex-1 items-center gap-2 text-left min-w-0">
      {Icon
        ? <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: found.dot || '#6b7280' }} />
        : found.dot && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: found.dot }} />}
      <span className="truncate">{found.label}</span>
    </span>
  );
};

const categoryOptions = (categories) =>
  (categories || [])
    .filter((c) => c.is_active !== false)
    .map((c) => ({ value: c.id, label: c.name, dot: c.color, icon: resolveCategoryIcon(c) }));

const ExpensesView = () => {
  useDocumentTitle('Gastos');
  const { organization, user, loading: authLoading } = useAuth();
  const orgId = organization?.id;

  const today = useMemo(() => new Date(), []);
  const [cm, setCm] = useState(() => today.getMonth());
  const [cy, setCy] = useState(() => today.getFullYear());

  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [monthSales, setMonthSales] = useState(0);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('all');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, target: null, isDeleting: false });
  const [viewing, setViewing] = useState(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [catManagerOpen, setCatManagerOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState('variable');

  // Form
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(toISODate(new Date()));
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [supplier, setSupplier] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceEnd, setRecurrenceEnd] = useState('');
  const [notes, setNotes] = useState('');

  // Comprobante (foto o PDF)
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [receiptExisting, setReceiptExisting] = useState(null);
  const [receiptRemoved, setReceiptRemoved] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const normalizeName = (s) =>
    (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  const matchCategory = (suggested) => {
    const n = normalizeName(suggested);
    if (!n || n === 'otros') return null;
    const active = categories.filter((c) => c.is_active !== false);
    return (
      active.find((c) => normalizeName(c.name) === n) ||
      active.find((c) => normalizeName(c.name).includes(n) || n.includes(normalizeName(c.name))) ||
      null
    );
  };

  const load = async (showLoading = true) => {
    if (!orgId) return;
    if (showLoading) setLoading(true);
    try {
      const cats = await ensureDefaultCategories(orgId).catch(async () => getExpenseCategories(orgId));
      setCategories(cats || []);

      const monthRows = await getMonthExpenses(orgId, cy, cm);
      setExpenses(monthRows);

      // Ventas pagadas del mes para % gastos/ventas
      const start = new Date(cy, cm, 1).toISOString();
      const end = new Date(cy, cm + 1, 0, 23, 59, 59, 999).toISOString();
      const { data: orders } = await supabase
        .from('orders')
        .select('total, status, payments ( status )')
        .eq('organization_id', orgId)
        .gte('created_at', start)
        .lte('created_at', end);
      const sales = (orders || [])
        .filter((o) => o.status !== 'cancelled' && o.status !== 'refunded' && o.payments?.some((p) => p.status === 'paid'))
        .reduce((s, o) => s + Number(o.total || 0), 0);
      setMonthSales(sales);
    } catch (err) {
      console.error(err);
      toast.error('Error al cargar gastos');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && orgId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, orgId, cm, cy]);

  const summary = useMemo(() => summarizeExpenses(expenses), [expenses]);

  const filtered = useMemo(() => expenses.filter((e) => {
    if (typeFilter !== 'all' && (e.is_recurring ? 'fijo' : 'variable') !== typeFilter) return false;
    if (catFilter !== 'all' && e.category_id !== catFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${e.description || ''} ${e.supplier || ''} ${e.expense_categories?.name || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [expenses, typeFilter, catFilter, search]);

  const prev = () => { if (cm === 0) { setCm(11); setCy((y) => y - 1); } else setCm((m) => m - 1); };
  const next = () => { if (cm === 11) { setCm(0); setCy((y) => y + 1); } else setCm((m) => m + 1); };

  // Al elegir categoría en un gasto nuevo, se sugiere el check según el
  // tipo de la categoría, pero lo que define fijo/variable es el check.
  const handleCategoryChange = (id) => {
    setCategoryId(id);
    if (!editing) {
      const c = categories.find((cat) => cat.id === id);
      setIsRecurring(c?.type === 'fijo');
    }
  };

  const resetReceiptState = (row = null) => {    if (receiptPreview) URL.revokeObjectURL(receiptPreview);
    setReceiptFile(null);
    setReceiptPreview(null);
    setReceiptRemoved(false);
    setIsAnalyzing(false);
    setReceiptExisting(row?.receipt_url ? { url: row.receipt_url, type: row.receipt_type || 'image', name: row.receipt_name || 'Comprobante' } : null);
  };

  const openModal = (row = null, asCopy = false) => {
    if (row) {
      setEditing(asCopy ? null : (row._virtual ? { ...row, id: row._occurrenceOf } : row));
      setAmount(String(row.amount ?? ''));
      setExpenseDate(asCopy ? toISODate(new Date()) : (row._virtual ? toISODate(new Date(cy, cm, Math.min(Number(String(row.expense_date).slice(8, 10)), 28))) : row.expense_date));
      setCategoryId(row.category_id || '');
      setDescription(row.description || '');
      setSupplier(row.supplier || '');
      setPaymentMethod(row.payment_method || '');
      setIsRecurring(asCopy ? false : !!row.is_recurring);
      setRecurrenceEnd(row.recurrence_end || '');
      setNotes(row.notes || '');
      resetReceiptState(asCopy ? null : row);
    } else {
      setEditing(null);
      setAmount('');
      setExpenseDate(toISODate(new Date(cy, cm, Math.min(today.getDate(), 28))));
      setCategoryId('');
      setDescription('');
      setSupplier('');
      setPaymentMethod('');
      setIsRecurring(false);
      setRecurrenceEnd('');
      setNotes('');
      resetReceiptState(null);
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setTimeout(() => setEditing(null), 300);
  };

  const handleReceiptSelect = (file) => {
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
    if (!isPdf && !file.type.startsWith('image/')) {
      toast.error('Solo se aceptan fotos o PDF');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('El archivo supera los 10 MB');
      return;
    }
    if (receiptPreview) URL.revokeObjectURL(receiptPreview);
    setReceiptFile(file);
    setReceiptPreview(isPdf ? null : URL.createObjectURL(file));
    setReceiptRemoved(false);
  };

  const handleAnalyzeReceipt = async () => {
    let file = receiptFile;
    // Si el comprobante ya está guardado, descargarlo para analizarlo
    if (!file && receiptExisting && !receiptRemoved) {
      try {
        const res = await fetch(receiptExisting.url);
        const blob = await res.blob();
        const type = receiptExisting.type === 'pdf' ? 'application/pdf' : (blob.type || 'image/jpeg');
        file = new File([blob], receiptExisting.name || 'comprobante', { type });
      } catch {
        toast.error('No se pudo descargar el comprobante para analizarlo');
        return;
      }
    }
    if (!file) {
      toast.error('Primero adjunta la foto o PDF del comprobante');
      return;
    }
    setIsAnalyzing(true);
    try {
      const r = await extractReceiptData(file);
      if (r.business_name) setSupplier(r.business_name);
      if (r.amount > 0) setAmount(String(r.amount));
      if (/^\d{4}-\d{2}-\d{2}$/.test(r.date || '')) setExpenseDate(r.date);
      if (r.detail) setDescription(r.detail);
      const matched = matchCategory(r.suggested_category);
      if (matched) {
        setCategoryId(matched.id);
        toast.success(`Datos extraídos: ${r.business_name || 'comercio'} · categoría ${matched.name}`);
      } else if (r.suggested_category && normalizeName(r.suggested_category) !== 'otros') {
        toast.success(`Datos extraídos. Categoría sugerida: ${r.suggested_category} (revísala)`);
      } else {
        toast.success('Datos extraídos del comprobante');
      }
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'No se pudo analizar el comprobante');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error('Ingresa un monto válido'); return; }
    if (!expenseDate) { toast.error('Elige la fecha'); return; }
    setIsSaving(true);
    try {
      const payload = {
        category_id: categoryId || null,
        amount: amt,
        expense_date: expenseDate,
        description: description.trim() || 'Gasto',
        supplier: supplier.trim(),
        payment_method: paymentMethod || null,
        is_recurring: isRecurring,
        recurrence_end: isRecurring ? (recurrenceEnd || null) : null,
        notes: notes.trim(),
      };
      // Comprobante: subir archivo nuevo, o limpiar si se quitó el existente
      if (receiptFile) {
        const up = await uploadReceipt(receiptFile);
        payload.receipt_url = up.url;
        payload.receipt_type = up.type;
        payload.receipt_name = up.name;
        if (editing?.id && editing.receipt_url && editing.receipt_url !== up.url) {
          deleteReceipt(editing.receipt_url);
        }
      } else if (receiptRemoved) {
        payload.receipt_url = null;
        payload.receipt_type = null;
        payload.receipt_name = null;
        if (editing?.id && editing.receipt_url) deleteReceipt(editing.receipt_url);
      }
      if (editing?.id) {
        await updateExpense(editing.id, payload);
        toast.success('Gasto actualizado');
      } else {
        await createExpense(orgId, payload, user?.id);
        toast.success('Gasto registrado');
      }
      closeModal();
      load();
    } catch (err) {
      console.error(err);
      toast.error('No se pudo guardar. Revisa que las migraciones 064 y 066 estén aplicadas.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    const target = deleteModal.target;
    if (!target) return;
    if (target._virtual) {
      toast.error('Es una ocurrencia de un gasto recurrente: edita o elimina la serie original.');
      setDeleteModal({ isOpen: false, target: null, isDeleting: false });
      return;
    }
    setDeleteModal((p) => ({ ...p, isDeleting: true }));
    try {
      await deleteExpense(target.id);
      if (target.receipt_url) deleteReceipt(target.receipt_url);
      toast.success(target.is_recurring ? 'Serie recurrente eliminada' : 'Gasto eliminado');
      load();
    } catch {
      toast.error('Error al eliminar');
    } finally {
      setDeleteModal({ isOpen: false, target: null, isDeleting: false });
    }
  };

  const handleCreateCategory = async (e) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    try {
      await createExpenseCategory(orgId, { name: newCatName, type: newCatType });
      setNewCatName('');
      load(false);
      toast.success('Categoría creada');
    } catch {
      toast.error('Ya existe una categoría con ese nombre');
    }
  };

  const pctOfSales = monthSales > 0 ? (summary.total / monthSales) * 100 : 0;

  return (
    <div className="min-h-full bg-gray-50 p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Gastos</h1>
            <p className="text-gray-500 text-sm md:text-[15px] leading-relaxed mt-1">
              Registra gastos fijos y variables de tu negocio de comida y cruza con ventas en Reportes.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" onClick={() => setCatManagerOpen(true)} className="hidden sm:inline-flex">
              <Settings2 className="h-4 w-4 mr-2" /> Categorías
            </Button>
            <Button onClick={() => openModal()}>
              <Plus className="h-4 w-4 mr-2" /> Nuevo gasto
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-gray-200/80 px-4 py-3">
            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5" /> Total mes</div>
            <div className="text-xl font-black text-gray-900 mt-0.5">{fmt(summary.total)}</div>
            <div className="text-[11px] text-gray-400">{summary.count} mov. · {pctOfSales.toFixed(1)}% ventas</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200/80 px-4 py-3">
            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Fijos</div>
            <div className="text-xl font-black text-gray-900 mt-0.5">{fmt(summary.fixed)}</div>
            <div className="text-[11px] text-gray-400">Recurrentes del mes</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200/80 px-4 py-3">
            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Variables</div>
            <div className="text-xl font-black text-gray-900 mt-0.5">{fmt(summary.variable)}</div>
            <div className="text-[11px] text-gray-400">Puntuales del mes</div>
          </div>
          <div className={`rounded-xl border px-4 py-3 ${monthSales - summary.total >= 0 ? 'bg-emerald-50/60 border-emerald-100' : 'bg-red-50/60 border-red-100'}`}>
            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
              {(monthSales - summary.total) >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />} Utilidad est.
            </div>
            <div className={`text-xl font-black mt-0.5 ${(monthSales - summary.total) >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{fmt(monthSales - summary.total)}</div>
            <div className="text-[11px] text-gray-400">Ventas {fmt(monthSales)} − gastos</div>
          </div>
        </div>

        {/* Filtros + tabla */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 sm:px-6 py-4 flex flex-col lg:flex-row gap-3 lg:items-center justify-between border-b">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
              <div className="relative w-full sm:w-auto">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input className="pl-9 w-full sm:w-64" placeholder="Buscar por descripción o proveedor" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full sm:w-40"><SelectDisplay value={typeFilter} placeholder="Tipo" options={[{ value: 'all', label: 'Todos' }, { value: 'fijo', label: 'Fijos' }, { value: 'variable', label: 'Variables' }]} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="fijo">Fijos</SelectItem>
                  <SelectItem value="variable">Variables</SelectItem>
                </SelectContent>
              </Select>
              <Select value={catFilter} onValueChange={setCatFilter}>
                <SelectTrigger className="w-full sm:w-56"><SelectDisplay value={catFilter} placeholder="Categoría" options={[{ value: 'all', label: 'Todas las categorías' }, ...categoryOptions(categories)]} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las categorías</SelectItem>
                  {categories.filter((c) => c.is_active !== false).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name} ({c.type})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between sm:justify-start gap-2 bg-gray-50 rounded-xl border border-gray-200/80 px-2 py-1.5 w-full sm:w-fit">
              <button onClick={prev} className="p-1.5 hover:bg-white rounded-lg transition-colors"><ChevronLeft className="h-4 w-4 text-gray-500" /></button>
              <span className="text-sm font-semibold text-gray-900 min-w-[130px] text-center select-none">{MONTHS[cm]} {cy}</span>
              <button onClick={next} className="p-1.5 hover:bg-white rounded-lg transition-colors"><ChevronRight className="h-4 w-4 text-gray-500" /></button>
            </div>
          </div>

          {/* Tabla en desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-white border-b text-gray-500 font-medium">
                <tr>
                  <th className="px-6 py-3 font-medium">Fecha</th>
                  <th className="px-6 py-3 font-medium">Categoría</th>
                  <th className="px-6 py-3 font-medium">Descripción</th>
                  <th className="px-6 py-3 font-medium">Proveedor</th>
                  <th className="px-6 py-3 font-medium text-right">Monto</th>
                  <th className="px-6 py-3 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-500"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" /> Cargando gastos...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-500">Sin gastos este mes. Registra el arriendo como recurrente para partir.</td></tr>
                ) : filtered.map((e) => {
                  const RowIcon = resolveCategoryIcon({ name: e.expense_categories?.name, icon: categories.find((c) => c.id === e.category_id)?.icon });
                  return (
                    <tr key={`${e.id}-${e.expense_date}`} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                        {new Date(e.expense_date + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                        {e.is_recurring && <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full"><Repeat className="h-3 w-3" />{e._virtual ? 'Auto' : 'Mensual'}</span>}
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="secondary" className="border font-semibold inline-flex items-center gap-1.5" style={{ backgroundColor: `${e.expense_categories?.color || '#6b7280'}15`, color: e.expense_categories?.color || '#374151', borderColor: `${e.expense_categories?.color || '#6b7280'}30` }}>
                          <RowIcon className="h-3.5 w-3.5" />
                          {e.expense_categories?.name || 'Sin categoría'}
                        </Badge>
                        <span className="ml-2 text-[11px] text-gray-400 uppercase">{e.is_recurring ? 'fijo' : 'variable'}</span>
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-900">
                        <span className="inline-flex items-center gap-1.5">
                          {e.description}
                          {e.receipt_url && <Paperclip className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-500">{e.supplier || '—'}</td>
                      <td className="px-6 py-4 text-right font-bold text-gray-900 font-mono">{fmt(e.amount)}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button title="Ver gasto" onClick={() => setViewing(e)} className="p-2 text-black hover:bg-gray-100 rounded-lg transition-colors">
                            <Eye className="h-4 w-4" />
                          </button>
                          <button title="Editar" onClick={() => openModal(e)} className="p-2 text-black hover:bg-gray-100 rounded-lg transition-colors">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button title="Eliminar" onClick={() => setDeleteModal({ isOpen: true, target: e, isDeleting: false })} className="p-2 text-black hover:bg-gray-100 rounded-lg transition-colors">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Tarjetas solo en móvil */}
          <div className="p-3 grid gap-2.5 md:hidden">
            {loading ? (
              <div className="py-10 text-center text-gray-500 text-sm">
                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" /> Cargando gastos...
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-10 text-center text-gray-500 text-sm">Sin gastos este mes. Registra el arriendo como recurrente para partir.</div>
            ) : filtered.map((e) => {
              const CatIcon = resolveCategoryIcon({ name: e.expense_categories?.name, icon: categories.find((c) => c.id === e.category_id)?.icon });
              const catColor = e.expense_categories?.color || '#6b7280';
              return (
                <div key={`${e.id}-${e.expense_date}`} className="flex items-center gap-3 p-3 rounded-2xl border border-gray-100 bg-white hover:bg-gray-50/70 transition-colors">
                  <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${catColor}15`, color: catColor }}>
                    <CatIcon className="h-5 w-5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {e.description}
                        {e.receipt_url && <Paperclip className="inline h-3.5 w-3.5 text-gray-400 ml-1.5 -mt-0.5" />}
                      </p>
                      <span className="text-sm font-bold text-gray-900 font-mono whitespace-nowrap">{fmt(e.amount)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className="text-xs text-gray-400 truncate">
                        <span className="font-semibold" style={{ color: catColor }}>{e.expense_categories?.name || 'Sin categoría'}</span>
                        <span className="mx-1.5">·</span>{new Date(e.expense_date + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                        {e.is_recurring && <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] font-bold text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded-md"><Repeat className="h-2.5 w-2.5" />{e._virtual ? 'Auto' : 'Mensual'}</span>}
                      </p>
                      <div className="flex items-center shrink-0">
                        <button title="Ver gasto" onClick={() => setViewing(e)} className="p-1.5 text-black hover:bg-gray-200/70 rounded-lg transition-colors">
                          <Eye className="h-4 w-4" />
                        </button>
                        <button title="Editar" onClick={() => openModal(e)} className="p-1.5 text-black hover:bg-gray-200/70 rounded-lg transition-colors">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button title="Eliminar" onClick={() => setDeleteModal({ isOpen: true, target: e, isDeleting: false })} className="p-1.5 text-black hover:bg-gray-200/70 rounded-lg transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Modal crear/editar */}
        <Modal isOpen={isModalOpen} onClose={closeModal} title={editing ? 'Editar gasto' : 'Nuevo gasto'} maxWidth="max-w-lg" fullScreenOnMobile>
          <form onSubmit={handleSave} className="p-4 sm:p-6 space-y-4">
            {editing?.is_recurring && <p className="text-xs text-violet-700 bg-violet-50 border border-violet-100 rounded-xl px-3 py-2">Estás editando una serie mensual: el cambio aplica a todos los meses.</p>}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Comprobante (opcional)</label>
              {(receiptFile || (receiptExisting && !receiptRemoved)) ? (
                <div className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                  {receiptFile ? (
                    receiptPreview ? (
                      <img src={receiptPreview} alt="Comprobante" className="w-14 h-14 rounded-lg object-cover shrink-0" />
                    ) : (
                      <span className="w-14 h-14 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0"><FileText className="h-6 w-6" /></span>
                    )
                  ) : (
                    receiptExisting.type === 'pdf' ? (
                      <span className="w-14 h-14 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0"><FileText className="h-6 w-6" /></span>
                    ) : (
                      <img src={receiptExisting.url} alt="Comprobante" className="w-14 h-14 rounded-lg object-cover shrink-0" />
                    )
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{receiptFile ? receiptFile.name : receiptExisting?.name}</p>
                    <p className="text-xs text-gray-400">{receiptFile ? 'Por subir al guardar' : 'Guardado'}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAnalyzeReceipt}
                    disabled={isAnalyzing}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 rounded-xl transition-colors shrink-0"
                  >
                    {isAnalyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {isAnalyzing ? 'Analizando…' : 'Analizar con IA'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (receiptPreview) URL.revokeObjectURL(receiptPreview);
                      setReceiptFile(null);
                      setReceiptPreview(null);
                      if (receiptExisting) setReceiptRemoved(true);
                    }}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                    title="Quitar comprobante"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <label className="flex-1 flex flex-col items-center justify-center gap-2 px-4 py-10 border-2 border-dashed border-gray-200 rounded-xl text-sm font-semibold text-gray-500 hover:border-gray-300 hover:text-gray-700 cursor-pointer transition-colors">
                    <Paperclip className="h-8 w-8" />
                    <span>Subir foto o PDF de boleta / factura</span>
                    <span className="text-xs font-normal text-gray-400">Toca para elegir el archivo</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => { handleReceiptSelect(e.target.files?.[0]); e.target.value = ''; }}
                    />
                  </label>
                </div>
              )}
              <p className="text-xs text-gray-400 mt-1">Sube primero la boleta y usa Analizar con IA para completar comercio, monto, fecha, detalle y categoría.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monto ($)</label>
                <Input type="number" min="0" step="1" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Ej: 450000" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
                <Input type="date" required value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
              <Select value={categoryId} onValueChange={handleCategoryChange}>
                <SelectTrigger className="w-full"><SelectDisplay value={categoryId} placeholder="Elige categoría" options={categoryOptions(categories)} /></SelectTrigger>
                <SelectContent>
                  {['fijo', 'variable'].map((t) => {
                    const group = categories.filter((c) => c.is_active !== false && (c.type || 'variable') === t);
                    if (group.length === 0) return null;
                    return (
                      <SelectGroup key={t}>
                        <SelectLabel>{t === 'fijo' ? 'Fijos' : 'Variables'}</SelectLabel>
                        {group.map((c) => {
                          const ItemIcon = resolveCategoryIcon(c);
                          return (
                            <SelectItem key={c.id} value={c.id}>
                              <ItemIcon className="h-4 w-4 shrink-0" style={{ color: c.color || '#6b7280' }} />
                              {c.name}
                            </SelectItem>
                          );
                        })}
                      </SelectGroup>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej: Arriendo local, compra carne, comisión Uber" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor (opcional)</label>
                <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Ej: Santa Isabel, Uber Eats" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Medio de pago</label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="w-full"><SelectDisplay value={paymentMethod} placeholder="—" options={PAYMENT_METHODS.map((m) => ({ value: m.value, label: m.label }))} /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer">
              <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} className="mt-1 h-4 w-4" />
              <span>
                <span className="block text-sm font-semibold text-gray-800">Gasto fijo mensual (auto-recurrente)</span>
                <span className="block text-xs text-gray-500">Este check define si el gasto es fijo. Se repite solo cada mes en Gastos y Reportes.</span>
              </span>
            </label>
            {isRecurring && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Termina el (opcional)</label>
                <Input type="date" value={recurrenceEnd} onChange={(e) => setRecurrenceEnd(e.target.value)} />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Detalle interno" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={closeModal} disabled={isSaving}>Cancelar</Button>
              <Button type="submit" disabled={isSaving}>{isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}{editing ? 'Guardar' : 'Registrar'}</Button>
            </div>
          </form>
        </Modal>

        {/* Gestor categorías */}
        <Modal isOpen={catManagerOpen} onClose={() => setCatManagerOpen(false)} title="Categorías de gasto">
          <div className="p-6 space-y-4">
            <form onSubmit={handleCreateCategory} className="flex gap-2">
              <Input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="Nueva categoría ej: Gas" className="flex-1" />
              <Select value={newCatType} onValueChange={setNewCatType}>
                <SelectTrigger className="w-32"><SelectDisplay value={newCatType} placeholder="Tipo" options={[{ value: 'fijo', label: 'Fijo' }, { value: 'variable', label: 'Variable' }]} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fijo">Fijo</SelectItem>
                  <SelectItem value="variable">Variable</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit"><Plus className="h-4 w-4" /></Button>
            </form>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {categories.map((c) => {
                const RowIcon = resolveCategoryIcon(c);
                return (
                  <div key={c.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${c.color || '#6b7280'}15`, color: c.color || '#6b7280' }}>
                        <RowIcon className="h-4 w-4" />
                      </span>
                      <span className="text-sm font-semibold text-gray-800">{c.name}</span>
                      <span className="text-[11px] uppercase text-gray-400">{c.type}</span>
                    </div>
                    <button
                      onClick={async () => {
                        try { await deleteExpenseCategory(c.id); setCategories(await getExpenseCategories(orgId)); }
                        catch { toast.error('No se puede eliminar: tiene gastos asociados'); }
                      }}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </Modal>

        {/* Modal ver detalle */}
        <Modal isOpen={!!viewing} onClose={() => { setViewing(null); setShowReceipt(false); }} title="Detalle del gasto" maxWidth="max-w-md">
          {viewing && (() => {
            const payLabel = PAYMENT_METHODS.find((m) => m.value === viewing.payment_method)?.label;
            const rows = [
              ['Fecha', new Date(viewing.expense_date + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })],
              ['Proveedor', viewing.supplier || '—'],
              ['Medio de pago', payLabel || '—'],
              ['Tipo', viewing.is_recurring ? 'Fijo' : 'Variable'],
              ['Notas', viewing.notes || '—'],
            ];
            return (
              <div className="p-6 space-y-5">
                <div>
                  <div className="text-3xl font-black text-gray-900 tracking-tight">{fmt(viewing.amount)}</div>
                  <div className="text-sm font-semibold text-gray-600">{viewing.description}</div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="border font-semibold" style={{ backgroundColor: `${viewing.expense_categories?.color || '#6b7280'}15`, color: viewing.expense_categories?.color || '#374151', borderColor: `${viewing.expense_categories?.color || '#6b7280'}30` }}>
                    {viewing.expense_categories?.name || 'Sin categoría'}
                  </Badge>
                  {viewing.is_recurring && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full"><Repeat className="h-3 w-3" />{viewing._virtual ? 'Ocurrencia automática' : 'Serie mensual'}</span>}
                </div>
                <dl className="divide-y divide-gray-100 border-y border-gray-100">
                  {rows.map(([k, v]) => (
                    <div key={k} className="flex items-start justify-between gap-4 py-2.5">
                      <dt className="text-xs font-bold text-gray-400 uppercase tracking-wider shrink-0">{k}</dt>
                      <dd className="text-sm text-gray-800 text-right">{v}</dd>
                    </div>
                  ))}
                  {viewing.receipt_url && (
                    <div className="flex items-center justify-between gap-4 py-2.5">
                      <dt className="text-xs font-bold text-gray-400 uppercase tracking-wider shrink-0">Comprobante</dt>
                      <dd>
                        <button onClick={() => setShowReceipt(true)} className="inline-flex items-center gap-1.5 text-sm font-bold text-black hover:underline">
                          <Receipt className="h-4 w-4" />
                          Ver comprobante
                        </button>
                      </dd>
                    </div>
                  )}
                </dl>
                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => { setViewing(null); setShowReceipt(false); }}>Cerrar</Button>
                  <Button onClick={() => { const v = viewing; setViewing(null); setShowReceipt(false); openModal(v); }}>Editar</Button>
                </div>
              </div>
            );
          })()}
        </Modal>

        {/* Modal comprobante */}
        <Modal
          isOpen={showReceipt && !!viewing?.receipt_url}
          onClose={() => setShowReceipt(false)}
          title={viewing?.receipt_name || 'Comprobante'}
          maxWidth="max-w-3xl"
        >
          {viewing?.receipt_url && (
            <div className="p-6">
              {viewing.receipt_type === 'pdf' ? (
                <iframe src={viewing.receipt_url} title="Comprobante PDF" className="w-full h-[70vh] rounded-xl border border-gray-100 bg-gray-50" />
              ) : (
                <img src={viewing.receipt_url} alt="Comprobante" className="w-full max-h-[70vh] object-contain rounded-xl border border-gray-100 bg-gray-50" />
              )}
              <div className="flex justify-end mt-4">
                <a href={viewing.receipt_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700 hover:text-emerald-800">
                  Abrir en pestaña nueva <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          )}
        </Modal>

        <ConfirmDeleteModal          isOpen={deleteModal.isOpen}
          onClose={() => setDeleteModal({ isOpen: false, target: null, isDeleting: false })}
          onConfirm={handleDelete}
          isDeleting={deleteModal.isDeleting}
          title="Eliminar gasto"
          description={deleteModal.target?.is_recurring && !deleteModal.target?._virtual ? 'Eliminarás la serie mensual completa.' : '¿Eliminar este gasto?'}
        />
      </div>
    </div>
  );
};

export default ExpensesView;
