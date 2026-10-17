import { Link } from "react-router-dom";
import { ArrowUp } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";

const PRODUCT = [
  { label: "How it works", href: "#how" },
  { label: "Features", href: "#features" },
  { label: "The agent", href: "#agent" },
  { label: "Pricing", href: "#pricing" },
  { label: "Demo line", href: "#demo" },
];

const CLINIC = [
  { label: "Overview", to: "/app" },
  { label: "Calls", to: "/app/calls" },
  { label: "Appointments", to: "/app/appointments" },
  { label: "Agent", to: "/app/agent" },
  { label: "Outbound", to: "/app/outbound" },
];

const LEGAL = ["Privacy policy", "Terms of use", "Data and security"];

const linkClass =
  "text-[13px] text-night-mute transition-colors hover:text-night-ink focus-visible:text-night-ink";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-white/10 bg-night text-night-ink">
      <div className="container py-14 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:gap-8">
          <div>
            <span className="text-night-ink">
              <Logo onDark />
            </span>
            <p className="mt-5 max-w-xs text-[13px] leading-relaxed text-night-mute">
              An AI phone receptionist for small clinics. It answers every call, books appointments
              and confirms on WhatsApp, in Hindi, English and Hinglish.
            </p>
            <p className="mt-5 max-w-xs text-[12px] leading-relaxed text-night-mute">
              AawazDoc never gives medical advice. Emergencies are directed to emergency services or
              a human.
            </p>
          </div>

          <nav aria-label="Product">
            <h3 className="label text-night-mute">Product</h3>
            <ul className="mt-4 space-y-3">
              {PRODUCT.map((l) => (
                <li key={l.label}>
                  <a href={l.href} className={linkClass}>
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Clinic dashboard">
            <h3 className="label text-night-mute">Your clinic</h3>
            <ul className="mt-4 space-y-3">
              {CLINIC.map((l) => (
                <li key={l.label}>
                  <Link to={l.to} className={linkClass}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Legal">
            <h3 className="label text-night-mute">Legal</h3>
            <ul className="mt-4 space-y-3">
              {LEGAL.map((label) => (
                <li key={label}>
                  <button
                    type="button"
                    className={`text-left ${linkClass}`}
                    onClick={() =>
                      toast.info(label, {
                        description: "Not published yet. It will be available before launch.",
                      })
                    }
                  >
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11.5px] text-night-mute">
            © {year} AawazDoc Technologies Pvt. Ltd. All rights reserved.
          </p>
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-[11.5px] font-medium text-night-mute transition-colors hover:border-white/30 hover:text-night-ink"
          >
            <ArrowUp className="h-3.5 w-3.5" />
            Back to top
          </button>
        </div>
      </div>
    </footer>
  );
}
