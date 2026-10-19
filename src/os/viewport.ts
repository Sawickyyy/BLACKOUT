"use client";

// Viewport helpers for the OS shell.
//
// iOS Safari does not shrink the layout viewport when the software keyboard
// opens (it ignores interactive-widget), so a fixed-height app would slide its
// bottom — the terminal prompt — under the keyboard. We mirror the *visual*
// viewport into CSS (--app-h) and size the shell from it instead.

import { useEffect, useState } from "react";

export const MOBILE_QUERY = "(max-width: 899px)";

export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return mobile;
}

/** Track the visual viewport; returns whether a software keyboard is likely open. */
export function useVisualViewport(): { keyboardOpen: boolean } {
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    const update = () => {
      const h = vv ? vv.height : window.innerHeight;
      root.style.setProperty("--app-h", `${Math.round(h)}px`);
      // A keyboard takes >25% of the screen; pinch-zoom also shrinks vv, so
      // only count it when the page is not zoomed.
      const zoomed = vv ? vv.scale > 1.01 : false;
      setKeyboardOpen(!zoomed && h < window.innerHeight * 0.75);
      // iOS may scroll the layout viewport to reveal the input; undo it so the
      // fixed shell stays aligned with the visible area.
      if (vv && vv.offsetTop > 0 && !zoomed) window.scrollTo(0, 0);
    };
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);
  return { keyboardOpen };
}

export function useClock(intervalMs = 15_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
