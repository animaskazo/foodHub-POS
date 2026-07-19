import React, { useState, useRef, useEffect } from 'react';
import { Search, ScanLine, X, Menu } from 'lucide-react';
import Keyboard from 'react-simple-keyboard';

// CSS del teclado importado via vite
import 'react-simple-keyboard/build/css/index.css';

import { getFirstOrganizationId, getCategories, getProducts } from '../../services/catalogService';

const spanishLayout = {
  default: [
    'q w e r t y u i o p',
    'a s d f g h j k l ñ',
    '{shift} z x c v b n m {bksp}',
    '{space} {clear}'
  ],
  shift: [
    'Q W E R T Y U I O P',
    'A S D F G H J K L Ñ',
    '{shift} Z X C V B N M {bksp}',
    '{space} {clear}'
  ]
};

const keyboardDisplay = {
  '{bksp}': '⌫',
  '{shift}': '⇧',
  '{space}': 'Espacio',
  '{clear}': '✕ Limpiar',
};

const ProductGrid = ({ onProductClick, cartItems = [], onOpenMobileMenu }) => {
  const [categories, setCategories] = useState([{ id: 'all', name: 'Todos' }]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [tapped, setTapped] = useState(null);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const keyboardRef = useRef(null);
  const overlayRef = useRef(null);
  const searchBarRef = useRef(null);

  useEffect(() => {
    const loadCatalog = async () => {
      setLoading(true);
      const orgId = await getFirstOrganizationId();
      if (orgId) {
        const cats = await getCategories(orgId);
        const prods = await getProducts(orgId, { status: 'available' });
        
        setCategories([{ id: 'all', name: 'Todos' }, ...cats]);
        setProducts(prods);
      }
      setLoading(false);
    };
    loadCatalog();
  }, []);

  const filtered = products.filter(p => {
    const matchesCategory = activeCategory === 'all' || p.categoryId === activeCategory;
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleTap = (product) => {
    setTapped(product.id);
    setTimeout(() => setTapped(null), 200);
    onProductClick && onProductClick(product);
  };

  const getCartQty = (productId) => {
    const item = cartItems.find(i => i.id === productId);
    return item ? item.quantity : 0;
  };

  const handleKeyPress = (button) => {
    if (button === '{clear}') {
      setSearch('');
      keyboardRef.current?.clearInput();
      return;
    }
    if (button === '{bksp}') {
      const newVal = search.slice(0, -1);
      setSearch(newVal);
      keyboardRef.current?.setInput(newVal);
      return;
    }
    if (button === '{space}') {
      const newVal = search + ' ';
      setSearch(newVal);
      keyboardRef.current?.setInput(newVal);
      return;
    }
    if (button === '{shift}') return;

    const newVal = search + button;
    setSearch(newVal);
    keyboardRef.current?.setInput(newVal);
  };

  const handleClearSearch = () => {
    setSearch('');
    keyboardRef.current?.clearInput();
    setShowKeyboard(false);
  };

  // Close keyboard on outside click — delay to avoid same-click closing it
  useEffect(() => {
    if (!showKeyboard) return;
    let timeoutId;
    const handler = (e) => {
      const inKeyboard = overlayRef.current && overlayRef.current.contains(e.target);
      const inSearchBar = searchBarRef.current && searchBarRef.current.contains(e.target);
      if (!inKeyboard && !inSearchBar) {
        setShowKeyboard(false);
      }
    };
    timeoutId = setTimeout(() => {
      document.addEventListener('pointerdown', handler);
    }, 100);
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('pointerdown', handler);
    };
  }, [showKeyboard]);

  return (
    <div className="flex flex-col h-full bg-gray-50 relative">
      {/* Header: Search & Categories */}
      <div ref={searchBarRef} className="bg-white pt-5 pb-4 shadow-sm z-10 sticky top-0">
        {/* Search Bar */}
        <div className="px-5 mb-5 flex gap-3 items-center">
          {/* Mobile Burger Menu Trigger */}
          <button
            onClick={onOpenMobileMenu}
            className="md:hidden p-2 -ml-2 rounded-lg text-gray-700 active:bg-gray-100 shrink-0 select-none"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Menu className="h-7 w-7" />
          </button>

          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
            {/* Desktop Virtual Keyboard Trigger */}
            <div
              onClick={() => setShowKeyboard(true)}
              className={`hidden md:flex w-full h-12 pl-12 pr-12 bg-gray-100 rounded-xl text-base items-center cursor-pointer select-none transition-all ${
                showKeyboard ? 'ring-2 ring-blue-500 bg-white' : ''
              }`}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <span className={search ? 'text-gray-900' : 'text-gray-400'}>
                {search || 'Buscar artículo...'}
              </span>
            </div>

            {/* Mobile Native Input */}
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                keyboardRef.current?.setInput(e.target.value);
              }}
              placeholder="Buscar artículo..."
              className="md:hidden flex w-full h-12 pl-12 pr-12 bg-gray-100 rounded-xl text-base items-center transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
            />
            {search ? (
              <button
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-gray-300 active:bg-gray-400 select-none"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <X className="h-3.5 w-3.5 text-gray-600" />
              </button>
            ) : (
              <button
                onClick={() => setShowKeyboard(true)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 p-1"
              >
                <ScanLine className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {/* Category Tabs */}
        {loading ? (
          <div className="flex ml-4 px-5 gap-3 opacity-50 overflow-hidden">
            <div className="h-10 w-24 bg-gray-200 rounded-full animate-pulse shrink-0"></div>
            <div className="h-10 w-28 bg-gray-200 rounded-full animate-pulse shrink-0"></div>
            <div className="h-10 w-20 bg-gray-200 rounded-full animate-pulse shrink-0"></div>
          </div>
        ) : (
          <div className="flex ml-4 px-5 gap-3 overflow-x-auto no-scrollbar snap-x relative">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`
                  snap-start shrink-0 px-6 py-2.5 rounded-full font-bold text-[14px] whitespace-nowrap transition-colors select-none
                  ${activeCategory === cat.id 
                    ? 'bg-black text-white shadow-md' 
                    : 'bg-white text-gray-700 border border-gray-200 active:bg-gray-100'}
                `}
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Products Grid */}
      <div className="flex-1 overflow-y-auto p-5 pb-24">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            Cargando catálogo...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Search className="h-12 w-12 mb-4 opacity-20" />
            <p className="font-medium text-lg">No se encontraron artículos</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((product) => {
              const qty = getCartQty(product.id);
              // Fallback placeholder pattern for products without images
              const hasImage = !!product.image;
              const activeVariants = product.variants?.filter(v => v.is_active) || [];
              const hasVariants = activeVariants.length > 0;
              const displayPrice = hasVariants
                ? activeVariants.reduce((min, v) => {
                    const price = product.price + (v.price_modifier || 0);
                    return price < min ? price : min;
                  }, Infinity)
                : product.price;
              
              return (
                <button
                  key={product.id}
                  onClick={() => handleTap(product)}
                  className={`
                    relative bg-white rounded-2xl overflow-hidden shadow-sm border select-none transition-transform
                    ${tapped === product.id ? 'scale-[0.97] brightness-95' : ''}
                    ${qty > 0 ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-200'}
                  `}
                  style={{ aspectRatio: '1/1', WebkitTapHighlightColor: 'transparent' }}
                >
                  {/* Badge de cantidad */}
                  {qty > 0 && (
                    <div className="absolute top-2 right-2 bg-blue-600 text-white font-bold text-sm w-7 h-7 rounded-full flex items-center justify-center z-10 shadow-sm border-2 border-white">
                      {qty}
                    </div>
                  )}
                  
                  {hasImage ? (
                    <div className="absolute inset-0">
                      <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
                    </div>
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-gray-100 to-gray-200">
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent"></div>
                    </div>
                  )}

                  <div className="absolute inset-x-0 bottom-0 p-3 text-white text-left z-10">
                    <p className="font-semibold text-sm leading-tight line-clamp-2">{product.name}</p>
                    <p className="text-xs mt-0.5 opacity-90 font-medium">
                      {hasVariants ? 'Desde ' : ''}${Math.round(displayPrice * 1.19).toLocaleString('es-CL')}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Virtual Keyboard Overlay */}
      {showKeyboard && (
        <div
          ref={overlayRef}
          className="hidden md:block absolute bottom-0 left-0 right-0 z-50 bg-[#1c1c1e] shadow-2xl border-t border-gray-700"
        >
          {/* Keyboard Header */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
            <div className="flex items-center gap-3">
              <Search className="h-4 w-4 text-gray-400" />
              <span className="text-white text-sm font-medium">
                {search ? `"${search}"` : 'Buscar artículo...'}
              </span>
            </div>
            <button
              onClick={() => setShowKeyboard(false)}
              className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-bold active:bg-blue-700 select-none"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              Listo
            </button>
          </div>

          {/* Keyboard */}
          <Keyboard
            keyboardRef={r => (keyboardRef.current = r)}
            onKeyPress={handleKeyPress}
            layout={spanishLayout}
            display={keyboardDisplay}
            theme="hg-theme-default hg-layout-default pos-keyboard"
            physicalKeyboardHighlight={false}
            preventMouseDownDefault={true}
          />
        </div>
      )}

      {/* Custom keyboard CSS overrides */}
      <style>{`
        .pos-keyboard.hg-theme-default {
          background: #1c1c1e;
          border-radius: 0;
          padding: 10px 12px 14px;
          font-family: inherit;
        }
        .pos-keyboard .hg-row {
          justify-content: center;
        }
        .pos-keyboard .hg-button {
          background: #3a3a3c;
          border-bottom: 2px solid #2a2a2c;
          border-radius: 8px;
          color: #fff;
          font-size: 16px;
          font-weight: 600;
          height: 46px;
          max-width: 52px;
          box-shadow: none;
        }
        .pos-keyboard .hg-button:active,
        .pos-keyboard .hg-button.hg-activeButton {
          background: #636366;
        }
        .pos-keyboard .hg-button[data-skbtn="{space}"] {
          max-width: 300px;
          background: #3a3a3c;
        }
        .pos-keyboard .hg-button[data-skbtn="{clear}"] {
          max-width: 110px;
          background: #3a3a3c;
          font-size: 13px;
          color: #ff453a;
        }
        .pos-keyboard .hg-button[data-skbtn="{bksp}"] {
          background: #636366;
          max-width: 70px;
        }
        .pos-keyboard .hg-button[data-skbtn="{shift}"] {
          background: #636366;
          max-width: 70px;
        }
      `}</style>
    </div>
  );
};

export default ProductGrid;
