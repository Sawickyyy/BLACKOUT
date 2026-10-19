"use client";

import { useId, useState, type ReactElement, cloneElement } from "react";

/**
 * Lightweight tooltip: shows on hover and keyboard focus, hides on Escape,
 * linked through aria-describedby. Purely supplementary — the wrapped control
 * must already have an accessible name.
 */
export function OSTooltip({
  label,
  side = "bottom",
  children,
}: {
  label: string;
  side?: "top" | "bottom";
  children: ReactElement;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const child = cloneElement(children, {
    "aria-describedby": open ? id : undefined,
    onMouseEnter: (e: React.MouseEvent) => {
      setOpen(true);
      children.props.onMouseEnter?.(e);
    },
    onMouseLeave: (e: React.MouseEvent) => {
      setOpen(false);
      children.props.onMouseLeave?.(e);
    },
    onFocus: (e: React.FocusEvent) => {
      setOpen(true);
      children.props.onFocus?.(e);
    },
    onBlur: (e: React.FocusEvent) => {
      setOpen(false);
      children.props.onBlur?.(e);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      children.props.onKeyDown?.(e);
    },
  });
  return (
    <span className="relative inline-flex">
      {child}
      {open && (
        <span
          id={id}
          role="tooltip"
          className={`pointer-events-none absolute left-1/2 z-[80] -translate-x-1/2 whitespace-nowrap rounded-md border hairline bg-elevated px-2 py-1 text-2xs font-medium text-fg shadow-pop animate-os-fade ${
            side === "bottom" ? "top-full mt-2" : "bottom-full mb-2"
          }`}
        >
          {label}
        </span>
      )}
    </span>
  );
}
