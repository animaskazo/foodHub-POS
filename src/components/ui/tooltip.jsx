import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const Tooltip = ({ text, children, enabled = true }) => {
  const [anchor, setAnchor] = useState(null);
  const [position, setPosition] = useState(null);
  const tooltipRef = useRef(null);

  const showTooltip = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const nextAnchor = { left: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom };
    setAnchor(nextAnchor);
    setPosition({ left: nextAnchor.left, top: nextAnchor.top - 8, placeBelow: false });
  };

  useLayoutEffect(() => {
    if (!enabled || !anchor || !tooltipRef.current) return;
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const margin = 8;
    const left = Math.max(
      tooltipRect.width / 2 + margin,
      Math.min(anchor.left, window.innerWidth - tooltipRect.width / 2 - margin)
    );
    const canPlaceAbove = anchor.top - tooltipRect.height - margin >= margin;
    const canPlaceBelow = anchor.bottom + tooltipRect.height + margin <= window.innerHeight - margin;
    const placeBelow = !canPlaceAbove && canPlaceBelow;
    const top = placeBelow ? anchor.bottom + margin : anchor.top - margin;
    setPosition(current => {
      if (current?.left === left && current?.top === top && current?.placeBelow === placeBelow) return current;
      return { left, top, placeBelow };
    });
  }, [anchor, enabled, text]);

  if (!enabled) return <>{children}</>;

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={showTooltip}
      onMouseLeave={() => { setAnchor(null); setPosition(null); }}
      onFocus={showTooltip}
      onBlur={() => { setAnchor(null); setPosition(null); }}
    >
      {children}
      {position && createPortal(
        <div
          ref={tooltipRef}
          role="tooltip"
          className="fixed px-2.5 py-1.5 text-xs font-medium text-white bg-gray-900 rounded-md shadow-xl whitespace-nowrap pointer-events-none"
          style={{ left: position.left, top: position.top, transform: `translate(-50%, ${position.placeBelow ? '0' : '-100%'})`, zIndex: 99999 }}
        >
          {text}
          <div className={`absolute left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45 ${position.placeBelow ? 'bottom-full -mb-1' : 'top-full -mt-1'}`} />
        </div>,
        document.body
      )}
    </div>
  );
};

export default Tooltip;
