// The 20 BLACKNET missions. Each objective is a predicate over game state and
// the triggering event. Helper closures keep checks success-gated:
//   readObj  — latches when a file was actually read (cat succeeds → file_read)
//   httpObj  — latches when a web resource was actually fetched (curl/wget)
//   dnsObj   — latches on a successful DNS lookup
// State predicates (hasAccess, discovered, fileContains) are checked every tick.

import type { Mission, MissionCtx } from "./engine";

const readObj =
  (hostId: string, pathSub: string) =>
  (mc: MissionCtx): boolean =>
    !!mc.event &&
    mc.event.kind === "file_read" &&
    mc.event.hostId === hostId &&
    String(mc.event.data?.path ?? "").includes(pathSub);

const httpObj =
  (hostId: string, sub: string) =>
  (mc: MissionCtx): boolean =>
    !!mc.event &&
    mc.event.kind === "http" &&
    mc.event.hostId === hostId &&
    (String(mc.event.data?.path ?? "") + String(mc.event.data?.url ?? "")).includes(sub);

const dnsObj =
  (nameSub: string) =>
  (mc: MissionCtx): boolean =>
    !!mc.event && mc.event.kind === "dns" && String(mc.event.data?.name ?? "").includes(nameSub);

export const MISSIONS: Mission[] = [
  {
    id: "m01",
    title: "Rozruch systemu",
    org: "self",
    difficulty: 1,
    brief:
      "Zapoznaj się ze swoim terminalem. Przeczytaj README, sprawdź tożsamość i stwórz pierwszy plik.\n" +
      "Podpowiedź: `cat README.txt`, `whoami`, `help`, a potem `touch pierwszy.txt`.",
    reward: { credits: 100, skills: { recon: 1 } },
    hints: [
      "Wpisz `ls`, aby zobaczyć pliki, a potem `cat README.txt`, aby przeczytać instrukcję.",
      "`whoami` pokazuje, jako kto pracujesz. `help` wypisuje wszystkie polecenia.",
      "Nowy pusty plik tworzysz poleceniem `touch pierwszy.txt`.",
    ],
    objectives: [
      { id: "readme", label: "Przeczytaj README.txt", check: (mc) => mc.ranCommand("cat", "README") },
      { id: "whoami", label: "Sprawdź tożsamość (whoami)", check: (mc) => mc.ranCommand("whoami") },
      { id: "help", label: "Wyświetl listę poleceń (help)", check: (mc) => mc.ranCommand("help") },
      {
        id: "touch",
        label: "Utwórz plik pierwszy.txt",
        check: (mc) => mc.fileExists("local", "/home/operator/pierwszy.txt"),
      },
    ],
  },
  {
    id: "m02",
    title: "Zwiad: Aurora",
    org: "aurora",
    difficulty: 1,
    prereq: ["m01"],
    brief:
      "Twój cel to domena aurora.example. Rozwiąż jej adres, sprawdź osiągalność i zmapuj usługi.\n" +
      "Podpowiedź: `nslookup aurora.example`, `ping www.aurora.example`, `nmap -sV www.aurora.example`.",
    reward: { credits: 150, skills: { recon: 1 } },
    objectives: [
      { id: "dns", label: "Rozwiąż DNS aurora.example", check: dnsObj("aurora") },
      { id: "ping", label: "Sprawdź osiągalność hosta", check: (mc) => mc.eventIs("ping", "aurora-web") },
      { id: "scan", label: "Zmapuj usługi (nmap)", check: (mc) => mc.discovered("aurora-web") },
    ],
  },
  {
    id: "m03",
    title: "Ukryte ścieżki",
    org: "aurora",
    difficulty: 2,
    prereq: ["m02"],
    brief:
      "Serwer WWW Aurory zdradza za dużo. Zajrzyj do robots.txt i katalogu, który tam znajdziesz.\n" +
      "Podpowiedź: `curl http://www.aurora.example/robots.txt`, potem pobierz plik z /backup/.",
    reward: { credits: 200, skills: { recon: 1, exploitation: 1 } },
    objectives: [
      { id: "robots", label: "Pobierz robots.txt", check: httpObj("aurora-web", "robots") },
      {
        id: "leak",
        label: "Znajdź plik deploy.yml w /backup/",
        check: (mc) => httpObj("aurora-web", "deploy.yml")(mc),
        hint: "curl http://www.aurora.example/backup/deploy.yml",
      },
    ],
  },
  {
    id: "m04",
    title: "Wyciek w repozytorium",
    org: "aurora",
    difficulty: 2,
    prereq: ["m02"],
    brief:
      "Aurora wystawiła GitLab na git.aurora.example. Repozytoria bywają pełne sekretów.\n" +
      "Podpowiedź: `curl http://git.aurora.example/web-deploy/raw/config/secrets.yml`.",
    reward: { credits: 150, skills: { recon: 1 } },
    objectives: [
      { id: "secrets", label: "Pobierz secrets.yml z GitLaba", check: httpObj("aurora-git", "secrets") },
    ],
  },
  {
    id: "m05",
    title: "Pierwsze wejście",
    org: "aurora",
    difficulty: 2,
    prereq: ["m03"],
    brief:
      "Masz poświadczenia konta deploy. Zaloguj się przez SSH na serwer WWW.\n" +
      "Podpowiedź: `ssh deploy@www.aurora.example --password 'Aur0ra$Deploy!'`\n" +
      "(apostrofy są ważne — bez nich powłoka potraktuje $Deploy jako zmienną).",
    reward: { credits: 300, skills: { exploitation: 2 }, reputation: [{ org: "aurora", amount: -5 }] },
    hints: [
      "Hasło konta deploy znalazłeś w /backup/deploy.yml (misja „Ukryte ścieżki”): Aur0ra$Deploy!",
      "Zaloguj się: `ssh deploy@www.aurora.example --password 'Aur0ra$Deploy!'`",
      "Hasło MUSI być w apostrofach — bez nich powłoka potraktuje $Deploy jako zmienną i wyśle złe hasło.",
    ],
    objectives: [
      { id: "ssh", label: "Zaloguj się jako deploy", check: (mc) => mc.hasAccess("aurora-web", "deploy") },
    ],
  },
  {
    id: "m06",
    title: "Eskalacja uprawnień",
    org: "aurora",
    difficulty: 3,
    prereq: ["m05"],
    brief:
      "Konto deploy ma zbyt szerokie uprawnienia sudo (NOPASSWD: ALL). Zdobądź roota\n" +
      "i odczytaj /root/flag.txt.\n" +
      "Podpowiedź: `sudo -l`, następnie `sudo -s` (powłoka roota) lub `sudo cat /root/flag.txt`.",
    reward: { credits: 500, skills: { exploitation: 2, stealth: 1 } },
    objectives: [
      { id: "root", label: "Uzyskaj uprawnienia roota", check: (mc) => mc.eventIs("privesc", "aurora-web") },
      { id: "flag", label: "Odczytaj /root/flag.txt", check: readObj("aurora-web", "/root/flag.txt") },
    ],
  },
  {
    id: "m07",
    title: "Słabe hasło",
    org: "northgate",
    difficulty: 2,
    prereq: ["m02"],
    brief:
      "Northgate University hostuje maszyny laboratoryjne. Portal WWW zdradza nazwę jednej z nich.\n" +
      "Konta laboratoryjne słyną z domyślnych haseł. Podpowiedź: `curl http://www.northgate.edu.example/status`, " +
      "potem `ssh student@lab01.northgate.edu.example --password student`.",
    reward: { credits: 200, skills: { exploitation: 1 }, reputation: [{ org: "northgate", amount: -3 }] },
    objectives: [
      { id: "status", label: "Odczytaj /status portalu", check: httpObj("uni-web", "/status") },
      { id: "ssh", label: "Zaloguj się na lab01 jako student", check: (mc) => mc.hasAccess("uni-lab", "student") },
    ],
  },
  {
    id: "m08",
    title: "Analiza logów",
    org: "northgate",
    difficulty: 3,
    prereq: ["m07"],
    brief:
      "Ktoś już tu był. Przejrzyj /var/log/auth.log na lab01 i ustal adres IP napastnika,\n" +
      "a następnie zapisz go do pliku raport.txt w katalogu domowym.\n" +
      "Podpowiedź: masz ograniczone sudo — `sudo cat /var/log/auth.log | grep Failed`, " +
      "potem `echo <IP> > raport.txt`.",
    reward: { credits: 250, skills: { forensics: 2 } },
    objectives: [
      { id: "logs", label: "Odczytaj auth.log", check: readObj("uni-lab", "/var/log/auth.log") },
      {
        id: "answer",
        label: "Zapisz IP napastnika do raport.txt",
        check: (mc) => mc.fileContains("uni-lab", "/home/student/raport.txt", "192.0.2.200"),
      },
    ],
  },
  {
    id: "m09",
    title: "Przeciek",
    org: "news",
    difficulty: 3,
    prereq: ["m02"],
    brief:
      "NewsWire opublikował zaszyfrowaną wiadomość od anonimowego źródła.\n" +
      "Pobierz /leak, zdekoduj Base64 i podążaj za wskazówką.\n" +
      "Podpowiedź: `curl http://www.newswire.example/leak`, potem `echo <ciąg> | base64 -d`.",
    reward: { credits: 200, skills: { crypto: 2 } },
    objectives: [
      { id: "fetch", label: "Pobierz wiadomość /leak", check: httpObj("news-wire", "/leak") },
      {
        id: "decode",
        label: "Zdekoduj i odwiedź wskazany adres",
        check: (mc) => mc.discovered("hollow-board"),
        hint: "Po dekodowaniu zobaczysz board.hollow — wykonaj: curl http://board.hollow/",
      },
    ],
  },
  {
    id: "m10",
    title: "Forensics: dopasowanie skrótu",
    org: "aurora",
    difficulty: 3,
    prereq: ["m06"],
    brief:
      "Jako root na www.aurora.example odczytaj /etc/shadow i ustal, do którego konta należy\n" +
      "wyciekłe hasło. Zapisz nazwę konta do /root/forensics.txt.\n" +
      "Podpowiedź: `echo -n 'Aur0ra$Deploy!' | sha256sum`, porównaj z polem w /etc/shadow.",
    reward: { credits: 300, skills: { forensics: 2, crypto: 1 } },
    objectives: [
      { id: "shadow", label: "Odczytaj /etc/shadow", check: readObj("aurora-web", "/etc/shadow") },
      {
        id: "match",
        label: "Zapisz dopasowane konto do /root/forensics.txt",
        check: (mc) => mc.fileContains("aurora-web", "/root/forensics.txt", "deploy"),
      },
    ],
  },
  {
    id: "m11",
    title: "Zwiad: Meridian Bank",
    org: "meridian",
    difficulty: 3,
    prereq: ["m05"],
    brief:
      "Meridian Bank jest dobrze zabezpieczony — większość portów jest filtrowana.\n" +
      "Zeskanuj go, przeczytaj politykę bezpieczeństwa i znajdź środowisko testowe.\n" +
      "Podpowiedź: `nmap www.meridian-bank.example`, `curl https://www.meridian-bank.example/.well-known/security.txt`, " +
      "`curl https://www.meridian-bank.example/api/status`.",
    reward: { credits: 300, skills: { recon: 2 }, reputation: [{ org: "meridian", amount: 2 }] },
    objectives: [
      { id: "scan", label: "Zeskanuj serwer banku", check: (mc) => mc.discovered("bank-web") },
      { id: "sec", label: "Przeczytaj security.txt", check: httpObj("bank-web", "security.txt") },
      { id: "staging", label: "Odkryj środowisko staging", check: httpObj("bank-web", "/api/status") },
    ],
  },
  {
    id: "m12",
    title: "Odpowiedzialne zgłoszenie",
    org: "meridian",
    difficulty: 4,
    prereq: ["m11"],
    brief:
      "Serwer staging ujawnia poświadczenia QA w /debug. Zaloguj się, pobierz token bug bounty\n" +
      "i zapisz go do zgloszenie.txt na swojej maszynie. To ścieżka etyczna — bank płaci za zgłoszenia.\n" +
      "Podpowiedź: `curl http://staging.meridian-bank.example:8080/debug`, `ssh qa@staging...`, " +
      "a po `exit` zapisz token lokalnie.",
    reward: { credits: 800, skills: { exploitation: 1 }, reputation: [{ org: "meridian", amount: 15 }] },
    objectives: [
      { id: "debug", label: "Znajdź poświadczenia w /debug", check: httpObj("bank-staging", "/debug") },
      { id: "ssh", label: "Zaloguj się jako qa", check: (mc) => mc.hasAccess("bank-staging", "qa") },
      { id: "token", label: "Odczytaj token bounty", check: readObj("bank-staging", "/home/qa/bounty.txt") },
      {
        id: "submit",
        label: "Zapisz zgłoszenie lokalnie (zgloszenie.txt)",
        check: (mc) =>
          mc.fileContains("local", "/home/operator/zgloszenie.txt", "responsible_disclosure_meridian"),
      },
    ],
  },
  {
    id: "m13",
    title: "Incydent: backdoor",
    org: "helio",
    difficulty: 4,
    prereq: ["m05"],
    brief:
      "HelioHost prosi o pomoc. Panel ujawnia kopię konfiguracji z hasłem. Zaloguj się na serwer\n" +
      "współdzielony, znajdź backdoor grupy NullSec i go usuń.\n" +
      "Podpowiedź: `curl http://panel.heliohost.example/config.php.bak`, `ssh admin@shared1...`, " +
      "`sudo rm -rf /tmp/.nullsec`.",
    reward: { credits: 600, skills: { forensics: 2, stealth: 1 }, reputation: [{ org: "helio", amount: 10 }] },
    objectives: [
      { id: "config", label: "Zdobądź hasło z panelu", check: httpObj("helio-panel", "config.php.bak") },
      { id: "ssh", label: "Zaloguj się na shared1 jako admin", check: (mc) => mc.hasAccess("helio-shared", "admin") },
      { id: "find", label: "Znajdź skrypt beacon.sh", check: readObj("helio-shared", "beacon.sh") },
      {
        id: "remove",
        label: "Usuń backdoor (/tmp/.nullsec)",
        check: (mc) => !mc.fileExists("helio-shared", "/tmp/.nullsec/beacon.sh"),
      },
    ],
  },
  {
    id: "m14",
    title: "Utwardzanie systemu",
    org: "helio",
    difficulty: 3,
    prereq: ["m13"],
    brief:
      "Dokończ sprzątanie: usuń wpis cron napastnika i upewnij się, że katalog backdoora zniknął.\n" +
      "Podpowiedź: `sudo rm /etc/cron.d/sysupdate`, `sudo rm -rf /tmp/.nullsec`.",
    reward: { credits: 300, skills: { stealth: 1 }, reputation: [{ org: "helio", amount: 5 }] },
    objectives: [
      {
        id: "cron",
        label: "Usuń wpis cron sysupdate",
        check: (mc) => !mc.fileExists("helio-shared", "/etc/cron.d/sysupdate"),
      },
      {
        id: "dir",
        label: "Upewnij się, że /tmp/.nullsec zniknął",
        check: (mc) => !mc.fileExists("helio-shared", "/tmp/.nullsec/beacon.sh"),
      },
    ],
  },
  {
    id: "m15",
    title: "Jawność danych publicznych",
    org: "civic",
    difficulty: 2,
    prereq: ["m02"],
    brief:
      "Civic Data Authority udostępnia rejestr publiczny z parametrem id. Przejrzyj rekordy i znajdź\n" +
      "opublikowany raport środowiskowy (id=42). Zapisz jego referencję do foia.txt.\n" +
      "Podpowiedź: `curl 'http://portal.civicdata.example/records?id=1'`, zmień id na 42.",
    reward: { credits: 350, skills: { recon: 1 }, reputation: [{ org: "civic", amount: 5 }] },
    objectives: [
      { id: "first", label: "Pobierz rekord id=1", check: httpObj("civic-portal", "id=1") },
      { id: "found", label: "Znajdź rekord id=42", check: httpObj("civic-portal", "id=42") },
      {
        id: "deliver",
        label: "Zapisz referencję do foia.txt",
        check: (mc) => mc.fileContains("local", "/home/operator/foia.txt", "foia_record_42_released"),
      },
    ],
  },
  {
    id: "m16",
    title: "Infiltracja: The Hollow",
    org: "hollow",
    difficulty: 3,
    prereq: ["m09"],
    brief:
      "Forum The Hollow ma wątek o grupie NullSec. Przeczytaj go, a potem zaloguj się na konto ghost\n" +
      "i wyciągnij kontakty.\n" +
      "Podpowiedź: `curl http://board.hollow/t/nullsec`, `ssh ghost@board.hollow --password spookyhash`.",
    reward: { credits: 400, skills: { social: 2 }, reputation: [{ org: "hollow", amount: 10 }] },
    objectives: [
      { id: "thread", label: "Przeczytaj wątek o NullSec", check: httpObj("hollow-board", "/t/nullsec") },
      { id: "ssh", label: "Zaloguj się jako ghost", check: (mc) => mc.hasAccess("hollow-board", "ghost") },
      { id: "contacts", label: "Odczytaj kontakty", check: readObj("hollow-board", "kontakty.txt") },
    ],
  },
  {
    id: "m17",
    title: "Atrybucja NullSec",
    org: "nullsec",
    difficulty: 4,
    prereq: ["m13", "m16"],
    brief:
      "Masz adres węzła NullSec (192.0.2.200). Zeskanuj go, pobierz listę celów i zbuduj dossier:\n" +
      "zapisz adres węzła do atrybucja.txt na swojej maszynie.\n" +
      "Podpowiedź: `nmap node.nullsec`, `curl http://node.nullsec/targets.txt`.",
    reward: {
      credits: 700,
      skills: { stealth: 1, recon: 1 },
      reputation: [
        { org: "helio", amount: 5 },
        { org: "northgate", amount: 5 },
      ],
    },
    objectives: [
      { id: "scan", label: "Zeskanuj węzeł NullSec", check: (mc) => mc.discovered("nullsec") },
      { id: "targets", label: "Pobierz listę celów", check: httpObj("nullsec", "/targets.txt") },
      {
        id: "dossier",
        label: "Zapisz dossier (atrybucja.txt z IP węzła)",
        check: (mc) => mc.fileContains("local", "/home/operator/atrybucja.txt", "192.0.2.200"),
      },
    ],
  },
  {
    id: "m18",
    title: "Audyt tożsamości",
    org: "aurora",
    difficulty: 3,
    prereq: ["m06"],
    brief:
      "Jako root na Aurorze wykonaj audyt kont: odczytaj /etc/passwd i wypisz konta usługowe\n" +
      "do /root/audyt.txt (uwzględnij www-data).\n" +
      "Podpowiedź: `cat /etc/passwd`, `grep www-data /etc/passwd > /root/audyt.txt`.",
    reward: { credits: 300, skills: { forensics: 1 } },
    objectives: [
      { id: "passwd", label: "Odczytaj /etc/passwd", check: readObj("aurora-web", "/etc/passwd") },
      {
        id: "audit",
        label: "Zapisz audyt do /root/audyt.txt",
        check: (mc) => mc.fileContains("aurora-web", "/root/audyt.txt", "www-data"),
      },
    ],
  },
  {
    id: "m19",
    title: "Korelacja zdarzeń",
    org: "helio",
    difficulty: 4,
    prereq: ["m13"],
    brief:
      "Powiąż fakty: na shared1 odczytaj auth.log i ustal, że logowanie kluczem publicznym pochodziło\n" +
      "z węzła NullSec. Zapisz wniosek (adres IP) do korelacja.txt na swojej maszynie.\n" +
      "Podpowiedź: `sudo cat /var/log/auth.log`, szukaj 'publickey'.",
    reward: { credits: 500, skills: { forensics: 2 } },
    objectives: [
      { id: "authlog", label: "Odczytaj auth.log na shared1", check: readObj("helio-shared", "/var/log/auth.log") },
      {
        id: "conclude",
        label: "Zapisz wniosek do korelacja.txt",
        check: (mc) => mc.fileContains("local", "/home/operator/korelacja.txt", "192.0.2.200"),
      },
    ],
  },
  {
    id: "m20",
    title: "Operacja BLACKOUT",
    org: "self",
    difficulty: 5,
    prereq: ["m06", "m12", "m17"],
    brief:
      "Finał. Masz roota na Aurorze, zgłoszenie do banku i atrybucję NullSec. Zbierz wszystko w jednym\n" +
      "raporcie końcowym: utwórz /home/operator/raport_koncowy.txt zawierający słowo BLACKNET\n" +
      "oraz adres węzła NullSec. Zamknij sprawę.\n" +
      "Podpowiedź: połącz swoje ustalenia w jeden plik tekstowy.",
    reward: {
      credits: 2000,
      skills: { recon: 1, exploitation: 1, forensics: 1, crypto: 1, social: 1, stealth: 1 },
      unlockCapabilities: ["proxychains"],
      reputation: [{ org: "hollow", amount: 10 }],
    },
    objectives: [
      {
        id: "report",
        label: "Utwórz raport końcowy",
        check: (mc) =>
          mc.fileContains("local", "/home/operator/raport_koncowy.txt", "BLACKNET") &&
          mc.fileContains("local", "/home/operator/raport_koncowy.txt", "192.0.2.200"),
      },
    ],
  },
  {
    id: "m21",
    title: "Oko w sieci",
    org: "vertex",
    difficulty: 3,
    prereq: ["m02"],
    brief:
      "Klient zgłasza, że firma Vertex Security zostawiła rejestrator kamer (NVR) wystawiony\n" +
      "do internetu. Twój cel: domena vertex-sec.example. Odkryj urządzenie, ustal sposób\n" +
      "dostępu, zaloguj się i URUCHOM PODGLĄD. W nocy pod rampę podjechał nieznany dostawczak —\n" +
      "znajdź na nagraniu jego tablicę rejestracyjną i zapisz ją do vertex_tablica.txt.\n" +
      "Dostępu i tablicy nie dostajesz za darmo — musisz je zdobyć i odczytać z obrazu.",
    reward: { credits: 450, skills: { recon: 1, exploitation: 1 }, reputation: [{ org: "vertex", amount: 5 }] },
    hints: [
      "Zacznij jak zwykle od zwiadu: `nslookup vertex-sec.example`, potem `nmap -sV nvr.vertex-sec.example`.",
      "Panel NVR działa na porcie 8080. Sprawdź, co serwuje: `curl http://nvr.vertex-sec.example:8080/device.json` — producenci zostawiają tam model i konto serwisowe.",
      "Konto operatora `cctv` ma hasło fabryczne `cctv1234`. Wejdź: `ssh cctv@nvr.vertex-sec.example --password cctv1234`.",
      "Po zalogowaniu otwórz aplikację CCTV (dock albo paleta poleceń Ctrl+K → „CCTV”). Wybierz kamerę „Parking P1” i przewiń oś czasu na ~02:14, aż zobaczysz dostawczak. Odczytaj tablicę z nakładki i zapisz: `echo 'WX 8831K' > vertex_tablica.txt`.",
    ],
    objectives: [
      { id: "scan", label: "Odkryj rejestrator NVR (nmap)", check: (mc) => mc.discovered("vertex-nvr") },
      {
        id: "device",
        label: "Pobierz dane urządzenia (device.json)",
        check: httpObj("vertex-nvr", "device.json"),
        hint: "curl http://nvr.vertex-sec.example:8080/device.json",
      },
      { id: "ssh", label: "Zaloguj się jako operator cctv", check: (mc) => mc.hasAccess("vertex-nvr", "cctv") },
      {
        id: "watch",
        label: "Uruchom podgląd kamery Parking P1",
        check: (mc) => mc.cctvViewed("vertex-nvr", "cam1"),
        hint: "Otwórz aplikację CCTV i wybierz kamerę Parking P1.",
      },
      {
        id: "plate",
        label: "Zapisz tablicę dostawczaka do vertex_tablica.txt",
        check: (mc) => mc.fileContains("local", "/home/operator/vertex_tablica.txt", "WX 8831K"),
      },
    ],
  },
  {
    id: "m22",
    title: "Nocny gość",
    org: "vertex",
    difficulty: 3,
    prereq: ["m21"],
    brief:
      "Masz już dostęp do rejestratora Vertex. Tej samej nocy ktoś wszedł do budynku bez karty.\n" +
      "Przejrzyj kamerę w lobby, ustal dokładny czas wejścia intruza i zapisz go (format GG:MM)\n" +
      "do vertex_czas.txt. Zbuduj też kod serwisowy widoczny w serwerowni do vertex_kod.txt.",
    reward: { credits: 400, skills: { forensics: 2 }, reputation: [{ org: "vertex", amount: 8 }] },
    hints: [
      "Otwórz aplikację CCTV, kamera „Lobby”. Przewiń oś czasu na okolice 02:00 i obserwuj, kiedy ktoś wchodzi.",
      "Osoba wchodzi o 02:11. Zapisz: `echo 02:11 > vertex_czas.txt`.",
      "Kamera „Serwerownia” pokazuje tablicę z kodem serwisowym VX-7731 (ok. 02:23). Zapisz: `echo VX-7731 > vertex_kod.txt`.",
    ],
    objectives: [
      { id: "lobby", label: "Przejrzyj kamerę Lobby", check: (mc) => mc.cctvViewed("vertex-nvr", "cam2") },
      {
        id: "time",
        label: "Zapisz czas wejścia do vertex_czas.txt",
        check: (mc) => mc.fileContains("local", "/home/operator/vertex_czas.txt", "02:11"),
      },
      {
        id: "code",
        label: "Zapisz kod serwisowy do vertex_kod.txt",
        check: (mc) => mc.fileContains("local", "/home/operator/vertex_kod.txt", "VX-7731"),
      },
    ],
  },
  {
    id: "m23",
    title: "Sygnał w eterze",
    org: "kowalski",
    difficulty: 3,
    prereq: ["m02"],
    brief:
      "Rodzina Kowalskich zleca AUTORYZOWANĄ ocenę swojej domowej sieci Wi-Fi (laboratorium).\n" +
      "Najpierw potwierdź zakres zlecenia, potem zeskanuj eter adapterem lab (wifi), przeanalizuj\n" +
      "zabezpieczenia WPA2 vs WPA3 i oceń siłę hasła. Słabe hasło da się wydedukować z publicznych\n" +
      "danych klienta — nie z żadnego ataku. Po wejściu do sieci pamiętaj: każde urządzenie ma\n" +
      "OSOBNE zabezpieczenia. Na koniec udokumentuj słabość i zaproponuj bezpieczniejszą konfigurację.",
    reward: { credits: 500, skills: { recon: 1, crypto: 1 }, reputation: [{ org: "kowalski", amount: 10 }] },
    hints: [
      "Zacznij od autoryzacji: `curl http://dom.kowalski.example/zlecenie.txt`. Zakres to tylko sieci Kowalski_* i LAN 192.168.1.0/24.",
      "Włącz adapter i zeskanuj eter: `wifi mon on`, potem `wifi scan`. Porównaj WPA2 (Kowalski_2.4) i WPA3 (Kowalski_5G): `wifi analyze Kowalski_2.4`.",
      "Strona klienta zdradza, że mieszkają tam „od 2015”, a nazwisko to Kowalski. Zbuduj kandydata i oceń: `wifi test Kowalski2015 Kowalski_2.4` — miernik pokaże, że to słabe hasło.",
      "Połącz się: `wifi connect Kowalski_2.4 Kowalski2015`. WPA3 (Kowalski_5G) odrzuca zgadywanie offline — to właśnie zaleta, której brakuje sieci 2.4.",
      "W LAN: `wifi devices`. Router ma fabryczne hasło panelu (naklejka: admin/admin): `ssh admin@192.168.1.1 --password admin`.",
      "Raport: `echo 'Słabe haslo WPA2 Kowalski_2.4: Kowalski2015. Zalecenie: WPA3 + dluga losowa fraza, zmiana hasla panelu.' > wifi_audyt.txt` — musi zawierać Kowalski2015 i WPA3.",
    ],
    objectives: [
      { id: "auth", label: "Potwierdź autoryzację zlecenia", check: httpObj("kowalski-web", "zlecenie") },
      { id: "scan", label: "Zeskanuj sieci Wi-Fi (wifi scan)", check: (mc) => mc.ranCommand("wifi", "scan") },
      { id: "analyze", label: "Przeanalizuj zabezpieczenia (wifi analyze)", check: (mc) => mc.ranCommand("wifi", "analyze") },
      {
        id: "connect",
        label: "Połącz się z Kowalski_2.4 (słabe WPA2)",
        check: (mc) => mc.player.wifiConnected === "Kowalski_2.4",
      },
      {
        id: "device",
        label: "Zaloguj się na router (osobne zabezpieczenie)",
        check: (mc) => mc.hasAccess("home-router", "admin"),
      },
      {
        id: "report",
        label: "Udokumentuj słabość i rekomendację (wifi_audyt.txt)",
        check: (mc) =>
          mc.fileContains("local", "/home/operator/wifi_audyt.txt", "Kowalski2015") &&
          (mc.fileContains("local", "/home/operator/wifi_audyt.txt", "WPA3") ||
            mc.fileContains("local", "/home/operator/wifi_audyt.txt", "wpa3")),
      },
    ],
  },
];
