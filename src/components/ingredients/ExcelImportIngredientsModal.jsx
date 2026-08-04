import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, Download, Loader2, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import Modal from '../ui/Modal';
import IngredientIcon from '../ui/IngredientIcon';
import { parseIngredientsExcel, bulkImportIngredients, downloadIngredientExcelTemplate } from '../../services/importService';
import { getFirstOrganizationId } from '../../services/catalogService';
import { toast } from 'sonner';

const ExcelImportIngredientsModal = ({ isOpen, onClose, onSuccess }) => {
  const [file, setFile] = useState(null);
  const [parsedData, setParsedData] = useState([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const resetState = () => {
    setFile(null);
    setParsedData([]);
    setIsParsing(false);
    setIsImporting(false);
    setDragActive(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const processFile = async (selectedFile) => {
    if (!selectedFile) return;
    
    const isExcelOrCsv = selectedFile.name.endsWith('.xlsx') || 
                         selectedFile.name.endsWith('.xls') || 
                         selectedFile.name.endsWith('.csv');
                         
    if (!isExcelOrCsv) {
      toast.error('Por favor selecciona un archivo de Excel (.xlsx, .xls) o .csv válido.');
      return;
    }

    setFile(selectedFile);
    setIsParsing(true);

    try {
      const results = await parseIngredientsExcel(selectedFile);
      setParsedData(results);
      if (results.length === 0) {
        toast.warning('No se encontraron registros en el archivo.');
      } else {
        const validCount = results.filter(r => r.isValid).length;
        toast.success(`Se leyeron ${results.length} filas (${validCount} válidas).`);
      }
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Error al procesar el archivo Excel.');
      setFile(null);
      setParsedData([]);
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    processFile(selectedFile);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleConfirmImport = async () => {
    const validItems = parsedData.filter(i => i.isValid);
    if (validItems.length === 0) {
      toast.error('No hay ingrediente(s) válido(s) para importar.');
      return;
    }

    setIsImporting(true);
    try {
      const orgId = await getFirstOrganizationId();
      const result = await bulkImportIngredients(orgId, validItems);

      if (result.failCount === 0) {
        toast.success(`¡Éxito! Se importaron ${result.successCount} ingredientes.`);
      } else {
        toast.warning(`Se importaron ${result.successCount} ingrediente(s). Ocurrieron ${result.failCount} error(es).`);
      }

      if (onSuccess) {
        onSuccess();
      }
      handleClose();
    } catch (err) {
      console.error(err);
      toast.error('Error al realizar la importación masiva.');
    } finally {
      setIsImporting(false);
    }
  };

  const validCount = parsedData.filter(i => i.isValid).length;
  const invalidCount = parsedData.length - validCount;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Importar Ingredientes desde Excel"
      maxWidth="max-w-4xl"
    >
      <div className="flex flex-col h-full max-h-[80vh]">
        {/* Header bar / Template action */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0">
          <div>
            <p className="text-sm font-medium text-gray-700">
              Carga tu archivo `.xlsx`, `.xls` o `.csv` con la lista de ingredientes.
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Campos soportados: Nombre, Precio Adicional, Unidad, Porción, Stock Inicial, Umbral Mínimo.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={downloadIngredientExcelTemplate}
            className="shrink-0 bg-white hover:bg-gray-100 border-gray-300 text-gray-700"
          >
            <Download className="h-4 w-4 mr-2 text-green-600" />
            Descargar Plantilla Excel
          </Button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {!file ? (
            /* Dropzone */
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition-colors flex flex-col items-center justify-center cursor-pointer ${
                dragActive
                  ? 'border-orange-500 bg-orange-50/50'
                  : 'border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50'
              }`}
              onClick={() => document.getElementById('excel-ingredient-input')?.click()}
            >
              <input
                id="excel-ingredient-input"
                type="file"
                accept=".xlsx, .xls, .csv"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="h-16 w-16 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center mb-4">
                <FileSpreadsheet className="h-8 w-8" />
              </div>
              <p className="text-base font-semibold text-gray-900 mb-1">
                Arrastra tu archivo Excel aquí o haz clic para examinar
              </p>
              <p className="text-xs text-gray-500">
                Archivos permitidos: .xlsx, .xls, .csv
              </p>
            </div>
          ) : isParsing ? (
            /* Loading parse state */
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <Loader2 className="h-10 w-10 animate-spin text-orange-500 mb-3" />
              <p className="text-sm font-medium text-gray-700">Leyendo y analizando archivo Excel...</p>
            </div>
          ) : (
            /* Parsed Preview Table */
            <div className="space-y-4">
              {/* File Info Bar */}
              <div className="flex items-center justify-between bg-blue-50/70 border border-blue-200 rounded-xl px-4 py-3">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="h-5 w-5 text-blue-600 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-blue-900">{file.name}</p>
                    <p className="text-xs text-blue-700">
                      Total: {parsedData.length} ingrediente(s) • <span className="font-semibold text-green-700">{validCount} válidos</span>
                      {invalidCount > 0 && <span className="font-semibold text-red-600"> • {invalidCount} con errores</span>}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetState}
                  className="text-blue-700 hover:text-blue-900 hover:bg-blue-100"
                >
                  <X className="h-4 w-4 mr-1" /> Cambiar archivo
                </Button>
              </div>

              {/* Table Preview */}
              <div className="border border-gray-200 rounded-xl overflow-hidden max-h-[350px] overflow-y-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-100 border-b border-gray-200 text-gray-600 font-medium sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-2.5 w-12 text-center">#</th>
                      <th className="px-4 py-2.5 font-medium">Ingrediente</th>
                      <th className="px-4 py-2.5 font-medium">Precio Ext.</th>
                      <th className="px-4 py-2.5 font-medium">Unidad</th>
                      <th className="px-4 py-2.5 font-medium">Porción</th>
                      <th className="px-4 py-2.5 font-medium">Stock Inicial</th>
                      <th className="px-4 py-2.5 font-medium">Umbral</th>
                      <th className="px-4 py-2.5 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {parsedData.map((item, idx) => (
                      <tr
                        key={idx}
                        className={`hover:bg-gray-50 ${!item.isValid ? 'bg-red-50/40' : ''}`}
                      >
                        <td className="px-4 py-2.5 text-center text-xs text-gray-400 font-mono">
                          {item.rowIndex}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-gray-900">
                          <div className="flex items-center gap-2">
                            <IngredientIcon icon={item.icon} className="h-5 w-5 text-gray-700 shrink-0" />
                            <span>{item.name || <span className="text-red-500 italic">Sin nombre</span>}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-gray-700">
                          ${item.price}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600 uppercase text-xs font-semibold">
                          {item.unit}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">
                          {item.portion_quantity > 0 ? `${item.portion_quantity} ${item.unit}` : '-'}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-gray-800">
                          {item.stock_quantity} {item.unit}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">
                          {item.low_stock_threshold ? `${item.low_stock_threshold}%` : '-'}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {item.isValid ? (
                            <span className="inline-flex items-center text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-green-600" /> Listo
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full border border-red-200" title={item.error}>
                              <AlertTriangle className="h-3.5 w-3.5 mr-1 text-red-600" /> {item.error}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 bg-gray-50 border-t border-gray-200 flex items-center justify-between shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isImporting}
          >
            Cancelar
          </Button>

          {file && !isParsing && (
            <Button
              type="button"
              onClick={handleConfirmImport}
              disabled={isImporting || validCount === 0}
              className="bg-orange-600 hover:bg-orange-700 text-white font-semibold"
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Importando ingredientes...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Importar {validCount} ingrediente(s)
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default ExcelImportIngredientsModal;
