"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Archive, CornerDownLeft, Palette, Save, Search, TerminalSquare } from "lucide-react";
import { sendToTerminal, focusTerminal } from "@/components/terminalBridge";
import { useGame } from "@/store/gameStore";
import { APP_IDS, APPS } from "../apps";
import { useOS } from "../osStore";
import { useFocusTrap } from "../ui";

interface Item {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
}

/** Raycast-style command palette (⌘K / Ctrl+K). Every entry performs a real action. */
export default function CommandPalette() {
  const open = useOS((s) => s.paletteOpen);
  const setOS = useOS((s) => s.set);
  const launch = useOS((s) => s.launch);
  const applySettings = useGame((s) => s.applySettings);
  const saveNow = useGame((s) => s.saveNow);
  const createBackup = useGame((s) => s.createBackup);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const close = () => setOS({ paletteOpen: false });
  useFocusTrap(ref, open, close);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOS({ paletteOpen: !useOS.getState().paletteOpen });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOS]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const runInTerminal = (cmd: string) => () => {
      launch("terminal");
      setTimeout(() => {
        sendToTerminal(cmd + "\r");
        focusTerminal();
      }, 60);
    };
    return [
      ...APP_IDS.map((id) => {
        const A = APPS[id];
        const Icon = A.icon;
        return { id: `app-${id}`, group: "Aplikacje", label: A.title, hint: A.description, icon: <Icon size={16} />, run: () => launch(id) };
      }),
      ...[
        ["help", "Lista poleceń"],
        ["missions", "Lista zleceń"],
        ["wallet", "Portfel i umiejętności"],
        ["hosts", "Odkryte hosty"],
        ["ls -la", "Zawartość katalogu"],
      ].map(([cmd, hint]) => ({
        id: `cmd-${cmd}`,
        group: "Uruchom w terminalu",
        label: cmd!,
        hint,
        icon: <TerminalSquare size={16} />,
        run: runInTerminal(cmd!),
      })),
      ...(["green", "amber", "blue"] as const).map((t) => ({
        id: `theme-${t}`,
        group: "Wygląd",
        label: `Motyw: ${t === "green" ? "zielony" : t === "amber" ? "bursztynowy" : "niebieski"}`,
        icon: <Palette size={16} />,
        run: () => applySettings({ theme: t }),
      })),
      { id: "save", group: "System", label: "Zapisz teraz", icon: <Save size={16} />, run: () => void saveNow() },
      { id: "backup", group: "System", label: "Utwórz kopię zapasową", icon: <Archive size={16} />, run: () => void createBackup("ręczna") },
    ];
  }, [launch, applySettings, saveNow, createBackup]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => `${i.label} ${i.hint ?? ""} ${i.group}`.toLowerCase().includes(q));
  }, [items, query]);

  if (!open || typeof document === "undefined") return null;

  const choose = (i: Item | undefined) => {
    if (!i) return;
    close();
    i.run();
  };

  let lastGroup = "";
  return createPortal(
    <div className="fixed inset-0 z-[92] flex items-start justify-center p-4 pt-[12vh]">
      <div className="absolute inset-0 bg-black/50 animate-os-fade" onClick={close} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Paleta poleceń"
        className="glass relative w-full max-w-[600px] overflow-hidden rounded-os-lg shadow-window animate-os-in"
      >
        <div className="flex items-center gap-3 border-b hairline px-4">
          <Search size={17} className="text-muted" aria-hidden />
          <input
            data-autofocus
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={filtered[active] ? `pal-${filtered[active]!.id}` : undefined}
            aria-label="Szukaj aplikacji i poleceń"
            placeholder="Szukaj aplikacji, poleceń, ustawień…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, filtered.length - 1));
              else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
              else if (e.key === "Enter") choose(filtered[active]);
              else return;
              e.preventDefault();
            }}
            className="h-14 flex-1 bg-transparent text-[16px] text-fg placeholder:text-muted focus:outline-none"
          />
          <kbd className="rounded border hairline px-1.5 py-0.5 font-mono text-2xs text-muted">esc</kbd>
        </div>
        <ul id="palette-list" role="listbox" aria-label="Wyniki" className="scroll-area max-h-[min(52vh,420px)] p-2">
          {filtered.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">Brak wyników dla „{query}”</li>}
          {filtered.map((item, idx) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <li key={item.id} role="presentation">
                {header && <div className="os-label px-3 pb-1 pt-3">{header}</div>}
                <div
                  id={`pal-${item.id}`}
                  role="option"
                  aria-selected={idx === active}
                  onMouseMove={() => setActive(idx)}
                  onClick={() => choose(item)}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 ${
                    idx === active ? "bg-white/[0.08]" : ""
                  }`}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.05] text-text2">{item.icon}</span>
                  <span className="flex-1">
                    <span className={`block text-sm ${item.group === "Uruchom w terminalu" ? "font-mono" : ""} text-fg`}>{item.label}</span>
                    {item.hint && <span className="block text-2xs text-muted">{item.hint}</span>}
                  </span>
                  {idx === active && <CornerDownLeft size={14} className="text-muted" aria-hidden />}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
