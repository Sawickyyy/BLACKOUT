"use client";

// Zustand store bridging the pure GameEngine to React. It owns the engine
// instance, bumps a `tick` after every mutation so panels re-render, and
// debounces autosave to the active backend (cloud or local).

import { create } from "zustand";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GameEngine, type RunResult } from "@/engine/game";
import type { GameSettings, SaveGame } from "@/engine/types";
import { newSaveGame } from "@/engine/world/seed";
import { saveCloud, saveLocal, type SaveSlotMeta } from "@/lib/persistence";

export type Backend = "cloud" | "local";

export interface GameNote {
  id: string;
  kind: "mission" | "alert" | "info";
  text: string;
}

interface BootOptions {
  save: SaveGame;
  userKey: string;
  backend: Backend;
  username: string;
  email?: string;
  slot?: number;
  supabase?: SupabaseClient | null;
  revision?: number;
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
  supabase: SupabaseClient | null;
  revision?: number;
  saving: boolean;
  lastSavedAt?: number;
  notes: GameNote[];

  boot: (opts: BootOptions) => void;
  run: (line: string) => RunResult | null;
  mutate: (fn: (engine: GameEngine) => void) => void;
  complete: (line: string) => string[];
  applySettings: (partial: Partial<GameSettings>) => void;
  scheduleSave: () => void;
  saveNow: () => Promise<void>;
  pushNote: (kind: GameNote["kind"], text: string) => void;
  dismissNote: (id: string) => void;
  resetToNewGame: () => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const useGame = create<GameState>((set, get) => ({
  engine: null,
  tick: 0,
  ready: false,
  backend: "local",
  userKey: "local",
  username: "operator",
  slot: 0,
  supabase: null,
  saving: false,
  notes: [],

  boot: (opts) => {
    const engine = new GameEngine(opts.save);
    // keep settings/username in sync
    engine.player.username = opts.username || engine.player.username;
    set({
      engine,
      ready: true,
      backend: opts.backend,
      userKey: opts.userKey,
      username: opts.username,
      email: opts.email,
      slot: opts.slot ?? 0,
      supabase: opts.supabase ?? null,
      revision: opts.revision,
      tick: get().tick + 1,
    });
  },

  run: (line) => {
    const engine = get().engine;
    if (!engine) return null;
    const result = engine.run(line);
    // surface notifications
    for (const id of result.completedMissions) {
      get().pushNote("mission", `Ukończono zlecenie: ${id.toUpperCase()}`);
    }
    for (const id of result.newlyAvailable) {
      get().pushNote("info", `Nowe zlecenie dostępne: ${id.toUpperCase()}`);
    }
    if (result.alerted) {
      get().pushNote("alert", "⚠ Wykryto podejrzaną aktywność! Poziom alarmu rośnie.");
    }
    set({ tick: get().tick + 1 });
    get().scheduleSave();
    return result;
  },

  mutate: (fn) => {
    const engine = get().engine;
    if (!engine) return;
    fn(engine);
    engine.player.updatedAt = Date.now();
    set({ tick: get().tick + 1 });
    get().scheduleSave();
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
    get().scheduleSave();
  },

  scheduleSave: () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void get().saveNow();
    }, 1500);
  },

  saveNow: async () => {
    const { engine, backend, userKey, slot, supabase, username, revision } = get();
    if (!engine) return;
    set({ saving: true });
    const save = engine.toSave();
    const name = `${username} — slot ${slot}`;
    try {
      if (backend === "cloud" && supabase) {
        const res = await saveCloud(supabase, slot, save, name, revision);
        if (res.ok) set({ revision: res.revision, lastSavedAt: Date.now() });
        else if (res.conflict) get().pushNote("alert", "Konflikt zapisu w chmurze — wczytaj ponownie.");
      } else {
        const meta: SaveSlotMeta = saveLocal(userKey, slot, save, name);
        set({ revision: meta.revision, lastSavedAt: meta.updatedAt });
      }
    } catch {
      /* best-effort autosave */
    } finally {
      set({ saving: false });
    }
  },

  pushNote: (kind, text) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    set({ notes: [...get().notes, { id, kind, text }] });
    setTimeout(() => get().dismissNote(id), 6000);
  },

  dismissNote: (id) => set({ notes: get().notes.filter((n) => n.id !== id) }),

  resetToNewGame: () => {
    const { username } = get();
    get().boot({
      save: newSaveGame(username),
      userKey: get().userKey,
      backend: get().backend,
      username,
      email: get().email,
      slot: get().slot,
      supabase: get().supabase,
    });
    void get().saveNow();
  },
}));
