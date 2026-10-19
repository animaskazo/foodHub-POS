import { Toaster as SonnerToaster } from 'sonner';
import { CheckCircle2, CircleAlert, Info, TriangleAlert, Loader2, X } from 'lucide-react';

const icons = {
  success: <CheckCircle2 className="size-4" aria-hidden="true" />,
  error: <CircleAlert className="size-4" aria-hidden="true" />,
  info: <Info className="size-4" aria-hidden="true" />,
  warning: <TriangleAlert className="size-4" aria-hidden="true" />,
  loading: <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />,
  close: <X className="size-4" aria-hidden="true" />,
};

export function Toaster(props) {
  return <SonnerToaster {...props} icons={icons} />;
}
