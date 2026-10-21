import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CornerDownLeft,
  Pause,
  PhoneOutgoing,
  Plus,
  Search,
  Sparkles,
  Sun,
  Moon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/atoms";
import { useTheme } from "@/components/theme-provider";
import { ALL_NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";

interface Command {
  id: string;
  label: string;
  group: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
  keywords?: string;
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const commands: Command[] = useMemo(
    () => [
      ...ALL_NAV.map((item) => ({
        id: `nav-${item.to}`,
        label: item.label,
        group: "Go to",
        hint: item.hint,
        icon: item.icon,
        keywords: item.label.toLowerCase(),
        run: () => navigate(item.to),
      })),
      {
        id: "act-new-appointment",
        label: "New appointment",
        group: "Actions",
        hint: "Book a patient in",
        icon: Plus,
        run: () => navigate("/app/appointments?new=1"),
      },
      {
        id: "act-test-call",
        label: "Make a test call",
        group: "Actions",
        hint: "Hear the agent before going live",
        icon: PhoneOutgoing,
        run: () => navigate("/app/agent"),
      },
      {
        id: "act-pause",
        label: "Pause the AI receptionist",
        group: "Actions",
        hint: "Calls ring through to your front desk",
        icon: Pause,
        run: () => navigate("/app/settings"),
      },
      {
        id: "act-theme",
        label: theme === "dark" ? "Switch to light mode" : "Switch to dark mode",
        group: "Actions",
        icon: theme === "dark" ? Sun : Moon,
        run: toggle,
      },
    ],
    [navigate, theme, toggle]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || (c.keywords ?? "").includes(q) || c.group.toLowerCase().includes(q)
    );
  }, [commands, query]);

  useEffect(() => {
    setActive(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const runAt = (i: number) => {
    const cmd = filtered[i];
    if (!cmd) return;
    onOpenChange(false);
    // let the dialog close before navigating
    setTimeout(cmd.run, 10);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(filtered.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runAt(active);
    }
  };

  const groups = filtered.reduce<Record<string, Command[]>>((acc, c) => {
    (acc[c.group] ??= []).push(c);
    return acc;
  }, {});

  let flatIndex = -1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-[12%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0"
        onKeyDown={onKeyDown}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Search for a page or run an action
        </DialogDescription>

        <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
          <Search className="h-4 w-4 shrink-0 text-ink3" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages and actions"
            aria-label="Search commands"
            className="h-6 w-full bg-transparent text-[14px] text-ink placeholder:text-ink3 focus:outline-none"
          />
          <Kbd>esc</Kbd>
        </div>

        <div ref={listRef} className="scrollbar-slim max-h-[52vh] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-ink3">
              Nothing matches “{query}”.
            </p>
          ) : (
            Object.entries(groups).map(([group, items]) => (
              <div key={group} className="mb-1">
                <p className="label px-3 py-2 text-ink3">{group}</p>
                {items.map((cmd) => {
                  flatIndex += 1;
                  const idx = flatIndex;
                  const isActive = idx === active;
                  return (
                    <button
                      key={cmd.id}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => runAt(idx)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors",
                        isActive ? "bg-surface2" : "hover:bg-surface2"
                      )}
                    >
                      <cmd.icon className="h-4 w-4 shrink-0 text-ink3" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium">{cmd.label}</span>
                        {cmd.hint && (
                          <span className="block truncate text-[11.5px] text-ink3">{cmd.hint}</span>
                        )}
                      </span>
                      {isActive ? (
                        <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-ink3" />
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-transparent" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-line px-4 py-2.5">
          <span className="flex items-center gap-1.5 text-[11px] text-ink3">
            <Sparkles className="h-3 w-3" />
            Dhwani
          </span>
          <span className="flex items-center gap-2 text-[11px] text-ink3">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            to move
            <Kbd>↵</Kbd>
            to open
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
