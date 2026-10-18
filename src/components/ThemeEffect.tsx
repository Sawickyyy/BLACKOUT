"use client";

import { useEffect } from "react";
import { useGame } from "@/store/gameStore";

/** Applies the player's visual settings to the document root. */
export default function ThemeEffect() {
  const theme = useGame((s) => s.engine?.player.settings.theme ?? "green");
  const crt = useGame((s) => s.engine?.player.settings.crt ?? true);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.toggle("crt", crt);
    const meta = document.querySelector('meta[name="theme-color"]');
    const bg = getComputedStyle(root).getPropertyValue("--bg").trim();
    if (meta && bg) meta.setAttribute("content", `rgb(${bg.replace(/\s+/g, ",")})`);
  }, [theme, crt]);

  return null;
}
