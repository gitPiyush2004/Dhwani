import { useEffect, useRef, useState } from "react";
import { PhoneCall, Phone } from "lucide-react";
import { WaveMark } from "@/components/Logo";
import { LiveDot } from "@/components/voice/LiveCallCard";
import { cn } from "@/lib/utils";

type Line = { speaker: "ai" | "patient"; text: string };

const SCRIPT: Line[] = [
  { speaker: "ai", text: "Namaste! Sharma Family Clinic mein aapka swagat hai. Main AawazDoc hoon." },
  { speaker: "patient", text: "Mujhe kal doctor ko dikhana hai." },
  { speaker: "ai", text: "Bilkul. Kal ke liye 10:30 AM, 12:00 PM aur 5:30 PM available hain." },
  { speaker: "patient", text: "12 baje ho jaye toh badhiya." },
  { speaker: "ai", text: "Ho gaya! Appointment kal 12:00 PM par book kar diya. WhatsApp confirmation bhej rahi hoon." },
];

function useTypingScript() {
  const [lineIdx, setLineIdx] = useState(0);
  const [char, setChar] = useState(0);

  useEffect(() => {
    if (lineIdx >= SCRIPT.length) {
      const t = setTimeout(() => {
        setLineIdx(0);
        setChar(0);
      }, 3400);
      return () => clearTimeout(t);
    }
    const current = SCRIPT[lineIdx].text;
    if (char < current.length) {
      const t = setTimeout(() => setChar((c) => c + 1), 34);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setLineIdx((i) => i + 1);
      setChar(0);
    }, 900);
    return () => clearTimeout(t);
  }, [lineIdx, char]);

  return { lineIdx, char };
}

function Wavebars({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-[2px]", className)} aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="w-[2.5px] rounded-full bg-primary"
          style={{
            height: 6 + (i % 3) * 5,
            animation: "wave 1s ease-in-out infinite",
            animationDelay: `${i * 0.12}s`,
          }}
        />
      ))}
    </span>
  );
}

export function PhoneCallCard() {
  const { lineIdx, char } = useTypingScript();
  const [seconds, setSeconds] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => (s + 1) % 600), 1000);
    return () => clearInterval(id);
  }, []);

  // Pin to the newest line only when a line completes.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lineIdx]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className="mx-auto w-full max-w-[400px]">
      <div className="overflow-hidden rounded-xl border border-white/10 bg-night-soft shadow-pop">
        <div className="flex items-center gap-3 border-b border-white/10 p-4">
          <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-ink">
            <PhoneCall className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-night-ink">Incoming call</p>
            <p className="tnum flex items-center gap-1.5 font-mono text-[11px] text-night-mute">
              <Phone className="h-3 w-3" /> +91 98765 43210
            </p>
          </div>
          <span className="tnum flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 font-mono text-[11px] text-night-ink">
            <LiveDot />
            {mm}:{ss}
          </span>
        </div>

        <div
          ref={scrollRef}
          className="scrollbar-slim h-[292px] space-y-3 overflow-y-auto p-4"
          aria-label="Sample call transcript"
        >
          {SCRIPT.slice(0, lineIdx + 1).map((line, i) => {
            const isCurrent = i === lineIdx;
            const text = isCurrent ? line.text.slice(0, char) : line.text;
            if (isCurrent && char === 0 && lineIdx === 0) return null;
            const isAI = line.speaker === "ai";
            return (
              <div
                key={i}
                className={cn("flex items-end gap-2", isAI ? "justify-start" : "justify-end")}
              >
                {isAI && <WaveMark className="h-6 w-6 rounded-md" />}
                <div
                  className={cn(
                    "max-w-[80%] rounded-lg px-3.5 py-2 text-[13px] leading-relaxed",
                    isAI
                      ? "rounded-bl-sm border border-white/10 bg-white/[0.06] text-night-ink"
                      : "rounded-br-sm bg-primary text-primary-ink"
                  )}
                >
                  {text}
                  {isCurrent && (
                    <span className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 animate-blink bg-current align-middle" />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
          <span className="flex items-center gap-2 text-[11.5px] text-night-mute">
            <Wavebars />
            AawazDoc is listening
          </span>
          <span className="rounded-full bg-primary/15 px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-primary">
            Hinglish
          </span>
        </div>
      </div>
    </div>
  );
}
