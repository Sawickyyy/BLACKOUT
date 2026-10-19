// Mission engine. After every player action it re-evaluates each mission's
// objectives (latching them done), promotes available→active→completed,
// grants rewards exactly once, and unlocks follow-up missions. Objectives are
// predicates over world+player state plus the triggering event, so completion
// reflects real actions (files read, hosts accessed, answers written) rather
// than a timer or a single button.

import { VFS, type Principal } from "../fs/vfs";
import type { GameEvent } from "../shell/context";
import type {
  InventoryItem,
  MissionState,
  MissionStatus,
  PlayerState,
  SkillSet,
  WorldState,
} from "../types";

const ROOT: Principal = { uid: 0, gid: 0, groups: [0] };

export interface MissionCtx {
  player: PlayerState;
  world: WorldState;
  event?: GameEvent;
  fileContains(hostId: string, path: string, substr: string): boolean;
  fileExists(hostId: string, path: string): boolean;
  hasAccess(hostId: string, user?: string): boolean;
  discovered(hostId: string): boolean;
  /** True if the current event is a command whose name matches and (optionally) args include a token. */
  ranCommand(name: string, argIncludes?: string): boolean;
  /** True if the current event matches a kind + optional host. */
  eventIs(kind: string, hostId?: string): boolean;
  suspicionBelow(n: number): boolean;
  /** True if the player has opened a camera feed (optionally a specific one). */
  cctvViewed(hostId: string, feedId?: string): boolean;
}

export interface MissionReward {
  credits?: number;
  skills?: Partial<SkillSet>;
  reputation?: { org: string; amount: number }[];
  unlockCapabilities?: string[];
  items?: InventoryItem[];
}

export interface MissionObjective {
  id: string;
  label: string;
  optional?: boolean;
  hint?: string;
  check(mc: MissionCtx): boolean;
}

export interface Mission {
  id: string;
  title: string;
  org?: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  brief: string;
  prereq?: string[];
  reward: MissionReward;
  objectives: MissionObjective[];
  /** Escalating hint ladder, revealed one at a time by the paid `hint` command. */
  hints?: string[];
  failIf?(mc: MissionCtx): boolean;
}

/**
 * The ordered hints shown by the paid `hint` command: the mission's explicit
 * ladder if it has one, otherwise a fallback built from each objective's hint
 * and finally the brief, so every mission can always offer at least one.
 */
export function hintLadder(m: Mission): string[] {
  if (m.hints && m.hints.length) return m.hints;
  const fromObjectives = m.objectives.map((o) => o.hint).filter((h): h is string => !!h);
  if (fromObjectives.length) return fromObjectives;
  return [m.brief];
}

export interface HintResult {
  ok: boolean;
  text?: string;
  cost?: number;
  remaining?: number;
  error?: string;
}

/** Find the mission a bare `hint` should target: explicit ref, else active, else available. */
export function resolveHintMission(player: PlayerState, missions: Mission[], ref?: string): Mission | null {
  if (ref) {
    const idx = /^\d+$/.test(ref) ? parseInt(ref, 10) - 1 : missions.findIndex((m) => m.id === ref);
    return missions[idx] ?? null;
  }
  const statusOf = (m: Mission) => player.missions[m.id]?.status ?? (m.prereq?.length ? "locked" : "available");
  return missions.find((m) => statusOf(m) === "active") ?? missions.find((m) => statusOf(m) === "available") ?? null;
}

/**
 * Reveal the next paid hint for a mission and charge escalating credits
 * (25, 50, 75, …). Pure mutation of player state so the terminal command and
 * the Missions app share one implementation.
 */
export function revealMissionHint(player: PlayerState, missions: Mission[], ref?: string): HintResult {
  const mission = resolveHintMission(player, missions, ref);
  if (!mission) return { ok: false, error: "Brak aktywnego zlecenia. Zobacz `missions` i zacznij jedno." };
  const ladder = hintLadder(mission);
  if (ladder.length === 0) return { ok: false, error: `Zlecenie „${mission.title}” nie ma dodatkowych wskazówek.` };
  player.hintsUsed ??= {};
  const used = player.hintsUsed[mission.id] ?? 0;
  if (used >= ladder.length) {
    return { ok: false, error: `Wykorzystałeś wszystkie wskazówki do „${mission.title}”. Spróbuj polecenia tutorial.` };
  }
  const cost = 25 * (used + 1);
  if (player.credits < cost) {
    return { ok: false, error: `Ta wskazówka kosztuje ${cost} kr, a masz ${player.credits} kr.` };
  }
  player.credits -= cost;
  player.hintsUsed[mission.id] = used + 1;
  player.transactions.push({
    id: `tx_hint_${mission.id}_${Date.now()}`,
    ts: Date.now(),
    amount: -cost,
    balanceAfter: player.bankBalance,
    memo: `Wskazówka: ${mission.title}`,
  });
  player.updatedAt = Date.now();
  return { ok: true, text: ladder[used]!, cost, remaining: ladder.length - used - 1 };
}

export function makeMissionCtx(
  player: PlayerState,
  world: WorldState,
  event?: GameEvent,
): MissionCtx {
  const read = (hostId: string, path: string): string | null => {
    const host = world.hosts[hostId];
    if (!host) return null;
    try {
      return new VFS(host.fs).readFile(path, ROOT);
    } catch {
      return null;
    }
  };
  return {
    player,
    world,
    event,
    fileContains: (hostId, path, substr) => (read(hostId, path) ?? "").includes(substr),
    fileExists: (hostId, path) => read(hostId, path) !== null,
    hasAccess: (hostId, user) => {
      const acc = player.accessByHost[hostId] ?? [];
      return user ? acc.includes(user) : acc.length > 0;
    },
    discovered: (hostId) => player.discovered.includes(hostId),
    ranCommand: (name, argIncludes) => {
      if (!event || event.kind !== "command") return false;
      if (event.data?.name !== name) return false;
      if (!argIncludes) return true;
      const args = (event.data?.args as string[] | undefined) ?? [];
      return args.some((a) => a.includes(argIncludes));
    },
    eventIs: (kind, hostId) => !!event && event.kind === kind && (!hostId || event.hostId === hostId),
    suspicionBelow: (n) => player.suspicion.heat < n,
    cctvViewed: (hostId, feedId) =>
      (player.cctvViewed ?? []).includes(feedId ? `${hostId}:${feedId}` : hostId) ||
      (!feedId && (player.cctvViewed ?? []).some((k) => k.startsWith(`${hostId}:`))),
  };
}

export interface MissionUpdate {
  completed: string[];
  newlyAvailable: string[];
  objectivesAdvanced: { mission: string; objective: string }[];
}

function ensureState(player: PlayerState, m: Mission): MissionState {
  let st = player.missions[m.id];
  if (!st) {
    const available = !m.prereq || m.prereq.length === 0;
    st = {
      id: m.id,
      status: available ? "available" : "locked",
      objectives: Object.fromEntries(m.objectives.map((o) => [o.id, false])),
    };
    player.missions[m.id] = st;
  }
  return st;
}

function prereqsMet(player: PlayerState, m: Mission): boolean {
  if (!m.prereq) return true;
  return m.prereq.every((p) => player.missions[p]?.status === "completed");
}

function grant(player: PlayerState, m: Mission): void {
  const r = m.reward;
  if (r.credits) {
    player.credits += r.credits;
    player.transactions.push({
      id: `tx_${m.id}_${Date.now()}`,
      ts: Date.now(),
      amount: r.credits,
      balanceAfter: player.bankBalance,
      memo: `Nagroda za misję: ${m.title}`,
    });
  }
  if (r.skills) {
    for (const [k, v] of Object.entries(r.skills)) {
      player.skills[k as keyof SkillSet] = Math.min(10, player.skills[k as keyof SkillSet] + (v ?? 0));
    }
  }
  for (const rep of r.reputation ?? []) {
    player.reputationByOrg[rep.org] = (player.reputationByOrg[rep.org] ?? 0) + rep.amount;
  }
  for (const cap of r.unlockCapabilities ?? []) {
    if (!player.capabilities.includes(cap)) player.capabilities.push(cap);
  }
  for (const it of r.items ?? []) {
    if (!player.inventory.some((x) => x.id === it.id)) player.inventory.push(it);
  }
}

/**
 * Evaluate all missions after an event. Mutates player.missions and grants
 * rewards. Returns a summary for notifications.
 */
export function evaluateMissions(
  player: PlayerState,
  world: WorldState,
  missions: Mission[],
  event?: GameEvent,
): MissionUpdate {
  const mc = makeMissionCtx(player, world, event);
  const update: MissionUpdate = { completed: [], newlyAvailable: [], objectivesAdvanced: [] };

  // First unlock any missions whose prereqs are now met.
  for (const m of missions) {
    const st = ensureState(player, m);
    if (st.status === "locked" && prereqsMet(player, m)) {
      st.status = "available";
      update.newlyAvailable.push(m.id);
    }
  }

  for (const m of missions) {
    const st = player.missions[m.id]!;
    if (st.status === "completed" || st.status === "failed" || st.status === "locked") continue;

    if (m.failIf && m.failIf(mc)) {
      st.status = "failed";
      continue;
    }

    let advanced = false;
    for (const obj of m.objectives) {
      if (st.objectives[obj.id]) continue;
      let done = false;
      try {
        done = obj.check(mc);
      } catch {
        done = false;
      }
      if (done) {
        st.objectives[obj.id] = true;
        advanced = true;
        update.objectivesAdvanced.push({ mission: m.id, objective: obj.id });
      }
    }

    if (advanced && st.status === "available") {
      st.status = "active";
      st.startedAt = Date.now();
    }

    const required = m.objectives.filter((o) => !o.optional);
    const allDone = required.every((o) => st.objectives[o.id]);
    if (allDone && st.status !== ("completed" as MissionStatus)) {
      st.status = "completed";
      st.completedAt = Date.now();
      grant(player, m);
      update.completed.push(m.id);
    }
  }

  // Unlock missions gated behind the ones just completed.
  if (update.completed.length) {
    for (const m of missions) {
      const st = ensureState(player, m);
      if (st.status === "locked" && prereqsMet(player, m)) {
        st.status = "available";
        update.newlyAvailable.push(m.id);
      }
    }
  }

  return update;
}
