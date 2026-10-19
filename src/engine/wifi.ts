// Wi-Fi lab logic — all simulation, no radio. The centrepiece is a passphrase
// strength meter: a defensive estimator (length, character variety, and a
// dictionary/personal-info penalty) that teaches WHY a passphrase resists or
// fails guessing. There is no capture, handshake or cracking here; joining a
// weak lab network is a deduction puzzle, and WPA3 is modelled as resisting
// offline guessing outright so the lesson lands.

import type { WifiNetwork, WifiSecurity } from "./types";

/** A handful of famously weak passphrases, plus keyboard runs. Fictional lab data. */
const COMMON = [
  "password",
  "haslo123",
  "12345678",
  "qwertyuiop",
  "admin123",
  "internet",
  "iloveyou",
  "zaq12wsx",
  "football",
  "dragon12",
];

export interface Strength {
  /** 0 (trivial) … 4 (strong). */
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  /** Human estimate of resistance to offline guessing (qualitative). */
  resistance: string;
  reasons: string[];
}

/**
 * Estimate passphrase strength. `personal` are OSINT tokens about the target
 * (surname, year, pet) so the meter can flag a passphrase built from them —
 * the exact failure mode the mission teaches.
 */
export function scorePassphrase(pass: string, personal: string[] = []): Strength {
  const reasons: string[] = [];
  const len = pass.length;
  const classes =
    (/[a-z]/.test(pass) ? 1 : 0) +
    (/[A-Z]/.test(pass) ? 1 : 0) +
    (/[0-9]/.test(pass) ? 1 : 0) +
    (/[^A-Za-z0-9]/.test(pass) ? 1 : 0);

  const lower = pass.toLowerCase();
  const isCommon = COMMON.some((c) => lower === c || lower.includes(c));
  const usesPersonal = personal.some((p) => p && lower.includes(p.toLowerCase()));
  // "surname + year" style: letters followed by 2–4 digits.
  const nameYear = /^[a-ząćęłńóśźż]+\d{2,4}$/i.test(pass);

  let score = 0;
  if (len >= 8) score++;
  if (len >= 12) score++;
  if (len >= 16) score++;
  if (classes >= 3) score++;
  if (classes >= 4 && len >= 12) score++;

  if (len < 8) reasons.push("krótsze niż 8 znaków");
  if (classes <= 2) reasons.push("mało typów znaków (dodaj wielkie litery, cyfry, symbole)");
  if (isCommon) {
    reasons.push("znajduje się na listach popularnych haseł");
    score = Math.min(score, 1);
  }
  if (usesPersonal) {
    reasons.push("zbudowane z danych osobistych (łatwe do odgadnięcia z OSINT)");
    score = Math.min(score, 1);
  }
  if (nameYear) {
    reasons.push("wzorzec „słowo + rok” jest przewidywalny");
    score = Math.min(score, 1);
  }
  if (len >= 20 && classes >= 2) {
    // A long passphrase of several words is strong even with few classes.
    reasons.length = 0;
    reasons.push("długa fraza — dobra odporność");
    score = Math.max(score, 4);
  }

  const clamped = Math.max(0, Math.min(4, score)) as Strength["score"];
  const LABEL = ["trywialne", "bardzo słabe", "słabe", "dobre", "silne"];
  const RESIST = [
    "odgadywalne w sekundy",
    "odgadywalne w minuty",
    "odgadywalne w godziny/dni",
    "odporne — lata przy obecnych metodach",
    "praktycznie nie do odgadnięcia offline",
  ];
  if (!reasons.length) reasons.push("dobra długość i różnorodność znaków");
  return { score: clamped, label: LABEL[clamped]!, resistance: RESIST[clamped]!, reasons };
}

/** What each scheme protects and where it falls short — the teaching text. */
export function securityExplainer(sec: WifiSecurity): { name: string; summary: string; limits: string } {
  switch (sec) {
    case "open":
      return {
        name: "Otwarta (brak szyfrowania)",
        summary: "Ruch jest jawny — każdy w zasięgu może go podsłuchać.",
        limits: "Nigdy nie używaj do niczego prywatnego. Traktuj jak sieć publiczną.",
      };
    case "wep":
      return {
        name: "WEP (przestarzałe)",
        summary: "Szyfrowanie z lat 90., złamane projektowo.",
        limits: "Uznawane za niebezpieczne od dawna — należy je całkowicie wyłączyć.",
      };
    case "wpa2":
      return {
        name: "WPA2-Personal (PSK)",
        summary: "Standard domowy. Bezpieczeństwo zależy WYŁĄCZNIE od siły hasła.",
        limits:
          "Przy słabym lub osobistym haśle sieć jest podatna na zgadywanie offline. Długa, losowa fraza usuwa ten problem.",
      };
    case "wpa3":
      return {
        name: "WPA3-Personal (SAE)",
        summary: "Następca WPA2 z wymianą kluczy odporną na zgadywanie offline.",
        limits:
          "Nawet przy średnim haśle atak offline jest niewykonalny — każda próba wymaga interakcji z siecią. Zalecany wybór.",
      };
    case "wpa2-ent":
      return {
        name: "WPA2-Enterprise (802.1X)",
        summary: "Logowanie per-użytkownik przez serwer RADIUS, bez wspólnego hasła.",
        limits: "Mocne dla firm; wymaga infrastruktury. Nietypowe w domu.",
      };
  }
}

/** Signal bars 0–4 from dBm, for the UI. */
export function signalBars(dbm: number): number {
  if (dbm >= -50) return 4;
  if (dbm >= -60) return 3;
  if (dbm >= -70) return 2;
  if (dbm >= -80) return 1;
  return 0;
}

export function findNetwork(nets: WifiNetwork[], ssid: string): WifiNetwork | undefined {
  return nets.find((n) => n.ssid.toLowerCase() === ssid.toLowerCase());
}
