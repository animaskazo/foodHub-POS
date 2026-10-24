import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarDays, ChevronDown, X } from 'lucide-react';
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
    setCalendarRange(range);
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

  const handleMobileCalendarSelect = (range) => {
    if (range?.from) setCalendarRange(range);
  };

  const applyMobileRange = () => {
    if (!calendarRange?.from || !calendarRange?.to) return;
    onPresetChange(null);
    onSelect(calendarRange.from, calendarRange.to);
    setOpen(false);
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
                ? "bg-white text-black border-black"
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
      <PopoverContent className="hidden w-auto p-0 md:block" align="end">
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
      {open && createPortal(
        <div
          className="fixed inset-0 z-[100] flex flex-col bg-white md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Seleccionar fechas"
          style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Seleccionar fechas</h2>
              <p className="mt-0.5 text-sm text-gray-500">Elige un rango para consultar tus pedidos</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full p-2 text-gray-600 hover:bg-gray-100" aria-label="Cerrar calendario">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto border-b border-gray-100 px-4 py-3">
            {PRESETS.map(p => (
              <button
                key={p.key}
                type="button"
                onClick={() => handlePreset(p.key)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-2 text-sm font-semibold",
                  activePreset === p.key ? "border-black bg-black text-white" : "border-gray-200 bg-white text-gray-700"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-4">
            <Calendar
              mode="range"
              defaultMonth={calendarRange.from}
              selected={calendarRange}
              onSelect={handleMobileCalendarSelect}
              numberOfMonths={1}
              locale={es}
              className="mx-auto w-full max-w-md [--cell-size:--spacing(11)]"
            />
            <p className="mt-3 text-center text-sm text-gray-500">
              {calendarRange.from && calendarRange.to
                ? `${format(calendarRange.from, "d MMM yyyy", { locale: es })} – ${format(calendarRange.to, "d MMM yyyy", { locale: es })}`
                : 'Selecciona una fecha de inicio y una de término'}
            </p>
          </div>
          <div className="border-t border-gray-200 bg-white px-5 py-4">
            <Button type="button" className="h-12 w-full" disabled={!calendarRange?.from || !calendarRange?.to} onClick={applyMobileRange}>
              Aplicar rango
            </Button>
          </div>
        </div>,
        document.body
      )}
    </Popover>
  );
};

export default DateRangePicker;
