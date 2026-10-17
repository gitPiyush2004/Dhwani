import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Check,
  Flag,
  Gauge,
  ListChecks,
  PhoneOutgoing,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/atoms";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/StateViews";
import { WaveMark } from "@/components/Logo";
import { TransportBar, Waveform, usePlayback } from "@/components/voice/player";
import { getCall, markCallFollowedUp, markCallResolved } from "@/lib/api";
import { mockWaveform } from "@/lib/mockData";
import { fullDateTime } from "@/lib/datetime";
import { LANGUAGE_META, OUTCOME_META } from "@/lib/outcome";
import { cn, clockTime, formatDuration, pct } from "@/lib/utils";

export function CallDrawer({
  callId,
  open,
  onOpenChange,
}: {
  callId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const transcriptRef = useRef<HTMLDivElement>(null);

  const { data: call, isLoading, isError, refetch } = useQuery({
    queryKey: ["call", callId],
    queryFn: () => getCall(callId as string),
    enabled: open && !!callId,
  });

  const duration = call?.durationSec ?? 0;
  const { playing, t, seek, reset, toggle } = usePlayback(duration);

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId]);

  const activeIndex = useMemo(() => {
    if (!call) return -1;
    let idx = -1;
    call.transcript.forEach((line, i) => {
      if (line.startSec <= t) idx = i;
    });
    return idx;
  }, [call, t]);

  // Follow along with the audio while it plays.
  useEffect(() => {
    if (!playing || activeIndex < 0) return;
    const el = transcriptRef.current?.querySelector<HTMLElement>(`[data-line="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIndex, playing]);

  const followUp = useMutation({
    mutationFn: (id: string) => markCallFollowedUp(id),
    onSuccess: () => {
      toast.success("Marked as followed up");
      qc.invalidateQueries({ queryKey: ["call", callId] });
      qc.invalidateQueries({ queryKey: ["calls"] });
    },
    onError: () => toast.error("Couldn't update this call. Please retry."),
  });

  const resolve = useMutation({
    mutationFn: (id: string) => markCallResolved(id),
    onSuccess: () => {
      toast.success("Marked as resolved", {
        description: "It has left the review queue.",
      });
      qc.invalidateQueries({ queryKey: ["call", callId] });
      qc.invalidateQueries({ queryKey: ["calls"] });
      qc.invalidateQueries({ queryKey: ["agent-metrics"] });
    },
    onError: () => toast.error("Couldn't update this call. Please retry."),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="overflow-hidden p-0">
        {isLoading ? (
          <div className="space-y-4 p-6">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-40 w-full rounded-lg" />
          </div>
        ) : isError || !call ? (
          <div className="p-6">
            <ErrorState title="Couldn't load this call" onRetry={() => refetch()} />
          </div>
        ) : (
          <>
            <SheetHeader className="border-b border-line p-5 pr-12">
              <div className="flex items-start gap-3">
                <Avatar name={call.callerName} size="lg" />
                <div className="min-w-0 flex-1">
                  <SheetTitle className="truncate">{call.callerName}</SheetTitle>
                  <SheetDescription className="tnum truncate font-mono text-[12px]">
                    {call.phone} · {fullDateTime(call.startedAt)}
                  </SheetDescription>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge variant={OUTCOME_META[call.outcome].variant}>
                      {OUTCOME_META[call.outcome].label}
                    </Badge>
                    <Badge variant={LANGUAGE_META[call.language].variant}>{call.language}</Badge>
                    <Badge variant="outline">{call.intent}</Badge>
                    <Badge variant={call.resolved ? "teal" : "amber"}>
                      {call.resolved ? "Resolved by AI" : "Needs review"}
                    </Badge>
                    {call.needsFollowUp && (
                      <Badge variant="signal" className="gap-1">
                        <Flag className="h-3 w-3" /> Follow up
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </SheetHeader>

            <div className="scrollbar-slim flex-1 space-y-6 overflow-y-auto p-5">
              {/* Player */}
              <section className="rounded-lg border border-line bg-surface2/60 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="label text-ink3">Recording</span>
                  <span className="tnum flex items-center gap-1.5 font-mono text-[11px] text-ink3">
                    <Gauge className="h-3 w-3" />
                    {pct(call.confidence)} confidence
                  </span>
                </div>
                <Waveform
                  values={mockWaveform}
                  progress={duration ? t / duration : 0}
                  onSeek={(f) => seek(f * duration)}
                />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <TransportBar
                    playing={playing}
                    t={t}
                    duration={duration}
                    onToggle={toggle}
                    onReset={reset}
                  />
                  <span className="tnum font-mono text-[11px] text-ink3">
                    {formatDuration(duration)}
                  </span>
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-ink3">
                  Tap the waveform or any line to jump. Placeholder audio: the real recording comes
                  from the voice agent.
                </p>
              </section>

              {/* Summary */}
              <section>
                <h4 className="label mb-2 text-ink3">Summary</h4>
                <p className="text-[13.5px] leading-relaxed text-ink2">{call.summary}</p>
              </section>

              {/* What the agent did */}
              <section>
                <h4 className="label mb-2 flex items-center gap-1.5 text-ink3">
                  <ListChecks className="h-3.5 w-3.5" /> What the agent did
                </h4>
                <ul className="space-y-1.5">
                  {call.aiActions.map((a) => (
                    <li key={a} className="flex items-start gap-2 text-[13px] text-ink2">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal" />
                      {a}
                    </li>
                  ))}
                </ul>
              </section>

              {/* Extracted */}
              <section>
                <h4 className="label mb-2 text-ink3">Captured details</h4>
                <dl className="grid gap-2.5 rounded-lg border border-line bg-surface2/60 p-4 text-[13px]">
                  {[
                    { label: "Name", value: call.extracted.name },
                    { label: "Reason for visit", value: call.extracted.reason },
                    { label: "Booked slot", value: call.extracted.slot },
                  ].map((row) => (
                    <div key={row.label} className="flex items-start justify-between gap-4">
                      <dt className="text-ink3">{row.label}</dt>
                      <dd className="text-right font-medium">
                        {row.value ?? <span className="text-ink3">Not captured</span>}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>

              {/* Transcript */}
              <section>
                <h4 className="label mb-3 text-ink3">Transcript</h4>
                {call.transcript.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-line p-4 text-[13px] text-ink3">
                    No transcript. This call was never answered.
                  </p>
                ) : (
                  <div ref={transcriptRef} className="space-y-3">
                    {call.transcript.map((line, i) => {
                      const isAI = line.speaker === "ai";
                      const active = i === activeIndex;
                      return (
                        <button
                          key={i}
                          data-line={i}
                          onClick={() => seek(line.startSec)}
                          className={cn(
                            "flex w-full items-start gap-2.5 rounded-lg p-1.5 text-left transition-colors",
                            active ? "bg-primary/10" : "hover:bg-surface2"
                          )}
                        >
                          {isAI ? (
                            <WaveMark className="mt-0.5 h-6 w-6 rounded-md" />
                          ) : (
                            <Avatar name={call.callerName} size="sm" className="mt-0.5" />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="mb-1 flex items-center gap-2">
                              <span className="label text-ink3">
                                {isAI ? "AawazDoc" : call.callerName.split(" ")[0]}
                              </span>
                              <span className="tnum font-mono text-[10px] text-ink3">
                                {clockTime(line.startSec)}
                              </span>
                              {active && (
                                <span className="label text-primary">playing</span>
                              )}
                            </span>
                            <span
                              className={cn(
                                "block rounded-lg px-3 py-2 text-[13px] leading-relaxed",
                                isAI
                                  ? "border border-line bg-surface text-ink"
                                  : "bg-ink text-bg"
                              )}
                            >
                              {line.text}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>

            <div className="flex gap-2 border-t border-line p-4">
              <Button
                className="flex-1"
                variant={call.needsFollowUp ? "primary" : "outline"}
                disabled={!call.needsFollowUp || followUp.isPending}
                onClick={() => followUp.mutate(call.id)}
              >
                {call.needsFollowUp ? (
                  <>
                    <Check className="h-4 w-4" /> Mark followed up
                  </>
                ) : (
                  <>
                    <BadgeCheck className="h-4 w-4" /> Followed up
                  </>
                )}
              </Button>
              {!call.resolved && (
                <Button
                  variant="ink"
                  className="flex-1"
                  disabled={resolve.isPending}
                  onClick={() => resolve.mutate(call.id)}
                >
                  <Sparkles className="h-4 w-4" /> Mark resolved
                </Button>
              )}
              <Button
                variant="outline"
                className="flex-1"
                onClick={() =>
                  toast.info(`Calling ${call.callerName}`, {
                    description: `${call.phone}. This is a demo, no call is placed.`,
                  })
                }
              >
                <PhoneOutgoing className="h-4 w-4" /> Call back
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
