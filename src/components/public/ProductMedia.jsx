import React, { useRef, useState, useEffect, useCallback } from 'react';

/**
 * Foto + video opcional para la tienda pública.
 * - Siempre muestra la foto como base/poster.
 * - Si hay video, en hover (dispositivos con hover real) lo reproduce muteado en loop.
 * - En táctil / reduced-motion queda solo la foto.
 */
const ProductMedia = ({ image, video, alt = '', imgClassName = '', videoClassName = '', eager = false }) => {
  const videoRef = useRef(null);
  const hoverRef = useRef(false);
  const [hoverSupported, setHoverSupported] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const hover = window.matchMedia('(hover: hover) and (pointer: fine)');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setHoverSupported(hover.matches && !reduced.matches);
    update();
    hover.addEventListener?.('change', update);
    reduced.addEventListener?.('change', update);
    return () => {
      hover.removeEventListener?.('change', update);
      reduced.removeEventListener?.('change', update);
    };
  }, []);

  const canPlay = Boolean(video && image && hoverSupported);

  const handleEnter = useCallback(() => {
    if (!canPlay) return;
    const el = videoRef.current;
    if (!el) return;
    hoverRef.current = true;
    // Mostrar el video de inmediato: con poster={image} se ve la misma foto
    // hasta que arranca el movimiento, así el cambio es imperceptible.
    setIsPlaying(true);
    try {
      const p = el.play();
      if (p?.then) {
        p.then(() => {
          // Si el cursor ya salió mientras cargaba, pausar para no dejarlo corriendo oculto
          if (!hoverRef.current) {
            try { el.pause(); } catch { /* noop */ }
          }
        }).catch(() => {
          if (hoverRef.current) setIsPlaying(false);
        });
      }
    } catch {
      setIsPlaying(false);
    }
  }, [canPlay]);

  const handleLeave = useCallback(() => {
    hoverRef.current = false;
    setIsPlaying(false);
    const el = videoRef.current;
    if (!el) return;
    try { el.pause(); } catch { /* noop */ }
    try { el.currentTime = 0; } catch { /* noop */ }
  }, []);

  // Pausar al desmontar / salir del viewport para no dejar videos sonando
  useEffect(() => () => {
    try { videoRef.current?.pause(); } catch { /* noop */ }
  }, []);

  return (
    <div
      className="w-full h-full relative overflow-hidden"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <img
        src={image}
        alt={alt}
        className={imgClassName}
        loading={eager ? 'eager' : 'lazy'}
        draggable={false}
      />
      {canPlay && (
        <video
          ref={videoRef}
          src={video}
          poster={image}
          muted
          loop
          playsInline
          preload="metadata"
          disablePictureInPicture
          aria-hidden="true"
          tabIndex={-1}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-150 pointer-events-none ${videoClassName} ${isPlaying ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
    </div>
  );
};

export default ProductMedia;
