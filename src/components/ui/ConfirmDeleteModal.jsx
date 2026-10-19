import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from "@/components/ui/button";

const ConfirmDeleteModal = ({ isOpen, onClose, onConfirm, title, description, isDeleting }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 text-center">
          <AlertTriangle className="mx-auto mb-4 h-8 w-8" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">{title}</h2>
          <p className="text-gray-500 mb-6">{description}</p>
          
          <div className="flex gap-3 justify-center">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={onClose}
              disabled={isDeleting}
            >
              Cancelar
            </Button>
            <Button 
              variant="destructive-solid"
              className="flex-1"
              onClick={onConfirm}
              loading={isDeleting}
              loadingText="Eliminando…"
            >
              Sí, eliminar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDeleteModal;
