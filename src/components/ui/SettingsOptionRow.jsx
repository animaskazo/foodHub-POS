import { useId } from 'react';
import { cn } from '@/lib/utils';

// Descriptions span the full mobile row. Decorative icons only occupy space on desktop.
export function SettingsOptionRow({ title, description, icon: Icon, control, className,
  stackControl = false, as: Component = 'div' }) {
  const id = useId();
  return (
    <Component className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-x-4', className)}>
      {Icon && (
        <Icon className="hidden size-5 shrink-0 text-black sm:row-span-2 sm:block" strokeWidth={2} aria-hidden="true" />
      )}
      <span id={`${id}-title`} className={cn('min-w-0 self-center text-sm font-bold text-gray-800',
        !Icon && 'sm:col-span-2', stackControl && 'col-span-2 sm:col-span-1', stackControl && !Icon && 'sm:col-span-2')}>
        {title}
      </span>
      <span className={cn('col-start-2 row-start-1 flex min-h-6 shrink-0 items-center justify-end self-center sm:col-start-3 sm:row-span-2',
        stackControl && 'col-span-2 col-start-1 row-start-3 w-full justify-start sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:w-auto sm:justify-end')}>
        {control({ 'aria-labelledby': `${id}-title`, 'aria-describedby': description ? `${id}-description` : undefined })}
      </span>
      {description && (
        <span id={`${id}-description`} className={cn('col-span-2 text-xs leading-relaxed text-gray-500 sm:col-span-1 sm:col-start-2',
          !Icon && 'sm:col-span-2 sm:col-start-1', stackControl && 'row-start-2')}>
          {description}
        </span>
      )}
    </Component>
  );
}
