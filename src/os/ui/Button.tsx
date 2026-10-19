"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { OSTooltip } from "./Tooltip";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-accent text-[#04140D] hover:brightness-110 active:brightness-95 shadow-[0_0_0_1px_rgb(var(--accent)/0.5),0_8px_24px_-8px_rgb(var(--accent)/0.55)]",
  secondary: "bg-elevated text-fg border hairline hover:border-accent/40 hover:bg-[rgb(var(--elevated)/0.8)]",
  ghost: "text-text2 hover:text-fg hover:bg-white/[0.06]",
  danger: "bg-danger/10 text-danger border border-danger/40 hover:bg-danger/20",
};

const SIZE: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-[10px]",
  lg: "h-12 px-5 text-[0.95rem] gap-2 rounded-xl",
};

export interface OSButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  loading?: boolean;
}

export const OSButton = forwardRef<HTMLButtonElement, OSButtonProps>(function OSButton(
  { variant = "secondary", size = "md", icon, loading, className = "", children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`inline-flex select-none items-center justify-center font-medium transition-[filter,background-color,border-color,transform] duration-fast ease-os active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />
      ) : (
        icon
      )}
      {children}
    </button>
  );
});

export interface OSIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name — required: icon-only buttons must be labelled. */
  label: string;
  tooltip?: boolean;
  size?: "sm" | "md" | "lg";
  active?: boolean;
}

const ICON_SIZE = { sm: "h-8 w-8 rounded-lg", md: "h-10 w-10 rounded-[10px]", lg: "h-11 w-11 rounded-xl" };

export const OSIconButton = forwardRef<HTMLButtonElement, OSIconButtonProps>(function OSIconButton(
  { label, tooltip = true, size = "md", active, className = "", children, ...rest },
  ref,
) {
  const btn = (
    <button
      ref={ref}
      aria-label={label}
      aria-pressed={active}
      className={`inline-flex shrink-0 items-center justify-center text-text2 transition-colors duration-fast hover:bg-white/[0.07] hover:text-fg ${
        active ? "bg-white/[0.08] text-fg" : ""
      } ${ICON_SIZE[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
  return tooltip ? <OSTooltip label={label}>{btn}</OSTooltip> : btn;
});
