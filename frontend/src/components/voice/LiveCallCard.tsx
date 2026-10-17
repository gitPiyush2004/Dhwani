import { PhoneForwarded } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNow } from "@/lib/hooks";
import { clockTime, cn } from "@/lib/utils";
import type { LiveCall } from "@/types";

const PHASE_LABEL: Record<LiveCall["phase"], string> = {
  greeting: "Greeting",
  booking: "Booking",
  question: "Answering",
  handoff: "Handing off",
};

/** Animated voice bars for a call that is happening right now. */
export function LiveWaveform({
  values,
  className,
  tone = "bg-primary",
}: {
  values: number[];
  className?: string;
  tone?: string;
}) {
  return (
    <div className={cn("flex h-10 items-center gap-[2px]", className)} aria-hidden="true">
      {values.map((v, i) => (
        <span
          key={i}
          className={cn("w-[2.5px] rounded-full", tone)}
          style={{
            height: `${Math.max(10, v)}%`,
            animation: "wave 0.9s ease-in-out infinite",
            animationDelay: `${(i % 12) * 0.07}s`,
          }}
        />
      ))}
    </div>
  );
}

export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn("relative flex h-2 w-2", className)} aria-hidden="true">
      <span className="absolute inline-flex h-full w-full animate-ring rounded-full bg-primary" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
    </span>
  );
}

export function LiveCallCard({
  call,
  onTakeover,
  className,
}: {
  call: LiveCall;
  onTakeover?: (call: LiveCall) => void;
  className?: string;
}) {
  const now = useNow();
  const elapsed = Math.max(call.durationSec, Math.floor((now - new Date(call.startedAt).getTime()) / 1000));

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-4 rounded-lg border border-line bg-surface p-4",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <LiveDot />
            <span className="label text-primary">Live</span>
            <span className="tnum font-mono text-[11px] text-ink3">{clockTime(elapsed)}</span>
          </div>
          <p className="mt-2 truncate text-[15px] font-semibold tracking-tight">{call.callerName}</p>
          <p className="tnum truncate font-mono text-[11.5px] text-ink3">{call.phone}</p>
        </div>
        <Badge variant="outline">{call.language}</Badge>
      </div>

      <LiveWaveform values={call.waveform} />

      <p className="line-clamp-2 text-[13px] leading-relaxed text-ink2">
        <span className="text-ink3">Agent: </span>
        {call.currentLine}
      </p>

      <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
        <div className="flex min-w-0 items-center gap-2">
          <Badge variant="violet">{PHASE_LABEL[call.phase]}</Badge>
          <span className="truncate text-[11.5px] text-ink3">{call.intent}</span>
        </div>
        <Button size="sm" variant="outline" onClick={() => onTakeover?.(call)}>
          <PhoneForwarded className="h-3.5 w-3.5" />
          Take over
        </Button>
      </div>
    </div>
  );
}
