import type { Config } from "tailwindcss";

// BLACKNET design tokens. Three themes (green/amber/blue) are driven by CSS
// variables set on :root in globals.css; Tailwind reads them via rgb(var(--x)).
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        panel: "rgb(var(--panel) / <alpha-value>)",
        panel2: "rgb(var(--panel2) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        accent2: "rgb(var(--accent2) / <alpha-value>)",
        fg: "rgb(var(--fg) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
        warn: "rgb(var(--warn) / <alpha-value>)",
        ok: "rgb(var(--ok) / <alpha-value>)",
      },
      fontFamily: {
        mono: [
          "var(--font-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      boxShadow: {
        glow: "0 0 0 1px rgb(var(--accent) / 0.3), 0 0 24px rgb(var(--accent) / 0.12)",
      },
      keyframes: {
        flicker: {
          "0%,100%": { opacity: "1" },
          "92%": { opacity: "1" },
          "93%": { opacity: "0.82" },
          "94%": { opacity: "1" },
        },
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
      },
      animation: {
        flicker: "flicker 6s linear infinite",
        scan: "scan 7s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
