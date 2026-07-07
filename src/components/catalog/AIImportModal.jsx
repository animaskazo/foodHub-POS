import React, { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Upload, Key, Sparkles, CheckCircle2 } from 'lucide-react';
import { extractMenuFromImage } from '../../services/aiService';
import { processAndSaveMenu } from '../../services/importService';
import { toast } from 'sonner';

const AIImportModal = ({ isOpen, onClose, onSuccess }) => {
  const [step, setStep] = useState('upload'); // upload, processing, preview, saving
  const [apiKey, setApiKey] = useState('');
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [extractedData, setExtractedData] = useState(null);

  useEffect(() => {
    const savedKey = localStorage.getItem('claude_api_key');
    if (savedKey) setApiKey(savedKey);
  }, []);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreviewUrl(URL.createObjectURL(selectedFile));
    }
  };

  const handleAnalyze = async () => {
    if (!apiKey) {
      toast.error("Necesitas ingresar tu API Key de Claude");
      return;
    }
    if (!file) {
      toast.error("Necesitas subir una imagen del menú");
      return;
    }

    localStorage.setItem('claude_api_key', apiKey);
    setStep('processing');

    try {
      const data = await extractMenuFromImage(file, apiKey);
      setExtractedData(data);
      setStep('preview');
    } catch (error) {
      toast.error(error.message);
      setStep('upload');
    }
  };

  const handleSave = async () => {
    if (!extractedData) return;
    setStep('saving');
    
    try {
      await processAndSaveMenu(extractedData);
      toast.success("Menú importado exitosamente");
      onSuccess?.();
      onClose();
    } catch (error) {
      toast.error("Error al guardar en la base de datos");
      setStep('preview');
    }
  };

  const reset = () => {
    setStep('upload');
    setFile(null);
    setPreviewUrl('');
    setExtractedData(null);
  };

  useEffect(() => {
    if (!isOpen) {
      // Reset state on close after a small delay to allow animation
      setTimeout(reset, 300);
    }
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={step === 'processing' || step === 'saving' ? undefined : onClose} title="Importar Menú con IA ✨" maxWidth="max-w-3xl">
      <div className="p-6">
        {step === 'upload' && (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex gap-3">
              <Key className="text-blue-600 h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-blue-900 text-[15px]">API Key de Claude</h4>
                <p className="text-sm text-blue-700 mb-3 mt-1">
                  Tu clave se guarda localmente en tu navegador. Puedes obtenerla gratis en Anthropic.
                </p>
                <Input 
                  type="password" 
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="bg-white"
                />
              </div>
            </div>

            <div className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center hover:bg-gray-50 transition-colors">
              <input 
                type="file" 
                accept="image/*" 
                id="menu-upload"
                className="hidden"
                onChange={handleFileChange}
              />
              <label htmlFor="menu-upload" className="cursor-pointer flex flex-col items-center">
                {previewUrl ? (
                  <img src={previewUrl} alt="Preview" className="h-48 object-contain rounded-lg mb-4 shadow-sm" />
                ) : (
                  <div className="h-16 w-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                    <Upload className="h-8 w-8 text-gray-400" />
                  </div>
                )}
                <span className="font-semibold text-gray-700 text-lg">
                  {file ? file.name : 'Haz clic para subir una foto de tu menú'}
                </span>
                <span className="text-sm text-gray-500 mt-1">Formatos soportados: JPG, PNG, WEBP</span>
              </label>
            </div>

            <div className="flex justify-end pt-4">
              <Button onClick={handleAnalyze} disabled={!file || !apiKey} className="rounded-full bg-black text-white hover:bg-gray-800 px-8 py-6 text-[15px]">
                <Sparkles className="mr-2 h-5 w-5" /> Analizar Menú
              </Button>
            </div>
          </div>
        )}

        {step === 'processing' && (
          <div className="py-20 flex flex-col items-center justify-center text-center">
            <Loader2 className="h-12 w-12 text-blue-600 animate-spin mb-6" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">La IA está leyendo tu menú...</h3>
            <p className="text-gray-500 max-w-sm">
              Claude está identificando categorías, productos, descripciones e ingredientes extra. Esto puede tomar unos segundos.
            </p>
          </div>
        )}

        {step === 'preview' && extractedData && (
          <div className="space-y-6">
            <div className="bg-green-50 border border-green-100 p-4 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
                <div>
                  <h4 className="font-semibold text-green-900">¡Análisis completado!</h4>
                  <p className="text-sm text-green-700">Por favor, revisa que la estructura sea correcta antes de guardar.</p>
                </div>
              </div>
              <div className="flex gap-4 text-center">
                <div>
                  <div className="font-bold text-xl text-green-900">{extractedData.categories?.length || 0}</div>
                  <div className="text-[11px] font-medium text-green-700 uppercase tracking-wider">Categorías</div>
                </div>
                <div>
                  <div className="font-bold text-xl text-green-900">{extractedData.products?.length || 0}</div>
                  <div className="text-[11px] font-medium text-green-700 uppercase tracking-wider">Productos</div>
                </div>
                <div>
                  <div className="font-bold text-xl text-green-900">{extractedData.ingredients?.length || 0}</div>
                  <div className="text-[11px] font-medium text-green-700 uppercase tracking-wider">Ingredientes</div>
                </div>
              </div>
            </div>

            <div className="max-h-[400px] overflow-y-auto pr-2 space-y-6">
              {extractedData.ingredients && extractedData.ingredients.length > 0 && (
                <div>
                  <h5 className="font-bold text-[15px] mb-3 border-b pb-2">Ingredientes Extra Identificados</h5>
                  <div className="flex flex-wrap gap-2">
                    {extractedData.ingredients.map((ing, idx) => (
                      <span key={idx} className="px-3 py-1 bg-gray-100 rounded-full text-sm font-medium text-gray-700">
                        {ing.name} <span className="text-gray-400">(${ing.price})</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {extractedData.categories?.map((cat, idx) => {
                const catProducts = extractedData.products?.filter(p => p.category === cat) || [];
                return (
                  <div key={idx} className="bg-white border rounded-xl overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3 border-b">
                      <h5 className="font-bold text-gray-900">{cat} <span className="text-gray-400 font-normal ml-2">({catProducts.length})</span></h5>
                    </div>
                    <div className="divide-y">
                      {catProducts.length === 0 ? (
                        <div className="p-4 text-sm text-gray-400 italic">No se encontraron productos para esta categoría.</div>
                      ) : (
                        catProducts.map((prod, pIdx) => (
                          <div key={pIdx} className="p-4 flex justify-between gap-4">
                            <div>
                              <div className="font-semibold text-gray-900">{prod.name}</div>
                              {prod.description && <div className="text-sm text-gray-500 mt-1">{prod.description}</div>}
                              {prod.ingredients && prod.ingredients.length > 0 && (
                                <div className="text-[12px] text-gray-400 mt-1.5 flex gap-1 flex-wrap">
                                  {prod.ingredients.map((ing, iIdx) => (
                                    <span key={iIdx} className="bg-gray-100 px-2 py-0.5 rounded">{ing}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="font-bold text-gray-900 whitespace-nowrap">
                              ${prod.price?.toLocaleString('es-CL')}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button onClick={() => setStep('upload')} variant="outline" className="rounded-full px-6">
                Descartar y reintentar
              </Button>
              <Button onClick={handleSave} className="rounded-full bg-black text-white hover:bg-gray-800 px-8">
                Confirmar y Guardar
              </Button>
            </div>
          </div>
        )}

        {step === 'saving' && (
          <div className="py-20 flex flex-col items-center justify-center text-center">
            <Loader2 className="h-12 w-12 text-blue-600 animate-spin mb-6" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">Guardando en tu base de datos...</h3>
            <p className="text-gray-500 max-w-sm">
              Estamos creando todas las categorías, ingredientes y productos automáticamente.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default AIImportModal;
