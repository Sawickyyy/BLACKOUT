// A fictional vulnerability advisory feed. IDs use a made-up BLACKNET prefix
// (never real CVE numbers) and the findings are generic, educational notes —
// "this version is old, look at its exposed surface" — not working exploits.
// `vulns` and the Network app cross-reference what the player has actually
// enumerated (service + version from `nmap -sV`) against this list.

export type Severity = "low" | "medium" | "high" | "critical";

export interface Advisory {
  id: string;
  /** Substring matched against an observed "product version" banner. */
  match: string;
  severity: Severity;
  title: string;
  note: string;
}

export const ADVISORIES: Advisory[] = [
  {
    id: "BN-2023-0007",
    match: "OpenSSH 8.4",
    severity: "medium",
    title: "OpenSSH 8.4 — wersja przestarzała",
    note: "Starsze wydanie; zalecana aktualizacja. Sprawdź konta z domyślnymi/słabymi hasłami i politykę logowania.",
  },
  {
    id: "BN-2023-0011",
    match: "OpenSSH 7.9",
    severity: "medium",
    title: "OpenSSH 7.9 — wersja przestarzała",
    note: "Typowa na starych maszynach laboratoryjnych; często łączona ze słabymi hasłami kont studenckich.",
  },
  {
    id: "BN-2023-0019",
    match: "nginx 1.22",
    severity: "low",
    title: "nginx 1.22 — ryzyko autoindex",
    note: "Przy włączonym autoindex katalogi (np. /backup/) bywają wystawione publicznie. Zweryfikuj robots.txt i listowanie.",
  },
  {
    id: "BN-2023-0024",
    match: "Apache 2.4.54",
    severity: "medium",
    title: "Apache httpd 2.4.54 — przegląd konfiguracji",
    note: "Sprawdź aliasy, status i pozostawione endpointy diagnostyczne (/server-status, /status).",
  },
  {
    id: "BN-2023-0031",
    match: "lighttpd 1.4.59",
    severity: "medium",
    title: "lighttpd 1.4.59 — wystawione pliki urządzenia",
    note: "Rejestratory i urządzenia IoT często serwują /device.json lub kopie konfiguracji z poświadczeniami.",
  },
  {
    id: "BN-2023-0038",
    match: "Dropbear 2022.82",
    severity: "low",
    title: "Dropbear 2022.82 — lekki serwer SSH",
    note: "Powszechny na routerach i kamerach; typowe ryzyko to NIEZMIENIONE hasła fabryczne, nie sam serwer.",
  },
  {
    id: "BN-2023-0042",
    match: "nginx 1.24",
    severity: "low",
    title: "nginx 1.24 — przegląd ekspozycji",
    note: "Zweryfikuj, czy ścieżki pomocnicze (/b, /targets, kopie zapasowe) nie są dostępne bez uwierzytelnienia.",
  },
];

const RANK: Record<Severity, number> = { low: 1, medium: 2, high: 3, critical: 4 };

/** Advisories matching an observed "product version" banner, worst-first. */
export function advisoriesFor(versionBanner: string | undefined): Advisory[] {
  if (!versionBanner) return [];
  const v = versionBanner.toLowerCase();
  return ADVISORIES.filter((a) => v.includes(a.match.toLowerCase())).sort((a, b) => RANK[b.severity] - RANK[a.severity]);
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  low: "niskie",
  medium: "średnie",
  high: "wysokie",
  critical: "krytyczne",
};
