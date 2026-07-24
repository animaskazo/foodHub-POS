import React from 'react';
import { X, Loader2 } from 'lucide-react';
import { Button } from './button';

const EditorHeader = ({ 
  title, 
  onClose, 
  onSave, 
  isSaving, 
  isLoading, 
  isUploadingImage, 
  hasChanges,
  saveDisabled
}) => {
  return (
    <header className="flex items-center justify-between px-4 sm:px-6 py-4 bg-white/95 backdrop-blur-sm border-b border-gray-100 fixed top-0 left-0 right-0 z-50">
      {/* Izquierda: Botón de cerrar */}
      <div className="flex items-center justify-start flex-1">
        <button 
          onClick={onClose}
          className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors text-gray-500 shrink-0"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      
      {/* Centro: Título fijo */}
      <div className="flex-none absolute left-1/2 -translate-x-1/2 text-center whitespace-nowrap overflow-hidden text-ellipsis max-w-[50%]">
        <h1 className="text-[17px] font-bold text-gray-800">
          {title}
        </h1>
      </div>
      
      {/* Derecha: Botón guardar y estado */}
      <div className="flex items-center gap-4 justify-end flex-1">
        {hasChanges && (
          <span className="text-xs text-amber-600 font-bold animate-pulse select-none hidden md:inline">
            Tienes cambios sin guardar
          </span>
        )}
        <Button
          onClick={onSave}
          disabled={!hasChanges || isSaving || isLoading || isUploadingImage || saveDisabled}
          className="px-6 font-semibold"
        >
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {isSaving ? 'Guardando...' : 'Guardar'}
        </Button>
      </div>
    </header>
  );
};

export default EditorHeader;
