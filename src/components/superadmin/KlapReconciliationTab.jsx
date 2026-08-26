import React, { useState, useRef, useMemo } from 'react';
import { Upload, FileText, CheckCircle2, AlertCircle, XCircle, Search, CreditCard, DollarSign, Save, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

const KlapReconciliationTab = ({ orders, onReconciled }) => {
  const [csvData, setCsvData] = useState(null);
  const [fileName, setFileName] = useState('');
  const [search, setSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws, { raw: false });
      
      // Clean up headers to lower case and trim for robust matching
      const cleanedData = data.map(row => {
        const cleanRow = {};
        for (const key in row) {
          if (Object.prototype.hasOwnProperty.call(row, key)) {
            const cleanKey = key.trim().toLowerCase();
            cleanRow[cleanKey] = row[key];
          }
        }
        return cleanRow;
      });
      
      setCsvData(cleanedData);
    };
    reader.readAsBinaryString(file);
  };

  const { matchedOrders, totalBruto, totalLiquidado, totalComision } = useMemo(() => {
    let matched = [];
    let bruto = 0;
    let liquidado = 0;
    let comision = 0;

    // Filter klap orders (online_gateway or klap)
    const klapOrders = orders.filter(o => 
      o.payments?.some(p => p.method === 'online_gateway' || p.method === 'klap' || p.reference_code)
    );

    const filteredKlapOrders = klapOrders.filter(o => {
      const q = search.toLowerCase();
      const ref = o.payments?.[0]?.reference_code?.toLowerCase() || '';
      return o.order_number.toString().includes(q) || ref.includes(q);
    });

    matched = filteredKlapOrders.map(order => {
      const refCode = order.payments?.[0]?.reference_code;
      let match = null;

      if (csvData) {
        // Pass 1. Match by 'codigo_autorizacion'
        if (refCode) {
          match = csvData.find(row => {
            if (row._used) return false;
            const csvAuth = row['codigo_autorizacion'] || row['codigo autorizacion'];
            return csvAuth && String(csvAuth).trim().toLowerCase() === String(refCode).trim().toLowerCase();
          });
        }

        // Pass 2. Match by Amount AND Date
        if (!match) {
          match = csvData.find(row => {
            if (row._used) return false;
            
            let rawMonto = String(row['monto_venta(+)'] || row['total'] || '0');
            rawMonto = rawMonto.replace(/\./g, '').split(',')[0]; 
            const csvMonto = parseFloat(rawMonto);
            
            if (csvMonto !== Number(order.total)) return false;

            let csvFecha = String(row['fecha_venta'] || row['fecha venta'] || '');
            
            // Si la fecha de Excel viene como número de serie (ej: 45200)
            if (!isNaN(Number(csvFecha)) && csvFecha.length === 5) {
               const excelEpoch = new Date(1900, 0, -1);
               const jsDate = new Date(excelEpoch.getTime() + Number(csvFecha) * 86400000);
               csvFecha = jsDate.toISOString();
            }

            const orderDate = new Date(order.created_at);
            const d = String(orderDate.getDate()).padStart(2, '0');
            const m = String(orderDate.getMonth() + 1).padStart(2, '0');
            const yyyy = orderDate.getFullYear();
            const yy = String(yyyy).slice(2);
            
            const d1 = String(orderDate.getDate());
            const m1 = String(orderDate.getMonth() + 1);

            const formats = [
              `${yyyy}-${m}-${d}`,
              `${d}-${m}-${yyyy}`,
              `${d}/${m}/${yyyy}`,
              `${m}/${d}/${yyyy}`,
              `${m}/${d}/${yy}`,
              `${d}-${m}-${yy}`,
              `${m1}/${d1}/${yy}`,
              `${m1}/${d1}/${yyyy}`
            ];
            
            return formats.some(f => csvFecha.includes(f));
          });
        }
        
        // Pass 3 (Monto solamente) fue eliminada a petición del usuario para ser más estrictos.
      }

      if (match) {
        match._used = true; // Evita que dos pedidos reclamen la misma línea del Excel
      }

      const getVal = (val) => {
        if (!val) return 0;
        return parseFloat(String(val).replace(/\./g, '').split(',')[0]) || 0;
      };

      const csvMontoPagado = match ? getVal(match['monto_pagado'] || match['monto pagado']) : null;
      const csvComision = match ? getVal(match['comision(-)'] || match['comision']) : null;
      const csvMontoBruto = match ? getVal(match['monto_venta(+)'] || match['total']) : null;

      if (match) {
        bruto += Number(order.total);
        liquidado += csvMontoPagado || 0;
        comision += csvComision || 0;
      }

      return {
        ...order,
        klapMatch: match,
        csvMontoPagado,
        csvComision,
        csvMontoBruto
      };
    });

      // Clean up _used flag for subsequent searches (so changing search input works correctly)
      // but keep a copy for the UI
      if (csvData) {
         csvData.forEach(row => {
           row._used_in_ui = row._used;
           delete row._used;
         });
      }

    return { matchedOrders: matched, totalBruto: bruto, totalLiquidado: liquidado, totalComision: comision };
  }, [orders, csvData, search]);

  const downloadReport = () => {
    if (!matchedOrders || matchedOrders.length === 0) return;
    
    const exportData = matchedOrders.map(order => ({
      'ID Pedido': order.order_number,
      'Fecha POS': new Date(order.created_at).toLocaleString('es-CL'),
      'Klap Auth ID': order.payments?.[0]?.reference_code || 'Sin ID',
      'Monto POS': order.total,
      'Klap Bruto': order.klapMatch ? order.csvMontoBruto : 0,
      'Klap Liquidado': order.klapMatch ? order.csvMontoPagado : 0,
      'Klap Comisión': order.klapMatch ? order.csvComision : 0,
      'Estado': order.klapMatch ? 'Conciliado' : (csvData ? 'Falta en Klap' : 'Pendiente')
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reporte Klap");
    XLSX.writeFile(wb, `Reporte_Conciliacion_Klap_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const pendingToReconcile = useMemo(() => {
    if (!matchedOrders) return [];
    return matchedOrders.filter(o => o.klapMatch && !o.is_klap_reconciled);
  }, [matchedOrders]);

  const handleMarkAsReconciled = async () => {
    if (pendingToReconcile.length === 0) return;
    setIsSaving(true);
    try {
      const idsToUpdate = pendingToReconcile.map(o => o.id);
      
      const { error } = await supabase
        .from('orders')
        .update({ is_klap_reconciled: true })
        .in('id', idsToUpdate);

      if (error) throw error;

      toast.success(`Se han marcado ${idsToUpdate.length} pedidos como abonados.`);
      
      if (onReconciled) {
        onReconciled();
      }
    } catch (err) {
      console.error('Error marking as reconciled:', err);
      toast.error('Error al marcar los pedidos. Intenta nuevamente.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 py-4 animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl border border-gray-200">
        <div>
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            Conciliación Klap
          </h3>
          <p className="text-sm text-gray-500 mt-1">Sube la liquidación oficial de Klap (CSV/Excel) para cruzar los montos liquidados con tus pedidos.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <input 
            type="file" 
            accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
            className="hidden" 
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          <Button 
            onClick={() => fileInputRef.current?.click()}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-2 shadow-sm"
          >
            <Upload className="h-4 w-4" />
            {csvData ? 'Cambiar Archivo' : 'Subir Liquidación'}
          </Button>

          {csvData && (
            <Button 
              onClick={downloadReport}
              variant="outline"
              className="flex items-center gap-2 font-medium"
            >
              Descargar Reporte
            </Button>
          )}
        </div>
      </div>

      {csvData && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border rounded-xl p-5 shadow-sm">
            <p className="text-sm font-medium text-gray-500 mb-1">Total Bruto Conciliado</p>
            <p className="text-2xl font-black text-gray-900">${totalBruto.toLocaleString('es-CL')}</p>
          </div>
          <div className="bg-red-50 border border-red-100 rounded-xl p-5 shadow-sm">
            <p className="text-sm font-medium text-red-600 mb-1">Total Comisiones (-)</p>
            <p className="text-2xl font-black text-red-700">${totalComision.toLocaleString('es-CL')}</p>
          </div>
          <div className="bg-green-50 border border-green-100 rounded-xl p-5 shadow-sm">
            <p className="text-sm font-medium text-green-700 mb-1">Total Liquidado por Klap</p>
            <div className="flex items-center gap-2">
              <DollarSign className="h-6 w-6 text-green-600" />
              <p className="text-3xl font-black text-green-700">${totalLiquidado.toLocaleString('es-CL')}</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
          <h4 className="font-semibold text-gray-800">Detalle de Transacciones</h4>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Buscar pedido o Klap ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-4 py-1.5 border border-gray-200 rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-6 py-3 text-xs uppercase tracking-wider font-semibold text-gray-500">POS Order</th>
                <th className="px-6 py-3 text-xs uppercase tracking-wider font-semibold text-gray-500">Fecha</th>
                <th className="px-6 py-3 text-xs uppercase tracking-wider font-semibold text-gray-500">Klap Auth ID</th>
                <th className="px-6 py-3 text-xs uppercase tracking-wider font-semibold text-gray-500">Monto POS</th>
                <th className="px-6 py-3 text-xs uppercase tracking-wider font-semibold text-gray-500 bg-blue-50">Klap Bruto</th>
                <th className="px-6 py-3 text-xs uppercase tracking-wider font-semibold text-gray-500 bg-green-50">Klap Liquidado</th>
                <th className="px-6 py-3 text-xs uppercase tracking-wider font-semibold text-gray-500">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {matchedOrders.map(order => {
                const refCode = order.payments?.[0]?.reference_code;
                const date = new Date(order.created_at).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
                const isMatched = !!order.klapMatch;
                
                return (
                  <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3 font-semibold text-gray-900">#{order.order_number}</td>
                    <td className="px-6 py-3 text-sm text-gray-500">{date}</td>
                    <td className="px-6 py-3 text-sm font-medium text-gray-700">
                      {refCode ? `****${String(refCode).slice(-4)}` : <span className="text-gray-400 italic">Sin ID</span>}
                    </td>
                    <td className="px-6 py-3 text-sm font-bold text-gray-900">
                      ${Number(order.total).toLocaleString('es-CL')}
                    </td>
                    
                    {isMatched ? (
                      <>
                        <td className="px-6 py-3 text-sm text-gray-700 bg-blue-50/30">
                          ${Number(order.csvMontoBruto).toLocaleString('es-CL')}
                        </td>
                        <td className="px-6 py-3 text-sm font-bold text-green-700 bg-green-50/50">
                          ${Number(order.csvMontoPagado).toLocaleString('es-CL')}
                        </td>
                        <td className="px-6 py-3">
                          {order.is_klap_reconciled ? (
                            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 flex items-center gap-1 w-fit border-none">
                              <CheckCircle2 className="h-3 w-3" />
                              Ya Abonado
                            </Badge>
                          ) : (
                            <Badge className="bg-green-100 text-green-800 hover:bg-green-100 flex items-center gap-1 w-fit border-none">
                              <CheckCircle2 className="h-3 w-3" />
                              Conciliado
                            </Badge>
                          )}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-6 py-3 text-sm text-gray-400 bg-blue-50/10">-</td>
                        <td className="px-6 py-3 text-sm text-gray-400 bg-green-50/10">-</td>
                        <td className="px-6 py-3">
                          {order.is_klap_reconciled ? (
                            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 flex items-center gap-1 w-fit border-none">
                              <CheckCircle2 className="h-3 w-3" />
                              Ya Abonado
                            </Badge>
                          ) : csvData ? (
                            <Badge className="bg-red-50 text-red-600 hover:bg-red-50 flex items-center gap-1 w-fit border border-red-100">
                              <XCircle className="h-3 w-3" />
                              Falta en Klap
                            </Badge>
                          ) : (
                            <Badge className="bg-gray-100 text-gray-500 hover:bg-gray-100 flex items-center gap-1 w-fit border border-gray-200">
                              <AlertCircle className="h-3 w-3" />
                              Esperando CSV
                            </Badge>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
              {matchedOrders.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    No hay transacciones de Klap en este negocio.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {pendingToReconcile.length > 0 && (
          <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end">
            <Button 
              onClick={handleMarkAsReconciled}
              disabled={isSaving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-2 shadow-sm"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Marcar {pendingToReconcile.length} como Abonados
            </Button>
          </div>
        )}
      </div>

      {csvData && csvData.some(row => !row._used_in_ui) && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-5 shadow-sm mt-6">
          <h4 className="font-bold text-orange-800 mb-2 flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Transacciones de Klap sin coincidencia en el POS
          </h4>
          <p className="text-sm text-orange-700 mb-4">
            Las siguientes filas del archivo de Klap no encontraron ningún pedido correspondiente en el POS. Verifica si los montos coinciden o si el pedido fue eliminado.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-orange-200">
                  <th className="px-4 py-2 font-semibold text-orange-800">Cód. Autorización</th>
                  <th className="px-4 py-2 font-semibold text-orange-800">Monto</th>
                  <th className="px-4 py-2 font-semibold text-orange-800">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {csvData.filter(row => !row._used_in_ui).map((row, idx) => (
                  <tr key={idx} className="border-b border-orange-100 last:border-0">
                    <td className="px-4 py-2 text-orange-900 font-mono">
                      {row['codigo_autorizacion'] || row['codigo autorizacion'] || 'N/A'}
                    </td>
                    <td className="px-4 py-2 text-orange-900 font-bold">
                      ${Number(String(row['monto_venta(+)'] || row['total'] || '0').replace(/\./g, '').split(',')[0]).toLocaleString('es-CL')}
                    </td>
                    <td className="px-4 py-2 text-orange-900">
                      {row['fecha_venta'] || row['fecha venta'] || 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default KlapReconciliationTab;
