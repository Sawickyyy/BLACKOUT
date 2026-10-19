"use client";

import type { ReactNode } from "react";

/** Content card used inside apps. */
export function OSPanel({
  title,
  actions,
  children,
  className = "",
  as: Tag = "section",
  padded = true,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
  padded?: boolean;
}) {
  return (
    <Tag className={`os-surface rounded-os-lg ${padded ? "p-4" : ""} ${className}`}>
      {(title || actions) && (
        <header className={`flex items-center justify-between gap-3 ${padded ? "mb-3" : "px-4 pt-4 pb-3"}`}>
          {title && <h3 className="text-[0.8125rem] font-semibold tracking-tight text-fg">{title}</h3>}
          {actions && <div className="flex items-center gap-1.5">{actions}</div>}
        </header>
      )}
      {children}
    </Tag>
  );
}

export function OSEmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center animate-os-fade">
      {icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border hairline bg-elevated text-text2">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-fg">{title}</p>
      {children && <p className="mt-1 max-w-xs text-xs leading-relaxed text-text2">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Skeleton lines + optional label. role=status announces loading to AT. */
export function OSLoadingState({ label = "Ładowanie…", lines = 3 }: { label?: string; lines?: number }) {
  return (
    <div role="status" aria-live="polite" className="space-y-2.5 p-4">
      <span className="sr-only">{label}</span>
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="h-3 rounded-full bg-[length:200%_100%] animate-os-shimmer"
          style={{
            width: `${90 - i * 18}%`,
            backgroundImage:
              "linear-gradient(90deg, rgb(var(--line)/0.05) 0%, rgb(var(--line)/0.12) 50%, rgb(var(--line)/0.05) 100%)",
          }}
        />
      ))}
    </div>
  );
}
