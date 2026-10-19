"use client";

import { useId } from "react";

/** BLACKNET mark: a terminal chevron inside a chamfered frame. Decorative. */
export default function Logo({ size = 20, className = "" }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  const g = `url(#bn-${id})`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={className}>
      <defs>
        <linearGradient id={`bn-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="rgb(var(--accent))" />
          <stop offset="1" stopColor="rgb(var(--accent2))" />
        </linearGradient>
      </defs>
      <path d="M8 2h16l6 6v16l-6 6H8l-6-6V8z" fill="none" stroke={g} strokeWidth="2.2" />
      <path d="M10 11l5 5-5 5" fill="none" stroke={g} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 21h6" stroke={g} strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}
