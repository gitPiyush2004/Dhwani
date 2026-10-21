import { cn } from "@/lib/utils";

const BARS = [
  { h: 9, d: 0 },
  { h: 15, d: 0.1 },
  { h: 21, d: 0.2 },
  { h: 13, d: 0.3 },
  { h: 7, d: 0.4 },
];

/**
 * The Dhwani mark: lime voice bars on an ink tile. Animation is opt-in so
 * avatars inside transcripts and chat bubbles stay static and cheap to paint.
 */
export function WaveMark({
  className,
  animated = false,
  bars = BARS,
}: {
  className?: string;
  animated?: boolean;
  bars?: { h: number; d: number }[];
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-night ring-1 ring-white/10",
        className
      )}
    >
      <span className="flex items-center gap-[2.5px]">
        {bars.map((b, i) => (
          <span
            key={i}
            className="w-[2.5px] rounded-full bg-primary"
            style={
              animated
                ? { height: b.h, animation: `wave 1.2s ease-in-out infinite`, animationDelay: `${b.d}s` }
                : { height: b.h }
            }
          />
        ))}
      </span>
    </span>
  );
}

export function Logo({
  className,
  showText = true,
  markClassName,
  onDark = false,
}: {
  className?: string;
  showText?: boolean;
  markClassName?: string;
  onDark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <WaveMark animated className={markClassName} />
      {showText && (
        <span
          className={cn("text-[17px] font-semibold tracking-[-0.02em]", onDark ? "text-night-ink" : "text-ink")}
        >
          Dhwani
        </span>
      )}
    </span>
  );
}
