"use client";

// A tiny bridge so UI controls outside the terminal (mobile key bar, palette,
// toolbar) can inject keystrokes into the active terminal's input handler,
// focus it, or read the current selection.

type InputHandler = (data: string) => void;

let inputHandler: InputHandler | null = null;
let focusHandler: (() => void) | null = null;
let selectionHandler: (() => string) | null = null;

export function registerTerminal(handlers: {
  onInput: InputHandler;
  focus: () => void;
  getSelection?: () => string;
}): () => void {
  inputHandler = handlers.onInput;
  focusHandler = handlers.focus;
  selectionHandler = handlers.getSelection ?? null;
  return () => {
    inputHandler = null;
    focusHandler = null;
    selectionHandler = null;
  };
}

export function sendToTerminal(data: string): void {
  inputHandler?.(data);
}

export function focusTerminal(): void {
  focusHandler?.();
}

export function terminalSelection(): string {
  return selectionHandler?.() ?? "";
}
