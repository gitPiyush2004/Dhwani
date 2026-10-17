import {
  Bot,
  CalendarDays,
  LayoutDashboard,
  Megaphone,
  PhoneCall,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  hint?: string;
}

export const NAV_GROUPS: { group: string; items: NavItem[] }[] = [
  {
    group: "Operate",
    items: [
      { to: "/app", label: "Overview", icon: LayoutDashboard, end: true, hint: "Today at a glance" },
      { to: "/app/calls", label: "Calls", icon: PhoneCall, hint: "Every call, transcribed" },
      { to: "/app/appointments", label: "Appointments", icon: CalendarDays, hint: "Calendar and bookings" },
    ],
  },
  {
    group: "Grow",
    items: [
      { to: "/app/agent", label: "Agent", icon: Bot, hint: "Teach and test the receptionist" },
      { to: "/app/outbound", label: "Outbound", icon: Megaphone, hint: "Reminders and recalls" },
    ],
  },
  {
    group: "Setup",
    items: [{ to: "/app/settings", label: "Settings", icon: Settings, hint: "Clinic, doctors, billing" }],
  },
];

export const ALL_NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** Five tabs fit a phone; Settings lives in the top bar there. */
export const MOBILE_NAV: NavItem[] = ALL_NAV.filter((i) => i.to !== "/app/settings");
