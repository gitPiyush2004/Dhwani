import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Phone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DEMO_PHONE } from "@/lib/mockData";
import { getPublicConfig } from "@/lib/api";

/** The real number from the backend once the phone agent is live, else the placeholder. */
export function useDemoPhone(): { phone: string; live: boolean } {
  const q = useQuery({ queryKey: ["public-config"], queryFn: getPublicConfig, staleTime: 5 * 60_000 });
  const real = q.data?.demoPhone;
  return { phone: real || DEMO_PHONE, live: Boolean(real && q.data?.voiceEnabled) };
}
import { cn } from "@/lib/utils";

export function DemoNumberCard({
  className,
  tone = "light",
}: {
  className?: string;
  tone?: "light" | "dark";
}) {
  const [copied, setCopied] = useState(false);
  const { phone, live } = useDemoPhone();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(phone);
      setCopied(true);
      toast.success("Demo number copied", {
        description: "Paste it into your phone to try the agent.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy automatically", {
        description: `The number is ${phone}.`,
      });
    }
  };

  const dark = tone === "dark";

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between",
        dark ? "border-white/15 bg-white/[0.04]" : "border-line bg-surface",
        className
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-full",
            dark ? "bg-primary text-primary-ink" : "bg-ink text-bg"
          )}
        >
          <Phone className="h-4 w-4" />
        </span>
        <div>
          <p className={cn("label", dark ? "text-night-mute" : "text-ink3")}>{live ? "Call the AI receptionist" : "Demo line"}</p>
          <p
            className={cn(
              "tnum text-lg font-semibold tracking-tight",
              dark && "text-night-ink"
            )}
          >
            {live ? (
              <a href={`tel:${phone.replace(/\s/g, "")}`} className="hover:underline">
                {phone}
              </a>
            ) : (
              phone
            )}
          </p>
        </div>
      </div>
      <Button
        variant={dark ? "outline" : "subtle"}
        size="sm"
        onClick={copy}
        aria-live="polite"
        className={cn(dark && "border-white/20 text-night-ink hover:bg-white/10")}
      >
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5" /> Copied
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5" /> Copy number
          </>
        )}
      </Button>
    </div>
  );
}
