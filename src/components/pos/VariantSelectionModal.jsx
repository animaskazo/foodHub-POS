import React from 'react';
import Modal from '../ui/Modal';
import { ShoppingCart } from 'lucide-react';

const VariantSelectionModal = ({ isOpen, onClose, product, onSelectVariant }) => {
  if (!product) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Opciones para ${product.name}`}>
      <div className="p-6">
        <p className="text-gray-500 mb-6">Selecciona una variante para agregar al carrito:</p>
        <div className="grid grid-cols-1 gap-3">
          <button
            onClick={() => onSelectVariant(null)}
            className="flex items-center justify-between p-4 border border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all text-left group"
          >
            <div>
              <span className="block font-semibold text-gray-900 group-hover:text-blue-700">
                Original (Por defecto)
              </span>
              {product.sku && (
                <span className="block text-xs text-gray-400 mt-1">SKU: {product.sku}</span>
              )}
            </div>
            <div className="flex items-center gap-4">
              <span className="font-bold text-gray-900 group-hover:text-blue-700">
                ${Math.round(product.price * 1.19).toLocaleString('es-CL')}
              </span>
              <div className="px-4 py-1.5 rounded-full bg-gray-100 group-hover:bg-blue-600 text-sm font-semibold text-gray-600 group-hover:text-white transition-colors">
                Elegir
              </div>
            </div>
          </button>

          {product.variants.filter(v => v.is_active).map((variant) => {
            const finalPrice = product.price + (variant.price_modifier || 0);
            const finalGrossPrice = Math.round(finalPrice * 1.19);
            return (
              <button
                key={variant.id}
                onClick={() => onSelectVariant(variant)}
                className="flex items-center justify-between p-4 border border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all text-left group"
              >
                <div>
                  <span className="block font-semibold text-gray-900 group-hover:text-blue-700">
                    {variant.name}
                  </span>
                  {variant.sku && (
                    <span className="block text-xs text-gray-400 mt-1">SKU: {variant.sku}</span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-bold text-gray-900 group-hover:text-blue-700">
                    ${finalGrossPrice.toLocaleString('es-CL')}
                  </span>
                  <div className="px-4 py-1.5 rounded-full bg-gray-100 group-hover:bg-blue-600 text-sm font-semibold text-gray-600 group-hover:text-white transition-colors">
                    Elegir
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
};

export default VariantSelectionModal;
