import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Languages,
  Menu,
  MessageCircle,
  PhoneIncoming,
  Plus,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Eyebrow } from "@/components/Stat";
import { PhoneCallCard } from "@/components/landing/PhoneCallCard";
import { DemoNumberCard } from "@/components/landing/DemoNumberCard";
import { Footer } from "@/components/landing/Footer";
import {
  AgentVisual,
  FeatureVisual,
  MiniDashboard,
  StepVisual,
} from "@/components/landing/visuals";

const NAV = [
  { href: "#how", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#agent", label: "The agent" },
  { href: "#pricing", label: "Pricing" },
];

function Nav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-night/95 text-night-ink">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link to="/" aria-label="AawazDoc home" className="text-night-ink">
          <Logo onDark />
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {NAV.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-full px-3.5 py-2 text-[13px] font-medium text-night-mute transition-colors hover:bg-white/[0.07] hover:text-night-ink"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-1.5">
          <ThemeToggle className="text-night-mute hover:text-night-ink" />
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link to="/app">
              Open dashboard <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-night-mute hover:bg-white/10 hover:text-night-ink md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>
      {open && (
        <div className="border-t border-white/10 md:hidden">
          <nav className="container flex flex-col py-2" aria-label="Mobile">
            {NAV.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2.5 text-[13.5px] font-medium text-night-mute hover:bg-white/[0.06] hover:text-night-ink"
              >
                {l.label}
              </a>
            ))}
            <Button asChild size="sm" className="mt-2">
              <Link to="/app" onClick={() => setOpen(false)}>
                Open dashboard <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </nav>
        </div>
      )}
    </header>
  );
}

function Hero() {
  const [showNumber, setShowNumber] = useState(false);
  return (
    <section className="relative overflow-hidden bg-night text-night-ink">
      <div
        aria-hidden="true"
        className="gridlines pointer-events-none absolute inset-0 text-white/[0.05]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 right-0 h-[560px] w-[560px] rounded-full bg-primary/[0.13] blur-[120px]"
      />
      <div className="container relative grid items-center gap-14 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
        <div className="animate-rise">
          <h1 className="font-display text-[46px] leading-[0.98] tracking-[-0.02em] sm:text-[64px] lg:text-[78px]">
            Never miss a<br />
            patient call again.
          </h1>

          <p className="mt-6 max-w-md text-[16px] leading-relaxed text-night-mute">
            Answers every call, books the appointment, confirms on WhatsApp. In Hindi, English and
            Hinglish.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" onClick={() => setShowNumber((s) => !s)}>
              <PhoneIncoming className="h-4 w-4" />
              Call the demo line
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/20 text-night-ink hover:bg-white/10"
            >
              <Link to="/app">
                See the dashboard <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>

          {showNumber && (
            <div className="mt-4 animate-rise">
              <DemoNumberCard tone="dark" />
              <p className="mt-2 text-[11.5px] text-night-mute">
                Placeholder number. The live voice agent is connected separately.
              </p>
            </div>
          )}

          <dl className="mt-9 flex flex-wrap gap-x-8 gap-y-3">
            {[
              { icon: ShieldCheck, text: "No medical advice, ever" },
              { icon: Languages, text: "3 languages, one line" },
              { icon: MessageCircle, text: "WhatsApp confirmations" },
            ].map((f) => (
              <div key={f.text} className="flex items-center gap-2">
                <f.icon className="h-3.5 w-3.5 text-primary" />
                <dt className="sr-only">{f.text}</dt>
                <dd className="text-[12.5px] text-night-mute">{f.text}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="animate-rise">
          <PhoneCallCard />
        </div>
      </div>

      <div className="relative border-t border-white/10 py-5">
        <div className="fade-x flex overflow-hidden">
          <div className="flex shrink-0 animate-marquee items-center gap-10 pr-10">
            {[0, 1].map((dup) => (
              <div key={dup} className="flex shrink-0 items-center gap-10 pr-10">
                {[
                  "Single-doctor clinics",
                  "Multi-speciality practices",
                  "Dental clinics",
                  "Physiotherapy",
                  "Paediatric clinics",
                  "Diagnostic centres",
                  "Gynaecology",
                  "Family clinics",
                ].map((t) => (
                  <span
                    key={t + dup}
                    className="flex shrink-0 items-center gap-10 whitespace-nowrap text-[12.5px] text-night-mute"
                  >
                    {t}
                    <span className="h-1 w-1 rounded-full bg-primary/60" />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ProductPreview() {
  return (
    <section className="border-b border-line bg-bg py-14 lg:py-20">
      <div className="container">
        <div className="mb-6 flex items-end justify-between gap-4">
          <Eyebrow className="text-ink3">The dashboard</Eyebrow>
          <Link
            to="/app"
            className="text-[12.5px] font-medium text-ink3 transition-colors hover:text-ink"
          >
            Open it live
          </Link>
        </div>
        <MiniDashboard />
      </div>
    </section>
  );
}

const STATS = [
  { value: "1 in 3", label: "clinic calls go unanswered", note: "Illustrative figure" },
  { value: "24/7", label: "coverage, nights and holidays" },
  { value: "< 5s", label: "to pick up, every time" },
];

function Stats() {
  return (
    <section className="border-b border-line bg-bg">
      <div className="container grid gap-8 py-14 sm:grid-cols-3">
        {STATS.map((s) => (
          <div key={s.value}>
            <p className="font-display text-[44px] leading-none tracking-[-0.02em] sm:text-[56px]">
              {s.value}
            </p>
            <p className="mt-3 text-[13px] text-ink2">{s.label}</p>
            {s.note && <p className="label mt-2 text-ink3">{s.note}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

const STEPS: { visual: "ring" | "wave" | "slot" | "whatsapp"; title: string; body: string }[] = [
  { visual: "ring", title: "Patient calls", body: "Any time, on your number." },
  { visual: "wave", title: "The agent answers", body: "It works out what they need." },
  { visual: "slot", title: "The slot is locked", body: "No double bookings." },
  { visual: "whatsapp", title: "WhatsApp goes out", body: "Patient gets the details." },
];

function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 bg-bg py-16 lg:py-24">
      <div className="container">
        <Eyebrow className="text-ink3">How it works</Eyebrow>
        <h2 className="mt-4 max-w-2xl font-display text-[36px] leading-[1.02] tracking-[-0.02em] sm:text-[52px]">
          Four steps, fully automatic.
        </h2>

        <div className="relative mt-14">
          <div
            aria-hidden="true"
            className="absolute left-8 right-8 top-[52px] hidden border-t border-dashed border-line lg:block"
          />
          <ol className="relative grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                className="rounded-lg border border-line bg-surface p-5 text-center"
              >
                <div className="relative">
                  <span className="absolute left-0 top-0 font-mono text-[11px] text-ink3">
                    0{i + 1}
                  </span>
                  <StepVisual kind={step.visual} />
                </div>
                <h3 className="mt-4 text-[14.5px] font-semibold">{step.title}</h3>
                <p className="mt-1 text-[12.5px] text-ink3">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

const FEATURES: {
  visual: "calendar" | "languages" | "handoff" | "recovery";
  title: string;
  body: string;
}[] = [
  {
    visual: "calendar",
    title: "Books while you sleep",
    body: "Slots held in real time, day or night.",
  },
  {
    visual: "languages",
    title: "Three languages, one line",
    body: "Hindi, English and Hinglish, mid-sentence.",
  },
  {
    visual: "handoff",
    title: "Hands off when it must",
    body: "Emergencies go straight to a human.",
  },
  {
    visual: "recovery",
    title: "Recovers the missed calls",
    body: "A dropped call becomes a booking.",
  },
];

function Features() {
  return (
    <section id="features" className="scroll-mt-20 border-y border-line bg-surface2/60 py-16 lg:py-24">
      <div className="container">
        <Eyebrow className="text-ink3">Features</Eyebrow>
        <h2 className="mt-4 max-w-2xl font-display text-[36px] leading-[1.02] tracking-[-0.02em] sm:text-[52px]">
          Everything a receptionist does.
        </h2>
        <div className="mt-12 grid gap-3 md:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-lg border border-line bg-surface p-6">
              <FeatureVisual kind={f.visual} />
              <h3 className="mt-6 text-[15px] font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-[13px] text-ink3">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AgentSection() {
  return (
    <section id="agent" className="scroll-mt-20 bg-bg py-16 lg:py-24">
      <div className="container grid gap-12 lg:grid-cols-2 lg:items-center">
        <div>
          <Eyebrow className="text-ink3">The agent</Eyebrow>
          <h2 className="mt-4 font-display text-[36px] leading-[1.02] tracking-[-0.02em] sm:text-[52px]">
            It gets better every week.
          </h2>
          <p className="mt-5 max-w-md text-[14px] leading-relaxed text-ink3">
            Every call it could not finish lands in one queue. Fix it in a click, test it in the
            sandbox, and it is live on the next call.
          </p>
          <Button asChild className="mt-7">
            <Link to="/app/agent">
              See the agent dashboard <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
        <AgentVisual />
      </div>
    </section>
  );
}

function OutboundSection() {
  return (
    <section className="bg-night py-16 text-night-ink lg:py-24">
      <div className="container grid gap-12 lg:grid-cols-2 lg:items-center">
        <div>
          <Eyebrow className="text-night-mute">Outbound</Eyebrow>
          <h2 className="mt-4 font-display text-[36px] leading-[1.02] tracking-[-0.02em] sm:text-[52px]">
            Then it fills the empty chairs.
          </h2>
          <p className="mt-5 max-w-md text-[14px] leading-relaxed text-night-mute">
            It confirms tomorrow's patients, calls the waitlist when someone cancels, and brings back
            anyone who is due.
          </p>
          <div className="mt-7 flex flex-wrap gap-2">
            <Badge variant="lime">
              <TrendingUp className="h-3 w-3" /> No-shows down 31%
            </Badge>
            <Badge variant="outline" className="border-white/20 text-night-mute">
              Waitlist backfill
            </Badge>
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-6">
          <Eyebrow className="text-night-mute">Appointment reminders</Eyebrow>
          <div className="mt-6 space-y-4">
            {[
              { k: "Audience", v: 42, max: 42 },
              { k: "Contacted", v: 38, max: 42 },
              { k: "Connected", v: 31, max: 42 },
              { k: "Confirmed", v: 27, max: 42 },
            ].map((row) => (
              <div key={row.k} className="grid grid-cols-[92px_1fr_auto] items-center gap-4">
                <span className="label text-night-mute">{row.k}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${(row.v / row.max) * 100}%` }}
                  />
                </span>
                <span className="tnum w-7 text-right font-mono text-[12px]">{row.v}</span>
              </div>
            ))}
          </div>
          <p className="mt-6 border-t border-white/10 pt-5 text-[12.5px] leading-relaxed text-night-mute">
            27 patients confirmed for tomorrow.
          </p>
        </div>
      </div>
    </section>
  );
}

function Safety() {
  return (
    <section className="bg-bg py-14">
      <div className="container">
        <div className="flex flex-col items-start gap-5 rounded-lg border border-line bg-surface p-6 sm:flex-row sm:items-center sm:p-8">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-ink text-bg">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-[15px] font-semibold">Safety comes first</h3>
            <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-ink3">
              No medical advice, ever. Emergencies go to emergency services or a human, and every
              call is recorded only after the caller is told.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

const TIERS = [
  {
    name: "Solo",
    price: "₹2,999",
    cadence: "per month",
    blurb: "One doctor, one line.",
    features: ["1 doctor", "200 minutes", "Booking and FAQs", "WhatsApp confirmations"],
    cta: "Start with Solo",
  },
  {
    name: "Clinic",
    price: "₹4,999",
    cadence: "per month",
    blurb: "The full front desk.",
    features: [
      "Up to 3 doctors",
      "500 minutes",
      "Outbound reminders",
      "Review queue and sandbox",
      "Missed-call recovery",
    ],
    cta: "Start with Clinic",
    featured: true,
  },
  {
    name: "Group",
    price: "Custom",
    cadence: "talk to us",
    blurb: "Multiple locations.",
    features: [
      "Unlimited doctors",
      "Per-location numbers",
      "Roles and permissions",
      "Calendar sync",
      "Priority support",
    ],
    cta: "Book a call",
  },
];

function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-20 border-t border-line bg-bg py-16 lg:py-24">
      <div className="container">
        <Eyebrow className="text-ink3">Pricing</Eyebrow>
        <h2 className="mt-4 max-w-2xl font-display text-[36px] leading-[1.02] tracking-[-0.02em] sm:text-[52px]">
          Priced per clinic, not per seat.
        </h2>

        <div className="mt-12 grid gap-3 lg:grid-cols-3">
          {TIERS.map((t) => (
            <div
              key={t.name}
              className={`relative flex flex-col rounded-lg border p-6 ${
                t.featured ? "border-ink bg-surface" : "border-line bg-surface"
              }`}
            >
              {t.featured && (
                <span className="absolute -top-3 left-6">
                  <Badge variant="lime">Most popular</Badge>
                </span>
              )}
              <div className="flex items-center justify-between">
                <h3 className="text-[15px] font-semibold">{t.name}</h3>
                {t.featured && <Sparkles className="h-4 w-4 text-ink3" />}
              </div>
              <p className="mt-4 flex items-baseline gap-2">
                <span className="font-display text-[40px] leading-none tracking-[-0.02em]">
                  {t.price}
                </span>
                <span className="text-[12px] text-ink3">{t.cadence}</span>
              </p>
              <p className="mt-2 text-[13px] text-ink3">{t.blurb}</p>
              <ul className="mt-6 flex-1 space-y-2.5">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-[13px] text-ink2">
                    <Plus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink3" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button asChild variant={t.featured ? "primary" : "outline"} className="mt-7 w-full">
                <Link to="/app">{t.cta}</Link>
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const FAQS = [
  {
    q: "Will patients know it is an AI?",
    a: "Yes. It introduces itself by name and says the call is recorded.",
  },
  {
    q: "What if it cannot help?",
    a: "It transfers to a human with a summary of what the caller wanted.",
  },
  {
    q: "Do I need a new number?",
    a: "No. Keep your number and forward calls, or connect the line directly.",
  },
  {
    q: "How does it know my clinic?",
    a: "From your knowledge base. When it gets something wrong, fix it from the call.",
  },
  {
    q: "Is patient data safe?",
    a: "Recordings stay in India, callers are told, and you set the retention window.",
  },
];

function Faq() {
  return (
    <section className="border-t border-line bg-surface2/60 py-16 lg:py-24">
      <div className="container grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <Eyebrow className="text-ink3">FAQ</Eyebrow>
          <h2 className="mt-4 font-display text-[36px] leading-[1.02] tracking-[-0.02em] sm:text-[44px]">
            The questions clinics ask us.
          </h2>
        </div>
        <div className="divide-y divide-line border-y border-line">
          {FAQS.map((f) => (
            <details key={f.q} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-[14.5px] font-medium">
                {f.q}
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line transition-transform group-open:rotate-45">
                  <Plus className="h-3 w-3" />
                </span>
              </summary>
              <p className="pb-5 pr-10 text-[13.5px] leading-relaxed text-ink3">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Cta() {
  return (
    <section id="demo" className="scroll-mt-20 bg-night py-16 text-night-ink lg:py-24">
      <div className="container flex flex-col items-center gap-6 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-md bg-primary text-primary-ink">
          <Sparkles className="h-5 w-5" />
        </span>
        <h2 className="max-w-xl font-display text-[36px] leading-[1.02] tracking-[-0.02em] sm:text-[52px]">
          Hear it answer your clinic's calls.
        </h2>
        <p className="max-w-md text-[14px] leading-relaxed text-night-mute">
          Call the demo line and have a normal conversation.
        </p>
        <Button asChild size="lg">
          <Link to="/app">
            Open dashboard <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        <div className="w-full max-w-lg">
          <DemoNumberCard tone="dark" />
        </div>
      </div>
    </section>
  );
}

export default function Landing() {
  return (
    <div className="min-h-dvh overflow-x-hidden bg-bg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-ink"
      >
        Skip to content
      </a>
      <Nav />
      <main id="main">
        <Hero />
        <ProductPreview />
        <Stats />
        <HowItWorks />
        <Features />
        <AgentSection />
        <OutboundSection />
        <Safety />
        <Pricing />
        <Faq />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}
