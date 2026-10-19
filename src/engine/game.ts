// GameEngine — the orchestration layer. It owns a SaveGame (world + player),
// builds a live ShellContext whose host/user/vfs track the session (so an
// `ssh ... && whoami` in one line runs the second command on the new host),
// runs command lines, and routes every emitted event into the detection and
// mission systems. The UI and the persistence layer both talk to this class.

import { applyDetection, decaySuspicion } from "./detection";
import { VFS, type Principal } from "./fs/vfs";
import { resolve as resolvePath } from "./fs/path";
import { MISSIONS } from "./missions/defs";
import { evaluateMissions, revealMissionHint } from "./missions/engine";
import { Network } from "./net/net";
import { migrateSave } from "./world/migrate";
import { buildRegistry, commandNames } from "./shell/commands/index";
import { runLine } from "./shell/exec";
import type { CommandRegistry, GameEvent, ShellContext } from "./shell/context";
import type { Host, SaveGame, VUser } from "./types";

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
  sessionChanged: boolean;
  completedMissions: string[];
  newlyAvailable: string[];
  objectivesAdvanced: { mission: string; objective: string }[];
  alerted: boolean;
  /** Gentle, context-aware onboarding tips (unknown command, repeated errors). */
  tips: string[];
}

/** Levenshtein distance, for "did you mean" command suggestions. */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array<number>(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  return dp[m]![n]!;
}

export class GameEngine {
  readonly save: SaveGame;
  private registry: CommandRegistry;
  private net: Network;
  private lastExit = 0;
  private vfsCache = new Map<string, VFS>();
  /** Count of consecutive failing command lines, for nudging a stuck player. */
  private consecutiveErrors = 0;

  // Per-run accumulators populated by emitted events.
  private accCompleted = new Set<string>();
  private accAvailable = new Set<string>();
  private accObjectives: { mission: string; objective: string }[] = [];
  private accAlerted = false;

  constructor(save: SaveGame) {
    // Graft in any world content added since this save was created, so newer
    // missions and their target hosts exist for returning players.
    this.save = migrateSave(save);
    this.registry = buildRegistry();
    this.net = new Network(save.world);
    // Cool down suspicion for time elapsed while away.
    const elapsed = Date.now() - (save.player.updatedAt ?? Date.now());
    decaySuspicion(save.player, elapsed);
  }

  get player() {
    return this.save.player;
  }
  get world() {
    return this.save.world;
  }

  currentHost(): Host {
    const h = this.world.hosts[this.player.session.hostId];
    if (!h) throw new Error(`Nieznany host sesji: ${this.player.session.hostId}`);
    return h;
  }

  private vfsFor(host: Host): VFS {
    let v = this.vfsCache.get(host.id);
    if (!v || v.root !== host.fs) {
      v = new VFS(host.fs);
      this.vfsCache.set(host.id, v);
    }
    return v;
  }

  private principalFor(host: Host, uid: number): Principal {
    const u = host.users.find((x) => x.uid === uid);
    if (uid === 0) return { uid: 0, gid: 0, groups: [0] };
    return u ? { uid: u.uid, gid: u.gid, groups: [u.gid, ...u.groups] } : { uid, gid: uid, groups: [uid] };
  }

  private userFor(host: Host, uid: number): VUser {
    return (
      host.users.find((x) => x.uid === uid) ?? {
        name: String(uid),
        uid,
        gid: uid,
        groups: [],
        home: "/",
        shell: "/bin/sh",
      }
    );
  }

  /** Build a ShellContext whose host/user/vfs/principal follow the session. */
  private buildContext(): ShellContext {
    const engine = this;
    const session = this.player.session;
    return {
      world: this.world,
      player: this.player,
      net: this.net,
      get host() {
        return engine.currentHost();
      },
      get vfs() {
        return engine.vfsFor(engine.currentHost());
      },
      get principal() {
        return engine.principalFor(engine.currentHost(), session.uid);
      },
      get user() {
        return engine.userFor(engine.currentHost(), session.uid);
      },
      session,
      resolve: (p: string) => resolvePath(session.cwd, p),
      getUser: (uidOrName) => {
        const host = engine.currentHost();
        return typeof uidOrName === "number"
          ? host.users.find((u) => u.uid === uidOrName)
          : host.users.find((u) => u.name === uidOrName);
      },
      hasCapability: (name) => engine.player.capabilities.includes(name),
      emit: (ev: GameEvent) => engine.handleEvent(ev),
      nowTs: () => Date.now(),
    };
  }

  private handleEvent(ev: GameEvent): void {
    // Detection first (mutates suspicion + host logs).
    const det = applyDetection(this.world, this.player, ev);
    if (det.alerted) this.accAlerted = true;
    // Then missions react to the event.
    const upd = evaluateMissions(this.player, this.world, MISSIONS, ev);
    upd.completed.forEach((c) => this.accCompleted.add(c));
    upd.newlyAvailable.forEach((c) => this.accAvailable.add(c));
    this.accObjectives.push(...upd.objectivesAdvanced);
  }

  /** Execute one command line. */
  run(line: string): RunResult {
    const trimmed = line.trim();
    if (trimmed) {
      this.player.terminalHistory.push(trimmed);
      if (this.player.terminalHistory.length > 500) {
        this.player.terminalHistory = this.player.terminalHistory.slice(-500);
      }
    }
    this.accCompleted.clear();
    this.accAvailable.clear();
    this.accObjectives = [];
    this.accAlerted = false;

    this.applyWifiLinkFilter();
    const ctx = this.buildContext();
    const outcome = runLine(line, this.registry, ctx, this.lastExit);
    this.lastExit = outcome.code;

    // Final state-only evaluation for objectives that depend on resulting state
    // (file created, access gained) rather than the triggering event.
    const finalUpd = evaluateMissions(this.player, this.world, MISSIONS, undefined);
    finalUpd.completed.forEach((c) => this.accCompleted.add(c));
    finalUpd.newlyAvailable.forEach((c) => this.accAvailable.add(c));
    this.accObjectives.push(...finalUpd.objectivesAdvanced);

    this.player.updatedAt = Date.now();

    return {
      stdout: outcome.stdout,
      stderr: outcome.stderr,
      code: outcome.code,
      sessionChanged: outcome.sessionChanged,
      completedMissions: [...this.accCompleted],
      newlyAvailable: [...this.accAvailable],
      objectivesAdvanced: this.accObjectives,
      alerted: this.accAlerted,
      tips: this.onboardingTips(trimmed, outcome.code, outcome.stderr),
    };
  }

  /**
   * Turn a failed command into a gentle, specific nudge: a "did you mean"
   * suggestion for an unknown command, and — after a few failures in a row —
   * a reminder that `hint` and `tutorial` exist. Progress (a completed
   * objective) resets the streak so a learning player is never nagged.
   */
  private onboardingTips(line: string, code: number, stderr: string): string[] {
    if (!line) return [];
    const tips: string[] = [];
    const advanced = this.accObjectives.length > 0 || this.accCompleted.size > 0;
    if (code === 0 || advanced) {
      this.consecutiveErrors = 0;
      return [];
    }
    this.consecutiveErrors++;

    // Unknown command → suggest the closest one we actually have.
    const unknown = /^bash: ([^:]+): polecenie nieznalezione/.exec(stderr);
    if (unknown) {
      const typed = unknown[1]!;
      let best: string | null = null;
      let bestD = 3; // only suggest for close typos
      for (const name of commandNames(this.registry)) {
        const d = editDistance(typed, name);
        if (d < bestD) {
          bestD = d;
          best = name;
        }
      }
      tips.push(
        best
          ? `Nie znam polecenia „${typed}”. Może chodziło o „${best}”? Pełna lista: wpisz help.`
          : `Nie znam polecenia „${typed}”. Wpisz help, aby zobaczyć dostępne polecenia.`,
      );
    }

    if (this.consecutiveErrors >= 3) {
      tips.push("Kilka prób nie wyszło. Wpisz hint po wskazówkę do aktywnego zlecenia albo tutorial po mini-kurs.");
      this.consecutiveErrors = 0;
    }
    return tips;
  }

  /**
   * Gate home-LAN devices behind their Wi-Fi network: a host that belongs to
   * some access point's LAN is only reachable while the player is joined to
   * that network. Recomputed each run from player + world state.
   */
  private applyWifiLinkFilter(): void {
    const nets = this.world.wifi ?? [];
    if (nets.length === 0) {
      this.net.setLinkFilter(() => true);
      return;
    }
    // A LAN host may sit behind more than one SSID (a 2.4 and a 5 GHz radio),
    // so map each host to the SET of networks that reach it.
    const ownersOf = new Map<string, Set<string>>();
    for (const n of nets) {
      for (const id of n.lanHostIds ?? []) {
        (ownersOf.get(id) ?? ownersOf.set(id, new Set()).get(id)!).add(n.ssid);
      }
    }
    const connected = this.player.wifiConnected;
    this.net.setLinkFilter((host) => {
      const owners = ownersOf.get(host.id);
      return owners === undefined || (connected !== undefined && owners.has(connected));
    });
  }

  /** The simulated access points in range (read-only view for the Wi-Fi app). */
  wifiNetworks() {
    return this.world.wifi ?? [];
  }

  /** Reveal the next paid hint for a mission (delegates to the shared logic). */
  revealHint(ref?: string) {
    return revealMissionHint(this.player, MISSIONS, ref);
  }

  /** Record that the player opened a camera feed; returns true if it was new. */
  viewCamera(hostId: string, feedId: string): boolean {
    this.player.cctvViewed ??= [];
    const key = `${hostId}:${feedId}`;
    if (this.player.cctvViewed.includes(key)) return false;
    this.player.cctvViewed.push(key);
    this.player.updatedAt = Date.now();
    return true;
  }

  /** The shell prompt string for the current session. */
  prompt(): string {
    const host = this.currentHost();
    const user = this.userFor(host, this.player.session.uid);
    let cwd = this.player.session.cwd;
    if (user.home && cwd.startsWith(user.home)) cwd = "~" + cwd.slice(user.home.length);
    const sigil = this.player.session.uid === 0 ? "#" : "$";
    return `${user.name}@${host.hostname}:${cwd}${sigil} `;
  }

  /** Autocomplete candidates for a partial token given its position. */
  complete(line: string): string[] {
    const parts = line.split(/\s+/);
    const isFirst = parts.length <= 1;
    const frag = parts[parts.length - 1] ?? "";
    if (isFirst) {
      return commandNames(this.registry).filter((n) => n.startsWith(frag));
    }
    // path completion against cwd
    const host = this.currentHost();
    const vfs = this.vfsFor(host);
    const principal = this.principalFor(host, this.player.session.uid);
    const slash = frag.lastIndexOf("/");
    const dirPart = slash === -1 ? "." : frag.slice(0, slash + 1);
    const base = slash === -1 ? frag : frag.slice(slash + 1);
    try {
      const abs = resolvePath(this.player.session.cwd, dirPart);
      const names = vfs.readdir(abs, principal);
      return names
        .filter((n) => n.startsWith(base))
        .map((n) => (slash === -1 ? n : dirPart + n));
    } catch {
      return [];
    }
  }

  // ── Permission-checked FS helpers for the GUI file explorer ──────────────
  private curPrincipal(): Principal {
    return this.principalFor(this.currentHost(), this.player.session.uid);
  }

  fsList(path: string): { ok: true; entries: { name: string; type: string }[] } | { ok: false; error: string } {
    const host = this.currentHost();
    const vfs = this.vfsFor(host);
    const p = this.curPrincipal();
    const abs = resolvePath(this.player.session.cwd, path);
    try {
      const names = vfs.readdir(abs, p);
      const entries = names.map((name) => {
        const childPath = abs === "/" ? "/" + name : abs + "/" + name;
        let type = "file";
        try {
          type = vfs.stat(childPath, p).node.type;
        } catch {
          type = "file";
        }
        return { name, type };
      });
      return { ok: true, entries };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  fsRead(path: string): { ok: true; content: string } | { ok: false; error: string } {
    const vfs = this.vfsFor(this.currentHost());
    const p = this.curPrincipal();
    try {
      return { ok: true, content: vfs.readFile(resolvePath(this.player.session.cwd, path), p) };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  fsWrite(path: string, content: string): { ok: true } | { ok: false; error: string } {
    const vfs = this.vfsFor(this.currentHost());
    const p = this.curPrincipal();
    try {
      vfs.writeFile(resolvePath(this.player.session.cwd, path), content, p);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  // ── Read-only views for the OS apps (never mutate game state) ─────────────

  /** Directory listing with the metadata the VFS really stores. */
  fsListDetailed(path: string):
    | {
        ok: true;
        path: string;
        entries: { name: string; type: string; mode: number; owner: string; group: string; size: number; mtime: number }[];
      }
    | { ok: false; error: string } {
    const host = this.currentHost();
    const vfs = this.vfsFor(host);
    const p = this.curPrincipal();
    const abs = resolvePath(this.player.session.cwd, path);
    try {
      const names = vfs.readdir(abs, p);
      const entries = names.map((name) => {
        const child = abs === "/" ? "/" + name : abs + "/" + name;
        const node = vfs.stat(child, p).node;
        const size = node.type === "file" ? node.content.length : node.type === "symlink" ? node.target.length : 4096;
        return {
          name,
          type: node.type,
          mode: node.mode,
          owner: host.users.find((u) => u.uid === node.uid)?.name ?? String(node.uid),
          group: host.groups.find((g) => g.gid === node.gid)?.name ?? String(node.gid),
          size,
          mtime: node.mtime,
        };
      });
      return { ok: true, path: abs, entries };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  /**
   * Services the player has actually seen on a host: only if their terminal
   * history contains an `nmap` or `nc` aimed at it. Mirrors what nmap printed
   * (open ports from the default port list) — nothing the player hasn't seen.
   */
  observedServices(hostId: string): { port: number; proto: string; service?: string; version?: string }[] | null {
    const host = this.world.hosts[hostId];
    const local = this.world.hosts[this.player.localHostId];
    if (!host || !local) return null;
    const scanned = this.player.terminalHistory.some((line) => {
      const parts = line.trim().split(/\s+/);
      if (parts[0] !== "nmap" && parts[0] !== "nc") return false;
      return parts.slice(1).some((t) => !t.startsWith("-") && this.net.target(t)?.id === hostId);
    });
    if (!scanned) return null;
    const ports = [21, 22, 23, 25, 53, 80, 110, 143, 443, 445, 993, 3306, 3389, 5432, 8080, 8443];
    return this.net
      .scan(local, host, ports)
      .filter((r) => r.state === "open")
      .map((r) => ({ port: r.port, proto: r.proto, service: r.service, version: r.version }));
  }

  /**
   * Camera systems the player can actually watch: NVR hosts they hold the
   * required operator account on. Returned read-only for the CCTV app.
   */
  cctvSystems(): { hostId: string; hostname: string; org?: string; system: Host["cctv"] }[] {
    const out: { hostId: string; hostname: string; org?: string; system: Host["cctv"] }[] = [];
    for (const host of Object.values(this.world.hosts)) {
      if (!host.cctv) continue;
      const acc = this.player.accessByHost[host.id] ?? [];
      const need = host.cctv.requiresUser;
      if (need && !acc.includes(need) && !acc.includes("root")) continue;
      out.push({ hostId: host.id, hostname: host.hostname, org: host.org, system: host.cctv });
    }
    return out;
  }

  /** Serialize for persistence. */
  toSave(): SaveGame {
    return this.save;
  }
}
