"use client";

// Editor — a Monaco-based file editor for the current host's virtual
// filesystem. It reads and writes through the engine's permission-checked FS
// helpers, so saving a file the session user may not write fails exactly as it
// would in the shell. Nothing here touches a real file.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { ChevronRight, File, FolderOpen, RefreshCw, Save } from "lucide-react";
import { join } from "@/engine/fs/path";
import { useGame } from "@/store/gameStore";
import { useOS } from "../osStore";
import { OSButton, OSEmptyState, OSLoadingState } from "../ui";

const LANG: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  json: "json",
  sh: "shell",
  bash: "shell",
  py: "python",
  yml: "yaml",
  yaml: "yaml",
  md: "markdown",
  html: "html",
  css: "css",
  conf: "ini",
  log: "plaintext",
  txt: "plaintext",
  php: "php",
  sql: "sql",
};

function langFor(path: string): string {
  const ext = path.includes(".") ? path.split(".").pop()!.toLowerCase() : "";
  return LANG[ext] ?? "plaintext";
}

export default function EditorApp({ mobile }: { mobile: boolean }) {
  const engine = useGame((s) => s.engine)!;
  const saveFile = useGame((s) => s.saveFile);
  const pushNote = useGame((s) => s.pushNote);
  const tick = useGame((s) => s.tick);
  const editorRequest = useOS((s) => s.editorRequest);

  const cwd = engine.player.session.cwd;
  const [dir, setDir] = useState(cwd);
  const [path, setPath] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showTree, setShowTree] = useState(!mobile);
  const lastReq = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-list on host/cwd/fs change
  const listing = useMemo(() => engine.fsListDetailed(dir), [engine, dir, tick]);

  const openFile = useCallback(
    (p: string) => {
      const res = engine.fsRead(p);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPath(p);
      setContent(res.content);
      setOriginal(res.content);
      setError(null);
      if (mobile) setShowTree(false);
    },
    [engine, mobile],
  );

  // Honour a cross-app "open this file" request from Files/terminal.
  useEffect(() => {
    if (editorRequest && editorRequest.nonce !== lastReq.current) {
      lastReq.current = editorRequest.nonce;
      const abs = editorRequest.path.startsWith("/") ? editorRequest.path : join(cwd, editorRequest.path);
      const slash = abs.lastIndexOf("/");
      setDir(slash > 0 ? abs.slice(0, slash) : "/");
      openFile(abs);
    }
  }, [editorRequest, cwd, openFile]);

  const dirty = path !== null && content !== original;

  const save = useCallback(() => {
    if (!path) return;
    const res = saveFile(path, content);
    if (res.ok) {
      setOriginal(content);
      pushNote("info", `Zapisano ${path}`);
    } else {
      setError(res.error);
      pushNote("alert", `Nie można zapisać: ${res.error}`);
    }
  }, [path, content, saveFile, pushNote]);

  // Ctrl/Cmd+S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty) save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, save]);

  const tree = (
    <div className={mobile ? "max-h-48 overflow-auto" : "w-[220px] shrink-0 overflow-auto border-r hairline"}>
      <div className="flex items-center gap-1 px-2 py-2 font-mono text-2xs text-text2">
        <FolderOpen size={12} className="text-accent2" />
        <span className="truncate">{dir}</span>
      </div>
      <ul className="px-1 pb-2">
        {dir !== "/" && (
          <li>
            <button
              onClick={() => setDir(dir.slice(0, dir.lastIndexOf("/")) || "/")}
              className="w-full rounded px-2 py-1 text-left font-mono text-xs text-text2 hover:bg-white/5 hover:text-fg"
            >
              ../
            </button>
          </li>
        )}
        {listing.ok &&
          listing.entries
            .slice()
            .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1))
            .map((e) => {
              const abs = join(dir, e.name);
              const isDir = e.type === "dir";
              return (
                <li key={e.name}>
                  <button
                    onClick={() => (isDir ? setDir(abs) : openFile(abs))}
                    aria-current={path === abs || undefined}
                    className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left font-mono text-xs hover:bg-white/5 ${
                      path === abs ? "bg-accent/10 text-fg" : "text-text2 hover:text-fg"
                    }`}
                  >
                    {isDir ? <ChevronRight size={12} className="text-muted" /> : <File size={12} className="text-muted" />}
                    <span className="truncate">{e.name}</span>
                  </button>
                </li>
              );
            })}
        {listing.ok && listing.entries.length === 0 && <li className="px-2 py-1 text-2xs text-muted">pusty katalog</li>}
        {!listing.ok && <li className="px-2 py-1 text-2xs text-danger">{listing.error}</li>}
      </ul>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b hairline px-3 py-2">
        <OSButton size="sm" variant="ghost" icon={<FolderOpen size={14} />} onClick={() => setShowTree((v) => !v)}>
          {showTree ? "Ukryj" : "Pliki"}
        </OSButton>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-text2">
          {path ?? "— nie wybrano pliku —"}
          {dirty && <span className="ml-1 text-accent2">●</span>}
        </span>
        <OSButton size="sm" variant="ghost" icon={<RefreshCw size={14} />} onClick={() => path && openFile(path)} disabled={!path}>
          Przeładuj
        </OSButton>
        <OSButton size="sm" variant="primary" icon={<Save size={14} />} onClick={save} disabled={!dirty}>
          Zapisz
        </OSButton>
      </div>

      {error && <div className="border-b border-danger/30 bg-danger/10 px-3 py-1.5 text-2xs text-danger">{error}</div>}

      <div className={mobile ? "flex min-h-0 flex-1 flex-col" : "flex min-h-0 flex-1"}>
        {showTree && tree}
        <div className="min-h-0 min-w-0 flex-1">
          {path === null ? (
            <div className="flex h-full items-center justify-center p-6">
              <OSEmptyState icon={<File size={22} />} title="Wybierz plik">
                Wskaż plik z drzewa po lewej, aby go otworzyć. Zmiany zapisujesz przyciskiem „Zapisz” lub skrótem Ctrl/⌘+S —
                z pełną kontrolą uprawnień bieżącego hosta.
              </OSEmptyState>
            </div>
          ) : (
            <Editor
              height="100%"
              theme="vs-dark"
              path={path}
              language={langFor(path)}
              value={content}
              onChange={(v) => setContent(v ?? "")}
              loading={<OSLoadingState label="Ładowanie edytora…" lines={3} />}
              options={{
                fontSize: 13,
                fontFamily: "'JetBrains Mono', monospace",
                minimap: { enabled: !mobile },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                wordWrap: "on",
                tabSize: 2,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
