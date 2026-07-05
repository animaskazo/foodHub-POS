import React, { useState, useRef, useEffect } from 'react';
import { MoreHorizontal, Trash2, Copy } from 'lucide-react';
import { Button } from './button';

const ActionMenu = ({ onDelete, onDuplicate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-8 w-8 text-gray-400 hover:text-gray-900 rounded-full hover:bg-gray-100 focus:ring-0 focus:outline-none"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
      >
        <MoreHorizontal className="h-5 w-5" />
      </Button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 z-50 overflow-hidden transform origin-top-right transition-all">
          <div className="py-1">
            {onDuplicate && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                  onDuplicate();
                }}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 active:bg-gray-100"
              >
                <Copy className="h-4 w-4 text-gray-400" />
                Duplicar
              </button>
            )}
            
            {onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                  onDelete();
                }}
                className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-3 font-medium active:bg-red-100"
              >
                <Trash2 className="h-4 w-4 text-red-500" />
                Eliminar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ActionMenu;
