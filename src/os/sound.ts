"use client";

// Tiny synthesised sound layer. No audio files — every effect is generated
// with the Web Audio API on demand, so there is nothing to download and the
// whole thing is a few hundred bytes. Sound is a per-device UI preference
// (muted by default on phones); playSound is a no-op when it is off or when
// the browser has no audio. Effects are deliberately short and quiet.

import { usePrefs } from "./prefs";

export type SoundKind = "key" | "click" | "alarm" | "success" | "error";

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!ctx) ctx = new Ctor();
    // Browsers suspend the context until a gesture; resume best-effort.
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** One short enveloped tone. */
function tone(
  ac: AudioContext,
  opts: { freq: number; type?: OscillatorType; dur: number; gain?: number; at?: number; slideTo?: number },
) {
  const { freq, type = "sine", dur, gain = 0.06, at = 0, slideTo } = opts;
  const t0 = ac.currentTime + at;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + Math.min(0.01, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** Play an effect if the player has sound enabled. Safe to call anywhere. */
export function playSound(kind: SoundKind): void {
  let enabled = true;
  try {
    enabled = usePrefs.getState().sound;
  } catch {
    enabled = false;
  }
  if (!enabled) return;
  const ac = audio();
  if (!ac) return;
  try {
    switch (kind) {
      case "key":
        tone(ac, { freq: 1500 + Math.random() * 300, type: "square", dur: 0.025, gain: 0.015 });
        break;
      case "click":
        tone(ac, { freq: 660, type: "triangle", dur: 0.06, gain: 0.04 });
        break;
      case "success":
        tone(ac, { freq: 523.25, type: "triangle", dur: 0.12, gain: 0.05 });
        tone(ac, { freq: 659.25, type: "triangle", dur: 0.12, gain: 0.05, at: 0.1 });
        tone(ac, { freq: 783.99, type: "triangle", dur: 0.2, gain: 0.05, at: 0.2 });
        break;
      case "error":
        tone(ac, { freq: 220, type: "sawtooth", dur: 0.18, gain: 0.05, slideTo: 140 });
        break;
      case "alarm":
        tone(ac, { freq: 880, type: "sawtooth", dur: 0.22, gain: 0.05, slideTo: 440 });
        tone(ac, { freq: 880, type: "sawtooth", dur: 0.22, gain: 0.05, at: 0.26, slideTo: 440 });
        break;
    }
  } catch {
    /* audio failed — ignore */
  }
}

/** A one-off chirp so the player hears the result of toggling sound on. */
export function previewSound(): void {
  playSound("click");
}
