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
  createdAt: number;
  updatedAt: number;
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

export interface WorldState {
  hosts: Record<string, Host>;
  dns: DnsRecord[];
  organizations: Record<string, Organization>;
  /** Monotonic simulated clock offset, kept for deterministic tests. */
  seed: number;
}

/** The full persisted save. */
export interface SaveGame {
  version: number;
  player: PlayerState;
  world: WorldState;
}
