// Operator notebook. A real pentester keeps running notes of what they have
// found; here the engine does the bookkeeping automatically — every discovered
// host and every account the player gains access to is recorded once — and the
// player can add their own notes on top. Entries are deterministic and
// idempotent, so re-syncing never duplicates them.

import type { NotebookEntry, PlayerState, WorldState } from "./types";

function ensure(player: PlayerState): NotebookEntry[] {
  if (!Array.isArray(player.notebook)) player.notebook = [];
  return player.notebook;
}

function has(book: NotebookEntry[], id: string): boolean {
  return book.some((e) => e.id === id);
}

/**
 * Reconcile the auto-collected entries with current world/player state. Adds a
 * line the first time a host is discovered or an account is accessed; leaves
 * manual notes and existing entries untouched.
 */
export function syncNotebook(player: PlayerState, world: WorldState): void {
  const book = ensure(player);

  for (const id of player.discovered) {
    const host = world.hosts[id];
    if (!host || host.org === "self") continue;
    const key = `auto:host:${id}`;
    if (!has(book, key)) {
      const org = host.org ? world.organizations[host.org]?.name ?? host.org : "—";
      book.push({ id: key, ts: Date.now(), kind: "host", text: `${host.hostname} (${host.ip}) · ${org}`, auto: true });
    }
  }

  for (const [hostId, users] of Object.entries(player.accessByHost)) {
    const host = world.hosts[hostId];
    if (!host || host.org === "self") continue;
    for (const user of users) {
      const key = `auto:cred:${hostId}:${user}`;
      if (!has(book, key)) {
        book.push({ id: key, ts: Date.now(), kind: "credential", text: `${user}@${host.hostname}`, auto: true });
      }
    }
  }
}

/** Add a manual note; returns the created entry. */
export function addManualNote(player: PlayerState, text: string, kind: NotebookEntry["kind"] = "note"): NotebookEntry {
  const book = ensure(player);
  const entry: NotebookEntry = {
    id: `note:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
    ts: Date.now(),
    kind,
    text,
    auto: false,
  };
  book.push(entry);
  return entry;
}

export function removeNote(player: PlayerState, id: string): void {
  if (!Array.isArray(player.notebook)) return;
  player.notebook = player.notebook.filter((e) => e.id !== id || e.auto);
}
