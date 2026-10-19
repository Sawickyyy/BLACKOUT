// Game-facing terminal commands: missions, mission, wallet, store, buy, bank,
// hosts. These let the player drive the whole game from the terminal; the GUI
// mirrors the same data.

import { bankDeposit, bankWithdraw, buyItem, STORE } from "../../economy";
import { MISSIONS } from "../../missions/defs";
import { revealMissionHint } from "../../missions/engine";
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

const hint: CommandSpec = {
  name: "hint",
  summary: "kup wskazówkę do aktywnego zlecenia (koszt rośnie)",
  usage: "hint [numer|id zlecenia]",
  run: (ctx, io) => {
    const res = revealMissionHint(ctx.player, MISSIONS, io.argv[0]);
    if (!res.ok) return err(res.error ?? "Nie udało się pobrać wskazówki.");
    ctx.emit({ kind: "hint", data: { cost: res.cost } });
    const tail =
      res.remaining && res.remaining > 0
        ? `(pozostało wskazówek: ${res.remaining} — wpisz hint ponownie, kolejna będzie droższa)`
        : "(to była ostatnia wskazówka do tego zlecenia)";
    return ok(`💡 Wskazówka (−${res.cost} kr):\n   ${res.text}\n${tail}\n`);
  },
};

const TUTORIAL: Record<string, string> = {
  "": [
    "SAMOUCZEK BLACKNET  —  wpisz `tutorial <temat>`",
    "═══════════════════════════════════════════════",
    "Dostępne tematy:",
    "  tutorial potoki       — łączenie poleceń znakiem |",
    "  tutorial przekierowania — zapisywanie wyniku do pliku (> >> <)",
    "  tutorial zwiad        — jak znaleźć i zmapować host",
    "  tutorial dostep       — logowanie przez ssh",
    "",
    "Utknąłeś w zleceniu? Wpisz `hint`, aby dostać wskazówkę (za kredyty).",
  ].join("\n"),
  potoki: [
    "POTOKI  (pipe, znak |)",
    "──────────────────────",
    "Znak | przekazuje wynik jednego polecenia na wejście następnego.",
    "",
    "  cat /etc/passwd | grep root        # tylko wiersze z 'root'",
    "  ls -la | wc -l                      # policz pliki w katalogu",
    "  cat auth.log | grep Failed | sort | uniq   # unikalne nieudane logowania",
    "",
    "Każdy element potoku to osobne polecenie — łącz je dowolnie.",
  ].join("\n"),
  przekierowania: [
    "PRZEKIEROWANIA  ( >  >>  < )",
    "────────────────────────────",
    "  echo tekst > plik.txt      # zapisz wynik do pliku (nadpisuje)",
    "  echo wiersz >> plik.txt    # dopisz na końcu pliku",
    "  sha256sum < plik.txt       # podaj plik na wejście polecenia",
    "",
    "Łączenie z potokiem:",
    "  curl http://host/dane | grep token > token.txt",
    "",
    "Wiele zleceń wymaga zapisania znaleziska do pliku — użyj właśnie `>`.",
  ].join("\n"),
  zwiad: [
    "ZWIAD  (rozpoznanie celu)",
    "─────────────────────────",
    "  nslookup domena.example         # zamień nazwę na adres IP",
    "  ping -c3 host                   # sprawdź, czy host odpowiada",
    "  nmap -sV host                   # wykryj otwarte porty i wersje usług",
    "  curl http://host/               # pobierz stronę WWW",
    "",
    "Odkryte hosty pojawią się w aplikacji „Sieć” oraz w poleceniu `hosts`.",
  ].join("\n"),
  dostep: [
    "DOSTĘP  (logowanie ssh)",
    "───────────────────────",
    "  ssh uzytkownik@host --password 'hasło'",
    "",
    "Jeśli hasło zawiera znaki $ ! # — OBOWIĄZKOWO weź je w apostrofy '',",
    "inaczej powłoka potraktuje np. $Deploy jak zmienną i wyśle złe hasło.",
    "Po zalogowaniu polecenia działają na zdalnym hoście; `exit` wraca z powrotem.",
  ].join("\n"),
};

const tutorial: CommandSpec = {
  name: "tutorial",
  summary: "mini-kurs: potoki, przekierowania, zwiad, dostęp",
  usage: "tutorial [potoki|przekierowania|zwiad|dostep]",
  run: (_ctx, io) => {
    const topic = (io.argv[0] ?? "").toLowerCase().replace(/[łŁ]/g, "l");
    const page = TUTORIAL[topic];
    if (page === undefined) {
      return ok(TUTORIAL[""]! + `\n\n(nie znam tematu „${io.argv[0]}”)\n`);
    }
    return ok(page + "\n");
  },
};

const cameras: CommandSpec = {
  name: "cameras",
  summary: "lista kamer dostępnych na bieżącym hoście (NVR)",
  usage: "cameras",
  run: (ctx) => {
    const host = ctx.host;
    if (!host.cctv) return err("Na tym hoście nie ma systemu kamer.");
    const acc = ctx.player.accessByHost[host.id] ?? [];
    const need = host.cctv.requiresUser;
    if (need && !acc.includes(need) && !acc.includes("root")) {
      return err(`Brak dostępu do podglądu. Wymagane konto: ${need}.`);
    }
    const lines = [`KAMERY — ${host.cctv.label}`, "═".repeat(24)];
    host.cctv.feeds.forEach((f, i) => lines.push(`${String(i + 1).padStart(2)}. ${f.name}${f.zone ? `  (${f.zone})` : ""}`));
    lines.push("", "Podgląd obrazu otwórz w aplikacji CCTV (dock lub Ctrl+K → „CCTV”).");
    return ok(lines.join("\n") + "\n");
  },
};

export const gameCommands: CommandSpec[] = [missions, mission, wallet, store, buy, bank, hosts, hint, tutorial, cameras];
