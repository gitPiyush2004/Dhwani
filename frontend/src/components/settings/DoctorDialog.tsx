import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/toggles";
import { createDoctor, updateDoctor } from "@/lib/api";
import type { AvailabilityBlock, Doctor } from "@/types";

type Range = { start: string; end: string };
type DayState = Record<number, Range[]>;

const DAYS = [
  { d: 1, name: "Monday" },
  { d: 2, name: "Tuesday" },
  { d: 3, name: "Wednesday" },
  { d: 4, name: "Thursday" },
  { d: 5, name: "Friday" },
  { d: 6, name: "Saturday" },
  { d: 0, name: "Sunday" },
];

function toDayState(blocks: AvailabilityBlock[]): DayState {
  const out: DayState = {};
  for (const day of DAYS) out[day.d] = [];
  for (const b of blocks) (out[b.day] ??= []).push({ start: b.start, end: b.end });
  return out;
}

function fromDayState(state: DayState): AvailabilityBlock[] {
  return DAYS.flatMap((day) =>
    (state[day.d] ?? []).map((r) => ({ day: day.d, start: r.start, end: r.end }))
  );
}

export function DoctorDialog({
  doctor,
  open,
  onOpenChange,
}: {
  doctor: Doctor | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [speciality, setSpeciality] = useState("");
  const [fee, setFee] = useState("500");
  const [slotDurationMin, setSlotDurationMin] = useState("15");
  const [days, setDays] = useState<DayState>(() => toDayState([]));
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setName(doctor?.name ?? "");
    setSpeciality(doctor?.speciality ?? "");
    setFee(String(doctor?.fee ?? 500));
    setSlotDurationMin(String(doctor?.slotDurationMin ?? 15));
    setDays(toDayState(doctor?.availability ?? []));
    setErrors({});
  }, [doctor, open]);

  const mutation = useMutation({
    mutationFn: (payload: Omit<Doctor, "id">) =>
      doctor ? updateDoctor(doctor.id, payload) : createDoctor(payload),
    onSuccess: () => {
      toast.success(doctor ? "Doctor updated" : "Doctor added");
      qc.invalidateQueries({ queryKey: ["doctors"] });
      onOpenChange(false);
    },
    onError: () => toast.error("Couldn't save this doctor. Please retry."),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Name is required.";
    if (!speciality.trim()) errs.speciality = "Speciality is required.";
    if (!fee || Number(fee) <= 0) errs.fee = "Enter a valid fee.";
    if (!slotDurationMin || Number(slotDurationMin) <= 0) errs.slotDurationMin = "Enter a slot length.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    mutation.mutate({
      name: name.trim(),
      speciality: speciality.trim(),
      fee: Number(fee),
      slotDurationMin: Number(slotDurationMin),
      availability: fromDayState(days),
    });
  }

  const setRange = (day: number, idx: number, patch: Partial<Range>) =>
    setDays((s) => ({ ...s, [day]: s[day].map((r, i) => (i === idx ? { ...r, ...patch } : r)) }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="scrollbar-slim max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{doctor ? "Edit doctor" : "Add doctor"}</DialogTitle>
          <DialogDescription>
            The agent uses these timings and fees when booking callers.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="doc-name">Name</Label>
              <Input
                id="doc-name"
                className="mt-1.5"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Dr. Anil Sharma"
                aria-invalid={!!errors.name}
              />
              {errors.name && <p className="mt-1 text-[11.5px] text-signal">{errors.name}</p>}
            </div>
            <div>
              <Label htmlFor="doc-spec">Speciality</Label>
              <Input
                id="doc-spec"
                className="mt-1.5"
                value={speciality}
                onChange={(e) => setSpeciality(e.target.value)}
                placeholder="General Physician"
                aria-invalid={!!errors.speciality}
              />
              {errors.speciality && (
                <p className="mt-1 text-[11.5px] text-signal">{errors.speciality}</p>
              )}
            </div>
            <div>
              <Label htmlFor="doc-fee">Consultation fee (₹)</Label>
              <Input
                id="doc-fee"
                type="number"
                min={0}
                className="mt-1.5"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                aria-invalid={!!errors.fee}
              />
              {errors.fee && <p className="mt-1 text-[11.5px] text-signal">{errors.fee}</p>}
            </div>
            <div>
              <Label htmlFor="doc-slot">Slot length (minutes)</Label>
              <Input
                id="doc-slot"
                type="number"
                min={5}
                step={5}
                className="mt-1.5"
                value={slotDurationMin}
                onChange={(e) => setSlotDurationMin(e.target.value)}
                aria-invalid={!!errors.slotDurationMin}
              />
              {errors.slotDurationMin && (
                <p className="mt-1 text-[11.5px] text-signal">{errors.slotDurationMin}</p>
              )}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[13px] font-medium text-ink2">Weekly availability</p>
            <div className="space-y-2">
              {DAYS.map((day) => {
                const ranges = days[day.d] ?? [];
                const on = ranges.length > 0;
                return (
                  <div key={day.d} className="rounded-md border border-line p-3">
                    <div className="flex items-center justify-between gap-3">
                      <label htmlFor={`day-${day.d}`} className="text-[13px] font-medium">
                        {day.name}
                      </label>
                      <Switch
                        id={`day-${day.d}`}
                        checked={on}
                        onCheckedChange={(v) =>
                          setDays((s) => ({
                            ...s,
                            [day.d]: v ? [{ start: "09:00", end: "13:00" }] : [],
                          }))
                        }
                      />
                    </div>
                    {on && (
                      <div className="mt-3 space-y-2">
                        {ranges.map((r, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <label className="sr-only" htmlFor={`s-${day.d}-${idx}`}>
                              {day.name} start
                            </label>
                            <Input
                              id={`s-${day.d}-${idx}`}
                              type="time"
                              value={r.start}
                              onChange={(e) => setRange(day.d, idx, { start: e.target.value })}
                              className="w-auto"
                            />
                            <span className="text-[12px] text-ink3">to</span>
                            <label className="sr-only" htmlFor={`e-${day.d}-${idx}`}>
                              {day.name} end
                            </label>
                            <Input
                              id={`e-${day.d}-${idx}`}
                              type="time"
                              value={r.end}
                              onChange={(e) => setRange(day.d, idx, { end: e.target.value })}
                              className="w-auto"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Remove ${day.name} hours`}
                              onClick={() =>
                                setDays((s) => ({
                                  ...s,
                                  [day.d]: s[day.d].filter((_, i) => i !== idx),
                                }))
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5 text-signal" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setDays((s) => ({
                              ...s,
                              [day.d]: [...s[day.d], { start: "17:00", end: "20:00" }],
                            }))
                          }
                        >
                          <Plus className="h-3.5 w-3.5" /> Add hours
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving" : doctor ? "Save doctor" : "Add doctor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
