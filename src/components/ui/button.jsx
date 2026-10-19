import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { Loader2 } from "lucide-react"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 items-center justify-center pointer-coarse:min-h-11 rounded-full border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] motion-reduce:transition-none outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-black bg-white text-black hover:bg-gray-100",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "border-black text-black bg-transparent hover:bg-black/5 dark:border-white dark:text-white dark:hover:bg-white/10 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        "destructive-solid": "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/30",
        link: "text-primary underline-offset-4 hover:underline",
      },
      shape: { pill: "rounded-full", rounded: "rounded-xl" },
      size: {
        default:
          "h-10 gap-2 px-5",
        xs: "h-7 gap-1.5 px-3 text-xs",
        sm: "h-8 gap-2 px-4 text-xs",
        lg: "h-12 gap-2 px-6 text-base",
        pos: "h-14 gap-2 px-6 text-base font-semibold",
        touch: "h-12 gap-2 px-6 text-base",
        icon: "size-10",
        "icon-xs":
          "size-7",
        "icon-sm":
          "size-8",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      shape: "pill",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  shape = "pill",
  loading = false,
  loadingText,
  disabled,
  children,
  type = "button",
  ...props
}) {
  return (
    <ButtonPrimitive
      {...props}
      type={type}
      data-slot="button"
      data-size={size}
      data-variant={variant}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size, shape, className }))}
    >
      {loading ? (
        <>
          <span className="invisible grid items-center" aria-hidden="true">
            <span className="col-start-1 row-start-1 inline-flex items-center justify-center gap-2">{children}</span>
            <span className="col-start-1 row-start-1 inline-flex items-center justify-center gap-2"><span className="size-4" />{loadingText || 'Procesando…'}</span>
          </span>
          <span className="absolute inset-0 inline-flex items-center justify-center gap-2">
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            <span>{loadingText || 'Procesando…'}</span>
          </span>
        </>
      ) : loadingText ? (
        <span className="grid items-center">
          <span className="invisible col-start-1 row-start-1 inline-flex items-center gap-2" aria-hidden="true"><span className="size-4" />{loadingText}</span>
          <span className="col-start-1 row-start-1 inline-flex items-center justify-center gap-2">{children}</span>
        </span>
      ) : children}
    </ButtonPrimitive>
  );
}

export { Button, buttonVariants }
