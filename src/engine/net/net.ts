// Simulated networking engine. Operates purely over WorldState: a flat
// fictional internet of hosts addressed by IPv4, with DNS, per-host firewalls,
// TCP/UDP service models, latency and packet loss. It NEVER contacts a real
// host — `curl`/`ping`/`ssh` resolve only against this in-memory world.

import type { DnsRecord, FirewallRule, Host, Service, WorldState } from "../types";

export interface PingResult {
  reachable: boolean;
  ip?: string;
  latencyMs: number;
  loss: number;
  ttl: number;
  reason?: string;
}

export interface Hop {
  ttl: number;
  ip: string;
  hostname?: string;
  latencyMs: number;
}

export interface PortResult {
  port: number;
  proto: "tcp" | "udp";
  state: "open" | "closed" | "filtered";
  service?: string;
  version?: string;
}

export interface ConnectResult {
  ok: boolean;
  service?: Service;
  reason?: "no-route" | "filtered" | "closed" | "refused";
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function isIpv4(s: string): boolean {
  const m = IPV4.exec(s);
  if (!m) return false;
  return m.slice(1).every((o) => Number(o) >= 0 && Number(o) <= 255);
}

/** Parse "a.b.c.d/n" into a predicate that tests membership. */
export function cidrContains(cidr: string, ip: string): boolean {
  const [base, bitsRaw] = cidr.split("/");
  if (!base || !bitsRaw || !isIpv4(base) || !isIpv4(ip)) return false;
  const bits = Number(bitsRaw);
  const toInt = (s: string) =>
    s.split(".").reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (toInt(base) & mask) === (toInt(ip) & mask);
}

export class Network {
  constructor(private world: WorldState) {}

  get hosts(): Host[] {
    return Object.values(this.world.hosts);
  }

  dnsRecords(): DnsRecord[] {
    return this.world.dns;
  }

  /** Resolve a name to an A record IP (following one CNAME hop). */
  resolve(name: string): string | undefined {
    if (isIpv4(name)) return name;
    const lower = name.toLowerCase();
    const cname = this.world.dns.find(
      (r) => r.type === "CNAME" && r.name.toLowerCase() === lower,
    );
    const target = cname ? cname.value.toLowerCase() : lower;
    const a = this.world.dns.find(
      (r) => r.type === "A" && r.name.toLowerCase() === target,
    );
    return a?.value;
  }

  reverseDns(ip: string): string | undefined {
    return this.world.dns.find((r) => r.type === "A" && r.value === ip)?.name;
  }

  mxRecords(domain: string): string[] {
    return this.world.dns
      .filter((r) => r.type === "MX" && r.name.toLowerCase() === domain.toLowerCase())
      .map((r) => r.value);
  }

  txtRecords(name: string): string[] {
    return this.world.dns
      .filter((r) => r.type === "TXT" && r.name.toLowerCase() === name.toLowerCase())
      .map((r) => r.value);
  }

  hostByIp(ip: string): Host | undefined {
    return this.hosts.find((h) => h.ip === ip);
  }

  hostByName(name: string): Host | undefined {
    const ip = this.resolve(name);
    return ip ? this.hostByIp(ip) : this.hosts.find((h) => h.hostname === name);
  }

  /** Resolve a target that may be a name or an IP into a Host. */
  target(nameOrIp: string): Host | undefined {
    if (isIpv4(nameOrIp)) return this.hostByIp(nameOrIp);
    return this.hostByName(nameOrIp);
  }

  private firewallDecision(
    host: Host,
    fromIp: string,
    port: number,
    proto: "tcp" | "udp",
  ): "allow" | "drop" | "reject" {
    for (const rule of host.firewall) {
      if (!matchRule(rule, fromIp, port, proto)) continue;
      return rule.action;
    }
    return "allow"; // default-allow unless a rule says otherwise
  }

  ping(from: Host, targetNameOrIp: string): PingResult {
    const ip = this.resolve(targetNameOrIp) ?? (isIpv4(targetNameOrIp) ? targetNameOrIp : undefined);
    if (!ip) return { reachable: false, latencyMs: 0, loss: 1, ttl: 0, reason: "nieznana nazwa" };
    const host = this.hostByIp(ip);
    if (!host) return { reachable: false, ip, latencyMs: 0, loss: 1, ttl: 0, reason: "brak trasy" };
    // ICMP modeled as port 0; a drop rule hides the host.
    const decision = this.firewallDecision(host, from.ip, 0, "udp");
    if (decision === "drop") {
      return { reachable: false, ip, latencyMs: 0, loss: 1, ttl: 0, reason: "filtrowane" };
    }
    const latency = Math.max(1, Math.round(host.latencyMs + from.latencyMs / 2));
    return {
      reachable: true,
      ip,
      latencyMs: latency,
      loss: host.packetLoss,
      ttl: 64 - hopCount(from, host),
    };
  }

  traceroute(from: Host, targetNameOrIp: string): Hop[] {
    const res = this.ping(from, targetNameOrIp);
    if (!res.ip) return [];
    const target = this.hostByIp(res.ip);
    const hops: Hop[] = [];
    let ttl = 1;
    // gateway hop(s)
    if (from.gateway && from.gateway !== res.ip) {
      const gw = this.hostByIp(from.gateway);
      hops.push({
        ttl: ttl++,
        ip: from.gateway,
        hostname: gw?.hostname,
        latencyMs: Math.max(1, Math.round(from.latencyMs / 2)),
      });
    }
    if (target) {
      hops.push({
        ttl: ttl,
        ip: target.ip,
        hostname: target.hostname,
        latencyMs: res.latencyMs,
      });
    }
    return hops;
  }

  /** TCP/UDP connect attempt respecting firewall + service open state. */
  connect(from: Host, target: Host, port: number, proto: "tcp" | "udp" = "tcp"): ConnectResult {
    const decision = this.firewallDecision(target, from.ip, port, proto);
    if (decision === "drop") return { ok: false, reason: "filtered" };
    if (decision === "reject") return { ok: false, reason: "refused" };
    const svc = target.services.find((s) => s.port === port && s.proto === proto);
    if (!svc || !svc.open) return { ok: false, reason: "closed" };
    return { ok: true, service: svc };
  }

  /** Scan a set of ports on a target. */
  scan(from: Host, target: Host, ports: number[], proto: "tcp" | "udp" = "tcp"): PortResult[] {
    return ports.map((port) => {
      const decision = this.firewallDecision(target, from.ip, port, proto);
      if (decision === "drop") return { port, proto, state: "filtered" as const };
      const svc = target.services.find((s) => s.port === port && s.proto === proto);
      if (decision === "reject") return { port, proto, state: "closed" as const };
      if (svc && svc.open) {
        return {
          port,
          proto,
          state: "open" as const,
          service: svc.kind,
          version: svc.product ? `${svc.product} ${svc.version ?? ""}`.trim() : undefined,
        };
      }
      return { port, proto, state: "closed" as const };
    });
  }

  /** HTTP GET against a simulated web service. */
  httpGet(
    from: Host,
    target: Host,
    path: string,
    port = 80,
  ): { status: number; body: string; headers: Record<string, string> } | { error: string } {
    const conn = this.connect(from, target, port);
    if (!conn.ok || !conn.service) {
      return { error: conn.reason === "filtered" ? "połączenie przekroczyło limit czasu" : "połączenie odrzucone" };
    }
    const svc = conn.service;
    const www = svc.www ?? {};
    const body = www[path] ?? www["/" + path.replace(/^\//, "")];
    if (body === undefined) {
      return {
        status: 404,
        body: `<html><head><title>404</title></head><body><h1>404 Not Found</h1><p>${path}</p></body></html>`,
        headers: { server: svc.banner, "content-type": "text/html" },
      };
    }
    return {
      status: 200,
      body,
      headers: { server: svc.banner, "content-type": "text/html; charset=utf-8" },
    };
  }
}

function matchRule(
  rule: FirewallRule,
  fromIp: string,
  port: number,
  proto: "tcp" | "udp",
): boolean {
  if (rule.from && rule.from !== "*") {
    if (rule.from.includes("/")) {
      if (!cidrContains(rule.from, fromIp)) return false;
    } else if (rule.from !== fromIp) return false;
  }
  if (rule.port !== undefined && rule.port !== port) return false;
  if (rule.proto !== undefined && rule.proto !== proto) return false;
  return true;
}

/** Cheap deterministic "distance" between two hosts for TTL display. */
function hopCount(from: Host, to: Host): number {
  if (from.id === to.id) return 0;
  return from.cidr === to.cidr ? 1 : 2;
}
