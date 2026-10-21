import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Pencil,
  Phone,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Eyebrow, PageHeader } from "@/components/Stat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/toggles";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress, Separator } from "@/components/ui/atoms";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorState } from "@/components/StateViews";
import { DoctorDialog } from "@/components/settings/DoctorDialog";
import { IntegrationsPanel } from "@/components/settings/IntegrationsPanel";
import { WaveMark } from "@/components/Logo";
import { deleteDoctor, getClinic, getDoctors, getUsage, updateClinic } from "@/lib/api";
import type { Clinic, Doctor, Language } from "@/types";
import { cn, inr, pct } from "@/lib/utils";

const ALL_LANGUAGES: Language[] = ["Hindi", "English", "Hinglish"];
const TRIGGER_OPTIONS = ["emergency keywords", "patient asks for a human", "ai not confident"];
const DAY_NAMES: { d: number; name: string }[] = [
  { d: 1, name: "Mon" },
  { d: 2, name: "Tue" },
  { d: 3, name: "Wed" },
  { d: 4, name: "Thu" },
  { d: 5, name: "Fri" },
  { d: 6, name: "Sat" },
  { d: 0, name: "Sun" },
];

function availabilitySummary(doctor: Doctor): string {
  const byDay = new Map<number, string[]>();
  for (const b of doctor.availability) {
    const arr = byDay.get(b.day) ?? [];
    arr.push(`${b.start}-${b.end}`);
    byDay.set(b.day, arr);
  }
  if (byDay.size === 0) return "No hours set";
  return DAY_NAMES.filter((x) => byDay.has(x.d))
    .map((x) => `${x.name} ${byDay.get(x.d)!.join(", ")}`)
    .join(" · ");
}

export default function Settings() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("clinic");
  const [draft, setDraft] = useState<Clinic | null>(null);
  const [doctorDialogOpen, setDoctorDialogOpen] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Doctor | null>(null);

  const clinicQ = useQuery({ queryKey: ["clinic"], queryFn: getClinic });
  const doctorsQ = useQuery({ queryKey: ["doctors"], queryFn: getDoctors });
  const usageQ = useQuery({ queryKey: ["usage"], queryFn: getUsage });

  useEffect(() => {
    if (clinicQ.data) setDraft(structuredClone(clinicQ.data));
  }, [clinicQ.data]);

  const dirty = useMemo(
    () => !!draft && !!clinicQ.data && JSON.stringify(draft) !== JSON.stringify(clinicQ.data),
    [draft, clinicQ.data]
  );

  const save = useMutation({
    mutationFn: (patch: Partial<Clinic>) => updateClinic(patch),
    onSuccess: () => {
      toast.success("Changes saved", {
        description: "The agent will use these on the next call.",
      });
      qc.invalidateQueries({ queryKey: ["clinic"] });
    },
    onError: () => toast.error("Couldn't save changes. Please retry."),
  });

  const removeDoctor = useMutation({
    mutationFn: (id: string) => deleteDoctor(id),
    onSuccess: () => {
      toast.success("Doctor removed");
      qc.invalidateQueries({ queryKey: ["doctors"] });
      setDeleteTarget(null);
    },
    onError: () => toast.error("Couldn't remove this doctor."),
  });

  const patch = (p: Partial<Clinic>) => setDraft((d) => (d ? { ...d, ...p } : d));

  if (clinicQ.isLoading || !draft) {
    return (
      <div>
        <PageHeader eyebrow="Settings" title="Clinic settings" />
        <Skeleton className="h-10 w-80 rounded-full" />
        <Skeleton className="mt-5 h-72 w-full rounded-lg" />
      </div>
    );
  }

  if (clinicQ.isError) {
    return (
      <div>
        <PageHeader eyebrow="Settings" title="Clinic settings" />
        <ErrorState title="Couldn't load your settings" onRetry={() => clinicQ.refetch()} />
      </div>
    );
  }

  const usage = usageQ.data;

  return (
    <div className="pb-24">
      <PageHeader
        eyebrow="Settings"
        title="Clinic settings"
        description="Everything the receptionist uses to answer callers."
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="clinic">Clinic</TabsTrigger>
          <TabsTrigger value="doctors">Doctors</TabsTrigger>
          <TabsTrigger value="faqs">FAQs</TabsTrigger>
          <TabsTrigger value="escalation">Escalation</TabsTrigger>
          <TabsTrigger value="billing">Plan and usage</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
        </TabsList>

        {/* Clinic */}
        <TabsContent value="clinic">
          <div className="grid gap-3 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Clinic details</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="cl-name">Clinic name</Label>
                  <Input
                    id="cl-name"
                    className="mt-1.5"
                    value={draft.name}
                    onChange={(e) => patch({ name: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="cl-address">Address</Label>
                  <Input
                    id="cl-address"
                    className="mt-1.5"
                    value={draft.address}
                    onChange={(e) => patch({ address: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="cl-phone">Clinic phone</Label>
                  <Input
                    id="cl-phone"
                    className="mt-1.5"
                    value={draft.phone}
                    onChange={(e) => patch({ phone: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Languages</Label>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {ALL_LANGUAGES.map((lang) => {
                      const active = draft.languages.includes(lang);
                      return (
                        <button
                          key={lang}
                          type="button"
                          aria-pressed={active}
                          onClick={() =>
                            patch({
                              languages: active
                                ? draft.languages.filter((l) => l !== lang)
                                : [...draft.languages, lang],
                            })
                          }
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                            active
                              ? "border-transparent bg-ink text-bg"
                              : "border-line text-ink3 hover:border-ink/30 hover:text-ink"
                          )}
                        >
                          {active && <Check className="h-3 w-3" />}
                          {lang}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Greeting</CardTitle>
                <p className="text-[12px] text-ink3">What callers hear first</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="cl-greeting">Opening line</Label>
                  <Textarea
                    id="cl-greeting"
                    className="mt-1.5"
                    value={draft.greeting}
                    onChange={(e) => patch({ greeting: e.target.value })}
                  />
                </div>
                <div className="flex items-start gap-2.5 rounded-md border border-line bg-surface2/60 p-3">
                  <WaveMark className="h-6 w-6 rounded-md" />
                  <p className="text-[12.5px] leading-relaxed">{draft.greeting || "…"}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Doctors */}
        <TabsContent value="doctors">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[13px] text-ink3">
              {doctorsQ.data?.length ?? 0} doctors available for booking
            </p>
            <Button
              onClick={() => {
                setEditingDoctor(null);
                setDoctorDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Add doctor
            </Button>
          </div>
          {doctorsQ.isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-24 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {(doctorsQ.data ?? []).map((doc) => (
                <Card key={doc.id}>
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[14px] font-semibold">{doc.name}</p>
                        <Badge variant="default">{doc.speciality}</Badge>
                      </div>
                      <p className="mt-1 text-[12.5px] text-ink3">
                        {inr(doc.fee)} per visit · {doc.slotDurationMin}-min slots
                      </p>
                      <p className="mt-1 font-mono text-[11px] text-ink3">
                        {availabilitySummary(doc)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingDoctor(doc);
                          setDoctorDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-signal hover:bg-signal/10 hover:text-signal"
                        aria-label={`Delete ${doc.name}`}
                        onClick={() => setDeleteTarget(doc)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* FAQs */}
        <TabsContent value="faqs">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Frequently asked questions</CardTitle>
                <p className="text-[12px] text-ink3">
                  Answered word for word. The order decides priority.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() =>
                  patch({
                    faqs: [
                      ...draft.faqs,
                      {
                        id: `faq-${Math.random().toString(36).slice(2, 7)}`,
                        question: "",
                        answer: "",
                        hits: 0,
                      },
                    ],
                  })
                }
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {draft.faqs.length === 0 && (
                <p className="rounded-md border border-dashed border-line p-6 text-center text-[13px] text-ink3">
                  No FAQs yet. Add the questions your callers ask most.
                </p>
              )}
              {draft.faqs.map((faq, idx) => (
                <div key={faq.id} className="rounded-md border border-line p-3">
                  <div className="flex items-start gap-3">
                    <span className="tnum mt-2 font-mono text-[11px] text-ink3">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Input
                          aria-label={`Question ${idx + 1}`}
                          value={faq.question}
                          placeholder="Question"
                          onChange={(e) =>
                            patch({
                              faqs: draft.faqs.map((f) =>
                                f.id === faq.id ? { ...f, question: e.target.value } : f
                              ),
                            })
                          }
                        />
                        <Badge variant="outline" className="shrink-0">
                          {faq.hits} hits
                        </Badge>
                      </div>
                      <Textarea
                        aria-label={`Answer ${idx + 1}`}
                        value={faq.answer}
                        placeholder="Answer"
                        onChange={(e) =>
                          patch({
                            faqs: draft.faqs.map((f) =>
                              f.id === faq.id ? { ...f, answer: e.target.value } : f
                            ),
                          })
                        }
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Move up"
                        disabled={idx === 0}
                        onClick={() => {
                          const next = [...draft.faqs];
                          [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                          patch({ faqs: next });
                        }}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Move down"
                        disabled={idx === draft.faqs.length - 1}
                        onClick={() => {
                          const next = [...draft.faqs];
                          [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
                          patch({ faqs: next });
                        }}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-signal hover:bg-signal/10 hover:text-signal"
                        aria-label="Delete FAQ"
                        onClick={() => patch({ faqs: draft.faqs.filter((f) => f.id !== faq.id) })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Escalation */}
        <TabsContent value="escalation">
          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Human handoff</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="esc-phone">Handoff phone number</Label>
                  <Input
                    id="esc-phone"
                    className="mt-1.5"
                    value={draft.escalation.phone}
                    onChange={(e) =>
                      patch({ escalation: { ...draft.escalation, phone: e.target.value } })
                    }
                  />
                  <p className="mt-1 text-[11.5px] text-ink3">
                    Urgent calls are transferred here.
                  </p>
                </div>
                <div className="flex items-start gap-2 rounded-md bg-signal/[0.07] p-3 text-[12.5px]">
                  <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal" />
                  Emergencies are always directed to emergency services first.
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>When to hand off</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {TRIGGER_OPTIONS.map((trigger) => {
                  const checked = draft.escalation.triggers.includes(trigger);
                  return (
                    <label
                      key={trigger}
                      htmlFor={`trig-${trigger}`}
                      className="flex cursor-pointer items-center gap-3 rounded-md border border-line p-3 text-[13px] transition-colors hover:bg-surface2"
                    >
                      <Checkbox
                        id={`trig-${trigger}`}
                        checked={checked}
                        onCheckedChange={(v) =>
                          patch({
                            escalation: {
                              ...draft.escalation,
                              triggers: v
                                ? [...draft.escalation.triggers, trigger]
                                : draft.escalation.triggers.filter((t) => t !== trigger),
                            },
                          })
                        }
                      />
                      <span className="capitalize">{trigger}</span>
                    </label>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Billing */}
        <TabsContent value="billing">
          <div className="grid gap-3 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle>{usage?.plan ?? "Clinic Pro"}</CardTitle>
                  <p className="text-[12px] text-ink3">
                    Renews {usage ? new Date(usage.renewsAt).toLocaleDateString("en-IN") : "soon"}
                  </p>
                </div>
                <Badge variant="lime">Active</Badge>
              </CardHeader>
              <CardContent className="space-y-5">
                {usage && (
                  <>
                    <div>
                      <div className="mb-2 flex items-end justify-between">
                        <Eyebrow className="text-ink3">Call minutes this cycle</Eyebrow>
                        <span className="tnum font-mono text-[12px]">
                          {usage.minutesUsed} / {usage.minutesIncluded}
                        </span>
                      </div>
                      <Progress value={usage.minutesUsed} max={usage.minutesIncluded} />
                      <p className="mt-2 text-[11.5px] text-ink3">
                        {pct(usage.minutesUsed / usage.minutesIncluded)} used. Overage is{" "}
                        {inr(usage.ratePerMinute)} per minute.
                      </p>
                    </div>
                    <Separator />
                    <div className="grid gap-4 sm:grid-cols-3">
                      {[
                        { k: "Base plan", v: inr(4999) },
                        { k: "Per minute", v: inr(usage.ratePerMinute) },
                        { k: "Est. this month", v: inr(4999 + Math.max(0, usage.minutesUsed - usage.minutesIncluded) * usage.ratePerMinute) },
                      ].map((s) => (
                        <div key={s.k}>
                          <Eyebrow className="text-ink3">{s.k}</Eyebrow>
                          <p className="tnum mt-2 text-lg font-semibold">{s.v}</p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Invoices</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {["September 2026", "August 2026", "July 2026"].map((m) => (
                  <div
                    key={m}
                    className="flex items-center justify-between rounded-md border border-line px-3 py-2.5"
                  >
                    <span className="text-[12.5px]">{m}</span>
                    <span className="tnum font-mono text-[11.5px] text-ink3">{inr(4999)}</span>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 w-full"
                  onClick={() =>
                    toast.info("Billing is not wired up in this demo", {
                      description: "No payment provider is connected yet.",
                    })
                  }
                >
                  Manage billing
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="integrations">
          <IntegrationsPanel />
        </TabsContent>
      </Tabs>

      {dirty && (
        <div className="fixed inset-x-0 bottom-16 z-40 px-4 md:bottom-6">
          <div className="mx-auto flex max-w-2xl items-center gap-3 rounded-lg border border-line bg-surface p-3 shadow-pop">
            <Sparkles className="h-4 w-4 shrink-0 text-ink3" />
            <p className="flex-1 text-[13px] font-medium">Unsaved changes</p>
            <Button variant="ghost" size="sm" onClick={() => setDraft(structuredClone(clinicQ.data!))}>
              <Undo2 className="h-3.5 w-3.5" /> Discard
            </Button>
            <Button size="sm" disabled={save.isPending} onClick={() => save.mutate(draft)}>
              <Save className="h-3.5 w-3.5" /> {save.isPending ? "Saving" : "Save changes"}
            </Button>
          </div>
        </div>
      )}

      <DoctorDialog
        doctor={editingDoctor}
        open={doctorDialogOpen}
        onOpenChange={setDoctorDialogOpen}
      />

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove this doctor?</DialogTitle>
            <DialogDescription>
              {deleteTarget?.name} will no longer be offered to callers. Existing appointments stay
              on the calendar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Keep doctor
            </Button>
            <Button
              variant="signal"
              disabled={removeDoctor.isPending}
              onClick={() => deleteTarget && removeDoctor.mutate(deleteTarget.id)}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
