"use client";

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";

export interface OSInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string | null;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Visually hide the label but keep it for screen readers. */
  hideLabel?: boolean;
}

export const OSInput = forwardRef<HTMLInputElement, OSInputProps>(function OSInput(
  { label, hint, error, leading, trailing, hideLabel, className = "", id, ...rest },
  ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  const describedBy = error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined;
  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className={hideLabel ? "sr-only" : "mb-1.5 block text-xs font-medium text-text2"}>
          {label}
        </label>
      )}
      <div
        className={`flex items-center gap-2 rounded-[10px] border bg-bg/60 px-3 transition-[border-color,box-shadow] duration-fast focus-within:border-accent/70 focus-within:shadow-[0_0_0_3px_rgb(var(--accent)/0.15)] ${
          error ? "border-danger/60" : "border-white/[0.1]"
        }`}
      >
        {leading && <span className="shrink-0 text-muted">{leading}</span>}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="h-11 min-w-0 flex-1 bg-transparent text-[16px] text-fg placeholder:text-muted focus:outline-none sm:text-sm"
          {...rest}
        />
        {trailing && <span className="shrink-0">{trailing}</span>}
      </div>
      {error ? (
        <p id={`${inputId}-err`} className="mt-1.5 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
