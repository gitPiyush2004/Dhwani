import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Phone, PhoneCall, Send, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WaveMark } from "@/components/Logo";
import { callMeWithAgent, chatWithAgent, getClinic } from "@/lib/api";
import { USE_LIVE_API } from "@/lib/config";
import type { AgentMessage } from "@/types";
import { cn } from "@/lib/utils";

const FALLBACK_GREETING =
  "Namaste! Sharma Family Clinic mein aapka swagat hai. Main AawazDoc hoon. Appointment book karna hai, ya kuch poochna hai?";

const SUGGESTIONS = [
  "Mujhe kal appointment chahiye",
  "Clinic timings kya hain?",
  "Consultation fee kitni hai?",
  "Insurance accept karte ho?",
];

const TOOL_LABELS: Record<string, string> = {
  check_slots: "Checked the calendar",
  book_appointment: "Test booking (not saved)",
  find_appointments: "Looked up appointments",
  reschedule_appointment: "Test reschedule (not saved)",
  cancel_appointment: "Test cancellation (not saved)",
  get_clinic_info: "Read clinic info",
  transfer_to_staff: "Handed to staff",
};

interface ChatLine extends AgentMessage {
  actions?: string[];
}

const newSession = () => `dock-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function TryAgentDock() {
  const [open, setOpen] = useState(false);
  const clinicQ = useQuery({ queryKey: ["clinic"], queryFn: getClinic });
  const greeting = clinicQ.data?.agent?.greeting || clinicQ.data?.greeting || FALLBACK_GREETING;
  const agentName = clinicQ.data?.agent?.name || "AawazDoc";

  const [messages, setMessages] = useState<ChatLine[]>([]);
  const [sessionId, setSessionId] = useState(newSession);
  const [engine, setEngine] = useState<"gemini" | "rules" | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const thread: ChatLine[] = [{ role: "ai", text: greeting }, ...messages];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending, open]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    const history = thread;
    setMessages((m) => [...m, { role: "user", text: trimmed }]);
    setInput("");
    setSending(true);
    try {
      const out = await chatWithAgent(trimmed, sessionId, history);
      setEngine(out.engine);
      setMessages((m) => [...m, { role: "ai", text: out.reply, actions: out.actions }]);
    } catch (err) {
      toast.error("The agent is unavailable right now.", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSending(false);
    }
  };

  const reset = () => {
    setMessages([]);
    setSessionId(newSession());
  };

  const callMe = useMutation({
    mutationFn: (number: string) => callMeWithAgent(number),
    onSuccess: () => {
      toast.success("Calling you now", {
        description: "Your phone will ring in a few seconds. The call appears in Calls when it ends.",
      });
      setCallOpen(false);
    },
    onError: (err) =>
      toast.error("Couldn't place the call", { description: err instanceof Error ? err.message : undefined }),
  });

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label="Try the agent"
        className="fixed bottom-20 right-4 z-40 inline-flex h-12 items-center gap-2 rounded-full bg-ink px-4 text-bg shadow-lift transition-transform hover:scale-[1.03] active:scale-[0.97] md:bottom-6 md:right-6"
      >
        <Sparkles className="h-4 w-4" />
        <span className="hidden text-[13px] font-semibold sm:inline">Try the agent</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[620px] max-h-[86dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          <div className="flex items-center gap-3 border-b border-line p-4 pr-12">
            <WaveMark animated />
            <div className="text-left">
              <DialogTitle className="text-[15px]">Talk to {agentName}</DialogTitle>
              <DialogDescription className="text-[12px]">
                {USE_LIVE_API
                  ? "The same receptionist that answers your phone, in text"
                  : "A text demo of the receptionist flow"}
              </DialogDescription>
            </div>
          </div>

          <div
            ref={scrollRef}
            className="scrollbar-slim flex-1 space-y-3 overflow-y-auto bg-surface2/60 p-4"
            aria-live="polite"
            aria-label="Agent chat"
          >
            {thread.map((m, i) => (
              <div key={i} className={cn("flex flex-col", m.role === "ai" ? "items-start" : "items-end")}>
                <div className={cn("flex items-end gap-2", m.role === "ai" ? "justify-start" : "justify-end")}>
                  {m.role === "ai" && <WaveMark className="h-6 w-6 rounded-md" />}
                  <div
                    className={cn(
                      "max-w-[80%] whitespace-pre-line rounded-lg px-3.5 py-2.5 text-[13px] leading-relaxed",
                      m.role === "ai"
                        ? "rounded-bl-sm border border-line bg-surface text-ink"
                        : "rounded-br-sm bg-ink text-bg"
                    )}
                  >
                    {m.text}
                  </div>
                </div>
                {!!m.actions?.length && (
                  <div className="ml-8 mt-1.5 flex flex-wrap gap-1">
                    {[...new Set(m.actions)].map((a) => (
                      <span key={a} className="rounded-full bg-surface px-2 py-0.5 font-mono text-[10px] text-ink3">
                        {TOOL_LABELS[a] ?? a}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {sending && (
              <div className="flex items-end gap-2">
                <WaveMark className="h-6 w-6 rounded-md" />
                <div className="flex items-center gap-1 rounded-lg rounded-bl-sm border border-line bg-surface px-4 py-3">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink3"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            )}

            {messages.length === 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] text-ink2 transition-colors hover:border-ink/30 hover:text-ink"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-line p-3">
            {callOpen ? (
              <form
                className="mb-2 flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (phone.replace(/\D/g, "").length >= 10) callMe.mutate(phone);
                }}
              >
                <label htmlFor="call-me-phone" className="sr-only">
                  Your mobile number
                </label>
                <Input
                  id="call-me-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="Your mobile, e.g. 98110 22334"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-8 text-[13px]"
                  autoFocus
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="ink"
                  className="h-8 shrink-0 text-[12px]"
                  disabled={callMe.isPending || phone.replace(/\D/g, "").length < 10}
                >
                  {callMe.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PhoneCall className="h-3.5 w-3.5" />}
                  Call me
                </Button>
                <Button type="button" size="icon-sm" variant="ghost" onClick={() => setCallOpen(false)} aria-label="Cancel">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </form>
            ) : (
              <div className="mb-2 flex items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-[12px]"
                  onClick={() =>
                    USE_LIVE_API
                      ? setCallOpen(true)
                      : toast.info("Connect the backend to hear the real agent.", {
                          description: "Set VITE_API_BASE_URL and BOLNA_API_KEY.",
                        })
                  }
                >
                  <Phone className="h-3.5 w-3.5" />
                  Call the live agent
                </Button>
                <Button variant="ghost" size="sm" className="h-8 text-[12px] text-ink3" onClick={reset}>
                  <X className="h-3.5 w-3.5" /> Reset
                </Button>
              </div>
            )}
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
            >
              <label htmlFor="agent-input" className="sr-only">
                Type your message
              </label>
              <Input
                id="agent-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message"
                autoComplete="off"
              />
              <Button type="submit" size="icon" disabled={sending || !input.trim()} aria-label="Send message">
                <Send className="h-4 w-4" />
              </Button>
            </form>
            <p className="mt-2 text-[11px] text-ink3">
              {!USE_LIVE_API
                ? "Visual demo only. Replies are canned and it never gives medical advice."
                : engine === "rules"
                  ? "Rule-based replies. Add GEMINI_API_KEY on the server for the full agent. Test bookings are never saved."
                  : "Same prompt and tools as the phone line. Test bookings are never saved."}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
