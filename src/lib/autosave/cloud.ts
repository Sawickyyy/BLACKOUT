// Supabase implementation of CloudAdapter. Writes go through the `save_game`
// RPC (RLS + optimistic revision check); errors are classified so the
// SaveManager can react correctly: conflict → resolve, network → back off and
// retry, auth → stop and ask the player to sign in again.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SaveGame } from "@/engine/types";
import { checksum as saveChecksum } from "@/lib/persistence";
import type { CloudAdapter, PushResult, RemoteCopy } from "./manager";
import { validateSave } from "./progress";

interface PgError {
  code?: string;
  message?: string;
  status?: number;
}

function classify(error: PgError): PushResult {
  const msg = error.message ?? "";
  if (error.code === "40001" || /save_conflict/.test(msg)) return { ok: false, kind: "conflict" };
  if (error.code === "PGRST301" || error.code === "42501" || /JWT|jwt|not authenticated/.test(msg)) {
    return { ok: false, kind: "auth", message: msg };
  }
  if (!error.code || /fetch|network|Failed to fetch|Load failed|timeout/i.test(msg)) {
    return { ok: false, kind: "network", message: msg };
  }
  return { ok: false, kind: "other", message: msg };
}

export function supabaseCloud(supabase: SupabaseClient, slot: number, name: string): CloudAdapter {
  return {
    async push(save: SaveGame, expectedRevision?: number): Promise<PushResult> {
      const { data, error } = await supabase.rpc("save_game", {
        p_slot: slot,
        p_name: name,
        p_data: save,
        p_checksum: saveChecksum(save),
        p_expected_revision: expectedRevision ?? null,
      });
      if (error) return classify(error);
      const row = Array.isArray(data) ? data[0] : data;
      return { ok: true, revision: Number(row?.revision ?? 0) };
    },

    async pull(): Promise<RemoteCopy | null> {
      const { data, error } = await supabase
        .from("saves")
        .select("data,revision,checksum")
        .eq("slot", slot)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data || !validateSave(data.data)) return null;
      return { save: data.data as SaveGame, revision: Number(data.revision), checksum: data.checksum ?? undefined };
    },
  };
}
