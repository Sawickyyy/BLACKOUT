"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface MenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export interface MenuState {
  x: number;
  y: number;
  items: (MenuItem | "separator")[];
  label: string;
}

/** Hook: `open(e, items)` from onContextMenu or a long-press handler. */
export function useContextMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null);
  return {
    menu,
    open: (x: number, y: number, label: string, items: MenuState["items"]) => setMenu({ x, y, items, label }),
    close: () => setMenu(null),
  };
}

/** Keyboard-accessible context menu (role=menu, ↑/↓/Home/End/Enter/Esc). */
export function OSContextMenu({ menu, onClose }: { menu: MenuState | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const items = (menu?.items ?? []).filter((i): i is MenuItem => i !== "separator");

  // Keep the menu fully on screen.
  useLayoutEffect(() => {
    if (!menu || !ref.current) return setPos(null);
    const r = ref.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    setPos({ x: Math.max(8, Math.min(menu.x, vw - r.width - 8)), y: Math.max(8, Math.min(menu.y, vh - r.height - 8)) });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus();
    const close = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      onClose();
    };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("resize", onClose);
    };
  }, [menu, onClose]);

  if (!menu || typeof document === "undefined") return null;

  const focusAt = (delta: number | "first" | "last") => {
    const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (!nodes.length) return;
    const cur = nodes.indexOf(document.activeElement as HTMLElement);
    const next = delta === "first" ? 0 : delta === "last" ? nodes.length - 1 : (cur + delta + nodes.length) % nodes.length;
    nodes[next]?.focus();
  };

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={menu.label}
      className="glass fixed z-[95] min-w-[208px] rounded-xl p-1.5 shadow-pop animate-os-toast"
      style={{ left: pos?.x ?? menu.x, top: pos?.y ?? menu.y, visibility: pos ? "visible" : "hidden" }}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") focusAt(1);
        else if (e.key === "ArrowUp") focusAt(-1);
        else if (e.key === "Home") focusAt("first");
        else if (e.key === "End") focusAt("last");
        else if (e.key === "Escape" || e.key === "Tab") onClose();
        else return;
        e.preventDefault();
      }}
    >
      {menu.items.map((item, i) =>
        item === "separator" ? (
          <div key={`sep-${i}`} role="separator" className="my-1 h-px bg-white/[0.07]" />
        ) : (
          <button
            key={item.id}
            role="menuitem"
            aria-disabled={item.disabled || undefined}
            tabIndex={-1}
            onClick={() => {
              if (item.disabled) return;
              onClose();
              item.onSelect();
            }}
            className={`flex min-h-[36px] w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[0.8125rem] transition-colors duration-fast focus:bg-white/[0.08] hover:bg-white/[0.08] aria-disabled:opacity-40 ${
              item.danger ? "text-danger" : "text-fg"
            }`}
          >
            <span className="flex w-4 justify-center text-text2">{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            {item.shortcut && <kbd className="font-mono text-2xs text-muted">{item.shortcut}</kbd>}
          </button>
        ),
      )}
      <span className="sr-only">{items.length} pozycji</span>
    </div>,
    document.body,
  );
}
