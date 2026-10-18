// Shared types for shell commands. A command receives a ShellContext (a view
// over the current host + session + world) and an IO bundle (argv + stdin),
// and returns stdout/stderr/exit code. Commands mutate game state through the
// context's helpers so missions and detection systems can observe every action.

import type { Network } from "../net/net";
import type { Host, PlayerState, SessionState, VUser, WorldState } from "../types";
import type { Principal, VFS } from "../fs/vfs";

export interface CommandResult {
  stdout: string;
  stderr: string;
  code: number;
}

export function ok(stdout = ""): CommandResult {
  return { stdout, stderr: "", code: 0 };
}

export function err(stderr: string, code = 1): CommandResult {
  return { stdout: "", stderr, code };
}

export interface GameEvent {
  kind: string;
  hostId?: string;
  data?: Record<string, unknown>;
}

export interface ShellContext {
  world: WorldState;
  player: PlayerState;
  /** The host the command runs on (follows ssh). */
  host: Host;
  vfs: VFS;
  session: SessionState;
  principal: Principal;
  user: VUser;
  net: Network;
  /** Resolve a path against the session cwd. */
  resolve(p: string): string;
  /** Look up a user on the current host by uid or name. */
  getUser(uidOrName: number | string): VUser | undefined;
  /** Record a semantic game event (consumed by missions + detection). */
  emit(ev: GameEvent): void;
  /** Whether a tool/capability is unlocked for the player. */
  hasCapability(name: string): boolean;
  nowTs(): number;
}

export interface CommandSpec {
  name: string;
  summary: string;
  usage: string;
  /** Capability required to run (e.g. "nmap"); undefined = always available. */
  requires?: string;
  run(ctx: ShellContext, io: { argv: string[]; stdin: string }): CommandResult;
}

export type CommandRegistry = Map<string, CommandSpec>;
