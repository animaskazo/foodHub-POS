import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, X, Plus, Check } from 'lucide-react';
import ProductDetailView from './ProductDetailView';

const fmt = (n) => Math.round(n * 1.19).toLocaleString('es-CL');

// ── Product Card ──────────────────────────────────────────────
const ProductCard = ({ product, isInCart, onAdd }) => {
  const [tapped, setTapped] = useState(false);

  const handleTap = () => {
    setTapped(true);
    setTimeout(() => setTapped(false), 200);
    onAdd(product);
  };

  return (
    <div
      className={`bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm transition-all duration-200 active:scale-[0.97] ${tapped ? 'scale-[0.97]' : ''}`}
    >
      {/* Image */}
      <div className="aspect-square bg-gray-100 relative overflow-hidden">
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-4xl">🍽️</span>
          </div>
        )}
        {isInCart && (
          <div className="absolute top-2 right-2 w-6 h-6 bg-black rounded-full flex items-center justify-center shadow">
            <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2 mb-1">
          {product.name}
        </p>
        {product.description && (
          <p className="text-xs text-gray-400 line-clamp-1 mb-2">{product.description}</p>
        )}
        <div className="flex items-center justify-between">
          <span className="font-bold text-gray-900 text-sm">${fmt(product.price)}</span>
          <button
            onPointerDown={handleTap}
            className="w-8 h-8 bg-black rounded-full flex items-center justify-center active:scale-90 transition-transform"
            aria-label={`Agregar ${product.name}`}
          >
            <Plus className="h-4 w-4 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
};


// ── Menu Section (Step 1) ─────────────────────────────────────
const MenuSection = ({ categories, products, cartItems, onAddItem, onViewCart }) => {
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const catBarRef = useRef(null);
  const catRefs = useRef({});

  const totalQty = cartItems.reduce((s, i) => s + i.quantity, 0);
  const totalPrice = cartItems.reduce((s, i) => s + (Math.round(i.price * 1.19) * i.quantity), 0);

  const filteredProducts = useMemo(() => {
    let list = products;
    if (activeCategory !== 'all') list = list.filter(p => p.categoryId === activeCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q));
    }
    return list;
  }, [products, activeCategory, search]);

  const cartMap = useMemo(() => {
    const map = {};
    cartItems.forEach(item => { map[item.id] = (map[item.id] || 0) + item.quantity; });
    return map;
  }, [cartItems]);

  const handleProductTap = (product) => {
    setSelectedProduct(product);
  };

  const scrollCategoryIntoView = (catId) => {
    if (catRefs.current[catId] && catBarRef.current) {
      catRefs.current[catId].scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' });
    }
  };

  return (
    <div className="flex flex-col min-h-0">
      {/* Search */}
      <div className="sticky top-14 z-20 bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              type="search"
              placeholder="Buscar producto…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-9 py-2.5 bg-gray-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-black/10 transition"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="h-4 w-4 text-gray-400" />
              </button>
            )}
          </div>
        </div>

        {/* Category pills */}
        <div ref={catBarRef} className="flex gap-2 px-4 pb-3 overflow-x-auto hide-scrollbar">
          {[{ id: 'all', name: 'Todos' }, ...categories].map(cat => (
            <button
              key={cat.id}
              ref={el => { catRefs.current[cat.id] = el; }}
              onClick={() => {
                setActiveCategory(cat.id);
                scrollCategoryIntoView(cat.id);
              }}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-bold transition-all ${
                activeCategory === cat.id
                  ? 'bg-black text-white shadow'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Products grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-4">
          {filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-300">
              <span className="text-5xl mb-4">🔍</span>
              <p className="font-semibold text-lg text-gray-400">Sin resultados</p>
              <p className="text-sm text-gray-400 mt-1">Intenta con otro término</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filteredProducts.map(p => (
                <ProductCard
                  key={p.id}
                  product={p}
                  isInCart={!!cartMap[p.id]}
                  onAdd={handleProductTap}
                />
              ))}
            </div>
          )}
          {/* Bottom spacing for floating button */}
          <div className="h-24" />
        </div>
      </div>

      {/* Floating cart button */}
      {totalQty > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-20 p-4 bg-gradient-to-t from-gray-50 via-gray-50/90 to-transparent pt-8">
          <div className="max-w-2xl mx-auto">
            <button
              onClick={onViewCart}
              className="w-full bg-black text-white font-bold py-4 rounded-full flex items-center justify-between px-6 shadow-xl hover:bg-gray-900 transition-colors active:scale-[0.98]"
            >
              <div className="flex items-center gap-3">
                <span className="bg-white/20 text-white text-sm font-bold px-2.5 py-0.5 rounded-full">
                  {totalQty}
                </span>
                <span>Ver Pedido</span>
              </div>
              <span>${totalPrice.toLocaleString('es-CL')}</span>
            </button>
          </div>
        </div>
      )}

      {/* Product Detail View (Independent Full Screen) */}
      {selectedProduct && (
        <ProductDetailView
          product={selectedProduct}
          onAdd={(productToAdd) => {
            onAddItem({ 
              ...productToAdd, 
              selectedIngredients: productToAdd.selectedIngredients || [], 
              variant: productToAdd.variant || null 
            });
            setSelectedProduct(null);
          }}
          onBack={() => setSelectedProduct(null)}
        />
      )}
    </div>
  );
};

export default MenuSection;
