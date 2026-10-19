"use client";

import { useEffect } from "react";
import { useGame } from "@/store/gameStore";
import { usePrefs } from "./prefs";

/** Mirrors saved game settings + UI prefs onto <html> data attributes / CSS vars. */
export default function ThemeSync() {
  const theme = useGame((s) => s.engine?.player.settings.theme ?? "green");
  const crt = useGame((s) => s.engine?.player.settings.crt ?? false);
  const reducedMotion = useGame((s) => s.engine?.player.settings.reducedMotion ?? false);
  const { glassAlpha, blur, scale, contrast, hydrated, hydrate } = usePrefs();

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.motion = reducedMotion ? "reduced" : "full";
    root.dataset.scale = String(scale);
    root.dataset.contrast = contrast;
    root.classList.toggle("crt-on", crt);
    if (contrast === "normal") {
      root.style.setProperty("--glass-alpha", String(glassAlpha));
      root.style.setProperty("--glass-blur", blur ? "18px" : "0px");
    } else {
      root.style.removeProperty("--glass-alpha");
      root.style.removeProperty("--glass-blur");
    }
  }, [theme, crt, reducedMotion, glassAlpha, blur, scale, contrast]);

  return null;
}
