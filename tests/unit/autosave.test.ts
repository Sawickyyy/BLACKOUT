import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameEngine } from "@/engine/game";
import type { SaveGame } from "@/engine/types";
import { sha256 } from "@/engine/util/hash";
import { newSaveGame } from "@/engine/world/seed";
import { MemoryBackupStore, compress, decompress, MAX_BACKUPS } from "@/lib/autosave/backups";
import { supabaseCloud } from "@/lib/autosave/cloud";
import { Journal, MemoryStorage, journalKey, makeEntry } from "@/lib/autosave/journal";
import { SaveManager, type CloudAdapter, type PushResult, type SaveStatus } from "@/lib/autosave/manager";
import { pickDivergenceWinner, progressScore, reconcile, validateSave } from "@/lib/autosave/progress";
import { prepareSession } from "@/lib/autosave/session";
import type { TabGuard } from "@/lib/autosave/tabs";

// ── helpers ─────────────────────────────────────────────────────────────────

/** Recursively sort object keys — what PostgreSQL jsonb does to stored data. */
function jsonbRoundTrip<T>(v: T): T {
  const sort = (x: unknown): unknown =>
    Array.isArray(x)
      ? x.map(sort)
      : x && typeof x === "object"
        ? Object.fromEntries(
            Object.keys(x as object)
              .sort((a, b) => a.length - b.length || a.localeCompare(b))
              .map((k) => [k, sort((x as Record<string, unknown>)[k])]),
          )
        : x;
  return sort(JSON.parse(JSON.stringify(v))) as T;
}

/** In-memory stand-in for the Supabase `saves` row + `save_game` RPC. */
class FakeCloud implements CloudAdapter {
  row: { save: SaveGame; revision: number; checksum: string } | null = null;
  pushes = 0;
  failNext: ("network" | "auth")[] = [];
  async push(save: SaveGame, expected?: number): Promise<PushResult> {
    this.pushes++;
    const fail = this.failNext.shift();
    if (fail) return { ok: false, kind: fail };
    if (this.row && expected !== undefined && expected !== this.row.revision) return { ok: false, kind: "conflict" };
    if (this.row && expected === undefined) return { ok: false, kind: "conflict" };
    const revision = (this.row?.revision ?? 0) + 1;
    this.row = { save: jsonbRoundTrip(save), revision, checksum: sha256(JSON.stringify(save)) };
    return { ok: true, revision };
  }
  async pull() {
    return this.row ? { save: jsonbRoundTrip(this.row.save), revision: this.row.revision, checksum: this.row.checksum } : null;
  }
}

function play(save: SaveGame, ...lines: string[]): SaveGame {
  const g = new GameEngine(save);
  for (const l of lines) g.run(l);
  return g.toSave();
}

const M01 = ["cat README.txt", "whoami", "help", "touch pierwszy.txt"];

function harness(opts: { cloud?: FakeCloud | null; initial?: ConstructorParameters<typeof SaveManager>[0]["initial"] } = {}) {
  const storage = new MemoryStorage();
  const journal = new Journal(storage, journalKey("u1", 0));
  const engine = { current: new GameEngine(newSaveGame("tester")) };
  const statuses: SaveStatus[] = [];
  const notices: string[] = [];
  const backups = new MemoryBackupStore();
  const m = new SaveManager({
    userKey: "u1",
    name: "tester — slot 0",
    getSave: () => engine.current.toSave(),
    journal,
    cloud: opts.cloud ?? null,
    backups,
    initial: opts.initial,
    onStatus: (s) => statuses.push(s),
    onNotice: (_k, t) => notices.push(t),
    onAdoptRemote: (save) => (engine.current = new GameEngine(save)),
  });
  return { m, journal, storage, engine, statuses, notices, backups };
}

// ── progress / reconciliation ──────────────────────────────────────────────

describe("progress + validation", () => {
  it("scores completed missions above everything else", () => {
    const fresh = newSaveGame("a");
    const done = play(newSaveGame("a"), ...M01);
    expect(progressScore(done)).toBeGreaterThan(progressScore(fresh));
    expect(pickDivergenceWinner(fresh, done)).toBe("remote");
    expect(pickDivergenceWinner(done, fresh)).toBe("local");
  });

  it("validates structure and rejects garbage", () => {
    expect(validateSave(newSaveGame("a"))).toBe(true);
    expect(validateSave(null)).toBe(false);
    expect(validateSave({ version: 1 })).toBe(false);
    const broken = newSaveGame("a");
    broken.player.session.hostId = "nope";
    expect(validateSave(broken)).toBe(false);
  });
});

describe("reconcile (boot)", () => {
  const a = newSaveGame("a");
  const b = play(newSaveGame("a"), ...M01);
  const side = (save: SaveGame, extra: { cloudRevision?: number; pendingCloud: boolean }) => ({
    save,
    checksum: sha256(JSON.stringify(save)),
    ...extra,
  });

  it("loads remote when the device has never synced", () => {
    expect(reconcile(null, { save: a, revision: 3 })).toEqual({ use: "remote", conflict: false });
  });
  it("fast-forwards local pending work when the cloud has not moved", () => {
    const r = reconcile(side(b, { cloudRevision: 3, pendingCloud: true }), { save: a, revision: 3 });
    expect(r).toMatchObject({ use: "local", push: true, conflict: false });
  });
  it("takes the cloud when it moved and the device has nothing pending", () => {
    const r = reconcile(side(a, { cloudRevision: 2, pendingCloud: false }), { save: b, revision: 5 });
    expect(r).toEqual({ use: "remote", conflict: false });
  });
  it("on true divergence keeps the more advanced save and returns the loser", () => {
    const r = reconcile(side(b, { cloudRevision: 2, pendingCloud: true }), { save: a, revision: 5 });
    expect(r).toMatchObject({ use: "local", conflict: true, push: true, baseRevision: 5 });
    if (r.use !== "new" && r.conflict) expect(r.loser).toBe(a);
  });
});

// ── journal ────────────────────────────────────────────────────────────────

describe("journal", () => {
  it("falls back to the previous copy when the main one is corrupted", () => {
    const storage = new MemoryStorage();
    const j = new Journal(storage, "k");
    const first = newSaveGame("a");
    j.write(makeEntry(first, { name: "n", pendingCloud: false, now: 1 }));
    j.write(makeEntry(play(newSaveGame("a"), "whoami"), { name: "n", pendingCloud: false, now: 2 }));
    storage.setItem("k", storage.getItem("k")!.replace("credits", "kredyty")); // bit rot
    const read = j.read()!;
    expect(read.source).toBe("prev");
    expect(read.save.player.username).toBe("a");
  });

  it("reads legacy v1 envelopes written by the old persistence layer", () => {
    const storage = new MemoryStorage();
    const save = newSaveGame("legacy");
    storage.setItem(
      "k",
      JSON.stringify({ save, name: "x", updatedAt: 5, revision: 2, checksum: sha256(JSON.stringify(save)) }),
    );
    expect(new Journal(storage, "k").read()?.save.player.username).toBe("legacy");
  });

  it("keeps the old copy if storage rejects a write (quota)", () => {
    const storage = new MemoryStorage();
    const j = new Journal(storage, "k");
    j.write(makeEntry(newSaveGame("a"), { name: "n", pendingCloud: false, now: 1 }));
    const full = { ...storage, getItem: storage.getItem.bind(storage), removeItem: storage.removeItem.bind(storage), setItem: () => { throw new Error("QuotaExceeded"); } };
    expect(() => new Journal(full, "k").write(makeEntry(newSaveGame("b"), { name: "n", pendingCloud: false, now: 2 }))).toThrow();
    expect(j.read()?.save.player.username).toBe("a");
  });
});

// ── backups ────────────────────────────────────────────────────────────────

describe("backups", () => {
  it("gzip round-trips and shrinks a save", async () => {
    const text = JSON.stringify(newSaveGame("a"));
    const { compressed, payload } = await compress(text);
    expect(compressed).toBe(true);
    expect((payload as ArrayBuffer).byteLength).toBeLessThan(text.length / 4);
    expect(await decompress(payload, compressed)).toBe(text);
  });

  it("keeps only the newest N per player and restores intact saves", async () => {
    const store = new MemoryBackupStore();
    for (let i = 0; i < MAX_BACKUPS + 3; i++) await store.add("u", newSaveGame("p" + i), `b${i}`);
    await store.add("other", newSaveGame("x"), "x");
    const list = await store.list("u");
    expect(list).toHaveLength(MAX_BACKUPS);
    const restored = await store.load(list[0]!.id);
    expect(restored && validateSave(restored)).toBe(true);
    expect(await store.list("other")).toHaveLength(1);
  });
});

// ── SaveManager ────────────────────────────────────────────────────────────

describe("SaveManager timing", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("debounces bursts and saves once", async () => {
    const h = harness();
    await vi.advanceTimersByTimeAsync(0);
    const before = h.m.status().writes;
    for (let i = 0; i < 5; i++) {
      h.engine.current.run(`echo ${i}`);
      h.m.markDirty();
      await vi.advanceTimersByTimeAsync(300);
    }
    expect(h.m.status().state).toBe("dirty");
    await vi.advanceTimersByTimeAsync(1200);
    expect(h.m.status().writes).toBe(before + 1);
    expect(h.m.status().state).toBe("saved");
    expect(h.journal.read()?.save.player.terminalHistory).toContain("echo 4");
  });

  it("max-wait forces a save during continuous play", async () => {
    const h = harness();
    for (let t = 0; t < 9000; t += 500) {
      h.engine.current.run("whoami");
      h.m.markDirty();
      await vi.advanceTimersByTimeAsync(500);
    }
    expect(h.m.status().writes).toBeGreaterThanOrEqual(1);
  });

  it("high priority saves immediately", async () => {
    const h = harness();
    h.engine.current.run("touch x");
    h.m.markDirty("high");
    await vi.advanceTimersByTimeAsync(0);
    expect(h.journal.read()?.save.player.terminalHistory).toContain("touch x");
  });

  it("skips writing when nothing actually changed", async () => {
    const h = harness();
    await h.m.flush({ force: true });
    const w = h.m.status().writes;
    h.m.markDirty("high");
    await vi.advanceTimersByTimeAsync(0);
    expect(h.m.status().writes).toBe(w);
    expect(h.m.status().state).toBe("saved");
  });

  it("flushSync persists synchronously (pagehide path)", () => {
    const h = harness();
    h.engine.current.run("echo pagehide");
    h.m.markDirty();
    expect(h.m.flushSync()).toBe(true);
    expect(h.journal.read()?.save.player.terminalHistory).toContain("echo pagehide");
  });

  it("suspended managers stop writing", async () => {
    const h = harness();
    h.m.suspend("inna karta");
    h.engine.current.run("echo late");
    h.m.markDirty("high");
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.m.status().state).toBe("suspended");
    expect(h.journal.read()?.save.player.terminalHistory ?? []).not.toContain("echo late");
  });
});

describe("SaveManager cloud sync", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("syncs to the cloud and clears the pending flag", async () => {
    const cloud = new FakeCloud();
    const h = harness({ cloud });
    await h.m.flush({ force: true });
    expect(cloud.row?.revision).toBe(1);
    expect(h.m.status()).toMatchObject({ state: "saved", pendingCloud: false, cloudRevision: 1 });
    expect(h.journal.read()?.entry.pendingCloud).toBe(false);
  });

  it("retries network failures with exponential backoff", async () => {
    const cloud = new FakeCloud();
    cloud.failNext = ["network", "network"];
    const h = harness({ cloud });
    await h.m.flush({ force: true });
    expect(h.m.status().state).toBe("retrying");
    await vi.advanceTimersByTimeAsync(2000); // 1st retry (2s) fails
    expect(cloud.pushes).toBe(2);
    await vi.advanceTimersByTimeAsync(3999); // 2nd backoff is 4s
    expect(cloud.pushes).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(cloud.pushes).toBe(3);
    expect(h.m.status().state).toBe("saved");
  });

  it("parks while offline and flushes when the network returns", async () => {
    const cloud = new FakeCloud();
    const h = harness({ cloud });
    h.m.setOnline(false);
    h.engine.current.run("echo offline");
    await h.m.flush({ force: true });
    expect(cloud.pushes).toBe(0);
    expect(h.m.status().state).toBe("offline");
    expect(h.journal.read()?.entry.pendingCloud).toBe(true);
    h.m.setOnline(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(cloud.row?.save.player.terminalHistory).toContain("echo offline");
  });

  it("rate-limits routine cloud writes", async () => {
    const cloud = new FakeCloud();
    const h = harness({ cloud });
    await h.m.flush({ force: true });
    h.engine.current.run("echo a");
    await h.m.flush();
    expect(cloud.pushes).toBe(1); // throttled
    await vi.advanceTimersByTimeAsync(8000);
    expect(cloud.pushes).toBe(2);
  });

  it("stops and reports when the session expired", async () => {
    const cloud = new FakeCloud();
    cloud.failNext = ["auth"];
    const h = harness({ cloud });
    await h.m.flush({ force: true });
    expect(h.m.status().state).toBe("error");
    expect(h.notices.join()).toMatch(/Sesja wygasła/);
  });

  it("conflict: keeps the device's save when it is more advanced, backs up the cloud copy", async () => {
    const cloud = new FakeCloud();
    await cloud.push(newSaveGame("tester")); // another device wrote rev 1
    const h = harness({ cloud, initial: { cloudRevision: 0, pendingCloud: true } });
    for (const l of M01) h.engine.current.run(l);
    await h.m.flush({ force: true });
    expect(cloud.row?.save.player.missions.m01?.status).toBe("completed");
    expect((await h.backups.list("u1"))[0]?.reason).toMatch(/konflikt: wersja z chmury/);
  });

  it("conflict: adopts the cloud save when it is more advanced, backs up the local one", async () => {
    const cloud = new FakeCloud();
    await cloud.push(play(newSaveGame("tester"), ...M01)); // other device progressed
    const h = harness({ cloud, initial: { cloudRevision: 0, pendingCloud: true } });
    h.engine.current.run("echo stale");
    await h.m.flush({ force: true });
    expect(h.engine.current.player.missions.m01?.status).toBe("completed");
    expect(h.m.status()).toMatchObject({ pendingCloud: false, cloudRevision: 1 });
    expect((await h.backups.list("u1"))[0]?.reason).toMatch(/wersja z tego urządzenia/);
    expect(h.notices.join()).toMatch(/innym urządzeniu/);
  });
});

// ── cloud adapter + boot ───────────────────────────────────────────────────

describe("supabase adapter", () => {
  it("accepts a save whose keys were reordered by jsonb (regression)", async () => {
    const save = play(newSaveGame("cloud"), ...M01);
    const stored = { data: jsonbRoundTrip(save), revision: 7, checksum: sha256(JSON.stringify(save)) };
    const fake = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: stored, error: null }) }) }) }),
    } as unknown as Parameters<typeof supabaseCloud>[0];
    const remote = await supabaseCloud(fake, 0, "n").pull();
    expect(remote?.revision).toBe(7);
    expect(remote?.save.player.missions.m01?.status).toBe("completed");
  });

  it("classifies errors", async () => {
    const mk = (error: object) =>
      ({ rpc: async () => ({ data: null, error }) }) as unknown as Parameters<typeof supabaseCloud>[0];
    const s = newSaveGame("x");
    expect(await supabaseCloud(mk({ code: "40001", message: "save_conflict" }), 0, "n").push(s)).toMatchObject({ kind: "conflict" });
    expect(await supabaseCloud(mk({ code: "PGRST301", message: "JWT expired" }), 0, "n").push(s)).toMatchObject({ kind: "auth" });
    expect(await supabaseCloud(mk({ message: "TypeError: Failed to fetch" }), 0, "n").push(s)).toMatchObject({ kind: "network" });
  });
});

describe("prepareSession", () => {
  const guard = { claim: async () => undefined, dispose: () => undefined } as unknown as TabGuard;
  const base = { userKey: "u", username: "tester", slot: 0, name: "n", backups: new MemoryBackupStore(), onSuperseded: () => undefined, guard };

  it("resumes cloud progress on a fresh device (jsonb-reordered row)", async () => {
    const cloud = new FakeCloud();
    await cloud.push(play(newSaveGame("tester"), ...M01));
    const p = await prepareSession({ ...base, storage: new MemoryStorage(), cloud });
    expect(p.save.player.missions.m01?.status).toBe("completed");
    expect(p).toMatchObject({ pendingCloud: false, cloudRevision: 1 });
  });

  it("keeps playing from the device when the cloud is unreachable", async () => {
    const storage = new MemoryStorage();
    new Journal(storage, journalKey("u", 0)).write(
      makeEntry(play(newSaveGame("tester"), ...M01), { name: "n", pendingCloud: true, cloudRevision: 1, now: 1 }),
    );
    const down: CloudAdapter = { push: async () => ({ ok: false, kind: "network" }), pull: async () => { throw new Error("offline"); } };
    const p = await prepareSession({ ...base, storage, cloud: down });
    expect(p.save.player.missions.m01?.status).toBe("completed");
    expect(p.pendingCloud).toBe(true);
    expect(p.notices[0]?.text).toMatch(/Brak połączenia/);
  });

  it("starts a new game when nothing exists anywhere", async () => {
    const p = await prepareSession({ ...base, storage: new MemoryStorage(), cloud: new FakeCloud() });
    expect(p.save.player.username).toBe("tester");
    expect(p.pendingCloud).toBe(true);
  });
});
