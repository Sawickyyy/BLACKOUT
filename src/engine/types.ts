// Core domain types for the BLACKNET simulation. Everything here is
// serializable so a complete game can be persisted to and restored from
// PostgreSQL/Supabase (or localStorage as a fallback).

import type { VDir } from "./fs/vfs";

export interface VUser {
  uid: number;
  gid: number;
  name: string;
  /** Simulated password hash (sha256 of a fictional password). Never a real one. */
  passwordHash?: string;
  /** Plain fictional password, used only so missions can "crack" it in-sim. */
  passwordPlain?: string;
  home: string;
  shell: string;
  groups: number[];
}

export interface VGroup {
  gid: number;
  name: string;
  members: string[];
}

export type ServiceKind =
  | "ssh"
  | "http"
  | "https"
  | "ftp"
  | "smtp"
  | "dns"
  | "mysql"
  | "postgres"
  | "telnet"
  | "rdp"
  | "custom";

export interface Service {
  port: number;
  proto: "tcp" | "udp";
  kind: ServiceKind;
  /** Banner string returned on connect, e.g. "OpenSSH 8.9p1". */
  banner: string;
  /** Product/version for enumeration output. */
  product?: string;
  version?: string;
  open: boolean;
  /** For http(s): path -> body served by a curl/wget. */
  www?: Record<string, string>;
  /** Credentials accepted by this service (fictional). */
  creds?: { user: string; password: string }[];
}

export interface FirewallRule {
  /** Match source — "*" for any. */
  from?: string;
  port?: number;
  proto?: "tcp" | "udp";
  action: "allow" | "drop" | "reject";
}

export interface LogEntry {
  ts: number;
  facility: "auth" | "kernel" | "daemon" | "ids" | "web" | "firewall";
  message: string;
}

/** A timestamped happening on a camera's timeline (seconds into a looping day). */
export interface CameraEvent {
  /** Seconds into the 24h loop (0..86399) when this becomes visible. */
  at: number;
  /** How long the happening stays on screen, in seconds. */
  duration: number;
  /** What the operator notes in the event log. */
  label: string;
  /** A concrete detail drawn into the frame (plate, code, face tag) to be found. */
  detail?: string;
}

/** A single simulated CCTV feed. Rendered procedurally — no real footage. */
export interface CameraFeed {
  id: string;
  name: string;
  /** Picks the procedural backdrop drawn on the canvas. */
  scene: "parking" | "lobby" | "server" | "dock" | "corridor" | "offline";
  /** Area/zone label shown in the on-screen overlay. */
  zone?: string;
  events: CameraEvent[];
}

/** A network video recorder exposing a set of feeds once the player has access. */
export interface CameraSystem {
  label: string;
  /** Account on this host the player must hold to open the live view. */
  requiresUser?: string;
  feeds: CameraFeed[];
}

export interface Host {
  id: string;
  hostname: string;
  /** Primary IPv4 address on the simulated internet. */
  ip: string;
  /** Subnet in CIDR form, e.g. "10.0.5.0/24". */
  cidr: string;
  gateway?: string;
  os: string;
  /** Owning organization id. */
  org?: string;
  users: VUser[];
  groups: VGroup[];
  services: Service[];
  firewall: FirewallRule[];
  logs: LogEntry[];
  /** Simulated link quality to this host. */
  latencyMs: number;
  packetLoss: number; // 0..1
  /** Root of this host's filesystem. */
  fs: VDir;
  /** Intrusion-detection sensitivity 0..1; higher reacts to fewer events. */
  idsSensitivity: number;
  /** Whether the player currently holds a shell here and as which user. */
  reachable?: boolean;
  /** Optional camera subsystem (NVR hosts) viewable in the CCTV app. */
  cctv?: CameraSystem;
  /**
   * The simulated administrator has locked the host down after too much noise:
   * the player's traffic is filtered and logins refused until suspicion cools.
   * Reversible — cleared once the host's heat drops back down.
   */
  lockdown?: boolean;
}

export interface DnsRecord {
  name: string;
  type: "A" | "CNAME" | "MX" | "TXT" | "NS";
  value: string;
}

export interface Organization {
  id: string;
  name: string;
  kind: "tech" | "bank" | "university" | "hosting" | "gov" | "underground" | "news" | "isp";
  description: string;
  /** Reputation the player holds with this org, -100..100. */
  reputation: number;
}

export interface SkillSet {
  recon: number;
  exploitation: number;
  crypto: number;
  forensics: number;
  social: number;
  stealth: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  kind: "software" | "hardware" | "license" | "subscription";
  description: string;
  /** Capability flag this item unlocks, e.g. "nmap", "hydra". */
  unlocks?: string;
}

export interface Transaction {
  id: string;
  ts: number;
  amount: number; // positive = credit, negative = debit
  balanceAfter: number;
  memo: string;
}

export type MissionStatus = "locked" | "available" | "active" | "completed" | "failed";

export interface MissionState {
  id: string;
  status: MissionStatus;
  /** Objective id -> done. */
  objectives: Record<string, boolean>;
  startedAt?: number;
  completedAt?: number;
}

export interface SuspicionState {
  /** Global heat 0..100 across the world. */
  heat: number;
  /** Per-host suspicion scores keyed by host id. */
  byHost: Record<string, number>;
}

export interface PlayerState {
  username: string;
  /** The host the player's own machine is. */
  localHostId: string;
  /** Current shell session (host + user + cwd), serializable. */
  session: SessionState;
  credits: number;
  bankBalance: number;
  skills: SkillSet;
  reputationByOrg: Record<string, number>;
  inventory: InventoryItem[];
  transactions: Transaction[];
  missions: Record<string, MissionState>;
  suspicion: SuspicionState;
  /** Capabilities unlocked (command/tool names available). */
  capabilities: string[];
  /** Hosts the player has discovered (ids). */
  discovered: string[];
  /** Hosts to which the player holds credentials: hostId -> username[] */
  accessByHost: Record<string, string[]>;
  settings: GameSettings;
  terminalHistory: string[];
  /** How many hints the player has unlocked per mission (paid, escalating). */
  hintsUsed?: Record<string, number>;
  /** Whether the first-run tutorial prompt has been shown. */
  tutorialSeen?: boolean;
  /** Camera feeds the player has actually opened, as "hostId:feedId" keys. */
  cctvViewed?: string[];
  /** Whether the lab Wi-Fi adapter is in monitor mode (flavor/realism). */
  wifiMonitor?: boolean;
  /** SSID of the simulated network the player is currently joined to. */
  wifiConnected?: string;
  /** Operator notebook: auto-collected findings + the player's own notes. */
  notebook?: NotebookEntry[];
  createdAt: number;
  updatedAt: number;
}

/** A line in the operator's notebook. Auto entries come from the engine. */
export interface NotebookEntry {
  id: string;
  ts: number;
  kind: "host" | "credential" | "flag" | "note";
  text: string;
  /** True for entries the engine recorded automatically. */
  auto?: boolean;
}

export interface SessionState {
  hostId: string;
  uid: number;
  cwd: string;
  env: Record<string, string>;
  /** SSH stack — each entry is a host we tunneled from, enabling `exit`. */
  stack: { hostId: string; uid: number; cwd: string }[];
}

export interface GameSettings {
  theme: "green" | "amber" | "blue";
  crt: boolean;
  reducedMotion: boolean;
  fontSize: number;
}

/** Wi-Fi security scheme a simulated access point advertises. */
export type WifiSecurity = "open" | "wep" | "wpa2" | "wpa3" | "wpa2-ent";

/**
 * A simulated wireless access point. Entirely fictional — there is no radio,
 * no capture and no cracking; joining a weak network is a deduction puzzle
 * (the passphrase is guessable from OSINT clues) and the lab tooling only
 * SCORES passphrase strength to teach why weak ones fail. `passphrase` is a
 * made-up lab value, never a real credential.
 */
export interface WifiNetwork {
  ssid: string;
  bssid: string;
  band: "2.4" | "5";
  channel: number;
  /** Signal strength in dBm (e.g. -45 strong, -82 weak). */
  signal: number;
  security: WifiSecurity;
  /** Owning organization id (for authorized-lab framing). */
  org?: string;
  /** Fictional passphrase for a lab network the player may deduce and join. */
  passphrase?: string;
  /** OSINT-style clues that make a weak passphrase guessable. */
  clues?: string[];
  /** Hosts reachable only while joined to this network (home-LAN devices). */
  lanHostIds?: string[];
  /** True for the single network the engagement authorizes assessing. */
  authorized?: boolean;
}

export interface WorldState {
  hosts: Record<string, Host>;
  dns: DnsRecord[];
  organizations: Record<string, Organization>;
  /** Simulated wireless access points in range of the lab adapter. */
  wifi?: WifiNetwork[];
  /** Monotonic simulated clock offset, kept for deterministic tests. */
  seed: number;
}

/** The full persisted save. */
export interface SaveGame {
  version: number;
  player: PlayerState;
  world: WorldState;
}
