import React, { useState, useRef } from 'react';
import { MessageCircle, X, Camera, Loader2 } from 'lucide-react';
import { toBlob } from 'html-to-image';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';

const FeedbackBubble = () => {
  const { user, organization } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const popoverRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!description.trim()) {
      toast.error('Por favor ingresa una descripción del problema.');
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading('Capturando pantalla y enviando reporte...');

    try {
      // 1. Hide the bubble temporarily for the screenshot
      if (popoverRef.current) {
        popoverRef.current.style.display = 'none';
      }

      // 2. Take screenshot
      const blob = await toBlob(document.body, {
        cacheBust: true,
      });

      // Show the bubble again
      if (popoverRef.current) {
        popoverRef.current.style.display = 'block';
      }

      if (!blob) throw new Error('No se pudo generar la captura.');

      const fileName = `screenshots/${user?.id}-${Date.now()}.png`;

      // 3. Upload screenshot to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('images')
        .upload(fileName, blob, {
          contentType: 'image/png',
          cacheControl: '3600',
        });

      if (uploadError) throw uploadError;

      // 4. Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('images')
        .getPublicUrl(fileName);

      // 5. Insert feedback record
      const { error: insertError } = await supabase
        .from('app_feedback')
        .insert({
          organization_id: organization?.id || null,
          created_by: user?.id,
          description: description,
          image_url: publicUrl,
        });

      if (insertError) throw insertError;

      toast.success('Reporte enviado correctamente.', { id: toastId });
      setIsOpen(false);
      setDescription('');
    } catch (error) {
      console.error('Error submitting feedback:', error);
      toast.error('Hubo un error al enviar el reporte. Intenta de nuevo.', { id: toastId });
      if (popoverRef.current) {
        popoverRef.current.style.display = 'block';
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end" ref={popoverRef}>
      {isOpen && (
        <div className="mb-4 w-80 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden animate-in slide-in-from-bottom-5">
          <div className="bg-gray-900 px-4 py-3 flex justify-between items-center">
            <h3 className="text-white font-medium flex items-center gap-2">
              <Camera size={16} />
              Reportar Problema
            </h3>
            <button 
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="p-4">
            <p className="text-sm text-gray-600 mb-3">
              Describe el problema. Se tomará una captura de pantalla automáticamente.
            </p>
            <textarea
              className="w-full text-sm p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-black focus:border-black resize-none"
              rows={4}
              placeholder="¿Qué problema encontraste?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting}
            />
            <button
              type="submit"
              disabled={isSubmitting || !description.trim()}
              className="mt-3 w-full bg-black text-white py-2 px-4 rounded-md font-medium text-sm hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Enviando...
                </>
              ) : (
                'Enviar Reporte'
              )}
            </button>
          </form>
        </div>
      )}
      
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="bg-black text-white p-3 rounded-full shadow-lg hover:bg-gray-800 transition-transform hover:scale-105"
          title="Reportar problema"
        >
          <MessageCircle size={24} />
        </button>
      )}
    </div>
  );
};

export default FeedbackBubble;
