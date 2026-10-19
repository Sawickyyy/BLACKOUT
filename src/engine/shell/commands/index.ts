// Assembles the full command registry and adds the introspection commands
// (man, help, which, whereis) that need to see the whole registry.

import { ok, err, type CommandRegistry, type CommandSpec } from "../context";
import { fsCommands } from "./fs";
import { systemCommands } from "./system";
import { netCommands } from "./net";
import { utilCommands } from "./util";
import { secCommands } from "./sec";
import { gameCommands } from "./game";
import { wirelessCommands } from "./wireless";

// Longer-form manual pages for the most important commands. Commands without
// an entry fall back to a generated page from their summary + usage.
const MANUALS: Record<string, string> = {
  ls:
    "NAZWA\n    ls - wypisz zawartość katalogu\n\nSKŁADNIA\n    ls [-l] [-a] [-h] [ścieżka...]\n\nOPIS\n    -l  długi format (uprawnienia, właściciel, rozmiar, data)\n    -a  pokaż pliki ukryte (zaczynające się od kropki)\n    -h  rozmiary czytelne dla człowieka\n",
  grep:
    "NAZWA\n    grep - wyszukaj wzorzec\n\nSKŁADNIA\n    grep [-i] [-n] [-v] [-r] WZORZEC [PLIK...]\n\nOPIS\n    -i  ignoruj wielkość liter\n    -n  pokaż numery wierszy\n    -v  odwróć dopasowanie\n    -r  przeszukuj rekurencyjnie\n\nKOD WYJŚCIA\n    0 gdy znaleziono dopasowanie, 1 gdy nie.\n",
  chmod:
    "NAZWA\n    chmod - zmień uprawnienia\n\nSKŁADNIA\n    chmod TRYB PLIK...\n\nPRZYKŁAD\n    chmod 640 tajne.txt   # rw- r-- ---\n    chmod 755 skrypt.sh   # rwx r-x r-x\n",
  ssh:
    "NAZWA\n    ssh - zdalne logowanie (symulowane)\n\nSKŁADNIA\n    ssh [użytkownik@]host [-p port] [--password HASŁO]\n\nOPIS\n    Jeśli masz już poświadczenia do danego konta (zdobyte w misji lub\n    przez znalezione hasło), logowanie zadziała bez hasła. W przeciwnym\n    razie podaj hasło przez --password. Po zalogowaniu wszystkie komendy\n    działają na zdalnym hoście; 'exit' wraca do poprzedniego.\n",
  nmap:
    "NAZWA\n    nmap - skaner portów i usług\n\nSKŁADNIA\n    nmap [-p PORTY] [-sV] CEL\n\nOPIS\n    -p  lista/zakres portów, np. -p 22,80,443 lub -p 1-1024\n    -sV wykrywaj wersje usług\n\nUWAGA\n    Skanowanie jest hałaśliwe i podnosi poziom podejrzeń hosta (IDS).\n",
};

function buildIntrospection(registry: CommandRegistry): CommandSpec[] {
  const man: CommandSpec = {
    name: "man",
    summary: "pokaż podręcznik polecenia",
    usage: "man polecenie",
    run: (_ctx, io) => {
      const name = io.argv[0];
      if (!name) return err("Jakiej strony podręcznika szukasz?\nUżycie: man polecenie");
      if (MANUALS[name]) return ok(MANUALS[name]!);
      const spec = registry.get(name);
      if (!spec) return err(`Brak wpisu podręcznika dla ${name}`);
      return ok(
        `NAZWA\n    ${spec.name} - ${spec.summary}\n\nSKŁADNIA\n    ${spec.usage}\n`,
      );
    },
  };

  const help: CommandSpec = {
    name: "help",
    summary: "pokaż listę dostępnych poleceń",
    usage: "help [polecenie]",
    run: (ctx, io) => {
      const name = io.argv[0];
      if (name) {
        const spec = registry.get(name);
        if (!spec) return err(`help: brak pomocy dla ${name}`);
        return ok(`${spec.name} - ${spec.summary}\nUżycie: ${spec.usage}\n`);
      }
      const names = [...registry.keys()]
        .filter((n) => {
          const spec = registry.get(n)!;
          return !spec.requires || ctx.hasCapability(spec.requires);
        })
        .sort();
      // Fit the column grid to the terminal width (COLUMNS is set by the UI).
      const width = parseInt(ctx.session.env.COLUMNS ?? "80", 10) || 80;
      const cols = Math.max(2, Math.min(6, Math.floor(width / 12)));
      const rows: string[] = [];
      for (let i = 0; i < names.length; i += cols) {
        rows.push(names.slice(i, i + cols).map((n) => n.padEnd(12)).join(""));
      }
      return ok(
        `BLACKNET — dostępne polecenia (man <polecenie> po szczegóły):\n\n${rows.join("\n")}\n\n` +
          `Wskazówki: TAB uzupełnia, strzałki ↑/↓ przeglądają historię, '|' łączy komendy,\n` +
          `'>' zapisuje wynik do pliku. Zacznij od: help, ls, cat README.txt, missions\n`,
      );
    },
  };

  const which: CommandSpec = {
    name: "which",
    summary: "pokaż ścieżkę polecenia",
    usage: "which polecenie...",
    run: (ctx, io) => {
      const out: string[] = [];
      let code = 0;
      for (const n of io.argv) {
        const spec = registry.get(n);
        if (spec && (!spec.requires || ctx.hasCapability(spec.requires))) {
          out.push(`/usr/bin/${n}`);
        } else code = 1;
      }
      return { stdout: out.join("\n") + (out.length ? "\n" : ""), stderr: "", code };
    },
  };

  const whereis: CommandSpec = {
    name: "whereis",
    summary: "zlokalizuj binarkę i podręcznik polecenia",
    usage: "whereis polecenie...",
    run: (_ctx, io) => {
      const out = io.argv.map((n) =>
        registry.has(n) ? `${n}: /usr/bin/${n} /usr/share/man/man1/${n}.1` : `${n}:`,
      );
      return ok(out.join("\n") + (out.length ? "\n" : ""));
    },
  };

  return [man, help, which, whereis];
}

export function buildRegistry(): CommandRegistry {
  const registry: CommandRegistry = new Map();
  const all: CommandSpec[] = [
    ...fsCommands,
    ...systemCommands,
    ...netCommands,
    ...utilCommands,
    ...secCommands,
    ...gameCommands,
    ...wirelessCommands,
  ];
  for (const cmd of all) registry.set(cmd.name, cmd);
  for (const cmd of buildIntrospection(registry)) registry.set(cmd.name, cmd);
  return registry;
}

/** All command names, for autocomplete + documentation. */
export function commandNames(registry: CommandRegistry): string[] {
  return [...registry.keys()].sort();
}
