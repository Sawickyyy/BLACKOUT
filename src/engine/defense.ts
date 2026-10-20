// Active defenders and the footprint the player leaves behind. The simulated
// administrator does more than raise an IDS counter: as suspicion climbs they
// lock the host down (filtering the player's traffic and refusing logins) and,
// as it cools, stand down again. Meanwhile every login and request the player
// makes is written into the host's real log files, so a careful operator can
// read — and, in some missions, must clean — their own trail.

import { VFS, type Principal } from "./fs/vfs";
import type { GameEvent } from "./shell/context";
import type { Host, PlayerState } from "./types";

const ROOT: Principal = { uid: 0, gid: 0, groups: [0] };

/** Heat at/above which the admin locks the host, and below which they relax. */
const LOCKDOWN_AT = 70;
const RELAX_BELOW = 30;

function iso(ts: number): string {
  return new Date(ts).toISOString();
}

/** Append a line to a host log file (creating it if needed), capped in size. */
function appendLog(host: Host, path: string, line: string): void {
  try {
    const vfs = new VFS(host.fs);
    let prev = "";
    try {
      prev = vfs.readFile(path, ROOT);
    } catch {
      prev = "";
    }
    // Keep the last ~400 lines so logs stay realistic but bounded.
    const lines = (prev + (prev.endsWith("\n") || prev === "" ? "" : "\n") + line + "\n").split("\n");
    const trimmed = lines.length > 401 ? lines.slice(lines.length - 401) : lines;
    vfs.writeFile(path, trimmed.join("\n"), ROOT);
  } catch {
    /* best-effort: a missing /var/log is not fatal */
  }
}

/**
 * Record the player's footprint for an event on the given host. Mirrors what a
 * real daemon would log: SSH accepts/failures in auth.log, HTTP requests in the
 * web access log. The player's own machine never logs against them.
 */
export function recordFootprint(host: Host, player: PlayerState, fromIp: string, ev: GameEvent): void {
  if (host.org === "self") return;
  const t = iso(Date.now());
  switch (ev.kind) {
    case "login_ok": {
      const user = String(ev.data?.user ?? "?");
      appendLog(host, "/var/log/auth.log", `${t} ${host.hostname} sshd[${1000 + (Date.now() % 9000)}]: Accepted password for ${user} from ${fromIp} port ${40000 + (Date.now() % 20000)} ssh2`);
      break;
    }
    case "login_fail": {
      const user = String(ev.data?.user ?? "?");
      appendLog(host, "/var/log/auth.log", `${t} ${host.hostname} sshd[${1000 + (Date.now() % 9000)}]: Failed password for ${user} from ${fromIp} port ${40000 + (Date.now() % 20000)} ssh2`);
      break;
    }
    case "http": {
      const path = String(ev.data?.path ?? "/");
      appendLog(host, "/var/log/nginx/access.log", `${fromIp} - - [${t}] "GET ${path} HTTP/1.1" 200 -`);
      break;
    }
    case "privesc": {
      appendLog(host, "/var/log/auth.log", `${t} ${host.hostname} sudo: ${String(ev.data?.user ?? "user")} : TTY=pts/0 ; PWD=/ ; USER=root ; COMMAND=/bin/su`);
      break;
    }
    default:
      break;
  }
}

export interface DefenderOutcome {
  /** Human-readable actions taken this event, for player notifications. */
  actions: string[];
}

/**
 * React to the host's current heat: lock it down past the threshold, stand down
 * once it cools. Locking adds a drop rule for the player's IP and sets a flag
 * the network layer honours; relaxing removes them. Returns what changed so the
 * UI can tell the player their access just dropped (or came back).
 */
export function updateDefenders(host: Host, player: PlayerState, fromIp: string): DefenderOutcome {
  const actions: string[] = [];
  if (host.org === "self") return { actions };
  const heat = player.suspicion.byHost[host.id] ?? 0;

  if (!host.lockdown && heat >= LOCKDOWN_AT) {
    host.lockdown = true;
    if (!host.firewall.some((r) => r.from === fromIp && r.action === "drop")) {
      host.firewall.unshift({ from: fromIp, action: "drop" });
    }
    host.logs.push({
      ts: Date.now(),
      facility: "firewall",
      message: `LOCKDOWN: zablokowano ${fromIp} po przekroczeniu progu alarmu`,
    });
    actions.push(`⛔ Administrator ${host.hostname} wykrył atak i zablokował Twój adres IP. Odczekaj, aż czujność opadnie.`);
  } else if (host.lockdown && heat < RELAX_BELOW) {
    host.lockdown = false;
    host.firewall = host.firewall.filter((r) => !(r.from === fromIp && r.action === "drop"));
    host.logs.push({ ts: Date.now(), facility: "firewall", message: `Zdjęto blokadę ${fromIp} — aktywność ustała` });
    actions.push(`✅ Blokada na ${host.hostname} została zdjęta — czujność administratora opadła.`);
  }
  return { actions };
}
