import React, { useState } from 'react';

const fmtCLP = (n) => '$' + Number(n || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 });

const DonutChart = ({ data = [], total = 0, size = 180, strokeWidth = 24 }) => {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  if (!data || data.length === 0 || total === 0) {
    return (
      <div className="flex items-center justify-center h-44 text-sm text-gray-400">
        Sin datos de pago
      </div>
    );
  }

  const center = size / 2;
  const radius = center - strokeWidth;
  const circumference = 2 * Math.PI * radius;

  let accumulatedAngle = 0;

  const activeItem = hoveredIndex !== null ? data[hoveredIndex] : null;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-around gap-6">
      {/* Donut SVG */}
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
          {data.map((item, index) => {
            const percentage = item.value / total;
            const strokeDasharray = `${percentage * circumference} ${circumference}`;
            const strokeDashoffset = -accumulatedAngle * circumference;
            accumulatedAngle += percentage;

            const isHovered = hoveredIndex === index;

            return (
              <circle
                key={item.key || index}
                cx={center}
                cy={center}
                r={radius}
                fill="transparent"
                stroke={item.color}
                strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-200 cursor-pointer"
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
            );
          })}
        </svg>

        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center p-2">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
            {activeItem ? activeItem.label : 'Total'}
          </span>
          <span className="text-base font-bold text-gray-900 leading-tight">
            {fmtCLP(activeItem ? activeItem.value : total)}
          </span>
          {activeItem && (
            <span className="text-[10px] text-gray-500 font-medium">
              {Math.round((activeItem.value / total) * 100)}%
            </span>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="space-y-2.5 w-full max-w-xs">
        {data.map((item, index) => {
          const pct = Math.round((item.value / total) * 100);
          const isHovered = hoveredIndex === index;

          return (
            <div
              key={item.key || index}
              className={`flex items-center justify-between text-sm p-1.5 rounded-lg transition-colors cursor-pointer ${
                isHovered ? 'bg-gray-100/80' : 'hover:bg-gray-50'
              }`}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-gray-700 font-medium truncate">{item.label}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-semibold text-gray-900">{fmtCLP(item.value)}</span>
                <span className="text-xs text-gray-400 font-normal w-9 text-right">({pct}%)</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DonutChart;
