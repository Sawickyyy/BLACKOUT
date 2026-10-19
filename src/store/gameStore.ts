"use client";

// Zustand store bridging the pure GameEngine to React. It owns the engine
// instance, bumps a `tick` after every mutation so panels re-render, and hands
// every change to the SaveManager (src/lib/autosave) with a priority: routine
// edits are debounced, milestones (missions, purchases, host hops) save at once.

import { create } from "zustand";
import { GameEngine, type RunResult } from "@/engine/game";
import type { GameSettings, SaveGame } from "@/engine/types";
import { sha256 } from "@/engine/util/hash";
import { newSaveGame } from "@/engine/world/seed";
import { browserBackupStore, type BackupMeta, type BackupStore } from "@/lib/autosave/backups";
import { bindLifecycle } from "@/lib/autosave/lifecycle";
import { SaveManager, type Priority, type SaveStatus } from "@/lib/autosave/manager";
import { validateSave } from "@/lib/autosave/progress";
import type { PreparedSession } from "@/lib/autosave/session";

export type Backend = "cloud" | "local";

export interface GameNote {
  id: string;
  kind: "mission" | "alert" | "info";
  text: string;
  ts: number;
}

/** A mission completion to celebrate in the UI (reward animation). */
export interface Celebration {
  id: string;
  missionId: string;
}

interface BootOptions {
  prepared: PreparedSession;
  userKey: string;
  backend: Backend;
  username: string;
  email?: string;
  slot?: number;
}

interface GameState {
  engine: GameEngine | null;
  tick: number;
  ready: boolean;
  backend: Backend;
  userKey: string;
  username: string;
  email?: string;
  slot: number;
  saveStatus: SaveStatus | null;
  /** Bumped whenever a backup is written, so lists can refresh. */
  backupsVersion: number;
  notes: GameNote[];
  /** Every notification of this session, newest first (notification centre). */
  noteHistory: GameNote[];
  celebrations: Celebration[];
  /** Exit code + time of the last command, for the terminal status bar. */
  lastExit: { code: number; at: number } | null;

  boot: (opts: BootOptions) => void;
  run: (line: string) => RunResult | null;
  mutate: (fn: (engine: GameEngine) => void, priority?: Priority) => void;
  complete: (line: string) => string[];
  applySettings: (partial: Partial<GameSettings>) => void;
  saveNow: () => Promise<void>;
  createBackup: (reason?: string) => Promise<void>;
  listBackups: () => Promise<BackupMeta[]>;
  restoreBackup: (id: string) => Promise<boolean>;
  exportSave: () => string | null;
  importSave: (text: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  suspendSaving: (reason: string) => void;
  clearAllSaves: () => Promise<void>;
  pushNote: (kind: GameNote["kind"], text: string) => void;
  dismissNote: (id: string) => void;
  clearNoteHistory: () => void;
  dismissCelebration: (id: string) => void;
  resetToNewGame: () => Promise<void>;
}

// Non-serializable session objects live outside the reactive state.
let manager: SaveManager | null = null;
let unbindLifecycle: (() => void) | null = null;
let session: PreparedSession | null = null;
let backups: BackupStore | null = null;

export function getBackupStore(): BackupStore {
  if (!backups) backups = browserBackupStore();
  return backups;
}

const EXPORT_FORMAT = "blacknet-save";

export const useGame = create<GameState>((set, get) => {
  /** Swap in a new game state without tearing down the save session. */
  const replaceEngine = (save: SaveGame) => {
    const engine = new GameEngine(save);
    engine.player.username = get().username || engine.player.username;
    set({ engine, tick: get().tick + 1 });
  };

  return {
    engine: null,
    tick: 0,
    ready: false,
    backend: "local",
    userKey: "local",
    username: "operator",
    slot: 0,
    saveStatus: null,
    backupsVersion: 0,
    notes: [],
    noteHistory: [],
    celebrations: [],
    lastExit: null,

    boot: ({ prepared, userKey, backend, username, email, slot = 0 }) => {
      manager?.dispose();
      unbindLifecycle?.();
      if (session && session !== prepared) session.guard.dispose();
      session = prepared;

      set({ backend, userKey, username, email, slot });
      replaceEngine(prepared.save);

      manager = new SaveManager({
        userKey,
        name: `${username} — slot ${slot}`,
        getSave: () => get().engine!.toSave(),
        journal: prepared.journal,
        cloud: prepared.cloud,
        backups: getBackupStore(),
        initial: {
          cloudRevision: prepared.cloudRevision,
          pendingCloud: prepared.pendingCloud,
          checksum: prepared.checksum,
        },
        online: typeof navigator === "undefined" ? true : navigator.onLine,
        onStatus: (s) => set({ saveStatus: s }),
        onAdoptRemote: (save) => replaceEngine(save),
        onNotice: (kind, text) => get().pushNote(kind, text),
        onBackup: () => set({ backupsVersion: get().backupsVersion + 1 }),
      });
      unbindLifecycle = bindLifecycle(manager);
      set({ ready: true });

      for (const n of prepared.notices) get().pushNote(n.kind, n.text);
      // Write the journal right away (new game / pending sync from last session).
      void manager.flush({ force: true, reason: "boot" });
    },

    run: (line) => {
      const engine = get().engine;
      if (!engine) return null;
      const result = engine.run(line);
      for (const id of result.completedMissions) {
        get().pushNote("mission", `Ukończono zlecenie: ${id.toUpperCase()}`);
        void manager?.backup(`misja ${id.toUpperCase()} ukończona`);
        set({ celebrations: [...get().celebrations, { id: `${id}_${Date.now()}`, missionId: id }] });
      }
      for (const id of result.newlyAvailable) {
        get().pushNote("info", `Nowe zlecenie dostępne: ${id.toUpperCase()}`);
      }
      if (result.alerted) {
        get().pushNote("alert", "⚠ Wykryto podejrzaną aktywność! Poziom alarmu rośnie.");
      }
      set({ tick: get().tick + 1, lastExit: { code: result.code, at: Date.now() } });
      const milestone = result.completedMissions.length > 0 || result.newlyAvailable.length > 0 || result.sessionChanged;
      manager?.markDirty(milestone ? "high" : "normal", line);
      return result;
    },

    mutate: (fn, priority = "high") => {
      const engine = get().engine;
      if (!engine) return;
      fn(engine);
      engine.player.updatedAt = Date.now();
      set({ tick: get().tick + 1 });
      manager?.markDirty(priority);
    },

    complete: (line) => {
      const engine = get().engine;
      return engine ? engine.complete(line) : [];
    },

    applySettings: (partial) => {
      const engine = get().engine;
      if (!engine) return;
      engine.player.settings = { ...engine.player.settings, ...partial };
      set({ tick: get().tick + 1 });
      manager?.markDirty("normal");
    },

    saveNow: async () => {
      await manager?.flush({ force: true, reason: "manual" });
    },

    createBackup: async (reason = "ręczna") => {
      await manager?.backup(reason);
    },

    listBackups: () => getBackupStore().list(get().userKey),

    restoreBackup: async (id) => {
      const save = await getBackupStore().load(id);
      if (!save) {
        get().pushNote("alert", "Kopia jest uszkodzona lub niedostępna.");
        return false;
      }
      await manager?.backup("przed przywróceniem kopii");
      replaceEngine(save);
      manager?.markDirty("high", "restore");
      get().pushNote("info", "Przywrócono kopię zapasową.");
      return true;
    },

    exportSave: () => {
      const engine = get().engine;
      if (!engine) return null;
      const save = engine.toSave();
      return JSON.stringify({
        format: EXPORT_FORMAT,
        version: 1,
        exportedAt: new Date().toISOString(),
        checksum: sha256(JSON.stringify(save)),
        save,
      });
    },

    importSave: async (text) => {
      let parsed: { format?: string; checksum?: string; save?: unknown };
      try {
        parsed = JSON.parse(text);
      } catch {
        return { ok: false, error: "To nie jest plik JSON." };
      }
      if (parsed.format !== EXPORT_FORMAT || !parsed.save) {
        return { ok: false, error: "To nie jest plik zapisu BLACKNET." };
      }
      if (parsed.checksum && parsed.checksum !== sha256(JSON.stringify(parsed.save))) {
        return { ok: false, error: "Plik zapisu jest uszkodzony (zła suma kontrolna)." };
      }
      if (!validateSave(parsed.save)) return { ok: false, error: "Plik ma nieprawidłową strukturę." };
      await manager?.backup("przed importem pliku");
      replaceEngine(parsed.save);
      manager?.markDirty("high", "import");
      get().pushNote("info", "Zaimportowano zapis z pliku.");
      return { ok: true };
    },

    suspendSaving: (reason) => {
      manager?.suspend(reason);
    },

    clearAllSaves: async () => {
      manager?.dispose();
      unbindLifecycle?.();
      manager = null;
      session?.journal.clear();
      await getBackupStore().clear(get().userKey).catch(() => undefined);
    },

    pushNote: (kind, text) => {
      const note: GameNote = { id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, kind, text, ts: Date.now() };
      set({ notes: [...get().notes, note], noteHistory: [note, ...get().noteHistory].slice(0, 60) });
      setTimeout(() => get().dismissNote(note.id), 6000);
    },

    dismissNote: (id) => set({ notes: get().notes.filter((n) => n.id !== id) }),
    clearNoteHistory: () => set({ noteHistory: [] }),
    dismissCelebration: (id) => set({ celebrations: get().celebrations.filter((c) => c.id !== id) }),

    resetToNewGame: async () => {
      await manager?.backup("przed nową grą");
      replaceEngine(newSaveGame(get().username));
      manager?.markDirty("high", "reset");
    },
  };
});
