import React, { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const PRESETS = [
  { key: 'today', label: 'Hoy' },
  { key: '7days', label: 'Últimos 7 días' },
  { key: '30days', label: 'Últimos 30 días' },
];

const getPresetRange = (key) => {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();

  switch (key) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      return { from: start, to: end };
    case '7days':
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      return { from: start, to: end };
    case '30days':
      start.setDate(start.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      return { from: start, to: end };
    default:
      return { from: null, to: null };
  }
};

const DateRangePicker = ({ from, to, onSelect, activePreset, onPresetChange }) => {
  const [open, setOpen] = useState(false);
  const [calendarRange, setCalendarRange] = useState({ from: from || null, to: to || null });

  const handlePreset = (key) => {
    const range = getPresetRange(key);
    onPresetChange(key);
    onSelect(range.from, range.to);
    setOpen(false);
  };

  const handleCalendarSelect = (range) => {
    if (range?.from) {
      setCalendarRange(range);
      onPresetChange(null);
      if (range.to) {
        onSelect(range.from, range.to);
      }
    }
  };

  const displayText = () => {
    if (activePreset) {
      return PRESETS.find(p => p.key === activePreset)?.label || 'Seleccionar';
    }
    if (from && to) {
      const s = format(from, "d MMM", { locale: es });
      const e = format(to, "d MMM, yyyy", { locale: es });
      return `${s} – ${e}`;
    }
    return 'Seleccionar';
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all select-none border",
              activePreset || (from && to)
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            )}
            style={{ WebkitTapHighlightColor: 'transparent' }}
          />
        }
      >
        <CalendarDays className="h-3.5 w-3.5" />
        <span>{displayText()}</span>
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <div className="flex">
          {/* Presets sidebar */}
          <div className="border-r border-gray-100 bg-gray-50 py-2 min-w-[130px]">
            {PRESETS.map(p => (
              <button
                key={p.key}
                onClick={() => handlePreset(p.key)}
                className={cn(
                  "w-full text-left px-4 py-2 text-xs font-medium transition-colors",
                  activePreset === p.key
                    ? "bg-white text-gray-900 font-bold"
                    : "text-gray-600 hover:bg-gray-100"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          {/* Calendar */}
          <Calendar
            mode="range"
            defaultMonth={calendarRange.from}
            selected={calendarRange}
            onSelect={handleCalendarSelect}
            numberOfMonths={2}
            locale={es}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default DateRangePicker;
