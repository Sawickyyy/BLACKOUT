// Registry of BLACKNET OS applications (metadata only — views are mapped in
// AppView.tsx so this module stays import-cycle free).

import {
  Crosshair,
  FolderTree,
  Globe2,
  Network,
  Settings2,
  SquareTerminal,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type AppId = "terminal" | "missions" | "network" | "files" | "browser" | "wallet" | "settings";

export interface AppMeta {
  id: AppId;
  title: string;
  /** Short label for the mobile dock. */
  short: string;
  description: string;
  icon: LucideIcon;
  /** Tint used for the dock icon tile. */
  tint: string;
  size: { w: number; h: number };
  min: { w: number; h: number };
}

export const APPS: Record<AppId, AppMeta> = {
  terminal: {
    id: "terminal",
    title: "Terminal",
    short: "Terminal",
    description: "Powłoka systemowa — serce operacji",
    icon: SquareTerminal,
    tint: "53 230 165",
    size: { w: 860, h: 540 },
    min: { w: 420, h: 260 },
  },
  missions: {
    id: "missions",
    title: "Mission Control",
    short: "Zlecenia",
    description: "Zlecenia, cele i nagrody",
    icon: Crosshair,
    tint: "255 189 89",
    size: { w: 460, h: 600 },
    min: { w: 340, h: 320 },
  },
  network: {
    id: "network",
    title: "Network Intelligence",
    short: "Sieć",
    description: "Mapa odkrytej sieci",
    icon: Network,
    tint: "90 184 255",
    size: { w: 760, h: 520 },
    min: { w: 420, h: 320 },
  },
  files: {
    id: "files",
    title: "Pliki",
    short: "Pliki",
    description: "Menedżer plików bieżącego hosta",
    icon: FolderTree,
    tint: "168 140 255",
    size: { w: 720, h: 500 },
    min: { w: 400, h: 300 },
  },
  browser: {
    id: "browser",
    title: "Przeglądarka",
    short: "WWW",
    description: "Wirtualna przeglądarka sieci BLACKNET",
    icon: Globe2,
    tint: "90 184 255",
    size: { w: 820, h: 560 },
    min: { w: 420, h: 320 },
  },
  wallet: {
    id: "wallet",
    title: "Portfel",
    short: "Portfel",
    description: "Saldo, bank i sklep",
    icon: Wallet,
    tint: "53 230 165",
    size: { w: 520, h: 600 },
    min: { w: 360, h: 360 },
  },
  settings: {
    id: "settings",
    title: "Ustawienia",
    short: "Ustawienia",
    description: "Wygląd, terminal, konto i zapisy",
    icon: Settings2,
    tint: "145 167 170",
    size: { w: 720, h: 560 },
    min: { w: 420, h: 360 },
  },
};

export const APP_IDS: AppId[] = ["terminal", "missions", "network", "files", "browser", "wallet", "settings"];

/** Primary apps on the phone dock; the rest live in the launcher. */
export const MOBILE_DOCK: AppId[] = ["terminal", "missions", "network", "browser"];
