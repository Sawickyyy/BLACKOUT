"use client";

// UI-only preferences, stored in localStorage under `blacknet:ui` — never in
// the game save, so they can evolve freely without save migrations. Settings
// that are part of the save (theme, crt, fontSize, reducedMotion) stay in the
// engine and are changed through the game store.

import { create } from "zustand";

export interface UiPrefs {
  /** Opacity of translucent chrome (0.55 – 0.95). */
  glassAlpha: number;
  /** Backdrop blur on/off (off is cheaper on older phones). */
  blur: boolean;
  scale: 90 | 100 | 110 | 120;
  contrast: "normal" | "high";
  bootAnimation: boolean;
  /** Ambient wallpaper motion and decorative effects. */
  ambient: boolean;
}

export const DEFAULT_PREFS: UiPrefs = {
  glassAlpha: 0.72,
  blur: true,
  scale: 100,
  contrast: "normal",
  bootAnimation: true,
  ambient: true,
};

const KEY = "blacknet:ui";

function load(): UiPrefs {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<UiPrefs>;
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return DEFAULT_PREFS;
  }
}

interface PrefsState extends UiPrefs {
  hydrated: boolean;
  hydrate: () => void;
  setPref: <K extends keyof UiPrefs>(key: K, value: UiPrefs[K]) => void;
  resetPrefs: () => void;
}

function persist(p: UiPrefs) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage blocked — prefs stay in memory */
  }
}

function pick(s: PrefsState): UiPrefs {
  const { glassAlpha, blur, scale, contrast, bootAnimation, ambient } = s;
  return { glassAlpha, blur, scale, contrast, bootAnimation, ambient };
}

export const usePrefs = create<PrefsState>((set, get) => ({
  ...DEFAULT_PREFS,
  hydrated: false,
  hydrate: () => set({ ...load(), hydrated: true }),
  setPref: (key, value) => {
    set({ [key]: value } as Partial<PrefsState>);
    persist(pick(get()));
  },
  resetPrefs: () => {
    set({ ...DEFAULT_PREFS });
    persist(DEFAULT_PREFS);
  },
}));
