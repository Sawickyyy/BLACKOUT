// System commands: whoami, id, uname, hostname, date, uptime, env, export,
// echo, clear, history, ps, top, kill, jobs.

import { parseArgs } from "./args";
import { err, ok, type CommandSpec, type ShellContext } from "../context";

const whoami: CommandSpec = {
  name: "whoami",
  summary: "wypisz nazwę bieżącego użytkownika",
  usage: "whoami",
  run: (ctx) => ok(ctx.user.name + "\n"),
};

const id: CommandSpec = {
  name: "id",
  summary: "pokaż tożsamość użytkownika i grupy",
  usage: "id [użytkownik]",
  run: (ctx, io) => {
    const { positionals } = parseArgs(io.argv);
    const u = positionals[0] ? ctx.getUser(positionals[0]) : ctx.user;
    if (!u) return err(`id: ${positionals[0]}: brak takiego użytkownika`);
    const groups = [u.gid, ...u.groups.filter((g) => g !== u.gid)];
    const groupStr = groups
      .map((g) => `${g}(${ctx.host.groups.find((x) => x.gid === g)?.name ?? g})`)
      .join(",");
    const primaryGroup = ctx.host.groups.find((x) => x.gid === u.gid)?.name ?? u.gid;
    return ok(`uid=${u.uid}(${u.name}) gid=${u.gid}(${primaryGroup}) groups=${groupStr}\n`);
  },
};

const uname: CommandSpec = {
  name: "uname",
  summary: "informacje o systemie",
  usage: "uname [-a] [-r] [-s]",
  run: (ctx, io) => {
    const { flags } = parseArgs(io.argv);
    const sys = "Linux";
    const node = ctx.host.hostname;
    const release = "5.15.0-blacknet";
    const version = "#1 SMP BLACKNET";
    const machine = "x86_64";
    if (flags.has("a"))
      return ok(`${sys} ${node} ${release} ${version} ${machine} GNU/Linux\n`);
    if (flags.has("r")) return ok(release + "\n");
    if (flags.has("n")) return ok(node + "\n");
    if (flags.has("m")) return ok(machine + "\n");
    return ok(sys + "\n");
  },
};

const hostname: CommandSpec = {
  name: "hostname",
  summary: "pokaż nazwę hosta",
  usage: "hostname",
  run: (ctx) => ok(ctx.host.hostname + "\n"),
};

const date: CommandSpec = {
  name: "date",
  summary: "pokaż bieżącą datę i czas",
  usage: "date",
  run: (ctx) => {
    const d = new Date(ctx.nowTs());
    return ok(d.toString() + "\n");
  },
};

const uptime: CommandSpec = {
  name: "uptime",
  summary: "czas pracy systemu",
  usage: "uptime",
  run: (ctx) => {
    // Derive a stable uptime from host id hash.
    const h = [...ctx.host.id].reduce((a, c) => a + c.charCodeAt(0), 0);
    const days = (h % 40) + 1;
    const load = ((h % 100) / 100 + 0.1).toFixed(2);
    const time = new Date(ctx.nowTs());
    const hhmm = `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;
    return ok(
      ` ${hhmm} up ${days} days,  load average: ${load}, ${(Number(load) + 0.05).toFixed(2)}, ${(Number(load) + 0.02).toFixed(2)}\n`,
    );
  },
};

const env: CommandSpec = {
  name: "env",
  summary: "wypisz zmienne środowiskowe",
  usage: "env",
  run: (ctx) =>
    ok(
      Object.entries(ctx.session.env)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n") + "\n",
    ),
};

const exportCmd: CommandSpec = {
  name: "export",
  summary: "ustaw zmienną środowiskową",
  usage: "export NAZWA=wartość",
  run: (ctx, io) => {
    if (!io.argv.length) return env.run(ctx, io);
    for (const a of io.argv) {
      const eq = a.indexOf("=");
      if (eq === -1) continue;
      const name = a.slice(0, eq);
      const value = a.slice(eq + 1);
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return err(`export: '${name}': nieprawidłowa nazwa`);
      ctx.session.env[name] = value;
    }
    return ok();
  },
};

const echo: CommandSpec = {
  name: "echo",
  summary: "wypisz tekst",
  usage: "echo [-n] [tekst...]",
  run: (_ctx, io) => {
    const noNewline = io.argv[0] === "-n";
    const args = noNewline ? io.argv.slice(1) : io.argv;
    return ok(args.join(" ") + (noNewline ? "" : "\n"));
  },
};

const printf: CommandSpec = {
  name: "printf",
  summary: "sformatuj i wypisz tekst",
  usage: 'printf FORMAT [argumenty...]',
  run: (_ctx, io) => {
    if (!io.argv.length) return ok("");
    const fmt = io.argv[0]!;
    const args = io.argv.slice(1);
    const unescaped = fmt
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\r/g, "\r")
      .replace(/\\\\/g, "\\");
    let ai = 0;
    const out = unescaped.replace(/%[sd]/g, () => args[ai++] ?? "");
    return ok(out);
  },
};

const trueCmd: CommandSpec = {
  name: "true",
  summary: "zwróć sukces (kod 0)",
  usage: "true",
  run: () => ok(),
};

const falseCmd: CommandSpec = {
  name: "false",
  summary: "zwróć niepowodzenie (kod 1)",
  usage: "false",
  run: () => ({ stdout: "", stderr: "", code: 1 }),
};

const clear: CommandSpec = {
  name: "clear",
  summary: "wyczyść ekran terminala",
  usage: "clear",
  // ANSI clear + home; xterm.js honors this.
  run: () => ok("\x1b[2J\x1b[3J\x1b[H"),
};

const history: CommandSpec = {
  name: "history",
  summary: "pokaż historię poleceń",
  usage: "history [-c]",
  run: (ctx, io) => {
    const { flags } = parseArgs(io.argv);
    if (flags.has("c")) {
      ctx.player.terminalHistory = [];
      return ok();
    }
    const lines = ctx.player.terminalHistory.map((h, i) => `${String(i + 1).padStart(5)}  ${h}`);
    return ok(lines.join("\n") + (lines.length ? "\n" : ""));
  },
};

/** Build a believable process table for the current host. */
function processTable(ctx: ShellContext): { pid: number; user: string; cpu: string; mem: string; cmd: string }[] {
  const base = [
    { cmd: "/sbin/init", user: "root" },
    { cmd: "[kthreadd]", user: "root" },
    { cmd: "/lib/systemd/systemd-journald", user: "root" },
    { cmd: "/usr/sbin/cron -f", user: "root" },
    { cmd: "/usr/sbin/rsyslogd -n", user: "syslog" },
  ];
  const svcProcs = ctx.host.services
    .filter((s) => s.open)
    .map((s) => ({
      cmd:
        s.kind === "ssh"
          ? "/usr/sbin/sshd -D"
          : s.kind === "http" || s.kind === "https"
            ? "/usr/sbin/nginx -g daemon off;"
            : s.kind === "mysql"
              ? "/usr/sbin/mysqld"
              : s.kind === "postgres"
                ? "postgres: main"
                : `/usr/bin/${s.kind}d`,
      user: s.kind === "mysql" ? "mysql" : s.kind === "postgres" ? "postgres" : "root",
    }));
  const userProcs = [
    { cmd: `-${ctx.user.shell.split("/").pop() ?? "bash"}`, user: ctx.user.name },
    { cmd: "ps aux", user: ctx.user.name },
  ];
  const all = [...base, ...svcProcs, ...userProcs];
  let pid = 1;
  const seed = [...ctx.host.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  return all.map((p, i) => {
    pid += (seed + i * 7) % 300;
    return {
      pid,
      user: p.user,
      cpu: (((seed + i) % 30) / 10).toFixed(1),
      mem: (((seed + i * 3) % 50) / 10).toFixed(1),
      cmd: p.cmd,
    };
  });
}

const ps: CommandSpec = {
  name: "ps",
  summary: "pokaż procesy",
  usage: "ps [aux]",
  run: (ctx, io) => {
    const table = processTable(ctx);
    const showAll = io.argv.join("").includes("a") || io.argv.length === 0;
    const rows = showAll ? table : table.filter((p) => p.user === ctx.user.name);
    const header = "USER       PID %CPU %MEM COMMAND";
    const lines = rows.map(
      (p) =>
        `${p.user.padEnd(10)} ${String(p.pid).padStart(4)} ${p.cpu.padStart(4)} ${p.mem.padStart(4)} ${p.cmd}`,
    );
    return ok([header, ...lines].join("\n") + "\n");
  },
};

const top: CommandSpec = {
  name: "top",
  summary: "migawka obciążenia systemu (nieinteraktywna)",
  usage: "top",
  run: (ctx, io) => {
    const table = processTable(ctx).sort((a, b) => Number(b.cpu) - Number(a.cpu));
    const now = new Date(ctx.nowTs());
    const head =
      `top - ${now.toTimeString().slice(0, 8)} up, 1 user\n` +
      `Tasks: ${table.length} total\n` +
      `%Cpu(s): ${table[0]?.cpu ?? "0.0"} us\n\n` +
      `  PID USER      %CPU %MEM COMMAND`;
    const lines = table.map(
      (p) =>
        `${String(p.pid).padStart(5)} ${p.user.padEnd(9)} ${p.cpu.padStart(4)} ${p.mem.padStart(4)} ${p.cmd}`,
    );
    return ok([head, ...lines].join("\n") + "\n");
  },
};

const kill: CommandSpec = {
  name: "kill",
  summary: "wyślij sygnał do procesu",
  usage: "kill [-9] PID",
  run: (ctx, io) => {
    const { positionals } = parseArgs(io.argv);
    const pidStr = positionals.find((p) => /^\d+$/.test(p));
    if (!pidStr) return err("kill: użycie: kill [-sygnał] PID");
    const pid = Number(pidStr);
    const table = processTable(ctx);
    const proc = table.find((p) => p.pid === pid);
    if (!proc) return err(`kill: (${pid}): brak takiego procesu`);
    if (proc.user !== ctx.user.name && ctx.principal.uid !== 0)
      return err(`kill: (${pid}): operacja niedozwolona`);
    ctx.emit({ kind: "kill", hostId: ctx.host.id, data: { pid } });
    return ok();
  },
};

const jobs: CommandSpec = {
  name: "jobs",
  summary: "pokaż zadania powłoki",
  usage: "jobs",
  run: () => ok(""),
};

/** `last` — reconstruct recent logins from the host's auth.log. */
const last: CommandSpec = {
  name: "last",
  summary: "pokaż ostatnie logowania (z auth.log)",
  usage: "last [-n liczba]",
  run: (ctx, io) => {
    const { values } = parseArgs(io.argv, { valueFlags: ["n"] });
    const limit = values.n ? parseInt(values.n, 10) || 10 : 10;
    let log = "";
    try {
      log = ctx.vfs.readFile("/var/log/auth.log", ctx.principal);
    } catch {
      return err("last: nie można odczytać /var/log/wtmp");
    }
    const rows = log
      .split("\n")
      .filter((l) => /Accepted password for/.test(l))
      .map((l) => {
        const m = /Accepted password for (\S+) from (\S+)/.exec(l);
        const ts = l.slice(0, 19).replace("T", " ");
        return m ? `${m[1]!.padEnd(10)} ${m[2]!.padEnd(16)} ${ts}` : null;
      })
      .filter((x): x is string => !!x);
    const tail = rows.slice(-limit).reverse();
    return ok((tail.length ? tail.join("\n") : "brak zapisanych logowań") + "\n");
  },
};

/** `crontab -l` — list scheduled jobs from /etc/cron.d + the user's crontab. */
const crontab: CommandSpec = {
  name: "crontab",
  summary: "pokaż zaplanowane zadania (cron)",
  usage: "crontab -l",
  run: (ctx, io) => {
    if (!io.argv.includes("-l")) return ok("Użycie: crontab -l\n");
    const out: string[] = [];
    try {
      const dir = ctx.vfs.readdir("/etc/cron.d", ctx.principal);
      for (const name of dir) {
        try {
          const body = ctx.vfs.readFile(`/etc/cron.d/${name}`, ctx.principal).trim();
          if (body) out.push(`# /etc/cron.d/${name}`, body);
        } catch {
          /* unreadable entry */
        }
      }
    } catch {
      /* no cron.d */
    }
    return ok((out.length ? out.join("\n") : "brak zaplanowanych zadań") + "\n");
  },
};

/** `systemctl status` — a believable view of running services from open ports. */
const systemctl: CommandSpec = {
  name: "systemctl",
  summary: "stan usług systemowych (symulowany)",
  usage: "systemctl status [usługa]",
  run: (ctx, io) => {
    const { positionals } = parseArgs(io.argv);
    if (positionals[0] !== "status") return ok("Użycie: systemctl status [usługa]\n");
    const MAP: Record<string, string> = { ssh: "ssh", http: "nginx", https: "nginx", ftp: "vsftpd", dns: "named", mysql: "mysql", postgres: "postgresql" };
    const units = ctx.host.services
      .filter((s) => s.open)
      .map((s) => ({ unit: `${MAP[s.kind] ?? s.kind}.service`, banner: s.banner, port: s.port }));
    const filter = positionals[1];
    const shown = filter ? units.filter((u) => u.unit.includes(filter)) : units;
    if (!shown.length) return ok("Brak pasujących usług.\n");
    const lines = shown.map(
      (u) => `● ${u.unit} — ${u.banner}\n   Active: active (running)   Nasłuch: :${u.port}`,
    );
    return ok(lines.join("\n") + "\n");
  },
};

export const systemCommands: CommandSpec[] = [
  whoami,
  id,
  uname,
  hostname,
  date,
  uptime,
  env,
  exportCmd,
  echo,
  printf,
  trueCmd,
  falseCmd,
  clear,
  history,
  ps,
  top,
  kill,
  jobs,
  last,
  crontab,
  systemctl,
];
