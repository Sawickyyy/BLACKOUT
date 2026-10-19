"use client";

// Shell-level UI state shared by desktop and mobile layouts: which app is in
// front on the phone, overlays (palette, notification centre, launcher) and
// cross-app requests ("open this URL in the browser", "show this folder").

import { create } from "zustand";
import type { AppId } from "./apps";

interface OSState {
  /** Phone: the full-screen app in front. */
  mobileApp: AppId;
  paletteOpen: boolean;
  notificationsOpen: boolean;
  launcherOpen: boolean;
  /** Pending navigation for apps; `nonce` makes repeated requests distinct. */
  browserRequest: { url: string; nonce: number } | null;
  filesRequest: { path: string; nonce: number } | null;
  /** Implemented by the active shell (desktop opens a window, phone switches app). */
  launch: (id: AppId) => void;
  setLauncher: (fn: (id: AppId) => void) => void;
  set: (patch: Partial<Omit<OSState, "set" | "launch" | "setLauncher">>) => void;
  openUrl: (url: string) => void;
  openFolder: (path: string) => void;
}

export const useOS = create<OSState>((set, get) => ({
  mobileApp: "terminal",
  paletteOpen: false,
  notificationsOpen: false,
  launcherOpen: false,
  browserRequest: null,
  filesRequest: null,
  launch: () => undefined,
  setLauncher: (fn) => set({ launch: fn }),
  set: (patch) => set(patch),
  openUrl: (url) => {
    set({ browserRequest: { url, nonce: Date.now() } });
    get().launch("browser");
  },
  openFolder: (path) => {
    set({ filesRequest: { path, nonce: Date.now() } });
    get().launch("files");
  },
}));
