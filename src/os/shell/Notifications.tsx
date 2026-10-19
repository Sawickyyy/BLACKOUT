"use client";

import { useRef } from "react";
import { BellOff, CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { useGame, type GameNote } from "@/store/gameStore";
import { ago, useNow } from "@/components/SaveIndicator";
import { OSBottomSheet, OSButton, OSEmptyState, useFocusTrap } from "../ui";

const ICON = {
  mission: <CheckCircle2 size={16} className="text-ok" aria-hidden />,
  alert: <TriangleAlert size={16} className="text-danger" aria-hidden />,
  info: <Info size={16} className="text-accent2" aria-hidden />,
};

/** Live toasts. Alerts are announced assertively, the rest politely. */
export function OSToaster({ mobile }: { mobile: boolean }) {
  const notes = useGame((s) => s.notes);
  const dismiss = useGame((s) => s.dismissNote);
  return (
    <div
      className={`pointer-events-none fixed z-[85] flex flex-col gap-2 ${
        mobile ? "inset-x-3" : "right-4 w-[360px]"
      }`}
      style={{ top: mobile ? "calc(var(--sat) + 52px)" : 52 }}
    >
      <div aria-live="polite" className="sr-only">
        {notes.filter((n) => n.kind !== "alert").map((n) => n.text).join(". ")}
      </div>
      <div aria-live="assertive" className="sr-only">
        {notes.filter((n) => n.kind === "alert").map((n) => n.text).join(". ")}
      </div>
      {notes.slice(-3).map((n) => (
        <div
          key={n.id}
          className="glass pointer-events-auto flex items-start gap-3 rounded-xl px-3.5 py-3 shadow-pop animate-os-toast"
        >
          <span className="mt-0.5">{ICON[n.kind]}</span>
          <p className="flex-1 text-[0.8125rem] leading-snug text-fg">{n.text}</p>
          <button
            onClick={() => dismiss(n.id)}
            aria-label="Zamknij powiadomienie"
            className="-m-1 flex h-7 w-7 items-center justify-center rounded-md text-muted hover:text-fg"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function NoteList({ notes }: { notes: GameNote[] }) {
  const now = useNow(10_000);
  if (!notes.length) {
    return (
      <OSEmptyState icon={<BellOff size={20} />} title="Brak powiadomień">
        Tu pojawią się ukończone zlecenia, alarmy i zdarzenia systemowe z tej sesji.
      </OSEmptyState>
    );
  }
  return (
    <ul className="space-y-1.5">
      {notes.map((n) => (
        <li key={n.id} className="flex items-start gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5">
          <span className="mt-0.5">{ICON[n.kind]}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.8125rem] leading-snug text-fg">{n.text}</p>
            <p className="mt-0.5 text-2xs text-muted">{ago(n.ts, now)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function NotificationCenter({ open, onClose, mobile }: { open: boolean; onClose: () => void; mobile: boolean }) {
  const history = useGame((s) => s.noteHistory);
  const clear = useGame((s) => s.clearNoteHistory);
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, open && !mobile, onClose);

  if (mobile) {
    return (
      <OSBottomSheet open={open} onClose={onClose} title="Powiadomienia">
        <NoteList notes={history} />
        {history.length > 0 && (
          <OSButton variant="ghost" size="sm" className="mt-3 w-full" onClick={clear}>
            Wyczyść historię
          </OSButton>
        )}
      </OSBottomSheet>
    );
  }
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-[88]" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-label="Centrum powiadomień"
        tabIndex={-1}
        className="glass fixed right-3 top-12 z-[89] flex max-h-[70vh] w-[380px] flex-col rounded-os-lg shadow-window animate-os-toast"
      >
        <div className="flex items-center justify-between border-b hairline px-4 py-3">
          <h2 className="text-sm font-semibold text-fg">Powiadomienia</h2>
          {history.length > 0 && (
            <OSButton variant="ghost" size="sm" onClick={clear}>
              Wyczyść
            </OSButton>
          )}
        </div>
        <div className="scroll-area p-3">
          <NoteList notes={history} />
        </div>
      </div>
    </>
  );
}
