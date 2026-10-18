"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useGame } from "@/store/gameStore";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <div className="p-3 text-xs text-muted">Ładowanie edytora…</div>,
});

function langFor(name: string): string {
  if (name.endsWith(".json")) return "json";
  if (name.endsWith(".yml") || name.endsWith(".yaml")) return "yaml";
  if (name.endsWith(".sh")) return "shell";
  if (name.endsWith(".php")) return "php";
  if (name.endsWith(".sql")) return "sql";
  if (name.endsWith(".md")) return "markdown";
  if (name.endsWith(".html")) return "html";
  return "plaintext";
}

export default function FilesPanel() {
  const engine = useGame((s) => s.engine);
  const mutate = useGame((s) => s.mutate);
  const tick = useGame((s) => s.tick);
  const [dir, setDir] = useState("");
  const [file, setFile] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize to the current session cwd.
  useEffect(() => {
    if (engine && dir === "") setDir(engine.player.session.cwd);
  }, [engine, dir]);

  const listing = useMemo(() => {
    if (!engine || !dir) return { ok: false as const, error: "" };
    return engine.fsList(dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, dir, tick]);

  if (!engine) return null;

  const go = (name: string) => {
    if (name === "..") {
      const parts = dir.split("/").filter(Boolean);
      parts.pop();
      setDir("/" + parts.join("/"));
    } else {
      setDir(dir === "/" ? "/" + name : dir + "/" + name);
    }
    setFile(null);
  };

  const openFile = (name: string) => {
    const path = dir === "/" ? "/" + name : dir + "/" + name;
    const res = engine.fsRead(path);
    if (res.ok) {
      setFile(path);
      setContent(res.content);
      setDirty(false);
      setError(null);
    } else {
      setError(res.error);
    }
  };

  const save = () => {
    if (!file) return;
    mutate((e) => {
      const res = e.fsWrite(file, content);
      if (!res.ok) setError(res.error);
      else {
        setError(null);
        setDirty(false);
      }
    });
  };

  return (
    <div className="flex h-full flex-col p-3 text-xs">
      <h2 className="mb-2 text-sm font-bold text-accent">Pliki — {engine.currentHost().hostname}</h2>
      <div className="mb-2 truncate text-muted">{dir || "/"}</div>

      {!file && (
        <div className="flex-1 space-y-1 overflow-auto">
          {dir !== "/" && (
            <button className="block w-full text-left text-accent2" onClick={() => go("..")}>
              ../
            </button>
          )}
          {listing.ok ? (
            listing.entries.map((e) => (
              <button
                key={e.name}
                className={`block w-full text-left ${e.type === "dir" ? "text-accent2" : "text-fg"}`}
                onClick={() => (e.type === "dir" ? go(e.name) : openFile(e.name))}
              >
                {e.type === "dir" ? e.name + "/" : e.name}
              </button>
            ))
          ) : (
            <p className="text-danger">{listing.error || "Brak dostępu do katalogu"}</p>
          )}
        </div>
      )}

      {file && (
        <div className="flex flex-1 flex-col">
          <div className="mb-1 flex items-center gap-2">
            <button className="btn py-1" onClick={() => setFile(null)}>
              ← wstecz
            </button>
            <span className="flex-1 truncate text-muted">{file}</span>
            <button className="btn btn-primary py-1" disabled={!dirty} onClick={save}>
              Zapisz
            </button>
          </div>
          {error && <p className="mb-1 text-danger">{error}</p>}
          <div className="min-h-[240px] flex-1 overflow-hidden rounded border border-line">
            <MonacoEditor
              height="100%"
              theme="vs-dark"
              language={langFor(file)}
              value={content}
              onChange={(v) => {
                setContent(v ?? "");
                setDirty(true);
              }}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: "JetBrains Mono, monospace",
                scrollBeyondLastLine: false,
                wordWrap: "on",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
