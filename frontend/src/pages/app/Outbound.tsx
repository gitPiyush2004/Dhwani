import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarCheck,
  MessageCircle,
  Pause,
  Play,
  Plus,
  RotateCcw,
  TrendingUp,
  Voicemail,
} from "lucide-react";
import { toast } from "sonner";
import { Eyebrow, PageHeader, Tile } from "@/components/Stat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress, Separator } from "@/components/ui/atoms";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ListSkeleton } from "@/components/StateViews";
import { createCampaign, getCampaigns, setCampaignStatus } from "@/lib/api";
import { CAMPAIGN_META, CAMPAIGN_STATUS } from "@/lib/outcome";
import { dayLabel, shortDate } from "@/lib/datetime";
import type { Campaign, CampaignType } from "@/types";
import { cn, inrShort } from "@/lib/utils";

const TYPES: CampaignType[] = ["reminder", "waitlist", "recall", "feedback"];

function Funnel({ c }: { c: Campaign }) {
  const steps = [
    { label: "Audience", value: c.audience },
    { label: "Contacted", value: c.contacted },
    { label: "Connected", value: c.connected },
    { label: "Converted", value: c.converted },
  ];
  return (
    <div className="space-y-2">
      {steps.map((s) => (
        <div key={s.label} className="grid grid-cols-[76px_1fr_auto] items-center gap-3">
          <span className="label text-ink3">{s.label}</span>
          <Progress
            value={s.value}
            max={Math.max(c.audience, 1)}
            tone={s.label === "Converted" ? "bg-primary" : "bg-ink/40 dark:bg-white/40"}
          />
          <span className="tnum w-8 text-right font-mono text-[11.5px] text-ink2">{s.value}</span>
        </div>
      ))}
    </div>
  );
}

function NewCampaignDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState<CampaignType>("reminder");
  const [channel, setChannel] = useState<Campaign["channel"]>("voice");
  const [audience, setAudience] = useState("25");
  const [script, setScript] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      createCampaign({
        name: name.trim(),
        type,
        channel,
        status: "scheduled",
        audience: Number(audience) || 0,
        contacted: 0,
        connected: 0,
        converted: 0,
        scheduledAt: new Date(Date.now() + 864e5).toISOString(),
        script: script.trim(),
      }),
    onSuccess: () => {
      toast.success("Campaign scheduled", { description: "It starts tomorrow morning." });
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      onOpenChange(false);
      setName("");
      setScript("");
    },
    onError: () => toast.error("Couldn't create this campaign."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New campaign</DialogTitle>
          <DialogDescription>
            The agent calls the list and books anyone who says yes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="c-name">Name</Label>
            <Input
              id="c-name"
              className="mt-1.5"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Diwali week reminders"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="c-type">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as CampaignType)}>
                <SelectTrigger id="c-type" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {CAMPAIGN_META[t].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="c-channel">Channel</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as Campaign["channel"])}>
                <SelectTrigger id="c-channel" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="voice">Voice call</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="c-audience">Audience</Label>
              <Input
                id="c-audience"
                type="number"
                min={1}
                className="mt-1.5"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="c-script">What the agent should say</Label>
            <Textarea
              id="c-script"
              className="mt-1.5"
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="Remind the patient about tomorrow's appointment and offer to reschedule."
            />
          </div>
          <p className="rounded-md border border-line bg-surface2/60 p-3 text-[12px] leading-relaxed text-ink3">
            {CAMPAIGN_META[type].blurb}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={mutation.isPending || !name.trim()}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Scheduling" : "Schedule campaign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Outbound() {
  const qc = useQueryClient();
  const [newOpen, setNewOpen] = useState(false);
  const campaignsQ = useQuery({ queryKey: ["campaigns"], queryFn: getCampaigns });

  const status = useMutation({
    mutationFn: ({ id, s }: { id: string; s: Campaign["status"] }) => setCampaignStatus(id, s),
    onSuccess: (c) => {
      toast.success(
        c.status === "paused" ? `${c.name} paused` : `${c.name} is running`,
        { description: "Demo only. No real calls are placed." }
      );
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: () => toast.error("Couldn't update this campaign."),
  });

  const campaigns = campaignsQ.data ?? [];
  const totalConverted = campaigns.reduce((s, c) => s + c.converted, 0);
  const totalConnected = campaigns.reduce((s, c) => s + c.connected, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Outbound"
        title="Go find the appointments"
        description="Inbound answering stops the bleeding. Outbound is where the money is: reminders, recalls and waitlist backfill."
        actions={
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" /> New campaign
          </Button>
        }
      />

      {/* ROI framing */}
      <Card className="relative overflow-hidden border-night bg-night text-night-ink">
        <div
          aria-hidden="true"
          className="gridlines pointer-events-none absolute inset-0 text-white/[0.06]"
        />
        <CardContent className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <Eyebrow className="text-night-mute">Recovered this month</Eyebrow>
            <p className="tnum mt-3 font-display text-[56px] leading-[0.9] tracking-[-0.02em] sm:text-[68px]">
              ₹{inrShort(totalConverted * 640 + 21400)}
            </p>
            <p className="mt-3 max-w-md text-[13px] leading-relaxed text-night-mute">
              {totalConverted} slots refilled from {totalConnected} connected calls. Every one of
              these would have been an empty chair.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Badge variant="lime">
                <TrendingUp className="h-3 w-3" /> No-shows down 31%
              </Badge>
              <Badge variant="outline" className="border-white/20 text-night-mute">
                vs. last month
              </Badge>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 self-center border-t border-night-line pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            {[
              { k: "Reminder calls", v: String(campaigns.filter((c) => c.type === "reminder").length) },
              { k: "On the waitlist", v: "12" },
              { k: "Due for recall", v: "112" },
              { k: "Avg pick-up", v: "3.4s" },
            ].map((s) => (
              <div key={s.k}>
                <dt className="label text-night-mute">{s.k}</dt>
                <dd className="tnum mt-1.5 text-xl font-semibold">{s.v}</dd>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Campaigns running" value={String(campaigns.filter((c) => c.status === "active").length)} icon={Play} hint="calling right now" />
        <Tile label="Slots refilled" value={String(totalConverted)} icon={CalendarCheck} delta={22} hint="this month" />
        <Tile label="Contacted" value={String(campaigns.reduce((s, c) => s + c.contacted, 0))} icon={Voicemail} hint="across all campaigns" />
        <Tile label="Via WhatsApp" value={String(campaigns.filter((c) => c.channel === "whatsapp").length)} icon={MessageCircle} hint="channels in use" />
      </div>

      <div className="mt-6 mb-3 flex items-center justify-between">
        <Eyebrow>Campaigns</Eyebrow>
        <span className="tnum font-mono text-[11px] text-ink3">{campaigns.length} total</span>
      </div>

      {campaignsQ.isLoading ? (
        <ListSkeleton rows={3} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {campaigns.map((c) => {
            const meta = CAMPAIGN_META[c.type];
            const st = CAMPAIGN_STATUS[c.status];
            const rate = c.contacted ? c.converted / c.contacted : 0;
            return (
              <Card key={c.id} className="flex flex-col">
                <CardHeader className="flex-row items-start justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="truncate">{c.name}</CardTitle>
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                    </div>
                    <p className="mt-1 text-[12px] text-ink3">
                      {c.channel === "voice" ? "Voice calls" : "WhatsApp"} ·{" "}
                      {c.scheduledAt
                        ? `starts ${dayLabel(c.scheduledAt)}`
                        : `updated ${shortDate(new Date().toISOString())}`}
                    </p>
                  </div>
                  <Badge variant={st.variant}>{st.label}</Badge>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4">
                  <Funnel c={c} />
                  <Separator />
                  <p className="text-[12.5px] leading-relaxed text-ink3">{c.script}</p>
                  <div className="mt-auto flex items-center justify-between gap-3 pt-2">
                    <span className="tnum font-mono text-[11.5px] text-ink3">
                      {rate > 0 ? `${Math.round(rate * 100)}% booked` : "Not started"}
                    </span>
                    <div className="flex gap-2">
                      {c.status === "active" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => status.mutate({ id: c.id, s: "paused" })}
                        >
                          <Pause className="h-3.5 w-3.5" /> Pause
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => status.mutate({ id: c.id, s: "active" })}
                        >
                          <Play className="h-3.5 w-3.5" /> {c.status === "paused" ? "Resume" : "Start"}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className={cn("text-ink3")}
                        onClick={() =>
                          toast.info(`${c.name} queued`, {
                            description: `${c.audience} people will be contacted. Demo only.`,
                          })
                        }
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Run now
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <NewCampaignDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}
