// Security tooling available inside the sim: nmap (port/service scanner) and
// nc (netcat — banner grab / port check). These raise host suspicion because
// scanning is noisy, exactly as real IDS would observe. `nmap` requires the
// "nmap" capability (part of the starter kit); it is not a magic "hack" button.

import { parseArgs } from "./args";
import { err, ok, type CommandSpec } from "../context";

function expandPorts(spec: string | undefined): number[] {
  if (!spec) return [21, 22, 23, 25, 53, 80, 110, 143, 443, 445, 993, 3306, 3389, 5432, 8080, 8443];
  const out: number[] = [];
  for (const part of spec.split(",")) {
    const range = part.split("-");
    if (range.length === 2) {
      const a = parseInt(range[0]!, 10);
      const b = parseInt(range[1]!, 10);
      for (let p = a; p <= b && out.length < 1024; p++) out.push(p);
    } else {
      out.push(parseInt(part, 10));
    }
  }
  return out.filter((n) => Number.isFinite(n));
}

const nmap: CommandSpec = {
  name: "nmap",
  summary: "skaner portów i usług (symulowany)",
  usage: "nmap [-p PORTY] [-sV] cel",
  requires: "nmap",
  run: (ctx, io) => {
    const { flags, values, positionals } = parseArgs(io.argv, { valueFlags: ["p"] });
    const targetStr = positionals[0];
    if (!targetStr) return err("nmap: podaj cel");
    const target = ctx.net.target(targetStr);
    if (!target) return err(`nmap: nie można rozwiązać "${targetStr}": brak takiego hosta`);

    const ports = expandPorts(values.p);
    const results = ctx.net.scan(ctx.host, target, ports);
    ctx.emit({
      kind: "scan",
      hostId: target.id,
      data: { ports: ports.length, portsScanned: ports },
    });
    if (!ctx.player.discovered.includes(target.id)) ctx.player.discovered.push(target.id);

    const open = results.filter((r) => r.state === "open");
    const header =
      `Starting Nmap ( BLACKNET ) at ${new Date(ctx.nowTs()).toISOString()}\n` +
      `Nmap scan report for ${targetStr} (${target.ip})\n` +
      `Host is up (${(target.latencyMs / 1000).toFixed(3)}s latency).\n`;
    if (!open.length) {
      const filtered = results.filter((r) => r.state === "filtered").length;
      return ok(
        header +
          (filtered
            ? `All ${results.length} scanned ports are filtered\n`
            : `All ${results.length} scanned ports are closed\n`),
      );
    }
    const rows = ["PORT      STATE  SERVICE     VERSION"];
    for (const r of open) {
      const portLabel = `${r.port}/${r.proto}`.padEnd(9);
      const svc = (r.service ?? "unknown").padEnd(11);
      const ver = flags.has("sV") && r.version ? r.version : "";
      rows.push(`${portLabel} open   ${svc} ${ver}`.trimEnd());
    }
    rows.push("", `Nmap done: 1 IP address (1 host up) scanned`);
    return ok(header + rows.join("\n") + "\n");
  },
};

const nc: CommandSpec = {
  name: "nc",
  summary: "netcat — połącz z portem i pobierz baner",
  usage: "nc [-z] host port",
  run: (ctx, io) => {
    const { flags, positionals } = parseArgs(io.argv);
    const host = positionals[0];
    const port = positionals[1] ? parseInt(positionals[1], 10) : NaN;
    if (!host || !Number.isFinite(port)) return err("nc: użycie: nc [-z] host port");
    const target = ctx.net.target(host);
    if (!target) return err(`nc: ${host}: Name or service not known`, 1);
    const conn = ctx.net.connect(ctx.host, target, port);
    ctx.emit({ kind: "connect", hostId: target.id, data: { port } });
    if (!conn.ok || !conn.service) {
      if (conn.reason === "filtered") return err(`nc: connect to ${host} port ${port} (tcp) timed out`, 1);
      return err(`nc: connect to ${host} port ${port} (tcp) failed: Connection refused`, 1);
    }
    if (!ctx.player.discovered.includes(target.id)) ctx.player.discovered.push(target.id);
    if (flags.has("z")) return ok(`Connection to ${host} ${port} port [tcp] succeeded!\n`);
    return ok(conn.service.banner + "\n");
  },
};

export const secCommands: CommandSpec[] = [nmap, nc];
