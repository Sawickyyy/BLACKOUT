"use client";

// CCTV — a live-view client for network video recorders the player has taken
// over. The footage is drawn procedurally on a canvas (there is no real video
// anywhere in the game), but the player genuinely has to WATCH it: the details
// a mission asks for — a van's plate, the time an intruder enters, a service
// code on a whiteboard — are rendered into the frame only during the event
// window, so they must switch cameras and scrub the timeline to find them.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Clock, Pause, Play, Radio, Video, VideoOff } from "lucide-react";
import type { CameraFeed, CameraSystem } from "@/engine/types";
import { useGame } from "@/store/gameStore";
import { playSound } from "../sound";
import { OSButton, OSEmptyState } from "../ui";

const DAY = 24 * 3600;

function hhmmss(sec: number): string {
  const s = ((Math.floor(sec) % DAY) + DAY) % DAY;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  return [h, m, ss].map((n) => String(n).padStart(2, "0")).join(":");
}

/** The active event on a feed at time `t`, if any. */
function activeEvent(feed: CameraFeed, t: number) {
  return feed.events.find((e) => t >= e.at && t <= e.at + e.duration) ?? null;
}

/** Deterministic pseudo-random in [0,1) from an integer seed. */
function rng(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Draw one frame of a feed at time `t` onto a 2D context sized w×h. Scenes are
 * stylised vector art; the mission detail (if the clock is inside an event
 * window) is drawn legibly so the player can read it off the screen.
 */
function drawFeed(c: CanvasRenderingContext2D, feed: CameraFeed, t: number, w: number, h: number) {
  c.clearRect(0, 0, w, h);
  // Night-time base: cameras run from a dark-green/grey IR-ish palette.
  c.fillStyle = "#0a0f0d";
  c.fillRect(0, 0, w, h);

  const ev = activeEvent(feed, t);
  const night = true;
  const floor = h * 0.62;

  const grad = c.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, night ? "#0c1512" : "#16211d");
  grad.addColorStop(1, "#050807");
  c.fillStyle = grad;
  c.fillRect(0, 0, w, h);

  c.strokeStyle = "rgba(120,160,150,0.12)";
  c.lineWidth = 1;

  if (feed.scene === "offline") {
    c.fillStyle = "#050807";
    c.fillRect(0, 0, w, h);
    return;
  }

  if (feed.scene === "parking" || feed.scene === "dock") {
    // Asphalt + parking lines; a van drives in during the event.
    c.fillStyle = "#0e1412";
    c.fillRect(0, floor, w, h - floor);
    for (let i = 0; i < 6; i++) {
      const x = (w / 6) * i + (w / 12);
      c.strokeStyle = "rgba(150,170,160,0.18)";
      c.beginPath();
      c.moveTo(x, floor + 6);
      c.lineTo(x + 18, h - 6);
      c.stroke();
    }
    if (ev) {
      // Progress of the vehicle across the event window; it drives in and parks.
      const p = Math.min(1, (t - ev.at) / ev.duration);
      const vw = w * 0.34;
      const vh = h * 0.24;
      const vx = w * (0.08 + Math.min(0.42, p * 1.2) * 0.5);
      const vy = floor - vh * 0.1;
      // body
      c.fillStyle = "#1a2a33";
      c.fillRect(vx, vy, vw, vh);
      // cab
      c.fillStyle = "#223843";
      c.fillRect(vx + vw * 0.02, vy - vh * 0.42, vw * 0.46, vh * 0.46);
      // windscreen
      c.fillStyle = "#0f1c22";
      c.fillRect(vx + vw * 0.06, vy - vh * 0.34, vw * 0.36, vh * 0.3);
      // wheels
      c.fillStyle = "#05080a";
      c.beginPath();
      c.arc(vx + vw * 0.22, vy + vh, vh * 0.16, 0, Math.PI * 2);
      c.arc(vx + vw * 0.8, vy + vh, vh * 0.16, 0, Math.PI * 2);
      c.fill();
      // headlight glow
      c.fillStyle = "rgba(255,245,200,0.22)";
      c.beginPath();
      c.arc(vx + vw, vy + vh * 0.5, vh * 0.7, 0, Math.PI * 2);
      c.fill();
      // Licence plate — the detail the mission wants the player to read.
      if (ev.detail && ev.detail.includes("tablica")) {
        const plate = ev.detail.split(":")[1]?.trim() ?? "";
        const pw = vw * 0.5;
        const ph = vh * 0.3;
        const px = vx + vw * 0.42;
        const py = vy + vh * 0.5;
        c.fillStyle = "#edeee6";
        c.fillRect(px, py, pw, ph);
        c.strokeStyle = "#2b6cc4";
        c.lineWidth = 2;
        c.strokeRect(px, py, pw, ph);
        c.fillStyle = "#101010";
        c.font = `bold ${Math.round(ph * 0.66)}px "JetBrains Mono", monospace`;
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText(plate, px + pw / 2, py + ph / 2);
        c.textAlign = "left";
        c.textBaseline = "alphabetic";
      }
    }
  } else if (feed.scene === "lobby" || feed.scene === "corridor") {
    // Floor + a doorway; a figure walks in during the event.
    c.fillStyle = "#0d1512";
    c.fillRect(0, floor, w, h - floor);
    c.strokeStyle = "rgba(140,170,160,0.2)";
    c.strokeRect(w * 0.08, h * 0.2, w * 0.18, h * 0.5); // door
    if (ev) {
      const p = (t - ev.at) / ev.duration;
      const fx = w * (0.18 + p * 0.45);
      const fy = floor;
      const fh = (h - floor) + h * 0.18;
      c.fillStyle = "#223038";
      // body
      c.fillRect(fx, fy - fh * 0.62, fh * 0.16, fh * 0.6);
      // head
      c.beginPath();
      c.arc(fx + fh * 0.08, fy - fh * 0.68, fh * 0.09, 0, Math.PI * 2);
      c.fill();
    }
  } else if (feed.scene === "server") {
    // Server racks; a whiteboard shows a maintenance code during the event.
    for (let i = 0; i < 5; i++) {
      const x = w * (0.06 + i * 0.13);
      c.fillStyle = "#0f1a1e";
      c.fillRect(x, h * 0.18, w * 0.1, h * 0.6);
      for (let j = 0; j < 10; j++) {
        c.fillStyle = rng(i * 100 + j + Math.floor(t / 2)) > 0.5 ? "#2bd67b" : "#143b2a";
        c.fillRect(x + 4, h * 0.2 + j * (h * 0.055), 4, 4);
      }
    }
    if (ev && ev.detail && ev.detail.includes("kod")) {
      const code = ev.detail.split(":")[1]?.trim() ?? "";
      const bw = w * 0.3;
      const bh = h * 0.2;
      const bx = w * 0.64;
      const by = h * 0.3;
      c.fillStyle = "#f3f4ee";
      c.fillRect(bx, by, bw, bh);
      c.fillStyle = "#1b61c4";
      c.font = `bold ${Math.round(bh * 0.4)}px "JetBrains Mono", monospace`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(code, bx + bw / 2, by + bh / 2);
      c.textAlign = "left";
    }
  }

  // Sensor noise.
  c.globalAlpha = 0.05;
  for (let i = 0; i < 40; i++) {
    const nx = rng(i + Math.floor(t * 8)) * w;
    const ny = rng(i * 7 + Math.floor(t * 8)) * h;
    c.fillStyle = "#cfe";
    c.fillRect(nx, ny, 1, 1);
  }
  c.globalAlpha = 1;

  // Scanline sweep.
  const sweep = (t * 40) % h;
  c.fillStyle = "rgba(120,220,170,0.04)";
  c.fillRect(0, sweep, w, 2);
}

function FeedCanvas({ feed, time }: { feed: CameraFeed; time: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const parent = canvas.parentElement!;
    const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawFeed(ctx, feed, time, w, h);
  }, [feed, time]);

  return <canvas ref={ref} className="h-full w-full" data-testid="cctv-canvas" aria-label={`Podgląd kamery ${feed.name}`} />;
}

export default function CctvApp({ mobile }: { mobile: boolean }) {
  const engine = useGame((s) => s.engine)!;
  const viewCamera = useGame((s) => s.viewCamera);
  const tick = useGame((s) => s.tick);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute when access changes
  const systems = useMemo(() => engine.cctvSystems(), [engine, tick]);

  const [sysIdx, setSysIdx] = useState(0);
  const sys = systems[sysIdx];
  const [feedId, setFeedId] = useState<string>(sys?.system?.feeds[0]?.id ?? "");
  const feed = sys?.system?.feeds.find((f) => f.id === feedId) ?? sys?.system?.feeds[0];

  // Start a little before the night's activity so the player must scrub in.
  const [time, setTime] = useState(2 * 3600);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(60); // simulated seconds per real second
  const raf = useRef<number | null>(null);
  const last = useRef<number>(0);

  // Record the view (latches "watch the feed" objectives) when a feed opens.
  useEffect(() => {
    if (sys && feed) viewCamera(sys.hostId, feed.id);
  }, [sys, feed, viewCamera]);

  // Playback loop.
  useEffect(() => {
    if (!playing) {
      if (raf.current) cancelAnimationFrame(raf.current);
      return;
    }
    last.current = performance.now();
    const step = (now: number) => {
      const dt = (now - last.current) / 1000;
      last.current = now;
      setTime((t) => (t + dt * speed) % DAY);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, speed]);

  const selectFeed = useCallback(
    (id: string) => {
      setFeedId(id);
      playSound("click");
      const s = systems[sysIdx];
      if (s) viewCamera(s.hostId, id);
    },
    [systems, sysIdx, viewCamera],
  );

  const snapshot = useCallback(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="cctv-canvas"]');
    if (!canvas || !feed) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `cctv_${feed.id}_${hhmmss(time).replace(/:/g, "")}.png`;
    a.click();
    playSound("click");
  }, [feed, time]);

  if (systems.length === 0 || !sys || !feed) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <OSEmptyState icon={<VideoOff size={22} />} title="Brak dostępnych kamer">
          Przejmij rejestrator wideo (NVR) w sieci BLACKNET, aby zobaczyć tu podgląd na żywo. Zacznij od zlecenia
          „Oko w sieci”: odkryj host, zdobądź konto operatora i zaloguj się przez <code className="font-mono">ssh</code>.
        </OSEmptyState>
      </div>
    );
  }

  const ev = activeEvent(feed, time);

  const feedList = (
    <div className={mobile ? "flex gap-2 overflow-x-auto pb-1" : "flex w-[180px] shrink-0 flex-col gap-1.5"}>
      {sys.system!.feeds.map((f) => {
        const active = f.id === feed.id;
        const hasMotion = f.events.length > 0;
        return (
          <button
            key={f.id}
            onClick={() => selectFeed(f.id)}
            aria-pressed={active}
            className={`flex shrink-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors ${
              active ? "border-accent/60 bg-accent/10 text-fg" : "border-white/10 bg-white/[0.03] text-text2 hover:text-fg"
            }`}
          >
            <Camera size={14} className={active ? "text-accent" : "text-muted"} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{f.name}</span>
              {f.zone && <span className="block truncate text-2xs text-muted">{f.zone}</span>}
            </span>
            {hasMotion && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent2" title="zdarzenia ruchu" />}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        {systems.length > 1 && (
          <select
            value={sysIdx}
            onChange={(e) => {
              const i = Number(e.target.value);
              setSysIdx(i);
              setFeedId(systems[i]?.system?.feeds[0]?.id ?? "");
            }}
            className="rounded-lg border border-white/10 bg-elevated px-2 py-1 text-xs text-fg"
            aria-label="Wybierz rejestrator"
          >
            {systems.map((s, i) => (
              <option key={s.hostId} value={i}>
                {s.system!.label} — {s.hostname}
              </option>
            ))}
          </select>
        )}
        <span className="flex items-center gap-1.5 text-2xs text-text2">
          <Radio size={12} className="text-danger" /> {sys.system!.label} · {sys.hostname}
        </span>
      </div>

      <div className={mobile ? "flex flex-col gap-3" : "flex min-h-0 flex-1 gap-3"}>
        {feedList}

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black">
            <FeedCanvas feed={feed} time={time} />
            {/* On-screen OSD overlay */}
            <div className="pointer-events-none absolute inset-0 p-2 font-mono text-[11px] text-ok/90">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 rounded bg-black/40 px-1.5 py-0.5">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" /> REC · {feed.name}
                </span>
                <span className="rounded bg-black/40 px-1.5 py-0.5" data-testid="cctv-clock">
                  {hhmmss(time)}
                </span>
              </div>
              {ev && (
                // The label hints that something is happening; the actual
                // detail (plate, code, entry time) must be read off the frame.
                <div className="absolute inset-x-2 bottom-2 rounded bg-black/55 px-2 py-1 text-ok">● {ev.label}</div>
              )}
            </div>
          </div>

          {/* Transport + timeline */}
          <div className="flex items-center gap-2">
            <OSButton size="sm" variant="secondary" onClick={() => setPlaying((p) => !p)} icon={playing ? <Pause size={14} /> : <Play size={14} />}>
              {playing ? "Pauza" : "Odtwarzaj"}
            </OSButton>
            <input
              type="range"
              min={0}
              max={DAY - 1}
              value={Math.floor(time)}
              onChange={(e) => {
                setPlaying(false);
                setTime(Number(e.target.value));
              }}
              className="h-1.5 min-w-0 flex-1 accent-[rgb(var(--accent))]"
              aria-label="Oś czasu nagrania"
              data-testid="cctv-timeline"
            />
            <select
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="rounded-lg border border-white/10 bg-elevated px-1.5 py-1 text-2xs text-text2"
              aria-label="Prędkość odtwarzania"
            >
              {[30, 60, 120, 300].map((s) => (
                <option key={s} value={s}>
                  {s}×
                </option>
              ))}
            </select>
            <OSButton size="sm" variant="secondary" onClick={snapshot} icon={<Camera size={14} />}>
              Zrzut
            </OSButton>
          </div>

          {/* Motion log — realistic NVR event list; click to jump. */}
          {feed.events.length > 0 && (
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
              <p className="os-label mb-1 flex items-center gap-1.5">
                <Clock size={11} /> Dziennik ruchu — {feed.name}
              </p>
              <ul className="space-y-0.5">
                {feed.events.map((e, i) => (
                  <li key={i}>
                    <button
                      onClick={() => {
                        setPlaying(false);
                        setTime(e.at + 2);
                        playSound("click");
                      }}
                      className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-2xs text-text2 hover:bg-white/5 hover:text-fg"
                    >
                      <span className="font-mono text-accent">{hhmmss(e.at)}</span>
                      <span className="min-w-0 flex-1 truncate">{e.label}</span>
                      <Video size={11} className="shrink-0 text-muted" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
