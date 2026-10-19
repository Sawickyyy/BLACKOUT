"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Maximize2, Minimize2, Minus, X } from "lucide-react";
import { APPS, type AppId } from "./apps";
import { useWM } from "./wm";

type Edge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const EDGES: { edge: Edge; cls: string; cursor: string }[] = [
  { edge: "n", cls: "top-0 left-3 right-3 h-1.5", cursor: "ns-resize" },
  { edge: "s", cls: "bottom-0 left-3 right-3 h-1.5", cursor: "ns-resize" },
  { edge: "e", cls: "right-0 top-3 bottom-3 w-1.5", cursor: "ew-resize" },
  { edge: "w", cls: "left-0 top-3 bottom-3 w-1.5", cursor: "ew-resize" },
  { edge: "ne", cls: "right-0 top-0 h-3 w-3", cursor: "nesw-resize" },
  { edge: "nw", cls: "left-0 top-0 h-3 w-3", cursor: "nwse-resize" },
  { edge: "se", cls: "right-0 bottom-0 h-3 w-3", cursor: "nwse-resize" },
  { edge: "sw", cls: "left-0 bottom-0 h-3 w-3", cursor: "nesw-resize" },
];

/**
 * A desktop window. `persistent` windows (the terminal) stay mounted when
 * closed or minimised — only hidden — so long-lived state like xterm survives.
 */
export default function OSWindow({
  id,
  children,
  persistent = false,
  subtitle,
  onFocused,
}: {
  id: AppId;
  children: ReactNode;
  persistent?: boolean;
  subtitle?: ReactNode;
  onFocused?: () => void;
}) {
  const win = useWM((s) => s.wins[id]);
  const bounds = useWM((s) => s.bounds);
  const isFocused = useWM((s) => s.focused === id);
  const { focus, close, minimize, toggleMaximize, setGeometry } = useWM.getState();
  const app = APPS[id];
  const Icon = app.icon;
  const [closing, setClosing] = useState(false);
  const drag = useRef<{ mode: "move" | Edge; sx: number; sy: number; x: number; y: number; w: number; h: number } | null>(
    null,
  );
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (win.open) setClosing(false);
  }, [win.open]);

  const visible = win.open && !win.minimized && !closing;
  if (!win.open && !persistent && !closing) return null;

  const geo = win.maximized
    ? { x: 0, y: 0, w: bounds.width, h: bounds.height }
    : { x: win.x, y: win.y, w: win.w, h: win.h };

  const onPointerDown = (mode: "move" | Edge) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (mode === "move" && (e.target as HTMLElement).closest("button")) return;
    if (mode === "move" && win.maximized) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { mode, sx: e.clientX, sy: e.clientY, ...geo };
    focus(id);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      if (d.mode === "move") return setGeometry(id, { x: d.x + dx, y: d.y + dy });
      const g = { x: d.x, y: d.y, w: d.w, h: d.h };
      if (d.mode.includes("e")) g.w = d.w + dx;
      if (d.mode.includes("s")) g.h = d.h + dy;
      if (d.mode.includes("w")) {
        g.w = Math.max(app.min.w, d.w - dx);
        g.x = d.x + (d.w - g.w);
      }
      if (d.mode.includes("n")) {
        g.h = Math.max(app.min.h, d.h - dy);
        g.y = Math.max(0, d.y + (d.h - g.h));
      }
      setGeometry(id, g);
    });
  };

  const endDrag = () => {
    drag.current = null;
  };

  const doClose = () => {
    if (persistent) return close(id);
    setClosing(true);
    setTimeout(() => close(id), 150);
  };

  return (
    // Outer box: geometry only (GPU translate). Inner section: animation/scale,
    // so keyframes never fight with the window position.
    <div
      className={`absolute left-0 top-0 ${visible ? "" : "pointer-events-none"}`}
      style={{ width: geo.w, height: geo.h, zIndex: win.z, transform: `translate3d(${geo.x}px, ${geo.y}px, 0)` }}
    >
    <section
      aria-label={app.title}
      data-window={id}
      data-focused={isFocused || undefined}
      onPointerDownCapture={() => {
        if (!isFocused) focus(id);
        onFocused?.();
      }}
      className={`relative flex h-full w-full flex-col overflow-hidden rounded-os-lg border transition-[opacity,transform,box-shadow,border-color,visibility] duration-base ease-os ${
        isFocused ? "border-white/[0.13] shadow-window" : "border-white/[0.07] shadow-pop"
      } ${visible ? "scale-100 opacity-100" : "invisible scale-[0.94] opacity-0"} ${
        win.open && !closing && !persistent ? "animate-os-in" : ""
      }`}
      style={{ background: "rgb(var(--surface))" }}
    >
      <header
        onPointerDown={onPointerDown("move")}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={(e) => {
          if (!(e.target as HTMLElement).closest("button")) toggleMaximize(id);
        }}
        className={`glass flex h-10 shrink-0 cursor-default touch-none select-none items-center gap-2.5 rounded-none border-0 border-b px-3 ${
          isFocused ? "" : "[&_*]:opacity-80"
        }`}
        style={{ borderColor: "rgb(var(--line) / var(--line-alpha))" }}
      >
        <span
          className="flex h-6 w-6 items-center justify-center rounded-md"
          style={{ background: `rgb(${app.tint} / 0.16)`, color: `rgb(${app.tint})` }}
          aria-hidden
        >
          <Icon size={14} strokeWidth={2.2} />
        </span>
        <h2 className="truncate text-[0.8125rem] font-semibold tracking-tight text-fg">{app.title}</h2>
        {subtitle && <div className="min-w-0 truncate text-2xs text-muted">{subtitle}</div>}
        <div className="ml-auto flex items-center gap-0.5">
          <button
            aria-label={`Minimalizuj: ${app.title}`}
            onClick={() => minimize(id)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-text2 hover:bg-white/[0.08] hover:text-fg"
          >
            <Minus size={14} />
          </button>
          <button
            aria-label={win.maximized ? `Przywróć rozmiar: ${app.title}` : `Maksymalizuj: ${app.title}`}
            onClick={() => toggleMaximize(id)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-text2 hover:bg-white/[0.08] hover:text-fg"
          >
            {win.maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button
            aria-label={`Zamknij: ${app.title}`}
            onClick={doClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-text2 hover:bg-danger/80 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">{children}</div>

      {!win.maximized &&
        EDGES.map(({ edge, cls, cursor }) => (
          <div
            key={edge}
            aria-hidden
            className={`absolute z-10 touch-none ${cls}`}
            style={{ cursor }}
            onPointerDown={onPointerDown(edge)}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
        ))}
    </section>
    </div>
  );
}
