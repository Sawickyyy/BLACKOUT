// `wifi` — a simulated wireless lab tool for the authorized home-network
// assessment. It models an adapter with a monitor mode, lists fictional access
// points, explains WPA2 vs WPA3, scores passphrase strength (a defensive
// meter), and joins a network when the player supplies the right passphrase —
// which for the weak lab network is deduced from OSINT clues, not captured or
// cracked. Assessment is limited to the network the engagement authorizes.

import { findNetwork, scorePassphrase, securityExplainer, signalBars } from "../../wifi";
import { parseArgs } from "./args";
import { err, ok, type CommandSpec, type ShellContext } from "../context";

const SECURITY_LABEL: Record<string, string> = {
  open: "OTWARTA",
  wep: "WEP",
  wpa2: "WPA2",
  wpa3: "WPA3",
  "wpa2-ent": "WPA2-Ent",
};

function bars(dbm: number): string {
  const n = signalBars(dbm);
  return "▂▄▆█".slice(0, n).padEnd(4, "·");
}

function status(ctx: ShellContext): string {
  const mon = ctx.player.wifiMonitor ? "monitor" : "zarządzany";
  const conn = ctx.player.wifiConnected ? `połączono: ${ctx.player.wifiConnected}` : "niepołączony";
  return `Adapter: wlan0 (lab)   Tryb: ${mon}   ${conn}`;
}

function scan(ctx: ShellContext): string {
  const nets = ctx.world.wifi ?? [];
  const lines = [
    "SSID                     BSSID              PASMO  KAN  SYGNAŁ  ZABEZP.",
    "──────────────────────────────────────────────────────────────────────",
  ];
  for (const n of [...nets].sort((a, b) => b.signal - a.signal)) {
    lines.push(
      `${n.ssid.padEnd(24)} ${n.bssid}  ${(n.band + "GHz").padEnd(6)} ${String(n.channel).padEnd(3)}  ` +
        `${bars(n.signal)} ${String(n.signal).padStart(4)}dBm  ${SECURITY_LABEL[n.security]}`,
    );
  }
  lines.push("", `Znaleziono sieci: ${nets.length}. Szczegóły: wifi analyze <SSID>`);
  return lines.join("\n");
}

const wifi: CommandSpec = {
  name: "wifi",
  summary: "laboratoryjny adapter Wi-Fi: skan, analiza, test hasła, połączenie",
  usage: "wifi <status|mon on|off|scan|analyze SSID|test HASŁO [SSID]|connect SSID HASŁO|devices|disconnect>",
  run: (ctx, io) => {
    const { positionals } = parseArgs(io.argv);
    const sub = (positionals[0] ?? "status").toLowerCase();
    const nets = ctx.world.wifi ?? [];

    if (sub === "status") return ok(status(ctx) + "\n");

    if (sub === "mon") {
      const on = (positionals[1] ?? "").toLowerCase();
      if (on !== "on" && on !== "off") return err("Użycie: wifi mon on|off");
      ctx.player.wifiMonitor = on === "on";
      ctx.emit({ kind: "wifi", data: { action: "mon", on: ctx.player.wifiMonitor } });
      return ok(`Tryb monitorowania ${ctx.player.wifiMonitor ? "włączony" : "wyłączony"} na wlan0.\n`);
    }

    if (sub === "scan") {
      if (!ctx.player.wifiMonitor) return err("Najpierw włącz tryb monitorowania: wifi mon on");
      ctx.emit({ kind: "wifi", data: { action: "scan" } });
      return ok(scan(ctx) + "\n");
    }

    if (sub === "analyze") {
      const net = findNetwork(nets, positionals[1] ?? "");
      if (!net) return err("Nie znaleziono sieci. Lista: wifi scan");
      const ex = securityExplainer(net.security);
      const lines = [
        `ANALIZA SIECI: ${net.ssid}`,
        "═".repeat(28),
        `Zabezpieczenie: ${ex.name}`,
        `  ${ex.summary}`,
        `  Ograniczenia: ${ex.limits}`,
        `Pasmo/kanał: ${net.band} GHz, kanał ${net.channel}   Sygnał: ${net.signal} dBm`,
        net.authorized ? "Zakres zlecenia: TAK — autoryzowana ocena." : "Zakres zlecenia: NIE — poza autoryzacją, nie testuj.",
      ];
      if (net.authorized && net.clues?.length) {
        lines.push("", "Ślady OSINT powiązane z tą siecią (z pakietu zlecenia):");
        for (const c of net.clues) lines.push(`  • ${c}`);
        lines.push("", "Wskazówka: słabe hasło często powstaje z takich danych. Sprawdź siłę: wifi test <hasło> " + net.ssid);
      }
      ctx.emit({ kind: "wifi", data: { action: "analyze", ssid: net.ssid } });
      return ok(lines.join("\n") + "\n");
    }

    if (sub === "test") {
      const pass = positionals[1];
      if (!pass) return err("Użycie: wifi test <hasło> [SSID]   (ocena siły, laboratorium)");
      const net = positionals[2] ? findNetwork(nets, positionals[2]) : undefined;
      const personal = net?.clues ?? [];
      const s = scorePassphrase(pass, personal);
      const meter = "█".repeat(s.score).padEnd(4, "░");
      ctx.emit({ kind: "wifi", data: { action: "test", score: s.score } });
      return ok(
        `TEST SIŁY HASŁA (laboratorium, offline)\n` +
          `  Hasło: ${"•".repeat(Math.min(pass.length, 24))} (${pass.length} znaków)\n` +
          `  Siła:  [${meter}] ${s.label}\n` +
          `  Odporność: ${s.resistance}\n` +
          `  Uwagi: ${s.reasons.join("; ")}\n`,
      );
    }

    if (sub === "connect") {
      const net = findNetwork(nets, positionals[1] ?? "");
      const pass = positionals[2];
      if (!net) return err("Nie znaleziono sieci. Lista: wifi scan");
      if (!net.authorized) return err(`Sieć ${net.ssid} jest poza zakresem zlecenia — łączenie zabronione.`);
      if (net.security === "open") {
        ctx.player.wifiConnected = net.ssid;
        return ok(`Połączono z otwartą siecią ${net.ssid}.\n`);
      }
      if (!pass) return err(`Użycie: wifi connect ${net.ssid} <hasło>`);
      if (net.security === "wpa3" && pass !== net.passphrase) {
        return err(
          `WPA3 (SAE) odrzuca zgadywanie offline: każda próba wymaga interakcji z siecią i jest ograniczana.\n` +
            `Nie da się odgadnąć tego hasła z danych OSINT — to właśnie zaleta WPA3.`,
        );
      }
      if (pass !== net.passphrase) return err("Nieprawidłowe hasło sieci.");
      ctx.player.wifiConnected = net.ssid;
      for (const id of net.lanHostIds ?? []) if (!ctx.player.discovered.includes(id)) ctx.player.discovered.push(id);
      ctx.emit({ kind: "wifi", data: { action: "connect", ssid: net.ssid } });
      return ok(
        `Połączono z ${net.ssid}. Przydzielono adres 192.168.1.50/24.\n` +
          `Urządzenia w sieci: wifi devices\n`,
      );
    }

    if (sub === "devices") {
      const ssid = ctx.player.wifiConnected;
      const net = ssid ? findNetwork(nets, ssid) : undefined;
      if (!net) return err("Najpierw połącz się z siecią: wifi connect <SSID> <hasło>");
      const ids = net.lanHostIds ?? [];
      if (!ids.length) return ok("Brak wykrytych urządzeń w tej sieci.\n");
      const lines = [`URZĄDZENIA W SIECI ${net.ssid}`, "═".repeat(28)];
      for (const id of ids) {
        const h = ctx.world.hosts[id];
        if (!h) continue;
        const acc = ctx.player.accessByHost[id]?.length ? "dostęp" : "wymaga logowania";
        lines.push(`${h.ip.padEnd(15)} ${h.hostname.padEnd(22)} ${acc}`);
      }
      lines.push("", "Każde urządzenie ma własne zabezpieczenia — połączenie z Wi-Fi to nie dostęp do nich.");
      lines.push("Skanuj i loguj się jak zwykle: nmap <ip>, ssh user@<ip>, curl http://<ip>/");
      return ok(lines.join("\n") + "\n");
    }

    if (sub === "disconnect") {
      ctx.player.wifiConnected = undefined;
      return ok("Rozłączono z siecią Wi-Fi.\n");
    }

    return err(`wifi: nieznana podkomenda „${sub}”. Zobacz: wifi (bez argumentów).`);
  },
};

export const wirelessCommands: CommandSpec[] = [wifi];
