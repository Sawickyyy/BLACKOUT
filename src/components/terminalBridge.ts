"use client";

// A tiny bridge so UI controls outside the terminal (the mobile command
// toolbar) can inject keystrokes into the active terminal's input handler,
// and so other panels can request focus or a fresh prompt.

type InputHandler = (data: string) => void;

let inputHandler: InputHandler | null = null;
let focusHandler: (() => void) | null = null;

export function registerTerminal(handlers: { onInput: InputHandler; focus: () => void }): () => void {
  inputHandler = handlers.onInput;
  focusHandler = handlers.focus;
  return () => {
    inputHandler = null;
    focusHandler = null;
  };
}

export function sendToTerminal(data: string): void {
  inputHandler?.(data);
}

export function focusTerminal(): void {
  focusHandler?.();
}
