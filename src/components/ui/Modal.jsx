import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const Modal = ({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  maxWidth = 'max-w-md', 
  hideHeader = false, 
  customAnimation = null, 
  fullScreenOnMobile = false,
  className = '' 
}) => {
  const [visible, setVisible] = useState(false);
  const [render, setRender] = useState(false);
  const [windowHeight, setWindowHeight] = useState(typeof window !== 'undefined' ? window.innerHeight : 800);

  useEffect(() => {
    const handleResize = () => setWindowHeight(window.innerHeight);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setRender(true);
      setTimeout(() => setVisible(true), 10);
      document.body.style.overflow = 'hidden';
    } else {
      setVisible(false);
      setTimeout(() => {
        setRender(false);
        document.body.style.overflow = 'unset';
      }, 300);
    }
    
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!render) return null;

  return createPortal(
    <div 
      className={`fixed inset-0 z-50 flex items-center justify-center ${fullScreenOnMobile ? 'p-0 md:p-6' : 'p-4 sm:p-6'} bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
      onClick={onClose}
    >
      <div 
        className={`relative bg-white shadow-2xl w-full ${maxWidth} overflow-hidden flex flex-col transition-all duration-300 ${fullScreenOnMobile ? 'rounded-none md:rounded-3xl h-[100dvh] md:h-auto !max-h-[100dvh]' : 'rounded-3xl'} ${customAnimation ? '' : (visible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4')} ${className}`}
        style={(!fullScreenOnMobile || windowHeight >= 768) ? {
          maxHeight: `${windowHeight * 0.9}px`,
          ...(customAnimation ? { animation: customAnimation } : {})
        } : {
          ...(customAnimation ? { animation: customAnimation } : {})
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {!hideHeader && (
          <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
            {typeof title === 'string' ? (
              <h2 className="text-xl font-bold text-gray-800">{title}</h2>
            ) : (
              title
            )}
            {onClose && (
              <button 
                onClick={onClose}
                className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors text-gray-500 shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default Modal;
