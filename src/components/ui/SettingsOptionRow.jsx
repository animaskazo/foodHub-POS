import { useId } from 'react';
import { cn } from '@/lib/utils';

// On mobile, the description gets the full row instead of sharing a column with an icon.
export function SettingsOptionRow({ title, description, icon: Icon, control, className, iconClassName }) {
  const id = useId();
  return (
    <div className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-x-4', className)}>
      {Icon && (
        <div aria-hidden="true" className={cn('hidden size-11 shrink-0 items-center justify-center rounded-2xl bg-black text-white sm:row-span-2 sm:flex', iconClassName)}>
          <Icon className="size-5" />
        </div>
      )}
      <p id={`${id}-title`} className={cn('min-w-0 self-center text-sm font-bold text-gray-800', !Icon && 'sm:col-span-2')}>
        {title}
      </p>
      <div className="col-start-2 row-start-1 flex min-h-6 shrink-0 items-center justify-end self-center sm:col-start-3 sm:row-span-2">
        {control({ 'aria-labelledby': `${id}-title`, 'aria-describedby': `${id}-description` })}
      </div>
      <p id={`${id}-description`} className={cn('col-span-2 text-xs leading-relaxed text-gray-500 sm:col-span-1 sm:col-start-2', !Icon && 'sm:col-span-2 sm:col-start-1')}>
        {description}
      </p>
    </div>
  );
}
