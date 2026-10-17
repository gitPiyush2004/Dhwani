import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, MessageCircle, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar } from "@/components/ui/atoms";
import {
  cancelAppointment,
  completeAppointment,
  createAppointment,
  rescheduleAppointment,
} from "@/lib/api";
import { fullDateTime, timeLabel } from "@/lib/datetime";
import { STATUS_META } from "@/lib/outcome";
import { formatSlot, isSlotTaken, slotLabel, slotToDate, slotsFor, toDateInputValue } from "@/lib/slots";
import type { Appointment, Doctor } from "@/types";

function Field({
  label,
  htmlFor,
  error,
  children,
  hint,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p role="alert" className="mt-1 text-[11.5px] font-medium text-signal">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-[11.5px] text-ink3">{hint}</p>
      ) : null}
    </div>
  );
}

const EMPTY = { patientName: "", phone: "", doctorId: "", date: "", slot: "", reason: "" };

export function NewAppointmentDialog({
  open,
  onOpenChange,
  doctors,
  appointments,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  doctors: Doctor[];
  appointments: Appointment[];
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");

  const doctor = doctors.find((d) => d.id === form.doctorId);
  const date = form.date ? new Date(`${form.date}T00:00:00`) : null;
  const slots = doctor && date ? slotsFor(doctor, date) : [];

  useEffect(() => {
    if (!open) {
      setForm(EMPTY);
      setErrors({});
      setServerError("");
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: createAppointment,
    onSuccess: () => {
      toast.success("Appointment booked", { description: "A WhatsApp confirmation is queued." });
      qc.invalidateQueries({ queryKey: ["appointments"] });
      onOpenChange(false);
    },
    onError: (e: unknown) =>
      setServerError(e instanceof Error ? e.message : "Could not book this appointment."),
  });

  function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setServerError("");
    const e: Record<string, string> = {};
    if (!form.patientName.trim()) e.patientName = "Patient name is required.";
    if (!/^[+0-9][0-9\s-]{8,}$/.test(form.phone.trim())) e.phone = "Enter a valid phone number.";
    if (!form.doctorId) e.doctorId = "Choose a doctor.";
    if (!form.date) e.date = "Choose a date.";
    if (!form.slot) e.slot = "Choose a slot.";
    if (!form.reason.trim()) e.reason = "Add a reason for the visit.";
    setErrors(e);
    if (Object.keys(e).length || !doctor || !date) return;
    mutation.mutate({
      patientName: form.patientName.trim(),
      phone: form.phone.trim(),
      doctorId: doctor.id,
      startsAt: slotToDate(date, form.slot).toISOString(),
      durationMin: doctor.slotDurationMin,
      reason: form.reason.trim(),
      bookedBy: "staff",
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="scrollbar-slim max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New appointment</DialogTitle>
          <DialogDescription>Book a patient in from the front desk.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Patient name" htmlFor="na-name" error={errors.patientName}>
              <Input
                id="na-name"
                value={form.patientName}
                onChange={(e) => setForm({ ...form, patientName: e.target.value })}
                placeholder="Rahul Mehta"
                aria-invalid={!!errors.patientName}
              />
            </Field>
            <Field label="Phone" htmlFor="na-phone" error={errors.phone}>
              <Input
                id="na-phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+91 98765 43210"
                aria-invalid={!!errors.phone}
              />
            </Field>
          </div>

          <Field label="Doctor" htmlFor="na-doctor" error={errors.doctorId}>
            <Select value={form.doctorId} onValueChange={(v) => setForm({ ...form, doctorId: v, slot: "" })}>
              <SelectTrigger id="na-doctor">
                <SelectValue placeholder="Choose a doctor" />
              </SelectTrigger>
              <SelectContent>
                {doctors.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name} · {d.speciality}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date" htmlFor="na-date" error={errors.date}>
              <Input
                id="na-date"
                type="date"
                value={form.date}
                min={toDateInputValue(new Date())}
                onChange={(e) => setForm({ ...form, date: e.target.value, slot: "" })}
                aria-invalid={!!errors.date}
              />
            </Field>
            <Field
              label="Slot"
              htmlFor="na-slot"
              error={errors.slot}
              hint={
                !doctor || !date
                  ? "Pick a doctor and date first"
                  : slots.length === 0
                  ? "No slots on this day"
                  : "Booked slots are marked"
              }
            >
              <Select
                value={form.slot}
                onValueChange={(v) => setForm({ ...form, slot: v })}
                disabled={!doctor || !date || slots.length === 0}
              >
                <SelectTrigger id="na-slot">
                  <SelectValue placeholder="Choose a slot" />
                </SelectTrigger>
                <SelectContent>
                  {slots.map((s) => {
                    const taken = isSlotTaken(appointments, doctor!.id, slotToDate(date!, s));
                    return (
                      <SelectItem key={s} value={s}>
                        {slotLabel(s)}
                        {taken ? " · booked" : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Reason for visit" htmlFor="na-reason" error={errors.reason}>
            <Textarea
              id="na-reason"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="Fever and cold"
              aria-invalid={!!errors.reason}
            />
          </Field>

          {serverError && (
            <p
              role="alert"
              className="rounded-md border border-signal/30 bg-signal/[0.08] px-3 py-2 text-[13px] font-medium text-signal"
            >
              {serverError}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Booking" : "Book appointment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RescheduleDialog({
  appointment,
  doctors,
  appointments,
  onOpenChange,
}: {
  appointment: Appointment | null;
  doctors: Doctor[];
  appointments: Appointment[];
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [dateStr, setDateStr] = useState("");
  const [slot, setSlot] = useState("");
  const [serverError, setServerError] = useState("");

  useEffect(() => {
    if (appointment) {
      const d = new Date(appointment.startsAt);
      setDateStr(toDateInputValue(d));
      setSlot(formatSlot(d.getHours() * 60 + d.getMinutes()));
      setServerError("");
    }
  }, [appointment]);

  const doctor = doctors.find((d) => d.id === appointment?.doctorId);
  const date = dateStr ? new Date(`${dateStr}T00:00:00`) : null;
  const slots = doctor && date ? slotsFor(doctor, date) : [];

  const mutation = useMutation({
    mutationFn: ({ id, startsAt }: { id: string; startsAt: string }) =>
      rescheduleAppointment(id, startsAt),
    onSuccess: () => {
      toast.success("Appointment rescheduled", {
        description: "An updated WhatsApp confirmation has been sent.",
      });
      qc.invalidateQueries({ queryKey: ["appointments"] });
      onOpenChange(false);
    },
    onError: (e: unknown) =>
      setServerError(e instanceof Error ? e.message : "Could not reschedule."),
  });

  return (
    <Dialog open={!!appointment} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reschedule</DialogTitle>
          <DialogDescription>
            {appointment
              ? `${appointment.patientName} · currently ${fullDateTime(appointment.startsAt)}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="New date" htmlFor="rs-date">
            <Input
              id="rs-date"
              type="date"
              value={dateStr}
              min={toDateInputValue(new Date())}
              onChange={(e) => {
                setDateStr(e.target.value);
                setSlot("");
              }}
            />
          </Field>
          <Field
            label="New slot"
            htmlFor="rs-slot"
            hint={slots.length === 0 ? "No slots on this day" : "Booked slots are marked"}
          >
            <Select value={slot} onValueChange={setSlot} disabled={!doctor || !date || slots.length === 0}>
              <SelectTrigger id="rs-slot">
                <SelectValue placeholder="Choose a slot" />
              </SelectTrigger>
              <SelectContent>
                {slots.map((s) => {
                  const taken = isSlotTaken(appointments, doctor!.id, slotToDate(date!, s), appointment?.id);
                  return (
                    <SelectItem key={s} value={s}>
                      {slotLabel(s)}
                      {taken ? " · booked" : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </Field>
          {serverError && (
            <p
              role="alert"
              className="rounded-md border border-signal/30 bg-signal/[0.08] px-3 py-2 text-[13px] font-medium text-signal"
            >
              {serverError}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep as is
          </Button>
          <Button
            disabled={!appointment || !slot || mutation.isPending}
            onClick={() =>
              appointment &&
              date &&
              mutation.mutate({ id: appointment.id, startsAt: slotToDate(date, slot).toISOString() })
            }
          >
            {mutation.isPending ? "Saving" : "Confirm reschedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CancelDialog({
  appointment,
  onOpenChange,
}: {
  appointment: Appointment | null;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (id: string) => cancelAppointment(id),
    onSuccess: () => {
      toast.success("Appointment cancelled", { description: "The patient has been told on WhatsApp." });
      qc.invalidateQueries({ queryKey: ["appointments"] });
      onOpenChange(false);
    },
    onError: () => toast.error("Couldn't cancel this appointment."),
  });

  return (
    <Dialog open={!!appointment} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel this appointment?</DialogTitle>
          <DialogDescription>
            {appointment ? `${appointment.patientName} · ${fullDateTime(appointment.startsAt)}. ` : ""}
            This frees the slot and notifies the patient. It cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep appointment
          </Button>
          <Button
            variant="signal"
            disabled={mutation.isPending}
            onClick={() => appointment && mutation.mutate(appointment.id)}
          >
            {mutation.isPending ? "Cancelling" : "Yes, cancel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AppointmentDetailsDialog({
  appointment,
  doctor,
  onOpenChange,
  onReschedule,
  onCancel,
}: {
  appointment: Appointment | null;
  doctor?: Doctor;
  onOpenChange: (o: boolean) => void;
  onReschedule: (a: Appointment) => void;
  onCancel: (a: Appointment) => void;
}) {
  const qc = useQueryClient();
  const complete = useMutation({
    mutationFn: (id: string) => completeAppointment(id),
    onSuccess: () => {
      toast.success("Marked as completed");
      qc.invalidateQueries({ queryKey: ["appointments"] });
      onOpenChange(false);
    },
    onError: () => toast.error("Couldn't update this appointment."),
  });

  return (
    <Dialog open={!!appointment} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {appointment && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2.5">
                <Avatar name={appointment.patientName} />
                {appointment.patientName}
              </DialogTitle>
              <DialogDescription className="tnum font-mono text-[12px]">
                {appointment.phone} · {fullDateTime(appointment.startsAt)} ·{" "}
                {appointment.durationMin} min
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap gap-1.5">
              <Badge variant={STATUS_META[appointment.status].variant}>
                {STATUS_META[appointment.status].label}
              </Badge>
              {appointment.bookedBy === "ai" ? (
                <Badge variant="lime" className="gap-1">
                  <Sparkles className="h-3 w-3" /> Booked by AI
                </Badge>
              ) : (
                <Badge variant="default">Front desk</Badge>
              )}
              <Badge variant="outline" className="gap-1.5">
                <MessageCircle className="h-3 w-3" />
                {appointment.whatsappSent ? "WhatsApp sent" : "Not sent"}
              </Badge>
            </div>

            <dl className="grid gap-2.5 rounded-lg border border-line bg-surface2/60 p-4 text-[13px]">
              <div className="flex justify-between gap-4">
                <dt className="text-ink3">Doctor</dt>
                <dd className="font-medium">
                  {doctor ? `${doctor.name} · ${doctor.speciality}` : "Not assigned"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink3">Time</dt>
                <dd className="tnum font-mono font-medium">{timeLabel(appointment.startsAt)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink3">Reason</dt>
                <dd className="text-right font-medium">{appointment.reason}</dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => onReschedule(appointment)}>
                <CalendarClock className="h-3.5 w-3.5" /> Reschedule
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={appointment.status === "completed"}
                onClick={() => complete.mutate(appointment.id)}
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Mark completed
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-signal hover:bg-signal/10 hover:text-signal"
                disabled={appointment.status === "cancelled"}
                onClick={() => onCancel(appointment)}
              >
                <X className="h-3.5 w-3.5" /> Cancel
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
