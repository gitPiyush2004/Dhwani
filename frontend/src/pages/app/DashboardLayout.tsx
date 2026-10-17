import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "@/components/app/Sidebar";
import { StatusStrip } from "@/components/app/StatusStrip";
import { CommandPalette } from "@/components/app/CommandPalette";
import { TryAgentDock } from "@/components/app/TryAgentDock";
import { LiveDot } from "@/components/voice/LiveCallCard";
import { MOBILE_NAV } from "@/lib/nav";
import { useHotkey } from "@/lib/hooks";
import { cn } from "@/lib/utils";

function MobileTabBar() {
  return (
    <nav
      aria-label="Dashboard"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-night-line bg-night pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="grid grid-cols-5">
        {MOBILE_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "relative flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors",
                isActive ? "text-night-ink" : "text-night-mute"
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute top-0 h-0.5 w-8 rounded-full bg-primary" />
                )}
                <item.icon className="h-[18px] w-[18px]" />
                <span className="flex items-center gap-1">
                  {item.label}
                  {item.label === "Calls" && <LiveDot className="h-1.5 w-1.5" />}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export default function DashboardLayout() {
  const [cmdOpen, setCmdOpen] = useState(false);
  const { pathname } = useLocation();

  useHotkey(
    (e) => (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k",
    () => setCmdOpen(true)
  );

  // The Agent page has its own test console; the dock would duplicate it.
  const showDock = !["/app/agent", "/app/settings"].includes(pathname);

  return (
    <div className="flex min-h-dvh bg-bg">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-ink focus:px-4 focus:py-2 focus:text-bg">
        Skip to content
      </a>

      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <StatusStrip onOpenCommand={() => setCmdOpen(true)} />
        <main id="main" className="flex-1 px-4 pb-28 pt-6 sm:px-5 md:pb-12 lg:px-8">
          <Outlet />
        </main>
      </div>

      <MobileTabBar />
      {showDock && <TryAgentDock />}
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
    </div>
  );
}
