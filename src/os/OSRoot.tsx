"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/store/gameStore";
import DesktopShell from "./DesktopShell";
import MobileShell from "./MobileShell";
import CommandPalette from "./shell/CommandPalette";
import BootScreen from "./shell/BootScreen";
import RewardOverlay from "./shell/RewardOverlay";
import ThemeSync from "./ThemeSync";
import { OSButton } from "./ui";
import { useIsMobile, useVisualViewport } from "./viewport";

/** BLACKNET OS root: picks the desktop or phone shell and mounts global layers. */
export default function OSRoot() {
  const mobile = useIsMobile();
  const [mounted, setMounted] = useState(false);
  const suspended = useGame((s) => s.saveStatus?.state === "suspended");
  const suspendedReason = useGame((s) => s.saveStatus?.suspendedReason);
  useVisualViewport();
  useEffect(() => setMounted(true), []);

  return (
    <>
      <ThemeSync />
      {mounted && (mobile ? <MobileShell /> : <DesktopShell />)}
      <CommandPalette />
      <RewardOverlay />
      <BootScreen />
      {suspended && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-bg/85 p-6 backdrop-blur-md"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="takeover-title"
          data-testid="tab-takeover"
        >
          <div className="glass w-full max-w-sm rounded-os-lg p-6 text-center shadow-window animate-os-in">
            <p id="takeover-title" className="text-base font-semibold text-fg">
              Sesja wstrzymana
            </p>
            <p className="mt-2 text-sm leading-relaxed text-text2">
              {suspendedReason} Twój postęp został zapisany. Ta karta nie zapisuje już zmian, żeby nie nadpisać gry w
              drugiej karcie.
            </p>
            <OSButton variant="primary" className="mt-5 w-full" onClick={() => window.location.reload()} autoFocus>
              Graj tutaj
            </OSButton>
          </div>
        </div>
      )}
    </>
  );
}
