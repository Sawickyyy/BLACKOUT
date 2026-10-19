"use client";

import { useEffect, useRef, useState } from "react";
import type { BackupMeta } from "@/lib/autosave/backups";
import { useGame } from "@/store/gameStore";
import { ago, useNow } from "../SaveIndicator";

const STATE_TEXT: Record<string, string> = {
  saved: "Wszystko zapisane",
  dirty: "Są zmiany — zapis za chwilę",
  syncing: "Wysyłanie do chmury…",
  pending: "Zapisano na urządzeniu, czeka na chmurę",
  offline: "Offline — zapis na urządzeniu, wyślę po powrocie sieci",
  retrying: "Chmura chwilowo niedostępna — ponawiam",
  error: "Wymaga uwagi",
  suspended: "Gra przejęta przez inną kartę",
};

function kb(n?: number): string {
  return n === undefined ? "—" : `${(n / 1024).toFixed(1)} KB`;
}

export default function AutosaveSection() {
  const status = useGame((s) => s.saveStatus);
  const saveNow = useGame((s) => s.saveNow);
  const createBackup = useGame((s) => s.createBackup);
  const listBackups = useGame((s) => s.listBackups);
  const restoreBackup = useGame((s) => s.restoreBackup);
  const exportSave = useGame((s) => s.exportSave);
  const importSave = useGame((s) => s.importSave);
  const backupsVersion = useGame((s) => s.backupsVersion);
  const username = useGame((s) => s.username);
  const now = useNow(1000);

  const [backups, setBackups] = useState<BackupMeta[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    listBackups()
      .then((b) => alive && setBackups(b))
      .catch(() => alive && setBackups([]));
    return () => {
      alive = false;
    };
  }, [listBackups, backupsVersion]);

  if (!status) return null;

  const download = () => {
    const text = exportSave();
    if (!text) return;
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `blacknet-${username}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const res = await importSave(await file.text());
    setMsg(res.ok ? "Zaimportowano zapis." : res.error);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="border-t border-line pt-3" data-testid="autosave-section">
      <div className="mb-2 text-muted">Autozapis</div>

      <div className="surface mb-2 space-y-1 rounded-md p-2 text-[11px]">
        <div className={status.state === "error" || status.state === "suspended" ? "text-danger" : "text-fg"}>
          {STATE_TEXT[status.state]}
        </div>
        {status.error && <div className="text-danger">{status.error}</div>}
        <div className="flex justify-between">
          <span className="text-muted">Urządzenie</span>
          <span>{ago(status.lastLocalAt, now)}</span>
        </div>
        {status.backend === "cloud" && (
          <div className="flex justify-between">
            <span className="text-muted">Chmura</span>
            <span>
              {ago(status.lastCloudAt, now)}
              {status.cloudRevision !== undefined ? ` · rew. ${status.cloudRevision}` : ""}
            </span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted">Sieć</span>
          <span className={status.online ? "text-ok" : "text-warn"}>{status.online ? "online" : "offline"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Rozmiar / zapisy w sesji</span>
          <span>
            {kb(status.bytes)} · {status.writes}
          </span>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <button className="btn py-1" onClick={() => void saveNow()}>
          Zapisz teraz
        </button>
        <button className="btn py-1" onClick={() => void createBackup("ręczna")}>
          Utwórz kopię
        </button>
        <button className="btn py-1" onClick={download}>
          Eksportuj plik
        </button>
        <button className="btn py-1" onClick={() => fileRef.current?.click()}>
          Importuj plik
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </div>
      {msg && <p className="mb-2 text-[11px] text-warn">{msg}</p>}

      <div className="mb-1 text-muted">Kopie zapasowe ({backups.length})</div>
      {backups.length === 0 ? (
        <p className="text-[11px] text-muted">
          Kopie powstają automatycznie po każdej misji, co 10 minut gry i przed ryzykownymi operacjami.
        </p>
      ) : (
        <ul className="space-y-1" data-testid="backup-list">
          {backups.map((b) => (
            <li key={b.id} className="surface rounded-md p-2 text-[11px]">
              <div className="flex justify-between gap-2">
                <span className="truncate text-fg">{b.reason}</span>
                <span className="shrink-0 text-muted">{ago(b.createdAt, now)}</span>
              </div>
              <div className="mt-0.5 flex items-center justify-between text-muted">
                <span>
                  misje {b.summary.completedMissions}/20 · {b.summary.wealth} kr · {kb(b.bytes)}
                </span>
                {confirmId === b.id ? (
                  <span className="flex gap-1">
                    <button
                      className="btn py-0 text-[10px] text-warn"
                      onClick={() => {
                        setConfirmId(null);
                        void restoreBackup(b.id);
                      }}
                    >
                      Potwierdź
                    </button>
                    <button className="btn py-0 text-[10px]" onClick={() => setConfirmId(null)}>
                      Anuluj
                    </button>
                  </span>
                ) : (
                  <button className="btn py-0 text-[10px]" onClick={() => setConfirmId(b.id)}>
                    Przywróć
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
