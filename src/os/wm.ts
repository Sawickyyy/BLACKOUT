"use client";

// Window manager state for the desktop shell. Pure UI state: geometry, stacking
// and open/minimised flags. Persisted to localStorage as a UI preference —
// never part of the game save.

import { create } from "zustand";
import { APP_IDS, APPS, type AppId } from "./apps";

export interface WinState {
  open: boolean;
  minimized: boolean;
  maximized: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
}

export interface Bounds {
  /** Desktop work area (between top bar and dock). */
  top: number;
  left: number;
  width: number;
  height: number;
}

const KEY = "blacknet:ui:windows";
const MIN_VISIBLE = 96; // px of a window that must stay on screen

interface WMState {
  wins: Record<AppId, WinState>;
  focused: AppId | null;
  bounds: Bounds;
  zTop: number;
  hydrated: boolean;
  hydrate: (bounds: Bounds) => void;
  setBounds: (b: Bounds) => void;
  open: (id: AppId) => void;
  close: (id: AppId) => void;
  minimize: (id: AppId) => void;
  toggleMaximize: (id: AppId) => void;
  focus: (id: AppId) => void;
  setGeometry: (id: AppId, g: Partial<Pick<WinState, "x" | "y" | "w" | "h">>) => void;
  /** Dock click: open, restore, focus — or minimise if already focused. */
  activate: (id: AppId) => void;
  arrange: () => void;
}

function defaults(bounds: Bounds): Record<AppId, WinState> {
  const out = {} as Record<AppId, WinState>;
  APP_IDS.forEach((id, i) => {
    const app = APPS[id];
    const w = Math.min(app.size.w, bounds.width - 32);
    const h = Math.min(app.size.h, bounds.height - 24);
    out[id] = {
      open: id === "terminal" || id === "missions",
      minimized: false,
      maximized: false,
      x: id === "terminal" ? 24 : Math.max(24, bounds.width - w - 24 - (i % 3) * 28),
      y: id === "terminal" ? 16 : 16 + (i % 3) * 28,
      w,
      h,
      z: id === "terminal" ? 2 : 1,
    };
  });
  return out;
}

/** Keep size within the work area and enough of the title bar on screen. */
function clamp(w: WinState, b: Bounds, id: AppId): WinState {
  const app = APPS[id];
  const width = Math.max(app.min.w, Math.min(w.w, b.width));
  const height = Math.max(app.min.h, Math.min(w.h, b.height));
  const x = Math.min(Math.max(w.x, MIN_VISIBLE - width), b.width - MIN_VISIBLE);
  const y = Math.min(Math.max(w.y, 0), b.height - 44);
  return { ...w, w: width, h: height, x, y };
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function persist(wins: Record<AppId, WinState>) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(wins));
    } catch {
      /* storage blocked */
    }
  }, 250);
}

export const useWM = create<WMState>((set, get) => {
  const update = (id: AppId, patch: Partial<WinState>, focus = false) => {
    const s = get();
    const z = focus ? s.zTop + 1 : s.wins[id].z;
    const wins = { ...s.wins, [id]: clamp({ ...s.wins[id], ...patch, z }, s.bounds, id) };
    set({ wins, zTop: focus ? z : s.zTop, focused: focus ? id : s.focused });
    persist(wins);
  };

  const topVisible = (wins: Record<AppId, WinState>, except?: AppId): AppId | null => {
    let best: AppId | null = null;
    for (const id of APP_IDS) {
      const w = wins[id];
      if (id === except || !w.open || w.minimized) continue;
      if (!best || w.z > wins[best].z) best = id;
    }
    return best;
  };

  return {
    wins: defaults({ top: 0, left: 0, width: 1280, height: 720 }),
    focused: "terminal",
    bounds: { top: 0, left: 0, width: 1280, height: 720 },
    zTop: 2,
    hydrated: false,

    hydrate: (bounds) => {
      let wins = defaults(bounds);
      try {
        const raw = window.localStorage.getItem(KEY);
        if (raw) {
          const saved = JSON.parse(raw) as Partial<Record<AppId, WinState>>;
          for (const id of APP_IDS) if (saved[id]) wins[id] = { ...wins[id], ...saved[id] };
        }
      } catch {
        /* corrupt prefs → defaults */
      }
      wins = Object.fromEntries(APP_IDS.map((id) => [id, clamp(wins[id], bounds, id)])) as Record<AppId, WinState>;
      // The terminal is the system shell: it is always available on boot.
      wins.terminal = { ...wins.terminal, open: true, minimized: false };
      const zTop = Math.max(...APP_IDS.map((id) => wins[id].z)) + 1;
      wins.terminal.z = zTop;
      set({ wins, bounds, zTop, focused: "terminal", hydrated: true });
    },

    setBounds: (bounds) => {
      const wins = Object.fromEntries(APP_IDS.map((id) => [id, clamp(get().wins[id], bounds, id)])) as Record<
        AppId,
        WinState
      >;
      set({ bounds, wins });
    },

    open: (id) => update(id, { open: true, minimized: false }, true),

    close: (id) => {
      const wins = { ...get().wins, [id]: { ...get().wins[id], open: false, maximized: false } };
      set({ wins, focused: get().focused === id ? topVisible(wins, id) : get().focused });
      persist(wins);
    },

    minimize: (id) => {
      const wins = { ...get().wins, [id]: { ...get().wins[id], minimized: true } };
      set({ wins, focused: get().focused === id ? topVisible(wins, id) : get().focused });
      persist(wins);
    },

    toggleMaximize: (id) => update(id, { maximized: !get().wins[id].maximized }, true),

    focus: (id) => {
      if (get().focused === id && get().wins[id].z === get().zTop) return;
      update(id, {}, true);
    },

    setGeometry: (id, g) => update(id, { ...g, maximized: false }),

    activate: (id) => {
      const w = get().wins[id];
      if (!w.open || w.minimized) return get().open(id);
      if (get().focused === id) return get().minimize(id);
      get().focus(id);
    },

    arrange: () => {
      const { bounds, wins } = get();
      const openIds = APP_IDS.filter((id) => wins[id].open && !wins[id].minimized);
      const next = { ...wins };
      openIds.forEach((id, i) => {
        next[id] = clamp(
          { ...wins[id], maximized: false, x: 24 + i * 32, y: 16 + i * 28, w: APPS[id].size.w, h: APPS[id].size.h },
          bounds,
          id,
        );
      });
      set({ wins: next });
      persist(next);
    },
  };
});
