// Builds a believable Linux host from a compact init object: generates the
// base FS skeleton, /etc/passwd + /etc/group + /etc/shadow (fictional hashes),
// per-user home directories and /var/log entries, then grafts custom files.

import { makeDir, makeFile, type VDir } from "../fs/vfs";
import type { FirewallRule, Host, LogEntry, Service, VGroup, VUser } from "../types";
import { sha256 } from "../util/hash";
import { buildTree, graft, type TreeSpec } from "./fsbuilder";

export interface HostInit {
  id: string;
  hostname: string;
  ip: string;
  cidr: string;
  gateway?: string;
  os?: string;
  org?: string;
  users: VUser[];
  groups?: VGroup[];
  services?: Service[];
  firewall?: FirewallRule[];
  latencyMs?: number;
  packetLoss?: number;
  idsSensitivity?: number;
  /** Extra files grafted onto the root, e.g. { var: { www: { 'index.html': '...' } } }. */
  files?: TreeSpec;
  /** Per-username home directory contents. */
  homes?: Record<string, TreeSpec>;
  logs?: LogEntry[];
  motd?: string;
}

const DEFAULT_GROUPS: VGroup[] = [
  { gid: 0, name: "root", members: ["root"] },
  { gid: 1000, name: "users", members: [] },
];

function passwdFile(users: VUser[]): string {
  const base = [
    "root:x:0:0:root:/root:/bin/bash",
    "daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin",
    "www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin",
    "sshd:x:110:65534::/run/sshd:/usr/sbin/nologin",
  ];
  const extra = users
    .filter((u) => u.uid !== 0)
    .map((u) => `${u.name}:x:${u.uid}:${u.gid}:${u.name}:${u.home}:${u.shell}`);
  return base.concat(extra).join("\n") + "\n";
}

function groupFile(groups: VGroup[]): string {
  return (
    groups.map((g) => `${g.name}:x:${g.gid}:${g.members.join(",")}`).join("\n") + "\n"
  );
}

function shadowFile(users: VUser[]): string {
  // Fictional sha512-style field; we store a sha256 of the fictional password
  // so forensics missions can "match" it, never a real credential.
  return (
    users
      .map((u) => {
        const hash = u.passwordPlain ? `$6$blacknet$${sha256(u.passwordPlain).slice(0, 43)}` : "*";
        return `${u.name}:${hash}:19000:0:99999:7:::`;
      })
      .join("\n") + "\n"
  );
}

function defaultBashrc(user: string): string {
  return (
    `# ~/.bashrc dla ${user}\n` +
    `export PS1='\\u@\\h:\\w\\$ '\n` +
    `alias ll='ls -la'\n` +
    `alias ..='cd ..'\n`
  );
}

export function linuxHost(init: HostInit): Host {
  const groups = init.groups ?? DEFAULT_GROUPS;
  const root: VDir = buildTree({
    bin: {},
    sbin: {},
    lib: {},
    opt: {},
    tmp: {},
    run: {},
    usr: { bin: {}, sbin: {}, share: { man: { man1: {} } }, local: { bin: {} } },
    var: { log: {}, www: {}, spool: {}, lib: {} },
    etc: {
      hostname: init.hostname + "\n",
      hosts: `127.0.0.1\tlocalhost\n${init.ip}\t${init.hostname}\n`,
      "os-release": `PRETTY_NAME="${init.os ?? "Debian GNU/Linux 12 (bookworm)"}"\nNAME="BLACKNET Linux"\nID=debian\n`,
      passwd: passwdFile(init.users),
      group: groupFile(groups),
      shadow: { content: shadowFile(init.users), mode: 0o600, uid: 0, gid: 0 },
      motd: init.motd ?? `\nWitaj na ${init.hostname}.\nNieautoryzowany dostęp jest monitorowany.\n`,
    },
    root: {},
    home: {},
  });

  // tighten /tmp to sticky-ish world-writable
  (root.children.tmp as VDir).mode = 0o1777;
  (root.children.root as VDir).mode = 0o700;

  // Home directories
  for (const u of init.users) {
    if (u.uid === 0) {
      // root's home is /root
      graft(root, ["root", ".bashrc"], makeFile(defaultBashrc("root"), 0, 0, 0o644));
      continue;
    }
    const homeParts = u.home.replace(/^\//, "").split("/");
    const homeDir = makeDir(u.uid, u.gid, 0o750);
    homeDir.children[".bashrc"] = makeFile(defaultBashrc(u.name), u.uid, u.gid, 0o644);
    graft(root, homeParts, homeDir);
  }

  // Per-user home contents
  if (init.homes) {
    for (const [uname, spec] of Object.entries(init.homes)) {
      const u = init.users.find((x) => x.name === uname);
      if (!u) continue;
      const sub = buildTree(spec, u.uid, u.gid, 0o750);
      const homeParts = u.home.replace(/^\//, "").split("/");
      // merge into existing home dir
      for (const [cname, cnode] of Object.entries(sub.children)) {
        graft(root, [...homeParts, cname], cnode);
      }
    }
  }

  // Extra files
  if (init.files) {
    const extra = buildTree(init.files, 0, 0);
    mergeInto(root, extra);
  }

  // Logs
  const logs = init.logs ?? [];
  const authLines = logs
    .filter((l) => l.facility === "auth")
    .map((l) => `${new Date(l.ts).toISOString()} ${init.hostname} sshd: ${l.message}`)
    .join("\n");
  if (authLines) {
    graft(root, ["var", "log", "auth.log"], makeFile(authLines + "\n", 0, 0, 0o640));
  }
  const sysLines = logs
    .filter((l) => l.facility !== "auth")
    .map((l) => `${new Date(l.ts).toISOString()} ${init.hostname} ${l.facility}: ${l.message}`)
    .join("\n");
  if (sysLines) {
    graft(root, ["var", "log", "syslog"], makeFile(sysLines + "\n", 0, 0, 0o640));
  }

  return {
    id: init.id,
    hostname: init.hostname,
    ip: init.ip,
    cidr: init.cidr,
    gateway: init.gateway,
    os: init.os ?? "Debian GNU/Linux 12",
    org: init.org,
    users: init.users,
    groups,
    services: init.services ?? [],
    firewall: init.firewall ?? [],
    logs,
    latencyMs: init.latencyMs ?? 20,
    packetLoss: init.packetLoss ?? 0,
    idsSensitivity: init.idsSensitivity ?? 0.3,
    fs: root,
  };
}

function mergeInto(target: VDir, source: VDir): void {
  for (const [name, node] of Object.entries(source.children)) {
    const existing = target.children[name];
    if (existing && existing.type === "dir" && node.type === "dir") {
      mergeInto(existing, node);
    } else {
      target.children[name] = node;
    }
  }
}

/** Convenience to declare a user. */
export function user(
  name: string,
  uid: number,
  opts: { gid?: number; groups?: number[]; password?: string; home?: string; shell?: string } = {},
): VUser {
  return {
    name,
    uid,
    gid: opts.gid ?? uid,
    groups: opts.groups ?? [],
    passwordPlain: opts.password,
    passwordHash: opts.password ? sha256(opts.password) : undefined,
    home: opts.home ?? (uid === 0 ? "/root" : `/home/${name}`),
    shell: opts.shell ?? "/bin/bash",
  };
}

/** Convenience to declare a service. */
export function svc(
  port: number,
  kind: Service["kind"],
  banner: string,
  opts: Partial<Service> = {},
): Service {
  return {
    port,
    proto: opts.proto ?? "tcp",
    kind,
    banner,
    product: opts.product,
    version: opts.version,
    open: opts.open ?? true,
    www: opts.www,
    creds: opts.creds,
  };
}
