"use client";

// Operator notebook — the running record of an engagement. The engine fills in
// discovered hosts and accounts automatically; the player adds their own notes.
// Everything is read from the game save, so it survives reloads and syncs.

import { useMemo, useState } from "react";
import { KeyRound, Plus, Server, StickyNote, Trash2 } from "lucide-react";
import type { NotebookEntry } from "@/engine/types";
import { useGame } from "@/store/gameStore";
import { OSButton, OSEmptyState, OSInput } from "../ui";

const GROUPS: { kind: NotebookEntry["kind"]; title: string; icon: React.ReactNode }[] = [
  { kind: "host", title: "Odkryte hosty", icon: <Server size={14} /> },
  { kind: "credential", title: "Zdobyte konta", icon: <KeyRound size={14} /> },
  { kind: "flag", title: "Flagi i sekrety", icon: <StickyNote size={14} /> },
  { kind: "note", title: "Notatki", icon: <StickyNote size={14} /> },
];

export default function NotebookApp(_props: { mobile: boolean }) {
  const engine = useGame((s) => s.engine)!;
  const addNote = useGame((s) => s.addNote);
  const removeNote = useGame((s) => s.removeNote);
  const tick = useGame((s) => s.tick);
  const [draft, setDraft] = useState("");

  // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute as findings accrue
  const book = useMemo(() => engine.player.notebook ?? [], [engine, tick]);
  const byKind = (k: NotebookEntry["kind"]) => book.filter((e) => e.kind === k).sort((a, b) => b.ts - a.ts);

  const submit = () => {
    if (!draft.trim()) return;
    addNote(draft);
    setDraft("");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b hairline p-3">
        <OSInput
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Dodaj notatkę… (albo `note` w terminalu)"
          hideLabel
          label="Nowa notatka"
          className="flex-1"
        />
        <OSButton size="sm" variant="primary" icon={<Plus size={14} />} onClick={submit} disabled={!draft.trim()}>
          Dodaj
        </OSButton>
      </div>

      <div className="scroll-area min-h-0 flex-1 space-y-4 overflow-auto p-4">
        {book.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <OSEmptyState icon={<StickyNote size={22} />} title="Notatnik pusty">
              Odkryte hosty i zdobyte konta pojawią się tu automatycznie. Własne spostrzeżenia dodasz powyżej lub
              poleceniem <code className="font-mono">note</code>.
            </OSEmptyState>
          </div>
        )}
        {GROUPS.map((g) => {
          const items = byKind(g.kind);
          if (!items.length) return null;
          return (
            <section key={g.kind}>
              <p className="os-label mb-1.5 flex items-center gap-1.5">
                {g.icon} {g.title} <span className="text-muted">({items.length})</span>
              </p>
              <ul className="space-y-1.5">
                {items.map((e) => (
                  <li
                    key={e.id}
                    className="group flex items-start gap-2 rounded-lg border hairline bg-white/[0.03] px-3 py-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-mono text-xs text-fg">{e.text}</span>
                      <span className="block text-2xs text-muted">
                        {e.auto ? "automatycznie" : "notatka"} · {new Date(e.ts).toLocaleString("pl-PL")}
                      </span>
                    </span>
                    {!e.auto && (
                      <button
                        onClick={() => removeNote(e.id)}
                        aria-label="Usuń notatkę"
                        className="shrink-0 rounded p-1 text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
