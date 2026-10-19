"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useFocusTrap } from "./focus";
import { OSButton } from "./Button";

function usePortal(): HTMLElement | null {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => setEl(document.body), []);
  return el;
}

/** Centered modal window. */
export function OSModal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 440,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const portal = usePortal();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  useFocusTrap(ref, open, onClose);
  if (!open || !portal) return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" style={{ height: "var(--app-h)" }}>
      <div className="absolute inset-0 bg-black/55 animate-os-fade" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className="glass relative max-h-[85%] w-full overflow-hidden rounded-os-lg shadow-window animate-os-in"
        style={{ maxWidth: width }}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div>
            <h2 id={titleId} className="text-[0.95rem] font-semibold tracking-tight text-fg">
              {title}
            </h2>
            {description && (
              <div id={descId} className="mt-1 text-xs leading-relaxed text-text2">
                {description}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Zamknij"
            className="-mr-2 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text2 hover:bg-white/[0.07] hover:text-fg"
          >
            <X size={16} />
          </button>
        </div>
        {children && <div className="scroll-area max-h-[60vh] px-5 py-4">{children}</div>}
        {footer && <div className="flex justify-end gap-2 border-t hairline px-5 py-3">{footer}</div>}
      </div>
    </div>,
    portal,
  );
}

/** Confirmation dialog. `danger` styles the confirm action as destructive. */
export function OSDialog({
  open,
  title,
  message,
  confirmLabel = "Potwierdź",
  cancelLabel = "Anuluj",
  danger,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  return (
    <OSModal
      open={open}
      onClose={onCancel}
      title={title}
      description={message}
      footer={
        <>
          <OSButton variant="ghost" size="sm" onClick={onCancel} data-autofocus>
            {cancelLabel}
          </OSButton>
          <OSButton variant={danger ? "danger" : "primary"} size="sm" onClick={onConfirm}>
            {confirmLabel}
          </OSButton>
        </>
      }
    >
      {children}
    </OSModal>
  );
}

/** Mobile bottom sheet: slides up, drag the handle down to dismiss. */
export function OSBottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const portal = usePortal();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [drag, setDrag] = useState(0);
  const startY = useRef<number | null>(null);
  useFocusTrap(ref, open, onClose);
  useEffect(() => {
    if (!open) setDrag(0);
  }, [open]);
  if (!open || !portal) return null;

  const onStart = (y: number) => (startY.current = y);
  const onMove = (y: number) => startY.current !== null && setDrag(Math.max(0, y - startY.current));
  const onEnd = () => {
    if (drag > 90) onClose();
    else setDrag(0);
    startY.current = null;
  };

  return createPortal(
    <div className="fixed inset-x-0 top-0 z-[90]" style={{ height: "var(--app-h)" }}>
      <div className="absolute inset-0 bg-black/50 animate-os-fade" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="glass absolute inset-x-0 bottom-0 flex max-h-[88%] flex-col rounded-t-[22px] shadow-window animate-os-sheet safe-bottom"
        style={{ transform: drag ? `translateY(${drag}px)` : undefined, transition: drag ? "none" : undefined }}
      >
        <div
          className="flex cursor-grab touch-none flex-col items-center pb-2 pt-2.5"
          onTouchStart={(e) => onStart(e.touches[0]!.clientY)}
          onTouchMove={(e) => onMove(e.touches[0]!.clientY)}
          onTouchEnd={onEnd}
        >
          <span className="h-1 w-10 rounded-full bg-white/25" aria-hidden />
        </div>
        <div className="flex items-center justify-between px-5 pb-2">
          <h2 id={titleId} className="text-[0.95rem] font-semibold tracking-tight text-fg">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Zamknij"
            className="-mr-2 flex h-10 w-10 items-center justify-center rounded-lg text-text2 hover:text-fg"
          >
            <X size={18} />
          </button>
        </div>
        <div className="scroll-area flex-1 px-5 pb-5">{children}</div>
      </div>
    </div>,
    portal,
  );
}
