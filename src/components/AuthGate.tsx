"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { Loader2, LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react";
import { prepareSession } from "@/lib/autosave/session";
import { getBackupStore, useGame } from "@/store/gameStore";
import OSRoot from "@/os/OSRoot";
import Logo from "@/os/shell/Logo";
import { OSButton, OSInput } from "@/os/ui";

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

  if (ready) return <OSRoot />;

  if (checking) {
    return (
      <div className="os-wallpaper flex h-[100dvh] flex-col items-center justify-center gap-4 text-text2" style={{ height: "var(--app-h)" }}>
        <Logo size={44} className="animate-os-pulse" />
        <span className="flex items-center gap-2 text-sm">
          <Loader2 size={15} className="animate-spin" /> Wczytywanie BLACKNET OS…
        </span>
      </div>
    );
  }

  return (
    <div className="os-wallpaper relative flex min-h-[100dvh] items-center justify-center overflow-hidden p-5 safe-x" style={{ minHeight: "var(--app-h)" }}>
      <div className="os-grid pointer-events-none absolute inset-0 animate-os-drift" aria-hidden />
      <div className="relative w-full max-w-[400px] animate-os-in">
        <div className="mb-7 flex flex-col items-center text-center">
          <Logo size={56} className="drop-shadow-[0_0_28px_rgb(var(--accent)/0.4)]" />
          <h1 className="mt-4 text-3xl font-bold tracking-[0.18em] text-fg">BLACKNET</h1>
          <p className="os-label mt-1.5">System operacyjny operatora</p>
        </div>

        <div className="glass rounded-os-lg p-6 shadow-window">
          {cloud && (
            <div role="tablist" aria-label="Tryb" className="mb-5 flex gap-1 rounded-xl border hairline bg-bg/40 p-1">
              {(["login", "register"] as const).map((m) => (
                <button
                  key={m}
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => {
                    setMode(m);
                    setMsg(null);
                  }}
                  className={`flex-1 rounded-lg py-2 text-xs font-medium transition-colors ${
                    mode === m ? "bg-elevated text-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]" : "text-text2 hover:text-fg"
                  }`}
                >
                  {m === "login" ? "Logowanie" : "Rejestracja"}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={submit} className="space-y-3" noValidate>
            {(mode === "register" || !cloud) && (
              <OSInput
                label="Nazwa operatora"
                leading={<UserRound size={15} />}
                placeholder="np. ghost_01"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                hint={!cloud ? "Zapisujesz lokalnie na tym urządzeniu" : undefined}
              />
            )}
            {cloud && (
              <>
                <OSInput
                  label="E-mail"
                  type="email"
                  leading={<Mail size={15} />}
                  placeholder="operator@przyklad.pl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoCapitalize="none"
                  required
                />
                <OSInput
                  label="Hasło"
                  type="password"
                  leading={<LockKeyhole size={15} />}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </>
            )}

            <OSButton type="submit" variant="primary" size="lg" loading={busy} className="w-full">
              {!cloud ? "Uruchom BLACKNET OS" : mode === "login" ? "Zaloguj się" : "Utwórz konto"}
            </OSButton>
          </form>

          {cloud && mode === "login" && (
            <button type="button" className="mt-2.5 w-full text-center text-2xs text-muted transition-colors hover:text-accent" onClick={resetPassword}>
              Nie pamiętasz hasła?
            </button>
          )}

          {msg && (
            <p className="mt-3 rounded-lg border border-warn/25 bg-warn/[0.08] px-3 py-2 text-center text-xs text-warn" role="status">
              {msg}
            </p>
          )}

          {cloud && (
            <>
              <div className="my-5 flex items-center gap-3 text-2xs text-muted">
                <span className="h-px flex-1 bg-white/10" />
                lub
                <span className="h-px flex-1 bg-white/10" />
              </div>
              <OSButton variant="secondary" size="md" className="w-full" onClick={() => void startLocal(username || "operator")}>
                Graj lokalnie (bez konta)
              </OSButton>
            </>
          )}
        </div>

        <p className="mx-auto mt-5 flex max-w-xs items-start justify-center gap-1.5 text-center text-2xs leading-relaxed text-muted">
          <ShieldCheck size={13} className="mt-0.5 shrink-0" aria-hidden />
          Wszystkie systemy, sieci i organizacje w grze są fikcyjne. Żadne polecenie nie opuszcza symulacji.
        </p>
      </div>
    </div>
  );
}
