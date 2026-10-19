"use client";

import { useRef, type ReactNode } from "react";

export interface TabDef<T extends string> {
  id: T;
  label: ReactNode;
  icon?: ReactNode;
}

/** WAI-ARIA tablist with roving focus (←/→, Home/End). */
export function OSTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className = "",
  idPrefix,
}: {
  tabs: TabDef<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
  idPrefix: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (i: number) => {
    const n = (i + tabs.length) % tabs.length;
    onChange(tabs[n]!.id);
    refs.current[n]?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label={label}
      className={`flex gap-1 rounded-xl border hairline bg-bg/50 p-1 ${className}`}
    >
      {tabs.map((t, i) => {
        const selected = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            id={`${idPrefix}-tab-${t.id}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") move(i + 1);
              else if (e.key === "ArrowLeft") move(i - 1);
              else if (e.key === "Home") move(0);
              else if (e.key === "End") move(tabs.length - 1);
              else return;
              e.preventDefault();
            }}
            className={`flex min-h-[34px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs font-medium transition-colors duration-fast ${
              selected ? "bg-elevated text-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]" : "text-text2 hover:text-fg"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function OSTabPanel({
  idPrefix,
  id,
  children,
  className = "",
}: {
  idPrefix: string;
  id: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div role="tabpanel" id={`${idPrefix}-panel-${id}`} aria-labelledby={`${idPrefix}-tab-${id}`} className={className}>
      {children}
    </div>
  );
}
