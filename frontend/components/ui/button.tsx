import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default: "bg-amber text-[#0B0F14] hover:bg-amber/90",
        secondary: "border border-border bg-surface-2 text-text hover:border-border-strong hover:bg-surface-3",
        ghost: "text-muted hover:bg-surface-2 hover:text-text",
        outline: "border border-border text-text hover:bg-surface-2",
        chip: "h-6 rounded-sm border border-border bg-surface-2 px-2 text-label uppercase tracking-[0.08em] text-muted hover:border-border-strong hover:text-text",
        danger: "bg-sev-critical/15 text-sev-critical hover:bg-sev-critical/25",
        link: "text-amber underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-7 px-2.5 text-[12px]",
        md: "h-8 px-3 text-body",
        lg: "h-10 px-4 text-body",
        icon: "h-8 w-8",
        iconSm: "h-7 w-7",
        none: "",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size: variant === "chip" ? "none" : size }), className)} ref={ref} {...props} />;
});
Button.displayName = "Button";
