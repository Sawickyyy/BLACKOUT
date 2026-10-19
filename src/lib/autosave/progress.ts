// Pure save-comparison logic: validation, a progress score, and the rules that
// decide which of two divergent saves wins. Cloud ordering uses revision
// numbers (like Git commits) rather than wall clocks, so clock skew between a
// phone and a laptop can never make an older save overwrite a newer one.

import type { SaveGame } from "@/engine/types";

export interface ProgressSummary {
  completedMissions: number;
  objectivesDone: number;
  discovered: number;
  wealth: number;
  updatedAt: number;
}

export function summarize(save: SaveGame): ProgressSummary {
  const missions = Object.values(save.player.missions ?? {});
  return {
    completedMissions: missions.filter((m) => m.status === "completed").length,
    objectivesDone: missions.reduce(
      (n, m) => n + Object.values(m.objectives ?? {}).filter(Boolean).length,
      0,
    ),
    discovered: save.player.discovered?.length ?? 0,
    wealth: (save.player.credits ?? 0) + (save.player.bankBalance ?? 0),
    updatedAt: save.player.updatedAt ?? 0,
  };
}

/** Single number ordering saves by how far the player has got. */
export function progressScore(save: SaveGame): number {
  const s = summarize(save);
  return s.completedMissions * 10_000 + s.objectivesDone * 100 + s.discovered * 10 + Math.floor(s.wealth / 100);
}

/**
 * Two saves diverged (both changed since their common base). Keep the one with
 * more progress; tie → most recently played; tie → the local one.
 */
export function pickDivergenceWinner(local: SaveGame, remote: SaveGame): "local" | "remote" {
  const a = progressScore(local);
  const b = progressScore(remote);
  if (a !== b) return a > b ? "local" : "remote";
  const ta = local.player.updatedAt ?? 0;
  const tb = remote.player.updatedAt ?? 0;
  return tb > ta ? "remote" : "local";
}

export interface LocalSide {
  save: SaveGame;
  checksum: string;
  /** Cloud revision this local copy was last synced with (its "base"). */
  cloudRevision?: number;
  /** Local changes not yet confirmed by the cloud. */
  pendingCloud: boolean;
}

export interface RemoteSide {
  save: SaveGame;
  checksum?: string;
  revision: number;
}

export type Reconciliation =
  | { use: "new" }
  | { use: "local"; push: boolean; baseRevision?: number; conflict: false }
  | { use: "remote"; conflict: false }
  | { use: "local" | "remote"; conflict: true; loser: SaveGame; baseRevision: number; push: boolean };

/**
 * Decide what to load at boot given the device's journal and the cloud copy.
 *   - remote unchanged since our base  → local wins (fast-forward if pending)
 *   - remote moved, nothing pending    → remote wins (fast-forward)
 *   - remote moved AND local pending   → true divergence → progress decides
 */
export function reconcile(local: LocalSide | null, remote: RemoteSide | null): Reconciliation {
  if (!local && !remote) return { use: "new" };
  if (local && !remote) return { use: "local", push: true, conflict: false };
  if (!local && remote) return { use: "remote", conflict: false };

  const l = local!;
  const r = remote!;
  if (r.checksum && r.checksum === l.checksum) {
    return { use: "local", push: false, baseRevision: r.revision, conflict: false };
  }
  const remoteMoved = l.cloudRevision === undefined || r.revision !== l.cloudRevision;
  if (!remoteMoved) {
    return { use: "local", push: l.pendingCloud, baseRevision: r.revision, conflict: false };
  }
  if (!l.pendingCloud) return { use: "remote", conflict: false };

  const winner = pickDivergenceWinner(l.save, r.save);
  return {
    use: winner,
    conflict: true,
    loser: winner === "local" ? r.save : l.save,
    baseRevision: r.revision,
    push: winner === "local",
  };
}

/** Structural validation guarding against corrupt or foreign save data. */
export function validateSave(data: unknown): data is SaveGame {
  if (!data || typeof data !== "object") return false;
  const s = data as Partial<SaveGame>;
  if (typeof s.version !== "number") return false;
  const p = s.player;
  const w = s.world;
  if (!p || !w || typeof w.hosts !== "object" || w.hosts === null) return false;
  if (!p.session || typeof p.session.hostId !== "string") return false;
  if (!w.hosts[p.session.hostId] || !w.hosts[p.localHostId]) return false;
  if (typeof p.credits !== "number" || typeof p.missions !== "object") return false;
  return Array.isArray(p.terminalHistory) && Array.isArray(p.discovered);
}
