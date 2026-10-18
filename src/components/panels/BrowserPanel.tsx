"use client";

import { useState } from "react";
import { useGame } from "@/store/gameStore";

// A virtual browser. It routes requests through the engine (via the same curl
// command the terminal uses, so missions + detection react identically) and
// renders the returned fictional HTML in a sandboxed, script-less iframe.

export default function BrowserPanel() {
  const engine = useGame((s) => s.engine);
  const run = useGame((s) => s.run);
  useGame((s) => s.tick);
  const [url, setUrl] = useState("http://www.aurora.example/");
  const [html, setHtml] = useState<string>("");
  const [status, setStatus] = useState<string>("");

  if (!engine) return null;

  const navigate = (u: string) => {
    setUrl(u);
    const safe = "'" + u.replace(/'/g, "") + "'";
    const res = run(`curl ${safe}`);
    if (!res) return;
    if (res.code === 0) {
      setHtml(res.stdout);
      setStatus("200 OK");
    } else {
      setHtml(`<pre style="color:#b00">${res.stderr || "błąd"}</pre>`);
      setStatus("błąd połączenia");
    }
  };

  const bookmarks = engine.player.discovered
    .map((id) => engine.world.hosts[id])
    .filter((h) => h && h.services.some((s) => s.kind === "http" || s.kind === "https"))
    .map((h) => h!.hostname);

  return (
    <div className="flex h-full flex-col p-3 text-xs">
      <h2 className="mb-2 text-sm font-bold text-accent">Przeglądarka</h2>
      <form
        className="mb-2 flex gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          navigate(url);
        }}
      >
        <input className="input flex-1 py-1" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="btn btn-primary py-1" type="submit">
          Idź
        </button>
      </form>

      {bookmarks.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {bookmarks.map((h) => (
            <button key={h} className="btn py-0.5 text-[10px]" onClick={() => navigate(`http://${h}/`)}>
              {h.split(".")[0]}
            </button>
          ))}
        </div>
      )}

      {status && <div className="mb-1 text-muted">{status}</div>}

      <div className="min-h-[240px] flex-1 overflow-hidden rounded border border-line bg-white">
        <iframe
          title="virtual-browser"
          sandbox=""
          className="h-full w-full"
          srcDoc={
            html ||
            "<div style='font-family:sans-serif;color:#555;padding:20px'>Wpisz adres i naciśnij Idź. Spróbuj odkrytych stron poniżej paska adresu.</div>"
          }
        />
      </div>
    </div>
  );
}
