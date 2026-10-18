// Game-facing terminal commands: missions, mission, wallet, store, buy, bank,
// hosts. These let the player drive the whole game from the terminal; the GUI
// mirrors the same data.

import { bankDeposit, bankWithdraw, buyItem, STORE } from "../../economy";
import { MISSIONS } from "../../missions/defs";
import type { MissionStatus } from "../../types";
import { parseArgs } from "./args";
import { err, ok, type CommandSpec } from "../context";

const STATUS_LABEL: Record<MissionStatus, string> = {
  locked: "🔒 zablokowana",
  available: "• dostępna",
  active: "▶ aktywna",
  completed: "✓ ukończona",
  failed: "✗ nieudana",
};

const missions: CommandSpec = {
  name: "missions",
  summary: "lista zleceń i ich status",
  usage: "missions",
  run: (ctx) => {
    const lines = ["ZLECENIA BLACKNET", "═════════════════"];
    // Narrow terminals (phones) get a compact layout that doesn't wrap.
    const narrow = (parseInt(ctx.session.env.COLUMNS ?? "80", 10) || 80) < 60;
    MISSIONS.forEach((m, i) => {
      const st = ctx.player.missions[m.id]?.status ?? (m.prereq?.length ? "locked" : "available");
      const num = `${String(i + 1).padStart(2)}.`;
      if (st === "locked") {
        lines.push(`${num} ${"█".repeat(6)} ${STATUS_LABEL[st]}`);
      } else if (narrow) {
        lines.push(`${num} ${m.title}`, `    ${STATUS_LABEL[st]} ${"★".repeat(m.difficulty)}`);
      } else {
        lines.push(`${num} ${m.title.padEnd(28)} ${STATUS_LABEL[st]}  [trud. ${m.difficulty}]`);
      }
    });
    lines.push("", narrow ? "Szczegóły: mission <nr>" : "Szczegóły: `mission <numer>`  (np. mission 2)");
    return ok(lines.join("\n") + "\n");
  },
};

const mission: CommandSpec = {
  name: "mission",
  summary: "szczegóły zlecenia",
  usage: "mission <numer|id>",
  run: (ctx, io) => {
    const arg = io.argv[0];
    if (!arg) return err("Użycie: mission <numer>  (zobacz `missions`)");
    const idx = /^\d+$/.test(arg) ? parseInt(arg, 10) - 1 : MISSIONS.findIndex((m) => m.id === arg);
    const m = MISSIONS[idx];
    if (!m) return err(`Nie znaleziono zlecenia: ${arg}`);
    const st = ctx.player.missions[m.id];
    const status = st?.status ?? (m.prereq?.length ? "locked" : "available");
    if (status === "locked") {
      const need = (m.prereq ?? [])
        .map((p) => MISSIONS.find((x) => x.id === p)?.title ?? p)
        .join(", ");
      return ok(`Zlecenie zablokowane. Najpierw ukończ: ${need}\n`);
    }
    const lines = [
      `╔═ ZLECENIE ${idx + 1}: ${m.title} ${"═".repeat(Math.max(0, 40 - m.title.length))}`,
      `║ Status: ${STATUS_LABEL[status]}   Trudność: ${"★".repeat(m.difficulty)}`,
      `║ Zleceniodawca: ${ctx.world.organizations[m.org ?? "self"]?.name ?? m.org ?? "—"}`,
      `╠${"─".repeat(50)}`,
      ...m.brief.split("\n").map((l) => `║ ${l}`),
      `╠${"─".repeat(50)}`,
      `║ Cele:`,
      ...m.objectives.map((o) => {
        const done = st?.objectives[o.id];
        return `║   [${done ? "x" : " "}] ${o.label}${o.optional ? " (opcjonalny)" : ""}`;
      }),
      `╠${"─".repeat(50)}`,
      `║ Nagroda: ${m.reward.credits ?? 0} kredytów` +
        (m.reward.unlockCapabilities?.length ? ` + narzędzia: ${m.reward.unlockCapabilities.join(", ")}` : ""),
      `╚${"═".repeat(50)}`,
    ];
    return ok(lines.join("\n") + "\n");
  },
};

const wallet: CommandSpec = {
  name: "wallet",
  summary: "portfel, konto, umiejętności i podejrzenia",
  usage: "wallet",
  run: (ctx) => {
    const p = ctx.player;
    const rep = Object.entries(p.reputationByOrg)
      .map(([o, v]) => `${ctx.world.organizations[o]?.name ?? o}: ${v > 0 ? "+" : ""}${v}`)
      .join(", ");
    const skills = Object.entries(p.skills)
      .map(([k, v]) => `${k} ${"▰".repeat(v)}${"▱".repeat(10 - v)}`)
      .join("\n  ");
    return ok(
      `PORTFEL\n` +
        `  Kredyty: ${p.credits}\n  Konto bankowe: ${p.bankBalance}\n\n` +
        `UMIEJĘTNOŚCI\n  ${skills}\n\n` +
        `POZIOM PODEJRZEŃ: ${p.suspicion.heat}/100\n` +
        `REPUTACJA: ${rep || "brak"}\n`,
    );
  },
};

const store: CommandSpec = {
  name: "store",
  summary: "sklep z narzędziami i sprzętem",
  usage: "store",
  run: (ctx) => {
    const lines = ["SKLEP BLACKNET", "══════════════"];
    for (const it of STORE) {
      const owned = ctx.player.inventory.some((i) => i.id === it.id);
      lines.push(
        `${it.id.padEnd(12)} ${String(it.price).padStart(5)} kr  ${owned ? "[POSIADANE]" : ""}`,
      );
      lines.push(`             ${it.description}`);
    }
    lines.push("", "Kup: `buy <id>`  (np. buy hydra)");
    return ok(lines.join("\n") + "\n");
  },
};

const buy: CommandSpec = {
  name: "buy",
  summary: "kup przedmiot ze sklepu",
  usage: "buy <id>",
  run: (ctx, io) => {
    const id = io.argv[0];
    if (!id) return err("Użycie: buy <id>  (zobacz `store`)");
    const res = buyItem(ctx.player, id);
    if (!res.ok) {
      const msg =
        res.reason === "unknown"
          ? `Nie ma takiego przedmiotu: ${id}`
          : res.reason === "owned"
            ? "Już posiadasz ten przedmiot."
            : "Za mało kredytów.";
      return err(msg);
    }
    ctx.emit({ kind: "buy", data: { id } });
    return ok(`Kupiono: ${res.item.name}. Pozostało ${res.balance} kredytów.\n`);
  },
};

const bank: CommandSpec = {
  name: "bank",
  summary: "operacje bankowe",
  usage: "bank <deposit|withdraw> <kwota>",
  run: (ctx, io) => {
    const { positionals } = parseArgs(io.argv);
    const [action, amountStr] = positionals;
    if (!action) {
      return ok(`Konto: ${ctx.player.bankBalance} kr   Portfel: ${ctx.player.credits} kr\n`);
    }
    const amount = parseInt(amountStr ?? "", 10);
    const res =
      action === "deposit" || action === "wplata"
        ? bankDeposit(ctx.player, amount)
        : action === "withdraw" || action === "wyplata"
          ? bankWithdraw(ctx.player, amount)
          : null;
    if (!res) return err("Użycie: bank <deposit|withdraw> <kwota>");
    if (!res.ok) return err(res.reason);
    return ok(`OK. Konto: ${res.balance} kr   Portfel: ${res.credits} kr\n`);
  },
};

const hosts: CommandSpec = {
  name: "hosts",
  summary: "odkryte hosty w sieci",
  usage: "hosts",
  run: (ctx) => {
    const lines = ["ODKRYTE HOSTY", "═════════════"];
    for (const id of ctx.player.discovered) {
      const h = ctx.world.hosts[id];
      if (!h) continue;
      const acc = ctx.player.accessByHost[id]?.length ? ` [dostęp: ${ctx.player.accessByHost[id]!.join(",")}]` : "";
      lines.push(`${h.ip.padEnd(16)} ${h.hostname}${acc}`);
    }
    return ok(lines.join("\n") + "\n");
  },
};

export const gameCommands: CommandSpec[] = [missions, mission, wallet, store, buy, bank, hosts];
