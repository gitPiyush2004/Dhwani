import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Database,
  ExternalLink,
  KeyRound,
  Link2,
  Loader2,
  MessageSquare,
  PhoneCall,
  RefreshCw,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/StateViews";
import {
  callMeWithAgent,
  getIntegrations,
  linkPhoneNumber,
  runRemindersNow,
  syncPhoneAgent,
} from "@/lib/api";
import { USE_LIVE_API } from "@/lib/config";
import { fullDateTime } from "@/lib/datetime";

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-[13px]">
      <dt className="shrink-0 text-ink3">{k}</dt>
      <dd className="min-w-0 break-words text-right font-mono text-[12px] text-ink2">{v}</dd>
    </div>
  );
}

function Status({ ok, on, off }: { ok: boolean; on: string; off: string }) {
  return <Badge variant={ok ? "teal" : "amber"}>{ok ? on : off}</Badge>;
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong");

export function IntegrationsPanel() {
  const qc = useQueryClient();
  const [testPhone, setTestPhone] = useState("");
  const q = useQuery({ queryKey: ["integrations"], queryFn: getIntegrations, enabled: USE_LIVE_API, refetchInterval: 30_000 });

  const sync = useMutation({
    mutationFn: syncPhoneAgent,
    onSuccess: (r) => {
      toast.success(r.created ? "Phone agent created" : "Phone agent updated", { description: `Bolna agent ${r.agentId}` });
      void qc.invalidateQueries({ queryKey: ["integrations"] });
      void qc.invalidateQueries({ queryKey: ["onboarding"] });
    },
    onError: (e) => toast.error("Couldn't sync the phone agent", { description: errorText(e) }),
  });
  const link = useMutation({
    mutationFn: () => linkPhoneNumber(),
    onSuccess: () => toast.success("Number linked", { description: "Calls to the clinic number now reach the agent." }),
    onError: (e) => toast.error("Couldn't link the number", { description: errorText(e) }),
  });
  const call = useMutation({
    mutationFn: (phone: string) => callMeWithAgent(phone),
    onSuccess: () => toast.success("Calling you now", { description: "Answer and talk to the agent. The call appears in Calls afterwards." }),
    onError: (e) => toast.error("Couldn't place the call", { description: errorText(e) }),
  });
  const reminders = useMutation({
    mutationFn: runRemindersNow,
    onSuccess: (r) =>
      r.skipped
        ? toast.info("No reminders sent", { description: r.skipped })
        : toast.success(`${r.delivered} of ${r.due} reminders delivered`),
    onError: (e) => toast.error("Couldn't send reminders", { description: errorText(e) }),
  });

  if (!USE_LIVE_API) {
    return (
      <Card>
        <CardContent className="p-6 text-[13px] text-ink2">
          The dashboard is running on demo data. Set <code className="font-mono">VITE_API_BASE_URL</code> to your
          backend to connect Google Sheets, the phone agent and WhatsApp.
        </CardContent>
      </Card>
    );
  }
  if (q.isLoading) return <Skeleton className="h-72 w-full rounded-lg" />;
  if (q.isError || !q.data) return <ErrorState title="Couldn't load integrations" onRetry={() => q.refetch()} />;

  const { storage, bolna, messaging, llm, auth } = q.data;
  const phoneReady = bolna.configured && bolna.secretSet && !!bolna.publicUrl;

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {/* Storage */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Database className="h-4 w-4 text-ink3" /> Data
          </CardTitle>
          <Status ok={storage.kind === "sheets" && storage.ok} on="Google Sheets" off={storage.kind === "sheets" ? "Sync error" : "Local file"} />
        </CardHeader>
        <CardContent>
          <dl>
            <Row k="Status" v={storage.detail} />
            {storage.serviceAccount && <Row k="Shared with" v={storage.serviceAccount} />}
            {storage.lastSyncAt && <Row k="Last sync" v={fullDateTime(storage.lastSyncAt)} />}
            {storage.pending !== undefined && <Row k="Writes queued" v={storage.pending} />}
          </dl>
          {storage.sheetUrl ? (
            <Button asChild variant="outline" size="sm" className="mt-3">
              <a href={storage.sheetUrl} target="_blank" rel="noreferrer">
                Open the Google Sheet <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          ) : (
            <p className="mt-3 text-[12px] text-ink3">
              Add SHEET_ID and GOOGLE_SERVICE_ACCOUNT_JSON on the server to keep everything in a Google Sheet.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Phone agent */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <PhoneCall className="h-4 w-4 text-ink3" /> Phone agent
          </CardTitle>
          <Status ok={!!bolna.agentId && phoneReady} on="Live on Bolna" off={bolna.configured ? "Needs setup" : "Not connected"} />
        </CardHeader>
        <CardContent>
          <dl>
            <Row k="Agent" v={bolna.agentId ?? "not created"} />
            <Row k="Clinic number" v={bolna.phoneNumber ?? "not set"} />
            <Row k="Speech" v={`${bolna.transcriber} · ${bolna.voice}`} />
            <Row k="Brain" v={bolna.llm} />
            <Row k="Public URL" v={bolna.publicUrl ?? "not set"} />
            {bolna.wallet !== null && <Row k="Bolna balance" v={String(bolna.wallet)} />}
            {bolna.lastSync.at && (
              <Row k="Last sync" v={bolna.lastSync.ok ? fullDateTime(bolna.lastSync.at) : `failed: ${bolna.lastSync.error}`} />
            )}
          </dl>
          {!bolna.configured ? (
            <p className="mt-3 text-[12px] text-ink3">Add BOLNA_API_KEY and BOLNA_SECRET on the server.</p>
          ) : !phoneReady ? (
            <p className="mt-3 text-[12px] text-ink3">
              Set {!bolna.publicUrl ? "PUBLIC_URL" : ""}
              {!bolna.publicUrl && !bolna.secretSet ? " and " : ""}
              {!bolna.secretSet ? "BOLNA_SECRET" : ""} on the server so Bolna can reach the booking tools.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ink" onClick={() => sync.mutate()} disabled={sync.isPending}>
                  {sync.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  {bolna.agentId ? "Push latest settings" : "Create the agent"}
                </Button>
                {bolna.phoneNumber && bolna.agentId && (
                  <Button size="sm" variant="outline" onClick={() => link.mutate()} disabled={link.isPending}>
                    <Link2 className="h-3.5 w-3.5" /> Link {bolna.phoneNumber}
                  </Button>
                )}
              </div>
              {bolna.agentId && (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    call.mutate(testPhone);
                  }}
                >
                  <label htmlFor="int-test-phone" className="sr-only">
                    Mobile number for a test call
                  </label>
                  <Input
                    id="int-test-phone"
                    type="tel"
                    inputMode="tel"
                    placeholder="Your mobile for a test call"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    className="h-8 text-[13px]"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant="outline"
                    disabled={call.isPending || testPhone.replace(/\D/g, "").length < 10}
                    className="shrink-0"
                  >
                    {call.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PhoneCall className="h-3.5 w-3.5" />}
                    Call me
                  </Button>
                </form>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Messages */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-ink3" /> Patient messages
          </CardTitle>
          <Status ok={messaging.configured} on={messaging.channels[0] ?? "On"} off="Not connected" />
        </CardHeader>
        <CardContent>
          <dl>
            <Row k="Channels" v={messaging.channels.join(" → ") || "none"} />
            {messaging.lastError && <Row k="Last error" v={messaging.lastError} />}
          </dl>
          {messaging.configured ? (
            <Button size="sm" variant="outline" className="mt-3" onClick={() => reminders.mutate()} disabled={reminders.isPending}>
              <Send className="h-3.5 w-3.5" /> Send tomorrow's reminders now
            </Button>
          ) : (
            <p className="mt-3 text-[12px] text-ink3">
              Bookings still work; confirmations are marked as not sent. Add META_WA_* (WhatsApp Cloud) or TWILIO_* on the
              server to send them.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Chat agent + login */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-ink3" /> Chat agent and security
          </CardTitle>
          <Status ok={llm.configured && auth.required} on="All set" off="Check" />
        </CardHeader>
        <CardContent>
          <dl>
            <Row k="Chat and call analysis" v={llm.configured ? `${llm.provider === "openai" ? "OpenAI" : "Gemini"} ${llm.model}` : "rule-based (set OPENAI_API_KEY)"} />
            <Row
              k="Dashboard login"
              v={
                auth.required ? (
                  "password required"
                ) : (
                  <span className="inline-flex items-center gap-1 text-amber">
                    <KeyRound className="h-3 w-3" /> open: set ADMIN_PASSWORD
                  </span>
                )
              }
            />
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
