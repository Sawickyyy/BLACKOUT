"use client";

import { useGame } from "@/store/gameStore";

export default function Notifications() {
  const notes = useGame((s) => s.notes);
  const dismiss = useGame((s) => s.dismissNote);

  return (
    <div className="pointer-events-none fixed right-3 top-14 z-40 flex w-[min(92vw,340px)] flex-col gap-2">
      {notes.map((n) => (
        <button
          key={n.id}
          onClick={() => dismiss(n.id)}
          className={`pointer-events-auto surface-2 animate-flicker rounded-md border-l-2 px-3 py-2 text-left text-xs ${
            n.kind === "mission"
              ? "border-l-ok"
              : n.kind === "alert"
                ? "border-l-danger"
                : "border-l-accent2"
          }`}
        >
          {n.text}
        </button>
      ))}
    </div>
  );
}
