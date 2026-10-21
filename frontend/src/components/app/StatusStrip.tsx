import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Command, LogOut, Settings, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";
import { Avatar, Kbd } from "@/components/ui/atoms";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/toggles";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LiveDot } from "@/components/voice/LiveCallCard";
import { getClinic, getDashboardStats, getLiveCalls } from "@/lib/api";
import { ALL_NAV } from "@/lib/nav";
import { USE_LIVE_API } from "@/lib/config";
import { cn } from "@/lib/utils";

function UserMenu() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: clinic } = useQuery({ queryKey: ["clinic"], queryFn: getClinic });

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex items-center gap-2 rounded-full p-0.5 transition-colors hover:bg-surface2"
      >
        <Avatar name="Front Desk" size="sm" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-11 z-50 w-60 overflow-hidden rounded-md border border-line bg-surface p-1 shadow-pop"
        >
          <div className="px-3 py-2.5">
            <p className="text-[13px] font-semibold">{clinic?.name ?? "Your clinic"}</p>
            <p className="text-[11.5px] text-ink3">Signed in as Front desk</p>
          </div>
          <div className="my-1 h-px bg-line" />
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              navigate("/app/settings");
            }}
            className="flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-left text-[13px] transition-colors hover:bg-surface2"
          >
            <Settings className="h-3.5 w-3.5 text-ink3" /> Clinic settings
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              toast.info("Accounts are not part of this demo", {
                description: "There is no authentication wired up yet.",
              });
            }}
            className="flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-left text-[13px] transition-colors hover:bg-surface2"
          >
            <LogOut className="h-3.5 w-3.5 text-ink3" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function StatusStrip({ onOpenCommand }: { onOpenCommand: () => void }) {
  const { pathname } = useLocation();
  const [aiLive, setAiLive] = useState(true);
  const { data: stats } = useQuery({ queryKey: ["dashboard-stats"], queryFn: getDashboardStats });
  const { data: live } = useQuery({ queryKey: ["live-calls"], queryFn: getLiveCalls, refetchInterval: USE_LIVE_API ? 5_000 : false });

  const current = ALL_NAV.find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to)));
  const liveCount = live?.length ?? 0;

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg">
      <div className="flex h-14 items-center gap-3 px-4 lg:px-8">
        <Link to="/" className="md:hidden" aria-label="Dhwani home">
          <Logo showText={false} />
        </Link>

        <div className="hidden min-w-0 items-center gap-2 md:flex">
          <span className="label text-ink3">{current?.label ?? "Dashboard"}</span>
          {liveCount > 0 && (
            <span className="flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5">
              <LiveDot />
              <span className="font-mono text-[10.5px] text-ink3">{liveCount} live</span>
            </span>
          )}
        </div>

        <button
          onClick={onOpenCommand}
          className="ml-auto flex h-9 items-center gap-2 rounded-full border border-line bg-surface px-3 text-[13px] text-ink3 transition-colors hover:border-ink/30 hover:text-ink2 md:ml-0 md:w-64"
          aria-label="Open the command palette"
        >
          <Command className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Search or jump to</span>
          <span className="ml-auto hidden md:flex md:items-center md:gap-1">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>

        <div className="ml-auto flex items-center gap-1.5 md:gap-2">
          <span className="tnum hidden items-center gap-2 text-[12px] text-ink3 lg:flex">
            <Sparkles className="h-3.5 w-3.5 text-ink3" />
            {stats?.callsToday ?? 0} calls today
          </span>

          <label
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-full border px-2.5 py-1.5 transition-colors",
              aiLive ? "border-primary/40 bg-primary/15" : "border-line bg-surface2"
            )}
          >
            <span className="flex items-center gap-1.5">
              {aiLive ? <LiveDot /> : <span className="h-2 w-2 rounded-full bg-ink3" />}
              <span className="label hidden text-ink2 sm:inline">
                {aiLive ? "AI live" : "AI off"}
              </span>
            </span>
            <Switch
              checked={aiLive}
              onCheckedChange={(v) => {
                setAiLive(v);
                toast[v ? "success" : "info"](
                  v ? "The AI receptionist is live" : "The AI receptionist is paused",
                  {
                    description: v
                      ? "New calls are answered automatically."
                      : "Calls ring through to your front desk.",
                  }
                );
              }}
              aria-label="Toggle the AI receptionist"
            />
          </label>

          <ThemeToggle />
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="text-ink3 hover:text-ink md:hidden"
            aria-label="Clinic settings"
          >
            <Link to="/app/settings">
              <Settings className="h-4 w-4" />
            </Link>
          </Button>
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
