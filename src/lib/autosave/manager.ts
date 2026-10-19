// SaveManager — the autosave engine. Framework-agnostic and fully injectable
// (clock, storage, cloud, backups) so its timing and failure behaviour is unit
// tested deterministically.
//
// Write path: every change bumps a generation counter. Normal changes are
// debounced (with a max-wait so continuous play still saves); important ones
// (mission completed, purchase, host hop) flush immediately. A flush writes
// the local journal synchronously — skipped when the content checksum is
// unchanged — then syncs to the cloud, throttled and serialized (one request
// in flight). Network failures retry with exponential backoff; going offline
// parks the queue until `online`. A revision conflict is resolved by progress
// (see progress.ts) and the losing version is always kept as a backup.

import type { SaveGame } from "@/engine/types";
import { sha256 } from "@/engine/util/hash";
import type { BackupStore } from "./backups";
import type { Journal } from "./journal";
import { pickDivergenceWinner } from "./progress";

export type PushResult =
  | { ok: true; revision: number }
  | { ok: false; kind: "conflict" | "network" | "auth" | "other"; message?: string };

export interface RemoteCopy {
  save: SaveGame;
  revision: number;
  checksum?: string;
}

export interface CloudAdapter {
  push(save: SaveGame, expectedRevision?: number): Promise<PushResult>;
  pull(): Promise<RemoteCopy | null>;
}

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
};

export interface AutosaveConfig {
  /** Quiet period after the last change before saving. */
  debounceMs: number;
  /** Upper bound on how long a stream of changes can postpone a save. */
  maxWaitMs: number;
  /** Safety-net tick: saves anything dirty, retries pending cloud work. */
  heartbeatMs: number;
  /** Minimum spacing between non-urgent cloud writes (rate limiting). */
  cloudMinIntervalMs: number;
  retryBaseMs: number;
  retryMaxMs: number;
  /** Automatic rolling backup cadence while the player is active. */
  backupIntervalMs: number;
}

export const DEFAULT_CONFIG: AutosaveConfig = {
  debounceMs: 1200,
  maxWaitMs: 8000,
  heartbeatMs: 30_000,
  cloudMinIntervalMs: 8000,
  retryBaseMs: 2000,
  retryMaxMs: 60_000,
  backupIntervalMs: 10 * 60_000,
};

export type SaveState =
  | "saved" // everything persisted (and synced, in cloud mode)
  | "dirty" // unsaved changes waiting for the debounce
  | "syncing" // cloud request in flight
  | "pending" // saved locally, cloud write queued
  | "offline" // saved locally, waiting for connectivity
  | "retrying" // cloud write failed, retry scheduled
  | "error" // needs attention (quota, expired session)
  | "suspended"; // another tab owns this save

export interface SaveStatus {
  state: SaveState;
  backend: "local" | "cloud";
  online: boolean;
  dirty: boolean;
  pendingCloud: boolean;
  lastLocalAt?: number;
  lastCloudAt?: number;
  retryAt?: number;
  error?: string;
  bytes?: number;
  writes: number;
  cloudRevision?: number;
  suspendedReason?: string;
}

export type Priority = "normal" | "high";

export interface SaveManagerOptions {
  userKey: string;
  name: string;
  getSave: () => SaveGame;
  journal: Journal;
  cloud?: CloudAdapter | null;
  backups?: BackupStore | null;
  initial?: { cloudRevision?: number; pendingCloud?: boolean; checksum?: string };
  clock?: Clock;
  config?: Partial<AutosaveConfig>;
  online?: boolean;
  onStatus?: (s: SaveStatus) => void;
  onAdoptRemote?: (save: SaveGame, revision: number) => void;
  onNotice?: (kind: "info" | "alert", text: string) => void;
  onBackup?: () => void;
}

export class SaveManager {
  private cfg: AutosaveConfig;
  private clock: Clock;
  private gen = 0;
  private savedGen = 0;
  private lastJson: string | null = null;
  private lastChecksum: string | undefined;
  private cloudRevision: number | undefined;
  private pendingCloud: boolean;
  private inFlight: Promise<void> | null = null;
  private cloudAgain = false;
  private retries = 0;
  private retryAt: number | undefined;
  private lastCloudAttempt = -Infinity;
  private lastLocalAt: number | undefined;
  private lastCloudAt: number | undefined;
  private lastBackupAt: number;
  private writesSinceBackup = 0;
  private writes = 0;
  private bytes: number | undefined;
  private error: string | undefined;
  private authErrorShown = false;
  private online: boolean;
  private suspendedReason: string | undefined;
  private disposed = false;

  private debounceTimer: unknown = null;
  private maxWaitTimer: unknown = null;
  private cloudTimer: unknown = null;
  private retryTimer: unknown = null;
  private heartbeat: unknown;

  constructor(private o: SaveManagerOptions) {
    this.cfg = { ...DEFAULT_CONFIG, ...o.config };
    this.clock = o.clock ?? realClock;
    this.online = o.online ?? true;
    this.cloudRevision = o.initial?.cloudRevision;
    this.pendingCloud = Boolean(o.cloud) && Boolean(o.initial?.pendingCloud);
    this.lastChecksum = o.initial?.checksum;
    this.lastBackupAt = this.clock.now();
    this.heartbeat = this.clock.setInterval(() => this.tick(), this.cfg.heartbeatMs);
    this.emit();
  }

  // ── public API ────────────────────────────────────────────────────────────

  /** Record that game state changed. High priority saves immediately. */
  markDirty(priority: Priority = "normal", reason?: string): void {
    if (this.disposed || this.suspendedReason) return;
    this.gen++;
    if (priority === "high") {
      void this.flush({ force: true, reason });
      return;
    }
    if (this.debounceTimer) this.clock.clearTimeout(this.debounceTimer);
    this.debounceTimer = this.clock.setTimeout(() => void this.flush({ reason: "debounce" }), this.cfg.debounceMs);
    if (!this.maxWaitTimer) {
      this.maxWaitTimer = this.clock.setTimeout(() => void this.flush({ reason: "maxWait" }), this.cfg.maxWaitMs);
    }
    this.emit();
  }

  /** Save now: local journal, then cloud (force bypasses the cloud throttle). */
  async flush(opts: { force?: boolean; reason?: string } = {}): Promise<void> {
    if (this.disposed || this.suspendedReason) return;
    this.clearSaveTimers();
    this.writeLocal();
    await this.syncCloud(Boolean(opts.force));
    this.maybePeriodicBackup();
  }

  /**
   * Synchronous local save for page lifecycle events (pagehide/freeze), where
   * async work may never complete. Cloud sync resumes on the next session.
   */
  flushSync(): boolean {
    if (this.disposed) return false;
    this.clearSaveTimers();
    const ok = this.writeLocal();
    if (this.pendingCloud && this.online && !this.inFlight) void this.syncCloud(true);
    return ok;
  }

  /** Take a named backup of the current state. */
  async backup(reason: string): Promise<void> {
    if (!this.o.backups) return;
    try {
      await this.o.backups.add(this.o.userKey, this.o.getSave(), reason);
      this.lastBackupAt = this.clock.now();
      this.writesSinceBackup = 0;
      this.o.onBackup?.();
    } catch {
      /* backups are best-effort */
    }
  }

  setOnline(online: boolean): void {
    this.online = online;
    if (online) {
      this.clearRetry();
      this.retries = 0;
      void this.syncCloud(true);
    }
    this.emit();
  }

  /** Another tab took over: persist what we have, then stop writing. */
  suspend(reason: string): void {
    if (this.suspendedReason) return;
    this.flushSync();
    this.suspendedReason = reason;
    this.clearSaveTimers();
    this.clearRetry();
    this.emit();
  }

  hasUnsavedWork(): boolean {
    return this.gen !== this.savedGen || this.pendingCloud;
  }

  dispose(): void {
    this.disposed = true;
    this.clearSaveTimers();
    this.clearRetry();
    if (this.cloudTimer) this.clock.clearTimeout(this.cloudTimer);
    this.clock.clearInterval(this.heartbeat);
  }

  status(): SaveStatus {
    const dirty = this.gen !== this.savedGen;
    let state: SaveState;
    if (this.suspendedReason) state = "suspended";
    else if (this.error) state = "error";
    else if (this.inFlight) state = "syncing";
    else if (dirty) state = "dirty";
    else if (this.pendingCloud && !this.online) state = "offline";
    else if (this.pendingCloud && this.retryAt) state = "retrying";
    else if (this.pendingCloud) state = "pending";
    else state = "saved";
    return {
      state,
      backend: this.o.cloud ? "cloud" : "local",
      online: this.online,
      dirty,
      pendingCloud: this.pendingCloud,
      lastLocalAt: this.lastLocalAt,
      lastCloudAt: this.lastCloudAt,
      retryAt: this.retryAt,
      error: this.error,
      bytes: this.bytes,
      writes: this.writes,
      cloudRevision: this.cloudRevision,
      suspendedReason: this.suspendedReason,
    };
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private emit(): void {
    if (!this.disposed) this.o.onStatus?.(this.status());
  }

  private clearSaveTimers(): void {
    if (this.debounceTimer) this.clock.clearTimeout(this.debounceTimer);
    if (this.maxWaitTimer) this.clock.clearTimeout(this.maxWaitTimer);
    this.debounceTimer = null;
    this.maxWaitTimer = null;
  }

  private clearRetry(): void {
    if (this.retryTimer) this.clock.clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.retryAt = undefined;
  }

  private tick(): void {
    if (this.disposed || this.suspendedReason) return;
    if (this.gen !== this.savedGen) void this.flush({ reason: "heartbeat" });
    else if (this.pendingCloud && !this.retryTimer) void this.syncCloud(false);
    this.maybePeriodicBackup();
  }

  /** Write the journal if content changed. Returns false on storage failure. */
  private writeLocal(): boolean {
    const target = this.gen;
    const data = JSON.stringify(this.o.getSave());
    const checksum = sha256(data);
    this.lastJson = data;
    this.bytes = data.length;
    if (checksum === this.lastChecksum) {
      this.savedGen = target;
      this.emit();
      return true;
    }
    if (this.o.cloud) this.pendingCloud = true;
    this.lastChecksum = checksum;
    try {
      this.o.journal.write({
        v: 2,
        data,
        checksum,
        savedAt: this.clock.now(),
        name: this.o.name,
        cloudRevision: this.cloudRevision,
        pendingCloud: this.pendingCloud,
      });
    } catch {
      this.error = "Brak miejsca na zapis lokalny";
      this.emit();
      return false;
    }
    if (this.error === "Brak miejsca na zapis lokalny") this.error = undefined;
    this.savedGen = target;
    this.lastLocalAt = this.clock.now();
    this.writes++;
    this.writesSinceBackup++;
    this.emit();
    return true;
  }

  private async syncCloud(force: boolean): Promise<void> {
    if (!this.o.cloud || this.disposed || this.suspendedReason || !this.pendingCloud) return;
    if (this.inFlight) {
      this.cloudAgain = true;
      return this.inFlight;
    }
    if (!this.online) {
      this.emit();
      return;
    }
    if (this.retryTimer && !force) return;
    const wait = this.lastCloudAttempt + this.cfg.cloudMinIntervalMs - this.clock.now();
    if (!force && wait > 0) {
      if (!this.cloudTimer) {
        this.cloudTimer = this.clock.setTimeout(() => {
          this.cloudTimer = null;
          void this.syncCloud(false);
        }, wait);
      }
      return;
    }
    this.clearRetry();
    this.inFlight = this.pushOnce();
    this.emit();
    try {
      await this.inFlight;
    } finally {
      this.inFlight = null;
      this.emit();
    }
    if (this.cloudAgain && this.pendingCloud) {
      this.cloudAgain = false;
      await this.syncCloud(false);
    }
  }

  private async pushOnce(): Promise<void> {
    const cloud = this.o.cloud!;
    const data = this.lastJson;
    const checksum = this.lastChecksum;
    if (!data) return;
    this.lastCloudAttempt = this.clock.now();
    const save = JSON.parse(data) as SaveGame;

    let res: PushResult;
    let adopted = false;
    try {
      res = await cloud.push(save, this.cloudRevision);
      if (!res.ok && res.kind === "conflict") ({ res, adopted } = await this.resolveConflict(save, checksum));
    } catch (e) {
      res = { ok: false, kind: "network", message: (e as Error).message };
    }

    if (res.ok) {
      this.cloudRevision = res.revision;
      this.retries = 0;
      this.lastCloudAt = this.clock.now();
      this.error = undefined;
      if (adopted || this.lastChecksum === checksum) this.pendingCloud = false;
      this.safePatch({ cloudRevision: this.cloudRevision, pendingCloud: this.pendingCloud });
      return;
    }
    if (res.kind === "auth") {
      this.error = "Sesja wygasła — zaloguj się ponownie, aby synchronizować";
      if (!this.authErrorShown) this.o.onNotice?.("alert", this.error);
      this.authErrorShown = true;
      return;
    }
    // network / other / unresolved conflict → exponential backoff
    this.retries++;
    const delay = Math.min(this.cfg.retryMaxMs, this.cfg.retryBaseMs * 2 ** (this.retries - 1));
    this.retryAt = this.clock.now() + delay;
    this.retryTimer = this.clock.setTimeout(() => {
      this.retryTimer = null;
      this.retryAt = undefined;
      void this.syncCloud(true);
    }, delay);
  }

  /** The cloud moved since our base revision while we had local changes. */
  private async resolveConflict(
    local: SaveGame,
    checksum: string | undefined,
  ): Promise<{ res: PushResult; adopted: boolean }> {
    const cloud = this.o.cloud!;
    const remote = await cloud.pull();
    if (!remote) return { res: await cloud.push(local, undefined), adopted: false };
    if (remote.checksum && remote.checksum === checksum) {
      return { res: { ok: true, revision: remote.revision }, adopted: false };
    }

    if (pickDivergenceWinner(local, remote.save) === "local") {
      await this.backupSave(remote.save, "konflikt: wersja z chmury");
      const res = await cloud.push(local, remote.revision);
      if (res.ok) {
        this.o.onNotice?.("info", "Konflikt zapisu rozwiązany — zachowano bardziej zaawansowaną wersję z tego urządzenia.");
      }
      return { res, adopted: false };
    }

    await this.backupSave(local, "konflikt: wersja z tego urządzenia");
    this.o.onAdoptRemote?.(remote.save, remote.revision);
    const data = JSON.stringify(remote.save);
    this.lastJson = data;
    this.lastChecksum = sha256(data);
    this.savedGen = this.gen;
    this.cloudRevision = remote.revision;
    this.pendingCloud = false;
    try {
      this.o.journal.write({
        v: 2,
        data,
        checksum: this.lastChecksum,
        savedAt: this.clock.now(),
        name: this.o.name,
        cloudRevision: remote.revision,
        pendingCloud: false,
      });
    } catch {
      /* local cache refresh is best-effort */
    }
    this.o.onNotice?.(
      "alert",
      "Na innym urządzeniu jest bardziej zaawansowany zapis — wczytano go. Twoja wersja jest w kopiach zapasowych.",
    );
    return { res: { ok: true, revision: remote.revision }, adopted: true };
  }

  private async backupSave(save: SaveGame, reason: string): Promise<void> {
    try {
      await this.o.backups?.add(this.o.userKey, save, reason);
      this.o.onBackup?.();
    } catch {
      /* best-effort */
    }
  }

  private maybePeriodicBackup(): void {
    if (!this.o.backups || this.writesSinceBackup === 0) return;
    if (this.clock.now() - this.lastBackupAt < this.cfg.backupIntervalMs) return;
    void this.backup("automatyczna");
  }

  private safePatch(fields: { cloudRevision?: number; pendingCloud?: boolean }): void {
    try {
      this.o.journal.patch(fields);
    } catch {
      /* metadata refresh is best-effort */
    }
  }
}
