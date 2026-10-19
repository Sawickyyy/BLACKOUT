# BLACKNET — Symulator Hakera

BLACKNET to realistyczna, trwała gra-symulator hakera działająca w przeglądarce.
Grasz w **fikcyjnym, całkowicie odizolowanym internecie**: obsługujesz prawdziwy
terminal uniksowy, prowadzisz rozpoznanie sieci, wykonujesz edukacyjne misje
cyberbezpieczeństwa, zdobywasz nagrody i wracasz później z zachowanym postępem.

> ⚠️ **Wszystkie systemy, sieci, organizacje i podatności w grze są wymyślone.**
> Silnik sieciowy to wewnętrzna symulacja — żadne polecenie nie opuszcza gry i
> nie dotyka prawdziwej infrastruktury. Wirtualny shell nigdy nie wykonuje
> poleceń na serwerze wdrożeniowym. Adresy IP pochodzą z zakresów
> dokumentacyjnych (RFC 5737) i prywatnych (RFC 1918).

---

## Spis treści
- [Najważniejsze cechy](#najważniejsze-cechy)
- [Stos technologiczny](#stos-technologiczny)
- [Architektura](#architektura)
- [Szybki start](#szybki-start)
- [Testy](#testy)
- [Jak grać](#jak-grać)
- [Zaimplementowane polecenia](#zaimplementowane-polecenia)
- [Czego celowo NIE zaimplementowano](#czego-celowo-nie-zaimplementowano)
- [Autozapis](#autozapis)
- [Model bezpieczeństwa i zaufania](#model-bezpieczeństwa-i-zaufania)
- [Wdrożenie](#wdrożenie)

---

## Najważniejsze cechy

- **Prawdziwy parser powłoki** — tokenizacja, potoki (`|`), przekierowania
  (`>`, `>>`, `<`, `2>`, `2>>`, `&>`), operatory `&&`/`||`/`;`, zmienne
  środowiskowe (`$VAR`, `${VAR}`, `$?`), cudzysłowy, uzupełnianie TAB i historia.
- **Wirtualny system plików** z pełnymi uprawnieniami uniksowymi (rwx dla
  właściciela/grupy/innych, uid/gid, nadpisanie roota), serializowany do zapisu.
- **~70 poleceń** systemu plików, systemu, sieci i narzędzi, w tym `sudo`/`su`
  z parsowaniem `/etc/sudoers` (realna eskalacja uprawnień).
- **Symulowana sieć** — hosty, porty, usługi z banerami, DNS (A/CNAME/MX/TXT),
  firewalle, opóźnienia, utrata pakietów; `nmap`, `nc`, `curl`, `ssh`, `ping`…
- **Fikcyjny internet** — 14 hostów w 10 organizacjach (firma technologiczna,
  bank, uczelnia, hosting, urząd, serwis informacyjny, podziemne forum, wroga
  grupa hakerska), każdy ze spójną strukturą plików, kontami i politykami.
- **20 w pełni grywalnych misji** o rosnącej złożoności, z narracją, celami,
  nagrodami i trwałymi konsekwencjami. Każdy cel osiągasz prawdziwymi komendami
  — nie ma „przycisku Hack".
- **Systemy wykrywania** — IDS, logi uwierzytelniania, poziom podejrzeń rosnący
  na podstawie realnych akcji (skan jest głośny, czytanie własnego pliku ciche).
- **Ekonomia** — konto bankowe, transakcje, sklep z narzędziami i sprzętem,
  progresja umiejętności i reputacji. Zakupy walidowane po stronie silnika.
- **Konta i chmura** — Supabase Auth (e-mail/hasło, weryfikacja, reset), zapisy
  z RLS i wieloma slotami, autozapis, sumy kontrolne. Działa też **offline**
  (zapis w przeglądarce) bez żadnej konfiguracji.
- **Mobile-first** — responsywny układ, pasek klawiszy dotykowych (Tab, Ctrl-C,
  strzałki), obsługa safe-area iPhone, dolna nawigacja, PWA (instalacja + offline).
- **Styl cyberpunk** — trzy motywy (zielony/bursztyn/niebieski), efekt CRT,
  wizualizacja topologii sieci, wirtualna przeglądarka, edytor plików (Monaco).

## Stos technologiczny

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Zustand · xterm.js ·
Monaco Editor · Supabase (PostgreSQL + Auth + RLS) · Vitest · Playwright.

## Architektura

Rdzeń gry to **czysty, deterministyczny silnik TypeScript** niezależny od
przeglądarki — dzięki temu jest w całości testowalny i może działać także po
stronie serwera.

```
src/engine/            # Silnik (czysty TS, bez zależności od DOM)
  fs/                  #   wirtualny system plików + ścieżki
  shell/               #   tokenizer, parser, egzekutor, komendy, sudoers
    commands/          #     fs, system, net, sec, util, game
  net/                 #   symulacja sieci (DNS, firewall, porty, usługi)
  missions/            #   silnik misji + 20 definicji
  world/               #   budowniczowie hostów + seed fikcyjnego internetu
  economy.ts           #   sklep, bank
  detection.ts         #   IDS / poziom podejrzeń
  game.ts              #   GameEngine — orkiestracja wszystkiego
src/store/             # Zustand — most silnik ↔ React
src/lib/               # Supabase + warstwa persystencji
src/components/        # Interfejs (terminal, panele, nawigacja, auth)
src/app/               # Next.js App Router
supabase/migrations/   # Schemat PostgreSQL z RLS
tests/unit/            # Testy jednostkowe (Vitest)
tests/e2e/             # Testy end-to-end (Playwright)
```

## Szybki start

Wymagania: Node 18+ i pnpm (lub npm).

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

Bez żadnej konfiguracji gra uruchomi się w **trybie lokalnym** (konto gościa,
zapis w przeglądarce). Aby włączyć konta w chmurze, skopiuj `.env.example` do
`.env.local` i uzupełnij dane Supabase — zobacz [DEPLOYMENT.md](./DEPLOYMENT.md).

```bash
pnpm build          # build produkcyjny
pnpm start          # serwer produkcyjny
```

## Testy

```bash
pnpm test           # testy jednostkowe (Vitest) — silnik, parser, VFS, sieć,
                    #   misje, ekonomia, persystencja, pełne przejście 20 misji
pnpm test:e2e       # testy E2E (Playwright) — rejestracja, gra, zapis, wznowienie
```

Testy jednostkowe obejmują m.in. **pełne, skryptowane przejście wszystkich 20
misji** wyłącznie prawdziwymi komendami — to dowód, że gra jest przechodzalna.

## Jak grać

1. Podaj nazwę operatora (lub załóż konto) i rozpocznij.
2. W terminalu wpisz `help`, potem `missions`, a następnie `mission 1`.
3. Realizuj cele prawdziwymi komendami. Przykładowy początek:

```bash
cat README.txt
nslookup aurora.example
nmap -sV www.aurora.example
curl http://www.aurora.example/robots.txt
curl http://www.aurora.example/backup/deploy.yml     # wyciek poświadczeń
ssh deploy@www.aurora.example --password 'Aur0ra$Deploy!'
sudo -l && sudo -s                                    # eskalacja do roota
cat /root/flag.txt
```

Postęp zapisuje się automatycznie. Panele (Zlecenia, Portfel, Sieć, Pliki, WWW,
Ustawienia) dublują to, co dostępne w terminalu.

## Zaimplementowane polecenia

Zachowanie jest wiernym **podzbiorem** GNU/Linuksa. Poniżej lista komend wraz z
obsługiwanymi flagami (inne flagi mogą być ignorowane).

| Kategoria | Polecenia (obsługiwane flagi) |
|---|---|
| System plików | `pwd`, `cd`, `ls` (-l -a -h), `mkdir` (-p), `rmdir`, `touch`, `rm` (-r -f), `cp` (-r), `mv`, `cat` (-n), `less`, `head` (-n), `tail` (-n), `find` (-name -type), `grep` (-i -n -v -r), `chmod`, `chown`, `stat`, `file`, `du` (-s -h), `df` (-h) |
| System | `whoami`, `id`, `uname` (-a -r -s -n -m), `hostname`, `date`, `uptime`, `env`, `export`, `echo` (-n), `printf`, `true`, `false`, `clear`, `history` (-c), `ps` (aux), `top`, `kill` (-9), `jobs` |
| Sieć | `ip` (addr/route), `ifconfig`, `ping` (-c), `traceroute`, `netstat`, `ss`, `nslookup`, `dig`, `curl` (-s -I -o), `wget` (-O), `ssh` (-p --password), `scp`, `sftp` |
| Bezpieczeństwo | `nmap` (-p -sV), `nc` (-z) |
| Narzędzia | `man`, `help`, `which`, `whereis`, `wc` (-l -w -c), `sort` (-r -n -u), `uniq` (-c), `cut` (-d -f), `sed` (`s/…/…/[gi]`), `awk` (`{print $n}`, -F), `tar` (-c -x -t -f -z), `gzip`/`gunzip` (-d), `base64` (-d), `sha256sum` |
| Uprawnienia | `sudo` (-l, -s, `sudo <cmd>`), `su` |
| Gra | `missions`, `mission`, `wallet`, `store`, `buy`, `bank`, `hosts` |

Funkcje powłoki: potoki, przekierowania (`> >> < 2> 2>> &>`), `&&`/`||`/`;`,
rozwijanie zmiennych (`$VAR`, `${VAR}`, `$?`), cudzysłowy pojedyncze/podwójne,
escapowanie `\`, przypisania `VAR=wartość`, uzupełnianie TAB, historia `↑/↓`,
`Ctrl-C`, `Ctrl-L`, `/dev/null`.

## Czego celowo NIE zaimplementowano

Aby nie wprowadzać w błąd — BLACKNET **nie** jest pełną powłoką POSIX. Pominięto:

- podstawianie poleceń `$(...)` i backticki,
- globbing `*`/`?` w argumentach (poza `find -name`),
- zadania w tle (`&`) i kontrolę zadań,
- here-documents (`<<`),
- pełny `sed`/`awk` (obsługiwane tylko `s///` oraz `{print}`),
- `tar`/`gzip` w prawdziwym formacie bajtowym (to spójny format symulacji,
  który jednak poprawnie się pakuje i rozpakowuje w grze),
- dowiązania symboliczne nie są automatycznie rozwijane,
- bity setuid/setgid/sticky nie są egzekwowane.

Uwierzytelnianie `ssh` opiera się na posiadanych poświadczeniach (zdobytych w
grze) lub fladze `--password`, a nie na interaktywnym pytaniu o hasło.

## Autozapis

Postęp zapisuje się sam — gracz nigdy nie musi o tym myśleć (`src/lib/autosave/`).

- **Dziennik lokalny** (synchronicznie, `localStorage`) z kopią rezerwową i sumą
  kontrolną SHA-256; uszkodzony zapis jest wykrywany i zastępowany poprzednim.
- **Wyzwalacze:** debounce 1,2 s z limitem 8 s przy ciągłej grze; natychmiast po
  ukończeniu misji, zakupie, przejściu na inny host; zabezpieczenie co 30 s;
  synchronicznie przy schowaniu/zamknięciu karty (`visibilitychange`,
  `pagehide`, `freeze`) — kluczowe na iOS, który zabija karty w tle.
  Zapis jest pomijany, gdy treść się nie zmieniła.
- **Chmura offline-first:** kolejka, limit częstotliwości (8 s), ponawianie z
  wykładniczym odstępem (2 s → 60 s), wznowienie po zdarzeniu `online`.
- **Konflikty jak w Gicie:** decydują numery rewizji, a nie zegary urządzeń.
  Przy rozbieżności wygrywa zapis z większym postępem; przegrany trafia do kopii.
- **Kopie zapasowe** w IndexedDB, kompresowane gzip (~8×), ostatnie 10:
  po każdej misji, co 10 min, przed konfliktem, przywróceniem, importem i nową grą.
  Przywracanie, eksport i import pliku w Ustawieniach.
- **Wiele kart:** nowa karta przejmuje grę, stara zapisuje stan i się wstrzymuje.

## Model bezpieczeństwa i zaufania

- **Izolacja kont** — każdy gracz ma w pełni odseparowane środowisko. Dostęp do
  danych wymusza **Row Level Security** PostgreSQL (`auth.uid() = user_id`).
- **Serwer jako źródło prawdy dla zapisu** — zapisy przechodzą przez funkcję
  `save_game` (RLS + optymistyczna kontrola rewizji) chroniącą przed nadpisaniem
  i uszkodzeniem (suma kontrolna SHA-256).
- **Shell nie dotyka hosta** — silnik to czysta symulacja w pamięci; nie wykonuje
  żadnych poleceń systemu operacyjnego serwera ani żądań do prawdziwych adresów.
- **Wirtualna przeglądarka** renderuje fikcyjne strony w `iframe` z `sandbox=""`
  (bez skryptów).
- **Nagłówki** — CSP, `X-Content-Type-Options`, `Referrer-Policy`,
  `X-Frame-Options: DENY`, `Permissions-Policy` (zob. `next.config.mjs`).

> **Uczciwa uwaga o autorytatywności:** dla płynności terminala silnik gry
> działa po stronie klienta, a serwer odpowiada za trwałą, odizolowaną (RLS)
> persystencję i walidację zapisu. Silnik jest izomorficzny, więc docelowe
> utwardzenie (przeniesienie wykonywania komend do funkcji serwerowej / Edge)
> jest możliwe bez zmiany logiki — opisano to w [DEPLOYMENT.md](./DEPLOYMENT.md).

## Wdrożenie

Pełna instrukcja (Supabase, zmienne środowiskowe, Vercel, migracje) znajduje się
w pliku [DEPLOYMENT.md](./DEPLOYMENT.md).
