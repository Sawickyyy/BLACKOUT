// Forward-only save migration. A save embeds the whole world, so a returning
// player keeps the world that was seeded when they first played. When we add
// new hosts, DNS records or organizations (e.g. for new missions) we must graft
// them into existing saves — otherwise the new missions reference hosts that
// aren't there. Migration only ADDS what is missing: it never overwrites a
// host the player may have changed, so progress is always preserved.

import type { SaveGame } from "../types";
import { buildWorld, SAVE_VERSION } from "./seed";

/**
 * Bring an older save up to the current schema in place. Safe to run on every
 * load (new games included): it is idempotent and only fills gaps.
 */
export function migrateSave(save: SaveGame): SaveGame {
  const fresh = buildWorld();

  // 1. New hosts referenced by newer missions. Add only ones absent from the
  //    player's world; keep every existing host exactly as it is.
  for (const [id, host] of Object.entries(fresh.hosts)) {
    if (!save.world.hosts[id]) save.world.hosts[id] = host;
  }

  // 2. New DNS records (match on name+type+value so we never duplicate).
  const haveDns = new Set(save.world.dns.map((r) => `${r.type}:${r.name.toLowerCase()}:${r.value.toLowerCase()}`));
  for (const r of fresh.dns) {
    const key = `${r.type}:${r.name.toLowerCase()}:${r.value.toLowerCase()}`;
    if (!haveDns.has(key)) {
      save.world.dns.push(r);
      haveDns.add(key);
    }
  }

  // 3. New organizations.
  for (const [id, org] of Object.entries(fresh.organizations)) {
    if (!save.world.organizations[id]) save.world.organizations[id] = org;
  }

  // 3b. Simulated Wi-Fi networks (added with the wireless lab).
  if (!Array.isArray(save.world.wifi)) {
    save.world.wifi = fresh.wifi ?? [];
  } else {
    const have = new Set(save.world.wifi.map((n) => n.ssid.toLowerCase()));
    for (const n of fresh.wifi ?? []) if (!have.has(n.ssid.toLowerCase())) save.world.wifi.push(n);
  }

  // 4. Player fields added after the player's save was created.
  if (!save.player.hintsUsed || typeof save.player.hintsUsed !== "object") {
    save.player.hintsUsed = {};
  }
  if (!Array.isArray(save.player.cctvViewed)) {
    save.player.cctvViewed = [];
  }
  if (!Array.isArray(save.player.notebook)) {
    save.player.notebook = [];
  }
  if (typeof save.player.tutorialSeen !== "boolean") {
    // Veteran players (any discovered host beyond the two starting ones) have
    // clearly found their feet — don't nag them with the first-run tutorial.
    save.player.tutorialSeen = (save.player.discovered?.length ?? 0) > 2;
  }

  save.version = SAVE_VERSION;
  return save;
}
