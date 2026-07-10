import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, X, Plus, Check } from 'lucide-react';
import ProductDetailView from './ProductDetailView';

const fmt = (n) => Math.round(n * 1.19).toLocaleString('es-CL');

// ── Product Card ──────────────────────────────────────────────
const ProductCard = ({ product, quantity, cartItemId, onAdd, onAddDirect, onUpdateQty, onRemoveItem }) => {
  const [tapped, setTapped] = useState(false);
  const hasVariants = product.variants?.length > 0;
  const hasExtras = product.ingredients?.some(i => i.isExtra);
  const isConfigurable = hasVariants || hasExtras;

  const handleTap = (e) => {
    if (e) e.stopPropagation();
    setTapped(true);
    setTimeout(() => setTapped(false), 200);
    onAdd(product);
  };

  return (
    <div
      onClick={handleTap}
      className={`bg-white rounded-2xl overflow-hidden border border-gray-200/60 transition-all duration-200 active:scale-[0.97] cursor-pointer flex flex-col h-full ${tapped ? 'scale-[0.97]' : ''}`}
    >
      {/* Image */}
      <div className="w-full h-28 sm:h-36 bg-gray-100 relative overflow-hidden">
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-3xl">🍽️</span>
          </div>
        )}
        {quantity > 0 && (
          <div className="absolute top-2.5 right-2.5 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center shadow-lg shadow-black/25">
            <Check className="h-4.5 w-4.5 text-white" style={{ width: '18px', height: '18px' }} strokeWidth={3.5} />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col justify-between flex-1">
        <div>
          <p className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2 mb-1">
            {product.name}
          </p>
          {product.description && (
            <p className="text-xs text-gray-400 line-clamp-2 mb-2 leading-relaxed">{product.description}</p>
          )}
        </div>
        
        <div className="mt-auto">
          <div className="mb-2">
            <span className="font-extrabold text-gray-900 text-base">${fmt(product.price)}</span>
          </div>
          
          <div className="flex justify-end">
            {quantity > 0 ? (
              isConfigurable ? (
                <button
                  onClick={handleTap}
                  className="h-8 px-3 bg-blue-600 text-white rounded-full flex items-center gap-1 font-bold text-xs shadow-sm hover:bg-blue-700 transition-colors"
                >
                  <span>{quantity}</span>
                  <Plus className="h-3.5 w-3.5" />
                </button>
              ) : (
                <div 
                  className="flex items-center bg-blue-600 text-white rounded-full h-8 p-0.5 gap-1.5 shadow-sm"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (quantity === 1) {
                        onRemoveItem(cartItemId);
                      } else {
                        onUpdateQty(cartItemId, quantity - 1);
                      }
                    }}
                    className="w-7 h-7 rounded-full flex items-center justify-center font-bold hover:bg-blue-700 active:scale-90 transition-transform text-white text-sm"
                  >
                    −
                  </button>
                  <span className="font-extrabold text-sm min-w-[12px] text-center">{quantity}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddDirect();
                    }}
                    className="w-7 h-7 rounded-full flex items-center justify-center font-bold hover:bg-blue-700 active:scale-90 transition-transform text-white text-sm"
                  >
                    +
                </button>
              </div>
            )
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (isConfigurable) {
                  onAdd(product);
                } else {
                  onAddDirect();
                }
              }}
              className="px-3.5 h-8 bg-black text-white rounded-full flex items-center gap-1 font-bold text-xs active:scale-90 transition-transform shadow-sm hover:bg-gray-900"
              aria-label={`Agregar ${product.name}`}
            >
              <span>Agregar</span>
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
          </div>
        </div>
      </div>
    </div>
  );
};


// ── Menu Section (Step 1) ─────────────────────────────────────
const MenuSection = ({ categories, products, cartItems, onAddItem, onUpdateQty, onRemoveItem, onViewCart }) => {
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

  const cartInfoMap = useMemo(() => {
    const map = {};
    cartItems.forEach(item => {
      if (!map[item.id]) {
        map[item.id] = { quantity: 0, cartItemId: item.cartItemId };
      }
      map[item.id].quantity += item.quantity;
    });
    return map;
  }, [cartItems]);

  const groupedProducts = useMemo(() => {
    const groups = {};
    filteredProducts.forEach(p => {
      const catId = p.categoryId || 'other';
      if (!groups[catId]) groups[catId] = [];
      groups[catId].push(p);
    });
    return groups;
  }, [filteredProducts]);

  const handleProductTap = (product) => {
    setSelectedProduct(product);
  };

  const scrollCategoryIntoView = (catId) => {
    if (catRefs.current[catId] && catBarRef.current) {
      catRefs.current[catId].scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' });
    }
  };

  const categoriesToRender = activeCategory === 'all' 
    ? categories 
    : categories.filter(c => c.id === activeCategory);

  const renderFallback = activeCategory === 'all' && groupedProducts['other']?.length > 0;

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
      <div className={`flex-1 ${selectedProduct ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        <div className="max-w-2xl mx-auto px-4 py-4">
          {filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-300">
              <span className="text-5xl mb-4">🔍</span>
              <p className="font-semibold text-lg text-gray-400">Sin resultados</p>
              <p className="text-sm text-gray-400 mt-1">Intenta con otro término</p>
            </div>
          ) : (
            <div className="space-y-8">
              {categoriesToRender.map(cat => {
                const prods = groupedProducts[cat.id] || [];
                if (prods.length === 0) return null;

                return (
                  <div key={cat.id} className="space-y-4">
                    <h3 className="font-extrabold text-lg text-gray-900 border-b border-gray-100 pb-2 mb-1 px-1 sticky top-0 bg-gray-50/90 backdrop-blur-sm z-10 pt-2">
                      {cat.name}
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {prods.map(p => (
                        <ProductCard
                          key={p.id}
                          product={p}
                          quantity={cartInfoMap[p.id]?.quantity || 0}
                          cartItemId={cartInfoMap[p.id]?.cartItemId || null}
                          onAdd={handleProductTap}
                          onAddDirect={() => onAddItem({ ...p, quantity: 1, selectedIngredients: [], variant: null })}
                          onUpdateQty={onUpdateQty}
                          onRemoveItem={onRemoveItem}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}

              {renderFallback && (
                <div className="space-y-4">
                  <h3 className="font-extrabold text-lg text-gray-900 border-b border-gray-100 pb-2 mb-1 px-1 sticky top-0 bg-gray-50/90 backdrop-blur-sm z-10 pt-2">
                    Otros
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {groupedProducts['other'].map(p => (
                      <ProductCard
                        key={p.id}
                        product={p}
                        quantity={cartInfoMap[p.id]?.quantity || 0}
                        cartItemId={cartInfoMap[p.id]?.cartItemId || null}
                        onAdd={handleProductTap}
                        onAddDirect={() => onAddItem({ ...p, quantity: 1, selectedIngredients: [], variant: null })}
                        onUpdateQty={onUpdateQty}
                        onRemoveItem={onRemoveItem}
                      />
                    ))}
                  </div>
                </div>
              )}
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
              className="w-full h-16 bg-black text-white font-bold rounded-full flex items-center justify-between px-8 shadow-2xl hover:bg-gray-900 transition-colors active:scale-[0.98]"
            >
              <div className="flex items-center gap-3.5">
                <span className="bg-white/20 text-white text-base font-extrabold px-3 py-0.5 rounded-full">
                  {totalQty}
                </span>
                <span className="text-[17px] tracking-wide">Ver Pedido</span>
              </div>
              <span className="text-lg font-extrabold">${totalPrice.toLocaleString('es-CL')}</span>
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
