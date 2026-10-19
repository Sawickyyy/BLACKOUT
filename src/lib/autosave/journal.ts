// Local save journal. Synchronous (localStorage) on purpose: it is the only
// storage that reliably completes inside `pagehide` on iOS Safari. Every write
// first rotates the current good copy into a `prev` slot, and every read
// verifies the SHA-256 checksum, falling back to `prev` if the main copy is
// damaged — so a crash or a bad write can never leave the player with nothing.

import type { SaveGame } from "@/engine/types";
import { sha256 } from "@/engine/util/hash";

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface JournalEntry {
  v: 2;
  /** Serialized SaveGame exactly as checksummed. */
  data: string;
  checksum: string;
  savedAt: number;
  name: string;
  /** Cloud revision this copy is based on (undefined for local-only play). */
  cloudRevision?: number;
  /** Changes not yet confirmed by the cloud. */
  pendingCloud: boolean;
}

export interface JournalRead {
  entry: JournalEntry;
  save: SaveGame;
  /** "prev" means the main copy was corrupt and the backup slot was used. */
  source: "main" | "prev";
}

/** Same key the original persistence layer used, so existing saves load. */
export function journalKey(userKey: string, slot: number): string {
  return `blacknet:save:${userKey}:${slot}`;
}

function parseEntry(raw: string | null): JournalRead | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    let entry: JournalEntry;
    if (obj && obj.v === 2 && typeof obj.data === "string") {
      entry = obj as JournalEntry;
    } else if (obj && obj.save) {
      // Legacy v1 envelope: { save, name, updatedAt, revision, checksum }.
      entry = {
        v: 2,
        data: JSON.stringify(obj.save),
        checksum: obj.checksum ?? "",
        savedAt: obj.updatedAt ?? 0,
        name: obj.name ?? "",
        pendingCloud: false,
      };
    } else {
      return null;
    }
    if (entry.checksum && entry.checksum !== sha256(entry.data)) return null;
    return { entry, save: JSON.parse(entry.data) as SaveGame, source: "main" };
  } catch {
    return null;
  }
}

export class Journal {
  constructor(
    private storage: KeyValueStorage,
    readonly key: string,
  ) {}

  private get prevKey(): string {
    return this.key + ":prev";
  }

  read(): JournalRead | null {
    const main = parseEntry(this.storage.getItem(this.key));
    if (main) return main;
    const prev = parseEntry(this.storage.getItem(this.prevKey));
    return prev ? { ...prev, source: "prev" } : null;
  }

  /**
   * Persist an entry. Throws if storage rejects it (e.g. quota) — in that case
   * the previous main copy is untouched because setItem is atomic per key.
   */
  write(entry: JournalEntry): void {
    const current = this.storage.getItem(this.key);
    if (current && parseEntry(current)) {
      try {
        this.storage.setItem(this.prevKey, current);
      } catch {
        /* keeping prev is best-effort; never block the main write on it */
      }
    }
    this.storage.setItem(this.key, JSON.stringify(entry));
  }

  /** Update metadata (e.g. cloud confirmation) without rotating prev. */
  patch(fields: Partial<Pick<JournalEntry, "cloudRevision" | "pendingCloud">>): void {
    const cur = parseEntry(this.storage.getItem(this.key));
    if (!cur) return;
    this.storage.setItem(this.key, JSON.stringify({ ...cur.entry, ...fields }));
  }

  clear(): void {
    this.storage.removeItem(this.key);
    this.storage.removeItem(this.prevKey);
  }
}

/** Build an entry from a live save. */
export function makeEntry(
  save: SaveGame,
  meta: { name: string; cloudRevision?: number; pendingCloud: boolean; now: number },
): JournalEntry {
  const data = JSON.stringify(save);
  return {
    v: 2,
    data,
    checksum: sha256(data),
    savedAt: meta.now,
    name: meta.name,
    cloudRevision: meta.cloudRevision,
    pendingCloud: meta.pendingCloud,
  };
}

/** In-memory storage used when localStorage is blocked (private mode) and in tests. */
export class MemoryStorage implements KeyValueStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

export function browserStorage(): KeyValueStorage {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const probe = "__blacknet_probe__";
      window.localStorage.setItem(probe, "1");
      window.localStorage.removeItem(probe);
      return window.localStorage;
    }
  } catch {
    /* blocked (private mode / cookies disabled) */
  }
  return new MemoryStorage();
}
