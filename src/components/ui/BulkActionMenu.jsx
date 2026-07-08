import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from './button';

const BulkActionMenu = ({ actions }) => {
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
        className="rounded-full bg-white text-gray-800 hover:bg-gray-50 border border-gray-200 shadow-sm"
        onClick={() => setIsOpen(!isOpen)}
      >
        Acciones <ChevronDown className="ml-2 h-4 w-4 text-gray-500" />
      </Button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          <div className="py-1">
            {actions.map((action, idx) => (
              <button
                key={idx}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                  action.onClick();
                }}
                className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 font-medium transition-colors ${
                  action.destructive 
                    ? 'text-red-600 hover:bg-red-50 active:bg-red-100' 
                    : 'text-gray-700 hover:bg-gray-50 active:bg-gray-100'
                }`}
              >
                {action.icon}
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default BulkActionMenu;
