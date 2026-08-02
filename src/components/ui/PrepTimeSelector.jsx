import React, { useState, useEffect } from 'react';
import { Timer, Loader2, Check } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { updateOrganizationDetails } from '../../services/organizationService';

const PREP_OPTIONS = [5, 10, 15, 20, 25, 30, 40, 60];

const PrepTimeSelector = ({ compact = false }) => {
  const { organization } = useAuth();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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

  return (
    <div
      className={`flex items-center gap-1 rounded-lg select-none shrink-0 ${
        compact
          ? 'bg-gray-100 h-11 px-2'
          : 'bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm gap-2'
      }`}
    >
      {saved ? (
        <Check className="h-4 w-4 text-emerald-500" />
      ) : saving ? (
        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
      ) : (
        <Timer className={compact ? 'h-4 w-4 text-gray-600' : 'h-4 w-4 text-gray-500'} />
      )}
      <select
        value={current}
        onChange={(e) => handleChange(Number(e.target.value))}
        className={compact
          ? 'bg-transparent text-gray-800 text-[13px] font-bold outline-none cursor-pointer [appearance:none] text-center'
          : 'bg-gray-50 border border-gray-200 text-gray-800 rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-black cursor-pointer'}
      >
        {PREP_OPTIONS.map((m) => (
          <option key={m} value={m}>{m} min</option>
        ))}
      </select>
    </div>
  );
};

export default PrepTimeSelector;