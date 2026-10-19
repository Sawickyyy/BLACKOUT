import type { Config } from "tailwindcss";

// BLACKNET OS design tokens. Every colour is a CSS variable ("R G B" triple)
// defined in globals.css, so themes, contrast mode and the glass settings can
// change at runtime without rebuilding. Legacy names (panel, line, fg…) are
// kept as aliases of the new tokens.
const rgb = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: rgb("--bg"),
        surface: rgb("--surface"),
        elevated: rgb("--elevated"),
        accent: rgb("--accent"),
        accent2: rgb("--accent2"),
        fg: rgb("--text"),
        text2: rgb("--text-2"),
        muted: rgb("--muted"),
        line: rgb("--line"),
        danger: rgb("--danger"),
        warn: rgb("--warn"),
        ok: rgb("--ok"),
        // legacy aliases
        panel: rgb("--surface"),
        panel2: rgb("--elevated"),
      },
      fontFamily: {
        sans: ["var(--font-ui)"],
        mono: ["var(--font-mono)"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      borderRadius: {
        os: "var(--radius)",
        "os-lg": "var(--radius-lg)",
      },
      boxShadow: {
        window: "var(--shadow-window)",
        pop: "var(--shadow-pop)",
        glow: "0 0 0 1px rgb(var(--accent) / 0.35), 0 0 24px rgb(var(--accent) / 0.15)",
      },
      transitionTimingFunction: {
        os: "var(--ease-out)",
        spring: "var(--ease-spring)",
      },
      transitionDuration: {
        fast: "var(--dur-fast)",
        base: "var(--dur-base)",
        slow: "var(--dur-slow)",
      },
      keyframes: {
        "os-in": { from: { opacity: "0", transform: "scale(0.96) translateY(6px)" }, to: { opacity: "1", transform: "none" } },
        "os-fade": { from: { opacity: "0" }, to: { opacity: "1" } },
        "os-up": { from: { opacity: "0", transform: "translateY(16px)" }, to: { opacity: "1", transform: "none" } },
        "os-sheet": { from: { transform: "translateY(100%)" }, to: { transform: "translateY(0)" } },
        "os-toast": { from: { opacity: "0", transform: "translateY(-8px) scale(0.98)" }, to: { opacity: "1", transform: "none" } },
        "os-pop": { "0%": { transform: "scale(0.6)", opacity: "0" }, "60%": { transform: "scale(1.08)", opacity: "1" }, "100%": { transform: "scale(1)" } },
        "os-shimmer": { from: { backgroundPosition: "-200% 0" }, to: { backgroundPosition: "200% 0" } },
        "os-drift": { "0%,100%": { transform: "translate3d(0,0,0)" }, "50%": { transform: "translate3d(-2%,1.5%,0)" } },
        "os-pulse": { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.45" } },
      },
      animation: {
        "os-in": "os-in var(--dur-base) var(--ease-out) both",
        "os-fade": "os-fade var(--dur-base) var(--ease-out) both",
        "os-up": "os-up var(--dur-slow) var(--ease-out) both",
        "os-sheet": "os-sheet var(--dur-slow) var(--ease-out) both",
        "os-toast": "os-toast var(--dur-base) var(--ease-spring) both",
        "os-pop": "os-pop 520ms var(--ease-spring) both",
        "os-shimmer": "os-shimmer 1.6s linear infinite",
        "os-drift": "os-drift 24s ease-in-out infinite",
        "os-pulse": "os-pulse 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
