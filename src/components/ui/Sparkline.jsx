import React from 'react';

const Sparkline = ({ data = [], color = '#000000', fillColor, width = 80, height = 30 }) => {
  if (!data || data.length === 0) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((d - min) / range) * (height - 4) - 2; // pad top/bottom
    return `${x},${y}`;
  });

  const pathD = `M ${points.join(' L ')}`;
  
  // For the filled area, we add points to close the path at the bottom
  const fillPathD = fillColor 
    ? `${pathD} L ${width},${height} L 0,${height} Z` 
    : '';

  return (
    <svg width={width} height={height} className="overflow-visible" viewBox={`0 0 ${width} ${height}`}>
      {fillColor && (
        <path
          d={fillPathD}
          fill={fillColor}
          stroke="none"
        />
      )}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default Sparkline;
