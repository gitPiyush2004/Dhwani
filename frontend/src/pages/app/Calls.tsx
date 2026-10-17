import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Download, Flag, Inbox, Search, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/Stat";
import { CallDrawer } from "@/components/CallDrawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, Kbd } from "@/components/ui/atoms";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/StateViews";
import { getCalls, getSavedViews } from "@/lib/api";
import { dayLabel, timeLabel } from "@/lib/datetime";
import { OUTCOME_META, SENTIMENT_META } from "@/lib/outcome";
import type { Call, CallFilters, CallOutcome, Language } from "@/types";
import { cn, formatDuration, pct } from "@/lib/utils";

const OUTCOMES: CallOutcome[] = [
  "booked",
  "faq",
  "human",
  "rescheduled",
  "cancelled",
  "dropped",
  "missed",
];
const LANGUAGES: Language[] = ["Hindi", "English", "Hinglish"];

function SentimentTag({ call }: { call: Call }) {
  const meta = SENTIMENT_META[call.sentiment];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[11.5px] font-medium", meta.text)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

function CallRow({
  call,
  focused,
  onOpen,
  onFocus,
}: {
  call: Call;
  focused: boolean;
  onOpen: (id: string) => void;
  onFocus: () => void;
}) {
  return (
    <button
      data-call-row={call.id}
      onClick={() => onOpen(call.id)}
      onMouseEnter={onFocus}
      className={cn(
        "w-full border-b border-line px-4 py-3 text-left transition-colors last:border-0 hover:bg-surface2",
        focused && "bg-surface2 ring-1 ring-inset ring-primary"
      )}
    >
      {/* Mobile */}
      <div className="flex items-start gap-3 lg:hidden">
        <Avatar name={call.callerName} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[13.5px] font-medium">{call.callerName}</p>
            {call.needsFollowUp && (
              <Flag className="h-3.5 w-3.5 shrink-0 text-amber" aria-label="Needs follow-up" />
            )}
          </div>
          <p className="tnum truncate font-mono text-[11px] text-ink3">
            {call.phone} · {timeLabel(call.startedAt)} · {formatDuration(call.durationSec)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant={OUTCOME_META[call.outcome].variant}>
              {OUTCOME_META[call.outcome].label}
            </Badge>
            <Badge variant="outline">{call.language}</Badge>
            <SentimentTag call={call} />
          </div>
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden lg:grid lg:grid-cols-12 lg:items-center lg:gap-3">
        <div className="col-span-3 flex items-center gap-3">
          <Avatar name={call.callerName} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-medium">{call.callerName}</p>
            <p className="tnum truncate font-mono text-[11px] text-ink3">{call.phone}</p>
          </div>
        </div>
        <div className="col-span-2 min-w-0">
          <p className="truncate text-[12.5px] text-ink2">{call.intent}</p>
        </div>
        <div className="col-span-2">
          <p className="tnum text-[12.5px]">{timeLabel(call.startedAt)}</p>
          <p className="text-[11px] text-ink3">
            {dayLabel(call.startedAt)} · {formatDuration(call.durationSec)}
          </p>
        </div>
        <div className="col-span-1">
          <Badge variant="outline">{call.language}</Badge>
        </div>
        <div className="col-span-2">
          <Badge variant={OUTCOME_META[call.outcome].variant}>
            {OUTCOME_META[call.outcome].label}
          </Badge>
        </div>
        <div className="col-span-1">
          <span className="tnum font-mono text-[11.5px] text-ink3">{pct(call.confidence)}</span>
        </div>
        <div className="col-span-1 flex justify-end">
          {call.needsFollowUp ? (
            <Flag className="h-3.5 w-3.5 text-amber" aria-label="Needs follow-up" />
          ) : (
            <span className="text-[11.5px] text-ink3">No</span>
          )}
        </div>
      </div>
    </button>
  );
}

export default function Calls() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeCallId = searchParams.get("call");

  const [search, setSearch] = useState("");
  const [outcome, setOutcome] = useState<CallOutcome | "all">("all");
  const [language, setLanguage] = useState<Language | "all">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [needsReview, setNeedsReview] = useState(false);
  const [activeView, setActiveView] = useState("v-all");
  const [focused, setFocused] = useState(0);

  const viewsQ = useQuery({ queryKey: ["saved-views"], queryFn: getSavedViews });

  const filters = useMemo<CallFilters>(
    () => ({
      search,
      outcome,
      language,
      needsReview: needsReview || undefined,
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
    }),
    [search, outcome, language, needsReview, from, to]
  );

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["calls", filters],
    queryFn: () => getCalls(filters),
    placeholderData: keepPreviousData,
  });

  const rows = data ?? [];
  const hasFilters =
    search !== "" || outcome !== "all" || language !== "all" || from !== "" || to !== "" || needsReview;

  const clearFilters = () => {
    setSearch("");
    setOutcome("all");
    setLanguage("all");
    setFrom("");
    setTo("");
    setNeedsReview(false);
    setActiveView("v-all");
  };

  const applyView = (id: string, f: CallFilters) => {
    setActiveView(id);
    setSearch("");
    setFrom("");
    setTo("");
    setOutcome(f.outcome ?? "all");
    setLanguage(f.language ?? "all");
    setNeedsReview(!!f.needsReview);
  };

  const openCall = (id: string) => setSearchParams({ call: id });

  // Keyboard navigation: j / k to move, Enter to open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (activeCallId || /input|textarea|select/i.test(target.tagName)) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setFocused((f) => Math.min(rows.length - 1, f + 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocused((f) => Math.max(0, f - 1));
      } else if (e.key === "Enter" && rows[focused]) {
        e.preventDefault();
        openCall(rows[focused].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, focused, activeCallId, setSearchParams]);

  return (
    <div>
      <PageHeader
        eyebrow="Calls"
        title="Every call, transcribed"
        description="Search, filter and listen back. The agent writes the summary so you don't have to."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              toast.success("Export queued", {
                description: `${rows.length} calls will be emailed as a CSV.`,
              })
            }
          >
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
        }
      />

      {/* Saved views */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(viewsQ.data ?? []).map((v) => (
          <button
            key={v.id}
            onClick={() => applyView(v.id, v.filters)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
              activeView === v.id
                ? "border-transparent bg-ink text-bg"
                : "border-line text-ink2 hover:border-ink/30 hover:text-ink"
            )}
          >
            {v.label}
          </button>
        ))}
        <span className="ml-auto hidden items-center gap-1.5 text-[11px] text-ink3 sm:flex">
          <Kbd>J</Kbd>
          <Kbd>K</Kbd>
          to move
          <Kbd>↵</Kbd>
          to open
        </span>
      </div>

      {/* Filters */}
      <Card className="mb-4">
        <CardContent className="grid gap-3 p-4 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Label htmlFor="call-search">Search</Label>
            <div className="relative mt-1.5">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink3" />
              <Input
                id="call-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, number, intent or tag"
                className="pl-9"
              />
            </div>
          </div>
          <div className="lg:col-span-2">
            <Label htmlFor="filter-from">From</Label>
            <Input
              id="filter-from"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div className="lg:col-span-2">
            <Label htmlFor="filter-to">To</Label>
            <Input
              id="filter-to"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div className="lg:col-span-2">
            <Label htmlFor="filter-outcome">Outcome</Label>
            <Select value={outcome} onValueChange={(v) => setOutcome(v as CallOutcome | "all")}>
              <SelectTrigger id="filter-outcome" className="mt-1.5">
                <SelectValue placeholder="All outcomes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All outcomes</SelectItem>
                {OUTCOMES.map((o) => (
                  <SelectItem key={o} value={o}>
                    {OUTCOME_META[o].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="lg:col-span-2">
            <Label htmlFor="filter-language">Language</Label>
            <Select value={language} onValueChange={(v) => setLanguage(v as Language | "all")}>
              <SelectTrigger id="filter-language" className="mt-1.5">
                <SelectValue placeholder="All languages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All languages</SelectItem>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {hasFilters && (
            <div className="lg:col-span-12">
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-3.5 w-3.5" /> Clear filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {isLoading ? (
        <TableSkeleton />
      ) : isError ? (
        <ErrorState
          title="Couldn't load calls"
          message="The call log didn't load. Check your connection and try again."
          onRetry={() => refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={hasFilters ? Search : Inbox}
          title={hasFilters ? "No calls match these filters" : "No calls yet"}
          description={
            hasFilters
              ? "Try widening the date range or clearing a filter."
              : "Once the agent answers a call, it shows up here."
          }
          action={
            hasFilters ? (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="tnum font-mono text-[11px] text-ink3">
              {rows.length} call{rows.length === 1 ? "" : "s"}
            </span>
            <span className="hidden text-[11px] text-ink3 lg:block">
              Click a row to open the transcript and audio
            </span>
          </div>
          <div className="hidden border-b border-line bg-surface2/60 lg:grid lg:grid-cols-12 lg:gap-3 lg:px-4 lg:py-2.5">
            {[
              ["Caller", "col-span-3"],
              ["Intent", "col-span-2"],
              ["When", "col-span-2"],
              ["Language", "col-span-1"],
              ["Outcome", "col-span-2"],
              ["Conf.", "col-span-1"],
              ["Follow-up", "col-span-1 text-right"],
            ].map(([label, cls]) => (
              <span key={label} className={cn("label text-ink3", cls)}>
                {label}
              </span>
            ))}
          </div>
          <div>
            {rows.map((c, i) => (
              <CallRow
                key={c.id}
                call={c}
                focused={i === focused}
                onFocus={() => setFocused(i)}
                onOpen={openCall}
              />
            ))}
          </div>
        </Card>
      )}

      <CallDrawer
        callId={activeCallId}
        open={!!activeCallId}
        onOpenChange={(o) => !o && setSearchParams({})}
      />
    </div>
  );
}
