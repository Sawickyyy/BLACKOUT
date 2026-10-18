// Persistence layer. Saves the full SaveGame either to Supabase (RLS-isolated,
// via the save_game RPC with optimistic revision locking) or to localStorage
// as an offline fallback. A SHA-256 checksum guards against corrupted saves.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SaveGame } from "@/engine/types";
import { sha256 } from "@/engine/util/hash";

export interface SaveSlotMeta {
  slot: number;
  name: string;
  updatedAt: number;
  revision: number;
}

export interface LoadedSave {
  save: SaveGame;
  meta: SaveSlotMeta;
}

const LS_PREFIX = "blacknet:save";

function lsKey(userKey: string, slot: number): string {
  return `${LS_PREFIX}:${userKey}:${slot}`;
}

export function checksum(save: SaveGame): string {
  return sha256(JSON.stringify(save));
}

interface Envelope {
  save: SaveGame;
  name: string;
  updatedAt: number;
  revision: number;
  checksum: string;
}

function safeLocalStorage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

// ── Local (offline) backend ────────────────────────────────────────────────
export function saveLocal(userKey: string, slot: number, save: SaveGame, name: string): SaveSlotMeta {
  const ls = safeLocalStorage();
  const prev = loadLocal(userKey, slot);
  const env: Envelope = {
    save,
    name,
    updatedAt: Date.now(),
    revision: (prev?.meta.revision ?? 0) + 1,
    checksum: checksum(save),
  };
  if (ls) {
    try {
      ls.setItem(lsKey(userKey, slot), JSON.stringify(env));
    } catch {
      /* storage full / blocked — ignore, keep in-memory */
    }
  }
  return { slot, name, updatedAt: env.updatedAt, revision: env.revision };
}

export function loadLocal(userKey: string, slot: number): LoadedSave | null {
  const ls = safeLocalStorage();
  if (!ls) return null;
  const raw = ls.getItem(lsKey(userKey, slot));
  if (!raw) return null;
  try {
    const env = JSON.parse(raw) as Envelope;
    // Integrity check: refuse a save whose checksum does not match.
    if (env.checksum && env.checksum !== checksum(env.save)) {
      return null;
    }
    return {
      save: env.save,
      meta: { slot, name: env.name, updatedAt: env.updatedAt, revision: env.revision },
    };
  } catch {
    return null;
  }
}

export function listLocal(userKey: string): SaveSlotMeta[] {
  const ls = safeLocalStorage();
  if (!ls) return [];
  const out: SaveSlotMeta[] = [];
  for (let slot = 0; slot < 10; slot++) {
    const loaded = loadLocal(userKey, slot);
    if (loaded) out.push(loaded.meta);
  }
  return out;
}

export function deleteLocal(userKey: string, slot: number): void {
  const ls = safeLocalStorage();
  if (ls) ls.removeItem(lsKey(userKey, slot));
}

// ── Cloud (Supabase) backend ───────────────────────────────────────────────
export async function saveCloud(
  supabase: SupabaseClient,
  slot: number,
  save: SaveGame,
  name: string,
  expectedRevision?: number,
): Promise<{ ok: boolean; revision?: number; conflict?: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("save_game", {
    p_slot: slot,
    p_name: name,
    p_data: save,
    p_checksum: checksum(save),
    p_expected_revision: expectedRevision ?? null,
  });
  if (error) {
    if (error.code === "40001" || /save_conflict/.test(error.message)) {
      return { ok: false, conflict: true, error: "Konflikt zapisu" };
    }
    return { ok: false, error: error.message };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: true, revision: row?.revision };
}

export async function loadCloud(
  supabase: SupabaseClient,
  slot: number,
): Promise<LoadedSave | null> {
  const { data, error } = await supabase
    .from("saves")
    .select("slot,name,data,revision,updated_at,checksum")
    .eq("slot", slot)
    .maybeSingle();
  if (error || !data) return null;
  const save = data.data as SaveGame;
  if (data.checksum && data.checksum !== checksum(save)) return null;
  return {
    save,
    meta: {
      slot: data.slot,
      name: data.name,
      updatedAt: new Date(data.updated_at).getTime(),
      revision: data.revision,
    },
  };
}

export async function listCloud(supabase: SupabaseClient): Promise<SaveSlotMeta[]> {
  const { data, error } = await supabase
    .from("saves")
    .select("slot,name,revision,updated_at")
    .order("updated_at", { ascending: false });
  if (error || !data) return [];
  return data.map((d) => ({
    slot: d.slot,
    name: d.name,
    revision: d.revision,
    updatedAt: new Date(d.updated_at).getTime(),
  }));
}
