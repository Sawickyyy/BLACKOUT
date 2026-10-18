// Networking commands: ip, ifconfig, ping, traceroute, netstat, ss, nslookup,
// dig, curl, wget, ssh, scp, sftp. These drive the simulated Network engine
// and (for ssh/scp) mutate the session to hop between virtual hosts. They
// never touch a real network.

import { VFS, type Principal } from "../../fs/vfs";
import { isIpv4 } from "../../net/net";
import type { Host, VUser } from "../../types";
import { parseArgs } from "./args";
import { err, ok, type CommandSpec, type ShellContext } from "../context";

function principalFor(u: VUser): Principal {
  return { uid: u.uid, gid: u.gid, groups: [u.gid, ...u.groups] };
}

function commonPorts(): number[] {
  return [21, 22, 23, 25, 53, 80, 110, 143, 443, 445, 993, 995, 3306, 3389, 5432, 8080, 8443];
}

const ip: CommandSpec = {
  name: "ip",
  summary: "pokaż konfigurację sieci",
  usage: "ip addr | ip route",
  run: (ctx, io) => {
    const sub = io.argv[0] ?? "addr";
    if (sub.startsWith("r")) {
      const gw = ctx.host.gateway;
      return ok(
        `default via ${gw ?? "0.0.0.0"} dev eth0\n` +
          `${ctx.host.cidr} dev eth0 proto kernel scope link src ${ctx.host.ip}\n`,
      );
    }
    return ok(
      `1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536\n` +
        `    inet 127.0.0.1/8 scope host lo\n` +
        `2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500\n` +
        `    inet ${ctx.host.ip}/${ctx.host.cidr.split("/")[1]} brd scope global eth0\n`,
    );
  },
};

const ifconfig: CommandSpec = {
  name: "ifconfig",
  summary: "konfiguracja interfejsów (klasyczna)",
  usage: "ifconfig",
  run: (ctx) =>
    ok(
      `eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500\n` +
        `        inet ${ctx.host.ip}  netmask 255.255.255.0\n` +
        `        ether 52:54:00:${Math.abs(hash(ctx.host.id) % 90 + 10)}:aa:bb  txqueuelen 1000\n` +
        `lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536\n` +
        `        inet 127.0.0.1  netmask 255.0.0.0\n`,
    ),
};

function hash(s: string): number {
  return [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
}

const ping: CommandSpec = {
  name: "ping",
  summary: "sprawdź osiągalność hosta (ICMP symulowane)",
  usage: "ping [-c N] host",
  run: (ctx, io) => {
    const { values, positionals } = parseArgs(io.argv, { valueFlags: ["c"] });
    const host = positionals[0];
    if (!host) return err("ping: brak hosta");
    const count = values.c ? Math.min(10, parseInt(values.c, 10)) : 4;
    const res = ctx.net.ping(ctx.host, host);
    ctx.emit({ kind: "ping", hostId: targetId(ctx, host), data: { host } });
    if (!res.reachable) {
      const dest = res.ip ?? host;
      return {
        stdout: `PING ${host} (${dest}): 56 data bytes\n`,
        stderr:
          res.reason === "nieznana nazwa"
            ? `ping: cannot resolve ${host}: Unknown host\n`
            : `From ${ctx.host.ip}: Destination Host Unreachable\n` +
              `--- ${host} ping statistics ---\n${count} packets transmitted, 0 received, 100% packet loss\n`,
        code: 1,
      };
    }
    const lines = [`PING ${host} (${res.ip}): 56 data bytes`];
    let received = 0;
    for (let i = 0; i < count; i++) {
      // deterministic loss based on seq + host loss
      const lost = ((hash(ctx.host.id + i) % 100) / 100) < res.loss;
      if (lost) continue;
      received++;
      const jitter = (hash(ctx.host.id + "p" + i) % 20) / 10;
      lines.push(
        `64 bytes from ${res.ip}: icmp_seq=${i} ttl=${res.ttl} time=${(res.latencyMs + jitter).toFixed(1)} ms`,
      );
    }
    const loss = Math.round(((count - received) / count) * 100);
    lines.push(``, `--- ${host} ping statistics ---`);
    lines.push(`${count} packets transmitted, ${received} received, ${loss}% packet loss`);
    return ok(lines.join("\n") + "\n");
  },
};

function targetId(ctx: ShellContext, nameOrIp: string): string | undefined {
  return ctx.net.target(nameOrIp)?.id;
}

const traceroute: CommandSpec = {
  name: "traceroute",
  summary: "śledź trasę do hosta",
  usage: "traceroute host",
  run: (ctx, io) => {
    const host = io.argv[0];
    if (!host) return err("traceroute: brak hosta");
    const hops = ctx.net.traceroute(ctx.host, host);
    if (!hops.length) return err(`traceroute: nie można rozwiązać ${host}`);
    const lines = [`traceroute to ${host}, 30 hops max`];
    hops.forEach((h) => {
      lines.push(
        ` ${h.ttl}  ${h.hostname ?? h.ip} (${h.ip})  ${h.latencyMs.toFixed(2)} ms`,
      );
    });
    return ok(lines.join("\n") + "\n");
  },
};

const netstat: CommandSpec = {
  name: "netstat",
  summary: "pokaż połączenia i nasłuchujące porty",
  usage: "netstat [-tuln]",
  run: (ctx) => {
    const lines = ["Active Internet connections (servers)", "Proto Local Address           State"];
    for (const s of ctx.host.services.filter((x) => x.open)) {
      lines.push(
        `${s.proto.padEnd(5)} ${(ctx.host.ip + ":" + s.port).padEnd(22)} LISTEN`,
      );
    }
    return ok(lines.join("\n") + "\n");
  },
};

const ss: CommandSpec = {
  name: "ss",
  summary: "statystyki gniazd (nowoczesny netstat)",
  usage: "ss [-tuln]",
  run: (ctx) => {
    const lines = ["Netid State  Local Address:Port"];
    for (const s of ctx.host.services.filter((x) => x.open)) {
      lines.push(`${s.proto}   LISTEN ${ctx.host.ip}:${s.port}`);
    }
    return ok(lines.join("\n") + "\n");
  },
};

const nslookup: CommandSpec = {
  name: "nslookup",
  summary: "zapytanie DNS",
  usage: "nslookup nazwa",
  run: (ctx, io) => {
    const name = io.argv[0];
    if (!name) return err("nslookup: brak nazwy");
    if (isIpv4(name)) {
      const rev = ctx.net.reverseDns(name);
      return ok(
        `Server:\t\t10.0.0.1\nAddress:\t10.0.0.1#53\n\n` +
          (rev ? `${name}.in-addr.arpa\tname = ${rev}\n` : `** brak rekordu PTR dla ${name}\n`),
      );
    }
    const ip = ctx.net.resolve(name);
    ctx.emit({ kind: "dns", data: { name } });
    if (!ip) return err(`** server can't find ${name}: NXDOMAIN`);
    return ok(
      `Server:\t\t10.0.0.1\nAddress:\t10.0.0.1#53\n\nName:\t${name}\nAddress: ${ip}\n`,
    );
  },
};

const dig: CommandSpec = {
  name: "dig",
  summary: "szczegółowe zapytanie DNS",
  usage: "dig nazwa [typ]",
  run: (ctx, io) => {
    const name = io.argv[0];
    const type = (io.argv[1] ?? "A").toUpperCase();
    if (!name) return err("dig: brak nazwy");
    ctx.emit({ kind: "dns", data: { name, type } });
    const answers: string[] = [];
    if (type === "A") {
      const ip = ctx.net.resolve(name);
      if (ip) answers.push(`${name}.\t300\tIN\tA\t${ip}`);
    } else if (type === "MX") {
      ctx.net.mxRecords(name).forEach((v, i) => answers.push(`${name}.\t300\tIN\tMX\t${10 + i * 10} ${v}.`));
    } else if (type === "TXT") {
      ctx.net.txtRecords(name).forEach((v) => answers.push(`${name}.\t300\tIN\tTXT\t"${v}"`));
    }
    const header =
      `; <<>> DiG 9.18 <<>> ${name} ${type}\n` +
      `;; status: ${answers.length ? "NOERROR" : "NXDOMAIN"}, ANSWER: ${answers.length}\n\n` +
      `;; QUESTION SECTION:\n;${name}.\t\tIN\t${type}\n`;
    const ans = answers.length ? `\n;; ANSWER SECTION:\n${answers.join("\n")}\n` : "\n";
    return ok(header + ans);
  },
};

interface ParsedUrl {
  host: string;
  port: number;
  path: string;
  scheme: string;
}
function parseUrl(raw: string): ParsedUrl | null {
  let scheme = "http";
  let rest = raw;
  const m = /^(\w+):\/\//.exec(raw);
  if (m) {
    scheme = m[1]!;
    rest = raw.slice(m[0].length);
  }
  const slash = rest.indexOf("/");
  const authority = slash === -1 ? rest : rest.slice(0, slash);
  const path = slash === -1 ? "/" : rest.slice(slash);
  const [host, portStr] = authority.split(":");
  if (!host) return null;
  const port = portStr ? parseInt(portStr, 10) : scheme === "https" ? 443 : 80;
  return { host, port, path, scheme };
}

const curl: CommandSpec = {
  name: "curl",
  summary: "pobierz zasób HTTP z symulowanego serwera",
  usage: "curl [-s] [-I] [-o plik] URL",
  run: (ctx, io) => {
    const { flags, values, positionals } = parseArgs(io.argv, { valueFlags: ["o"] });
    const raw = positionals[0];
    if (!raw) return err("curl: brak adresu URL");
    const url = parseUrl(raw);
    if (!url) return err(`curl: nie można przetworzyć URL: ${raw}`);
    const target = ctx.net.target(url.host);
    if (!target) return err(`curl: (6) Could not resolve host: ${url.host}`, 6);
    const res = ctx.net.httpGet(ctx.host, target, url.path, url.port);
    ctx.emit({ kind: "http", hostId: target.id, data: { url: raw, path: url.path } });
    if ("error" in res) return err(`curl: (7) ${res.error}`, 7);
    if (!ctx.player.discovered.includes(target.id)) ctx.player.discovered.push(target.id);
    const headerBlock =
      `HTTP/1.1 ${res.status} ${res.status === 200 ? "OK" : "Not Found"}\n` +
      Object.entries(res.headers)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n") +
      "\n";
    if (flags.has("I")) return ok(headerBlock);
    if (values.o) {
      try {
        ctx.vfs.writeFile(ctx.resolve(values.o), res.body, ctx.principal);
        return ok();
      } catch (e) {
        return err(`curl: nie można zapisać: ${(e as Error).message}`);
      }
    }
    return ok(res.body + (res.body.endsWith("\n") ? "" : "\n"));
  },
};

const wget: CommandSpec = {
  name: "wget",
  summary: "pobierz plik z symulowanego serwera",
  usage: "wget [-O plik] URL",
  run: (ctx, io) => {
    const { values, positionals } = parseArgs(io.argv, { valueFlags: ["O"] });
    const raw = positionals[0];
    if (!raw) return err("wget: brak adresu URL");
    const url = parseUrl(raw);
    if (!url) return err(`wget: nieprawidłowy URL: ${raw}`);
    const target = ctx.net.target(url.host);
    if (!target) return err(`wget: unable to resolve host address '${url.host}'`);
    const res = ctx.net.httpGet(ctx.host, target, url.path, url.port);
    ctx.emit({ kind: "http", hostId: target.id, data: { url: raw } });
    if ("error" in res) return err(`wget: ${res.error}`);
    const fname = values.O ?? (url.path.split("/").pop() || "index.html");
    try {
      ctx.vfs.writeFile(ctx.resolve(fname), res.body, ctx.principal);
    } catch (e) {
      return err(`wget: ${(e as Error).message}`);
    }
    return ok(
      `--  ${raw}\nRozwiązywanie ${url.host}... ${target.ip}\n` +
        `Połączono. Odpowiedź HTTP: ${res.status}\nZapisano w: '${fname}' (${res.body.length} B)\n`,
    );
  },
};

const ssh: CommandSpec = {
  name: "ssh",
  summary: "zdalne logowanie do hosta (symulowane)",
  usage: "ssh [użytkownik@]host [-p port] [--password HASŁO]",
  run: (ctx, io) => {
    const { values, positionals } = parseArgs(io.argv, {
      valueFlags: ["p"],
      longValueFlags: ["password"],
    });
    const spec = positionals[0];
    if (!spec) return err("ssh: brak hosta");
    const at = spec.indexOf("@");
    const username = at === -1 ? ctx.user.name : spec.slice(0, at);
    const hostStr = at === -1 ? spec : spec.slice(at + 1);
    const port = values.p ? parseInt(values.p, 10) : 22;

    const target = ctx.net.target(hostStr);
    if (!target) return err(`ssh: Could not resolve hostname ${hostStr}`, 255);
    if (target.id === ctx.host.id) return err(`ssh: connect to host ${hostStr}: już zalogowany`, 255);

    const conn = ctx.net.connect(ctx.host, target, port);
    if (!conn.ok) {
      const msg =
        conn.reason === "filtered"
          ? "Connection timed out"
          : conn.reason === "refused"
            ? "Connection refused"
            : "Connection refused";
      return err(`ssh: connect to host ${hostStr} port ${port}: ${msg}`, 255);
    }

    const remoteUser = target.users.find((u) => u.name === username);
    if (!remoteUser) {
      ctx.emit({ kind: "login_fail", hostId: target.id, data: { user: username } });
      return err(`${username}@${hostStr}: Permission denied (publickey,password).`, 255);
    }

    const alreadyHasAccess = (ctx.player.accessByHost[target.id] ?? []).includes(username);
    const providedPassword = values.password;
    const passwordOk =
      providedPassword !== undefined &&
      (providedPassword === remoteUser.passwordPlain ||
        (conn.service?.creds ?? []).some((c) => c.user === username && c.password === providedPassword));

    if (!alreadyHasAccess && !passwordOk) {
      ctx.emit({ kind: "login_fail", hostId: target.id, data: { user: username, port } });
      return err(`${username}@${hostStr}: Permission denied (publickey,password).`, 255);
    }

    // success — hop
    ctx.session.stack.push({ hostId: ctx.session.hostId, uid: ctx.session.uid, cwd: ctx.session.cwd });
    ctx.session.hostId = target.id;
    ctx.session.uid = remoteUser.uid;
    ctx.session.cwd = remoteUser.home;
    ctx.session.env.PWD = remoteUser.home;
    ctx.session.env.HOME = remoteUser.home;
    ctx.session.env.USER = remoteUser.name;
    ctx.session.env.HOSTNAME = target.hostname;

    // record access + discovery
    const acc = ctx.player.accessByHost[target.id] ?? [];
    if (!acc.includes(username)) acc.push(username);
    ctx.player.accessByHost[target.id] = acc;
    if (!ctx.player.discovered.includes(target.id)) ctx.player.discovered.push(target.id);
    ctx.emit({ kind: "login_ok", hostId: target.id, data: { user: username } });

    const motd = readMotd(target, remoteUser);
    return ok(
      (passwordOk ? `${username}@${hostStr}'s password: \n` : "") +
        motd +
        `\nOstatnie logowanie: ${new Date(ctx.nowTs()).toUTCString()}\n`,
    );
  },
};

function readMotd(host: Host, user: VUser): string {
  try {
    const vfs = new VFS(host.fs);
    const motd = vfs.readFile("/etc/motd", principalFor(user));
    return motd;
  } catch {
    return `Witaj na ${host.hostname}`;
  }
}

const scp: CommandSpec = {
  name: "scp",
  summary: "kopiuj plik między hostami (symulowane)",
  usage: "scp [użytkownik@]host: zdalna_ścieżka cel",
  run: (ctx, io) => {
    const { positionals } = parseArgs(io.argv);
    if (positionals.length < 2) return err("scp: użycie: scp źródło cel");
    const [src, dst] = [positionals[0]!, positionals[1]!];
    const remoteSpec = src.includes(":") ? src : dst.includes(":") ? dst : null;
    if (!remoteSpec) return err("scp: brak zdalnej ścieżki (host:ścieżka)");
    const download = src.includes(":");
    const colon = remoteSpec.indexOf(":");
    const authority = remoteSpec.slice(0, colon);
    const remotePath = remoteSpec.slice(colon + 1);
    const at = authority.indexOf("@");
    const username = at === -1 ? ctx.user.name : authority.slice(0, at);
    const hostStr = at === -1 ? authority : authority.slice(at + 1);

    const target = ctx.net.target(hostStr);
    if (!target) return err(`scp: ssh: Could not resolve hostname ${hostStr}`, 1);
    if (!(ctx.player.accessByHost[target.id] ?? []).includes(username))
      return err(`${username}@${hostStr}: Permission denied (publickey,password).`, 1);
    const remoteUser = target.users.find((u) => u.name === username);
    if (!remoteUser) return err("scp: brak użytkownika", 1);

    const remoteVfs = new VFS(target.fs);
    const remotePrincipal = principalFor(remoteUser);
    try {
      if (download) {
        const content = remoteVfs.readFile(remotePath, remotePrincipal);
        const localDest = ctx.resolve(dst === remoteSpec ? "." : dst);
        const finalPath = ctx.vfs.exists(localDest, ctx.principal) &&
          ctx.vfs.stat(localDest, ctx.principal).node.type === "dir"
          ? `${localDest}/${remotePath.split("/").pop()}`
          : localDest;
        ctx.vfs.writeFile(finalPath, content, ctx.principal);
        ctx.emit({ kind: "scp", hostId: target.id, data: { remotePath, dir: "download" } });
        return ok(`${remotePath.split("/").pop()}   100%  ${content.length}B\n`);
      } else {
        const content = ctx.vfs.readFile(ctx.resolve(src), ctx.principal);
        remoteVfs.writeFile(remotePath, content, remotePrincipal);
        ctx.emit({ kind: "scp", hostId: target.id, data: { remotePath, dir: "upload" } });
        return ok(`${src.split("/").pop()}   100%  ${content.length}B\n`);
      }
    } catch (e) {
      return err(`scp: ${(e as Error).message}`, 1);
    }
  },
};

const sftp: CommandSpec = {
  name: "sftp",
  summary: "interaktywny transfer plików (w tej symulacji: podpowiedź)",
  usage: "sftp użytkownik@host",
  run: () =>
    ok(
      "sftp: w tej symulacji użyj 'scp użytkownik@host:/ścieżka cel' do transferu plików.\n",
    ),
};

export const netCommands: CommandSpec[] = [
  ip,
  ifconfig,
  ping,
  traceroute,
  netstat,
  ss,
  nslookup,
  dig,
  curl,
  wget,
  ssh,
  scp,
  sftp,
];
