import { isValidElement } from 'react';
import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';

const Tooltip = ({ text, children, enabled = true }) => {
  if (!enabled || !text) return <>{children}</>;
  return (
    <TooltipPrimitive.Provider>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger render={isValidElement(children) ? children : <span>{children}</span>} />
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Positioner side="top" sideOffset={8} className="z-[110]">
            <TooltipPrimitive.Popup className="max-w-64 rounded-md bg-gray-800 px-2.5 py-1.5 text-xs font-medium text-white shadow-md">
              {text}
            </TooltipPrimitive.Popup>
          </TooltipPrimitive.Positioner>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
};

export default Tooltip;
