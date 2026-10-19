// Shared persistence helpers. Saving itself lives in src/lib/autosave/
// (journal, cloud adapter, backups, SaveManager).

import type { SaveGame } from "@/engine/types";
import { sha256 } from "@/engine/util/hash";

/** SHA-256 of the serialized save, as sent to storage. */
export function checksum(save: SaveGame): string {
  return sha256(JSON.stringify(save));
}
