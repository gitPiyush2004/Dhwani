import {
  ArrowRight,
  Check,
  MessageCircle,
  PhoneIncoming,
  PhoneMissed,
  Sparkles,
  UserRoundCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Animated voice bars                                                 */
/* ------------------------------------------------------------------ */

export function Bars({
  count = 7,
  className,
  tone = "bg-primary",
  animate = true,
}: {
  count?: number;
  className?: string;
  tone?: string;
  animate?: boolean;
}) {
  return (
    <span className={cn("flex items-end gap-[2px]", className)} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className={cn("w-[2.5px] rounded-full", tone)}
          style={{
            height: 6 + (i % 4) * 5,
            ...(animate
              ? { animation: "wave 0.95s ease-in-out infinite", animationDelay: `${i * 0.07}s` }
              : {}),
          }}
        />
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Product preview: a miniature of the real dashboard                  */
/* ------------------------------------------------------------------ */

export function MiniDashboard() {
  const nav = ["Overview", "Calls", "Appointments", "Agent", "Outbound"];
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-bg shadow-pop">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="h-2 w-2 rounded-full bg-signal/60" />
          <span className="h-2 w-2 rounded-full bg-amber/60" />
          <span className="h-2 w-2 rounded-full bg-teal/60" />
        </span>
        <span className="mx-auto rounded-full border border-line bg-surface px-3 py-0.5 font-mono text-[10px] text-ink3">
          app.aawazdoc.in
        </span>
      </div>

      <div className="grid gap-3 p-3 lg:grid-cols-[172px_1fr]">
        {/* sidebar */}
        <div className="hidden flex-col gap-1 rounded-lg bg-night p-2.5 lg:flex">
          <div className="mb-2 flex items-center gap-2 px-1">
            <span className="h-5 w-5 rounded-md bg-primary" />
            <span className="h-2 w-16 rounded-full bg-white/20" />
          </div>
          {nav.map((label, i) => (
            <div
              key={label}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5",
                i === 0 && "bg-primary"
              )}
            >
              <span
                className={cn("h-2.5 w-2.5 rounded-sm", i === 0 ? "bg-primary-ink/50" : "bg-white/25")}
              />
              <span
                className={cn(
                  "text-[9.5px] font-medium",
                  i === 0 ? "text-primary-ink" : "text-white/45"
                )}
              >
                {label}
              </span>
            </div>
          ))}
          <div className="mt-auto rounded-md border border-white/10 p-2">
            <span className="block h-1 w-full overflow-hidden rounded-full bg-white/10">
              <span className="block h-1 w-2/3 rounded-full bg-primary" />
            </span>
            <span className="mt-1.5 block font-mono text-[8px] text-white/40">342 / 500 min</span>
          </div>
        </div>

        {/* content */}
        <div className="min-w-0 space-y-3">
          <div className="relative overflow-hidden rounded-lg bg-night p-4 text-night-ink">
            <span className="dotgrid pointer-events-none absolute inset-0 text-primary/20" />
            <p className="label relative text-night-mute">Bookings recovered</p>
            <p className="relative mt-1 font-display text-[30px] leading-none">₹23.4k</p>
            <div className="relative mt-4 flex items-end gap-1" aria-hidden="true">
              {[38, 52, 34, 66, 48, 82, 58].map((h, i) => (
                <span
                  key={i}
                  className="flex-1 rounded-sm bg-primary/70"
                  style={{ height: h * 0.42 }}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              ["Calls today", "6"],
              ["Booked", "4"],
              ["Resolution", "82%"],
            ].map(([k, v]) => (
              <div key={k} className="min-w-0 rounded-lg border border-line bg-surface p-2.5">
                <p className="label truncate text-ink3">{k}</p>
                <p className="tnum mt-1 text-[13px] font-semibold">{v}</p>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-line bg-surface p-3">
            <div className="flex items-center justify-between">
              <p className="label text-ink3">Call volume</p>
              <span className="font-mono text-[9px] text-ink3">7d</span>
            </div>
            <svg viewBox="0 0 200 40" className="mt-2 h-10 w-full" preserveAspectRatio="none">
              <path
                d="M0,33 C20,31 30,18 50,21 C70,24 80,10 100,13 C120,16 130,5 150,8 C170,11 185,3 200,5"
                fill="none"
                stroke="#8FD117"
                strokeWidth="2"
              />
              <path
                d="M0,33 C20,31 30,18 50,21 C70,24 80,10 100,13 C120,16 130,5 150,8 C170,11 185,3 200,5 L200,40 L0,40 Z"
                fill="#8FD117"
                opacity="0.16"
              />
            </svg>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ring rounded-full bg-primary" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <span className="text-[11.5px] font-medium">Anjali Nair</span>
            <span className="truncate text-[10.5px] text-ink3">booking in Hinglish</span>
            <Bars className="ml-auto h-6" count={12} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* How it works: one small visual per step                             */
/* ------------------------------------------------------------------ */

export function StepVisual({ kind }: { kind: "ring" | "wave" | "slot" | "whatsapp" }) {
  if (kind === "ring")
    return (
      <div className="relative flex h-16 items-center justify-center">
        <span className="absolute h-12 w-12 rounded-full border border-primary/40" />
        <span
          className="absolute h-12 w-12 rounded-full border border-primary/30"
          style={{ animation: "ring 2s ease-out infinite" }}
        />
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-ink">
          <PhoneIncoming className="h-4 w-4" />
        </span>
      </div>
    );

  if (kind === "wave")
    return (
      <div className="flex h-16 items-center justify-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-night">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
        </span>
        <Bars count={9} className="h-8" />
      </div>
    );

  if (kind === "slot")
    return (
      <div className="flex h-16 items-center justify-center">
        <div className="grid grid-cols-3 gap-1">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              className={cn(
                "h-3.5 w-7 rounded-sm border",
                i === 4 ? "border-transparent bg-primary" : "border-line bg-surface"
              )}
            />
          ))}
        </div>
      </div>
    );

  return (
    <div className="flex h-16 items-center justify-center">
      <div className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-2">
        <MessageCircle className="h-3.5 w-3.5 text-teal" />
        <span className="font-mono text-[9.5px] text-ink3">Confirmation sent</span>
        <Check className="h-3 w-3 text-teal" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Feature visuals                                                     */
/* ------------------------------------------------------------------ */

export function FeatureVisual({
  kind,
}: {
  kind: "calendar" | "languages" | "handoff" | "recovery";
}) {
  if (kind === "calendar")
    return (
      <div className="rounded-lg border border-line bg-bg p-3">
        <div className="grid grid-cols-5 gap-1" aria-hidden="true">
          {[1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1].map((filled, i) => (
            <span
              key={i}
              className={cn(
                "h-5 rounded-sm",
                filled ? "bg-primary/70" : "border border-line bg-surface"
              )}
            />
          ))}
        </div>
        <p className="mt-3 font-mono text-[10px] text-ink3">09:30 booked by AI · 12:00 held</p>
      </div>
    );

  if (kind === "languages")
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {["Hindi", "English", "Hinglish"].map((l) => (
            <span
              key={l}
              className="rounded-full border border-line bg-bg px-2.5 py-1 font-mono text-[9.5px] text-ink2"
            >
              {l}
            </span>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <span className="h-5 w-5 rounded-md bg-night" />
          <p className="rounded-lg rounded-bl-sm border border-line bg-bg px-2.5 py-1.5 text-[11px]">
            Mujhe kal doctor ko dikhana hai
          </p>
        </div>
      </div>
    );

  if (kind === "handoff")
    return (
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 rounded-full border border-line bg-bg px-2.5 py-1.5">
          <Sparkles className="h-3 w-3 text-ink3" />
          <span className="font-mono text-[9.5px] text-ink2">Agent</span>
        </span>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink3" />
        <span className="flex items-center gap-1.5 rounded-full border border-amber/40 bg-amber/10 px-2.5 py-1.5">
          <UserRoundCheck className="h-3 w-3 text-amber" />
          <span className="font-mono text-[9.5px] text-amber">Front desk</span>
        </span>
      </div>
    );

  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-1.5 rounded-full border border-line bg-bg px-2.5 py-1.5">
        <PhoneMissed className="h-3 w-3 text-signal" />
        <span className="font-mono text-[9.5px] text-ink2">Missed</span>
      </span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink3" />
      <span className="flex items-center gap-1.5 rounded-full border border-teal/40 bg-teal/10 px-2.5 py-1.5">
        <MessageCircle className="h-3 w-3 text-teal" />
        <span className="font-mono text-[9.5px] text-teal">Recovery SMS</span>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Agent: review queue + accuracy                                      */
/* ------------------------------------------------------------------ */

export function AgentVisual() {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-amber/40 bg-surface p-4">
        <div className="flex items-center justify-between">
          <span className="label text-ink3">Review queue</span>
          <span className="tnum font-mono text-[10px] text-amber">7</span>
        </div>
        <div className="mt-3 space-y-2">
          {[
            ["Urgent case", "Handed to human"],
            ["Incomplete call", "Call dropped"],
          ].map(([a, b]) => (
            <div key={a} className="flex items-center gap-2.5 rounded-md border border-line bg-bg p-2.5">
              <span className="h-6 w-6 shrink-0 rounded-full bg-amber/15" />
              <div className="min-w-0">
                <p className="truncate text-[11.5px] font-medium">{a}</p>
                <p className="truncate text-[10px] text-ink3">{b}</p>
              </div>
              <span className="ml-auto shrink-0 rounded-full border border-line px-2 py-0.5 font-mono text-[9px] text-ink3">
                teach
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="flex items-center justify-between">
          <span className="label text-ink3">Accuracy</span>
          <span className="font-mono text-[10px] text-teal">86% → 94%</span>
        </div>
        <svg viewBox="0 0 200 40" className="mt-3 h-12 w-full" preserveAspectRatio="none">
          <path
            d="M0,32 C25,30 35,24 55,22 C75,20 90,16 110,13 C130,10 150,7 175,5 L200,4"
            fill="none"
            stroke="#8FD117"
            strokeWidth="2"
          />
        </svg>
      </div>
    </div>
  );
}
