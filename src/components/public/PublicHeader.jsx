import React from 'react';
import { ShoppingBag, ArrowLeft, Store } from 'lucide-react';

const PublicHeader = ({ org, cartCount, step, onBack, isOpen = true }) => {
  const canGoBack = step > 1 && step < 4;

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-100 shadow-sm">
      <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
        {/* Left: Back or Logo */}
        <div className="flex items-center gap-3 min-w-0">
          {canGoBack ? (
            <button
              onClick={onBack}
              className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors shrink-0"
              aria-label="Volver"
            >
              <ArrowLeft className="h-5 w-5 text-gray-700" />
            </button>
          ) : (
            <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center shrink-0">
              <Store className="h-4 w-4 text-white" />
            </div>
          )}
          <span className="font-bold text-gray-900 text-[15px] truncate">
            {org?.name || 'Cargando…'}
          </span>
        </div>

        {/* Step indicator (steps 1–3) */}
        {step < 4 && (
          <div className="flex items-center gap-1.5 shrink-0">
            {[1, 2, 3].map(s => (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-all duration-300 ${s === step ? 'w-6 bg-black' : s < step ? 'w-3 bg-gray-400' : 'w-3 bg-gray-200'
                  }`}
              />
            ))}
          </div>
        )}

        {/* Right: Cart (step 1 only) */}
        {step === 1 && (
          <div className="shrink-0 w-8 flex justify-end">
            {cartCount > 0 && (
              <div className="relative">
                <ShoppingBag className="h-6 w-6 text-gray-700" />
                <span className="absolute -top-1.5 -right-1.5 bg-black text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {cartCount > 9 ? '9+' : cartCount}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {!isOpen && (
        <div className="bg-red-500 text-white text-[13px] font-bold text-center py-1.5 px-4 shadow-sm">
          En este momento el local se encuentra cerrado
        </div>
      )}
    </header>
  );
};

export default PublicHeader;
