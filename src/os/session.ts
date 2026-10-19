"use client";

import { getSupabaseBrowser } from "@/lib/supabase/client";
import { useGame } from "@/store/gameStore";

/** Save, forget the remembered local identity, sign out of the cloud and reload. */
export async function logout(): Promise<void> {
  await useGame.getState().saveNow();
  try {
    window.localStorage.removeItem("blacknet:last");
  } catch {
    /* ignore */
  }
  const supabase = getSupabaseBrowser();
  if (supabase) await supabase.auth.signOut();
  window.location.reload();
}

/** Delete the player's data (cloud rows via RLS, journal, backups) and reload. */
export async function deleteAccountData(): Promise<void> {
  const { backend, clearAllSaves } = useGame.getState();
  const supabase = getSupabaseBrowser();
  if (backend === "cloud" && supabase) {
    // Full auth.users deletion needs a privileged server function (DEPLOYMENT.md).
    await supabase.from("saves").delete().neq("slot", -1);
    await supabase.auth.signOut();
  }
  await clearAllSaves();
  try {
    window.localStorage.removeItem("blacknet:last");
  } catch {
    /* ignore */
  }
  window.location.reload();
}
