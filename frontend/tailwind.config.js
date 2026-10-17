/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./preview.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: "1.25rem", lg: "2rem" },
      screens: { "2xl": "1240px" },
    },
    extend: {
      fontFamily: {
        display: ['"Instrument Serif"', "Georgia", "serif"],
        sans: ['"Inter Tight"', "Inter", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        surface2: "rgb(var(--surface-2) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        ink2: "rgb(var(--ink-2) / <alpha-value>)",
        ink3: "rgb(var(--ink-3) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        primary: {
          DEFAULT: "rgb(var(--primary) / <alpha-value>)",
          ink: "rgb(var(--primary-ink) / <alpha-value>)",
        },
        signal: "rgb(var(--signal) / <alpha-value>)",
        violet: "rgb(var(--violet) / <alpha-value>)",
        teal: "rgb(var(--teal) / <alpha-value>)",
        amber: "rgb(var(--amber) / <alpha-value>)",
        // ink panels. Deep ink on bone in light mode; lifted in dark mode so the
        // panels stay distinguishable from the near-black page.
        night: {
          DEFAULT: "rgb(var(--panel) / <alpha-value>)",
          soft: "rgb(var(--panel-soft) / <alpha-value>)",
          line: "rgba(255,255,255,0.10)",
          ink: "#F2EFE8",
          mute: "#9AA0A8",
        },
      },
      borderRadius: {
        sm: "6px",
        DEFAULT: "var(--radius)",
        md: "10px",
        lg: "var(--radius)",
        xl: "18px",
        "2xl": "24px",
      },
      boxShadow: {
        soft: "0 1px 2px rgb(0 0 0 / 0.04)",
        pop: "0 28px 70px -28px rgb(0 0 0 / 0.5), 0 2px 10px -6px rgb(0 0 0 / 0.25)",
        lift: "0 18px 40px -24px rgb(0 0 0 / 0.35)",
      },
      keyframes: {
        wave: {
          "0%,100%": { transform: "scaleY(0.28)" },
          "50%": { transform: "scaleY(1)" },
        },
        blink: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0" } },
        rise: {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        marquee: { from: { transform: "translateX(0)" }, to: { transform: "translateX(-50%)" } },
        ring: {
          "0%": { transform: "scale(0.7)", opacity: "0.9" },
          "80%,100%": { transform: "scale(2.4)", opacity: "0" },
        },
        shimmer: { from: { backgroundPosition: "200% 0" }, to: { backgroundPosition: "-200% 0" } },
        ticker: { from: { transform: "translateY(6px)", opacity: "0" }, to: { transform: "translateY(0)", opacity: "1" } },
      },
      animation: {
        wave: "wave 1.1s ease-in-out infinite",
        blink: "blink 1.05s step-end infinite",
        rise: "rise 0.5s cubic-bezier(0.16,1,0.3,1) both",
        marquee: "marquee 38s linear infinite",
        ring: "ring 2s ease-out infinite",
        shimmer: "shimmer 2.4s linear infinite",
        ticker: "ticker 0.35s ease-out both",
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
