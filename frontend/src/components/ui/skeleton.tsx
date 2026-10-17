import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse rounded-md bg-ink/[0.06] dark:bg-white/[0.07]",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
