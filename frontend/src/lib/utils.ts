import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "4m 12s" / "48s" */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0s";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

/** "02:14" clock format for the audio player. */
export function clockTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** "+12%" / "-4%" */
export function formatTrend(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value)}%`;
}

/** Indian short currency: 124000 -> "1.24L" */
export function inrShort(value: number): string {
  if (value >= 10000000) return `${(value / 10000000).toFixed(2)}Cr`;
  if (value >= 100000) return `${(value / 100000).toFixed(2)}L`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

export function inr(value: number): string {
  return `₹${value.toLocaleString("en-IN")}`;
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** Deterministic accent for avatars, so the same person keeps the same colour. */
const AVATAR_TONES = [
  "bg-violet/15 text-violet",
  "bg-teal/15 text-teal",
  "bg-signal/15 text-signal",
  "bg-amber/20 text-amber",
  "bg-ink/10 text-ink",
];

export function avatarTone(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

/** 0.9432 -> "94%" */
export function pct(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}
