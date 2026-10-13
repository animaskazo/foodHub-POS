import { Loader2 } from 'lucide-react';

const sizeMap = {
  xs: 'h-3 w-3',
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
  xl: 'h-10 w-10',
  '2xl': 'h-12 w-12',
};

export function Spinner({
  size = 'md',
  variant = 'center',
  className = '',
}) {
  const baseClasses = 'animate-spin text-black';
  const sizeClasses = sizeMap[size] || sizeMap.md;

  const variantClasses = {
    center: 'mx-auto',
    inline: 'inline-block',
    button: 'mr-2 shrink-0',
    absolute: 'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
  }[variant] || '';

  return (
    <Loader2
      className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
      aria-hidden="true"
    />
  );
}

export function FullScreenSpinner({ size = 'lg', className = '' }) {
  return (
    <div className="flex items-center justify-center min-h-[200px] w-full" role="status" aria-label="Cargando...">
      <Spinner size={size} variant="center" className={className} />
    </div>
  );
}

export function ButtonSpinner({ size = 'sm', className = '' }) {
  return <Spinner size={size} variant="button" className={className} />;
}

export function InlineSpinner({ size = 'sm', className = '' }) {
  return <Spinner size={size} variant="inline" className={className} />;
}