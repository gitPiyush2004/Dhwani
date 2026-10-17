import { useEffect, useMemo, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, clockTime } from "@/lib/utils";

/**
 * Simulated playback clock. The real product drives this from the <audio>
 * element's timeupdate event; everything else about the UI stays the same.
 */
export function usePlayback(durationSec: number) {
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setT((prev) => {
        const next = prev + 0.1;
        if (next >= durationSec) {
          setPlaying(false);
          return 0;
        }
        return next;
      });
    }, 100);
    return () => clearInterval(id);
  }, [playing, durationSec]);

  const seek = (sec: number) => setT(Math.max(0, Math.min(durationSec, sec)));

  return {
    playing,
    t,
    seek,
    reset: () => {
      setT(0);
      setPlaying(false);
    },
    toggle: () => setPlaying((p) => !p),
  };
}

/** Scrubbable waveform. Click or use the arrow keys to seek. */
export function Waveform({
  values,
  progress,
  onSeek,
  className,
  compact = false,
}: {
  values: number[];
  progress: number;
  onSeek?: (fraction: number) => void;
  className?: string;
  compact?: boolean;
}) {
  const bars = useMemo(() => values.slice(0, compact ? 64 : 96), [values, compact]);

  const seekFromEvent = (clientX: number, el: HTMLElement) => {
    if (!onSeek) return;
    const rect = el.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)));
  };

  return (
    <div
      role={onSeek ? "slider" : undefined}
      tabIndex={onSeek ? 0 : undefined}
      aria-label={onSeek ? "Seek within the recording" : undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      onKeyDown={
        onSeek
          ? (e) => {
              if (e.key === "ArrowRight") onSeek(Math.min(1, progress + 0.05));
              if (e.key === "ArrowLeft") onSeek(Math.max(0, progress - 0.05));
            }
          : undefined
      }
      onClick={onSeek ? (e) => seekFromEvent(e.clientX, e.currentTarget) : undefined}
      className={cn(
        "flex h-14 items-center gap-[2px]",
        onSeek && "cursor-pointer rounded-sm",
        className
      )}
    >
      {bars.map((v, i) => {
        const played = i / bars.length <= progress;
        return (
          <span
            key={i}
            className={cn(
              "flex-1 rounded-full transition-colors duration-150",
              played ? "bg-ink" : "bg-ink/15 dark:bg-white/15"
            )}
            style={{ height: `${Math.max(8, v)}%` }}
          />
        );
      })}
    </div>
  );
}

export function TransportBar({
  playing,
  t,
  duration,
  onToggle,
  onReset,
}: {
  playing: boolean;
  t: number;
  duration: number;
  onToggle: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <Button
        size="icon"
        variant="ink"
        onClick={onToggle}
        aria-label={playing ? "Pause recording" : "Play recording"}
        className="h-11 w-11"
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
      <div className="flex items-center gap-1.5">
        <Button size="icon-sm" variant="ghost" onClick={onReset} aria-label="Restart recording">
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>
      <span className="tnum font-mono text-[12px] text-ink3">
        {clockTime(t)} / {clockTime(duration)}
      </span>
    </div>
  );
}
