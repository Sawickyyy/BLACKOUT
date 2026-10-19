"use client";

import { useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { useGame } from "@/store/gameStore";
import AutosaveSection from "./AutosaveSection";

export default function SettingsPanel() {
  const engine = useGame((s) => s.engine);
  const applySettings = useGame((s) => s.applySettings);
  const resetToNewGame = useGame((s) => s.resetToNewGame);
  const saveNow = useGame((s) => s.saveNow);
  const backend = useGame((s) => s.backend);
  const clearAllSaves = useGame((s) => s.clearAllSaves);
  const slot = useGame((s) => s.slot);
  useGame((s) => s.tick);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!engine) return null;
  const s = engine.player.settings;

  const logout = async () => {
    await saveNow();
    try {
      window.localStorage.removeItem("blacknet:last");
    } catch {
      /* ignore */
    }
    const supabase = getSupabaseBrowser();
    if (supabase) await supabase.auth.signOut();
    window.location.reload();
  };

  const deleteAccount = async () => {
    const supabase = getSupabaseBrowser();
    if (backend === "cloud" && supabase) {
      // Remove the player's own rows (RLS-scoped). Full auth.users deletion
      // requires a privileged server function; see DEPLOYMENT.md.
      await supabase.from("saves").delete().neq("slot", -1);
      await supabase.auth.signOut();
    }
    // Journal (+ its backup slot) and all IndexedDB backups for this player.
    await clearAllSaves();
    try {
      window.localStorage.removeItem("blacknet:last");
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  return (
    <div className="flex flex-col gap-4 p-3 text-xs">
      <h2 className="text-sm font-bold text-accent">Ustawienia</h2>

      <div>
        <div className="mb-1 text-muted">Motyw</div>
        <div className="flex gap-2">
          {(["green", "amber", "blue"] as const).map((t) => (
            <button
              key={t}
              className={`btn flex-1 py-1 ${s.theme === t ? "btn-primary" : ""}`}
              onClick={() => applySettings({ theme: t })}
            >
              {t === "green" ? "zielony" : t === "amber" ? "bursztyn" : "niebieski"}
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center justify-between">
        <span className="text-muted">Efekt CRT</span>
        <input type="checkbox" checked={s.crt} onChange={(e) => applySettings({ crt: e.target.checked })} />
      </label>

      <label className="flex items-center justify-between">
        <span className="text-muted">Ograniczone animacje</span>
        <input
          type="checkbox"
          checked={s.reducedMotion}
          onChange={(e) => applySettings({ reducedMotion: e.target.checked })}
        />
      </label>

      <div className="flex items-center justify-between">
        <span className="text-muted">Rozmiar czcionki</span>
        <div className="flex items-center gap-2">
          <button className="btn py-0.5" onClick={() => applySettings({ fontSize: Math.max(10, s.fontSize - 1) })}>
            −
          </button>
          <span className="w-6 text-center text-fg">{s.fontSize}</span>
          <button className="btn py-0.5" onClick={() => applySettings({ fontSize: Math.min(22, s.fontSize + 1) })}>
            +
          </button>
        </div>
      </div>

      <div className="border-t border-line pt-3">
        <div className="mb-1 text-muted">Konto</div>
        <div className="mb-2 text-fg">
          {engine.player.username}
          <span className="ml-2 text-[10px] text-muted">
            ({backend === "cloud" ? "chmura" : "lokalnie"}, slot {slot})
          </span>
        </div>
        <button className="btn w-full py-1" onClick={logout}>
          {backend === "cloud" ? "Wyloguj" : "Zakończ sesję lokalną"}
        </button>
      </div>

      <AutosaveSection />

      <div className="border-t border-line pt-3">
        {!confirmReset ? (
          <button className="btn w-full py-1 text-warn" onClick={() => setConfirmReset(true)}>
            Nowa gra (obecna trafi do kopii)
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              className="btn flex-1 py-1 text-danger"
              onClick={() => {
                void resetToNewGame();
                setConfirmReset(false);
              }}
            >
              Potwierdź reset
            </button>
            <button className="btn flex-1 py-1" onClick={() => setConfirmReset(false)}>
              Anuluj
            </button>
          </div>
        )}
      </div>

      <div>
        {!confirmDelete ? (
          <button className="btn w-full py-1 text-danger" onClick={() => setConfirmDelete(true)}>
            Usuń konto / dane
          </button>
        ) : (
          <div className="flex gap-2">
            <button className="btn flex-1 py-1 text-danger" onClick={deleteAccount}>
              Trwale usuń
            </button>
            <button className="btn flex-1 py-1" onClick={() => setConfirmDelete(false)}>
              Anuluj
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
