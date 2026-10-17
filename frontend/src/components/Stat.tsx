import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn, formatTrend } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

/** Uppercase mono eyebrow used above page titles and section headings. */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("label text-ink3", className)}>{children}</p>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <Eyebrow className="mb-2">{eyebrow}</Eyebrow>}
        <h1 className="font-display text-[30px] leading-[1.05] tracking-[-0.01em] sm:text-[38px]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-ink3">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Delta({
  value,
  invert = false,
  suffix,
  className,
}: {
  value: number;
  invert?: boolean;
  suffix?: string;
  className?: string;
}) {
  const flat = !value;
  const up = value > 0;
  const good = invert ? !up : up;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-mono text-[11px] font-medium",
        flat ? "text-ink3" : good ? "text-teal" : "text-signal",
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {formatTrend(value)}
      {suffix && <span className="text-ink3">{suffix}</span>}
    </span>
  );
}

/**
 * The big number. Serif display, tabular figures, one supporting line.
 * This is the element the eye should land on first.
 */
export function HeroStat({
  label,
  value,
  prefix,
  suffix,
  delta,
  invert,
  footnote,
  className,
}: {
  label: string;
  value: string;
  prefix?: string;
  suffix?: string;
  delta?: number;
  invert?: boolean;
  footnote?: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <Eyebrow>{label}</Eyebrow>
      <div className="mt-3 flex items-baseline gap-1.5">
        {prefix && <span className="font-display text-2xl text-ink3">{prefix}</span>}
        <span className="tnum font-display text-[56px] leading-[0.9] tracking-[-0.02em] sm:text-[72px]">
          {value}
        </span>
        {suffix && <span className="font-display text-2xl text-ink3">{suffix}</span>}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {delta !== undefined && <Delta value={delta} invert={invert} suffix="vs last week" />}
        {footnote && <span className="text-[12px] text-ink3">{footnote}</span>}
      </div>
    </div>
  );
}

/** Compact metric tile for the supporting strip. */
export function Tile({
  label,
  value,
  delta,
  invert,
  icon: Icon,
  hint,
  className,
}: {
  label: string;
  value: string;
  delta?: number;
  invert?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  hint?: string;
  className?: string;
}) {
  return (
    <Card className={cn("transition-colors hover:border-ink/25", className)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <Eyebrow>{label}</Eyebrow>
          {Icon && <Icon className="h-4 w-4 text-ink3" />}
        </div>
        <p className="tnum mt-2.5 text-2xl font-semibold tracking-tight">{value}</p>
        <div className="mt-1.5 flex items-center gap-2">
          {delta !== undefined && <Delta value={delta} invert={invert} />}
          {hint && <span className="truncate text-[11.5px] text-ink3">{hint}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
