import React, { useState, useEffect } from 'react';
import { X, Search } from 'lucide-react';

const CategoryProductsModal = ({ isOpen, onClose, onSave, allProducts, selectedProductIds }) => {
  const [selectedIds, setSelectedIds] = useState(new Set(selectedProductIds));
  const [searchTerm, setSearchTerm] = useState('');

  // Sincronizar el estado interno cuando se abre el modal con nuevos props
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(new Set(selectedProductIds));
      setSearchTerm('');
    }
  }, [isOpen, selectedProductIds]);

  if (!isOpen) return null;

  const filteredProducts = allProducts.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const groupedProducts = filteredProducts.reduce((acc, p) => {
    const cat = p.category || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});

  const sortedCategories = Object.keys(groupedProducts).sort((a, b) => {
    if (a === 'General') return 1;
    if (b === 'General') return -1;
    return a.localeCompare(b);
  });

  const toggleProduct = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleSave = () => {
    onSave(Array.from(selectedIds));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Seleccionar Artículos</h2>
            <p className="text-sm text-gray-500">Asocia productos a esta categoría</p>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-100 bg-gray-50/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar artículos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-[15px] outline-none focus:border-black focus:ring-1 focus:ring-black transition-all"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2">
          {filteredProducts.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-[15px]">
              No se encontraron artículos
            </div>
          ) : (
            <div className="space-y-4 pb-2">
              {sortedCategories.map(categoryName => (
                <div key={categoryName}>
                  <h3 className="px-3 pt-2 pb-1 text-xs font-bold text-gray-400 uppercase tracking-wider">
                    {categoryName}
                  </h3>
                  <div className="space-y-1">
                    {groupedProducts[categoryName].map(product => (
                      <label 
                        key={product.id}
                        className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-xl cursor-pointer transition-colors"
                      >
                        <div className="relative flex items-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(product.id)}
                            onChange={() => toggleProduct(product.id)}
                            className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border-2 border-gray-300 checked:border-blue-600 checked:bg-blue-600 transition-all"
                          />
                          <svg className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" viewBox="0 0 14 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M1 5L4.5 8.5L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 text-[15px] truncate">{product.name}</p>
                          {product.type === 'bundle' && (
                            <p className="text-xs text-blue-600 font-medium mt-0.5">Combo</p>
                          )}
                        </div>
                        <div className="text-sm font-semibold text-gray-900 shrink-0">
                          ${Math.round(product.base_price).toLocaleString('es-CL')}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-gray-700 bg-gray-100 hover:bg-gray-200 font-medium rounded-xl transition-colors"
          >
            Descartar
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2.5 text-white bg-black hover:bg-gray-900 font-medium rounded-xl transition-colors shadow-sm"
          >
            Guardar ({selectedIds.size})
          </button>
        </div>

      </div>
    </div>
  );
};

export default CategoryProductsModal;
