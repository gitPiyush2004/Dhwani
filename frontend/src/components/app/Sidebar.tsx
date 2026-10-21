import { Link, NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, LogOut, PhoneCall } from "lucide-react";
import { Logo } from "@/components/Logo";
import { LiveDot } from "@/components/voice/LiveCallCard";
import { Progress } from "@/components/ui/atoms";
import { NAV_GROUPS } from "@/lib/nav";
import { getAuthStatus, getLiveCalls, getOnboarding, getUsage, signOut } from "@/lib/api";
import { USE_LIVE_API } from "@/lib/config";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const navigate = useNavigate();
  const { data: live } = useQuery({ queryKey: ["live-calls"], queryFn: getLiveCalls, refetchInterval: USE_LIVE_API ? 5_000 : false });
  const { data: usage } = useQuery({ queryKey: ["usage"], queryFn: getUsage });
  const { data: onboarding } = useQuery({ queryKey: ["onboarding"], queryFn: getOnboarding });
  const { data: auth } = useQuery({ queryKey: ["auth-status"], queryFn: getAuthStatus, staleTime: Infinity });

  const liveCount = live?.length ?? 0;
  const done = onboarding?.filter((s) => s.done).length ?? 0;
  const total = onboarding?.length ?? 0;

  return (
    <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r border-night-line bg-night text-night-ink md:flex">
      <div className="flex h-14 items-center px-5">
        <Link to="/" aria-label="Dhwani home" className="text-night-ink">
          <Logo onDark />
        </Link>
      </div>

      <nav className="scrollbar-slim flex-1 overflow-y-auto px-3 pb-4 pt-2" aria-label="Dashboard">
        {NAV_GROUPS.map((group) => (
          <div key={group.group} className="mb-5">
            <p className="label px-3 pb-2 text-night-mute">{group.group}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      "group flex items-center gap-3 rounded-md px-3 py-2 text-[13.5px] font-medium transition-colors",
                      isActive
                        ? "bg-primary text-primary-ink"
                        : "text-night-mute hover:bg-white/[0.06] hover:text-night-ink"
                    )
                  }
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {item.label === "Calls" && liveCount > 0 && (
                    <span className="flex items-center gap-1 rounded-full bg-white/10 px-1.5 py-0.5 font-mono text-[10px] group-[.active]:bg-black/10">
                      <LiveDot className="h-1.5 w-1.5" />
                      {liveCount}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="space-y-3 border-t border-night-line p-3">
        {/* Onboarding progress */}
        {total > 0 && done < total && (
          <button
            onClick={() => navigate("/app/agent")}
            className="w-full rounded-md border border-night-line p-3 text-left transition-colors hover:bg-white/[0.05]"
          >
            <div className="flex items-center justify-between">
              <span className="label text-night-mute">Go live</span>
              <span className="tnum font-mono text-[11px] text-primary">
                {done}/{total}
              </span>
            </div>
            <Progress
              value={done}
              max={total}
              className="mt-2.5 bg-white/10"
              tone="bg-primary"
            />
            <p className="mt-2 text-[11.5px] leading-snug text-night-mute">
              Connect your number and make a test call.
            </p>
          </button>
        )}

        {/* Usage */}
        {usage && (
          <div className="rounded-md border border-night-line p-3">
            <div className="flex items-center justify-between">
              <span className="label text-night-mute">Minutes</span>
              <span className="tnum font-mono text-[11px] text-night-mute">
                {usage.minutesUsed}/{usage.minutesIncluded}
              </span>
            </div>
            <Progress
              value={usage.minutesUsed}
              max={usage.minutesIncluded}
              className="mt-2.5 bg-white/10"
            />
            <p className="mt-2 text-[11px] text-night-mute">{usage.plan} plan</p>
          </div>
        )}

        {/* Live now */}
        <div className="flex items-center justify-between rounded-md border border-night-line px-3 py-2.5">
          <span className="flex items-center gap-2 text-[12px] text-night-mute">
            <PhoneCall className="h-3.5 w-3.5" />
            {liveCount} on the line
          </span>
          <ArrowUpRight className="h-3.5 w-3.5 text-night-mute" />
        </div>

        {auth?.required && (
          <button
            onClick={() => {
              signOut();
              window.location.assign("/app");
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-[12px] text-night-mute transition-colors hover:bg-white/[0.05] hover:text-night-ink"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        )}
      </div>
    </aside>
  );
}
