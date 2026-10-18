// Detection & suspicion. Player actions generate events; defensive systems
// react based on what actually happened (a port scan is loud, reading a file
// you have access to is quiet), scaled by each host's IDS sensitivity and
// reduced by stealth capabilities (VPN, proxychains). Crossing thresholds
// writes IDS log lines and escalates the host's sensitivity — a simulated
// administrator noticing you.

import type { GameEvent } from "./shell/context";
import type { LogEntry, PlayerState, WorldState } from "./types";

/** Base noise per event kind, before scaling. */
const BASE_NOISE: Record<string, number> = {
  scan: 18,
  login_fail: 10,
  privesc: 14,
  login_ok: 4,
  connect: 3,
  http: 1,
  dns: 0.5,
  ping: 0.5,
  file_read: 0.2,
  file_delete: 1,
  scp: 3,
  command: 0,
  kill: 2,
};

function stealthFactor(player: PlayerState): number {
  let f = 1;
  if (player.capabilities.includes("vpn")) f *= 0.5;
  if (player.capabilities.includes("proxychains")) f *= 0.4;
  return f;
}

export interface DetectionResult {
  hostHeat: number;
  globalHeat: number;
  alerted: boolean;
}

export function applyDetection(
  world: WorldState,
  player: PlayerState,
  ev: GameEvent,
): DetectionResult {
  const base = BASE_NOISE[ev.kind] ?? 0;
  const hostId = ev.hostId;
  const host = hostId ? world.hosts[hostId] : undefined;

  // Your own machine never reports you.
  if (host && host.org === "self") {
    return { hostHeat: 0, globalHeat: player.suspicion.heat, alerted: false };
  }

  const sensitivity = host ? 0.5 + host.idsSensitivity : 0.5;
  const gain = base * sensitivity * stealthFactor(player);

  let alerted = false;
  if (hostId && gain > 0) {
    const prev = player.suspicion.byHost[hostId] ?? 0;
    const next = Math.min(100, prev + gain);
    player.suspicion.byHost[hostId] = next;

    // Threshold crossing → IDS log + admin escalates sensitivity.
    for (const threshold of [40, 70, 90]) {
      if (prev < threshold && next >= threshold && host) {
        alerted = true;
        const entry: LogEntry = {
          ts: Date.now(),
          facility: "ids",
          message: `ALERT poziom ${threshold}: podejrzana aktywność z ${player.username} (zdarzenie: ${ev.kind})`,
        };
        host.logs.push(entry);
        host.idsSensitivity = Math.min(1, host.idsSensitivity + 0.1);
      }
    }
  }

  // Global heat is the decayed sum of local heat.
  player.suspicion.heat = Math.min(
    100,
    Math.round(
      Object.values(player.suspicion.byHost).reduce((a, b) => a + b, 0) /
        Math.max(1, Object.keys(player.suspicion.byHost).length) /
        1,
    ),
  );

  return {
    hostHeat: hostId ? player.suspicion.byHost[hostId] ?? 0 : 0,
    globalHeat: player.suspicion.heat,
    alerted,
  };
}

/** Passive decay, applied on load/tick so heat cools over time. */
export function decaySuspicion(player: PlayerState, elapsedMs: number): void {
  const hours = elapsedMs / 3_600_000;
  if (hours <= 0) return;
  const factor = Math.max(0, 1 - hours * 0.15); // ~15% per hour
  for (const k of Object.keys(player.suspicion.byHost)) {
    player.suspicion.byHost[k] = Math.max(0, (player.suspicion.byHost[k] ?? 0) * factor);
  }
  player.suspicion.heat = Math.round(player.suspicion.heat * factor);
}
