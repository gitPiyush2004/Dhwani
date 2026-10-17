import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { isSameDay } from "date-fns";
import {
  ArrowRight,
  CalendarClock,
  Check,
  Clock,
  Flag,
  Inbox,
  PhoneCall,
  PhoneMissed,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Eyebrow, PageHeader, Tile } from "@/components/Stat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, Progress } from "@/components/ui/atoms";
import { LiveCallCard } from "@/components/voice/LiveCallCard";
import {
  ChartSkeleton,
  EmptyState,
  ErrorState,
  ListSkeleton,
  TileRowSkeleton,
} from "@/components/StateViews";
import {
  getAgentMetrics,
  getAppointments,
  getCallOutcomes,
  getCalls,
  getCallsPerDay,
  getDashboardStats,
  getDoctors,
  getLiveCalls,
  getOnboarding,
  takeoverCall,
} from "@/lib/api";
import { useCountUp } from "@/lib/hooks";
import { dayLabel, timeLabel } from "@/lib/datetime";
import { CHART_COLORS, OUTCOME_META, STATUS_META } from "@/lib/outcome";
import { cn, formatDuration, inrShort, pct } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-line bg-surface p-2.5 text-[12px] shadow-pop">
      {label && <p className="label mb-1.5 text-ink3">{label}</p>}
      {payload.map((p: any) => (
        <p key={p.dataKey ?? p.name} className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: p.color ?? p.payload?.fill }}
          />
          <span className="text-ink3">{p.name}</span>
          <span className="tnum ml-auto font-mono font-medium">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

export default function Overview() {
  const qc = useQueryClient();
  const statsQ = useQuery({ queryKey: ["dashboard-stats"], queryFn: getDashboardStats });
  const perDayQ = useQuery({ queryKey: ["calls-per-day"], queryFn: () => getCallsPerDay(7) });
  const outcomesQ = useQuery({ queryKey: ["call-outcomes"], queryFn: getCallOutcomes });
  const callsQ = useQuery({ queryKey: ["calls"], queryFn: () => getCalls() });
  const apptsQ = useQuery({ queryKey: ["appointments"], queryFn: () => getAppointments() });
  const doctorsQ = useQuery({ queryKey: ["doctors"], queryFn: getDoctors });
  const liveQ = useQuery({ queryKey: ["live-calls"], queryFn: getLiveCalls });
  const metricsQ = useQuery({ queryKey: ["agent-metrics"], queryFn: getAgentMetrics });
  const onboardingQ = useQuery({ queryKey: ["onboarding"], queryFn: getOnboarding });

  const revenue = statsQ.data?.revenueRecovered ?? 0;
  const animatedRevenue = useCountUp(revenue, 1100);

  const today = new Date();
  const recentCalls = (callsQ.data ?? []).slice(0, 5);
  const todayAppts = (apptsQ.data ?? [])
    .filter((a) => isSameDay(new Date(a.startsAt), today) && a.status !== "cancelled")
    .slice(0, 5);
  const needsReview = (callsQ.data ?? []).filter((c) => !c.resolved).slice(0, 5);
  const doctorName = (id: string) =>
    doctorsQ.data?.find((d) => d.id === id)?.name ?? "Unknown";
  const totalOutcome = (outcomesQ.data ?? []).reduce((s, o) => s + o.value, 0);

  const onboarding = onboardingQ.data ?? [];
  const done = onboarding.filter((s) => s.done).length;

  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title="Your front desk, running itself"
        description="What the AI receptionist handled, and what still needs a human."
        actions={
          <Badge variant="lime" className="gap-1.5 py-1">
            <Sparkles className="h-3 w-3" /> Live
          </Badge>
        }
      />

      {/* Hero panel + live rail */}
      <div className="grid gap-3 xl:grid-cols-3">
        <Card className="relative overflow-hidden border-night bg-night text-night-ink xl:col-span-2">
          <div
            aria-hidden="true"
            className="dotgrid pointer-events-none absolute inset-0 text-primary/20"
            style={{ maskImage: "radial-gradient(120% 90% at 100% 0%, black, transparent 70%)" }}
          />
          <CardContent className="relative flex h-full flex-col justify-between gap-8 p-6 sm:p-8">
            {statsQ.isLoading ? (
              <div className="space-y-4">
                <div className="h-3 w-24 animate-pulse rounded bg-white/10" />
                <div className="h-16 w-52 animate-pulse rounded bg-white/10" />
              </div>
            ) : statsQ.isError ? (
              <p className="text-[13px] text-night-mute">Could not load today's numbers.</p>
            ) : (
              <>
                <div>
                  <Eyebrow className="text-night-mute">
                    Bookings recovered, last 7 days
                  </Eyebrow>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="tnum font-display text-[56px] leading-[0.9] tracking-[-0.02em] sm:text-[76px]">
                      ₹{inrShort(Math.round(animatedRevenue))}
                    </span>
                  </div>
                  <p className="mt-3 max-w-md text-[13px] leading-relaxed text-night-mute">
                    {statsQ.data!.bookedWhileClosed} appointments were booked while the clinic was
                    closed, and {statsQ.data!.missedRecovered} missed calls were recovered.
                  </p>

                  {/* answered calls, last 7 days */}
                  <div className="mt-7 flex items-end gap-2" aria-hidden="true">
                    {(perDayQ.data ?? []).map((d) => (
                      <div key={d.date} className="flex flex-1 flex-col items-center gap-2">
                        <div className="flex h-20 w-full items-end">
                          <div
                            className="w-full rounded-sm bg-primary/70"
                            style={{ height: `${Math.max(10, (d.answered / 5) * 100)}%` }}
                          />
                        </div>
                        <span className="label text-night-mute">{d.label.charAt(0)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-t border-night-line pt-6 sm:grid-cols-4">
                  {[
                    { k: "Calls answered", v: String(statsQ.data!.callsToday) },
                    { k: "Booked today", v: String(statsQ.data!.appointmentsBooked) },
                    { k: "Agent resolution", v: pct(metricsQ.data?.resolutionRate ?? 0) },
                    {
                      k: "Avg handle time",
                      v: formatDuration(metricsQ.data?.avgHandleSec ?? statsQ.data!.avgDurationSec),
                    },
                  ].map((s) => (
                    <div key={s.k}>
                      <dt className="label text-night-mute">{s.k}</dt>
                      <dd className="tnum mt-1.5 text-xl font-semibold">{s.v}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Eyebrow>On the line now</Eyebrow>
            <Link
              to="/app/calls"
              className="text-[12px] font-medium text-ink3 transition-colors hover:text-ink"
            >
              Call log
            </Link>
          </div>
          {liveQ.isLoading ? (
            <ListSkeleton rows={2} />
          ) : (liveQ.data ?? []).length === 0 ? (
            <EmptyState
              icon={PhoneCall}
              title="No calls right now"
              description="The line is quiet. The agent is still answering 24/7."
              className="flex-1"
            />
          ) : (
            <div className="space-y-3">
              {(liveQ.data ?? []).slice(0, 2).map((call) => (
                <LiveCallCard
                  key={call.id}
                  call={call}
                  onTakeover={(c) => {
                    void takeoverCall(c.id).then(() => {
                      toast.success(`You are on the line with ${c.callerName}`, {
                        description: "Demo only. No real call is bridged.",
                      });
                      qc.invalidateQueries({ queryKey: ["live-calls"] });
                    });
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tile strip */}
      <div className="mt-3">
        {statsQ.isLoading ? (
          <TileRowSkeleton />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Tile
              label="Calls today"
              value={String(statsQ.data!.callsToday)}
              delta={statsQ.data!.trends.callsToday}
              icon={PhoneCall}
              hint="vs. same time yesterday"
            />
            <Tile
              label="Appointments booked"
              value={String(statsQ.data!.appointmentsBooked)}
              delta={statsQ.data!.trends.appointmentsBooked}
              icon={CalendarClock}
              hint="by the AI today"
            />
            <Tile
              label="Missed calls recovered"
              value={String(statsQ.data!.missedRecovered)}
              delta={statsQ.data!.trends.missedRecovered}
              icon={PhoneMissed}
              hint="recovery SMS sent"
            />
            <Tile
              label="Avg handle time"
              value={formatDuration(statsQ.data!.avgDurationSec)}
              delta={statsQ.data!.trends.avgDurationSec}
              invert
              icon={Clock}
              hint="shorter is usually better"
            />
          </div>
        )}
      </div>

      {/* Charts */}
      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        {perDayQ.isLoading ? (
          <ChartSkeleton className="xl:col-span-2" />
        ) : perDayQ.isError ? (
          <ErrorState className="xl:col-span-2" title="Couldn't load call volume" onRetry={() => perDayQ.refetch()} />
        ) : (
          <Card className="xl:col-span-2">
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Call volume</CardTitle>
                <p className="text-[12px] text-ink3">Answered vs. escalated, last 7 days</p>
              </div>
              <div className="flex items-center gap-4">
                {[
                  { l: "Answered", c: CHART_COLORS.accent },
                  { l: "Needed human", c: CHART_COLORS.signal },
                ].map((k) => (
                  <span key={k.l} className="flex items-center gap-1.5 text-[11.5px] text-ink3">
                    <span className="h-2 w-2 rounded-full" style={{ background: k.c }} />
                    {k.l}
                  </span>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-[230px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={perDayQ.data} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART_COLORS.accent} stopOpacity={0.4} />
                        <stop offset="100%" stopColor={CHART_COLORS.accent} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gB" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART_COLORS.signal} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={CHART_COLORS.signal} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="label"
                      stroke="rgb(var(--ink-3))"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="rgb(var(--ink-3))"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ stroke: "rgb(var(--line))" }} />
                    <Area
                      type="monotone"
                      dataKey="answered"
                      name="Answered"
                      stroke={CHART_COLORS.accent}
                      strokeWidth={2}
                      isAnimationActive={false}
                      fill="url(#gA)"
                    />
                    <Area
                      type="monotone"
                      dataKey="neededHuman"
                      name="Needed human"
                      stroke={CHART_COLORS.signal}
                      strokeWidth={2}
                      isAnimationActive={false}
                      fill="url(#gB)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {outcomesQ.isLoading ? (
          <ChartSkeleton />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Where calls landed</CardTitle>
              <p className="text-[12px] text-ink3">{totalOutcome} calls in the last 7 days</p>
            </CardHeader>
            <CardContent>
              <div className="relative h-[168px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={outcomesQ.data}
                      dataKey="value"
                      nameKey="label"
                      innerRadius={54}
                      outerRadius={80}
                      paddingAngle={2}
                      isAnimationActive={false}
                      stroke="none"
                    >
                      {(outcomesQ.data ?? []).map((o) => (
                        <Cell key={o.key} fill={CHART_COLORS[o.key]} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="tnum font-display text-3xl leading-none">{totalOutcome}</span>
                  <span className="label mt-1 text-ink3">calls</span>
                </div>
              </div>
              <ul className="mt-4 space-y-2">
                {(outcomesQ.data ?? []).map((o) => (
                  <li key={o.key} className="flex items-center justify-between text-[12.5px]">
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: CHART_COLORS[o.key] }}
                      />
                      {o.label}
                    </span>
                    <span className="tnum font-mono text-ink2">{o.value}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Bento: needs review / today / recent */}
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Card className="border-amber/40">
          <CardHeader className="flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-amber/15 text-amber">
                <Flag className="h-3.5 w-3.5" />
              </span>
              <CardTitle>Needs review</CardTitle>
            </div>
            <span className="tnum font-mono text-[11px] text-ink3">
              {metricsQ.data?.needsReview ?? 0}
            </span>
          </CardHeader>
          <CardContent className="space-y-1">
            {callsQ.isLoading ? (
              <div className="space-y-2">
                {[0, 1].map((i) => (
                  <div key={i} className="h-12 animate-pulse rounded-md bg-ink/[0.05]" />
                ))}
              </div>
            ) : needsReview.length === 0 ? (
              <EmptyState
                icon={Check}
                title="Nothing to review"
                description="Every call was completed by the agent."
              />
            ) : (
              needsReview.map((c) => (
                <Link
                  key={c.id}
                  to={`/app/calls?call=${c.id}`}
                  className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-surface2"
                >
                  <Avatar name={c.callerName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{c.callerName}</p>
                    <p className="truncate text-[11.5px] text-ink3">{c.intent}</p>
                  </div>
                  <Badge variant={OUTCOME_META[c.outcome].variant}>
                    {OUTCOME_META[c.outcome].label}
                  </Badge>
                </Link>
              ))
            )}
            <Button asChild variant="ghost" size="sm" className="mt-2 w-full justify-between text-ink3">
              <Link to="/app/agent">
                Open the review queue <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Today's appointments</CardTitle>
            <Link
              to="/app/appointments"
              className="text-[12px] font-medium text-ink3 transition-colors hover:text-ink"
            >
              Calendar
            </Link>
          </CardHeader>
          <CardContent className="space-y-1">
            {apptsQ.isLoading ? (
              <ListSkeleton rows={4} />
            ) : todayAppts.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="No appointments today"
                description="Book one from the calendar."
              />
            ) : (
              todayAppts.map((a) => (
                <div key={a.id} className="flex items-center gap-3 rounded-md px-2 py-2">
                  <span className="tnum w-14 shrink-0 font-mono text-[12px] text-ink2">
                    {timeLabel(a.startsAt)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{a.patientName}</p>
                    <p className="truncate text-[11.5px] text-ink3">
                      {doctorName(a.doctorId)} · {a.reason}
                    </p>
                  </div>
                  <Badge variant={STATUS_META[a.status].variant}>
                    {STATUS_META[a.status].label}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent calls</CardTitle>
            <Link
              to="/app/calls"
              className="text-[12px] font-medium text-ink3 transition-colors hover:text-ink"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent className="space-y-1">
            {callsQ.isLoading ? (
              <ListSkeleton rows={4} />
            ) : recentCalls.length === 0 ? (
              <EmptyState icon={Inbox} title="No calls yet" />
            ) : (
              recentCalls.map((c) => (
                <Link
                  key={c.id}
                  to={`/app/calls?call=${c.id}`}
                  className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-surface2"
                >
                  <Avatar name={c.callerName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{c.callerName}</p>
                    <p className="tnum truncate text-[11.5px] text-ink3">
                      {dayLabel(c.startedAt)} · {timeLabel(c.startedAt)} ·{" "}
                      {formatDuration(c.durationSec)}
                    </p>
                  </div>
                  <Badge variant={OUTCOME_META[c.outcome].variant}>
                    {OUTCOME_META[c.outcome].label}
                  </Badge>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Onboarding */}
      {onboarding.length > 0 && done < onboarding.length && (
        <Card className="mt-3">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Finish setting up</CardTitle>
              <p className="text-[12px] text-ink3">
                {done} of {onboarding.length} done. You are close to going live.
              </p>
            </div>
            <span className="tnum font-mono text-[12px] text-ink3">
              {Math.round((done / onboarding.length) * 100)}%
            </span>
          </CardHeader>
          <CardContent>
            <Progress value={done} max={onboarding.length} className="mb-5" />
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              {onboarding.map((step) => (
                <div
                  key={step.id}
                  className={cn(
                    "rounded-md border p-3",
                    step.done ? "border-line bg-surface2/60" : "border-ink/20 bg-surface"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded-full",
                        step.done ? "bg-primary text-primary-ink" : "border border-line"
                      )}
                    >
                      {step.done && <Check className="h-2.5 w-2.5" strokeWidth={4} />}
                    </span>
                    <p className="truncate text-[12.5px] font-medium">{step.label}</p>
                  </div>
                  <p className="mt-1.5 text-[11.5px] leading-snug text-ink3">{step.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <p className="mt-6 text-center text-[11.5px] text-ink3">
        Numbers shown are illustrative demo data. Revenue is estimated from booked consultation fees.
      </p>
    </div>
  );
}
