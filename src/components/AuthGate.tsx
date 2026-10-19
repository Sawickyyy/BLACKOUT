"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { prepareSession } from "@/lib/autosave/session";
import { getBackupStore, useGame } from "@/store/gameStore";
import GameShell from "./GameShell";

type Mode = "login" | "register";

const TAKEN_OVER = "Gra została otwarta w innej karcie lub oknie.";

export default function AuthGate() {
  const ready = useGame((s) => s.ready);
  const boot = useGame((s) => s.boot);

  const [checking, setChecking] = useState(true);
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cloud = isSupabaseConfigured();

  // Register the service worker for PWA/offline.
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  // Resume an existing session: a cloud auth session if present, otherwise the
  // most recent local identity, so a reload returns to the exact game state.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = getSupabaseBrowser();
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        if (!cancelled && data.session?.user) {
          await startCloud(data.session.user);
          if (!cancelled) setChecking(false);
          return;
        }
      }
      try {
        const last = window.localStorage.getItem("blacknet:last");
        if (!cancelled && last) await startLocal(last);
      } catch {
        /* storage blocked */
      }
      if (!cancelled) setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startCloud(user: { id: string; email?: string; user_metadata?: Record<string, unknown> }) {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    const uname =
      (user.user_metadata?.username as string) || (user.email ? user.email.split("@")[0]! : "operator");
    const prepared = await prepareSession({
      userKey: user.id,
      username: uname,
      slot: 0,
      name: `${uname} — slot 0`,
      supabase,
      backups: getBackupStore(),
      onSuperseded: () => useGame.getState().suspendSaving(TAKEN_OVER),
    });
    boot({ prepared, userKey: user.id, backend: "cloud", username: uname, email: user.email, slot: 0 });
  }

  async function startLocal(name: string) {
    const clean = name.trim() || "operator";
    const key = "local:" + clean;
    const prepared = await prepareSession({
      userKey: key,
      username: clean,
      slot: 0,
      name: `${clean} — slot 0`,
      supabase: null,
      backups: getBackupStore(),
      onSuperseded: () => useGame.getState().suspendSaving(TAKEN_OVER),
    });
    boot({ prepared, userKey: key, backend: "local", username: clean, slot: 0 });
    try {
      window.localStorage.setItem("blacknet:last", clean);
    } catch {
      /* storage blocked */
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      await startLocal(username || email);
      return;
    }
    setBusy(true);
    try {
      if (mode === "register") {
        if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
          setMsg("Nazwa użytkownika: 3–24 znaki (litery, cyfry, _).");
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username }, emailRedirectTo: window.location.origin },
        });
        if (error) {
          setMsg(error.message);
          return;
        }
        if (data.session?.user) {
          await startCloud(data.session.user);
        } else {
          setMsg("Konto utworzone. Sprawdź e-mail, aby je potwierdzić, potem zaloguj się.");
          setMode("login");
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setMsg(error.message);
          return;
        }
        if (data.session?.user) await startCloud(data.session.user);
      }
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    const supabase = getSupabaseBrowser();
    if (!supabase || !email) {
      setMsg("Podaj adres e-mail, aby zresetować hasło.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    setMsg(error ? error.message : "Wysłaliśmy link do resetu hasła na podany adres.");
  }

  if (ready) return <GameShell />;

  if (checking) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-bg text-accent">
        <span className="animate-flicker glow-text">ładowanie BLACKNET…</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-bg p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="glow-text text-3xl font-bold text-accent">BLACKNET</h1>
          <p className="mt-1 text-xs text-muted">symulator hakera • fikcyjny, odizolowany internet</p>
        </div>

        <div className="surface rounded-lg p-5">
          {cloud && (
            <div className="mb-4 flex gap-2">
              <button
                className={`btn flex-1 py-1.5 ${mode === "login" ? "btn-primary" : ""}`}
                onClick={() => setMode("login")}
              >
                Logowanie
              </button>
              <button
                className={`btn flex-1 py-1.5 ${mode === "register" ? "btn-primary" : ""}`}
                onClick={() => setMode("register")}
              >
                Rejestracja
              </button>
            </div>
          )}

          <form onSubmit={submit} className="space-y-3">
            {(mode === "register" || !cloud) && (
              <input
                className="input"
                placeholder="nazwa użytkownika"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
              />
            )}
            {cloud && (
              <>
                <input
                  className="input"
                  type="email"
                  placeholder="e-mail"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoCapitalize="none"
                  required
                />
                <input
                  className="input"
                  type="password"
                  placeholder="hasło"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </>
            )}

            <button className="btn btn-primary w-full py-2" disabled={busy} type="submit">
              {!cloud ? "Rozpocznij grę" : mode === "login" ? "Zaloguj się" : "Utwórz konto"}
            </button>
          </form>

          {cloud && mode === "login" && (
            <button className="mt-2 w-full text-center text-[11px] text-muted hover:text-accent" onClick={resetPassword}>
              Zapomniałeś hasła?
            </button>
          )}

          {msg && <p className="mt-3 text-center text-xs text-warn">{msg}</p>}

          {cloud && (
            <>
              <div className="my-4 flex items-center gap-2 text-[10px] text-muted">
                <div className="h-px flex-1 bg-line" />
                lub
                <div className="h-px flex-1 bg-line" />
              </div>
              <button className="btn w-full py-1.5" onClick={() => void startLocal(username || "operator")}>
                Graj lokalnie (bez konta)
              </button>
            </>
          )}
        </div>

        <p className="mt-4 text-center text-[10px] text-muted">
          Wszystkie systemy, sieci i organizacje w grze są fikcyjne. Żadne polecenie nie opuszcza symulacji.
        </p>
      </div>
    </div>
  );
}
