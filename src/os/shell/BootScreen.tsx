"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/store/gameStore";
import { usePrefs } from "../prefs";
import Logo from "./Logo";

const DURATION = 1200;

/**
 * Short OS start-up after sign-in. It runs *after* the save is loaded (it never
 * delays loading), shows real facts about the session, and can be skipped.
 * Not shown with reduced motion or when disabled in Settings.
 */
export default function BootScreen() {
  const enabled = usePrefs((s) => s.bootAnimation);
  const hydrated = usePrefs((s) => s.hydrated);
  const engine = useGame((s) => s.engine);
  const backend = useGame((s) => s.backend);
  const reducedSave = useGame((s) => s.engine?.player.settings.reducedMotion ?? false);
  const [phase, setPhase] = useState<"pending" | "show" | "out" | "done">("pending");

  useEffect(() => {
    if (!hydrated || phase !== "pending") return;
    const reduced = reducedSave || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!enabled || reduced) return setPhase("done");
    setPhase("show");
  }, [hydrated, enabled, reducedSave, phase]);

  useEffect(() => {
    if (phase !== "show") return;
    const t1 = setTimeout(() => setPhase("out"), DURATION);
    const skip = () => setPhase("out");
    window.addEventListener("keydown", skip);
    return () => {
      clearTimeout(t1);
      window.removeEventListener("keydown", skip);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "out") return;
    const t = setTimeout(() => setPhase("done"), 260);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase === "done" || phase === "pending" || !engine) return null;

  const p = engine.player;
  const done = Object.values(p.missions).filter((m) => m.status === "completed").length;
  const lines = [
    `Zapis wczytany · ${backend === "cloud" ? "chmura" : "to urządzenie"}`,
    `Operator: ${p.username}`,
    `Znane hosty: ${p.discovered.length}`,
    `Ukończone zlecenia: ${done}/20`,
  ];

  return (
    <div
      className={`fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center bg-bg transition-opacity duration-slow ${
        phase === "out" ? "opacity-0" : "opacity-100"
      }`}
      onClick={() => setPhase("out")}
      role="status"
      aria-label="Uruchamianie BLACKNET OS"
      data-testid="boot-screen"
    >
      <div className="os-wallpaper absolute inset-0" aria-hidden />
      <div className="relative flex flex-col items-center animate-os-fade">
        <Logo size={64} className="drop-shadow-[0_0_24px_rgb(var(--accent)/0.45)]" />
        <p className="mt-5 text-2xl font-semibold tracking-[0.2em] text-fg">BLACKNET</p>
        <p className="os-label mt-1">System operacyjny operatora</p>
        <div className="mt-8 h-[3px] w-56 overflow-hidden rounded-full bg-white/10">
          <div className="h-full origin-left rounded-full bg-accent" style={{ animation: `bn-boot ${DURATION}ms var(--ease-out) forwards` }} />
        </div>
        <ul className="mt-6 space-y-1 text-center font-mono text-2xs text-text2">
          {lines.map((l, i) => (
            <li key={l} className="animate-os-up" style={{ animationDelay: `${120 + i * 160}ms` }}>
              {l}
            </li>
          ))}
        </ul>
        <p className="mt-8 text-2xs text-muted">Dotknij lub naciśnij dowolny klawisz, aby pominąć</p>
      </div>
      <style>{`@keyframes bn-boot { from { transform: scaleX(0) } to { transform: scaleX(1) } }`}</style>
    </div>
  );
}
