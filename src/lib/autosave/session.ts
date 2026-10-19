// Session bootstrap: decides which save to load when the game starts.
// Order matters — claim the tab first (so another tab flushes and steps back),
// then read the local journal and the cloud copy, and reconcile them.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SaveGame } from "@/engine/types";
import { newSaveGame } from "@/engine/world/seed";
import type { BackupStore } from "./backups";
import { supabaseCloud } from "./cloud";
import { Journal, browserStorage, journalKey, makeEntry, type KeyValueStorage } from "./journal";
import type { CloudAdapter, RemoteCopy } from "./manager";
import { reconcile, validateSave } from "./progress";
import { TabGuard } from "./tabs";

export interface PreparedSession {
  save: SaveGame;
  journal: Journal;
  cloud: CloudAdapter | null;
  cloudRevision?: number;
  pendingCloud: boolean;
  checksum?: string;
  guard: TabGuard;
  notices: { kind: "info" | "alert"; text: string }[];
}

export interface PrepareOptions {
  userKey: string;
  username: string;
  slot: number;
  name: string;
  supabase?: SupabaseClient | null;
  backups: BackupStore;
  onSuperseded: () => void;
  storage?: KeyValueStorage;
  cloud?: CloudAdapter | null;
  guard?: TabGuard;
}

export async function prepareSession(o: PrepareOptions): Promise<PreparedSession> {
  const guard = o.guard ?? new TabGuard(o.userKey, o.onSuperseded);
  await guard.claim();

  const journal = new Journal(o.storage ?? browserStorage(), journalKey(o.userKey, o.slot));
  const cloud = o.cloud !== undefined ? o.cloud : o.supabase ? supabaseCloud(o.supabase, o.slot, o.name) : null;
  const notices: PreparedSession["notices"] = [];

  const localRead = journal.read();
  const local = localRead && validateSave(localRead.save) ? localRead : null;
  if (localRead?.source === "prev") {
    notices.push({ kind: "alert", text: "Główny zapis był uszkodzony — odtworzono poprzednią poprawną wersję." });
  }

  let remote: RemoteCopy | null = null;
  let cloudUnreachable = false;
  if (cloud) {
    try {
      remote = await cloud.pull();
    } catch {
      cloudUnreachable = true;
    }
  }

  // Offline (or cloud down): play from the device; sync resumes later.
  if (cloud && cloudUnreachable) {
    notices.push({ kind: "info", text: "Brak połączenia z chmurą — grasz na zapisie z urządzenia, zsynchronizuje się później." });
    if (local) {
      return {
        save: local.save,
        journal,
        cloud,
        cloudRevision: local.entry.cloudRevision,
        pendingCloud: local.entry.pendingCloud,
        checksum: local.entry.checksum,
        guard,
        notices,
      };
    }
    return { save: newSaveGame(o.username), journal, cloud, pendingCloud: true, guard, notices };
  }

  const rec = reconcile(
    local
      ? {
          save: local.save,
          checksum: local.entry.checksum,
          cloudRevision: local.entry.cloudRevision,
          pendingCloud: local.entry.pendingCloud,
        }
      : null,
    remote,
  );

  if (rec.use === "new") {
    return { save: newSaveGame(o.username), journal, cloud, pendingCloud: Boolean(cloud), guard, notices };
  }

  if (rec.conflict) {
    await o.backups.add(o.userKey, rec.loser, rec.use === "local" ? "konflikt: wersja z chmury" : "konflikt: wersja z tego urządzenia").catch(() => null);
    notices.push({
      kind: "alert",
      text:
        rec.use === "local"
          ? "Zapisy na urządzeniach się rozjechały — zachowano bardziej zaawansowany z tego urządzenia (drugi jest w kopiach)."
          : "Zapisy na urządzeniach się rozjechały — wczytano bardziej zaawansowany z chmury (lokalny jest w kopiach).",
    });
  }

  if (rec.use === "remote") {
    const r = remote!;
    const entry = makeEntry(r.save, { name: o.name, cloudRevision: r.revision, pendingCloud: false, now: Date.now() });
    try {
      journal.write(entry);
    } catch {
      /* cache refresh is best-effort */
    }
    return { save: r.save, journal, cloud, cloudRevision: r.revision, pendingCloud: false, checksum: entry.checksum, guard, notices };
  }

  return {
    save: local!.save,
    journal,
    cloud,
    cloudRevision: rec.baseRevision ?? local!.entry.cloudRevision,
    pendingCloud: Boolean(cloud) && rec.push,
    checksum: local!.entry.checksum,
    guard,
    notices,
  };
}
