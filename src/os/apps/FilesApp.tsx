"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  ChevronRight,
  Clipboard,
  Eye,
  File as FileIcon,
  FileCode2,
  FileText,
  Folder,
  Home,
  LayoutGrid,
  List as ListIcon,
  Lock,
  Save,
  Search,
  Terminal,
} from "lucide-react";
import { focusTerminal, sendToTerminal } from "@/components/terminalBridge";
import { useGame } from "@/store/gameStore";
import { useOS } from "../osStore";
import { OSContextMenu, OSEmptyState, OSIconButton, OSInput, OSLoadingState, useContextMenu, useLongPress } from "../ui";

const Monaco = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <OSLoadingState label="Ładowanie edytora…" lines={5} />,
});

interface Entry {
  name: string;
  type: string;
  mode: number;
  owner: string;
  group: string;
  size: number;
  mtime: number;
}

function modeString(mode: number, type: string): string {
  const t = type === "dir" ? "d" : type === "symlink" ? "l" : "-";
  const bit = (b: number) => (b & 4 ? "r" : "-") + (b & 2 ? "w" : "-") + (b & 1 ? "x" : "-");
  return t + bit((mode >> 6) & 7) + bit((mode >> 3) & 7) + bit(mode & 7);
}
function humanSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function fmtDate(ms: number): string {
  return new Date(ms).toLocaleString("pl-PL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function iconFor(e: Entry) {
  if (e.type === "dir") return <Folder size={18} className="text-accent2" />;
  if (/\.(ya?ml|json|sh|php|sql|conf|env|js|ts|html)$/.test(e.name)) return <FileCode2 size={18} className="text-accent" />;
  if (/\.(txt|md|log)$/.test(e.name) || !e.name.includes(".")) return <FileText size={18} className="text-text2" />;
  return <FileIcon size={18} className="text-text2" />;
}
function langFor(name: string): string {
  if (name.endsWith(".json")) return "json";
  if (/\.ya?ml$/.test(name)) return "yaml";
  if (name.endsWith(".sh")) return "shell";
  if (name.endsWith(".php")) return "php";
  if (name.endsWith(".sql")) return "sql";
  if (name.endsWith(".md")) return "markdown";
  if (name.endsWith(".html")) return "html";
  return "plaintext";
}

export default function FilesApp({ mobile }: { mobile: boolean }) {
  const engine = useGame((s) => s.engine)!;
  const mutate = useGame((s) => s.mutate);
  const tick = useGame((s) => s.tick);
  const filesRequest = useOS((s) => s.filesRequest);
  const [dir, setDir] = useState(() => engine.player.session.cwd);
  const [file, setFile] = useState<{ path: string; content: string; writable: boolean } | null>(null);
  const [edited, setEdited] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [grid, setGrid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menu = useContextMenu();

  // Respond to "open this folder" requests from other apps.
  useEffect(() => {
    if (filesRequest) {
      setDir(filesRequest.path);
      setFile(null);
    }
  }, [filesRequest]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- tick forces a refresh after FS writes
  const listing = useMemo(() => engine.fsListDetailed(dir), [engine, dir, tick]);
  const entries = listing.ok ? listing.entries : [];
  const filtered = query
    ? entries.filter((e) => e.name.toLowerCase().includes(query.toLowerCase()))
    : entries;
  const sorted = [...filtered].sort((a, b) =>
    a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1,
  );

  const crumbs = dir === "/" ? [] : dir.split("/").filter(Boolean);
  const enter = (name: string) => {
    setDir(dir === "/" ? "/" + name : dir + "/" + name);
    setQuery("");
  };
  const openFile = (name: string, writable: boolean) => {
    const path = dir === "/" ? "/" + name : dir + "/" + name;
    const res = engine.fsRead(path);
    if (res.ok) {
      setFile({ path, content: res.content, writable });
      setEdited(null);
      setError(null);
    } else setError(res.error);
  };
  const runHere = (cmd: string) => {
    useOS.getState().launch("terminal");
    setTimeout(() => {
      sendToTerminal(`cd ${dir} && ${cmd}\r`);
      focusTerminal();
    }, 60);
  };

  const save = () => {
    if (!file || edited === null) return;
    mutate((e) => {
      const res = e.fsWrite(file.path, edited);
      if (!res.ok) setError(res.error);
      else {
        setFile({ ...file, content: edited });
        setEdited(null);
        setError(null);
      }
    });
  };

  // ── editor view ──
  if (file) {
    const readOnly = !file.writable;
    return (
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b hairline px-3 py-2">
          <OSIconButton label="Wróć do listy" size="sm" onClick={() => setFile(null)}>
            <ArrowLeft size={16} />
          </OSIconButton>
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-text2">{file.path}</span>
          {readOnly ? (
            <span className="flex items-center gap-1 text-2xs text-muted">
              <Lock size={12} /> tylko odczyt
            </span>
          ) : (
            <OSIconButton label="Zapisz plik" size="sm" active={edited !== null} onClick={save}>
              <Save size={16} />
            </OSIconButton>
          )}
        </div>
        {error && <p className="bg-danger/10 px-3 py-1.5 text-2xs text-danger">{error}</p>}
        <div className="min-h-0 flex-1">
          <Monaco
            height="100%"
            theme="vs-dark"
            language={langFor(file.path)}
            value={edited ?? file.content}
            onChange={(v) => !readOnly && setEdited(v ?? "")}
            options={{
              readOnly,
              minimap: { enabled: !mobile },
              fontSize: 13,
              fontFamily: "JetBrains Mono, monospace",
              scrollBeyondLastLine: false,
              wordWrap: "on",
              padding: { top: 10 },
            }}
          />
        </div>
      </div>
    );
  }

  // ── browser view ──
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b hairline px-3 py-2">
        <nav aria-label="Ścieżka" className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto text-xs">
          <button onClick={() => setDir("/")} aria-label="Katalog główny" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text2 hover:bg-white/[0.07] hover:text-fg">
            <Home size={14} />
          </button>
          {crumbs.map((c, i) => (
            <span key={i} className="flex shrink-0 items-center">
              <ChevronRight size={13} className="text-muted" />
              <button
                onClick={() => setDir("/" + crumbs.slice(0, i + 1).join("/"))}
                className={`rounded-md px-1.5 py-1 font-mono ${i === crumbs.length - 1 ? "text-fg" : "text-text2 hover:text-fg"}`}
              >
                {c}
              </button>
            </span>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <OSIconButton label="Otwórz katalog w terminalu" size="sm" onClick={() => runHere("ls -la")}>
            <Terminal size={15} />
          </OSIconButton>
          <OSIconButton label={grid ? "Widok listy" : "Widok siatki"} size="sm" onClick={() => setGrid(!grid)}>
            {grid ? <ListIcon size={15} /> : <LayoutGrid size={15} />}
          </OSIconButton>
        </div>
        <OSInput
          label="Szukaj w katalogu"
          hideLabel
          leading={<Search size={14} />}
          placeholder="Szukaj…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full sm:w-44"
        />
      </div>

      {!listing.ok ? (
        <OSEmptyState icon={<Lock size={20} />} title="Brak dostępu do katalogu">
          {listing.error || "Nie masz uprawnień do odczytu tej lokalizacji."}
        </OSEmptyState>
      ) : sorted.length === 0 ? (
        <OSEmptyState icon={<Folder size={20} />} title={query ? "Brak wyników" : "Pusty katalog"}>
          {query ? `Nic nie pasuje do „${query}”.` : "Ten katalog nie zawiera plików."}
        </OSEmptyState>
      ) : (
        <div className="scroll-area flex-1 p-2">
          {grid ? (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-1">
              {sorted.map((e) => (
                <FileTile key={e.name} e={e} onOpen={() => (e.type === "dir" ? enter(e.name) : openFile(e.name, (e.mode & 0o200) !== 0))} onMenu={menu} dir={dir} runHere={runHere} />
              ))}
            </ul>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="os-label border-b hairline text-left [&>th]:px-2 [&>th]:pb-2 [&>th]:font-medium">
                  <th>Nazwa</th>
                  {!mobile && <th className="w-28">Uprawnienia</th>}
                  {!mobile && <th className="w-24">Właściciel</th>}
                  <th className="w-20 text-right">Rozmiar</th>
                  {!mobile && <th className="w-32">Modyfikacja</th>}
                </tr>
              </thead>
              <tbody>
                {sorted.map((e) => (
                  <FileRow
                    key={e.name}
                    e={e}
                    mobile={mobile}
                    onOpen={() => (e.type === "dir" ? enter(e.name) : openFile(e.name, (e.mode & 0o200) !== 0))}
                    onMenu={menu}
                    dir={dir}
                    runHere={runHere}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {error && !file && <p className="border-t hairline bg-danger/10 px-3 py-1.5 text-2xs text-danger">{error}</p>}
      <OSContextMenu menu={menu.menu} onClose={menu.close} />
    </div>
  );
}

type MenuCtl = ReturnType<typeof useContextMenu>;

function entryMenu(e: Entry, dir: string, open: () => void, runHere: (c: string) => void): Parameters<MenuCtl["open"]>[3] {
  const path = dir === "/" ? "/" + e.name : dir + "/" + e.name;
  const copyPath = () => void navigator.clipboard?.writeText(path).catch(() => undefined);
  if (e.type === "dir") {
    return [
      { id: "open", label: "Otwórz", icon: <Folder size={14} />, onSelect: open },
      { id: "term", label: "Otwórz w terminalu", icon: <Terminal size={14} />, onSelect: () => runHere(`cd ${e.name}`) },
      { id: "path", label: "Kopiuj ścieżkę", icon: <Clipboard size={14} />, onSelect: copyPath },
    ];
  }
  return [
    { id: "open", label: (e.mode & 0o200) !== 0 ? "Otwórz / edytuj" : "Podgląd", icon: <Eye size={14} />, onSelect: open },
    { id: "cat", label: "Wyświetl (cat)", icon: <Terminal size={14} />, onSelect: () => runHere(`cat ${e.name}`) },
    { id: "path", label: "Kopiuj ścieżkę", icon: <Clipboard size={14} />, onSelect: copyPath },
  ];
}

function FileRow({ e, mobile, onOpen, onMenu, dir, runHere }: { e: Entry; mobile: boolean; onOpen: () => void; onMenu: MenuCtl; dir: string; runHere: (c: string) => void }) {
  const press = useLongPress((x, y) => onMenu.open(x, y, e.name, entryMenu(e, dir, onOpen, runHere)));
  return (
    <tr
      className="cursor-default border-b border-white/[0.03] text-fg hover:bg-white/[0.04]"
      onDoubleClick={onOpen}
      onContextMenu={(ev) => {
        ev.preventDefault();
        onMenu.open(ev.clientX, ev.clientY, e.name, entryMenu(e, dir, onOpen, runHere));
      }}
      {...press}
    >
      <td className="px-2 py-1.5">
        <button onClick={onOpen} className="flex items-center gap-2.5 text-left">
          {iconFor(e)}
          <span className="font-mono">{e.name}{e.type === "dir" ? "/" : ""}</span>
        </button>
      </td>
      {!mobile && <td className="px-2 font-mono text-2xs text-muted">{modeString(e.mode, e.type)}</td>}
      {!mobile && <td className="px-2 text-2xs text-text2">{e.owner}</td>}
      <td className="px-2 text-right tabular text-2xs text-text2">{e.type === "dir" ? "—" : humanSize(e.size)}</td>
      {!mobile && <td className="px-2 text-2xs text-muted">{fmtDate(e.mtime)}</td>}
    </tr>
  );
}

function FileTile({ e, onOpen, onMenu, dir, runHere }: { e: Entry; onOpen: () => void; onMenu: MenuCtl; dir: string; runHere: (c: string) => void }) {
  const press = useLongPress((x, y) => onMenu.open(x, y, e.name, entryMenu(e, dir, onOpen, runHere)));
  return (
    <li>
      <button
        onClick={onOpen}
        onContextMenu={(ev) => {
          ev.preventDefault();
          onMenu.open(ev.clientX, ev.clientY, e.name, entryMenu(e, dir, onOpen, runHere));
        }}
        {...press}
        className="flex w-full flex-col items-center gap-1.5 rounded-xl p-3 text-center hover:bg-white/[0.05]"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.04]">{iconFor(e)}</span>
        <span className="line-clamp-2 break-all font-mono text-2xs text-fg">{e.name}</span>
      </button>
    </li>
  );
}
