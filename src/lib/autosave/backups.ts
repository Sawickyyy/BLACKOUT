// Rolling backups of the save, kept in IndexedDB (far larger quota than
// localStorage) and gzip-compressed when the browser supports
// CompressionStream (~8x smaller). Each player keeps the newest N snapshots;
// they are taken automatically (mission completed, periodic, before risky
// operations such as conflict resolution, restore, import or a new game).

import type { SaveGame } from "@/engine/types";
import { sha256 } from "@/engine/util/hash";
import { summarize, validateSave, type ProgressSummary } from "./progress";

export interface BackupMeta {
  id: string;
  userKey: string;
  createdAt: number;
  reason: string;
  bytes: number;
  checksum: string;
  summary: ProgressSummary;
}

export interface BackupStore {
  add(userKey: string, save: SaveGame, reason: string): Promise<BackupMeta | null>;
  list(userKey: string): Promise<BackupMeta[]>;
  load(id: string): Promise<SaveGame | null>;
  clear(userKey: string): Promise<void>;
}

export const MAX_BACKUPS = 10;

interface StoredBackup extends BackupMeta {
  compressed: boolean;
  payload: ArrayBuffer | string;
}

// ── compression ─────────────────────────────────────────────────────────────
export async function compress(text: string): Promise<{ compressed: boolean; payload: ArrayBuffer | string }> {
  if (typeof CompressionStream === "undefined") return { compressed: false, payload: text };
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return { compressed: true, payload: await new Response(stream).arrayBuffer() };
}

export async function decompress(payload: ArrayBuffer | string, compressed: boolean): Promise<string> {
  if (!compressed) return payload as string;
  const stream = new Blob([payload as ArrayBuffer]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

async function toStored(userKey: string, save: SaveGame, reason: string): Promise<StoredBackup> {
  const data = JSON.stringify(save);
  const { compressed, payload } = await compress(data);
  return {
    id: `bk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userKey,
    createdAt: Date.now(),
    reason,
    bytes: typeof payload === "string" ? payload.length : payload.byteLength,
    checksum: sha256(data),
    summary: summarize(save),
    compressed,
    payload,
  };
}

async function fromStored(b: StoredBackup): Promise<SaveGame | null> {
  try {
    const text = await decompress(b.payload, b.compressed);
    if (sha256(text) !== b.checksum) return null;
    const save = JSON.parse(text);
    return validateSave(save) ? save : null;
  } catch {
    return null;
  }
}

function meta(b: StoredBackup): BackupMeta {
  const { compressed: _c, payload: _p, ...rest } = b;
  void _c;
  void _p;
  return rest;
}

// ── in-memory (tests / no IndexedDB) ───────────────────────────────────────
export class MemoryBackupStore implements BackupStore {
  private items: StoredBackup[] = [];
  async add(userKey: string, save: SaveGame, reason: string) {
    const b = await toStored(userKey, save, reason);
    this.items.push(b);
    const mine = this.items.filter((x) => x.userKey === userKey).sort((a, c) => c.createdAt - a.createdAt);
    const drop = new Set(mine.slice(MAX_BACKUPS).map((x) => x.id));
    this.items = this.items.filter((x) => !drop.has(x.id));
    return meta(b);
  }
  async list(userKey: string) {
    return this.items
      .filter((x) => x.userKey === userKey)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(meta);
  }
  async load(id: string) {
    const b = this.items.find((x) => x.id === id);
    return b ? fromStored(b) : null;
  }
  async clear(userKey: string) {
    this.items = this.items.filter((x) => x.userKey !== userKey);
  }
}

// ── IndexedDB ───────────────────────────────────────────────────────────────
const DB_NAME = "blacknet";
const STORE = "backups";

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export class IndexedDbBackupStore implements BackupStore {
  private dbp: Promise<IDBDatabase> | null = null;

  private db(): Promise<IDBDatabase> {
    if (!this.dbp) {
      this.dbp = new Promise((resolve, reject) => {
        const open = indexedDB.open(DB_NAME, 1);
        open.onupgradeneeded = () => {
          const s = open.result.createObjectStore(STORE, { keyPath: "id" });
          s.createIndex("byUser", "userKey");
        };
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
    }
    return this.dbp;
  }

  private async all(userKey: string): Promise<StoredBackup[]> {
    const db = await this.db();
    const tx = db.transaction(STORE, "readonly");
    const rows = await req(tx.objectStore(STORE).index("byUser").getAll(userKey) as IDBRequest<StoredBackup[]>);
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  }

  async add(userKey: string, save: SaveGame, reason: string) {
    const b = await toStored(userKey, save, reason);
    const db = await this.db();
    const existing = await this.all(userKey);
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.put(b);
    for (const old of existing.slice(MAX_BACKUPS - 1)) store.delete(old.id);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return meta(b);
  }

  async list(userKey: string) {
    return (await this.all(userKey)).map(meta);
  }

  async load(id: string) {
    const db = await this.db();
    const b = await req(db.transaction(STORE, "readonly").objectStore(STORE).get(id) as IDBRequest<StoredBackup>);
    return b ? fromStored(b) : null;
  }

  async clear(userKey: string) {
    const rows = await this.all(userKey);
    const db = await this.db();
    const tx = db.transaction(STORE, "readwrite");
    for (const r of rows) tx.objectStore(STORE).delete(r.id);
    await new Promise<void>((resolve) => (tx.oncomplete = () => resolve()));
  }
}

export function browserBackupStore(): BackupStore {
  try {
    if (typeof indexedDB !== "undefined") return new IndexedDbBackupStore();
  } catch {
    /* fall through */
  }
  return new MemoryBackupStore();
}
