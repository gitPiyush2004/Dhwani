import { cn, initials, avatarTone } from "@/lib/utils";

export function Avatar({
  name,
  className,
  size = "md",
}: {
  name: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = {
    sm: "h-7 w-7 text-[10px]",
    md: "h-9 w-9 text-[11px]",
    lg: "h-12 w-12 text-sm",
  };
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-mono font-semibold tracking-wide",
        sizes[size],
        avatarTone(name),
        className
      )}
    >
      {initials(name)}
    </span>
  );
}

export function Progress({
  value,
  max = 100,
  className,
  tone = "bg-primary",
}: {
  value: number;
  max?: number;
  className?: string;
  tone?: string;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-ink/10 dark:bg-white/10", className)}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-700 ease-spring", tone)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-surface2 px-1.5 font-mono text-[10px] font-medium text-ink3",
        className
      )}
    >
      {children}
    </kbd>
  );
}

export function Separator({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-line", className)} />;
}
