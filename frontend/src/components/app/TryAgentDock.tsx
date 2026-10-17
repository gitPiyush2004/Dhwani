import { useEffect, useRef, useState } from "react";
import { Phone, Send, Sparkles, X } from "lucide-react";
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
import { DEMO_PHONE } from "@/lib/mockData";
import { getAgentReply } from "@/lib/api";
import type { AgentMessage } from "@/types";
import { cn } from "@/lib/utils";

const INITIAL: AgentMessage = {
  role: "ai",
  text: "Namaste! Sharma Family Clinic mein aapka swagat hai. Main AawazDoc hoon. Appointment book karna hai, ya kuch poochna hai?",
};

const SUGGESTIONS = [
  "Mujhe kal appointment chahiye",
  "Clinic timings kya hain?",
  "Consultation fee kitni hai?",
  "Insurance accept karte ho?",
];

export function TryAgentDock() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AgentMessage[]>([INITIAL]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending, open]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setMessages((m) => [...m, { role: "user", text: trimmed }]);
    setInput("");
    setSending(true);
    try {
      const reply = await getAgentReply(trimmed);
      setMessages((m) => [...m, { role: "ai", text: reply }]);
    } catch {
      toast.error("The demo agent is unavailable right now.");
    } finally {
      setSending(false);
    }
  };

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
              <DialogTitle className="text-[15px]">Talk to AawazDoc</DialogTitle>
              <DialogDescription className="text-[12px]">
                A text demo of the receptionist flow
              </DialogDescription>
            </div>
          </div>

          <div
            ref={scrollRef}
            className="scrollbar-slim flex-1 space-y-3 overflow-y-auto bg-surface2/60 p-4"
            aria-live="polite"
            aria-label="Agent chat"
          >
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn("flex items-end gap-2", m.role === "ai" ? "justify-start" : "justify-end")}
              >
                {m.role === "ai" && <WaveMark className="h-6 w-6 rounded-md" />}
                <div
                  className={cn(
                    "max-w-[80%] rounded-lg px-3.5 py-2.5 text-[13px] leading-relaxed",
                    m.role === "ai"
                      ? "rounded-bl-sm border border-line bg-surface text-ink"
                      : "rounded-br-sm bg-ink text-bg"
                  )}
                >
                  {m.text}
                </div>
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

            {messages.length <= 1 && (
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
            <div className="mb-2 flex items-center justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-[12px]"
                onClick={() =>
                  toast.info("Live agent calling is not wired up in this demo.", {
                    description: `The demo line is ${DEMO_PHONE}.`,
                  })
                }
              >
                <Phone className="h-3.5 w-3.5" />
                Call the live agent
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-[12px] text-ink3"
                onClick={() => setMessages([INITIAL])}
              >
                <X className="h-3.5 w-3.5" /> Reset
              </Button>
            </div>
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
              Visual demo only. Replies are canned and it never gives medical advice.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
