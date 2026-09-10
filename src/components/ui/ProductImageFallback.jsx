import React from 'react';
import { UtensilsCrossed } from 'lucide-react';

/**
 * Placeholder para productos sin imagen: muestra el logo del negocio
 * en blanco y negro con opacidad sobre un fondo neutro.
 * Si el negocio no tiene logo, muestra un icono genérico.
 *
 * El tamaño lo define el contenedor padre vía `className`.
 */
const ProductImageFallback = ({ logoUrl, alt = 'Sin imagen', className = '', imgClassName = '' }) => {
  return (
    <div
      className={`bg-gray-100 flex items-center justify-center overflow-hidden ${className}`}
      role="img"
      aria-label={alt}
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={alt}
          loading="lazy"
          draggable={false}
          className={`object-contain grayscale opacity-40 max-w-[40%] max-h-[40%] rounded-xl select-none pointer-events-none ${imgClassName}`}
        />
      ) : (
        <UtensilsCrossed className="w-1/3 h-1/3 text-gray-300" strokeWidth={1.5} />
      )}
    </div>
  );
};

export default ProductImageFallback;
