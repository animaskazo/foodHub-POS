import React, { useState, useEffect, useCallback } from 'react';
import { ChevronDown, CircleCheck, Loader2, Printer, TriangleAlert } from 'lucide-react';
import Modal from '../ui/Modal';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { openShift, closeShift, getShiftSalesBreakdown } from '../../services/shiftService';
import { printShiftReport } from '../../services/printerService';
import { useAuth } from '../AuthContext';
import { toast } from 'sonner';

const formatCurrency = (value) => '$' + Number(value || 0).toLocaleString('es-CL');
const onlyDigits = (str) => String(str ?? '').replace(/\D/g, '');
const formatTime = (iso) => new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
const formatDate = (iso) => new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' });

const printErrorMessage = (error) => {
  const msg = error?.message || String(error);
  if (msg.includes('No hay impresora')) return 'No hay impresora configurada. Ve a Ajustes > Impresoras.';
  if (msg.includes('Print server') || msg.includes('fetch')) return 'Servidor de impresión no disponible. ¿Está corriendo el print server?';
  return `No se pudo imprimir el reporte: ${msg}`;
};

// Input de dinero: guarda solo dígitos y muestra separador de miles mientras se escribe.
const MoneyInput = ({ id, value, onChange, disabled, autoFocus }) => (
  <div className="relative">
    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-semibold text-gray-400" aria-hidden="true">$</span>
    <Input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={value === '' ? '' : Number(value).toLocaleString('es-CL')}
      onChange={(e) => onChange(onlyDigits(e.target.value))}
      className="h-16 rounded-xl bg-white pl-10 pr-4 text-right text-3xl font-bold tabular-nums"
      placeholder="0"
      disabled={disabled}
      autoFocus={autoFocus}
    />
  </div>
);

const Row = ({ label, value, strong = false, muted = false }) => (
  <div className={`flex items-center justify-between py-1.5 text-sm ${strong ? 'font-semibold text-gray-900' : muted ? 'text-gray-500' : 'text-gray-700'}`}>
    <span>{label}</span>
    <span className="tabular-nums">{value}</span>
  </div>
);

const differenceInfo = (difference) => {
  if (difference === 0) return { label: 'Cuadra exacto', tone: 'border-emerald-200 bg-emerald-50 text-emerald-700', Icon: CircleCheck };
  if (difference < 0) return { label: `Faltan ${formatCurrency(-difference)}`, tone: 'border-red-200 bg-red-50 text-red-700', Icon: TriangleAlert };
  return { label: `Sobran ${formatCurrency(difference)}`, tone: 'border-amber-200 bg-amber-50 text-amber-800', Icon: TriangleAlert };
};

/* ---------------- Abrir caja ---------------- */

const OpenShiftBody = ({ balance, onBalanceChange, loading, required, userName }) => (
  <div className="space-y-5 p-6">
    <p className="text-sm text-gray-500">
      Turno de <span className="font-medium text-gray-900">{userName || 'tu usuario'}</span> · {formatDate(new Date().toISOString())} {formatTime(new Date().toISOString())}
    </p>
    <div className="space-y-2">
      <label htmlFor="shift-starting-cash" className="block text-sm font-semibold text-gray-900">
        Fondo inicial {!required && <span className="font-normal text-gray-400">(opcional)</span>}
      </label>
      <MoneyInput id="shift-starting-cash" value={balance} onChange={onBalanceChange} disabled={loading} autoFocus />
      <p className="text-xs text-gray-500">Efectivo (sencillo) con el que parte la caja.</p>
    </div>
  </div>
);

/* ---------------- Cerrar caja: arqueo ---------------- */

const CloseShiftCount = ({ shift, sales, counted, onCountedChange, loading, required, pendingConfirm }) => {
  const hasCount = counted !== '';
  const difference = hasCount ? Number(counted) - sales.expectedCashInRegister : null;
  const info = hasCount ? differenceInfo(difference) : null;

  return (
    <div className="space-y-5 p-6">
      <p className="text-sm text-gray-500">
        Abierta por <span className="font-medium text-gray-900">{shift.opened_by_name || 'usuario'}</span> · {formatDate(shift.start_time)} {formatTime(shift.start_time)} → {formatTime(new Date().toISOString())} · {sales.orderCount} {sales.orderCount === 1 ? 'venta' : 'ventas'}
      </p>

      <div className="rounded-2xl border border-gray-200 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Efectivo esperado en caja</p>
        <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">{formatCurrency(sales.expectedCashInRegister)}</p>
        <div className="mt-3 border-t border-gray-100 pt-2">
          <Row label="Fondo inicial" value={formatCurrency(sales.startingBalance)} muted />
          <Row label="Ventas en efectivo" value={`+ ${formatCurrency(sales.cashSales)}`} muted />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="shift-counted-cash" className="text-sm font-semibold text-gray-900">
            Efectivo contado {!required && <span className="font-normal text-gray-400">(opcional)</span>}
          </label>
          {!hasCount && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onCountedChange(String(sales.expectedCashInRegister))} disabled={loading}>
              Cuadra exacto
            </Button>
          )}
        </div>
        <MoneyInput id="shift-counted-cash" value={counted} onChange={onCountedChange} disabled={loading} autoFocus />
        {info && (
          <div className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-base font-semibold ${info.tone}`} role="status">
            <info.Icon className="h-5 w-5" aria-hidden="true" />
            {info.label}
          </div>
        )}
        {pendingConfirm && difference !== 0 && (
          <p className="text-center text-sm text-gray-600">
            El conteo no cuadra. Revisa el efectivo o confirma para cerrar con la diferencia registrada.
          </p>
        )}
      </div>

      <details className="group rounded-2xl border border-gray-200">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-gray-800">
          Ventas del turno · {formatCurrency(sales.totalSales)}
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="border-t border-gray-100 px-4 py-2">
          <Row label="Efectivo" value={formatCurrency(sales.cashSales)} />
          <Row label="Tarjeta" value={formatCurrency(sales.cardSales)} />
          <Row label="Transferencia" value={formatCurrency(sales.transferSales)} />
          <Row label="Online" value={formatCurrency(sales.onlineSales)} />
          {sales.otherSales > 0 && <Row label="Otros" value={formatCurrency(sales.otherSales)} />}
          <div className="mt-1 border-t border-gray-100 pt-1">
            <Row label="Total" value={formatCurrency(sales.totalSales)} strong />
          </div>
        </div>
      </details>
    </div>
  );
};

/* ---------------- Cerrar caja: resumen ---------------- */

const CloseShiftDone = ({ sales, counted }) => {
  const hasCount = counted !== null;
  const difference = hasCount ? counted - sales.expectedCashInRegister : null;
  const info = hasCount ? differenceInfo(difference) : null;

  return (
    <div className="space-y-5 p-6">
      <div className="text-center">
        <CircleCheck className="mx-auto h-10 w-10 text-emerald-600" aria-hidden="true" />
        <p className="mt-2 text-lg font-semibold text-gray-900">Caja cerrada</p>
      </div>
      <div className="rounded-2xl border border-gray-200 px-4 py-2">
        <Row label="Efectivo esperado" value={formatCurrency(sales.expectedCashInRegister)} />
        <Row label="Efectivo contado" value={hasCount ? formatCurrency(counted) : 'Sin conteo'} />
        {info && (
          <div className="flex items-center justify-between py-1.5 text-sm">
            <span className="text-gray-700">Diferencia</span>
            <span className={`rounded-md border px-2 py-0.5 font-semibold ${info.tone}`}>{info.label}</span>
          </div>
        )}
        <div className="mt-1 border-t border-gray-100 pt-1">
          <Row label="Ventas del turno" value={formatCurrency(sales.totalSales)} strong />
        </div>
      </div>
    </div>
  );
};

/* ---------------- Modal ---------------- */

const ShiftModal = ({ isOpen, onClose, type = 'open', settings, shift, organizationId, organization, onSuccess }) => {
  const { user } = useAuth();
  const staffName = user?.user_metadata?.name || user?.user_metadata?.full_name || user?.email;
  const [balance, setBalance] = useState('');
  const [loading, setLoading] = useState(false);
  const [sales, setSales] = useState(null);
  const [salesError, setSalesError] = useState(null);
  const [fetchingSales, setFetchingSales] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [closed, setClosed] = useState(null); // { shift, counted, closedAt } tras cerrar
  const [printing, setPrinting] = useState(false);

  const isClose = type === 'close';
  const required = isClose ? !!settings?.require_ending_cash : !!settings?.require_starting_cash;

  const loadSales = useCallback(async () => {
    if (!shift) return;
    setFetchingSales(true);
    setSalesError(null);
    try {
      setSales(await getShiftSalesBreakdown(shift));
    } catch (err) {
      setSalesError(err?.message || 'No se pudo cargar el detalle del turno');
    } finally {
      setFetchingSales(false);
    }
  }, [shift]);

  // Estado limpio y datos frescos cada vez que se abre el modal.
  useEffect(() => {
    if (!isOpen) return;
    setBalance('');
    setPendingConfirm(false);
    setClosed(null);
    setSales(null);
    if (isClose) loadSales();
  }, [isOpen, isClose, loadSales]);

  const handleCountedChange = (value) => {
    setBalance(value);
    setPendingConfirm(false);
  };

  const doPrint = async (closedShift, counted, closedAt) => {
    setPrinting(true);
    try {
      await printShiftReport({
        shift: closedShift,
        salesData: sales,
        reportedBalance: counted ?? 0,
        organization,
        closedBy: user?.id,
        closedAt,
      });
      toast.success('Reporte Z impreso');
    } catch (err) {
      console.error('[ShiftModal] Error printing Z report:', err);
      toast.error(printErrorMessage(err));
    } finally {
      setPrinting(false);
    }
  };

  const handleOpen = async () => {
    setLoading(true);
    try {
      await openShift(organizationId, Number(balance || 0), user.id);
      toast.success('Caja abierta');
      onSuccess();
    } catch (err) {
      console.error('[ShiftModal] Error opening shift:', err);
      toast.error(`No se pudo abrir la caja: ${err?.message || 'intenta nuevamente'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = async () => {
    const counted = balance === '' ? null : Number(balance);
    const difference = counted === null ? 0 : counted - sales.expectedCashInRegister;
    if (difference !== 0 && !pendingConfirm) {
      setPendingConfirm(true);
      return;
    }
    setLoading(true);
    try {
      const closedShift = await closeShift({
        shiftId: shift.id,
        countedCash: counted,
        expectedCash: sales.expectedCashInRegister,
        totalSales: sales.totalSales,
        userId: user.id,
      });
      const closedAt = closedShift?.end_time || new Date().toISOString();
      const fullShift = { ...shift, ...closedShift };
      setClosed({ shift: fullShift, counted, closedAt });
      if (settings?.auto_print_z_report) doPrint(fullShift, counted, closedAt);
    } catch (err) {
      console.error('[ShiftModal] Error closing shift:', err);
      toast.error(`No se pudo cerrar la caja: ${err?.message || 'intenta nuevamente'}`);
    } finally {
      setLoading(false);
    }
  };

  // Tras cerrar, cualquier forma de salir refresca el estado del POS.
  const handleDismiss = closed ? onSuccess : onClose;

  if (!isOpen) return null;

  let body;
  let footer;

  if (!isClose) {
    body = <OpenShiftBody balance={balance} onBalanceChange={setBalance} loading={loading} required={required} userName={staffName} />;
    footer = (
      <div className="flex gap-3 p-4 sm:px-6">
        <Button variant="outline" size="lg" className="flex-1" onClick={onClose} disabled={loading}>Cancelar</Button>
        <Button size="lg" className="flex-1" onClick={handleOpen} disabled={loading || (required && balance === '')}>
          {loading && <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />}
          Abrir caja
        </Button>
      </div>
    );
  } else if (closed) {
    body = <CloseShiftDone sales={sales} counted={closed.counted} />;
    footer = (
      <div className="flex gap-3 p-4 sm:px-6">
        <Button variant="outline" size="lg" className="flex-1" onClick={() => doPrint(closed.shift, closed.counted, closed.closedAt)} disabled={printing}>
          {printing ? <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" /> : <Printer className="mr-2 h-5 w-5" aria-hidden="true" />}
          Imprimir reporte Z
        </Button>
        <Button size="lg" className="flex-1" onClick={onSuccess}>Listo</Button>
      </div>
    );
  } else if (fetchingSales || (!sales && !salesError)) {
    body = (
      <div className="flex items-center justify-center gap-3 py-16 text-gray-600">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
        Cargando ventas del turno…
      </div>
    );
  } else if (salesError) {
    body = (
      <div className="space-y-4 px-6 py-12 text-center">
        <p className="text-sm text-red-600">{salesError}</p>
        <Button variant="outline" onClick={loadSales}>Reintentar</Button>
      </div>
    );
  } else {
    const missingRequired = required && balance === '';
    body = (
      <CloseShiftCount
        shift={shift}
        sales={sales}
        counted={balance}
        onCountedChange={handleCountedChange}
        loading={loading}
        required={required}
        pendingConfirm={pendingConfirm}
      />
    );
    footer = (
      <div className="flex gap-3 p-4 sm:px-6">
        <Button variant="outline" size="lg" className="flex-1" onClick={onClose} disabled={loading}>Cancelar</Button>
        <Button size="lg" className="flex-1" onClick={handleClose} disabled={loading || missingRequired}>
          {loading && <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />}
          {pendingConfirm ? 'Cerrar con diferencia' : 'Cerrar caja'}
        </Button>
      </div>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={loading ? undefined : handleDismiss}
      title={isClose ? 'Cerrar caja' : 'Abrir caja'}
      maxWidth="max-w-lg"
      fullScreenOnMobile
      footer={footer}
    >
      {body}
    </Modal>
  );
};

export default ShiftModal;
