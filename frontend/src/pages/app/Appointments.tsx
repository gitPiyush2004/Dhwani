import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format, isSameDay, isToday, startOfWeek } from "date-fns";
import {
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  CalendarX,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  List as ListIcon,
  MessageCircle,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/Stat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar } from "@/components/ui/atoms";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/StateViews";
import {
  AppointmentDetailsDialog,
  CancelDialog,
  NewAppointmentDialog,
  RescheduleDialog,
} from "@/components/appointments/Dialogs";
import { completeAppointment, getAppointments, getDoctors } from "@/lib/api";
import { timeLabel } from "@/lib/datetime";
import { STATUS_META } from "@/lib/outcome";
import { useMediaQuery } from "@/lib/hooks";
import type { Appointment } from "@/types";
import { cn } from "@/lib/utils";

const HOURS = Array.from({ length: 11 }, (_, i) => 9 + i);

const STATUS_BAR: Record<Appointment["status"], string> = {
  confirmed: "border-l-primary",
  rescheduled: "border-l-violet",
  cancelled: "border-l-signal",
  completed: "border-l-line",
};

function WhatsappTag({ sent }: { sent: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-mono text-[10.5px] uppercase tracking-[0.1em]",
        sent ? "text-teal" : "text-ink3"
      )}
      title={sent ? "WhatsApp confirmation sent" : "No confirmation sent"}
    >
      <MessageCircle className="h-3 w-3" />
      {sent ? "Sent" : "Not sent"}
    </span>
  );
}

export default function Appointments() {
  const qc = useQueryClient();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [searchParams, setSearchParams] = useSearchParams();

  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [newOpen, setNewOpen] = useState(false);
  const [details, setDetails] = useState<Appointment | null>(null);
  const [reschedule, setReschedule] = useState<Appointment | null>(null);
  const [cancel, setCancel] = useState<Appointment | null>(null);

  // Phones get the agenda list; the week grid is a horizontal scroll.
  useEffect(() => {
    if (!isDesktop) setView("list");
  }, [isDesktop]);

  // Deep link from the command palette.
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setNewOpen(true);
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  const apptsQ = useQuery({ queryKey: ["appointments"], queryFn: () => getAppointments() });
  const doctorsQ = useQuery({ queryKey: ["doctors"], queryFn: getDoctors });

  const doctors = useMemo(() => doctorsQ.data ?? [], [doctorsQ.data]);
  const appointments = useMemo(() => apptsQ.data ?? [], [apptsQ.data]);

  const complete = useMutation({
    mutationFn: (id: string) => completeAppointment(id),
    onSuccess: () => {
      toast.success("Marked as completed");
      qc.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: () => toast.error("Couldn't update this appointment."),
  });

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekEnd = addDays(weekStart, 7);
  const weekAppts = appointments.filter((a) => {
    const t = new Date(a.startsAt);
    return t >= weekStart && t < weekEnd;
  });

  const doctorName = (id: string) => doctors.find((d) => d.id === id)?.name ?? "Unknown";
  const shortDoctor = (id: string) =>
    doctors.find((d) => d.id === id)?.name.replace("Dr. ", "") ?? "Unknown";

  return (
    <div>
      <PageHeader
        eyebrow="Appointments"
        title="The week, without the double bookings"
        description="Booked by the AI or your front desk, all in one calendar."
        actions={
          <Button onClick={() => setNewOpen(true)}>
            <CalendarPlus className="h-4 w-4" /> New appointment
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={view} onValueChange={(v) => setView(v as "calendar" | "list")}>
          <TabsList>
            <TabsTrigger value="calendar">
              <CalendarDays className="h-3.5 w-3.5" /> Calendar
            </TabsTrigger>
            <TabsTrigger value="list">
              <ListIcon className="h-3.5 w-3.5" /> List
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous week"
            onClick={() => setWeekStart((w) => addDays(w, -7))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="tnum min-w-[152px] text-center font-mono text-[12px] text-ink2">
            {format(weekStart, "d MMM")} to {format(addDays(weekStart, 6), "d MMM yyyy")}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next week"
            onClick={() => setWeekStart((w) => addDays(w, 7))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
          >
            Today
          </Button>
        </div>
      </div>

      {apptsQ.isLoading || doctorsQ.isLoading ? (
        <TableSkeleton rows={10} />
      ) : apptsQ.isError ? (
        <ErrorState
          title="Couldn't load appointments"
          message="The calendar didn't load. Check your connection and try again."
          onRetry={() => apptsQ.refetch()}
        />
      ) : weekAppts.length === 0 ? (
        <EmptyState
          icon={CalendarX}
          title="Nothing booked this week"
          description="Try another week, or add an appointment manually."
          action={
            <Button size="sm" onClick={() => setNewOpen(true)}>
              <CalendarPlus className="h-4 w-4" /> New appointment
            </Button>
          }
        />
      ) : view === "calendar" ? (
        <Card className="overflow-hidden">
          <div className="scrollbar-slim overflow-x-auto">
            <div className="min-w-[900px]">
              <div className="grid grid-cols-[74px_repeat(7,minmax(0,1fr))] border-b border-line">
                <div className="label p-3 text-ink3">Time</div>
                {days.map((d) => (
                  <div
                    key={d.toISOString()}
                    className={cn(
                      "border-l border-line px-2 py-3 text-center",
                      isToday(d) && "bg-primary/[0.07]"
                    )}
                  >
                    <p className="label text-ink3">{format(d, "EEE")}</p>
                    <p
                      className={cn(
                        "tnum mt-1 inline-flex h-7 w-7 items-center justify-center rounded-full font-display text-[17px]",
                        isToday(d) ? "bg-primary text-primary-ink" : "text-ink"
                      )}
                    >
                      {format(d, "d")}
                    </p>
                  </div>
                ))}
              </div>

              {HOURS.map((h) => (
                <div
                  key={h}
                  className="grid grid-cols-[74px_repeat(7,minmax(0,1fr))] border-b border-line last:border-0"
                >
                  <div className="tnum p-3 text-right font-mono text-[11px] text-ink3">
                    {format(new Date(2020, 0, 1, h), "h a")}
                  </div>
                  {days.map((d) => {
                    const cell = weekAppts.filter(
                      (a) =>
                        isSameDay(new Date(a.startsAt), d) &&
                        new Date(a.startsAt).getHours() === h
                    );
                    return (
                      <div
                        key={d.toISOString()}
                        className={cn(
                          "min-h-[68px] space-y-1.5 border-l border-line p-1.5",
                          isToday(d) && "bg-primary/[0.04]"
                        )}
                      >
                        {cell.map((a) => (
                          <button
                            key={a.id}
                            onClick={() => setDetails(a)}
                            className={cn(
                              "w-full rounded-md border border-line border-l-2 bg-surface p-2 text-left transition-colors hover:bg-surface2",
                              STATUS_BAR[a.status],
                              a.status === "cancelled" && "opacity-55"
                            )}
                          >
                            <p className="tnum flex items-center gap-1 font-mono text-[10.5px] text-ink2">
                              {timeLabel(a.startsAt)}
                              {a.bookedBy === "ai" && <Sparkles className="h-2.5 w-2.5 text-primary-ink" />}
                            </p>
                            <p className="mt-0.5 truncate text-[12px] font-medium">{a.patientName}</p>
                            <p className="truncate text-[10.5px] text-ink3">{shortDoctor(a.doctorId)}</p>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          {days.map((d) => {
            const dayAppts = weekAppts
              .filter((a) => isSameDay(new Date(a.startsAt), d))
              .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
            if (dayAppts.length === 0) return null;
            return (
              <section key={d.toISOString()}>
                <div className="mb-3 flex items-center gap-3">
                  <h2 className="text-[14px] font-semibold tracking-tight">
                    {format(d, "EEEE, d MMM")}
                  </h2>
                  {isToday(d) && <Badge variant="lime">Today</Badge>}
                  <span className="tnum font-mono text-[11px] text-ink3">
                    {dayAppts.length} booked
                  </span>
                  <span className="h-px flex-1 bg-line" />
                </div>
                <div className="space-y-2">
                  {dayAppts.map((a) => (
                    <Card key={a.id}>
                      <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
                        <div className="flex items-center gap-3 lg:w-44 lg:shrink-0">
                          <Avatar name={a.patientName} />
                          <div>
                            <p className="tnum font-mono text-[12.5px] font-medium">
                              {timeLabel(a.startsAt)}
                            </p>
                            <p className="text-[11px] text-ink3">{a.durationMin} min</p>
                          </div>
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] font-medium">{a.patientName}</p>
                          <p className="truncate text-[12px] text-ink3">
                            {doctorName(a.doctorId)} · {a.reason}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={STATUS_META[a.status].variant}>
                            {STATUS_META[a.status].label}
                          </Badge>
                          {a.bookedBy === "ai" ? (
                            <Badge variant="lime" className="gap-1">
                              <Sparkles className="h-2.5 w-2.5" /> AI
                            </Badge>
                          ) : (
                            <Badge variant="default">Front desk</Badge>
                          )}
                          <WhatsappTag sent={a.whatsappSent} />
                        </div>

                        <div className="flex items-center gap-1 lg:shrink-0">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Reschedule ${a.patientName}`}
                            onClick={() => setReschedule(a)}
                          >
                            <CalendarClock className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Mark ${a.patientName} completed`}
                            disabled={a.status === "completed"}
                            onClick={() => complete.mutate(a.id)}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-signal hover:bg-signal/10 hover:text-signal"
                            aria-label={`Cancel ${a.patientName}`}
                            disabled={a.status === "cancelled"}
                            onClick={() => setCancel(a)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <NewAppointmentDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        doctors={doctors}
        appointments={appointments}
      />
      <AppointmentDetailsDialog
        appointment={details}
        doctor={doctors.find((d) => d.id === details?.doctorId)}
        onOpenChange={(o) => !o && setDetails(null)}
        onReschedule={(a) => {
          setDetails(null);
          setReschedule(a);
        }}
        onCancel={(a) => {
          setDetails(null);
          setCancel(a);
        }}
      />
      <RescheduleDialog
        appointment={reschedule}
        doctors={doctors}
        appointments={appointments}
        onOpenChange={(o) => !o && setReschedule(null)}
      />
      <CancelDialog appointment={cancel} onOpenChange={(o) => !o && setCancel(null)} />
    </div>
  );
}
