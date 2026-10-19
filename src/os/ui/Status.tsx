"use client";

type Tone = "ok" | "warn" | "danger" | "info" | "neutral";

const DOT: Record<Tone, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
  info: "bg-accent2",
  neutral: "bg-muted",
};
const TEXT: Record<Tone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
  info: "text-accent2",
  neutral: "text-text2",
};

/** Dot + label status. Colour is never the only signal — the label carries meaning. */
export function OSStatusIndicator({
  tone,
  label,
  pulse,
  showLabel = true,
  className = "",
}: {
  tone: Tone;
  label: string;
  pulse?: boolean;
  showLabel?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-2xs font-medium ${TEXT[tone]} ${className}`}>
      <span className="relative flex h-2 w-2" aria-hidden>
        {pulse && <span className={`absolute inset-0 rounded-full ${DOT[tone]} animate-os-pulse`} />}
        <span className={`relative h-2 w-2 rounded-full ${DOT[tone]}`} />
      </span>
      <span className={showLabel ? "" : "sr-only"}>{label}</span>
    </span>
  );
}

/** Small pill badge. */
export function OSBadge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  const bg: Record<Tone, string> = {
    ok: "bg-ok/10 text-ok border-ok/25",
    warn: "bg-warn/10 text-warn border-warn/25",
    danger: "bg-danger/10 text-danger border-danger/25",
    info: "bg-accent2/10 text-accent2 border-accent2/25",
    neutral: "bg-white/[0.05] text-text2 border-white/[0.08]",
  };
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-2xs font-medium ${bg[tone]}`}>
      {children}
    </span>
  );
}
