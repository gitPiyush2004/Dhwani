import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import {
  ArrowRight,
  BookOpen,
  Check,
  CircleSlash,
  FlaskConical,
  Pencil,
  Play,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Eyebrow, PageHeader } from "@/components/Stat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress, Separator } from "@/components/ui/atoms";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/toggles";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListSkeleton, TableSkeleton } from "@/components/StateViews";
import {
  DeleteKnowledgeDialog,
  KnowledgeDialog,
} from "@/components/agent/KnowledgeDialog";
import { WaveMark } from "@/components/Logo";
import {
  getAgentMetrics,
  getCalls,
  getClinic,
  getKnowledge,
  runAgentTest,
  updateClinic,
} from "@/lib/api";
import { CHART_COLORS } from "@/lib/outcome";
import type { AgentConfig, AgentTestRun, KnowledgeItem } from "@/types";
import { cn, formatDuration, pct } from "@/lib/utils";

const VOICES = [
  "Meera (warm, Indian English + Hindi)",
  "Aarav (calm, Indian English)",
  "Riya (bright, Hindi first)",
  "Kabir (neutral, Hinglish)",
];

export default function Agent() {
  const qc = useQueryClient();
  const metricsQ = useQuery({ queryKey: ["agent-metrics"], queryFn: getAgentMetrics });
  const clinicQ = useQuery({ queryKey: ["clinic"], queryFn: getClinic });
  const knowledgeQ = useQuery({ queryKey: ["knowledge"], queryFn: getKnowledge });
  const reviewQ = useQuery({
    queryKey: ["calls", { needsReview: true }],
    queryFn: () => getCalls({ needsReview: true }),
  });

  const [agent, setAgent] = useState<AgentConfig | null>(null);
  const [utterance, setUtterance] = useState("Insurance accept karte ho?");
  const [testRun, setTestRun] = useState<AgentTestRun | null>(null);
  const [kbOpen, setKbOpen] = useState(false);
  const [editing, setEditing] = useState<KnowledgeItem | null>(null);
  const [seed, setSeed] = useState<{ title: string; body: string } | null>(null);
  const [deleting, setDeleting] = useState<KnowledgeItem | null>(null);

  useEffect(() => {
    if (clinicQ.data) setAgent(clinicQ.data.agent);
  }, [clinicQ.data]);

  const dirty = useMemo(
    () =>
      !!agent && !!clinicQ.data && JSON.stringify(agent) !== JSON.stringify(clinicQ.data.agent),
    [agent, clinicQ.data]
  );

  const save = useMutation({
    mutationFn: (patch: Partial<AgentConfig>) => updateClinic({ agent: { ...agent!, ...patch } }),
    onSuccess: () => {
      toast.success("Agent updated", { description: "Live on the next call." });
      qc.invalidateQueries({ queryKey: ["clinic"] });
    },
    onError: () => toast.error("Couldn't save the agent settings."),
  });

  const test = useMutation({
    mutationFn: (text: string) => runAgentTest(text),
    onSuccess: (run) => setTestRun(run),
    onError: () => toast.error("The test console is unavailable right now."),
  });

  const metrics = metricsQ.data;
  const reviewQueue = reviewQ.data ?? [];

  const patch = (p: Partial<AgentConfig>) => setAgent((a) => (a ? { ...a, ...p } : a));

  return (
    <div className="pb-24">
      <PageHeader
        eyebrow="Agent"
        title="The receptionist you can teach"
        description="See how well it is doing, fix what it gets wrong, and test changes before they go live."
        actions={
          <Badge variant={metrics && metrics.resolutionRate > 0.75 ? "lime" : "amber"} className="py-1">
            <Sparkles className="h-3 w-3" /> {pct(metrics?.resolutionRate ?? 0)} resolved
          </Badge>
        }
      />

      {/* Quality + review queue */}
      <div className="grid gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Quality</CardTitle>
              <p className="text-[12px] text-ink3">Last 7 days, across every call</p>
            </div>
            <Badge variant="outline">Trending up</Badge>
          </CardHeader>
          <CardContent className="space-y-5">
            {metricsQ.isLoading ? (
              <div className="h-40 animate-pulse rounded-md bg-ink/[0.05]" />
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-4">
                  {[
                    { k: "Resolution", v: pct(metrics!.resolutionRate) },
                    { k: "Containment", v: pct(metrics!.containmentRate) },
                    { k: "Avg handle", v: formatDuration(metrics!.avgHandleSec) },
                    { k: "Handoffs", v: String(metrics!.humanHandoffs) },
                  ].map((s) => (
                    <div key={s.k}>
                      <Eyebrow className="text-ink3">{s.k}</Eyebrow>
                      <p className="tnum mt-2 font-display text-[30px] leading-none">{s.v}</p>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-4">
                  <div className="h-16 flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={metrics!.accuracyTrend}>
                        <YAxis domain={[0.8, 1]} hide />
                        <Line
                          type="monotone"
                          dataKey="value"
                          stroke={CHART_COLORS.accent}
                          strokeWidth={2}
                          dot={false}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="shrink-0 text-right">
                    <Eyebrow className="text-ink3">Accuracy</Eyebrow>
                    <p className="tnum font-mono text-[13px]">
                      {pct(metrics!.accuracyTrend[0].value)} to{" "}
                      {pct(metrics!.accuracyTrend[metrics!.accuracyTrend.length - 1].value)}
                    </p>
                  </div>
                </div>

                <Separator />

                <div>
                  <Eyebrow className="mb-3 text-ink3">Accuracy by intent</Eyebrow>
                  <div className="space-y-3">
                    {metrics!.intents.map((i) => (
                      <div key={i.intent} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5">
                        <span className="truncate text-[13px]">{i.intent}</span>
                        <span className="tnum font-mono text-[11.5px] text-ink3">
                          {i.resolved}/{i.total} · {pct(i.accuracy)}
                        </span>
                        <div className="col-span-2">
                          <Progress
                            value={i.accuracy * 100}
                            tone={i.accuracy > 0.8 ? "bg-teal" : "bg-amber"}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-amber/40">
          <CardHeader className="flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-amber/15 text-amber">
                <FlaskConical className="h-3.5 w-3.5" />
              </span>
              <CardTitle>Review queue</CardTitle>
            </div>
            <span className="tnum font-mono text-[11px] text-ink3">{reviewQueue.length}</span>
          </CardHeader>
          <CardContent className="space-y-2">
            {reviewQ.isLoading ? (
              <ListSkeleton rows={3} />
            ) : reviewQueue.length === 0 ? (
              <p className="rounded-md border border-dashed border-line p-4 text-center text-[13px] text-ink3">
                Every call was handled. Nothing to review.
              </p>
            ) : (
              reviewQueue.slice(0, 6).map((c) => (
                <div key={c.id} className="rounded-md border border-line p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[13px] font-medium">{c.callerName}</p>
                    <Badge variant="amber">{c.intent}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-ink3">
                    {c.summary}
                  </p>
                  <div className="mt-2.5 flex gap-2">
                    <Button asChild size="sm" variant="outline" className="h-7 text-[11.5px]">
                      <Link to={`/app/calls?call=${c.id}`}>
                        Listen <ArrowRight className="h-3 w-3" />
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[11.5px]"
                      onClick={() => {
                        setEditing(null);
                        setSeed({
                          title: c.intent,
                          body: `Caller asked about ${c.intent.toLowerCase()}. ${c.summary} Add the correct answer here.`,
                        });
                        setKbOpen(true);
                      }}
                    >
                      <Wand2 className="h-3 w-3" /> Teach from this call
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Identity + test console */}
      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Voice and manner</CardTitle>
            <p className="text-[12px] text-ink3">How the agent sounds when it picks up</p>
          </CardHeader>
          <CardContent className="space-y-5">
            {!agent ? (
              <div className="h-40 animate-pulse rounded-md bg-ink/[0.05]" />
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="ag-name">Agent name</Label>
                    <Input
                      id="ag-name"
                      className="mt-1.5"
                      value={agent.name}
                      onChange={(e) => patch({ name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="ag-voice">Voice</Label>
                    <Select value={agent.voice} onValueChange={(v) => patch({ voice: v })}>
                      <SelectTrigger id="ag-voice" className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VOICES.map((v) => (
                          <SelectItem key={v} value={v}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="ag-speed">Speaking pace</Label>
                    <span className="tnum font-mono text-[11.5px] text-ink3">
                      {agent.speed.toFixed(2)}x
                    </span>
                  </div>
                  <input
                    id="ag-speed"
                    type="range"
                    min={0.8}
                    max={1.2}
                    step={0.01}
                    value={agent.speed}
                    onChange={(e) => patch({ speed: Number(e.target.value) })}
                    className="mt-3 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink/10 accent-[rgb(var(--ink))] dark:bg-white/10"
                  />
                </div>

                <div>
                  <Label htmlFor="ag-greeting">Opening line</Label>
                  <Textarea
                    id="ag-greeting"
                    className="mt-1.5"
                    value={agent.greeting}
                    onChange={(e) => patch({ greeting: e.target.value })}
                  />
                  <div className="mt-3 flex items-start gap-2.5 rounded-md border border-line bg-surface2/60 p-3">
                    <WaveMark className="h-6 w-6 rounded-md" />
                    <p className="text-[12.5px] leading-relaxed">
                      {agent.greeting || "Your greeting will be read out first."}
                    </p>
                  </div>
                </div>

                <label
                  htmlFor="ag-consent"
                  className="flex cursor-pointer items-start justify-between gap-4 rounded-md border border-line p-3"
                >
                  <span>
                    <span className="block text-[13px] font-medium">
                      Announce that the call is recorded
                    </span>
                    <span className="mt-0.5 block text-[11.5px] text-ink3">
                      Required for consent under India's DPDP Act.
                    </span>
                  </span>
                  <Switch
                    id="ag-consent"
                    checked={agent.recordingConsent}
                    onCheckedChange={(v) => patch({ recordingConsent: v })}
                  />
                </label>

                <div>
                  <Eyebrow className="mb-2 flex items-center gap-1.5 text-ink3">
                    <ShieldCheck className="h-3.5 w-3.5" /> Guardrails, always on
                  </Eyebrow>
                  <ul className="space-y-1.5">
                    {agent.guardrails.map((g) => (
                      <li key={g} className="flex items-start gap-2 text-[12.5px] text-ink2">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal" />
                        {g}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3">
          <Card className="flex-1">
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Test console</CardTitle>
                <p className="text-[12px] text-ink3">Say something a patient might say</p>
              </div>
              <Badge variant="violet">Sandbox</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (utterance.trim()) test.mutate(utterance.trim());
                }}
              >
                <label htmlFor="test-input" className="sr-only">
                  Test utterance
                </label>
                <Input
                  id="test-input"
                  value={utterance}
                  onChange={(e) => setUtterance(e.target.value)}
                  placeholder="Type what a caller would say"
                />
                <Button type="submit" disabled={test.isPending}>
                  <Play className="h-3.5 w-3.5" /> Run
                </Button>
              </form>

              {test.isPending && (
                <p className="font-mono text-[11.5px] text-ink3">Running the agent…</p>
              )}

              {testRun && !test.isPending && (
                <div className="space-y-3">
                  {testRun.transcript.map((m, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex items-end gap-2",
                        m.role === "ai" ? "justify-start" : "justify-end"
                      )}
                    >
                      {m.role === "ai" && <WaveMark className="h-6 w-6 rounded-md" />}
                      <p
                        className={cn(
                          "max-w-[82%] rounded-lg px-3.5 py-2.5 text-[12.5px] leading-relaxed",
                          m.role === "ai"
                            ? "rounded-bl-sm border border-line bg-surface"
                            : "rounded-br-sm bg-ink text-bg"
                        )}
                      >
                        {m.text}
                      </p>
                    </div>
                  ))}
                  <div
                    className={cn(
                      "flex items-start gap-2 rounded-md border p-3 text-[12px]",
                      testRun.verdict === "pass"
                        ? "border-teal/30 bg-teal/[0.07] text-ink2"
                        : "border-amber/40 bg-amber/[0.08] text-ink2"
                    )}
                  >
                    {testRun.verdict === "pass" ? (
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal" />
                    ) : (
                      <CircleSlash className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" />
                    )}
                    <span>{testRun.note}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setEditing(null);
                      setSeed({ title: utterance, body: "" });
                      setKbOpen(true);
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" /> Add this to the knowledge base
                  </Button>
                </div>
              )}

              {!testRun && !test.isPending && (
                <p className="text-[12px] leading-relaxed text-ink3">
                  The sandbox runs the same brain as the phone line, so a fix you make here lands on
                  the next real call.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Knowledge base */}
      <Card className="mt-3">
        <CardHeader className="flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-violet/15 text-violet">
              <BookOpen className="h-3.5 w-3.5" />
            </span>
            <div>
              <CardTitle>Knowledge base</CardTitle>
              <p className="text-[12px] text-ink3">
                {knowledgeQ.data?.length ?? 0} entries the agent can quote
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setSeed(null);
              setKbOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </CardHeader>
        <CardContent>
          {knowledgeQ.isLoading ? (
            <TableSkeleton rows={4} />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {(knowledgeQ.data ?? []).map((k) => (
                <div key={k.id} className="rounded-md border border-line p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[13.5px] font-semibold">{k.title}</p>
                    <Badge variant={k.source === "document" ? "teal" : k.source === "faq" ? "default" : "violet"}>
                      {k.source}
                    </Badge>
                  </div>
                  <p className="mt-2 line-clamp-3 text-[12.5px] leading-relaxed text-ink3">{k.body}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="font-mono text-[10.5px] text-ink3">
                      Updated {new Date(k.updatedAt).toLocaleDateString("en-IN")}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${k.title}`}
                        onClick={() => {
                          setEditing(k);
                          setSeed(null);
                          setKbOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-signal hover:bg-signal/10 hover:text-signal"
                        aria-label={`Remove ${k.title}`}
                        onClick={() => setDeleting(k)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {dirty && (
        <div className="fixed inset-x-0 bottom-16 z-40 px-4 md:bottom-6">
          <div className="mx-auto flex max-w-2xl items-center gap-3 rounded-lg border border-line bg-surface p-3 shadow-pop">
            <Sparkles className="h-4 w-4 shrink-0 text-ink3" />
            <p className="flex-1 text-[13px] font-medium">Unsaved agent changes</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAgent(clinicQ.data ? structuredClone(clinicQ.data.agent) : agent)}
            >
              Discard
            </Button>
            <Button size="sm" disabled={save.isPending} onClick={() => save.mutate({})}>
              {save.isPending ? "Saving" : "Save changes"}
            </Button>
          </div>
        </div>
      )}

      <KnowledgeDialog
        open={kbOpen}
        onOpenChange={setKbOpen}
        editing={editing}
        seed={seed}
      />
      <DeleteKnowledgeDialog item={deleting} onOpenChange={(o) => !o && setDeleting(null)} />
    </div>
  );
}
