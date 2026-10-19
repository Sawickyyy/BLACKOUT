"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Globe2, Lock, RotateCw, ShieldAlert, Star } from "lucide-react";
import { useGame } from "@/store/gameStore";
import { useOS } from "../osStore";
import { OSEmptyState, OSIconButton } from "../ui";

interface Page {
  url: string;
  host: string;
  secure: boolean;
  status: "ok" | "error";
  body: string;
}

/** Wrap fictional page HTML in a styled, dark document for the sandboxed iframe. */
function document_(body: string, host: string): string {
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<base target="_blank"><style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;font-family:Inter,system-ui,-apple-system,sans-serif;background:#0d141b;color:#dbe6e4;line-height:1.6;padding:28px;max-width:860px;margin:0 auto}
h1{font-size:1.9rem;font-weight:700;letter-spacing:-.02em;margin:.2em 0 .5em;color:#eef6f3}
h2{font-size:1.25rem;margin-top:1.4em;color:#eef6f3}
a{color:#5ab8ff;text-decoration:none}a:hover{text-decoration:underline}
ul{padding-left:1.2em}li{margin:.3em 0}
pre,code{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:.85em}
pre{background:#060b10;border:1px solid #1d2a33;border-radius:10px;padding:14px;overflow:auto;color:#cfe8dd}
hr{border:none;border-top:1px solid #1d2a33;margin:1.4em 0}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #1d2a33;padding:8px 10px;text-align:left}
.ok{color:#35e6a5}
</style></head><body>${body}</body></html>`;
}

function parseHost(url: string): { host: string; secure: boolean } {
  const m = /^(\w+):\/\/([^/:]+)/.exec(url) ?? /^([^/:]+)/.exec(url.replace(/^\/\//, ""));
  return { host: m ? (m[2] ?? m[1] ?? url) : url, secure: /^https:/.test(url) };
}

export default function BrowserApp({ mobile }: { mobile: boolean }) {
  const engine = useGame((s) => s.engine)!;
  const run = useGame((s) => s.run);
  const tick = useGame((s) => s.tick);
  const browserRequest = useOS((s) => s.browserRequest);

  const [input, setInput] = useState("http://www.aurora.example/");
  const [history, setHistory] = useState<Page[]>([]);
  const [cursor, setCursor] = useState(-1);
  const [loading, setLoading] = useState(false);
  const page = history[cursor];
  const reqRef = useRef<number | null>(null);

  const bookmarks = useMemo(() => {
    return engine.player.discovered
      .map((id) => engine.world.hosts[id])
      .filter((h) => h && h.services.some((s) => s.kind === "http" || s.kind === "https"))
      .map((h) => h!.hostname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, tick]);

  const navigate = (raw: string, pushHistory = true) => {
    let url = raw.trim();
    if (!url) return;
    if (!/^\w+:\/\//.test(url)) url = "http://" + url;
    setInput(url);
    setLoading(true);
    const { host, secure } = parseHost(url);
    // Reuse the engine's curl so missions + detection react exactly as in the terminal.
    const res = run(`curl ${"'" + url.replace(/'/g, "") + "'"}`);
    // Give the loading state a beat so it is visible (no artificial delay to the engine).
    window.setTimeout(() => {
      const next: Page =
        res && res.code === 0
          ? { url, host, secure, status: "ok", body: res.stdout }
          : { url, host, secure, status: "error", body: res?.stderr ?? "Brak odpowiedzi" };
      setHistory((h) => {
        if (!pushHistory) return h;
        const trimmed = h.slice(0, cursor + 1);
        return [...trimmed, next];
      });
      setCursor((c) => (pushHistory ? c + 1 : c));
      setLoading(false);
    }, 160);
  };

  // External "open this URL" requests (from the network map, etc.).
  useEffect(() => {
    if (browserRequest && browserRequest.nonce !== reqRef.current) {
      reqRef.current = browserRequest.nonce;
      navigate(browserRequest.url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browserRequest]);

  const canBack = cursor > 0;
  const canFwd = cursor < history.length - 1;

  return (
    <div className="flex h-full flex-col bg-[#0d141b]">
      {/* chrome */}
      <div className="flex shrink-0 items-center gap-1.5 border-b hairline bg-surface px-2 py-2">
        <OSIconButton label="Wstecz" size="sm" disabled={!canBack} onClick={() => setCursor((c) => Math.max(0, c - 1))}>
          <ArrowLeft size={16} />
        </OSIconButton>
        <OSIconButton label="Dalej" size="sm" disabled={!canFwd} onClick={() => setCursor((c) => Math.min(history.length - 1, c + 1))}>
          <ArrowRight size={16} />
        </OSIconButton>
        <OSIconButton label="Odśwież" size="sm" disabled={!page} onClick={() => page && navigate(page.url, false)}>
          <RotateCw size={15} className={loading ? "animate-spin" : ""} />
        </OSIconButton>
        <form
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/[0.08] bg-bg/60 px-2.5 focus-within:border-accent/50"
          onSubmit={(e) => {
            e.preventDefault();
            navigate(input);
          }}
        >
          {page?.secure ? (
            <Lock size={13} className="shrink-0 text-ok" aria-label="Połączenie szyfrowane (symulowane)" />
          ) : (
            <Globe2 size={13} className="shrink-0 text-muted" aria-hidden />
          )}
          <input
            aria-label="Adres"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            autoCapitalize="off"
            className="h-9 min-w-0 flex-1 bg-transparent font-mono text-[16px] text-fg placeholder:text-muted focus:outline-none sm:text-xs"
            placeholder="http://www.aurora.example/"
          />
        </form>
      </div>

      {/* bookmarks */}
      {bookmarks.length > 0 && (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b hairline bg-surface/60 px-2 py-1.5">
          <Star size={12} className="shrink-0 text-muted" aria-hidden />
          {bookmarks.map((h) => (
            <button
              key={h}
              onClick={() => navigate(`http://${h}/`)}
              className={`shrink-0 whitespace-nowrap rounded-md px-2 py-1 font-mono text-2xs transition-colors ${
                page?.host === h ? "bg-accent/15 text-accent" : "text-text2 hover:bg-white/[0.06] hover:text-fg"
              }`}
            >
              {h.replace(/^www\./, "")}
            </button>
          ))}
        </div>
      )}

      {/* viewport */}
      <div className="relative min-h-0 flex-1 bg-[#0d141b]">
        {loading && (
          <div className="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-transparent">
            <div className="h-full w-1/3 animate-[os-shimmer_1s_linear_infinite] rounded-full bg-accent" style={{ backgroundImage: "none" }} />
          </div>
        )}
        {!page ? (
          <div className="flex h-full items-center justify-center">
            <OSEmptyState icon={<Globe2 size={22} />} title="Wirtualna przeglądarka BLACKNET">
              Wpisz adres i naciśnij Enter{bookmarks.length ? ", albo wybierz zakładkę powyżej" : ""}. Cała sieć jest
              fikcyjna i odizolowana — żadne żądanie nie opuszcza symulacji.
            </OSEmptyState>
          </div>
        ) : page.status === "error" ? (
          <div className="flex h-full items-center justify-center p-6">
            <OSEmptyState icon={<ShieldAlert size={22} />} title="Nie udało się połączyć">
              <span className="font-mono text-2xs">{page.body}</span>
            </OSEmptyState>
          </div>
        ) : (
          <iframe
            key={`${page.url}-${cursor}`}
            title={`Strona: ${page.host}`}
            sandbox=""
            className="h-full w-full border-0 bg-[#0d141b]"
            srcDoc={document_(page.body, page.host)}
          />
        )}
      </div>

      {/* status bar */}
      <div className="flex shrink-0 items-center gap-2 border-t hairline bg-surface px-3 py-1.5 text-2xs text-muted">
        {page ? (
          <>
            <span className={`flex items-center gap-1 ${page.secure ? "text-ok" : ""}`}>
              {page.secure ? <Lock size={11} /> : <Globe2 size={11} />}
              {page.host}
            </span>
            <span aria-hidden>·</span>
            <span className={page.status === "ok" ? "text-text2" : "text-danger"}>{page.status === "ok" ? "200 OK" : "błąd"}</span>
            {!mobile && <span className="ml-auto">sieć fikcyjna, odizolowana</span>}
          </>
        ) : (
          <span>Gotowe</span>
        )}
      </div>
    </div>
  );
}
