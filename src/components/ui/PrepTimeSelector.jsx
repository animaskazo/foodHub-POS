import React, { useState, useEffect } from 'react';
import { Timer, Loader2, Check, ChevronDown } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { updateOrganizationDetails } from '../../services/organizationService';
import Tooltip from './tooltip';

const PREP_OPTIONS = [0, 5, 10, 15, 20, 25, 30, 40, 60];

const PrepTimeSelector = ({ compact = false, menuVariant = false, iconOnly = false }) => {
  const { organization } = useAuth();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    setIsDesktop(mq.matches);
    const handler = (e) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const initial = organization?.prep_time != null ? organization.prep_time : 15;
  const [current, setCurrent] = useState(initial);

  useEffect(() => {
    setCurrent(organization?.prep_time != null ? organization.prep_time : 15);
  }, [organization?.prep_time]);

  const handleChange = async (minutes) => {
    if (!organization?.id || minutes === current) return;
    setCurrent(minutes);
    setSaving(true);
    try {
      await updateOrganizationDetails(organization.id, { prep_time: minutes });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      console.error('Error al guardar tiempo de preparación:', err);
      setCurrent(initial);
      alert('Error al guardar el tiempo de preparación.');
    } finally {
      setSaving(false);
    }
  };

  if (menuVariant) {
    return (
      <div className="flex flex-col gap-2 w-full">
        <label className="text-[13px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5 ml-1">
          <Timer className="h-4 w-4" />
          Tiempo de Cocina
        </label>
        <div className="relative">
          <select
            value={current}
            onChange={(e) => handleChange(Number(e.target.value))}
            className="w-full bg-white border border-gray-200 text-gray-900 rounded-xl px-4 py-3 text-base font-bold appearance-none cursor-pointer focus:border-black focus:ring-black shadow-sm"
          >
            {PREP_OPTIONS.map((m) => (
              <option key={m} value={m}>{m === 0 ? 'No informar' : `${m} min`}</option>
            ))}
          </select>
          {saved ? (
              <Check className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none h-5 w-5" />
            ) : saving ? (
              <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none h-5 w-5 animate-spin" />
            ) : (
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none h-5 w-5" />
            )}
        </div>
      </div>
    );
  }

  if (compact && iconOnly) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setDetailsOpen(value => !value)}
          aria-label="Tiempo de preparación"
          aria-expanded={detailsOpen}
          className="relative flex h-10 w-10 items-center justify-center rounded-full text-gray-800 transition-colors hover:bg-gray-100"
        >
          {saving ? <Loader2 className="h-6 w-6 animate-spin" strokeWidth={2} /> : saved ? <Check className="h-6 w-6" strokeWidth={2} /> : <Timer className="h-6 w-6" strokeWidth={2} />}
        </button>
        {detailsOpen && (
          <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
            <label className="mb-2 block text-sm font-semibold text-gray-900">Tiempo de preparación</label>
            <select
              value={current}
              onChange={(e) => handleChange(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800 outline-none focus:border-black"
            >
              {PREP_OPTIONS.map((m) => <option key={m} value={m}>{m === 0 ? 'No informar' : `${m} min`}</option>)}
            </select>
          </div>
        )}
      </div>
    );
  }

  return (
    <Tooltip text="Tiempo de preparación estimado en la cocina" enabled={isDesktop}>
      <div
        className={`flex items-center gap-1 rounded-lg select-none shrink-0 ${
          compact
            ? 'bg-gray-100 h-11 px-2'
            : 'bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm gap-2'
        }`}
      >
      {saved ? (
        <Check className="h-4 w-4" />
      ) : saving ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Timer className="h-4 w-4" />
      )}
      <select
        value={current}
        onChange={(e) => handleChange(Number(e.target.value))}
        className={compact
          ? 'bg-transparent text-gray-800 text-[13px] font-bold outline-none cursor-pointer [appearance:none] text-center'
          : 'bg-gray-50 border border-gray-200 text-gray-800 rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-black cursor-pointer'}
      >
        {PREP_OPTIONS.map((m) => (
          <option key={m} value={m}>{m === 0 ? 'No informar' : `${m} min`}</option>
        ))}
      </select>
      </div>
    </Tooltip>
  );
};

export default PrepTimeSelector;
