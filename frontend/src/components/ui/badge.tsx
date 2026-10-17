import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.12em]",
  {
    variants: {
      variant: {
        default: "border-line bg-surface2 text-ink2",
        outline: "border-line text-ink3",
        lime: "border-transparent bg-primary text-primary-ink",
        ink: "border-transparent bg-ink text-bg",
        signal: "border-transparent bg-signal/15 text-signal",
        violet: "border-transparent bg-violet/15 text-violet",
        teal: "border-transparent bg-teal/15 text-teal",
        amber: "border-transparent bg-amber/20 text-amber",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
