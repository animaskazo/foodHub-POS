import React from 'react';

const DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const HourHeatmap = ({ orders = [] }) => {
  if (!orders || orders.length === 0) return null;

  // Grid: 7 days x 24 hours
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  let maxCount = 0;

  orders.forEach((o) => {
    if (!o.created_at) return;
    const date = new Date(o.created_at);
    const day = date.getDay();
    const hour = date.getHours();
    grid[day][hour] += 1;
    if (grid[day][hour] > maxCount) {
      maxCount = grid[day][hour];
    }
  });

  const getColor = (count) => {
    if (count === 0) return 'bg-gray-100/60';
    const ratio = count / maxCount;
    if (ratio < 0.25) return 'bg-emerald-100 text-emerald-800';
    if (ratio < 0.5) return 'bg-emerald-300 text-emerald-900';
    if (ratio < 0.75) return 'bg-emerald-500 text-white';
    return 'bg-emerald-700 text-white font-bold';
  };

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto hide-scrollbar">
        <div className="min-w-[640px]">
          {/* Hour headers */}
          <div className="flex items-center text-[9px] text-gray-400 font-medium mb-1 pl-9">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="flex-1 text-center select-none">
                {h % 3 === 0 ? String(h).padStart(2, '0') : ''}
              </div>
            ))}
          </div>

          {/* Day rows */}
          <div className="space-y-1">
            {DAYS_SHORT.map((dayLabel, d) => (
              <div key={dayLabel} className="flex items-center gap-1">
                <span className="w-8 text-[11px] font-semibold text-gray-500 select-none">
                  {dayLabel}
                </span>
                <div className="flex-1 flex gap-1">
                  {grid[d].map((count, h) => (
                    <div
                      key={h}
                      className={`flex-1 h-5 rounded-sm transition-all text-[9px] flex items-center justify-center cursor-default ${getColor(
                        count
                      )}`}
                      title={`${dayLabel} ${String(h).padStart(2, '0')}:00 — ${count} orden${
                        count !== 1 ? 'es' : ''
                      }`}
                    >
                      {count > 0 ? count : ''}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end gap-2 text-[10px] text-gray-400 pt-1">
        <span>Menos órdenes</span>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-gray-100/60 border border-gray-200" />
          <span className="w-3 h-3 rounded-sm bg-emerald-100" />
          <span className="w-3 h-3 rounded-sm bg-emerald-300" />
          <span className="w-3 h-3 rounded-sm bg-emerald-500" />
          <span className="w-3 h-3 rounded-sm bg-emerald-700" />
        </div>
        <span>Más órdenes</span>
      </div>
    </div>
  );
};

export default HourHeatmap;
