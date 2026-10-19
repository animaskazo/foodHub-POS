import { Button } from './button';
import { cn } from '@/lib/utils';

// label is required: a tooltip/title alone is not an accessible name.
export function IconButton({ label, size = 'icon', variant = 'ghost', className, ...props }) {
  return (
    <Button
      {...props}
      variant={variant}
      size={size}
      aria-label={label}
      title={props.title || label}
      className={cn('max-md:min-h-11 max-md:min-w-11 p-0 [&_svg]:size-4', size === 'icon-lg' && '[&_svg]:size-5', className)}
    />
  );
}
