import { Menu } from '@base-ui/react/menu';
import { Button } from './button';
import { cn } from '@/lib/utils';

export function ActionDropdown({ actions, children, label, iconOnly = false }) {
  return (
    <Menu.Root>
      <Menu.Trigger render={<Button variant={iconOnly ? 'ghost' : 'outline'} size={iconOnly ? 'icon' : 'default'}
        aria-label={label} data-icon-button={iconOnly || undefined} className={iconOnly ? 'max-md:min-h-11 max-md:min-w-11 p-0' : undefined} />}
        onClick={(event) => event.stopPropagation()}>
        {children}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align="end" className="z-[100]">
          <Menu.Popup className="min-w-48 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg outline-none"
            onClick={(event) => event.stopPropagation()}>
            {actions.map((action, index) => (
              <Menu.Item key={action.label || index} disabled={action.disabled} onClick={action.onClick}
                className={cn('flex min-h-10 max-md:min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
                  action.destructive && 'text-destructive data-[highlighted]:bg-destructive/10')}>
                {action.icon && <span aria-hidden="true">{action.icon}</span>}
                {action.label}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
