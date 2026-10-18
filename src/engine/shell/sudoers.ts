// Minimal sudoers parser + policy evaluation. Reads /etc/sudoers and any
// /etc/sudoers.d/* files from the host VFS and answers "may user U run
// command C as root?". Supports a practical subset:
//   deploy ALL=(ALL) NOPASSWD: /usr/bin/find, /bin/cat
//   %admin ALL=(ALL:ALL) ALL
// Not supported (documented): Cmnd_Alias, Runas lists beyond root, env opts.

import type { VFS, Principal } from "../fs/vfs";
import type { Host } from "../types";

export interface SudoRule {
  principal: string; // "deploy" or "%admin"
  commands: "ALL" | string[]; // absolute binary paths, or ALL
  nopasswd: boolean;
}

export function parseSudoers(text: string): SudoRule[] {
  const rules: SudoRule[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("Defaults")) continue;
    // user ALL=(runas) [NOPASSWD:] cmds
    const m = /^(\S+)\s+\S+=\(([^)]*)\)\s*(NOPASSWD:\s*)?(.+)$/.exec(line);
    if (!m) continue;
    const [, principal, , nopass, cmdsRaw] = m;
    const cmds = cmdsRaw!.trim();
    rules.push({
      principal: principal!,
      commands: cmds === "ALL" ? "ALL" : cmds.split(/\s*,\s*/).filter(Boolean),
      nopasswd: Boolean(nopass),
    });
  }
  return rules;
}

export function collectSudoers(host: Host, vfs: VFS): SudoRule[] {
  const rootP: Principal = { uid: 0, gid: 0, groups: [0] };
  const rules: SudoRule[] = [];
  try {
    rules.push(...parseSudoers(vfs.readFile("/etc/sudoers", rootP)));
  } catch {
    /* no main sudoers */
  }
  try {
    for (const name of vfs.readdir("/etc/sudoers.d", rootP)) {
      try {
        rules.push(...parseSudoers(vfs.readFile(`/etc/sudoers.d/${name}`, rootP)));
      } catch {
        /* skip */
      }
    }
  } catch {
    /* no sudoers.d */
  }
  return rules;
}

/** Rules that apply to a user, considering group memberships. */
export function rulesForUser(
  rules: SudoRule[],
  userName: string,
  groupNames: string[],
): SudoRule[] {
  return rules.filter((r) =>
    r.principal.startsWith("%") ? groupNames.includes(r.principal.slice(1)) : r.principal === userName,
  );
}

export function mayRun(rules: SudoRule[], binaryPath: string): boolean {
  return rules.some((r) => r.commands === "ALL" || r.commands.includes(binaryPath));
}

export function mayRunAll(rules: SudoRule[]): boolean {
  return rules.some((r) => r.commands === "ALL");
}
