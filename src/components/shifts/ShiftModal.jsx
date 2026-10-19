import { ChevronDown, CircleCheck, CircleX, TriangleAlert, Loader2, DollarSign, Store } from 'lucide-react';
import React, { useState, useEffect, useRef } from 'react';
import Modal from '../ui/Modal';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { openShift, closeShift, getShiftSalesBreakdown } from '../../services/shiftService';
import { printShiftReport } from '../../services/printerService';
import { useAuth } from '../AuthContext';
import { toast } from 'sonner';


const formatCurrency = (value) => '$' + Number(value || 0).toLocaleString('es-CL');
const parseCurrency = (str) => Number((str || '').replace(/\D/g, '')) || 0;

const formatDateTime = (isoString) => {
  const date = new Date(isoString);
  return date.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const ShiftCloseView = ({ shift, salesData, balance, onBalanceChange, loading, fetchingData }) => {
  const startingBalance = Number(shift?.starting_balance || 0);
  const cashSales = Number(salesData?.cashSales || 0);
  const cardSales = Number(salesData?.cardSales || 0);
  const transferSales = Number(salesData?.transferSales || 0);
  const onlineSales = Number(salesData?.onlineSales || 0);
  const otherSales = Number(salesData?.otherSales || 0);
  const electronicSales = cardSales + transferSales + onlineSales + otherSales;
  const totalSales = Number(salesData?.totalSales || 0);
  const expectedCashInRegister = startingBalance + cashSales;
  const reportedBalance = parseCurrency(balance);
  const difference = reportedBalance - expectedCashInRegister;
  const isShort = difference < 0;
  const isOver = difference > 0;
  const isExact = difference === 0 && reportedBalance > 0;
  const hasInput = balance.trim().length > 0;

  return (
    <div className="space-y-4">
      {/* Turno context - one line */}
      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 px-1">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
          <span>{formatDateTime(shift?.start_time)} → {formatDateTime(new Date().toISOString())}</span>
        </span>
        <span>{shift?.opened_by_name || '—'}</span>
        <span className="text-gray-400">·</span>
        <span>{salesData?.orderCount || 0} órdenes</span>
      </div>

      {/* Expected amount - prominent */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider">Esperado en caja</p>
            <p className="text-2xl font-bold tabular-nums text-gray-900">{formatCurrency(expectedCashInRegister)}</p>
          </div>
          <div className="text-right text-sm text-gray-500">
            <p>Inicial: <span className="font-medium tabular-nums">{formatCurrency(startingBalance)}</span></p>
            <p>+ Efectivo: <span className="font-medium tabular-nums">{formatCurrency(cashSales)}</span></p>
          </div>
        </div>
      </div>

      {/* Sales breakdown - collapsible/simple */}
      <details className="group border border-gray-100 rounded-xl overflow-hidden">
        <summary className="flex items-center justify-between p-3 bg-gray-50 cursor-pointer list-none">
          <span className="text-sm font-medium text-gray-700">Desglose de ventas</span>
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="p-3 space-y-2 border-t border-gray-100 bg-white">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex justify-between py-1"><span className="text-gray-500">Efectivo</span><span className="font-medium tabular-nums">{formatCurrency(cashSales)}</span></div>
            <div className="flex justify-between py-1"><span className="text-gray-500">Tarjeta</span><span className="font-medium tabular-nums">{formatCurrency(cardSales)}</span></div>
            <div className="flex justify-between py-1"><span className="text-gray-500">Transferencia</span><span className="font-medium tabular-nums">{formatCurrency(transferSales)}</span></div>
            <div className="flex justify-between py-1"><span className="text-gray-500">Online</span><span className="font-medium tabular-nums">{formatCurrency(onlineSales)}</span></div>
            {otherSales > 0 && <div className="flex justify-between py-1"><span className="text-gray-500">Otros</span><span className="font-medium tabular-nums">{formatCurrency(otherSales)}</span></div>}
            <div className="flex justify-between py-1 border-t border-gray-100 font-semibold text-base"><span>Total</span><span className="tabular-nums">{formatCurrency(totalSales)}</span></div>
            <div className="flex justify-between py-1 text-gray-500"><span>Electrónico</span><span className="font-medium tabular-nums">{formatCurrency(electronicSales)}</span></div>
          </div>
        </div>
      </details>

      {/* Input - single, prominent */}
      <div className="relative">
        <label className="block text-sm font-semibold text-gray-700 mb-2">Efectivo contado <span className="text-normal font-normal text-gray-400">($)</span></label>
        <div className="relative">
          <DollarSign className="absolute inset-y-0 left-0 pointer-events-none h-6 w-6" />
          <Input
            type="text"
            value={balance}
            onChange={(e) => onBalanceChange(e.target.value.replace(/\D/g, ''))}
            className="pl-10 text-2xl font-bold h-14 text-center tabular-nums"
            placeholder="0"
            autoFocus
            disabled={fetchingData || loading}
            inputMode="numeric"
          />
        </div>
        {hasInput && (
          <p className="mt-2 text-sm text-gray-500 text-center">
            {reportedBalance === 0 ? 'Ingrese el monto contado' : `Diferencia con esperado: ${difference > 0 ? '+' : ''}${formatCurrency(difference)}`}
          </p>
        )}
      </div>

      {/* Live difference - the key UX element */}
      {hasInput && reportedBalance > 0 && (
        <div className={`rounded-xl p-4 text-center text-xl font-bold ${
          isExact ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' :
          isShort ? 'bg-red-50 border border-red-200 text-red-700' :
          'bg-amber-50 border border-amber-200 text-amber-700'
        }`}>
          <div className="flex items-center justify-center gap-2 mb-1">
            {isExact && <CircleCheck className="h-6 w-6" aria-hidden="true" />}
            {isShort && <CircleX className="h-6 w-6" aria-hidden="true" />}
            {isOver && <TriangleAlert className="h-6 w-6" aria-hidden="true" />}
            <span>{isExact ? 'Cuadre exacto' : isShort ? 'Faltante' : 'Sobrante'}</span>
          </div>
          <div className="text-2xl tabular-nums">{formatCurrency(Math.abs(difference))}</div>
        </div>
      )}

      {/* Quick actions - preset buttons */}
      {expectedCashInRegister > 0 && !hasInput && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            onClick={() => onBalanceChange(expectedCashInRegister.toLocaleString('es-CL'))}
            className="text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
           variant="outline" size="default">
            Usar esperado
          </Button>
          <Button
            type="button"
            onClick={() => onBalanceChange('0')}
            className="text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
           variant="outline" size="default">
            Sin efectivo
          </Button>
        </div>
      )}
    </div>
  );
};

const ShiftOpenView = ({ balance, onBalanceChange, loading, requireInput }) => (
  <div className="space-y-4 text-center">
    <Store className="mx-auto h-8 w-8" />
    <p className="text-gray-500">
      {requireInput
        ? 'Ingresa el monto de efectivo (sencillo) con el que inicias el turno.'
        : 'Se abrirá un nuevo turno de caja.'}
    </p>
    {requireInput && (
      <div className="relative max-w-xs mx-auto">
        <DollarSign className="absolute inset-y-0 left-0 pointer-events-none h-6 w-6" />
<Input
            type="text"
            value={balance}
            onChange={(e) => onBalanceChange(e.target.value.replace(/\D/g, ''))}
            className="pl-10 text-3xl font-bold h-16 text-center tabular-nums"
            placeholder="0"
            autoFocus
            disabled={loading}
            inputMode="numeric"
          />
      </div>
    )}
  </div>
);

const ShiftModal = ({
  isOpen,
  onClose,
  type = 'open',
  settings,
  organizationId,
  shiftId,
  totalSales = 0,
  onSuccess,
  currentShift,
  organization
}) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState('');
  const [shiftData, setShiftData] = useState(null);
  const [salesBreakdown, setSalesBreakdown] = useState(null);
  const [fetchingData, setFetchingData] = useState(false);
  const prevShiftIdRef = useRef(null);
  const fetchingRef = useRef(false);

  useEffect(() => {
    const shiftId = currentShift?.id;
    const shouldFetch = isOpen && type === 'close' && shiftId && organizationId && shiftId !== prevShiftIdRef.current && !fetchingRef.current;

    if (shouldFetch) {
      prevShiftIdRef.current = shiftId;
      fetchingRef.current = true;
      const fetchData = async () => {
        setFetchingData(true);
        try {
          setShiftData(currentShift);
          const breakdown = await getShiftSalesBreakdown(organizationId, currentShift.start_time);
          setSalesBreakdown(breakdown);
          if (settings?.require_ending_cash && balance === '' && !fetchingRef.current) {
            setBalance(breakdown.expectedCashInRegister.toLocaleString('es-CL'));
          }
        } catch (err) {
          console.error('[ShiftModal] Error fetching shift data:', err);
          toast.error(`Error: ${err?.message || 'No se pudo cargar el detalle del turno'}`);
        } finally {
          setFetchingData(false);
          fetchingRef.current = false;
        }
      };
      fetchData();
    } else if (type === 'open') {
      prevShiftIdRef.current = null;
      setShiftData(null);
      setSalesBreakdown(null);
      setBalance('');
    }
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, type, currentShift, organizationId, settings?.require_ending_cash]);

  const handleConfirm = async () => {
    if (!organizationId || !user?.id) return;
    setLoading(true);
    try {
      const numericBalance = parseCurrency(balance);

    if (type === 'open') {
      if (settings?.require_starting_cash && !balance) {
        toast.error('Debes ingresar el monto inicial');
        return;
      }
      await openShift(organizationId, numericBalance, user.id);
      toast.success('Caja abierta exitosamente');
    } else {
      if (settings?.require_ending_cash && !balance) {
        toast.error('Debes ingresar el monto final de caja');
        return;
      }
      const finalSalesData = salesBreakdown || { totalSales };
      const totalSalesAmount = finalSalesData.totalSales || totalSales;
      await closeShift(shiftId, numericBalance, numericBalance, totalSalesAmount, user.id);
      toast.success('Caja cerrada exitosamente');
      if (settings?.auto_print_z_report && shiftData && salesBreakdown) {
        try {
          toast.info('Imprimiendo reporte Z...');
          await printShiftReport({
            shift: shiftData,
            salesData: salesBreakdown,
            reportedBalance: numericBalance,
            organization,
            closedBy: user.id,
            closedAt: new Date().toISOString()
          });
          toast.success('Reporte Z impreso correctamente');
        } catch (printError) {
          console.error('[ShiftModal] Error printing Z report:', printError);
          const msg = printError?.message || String(printError);
          if (msg.includes('No hay impresora')) {
            toast.error('No hay impresora configurada. Ve a Ajustes > Impresoras.');
          } else if (msg.includes('Print server') || msg.includes('fetch')) {
            toast.error('Servidor de impresión no disponible. ¿Está corriendo el print server?');
          } else {
            toast.error(`Caja cerrada, pero falló la impresión: ${msg}`);
          }
        }
      }
    }
onSuccess();
      setBalance('');
    } catch (error) {
      console.error('[ShiftModal] Error confirmando turno:', error);
      toast.error(`No se pudo ${type === 'open' ? 'abrir' : 'cerrar'} la caja: ${error?.message || 'intenta nuevamente'}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const requireInput = type === 'open' ? settings?.require_starting_cash : settings?.require_ending_cash;
  const title = type === 'open' ? 'Abrir Caja' : 'Cerrar Caja';
  const actionLabel = type === 'open' ? 'Abrir Caja' : 'Cerrar Caja e Imprimir';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size={type === 'close' ? 'lg' : 'md'}>
      <div className="p-6 pb-4">
        {type === 'open' ? (
          <ShiftOpenView
            balance={balance}
            onBalanceChange={setBalance}
            loading={loading}
            requireInput={requireInput}
            settings={settings}
          />
        ) : (
          <>
            {fetchingData ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin" />
                <span className="ml-3 text-gray-600">Cargando turno...</span>
              </div>
            ) : shiftData && salesBreakdown ? (
              <ShiftCloseView
                shift={shiftData}
                salesData={salesBreakdown}
                balance={balance}
                onBalanceChange={setBalance}
                loading={loading}
                fetchingData={fetchingData}
              />
            ) : (
              <div className="text-center py-8 text-red-500">
                No se pudo cargar el turno. <Button onClick={onClose} className="underline" variant="ghost" size="default">Reintentar</Button>
              </div>
            )}
          </>
        )}

        <div className="flex justify-center gap-3 mt-6 pt-4 border-t border-gray-100">
          <Button
            variant="outline"
            size="lg"
            onClick={onClose}
            disabled={loading || fetchingData}
            className="min-w-[120px]"
          >
            Cancelar
          </Button>
          <Button
            size="lg"
            variant={type === 'close' ? 'destructive' : 'default'}
            className="min-w-[160px]"
            onClick={handleConfirm}
            disabled={loading || fetchingData || (requireInput && !balance.trim())}
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
            {actionLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ShiftModal;
