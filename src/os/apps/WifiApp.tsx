"use client";

// Wi-Fi Lab — the visual front-end for the authorized wireless assessment.
// It scans the simulated access points, explains WPA2 vs WPA3, scores
// passphrase strength (a defensive meter), and joins a network the player has
// worked out the passphrase for. Every action routes through the engine's
// `wifi` command, so missions and state stay in sync. Pure simulation — no
// radio, capture or cracking.

import { useMemo, useState } from "react";
import { Lock, Radar, RadioTower, ShieldAlert, ShieldCheck, Terminal, Unlock, Wifi, WifiOff } from "lucide-react";
import { scorePassphrase, securityExplainer, signalBars } from "@/engine/wifi";
import type { WifiNetwork } from "@/engine/types";
import { focusTerminal, sendToTerminal } from "@/components/terminalBridge";
import { useGame } from "@/store/gameStore";
import { useOS } from "../osStore";
import { OSBadge, OSButton, OSEmptyState, OSInput } from "../ui";

const SEC_TONE: Record<string, "ok" | "warn" | "danger" | "neutral"> = {
  wpa3: "ok",
  "wpa2-ent": "ok",
  wpa2: "warn",
  wep: "danger",
  open: "danger",
};
const SEC_LABEL: Record<string, string> = { open: "Otwarta", wep: "WEP", wpa2: "WPA2", wpa3: "WPA3", "wpa2-ent": "WPA2-Ent" };

function Bars({ dbm }: { dbm: number }) {
  const n = signalBars(dbm);
  return (
    <span className="flex items-end gap-0.5" title={`${dbm} dBm`} aria-label={`sygnał ${n}/4`}>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={`w-1 rounded-sm ${i < n ? "bg-accent" : "bg-white/15"}`}
          style={{ height: 4 + i * 3 }}
        />
      ))}
    </span>
  );
}

function StrengthMeter({ pass, personal }: { pass: string; personal: string[] }) {
  const s = useMemo(() => scorePassphrase(pass, personal), [pass, personal]);
  if (!pass) return null;
  const tone = s.score >= 3 ? "ok" : s.score >= 2 ? "warn" : "danger";
  const color = tone === "ok" ? "rgb(var(--ok))" : tone === "warn" ? "rgb(var(--accent2))" : "rgb(var(--danger))";
  return (
    <div className="mt-2 rounded-lg border hairline bg-white/[0.03] p-2.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-text2">Siła hasła</span>
        <span style={{ color }}>{s.label}</span>
      </div>
      <div className="mt-1 flex gap-1" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i < s.score ? color : "rgb(255 255 255 / 0.1)" }} />
        ))}
      </div>
      <p className="mt-1.5 text-2xs text-muted">{s.resistance} · {s.reasons.join("; ")}</p>
    </div>
  );
}

function NetworkDetail({ net }: { net: WifiNetwork }) {
  const run = useGame((s) => s.run);
  useGame((s) => s.tick);
  const engine = useGame((s) => s.engine)!;
  const openUrl = useOS((s) => s.openUrl);
  const ex = securityExplainer(net.security);
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const connected = engine.player.wifiConnected === net.ssid;
  const devices = (net.lanHostIds ?? []).map((id) => engine.world.hosts[id]).filter(Boolean);

  const connect = () => {
    const r = run(`wifi connect ${net.ssid} ${pass}`);
    if (!r) return;
    setMsg(r.code === 0 ? { ok: true, text: `Połączono z ${net.ssid}.` } : { ok: false, text: (r.stderr || "Nie udało się połączyć.").trim() });
  };

  const inTerminal = (cmd: string) => {
    useOS.getState().launch("terminal");
    setTimeout(() => {
      sendToTerminal(cmd + "\r");
      focusTerminal();
    }, 60);
  };

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="font-mono text-sm font-semibold text-fg">{net.ssid}</h3>
          <OSBadge tone={SEC_TONE[net.security]}>{SEC_LABEL[net.security]}</OSBadge>
          {net.authorized && <OSBadge tone="ok">w zakresie zlecenia</OSBadge>}
        </div>
        <p className="mt-0.5 font-mono text-2xs text-muted">
          {net.bssid} · {net.band} GHz · kanał {net.channel} · {net.signal} dBm
        </p>
      </div>

      <div className="rounded-lg border hairline bg-white/[0.03] p-3 text-xs">
        <p className="font-medium text-fg">{ex.name}</p>
        <p className="mt-1 text-text2">{ex.summary}</p>
        <p className="mt-1 text-muted">Ograniczenia: {ex.limits}</p>
      </div>

      {!net.authorized ? (
        <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 p-2.5 text-2xs text-danger">
          <ShieldAlert size={14} className="mt-0.5 shrink-0" />
          Sieć poza zakresem zlecenia — nie testuj jej. Oceniaj tylko sieci klienta.
        </div>
      ) : (
        <>
          {net.clues?.length ? (
            <div className="rounded-lg border hairline bg-white/[0.03] p-2.5">
              <p className="os-label mb-1 flex items-center gap-1.5">
                <Radar size={11} /> Ślady OSINT z pakietu zlecenia
              </p>
              <p className="font-mono text-2xs text-text2">{net.clues.join(" · ")}</p>
            </div>
          ) : null}

          <div>
            <p className="os-label mb-1">Test siły hasła (laboratorium)</p>
            <OSInput value={pass} onChange={(e) => setPass(e.target.value)} placeholder="wpisz kandydata na hasło" hideLabel label="Hasło" />
            <StrengthMeter pass={pass} personal={net.clues ?? []} />
          </div>

          {net.security === "wpa3" && (
            <p className="flex items-start gap-1.5 text-2xs text-muted">
              <ShieldCheck size={13} className="mt-0.5 shrink-0 text-ok" />
              WPA3 odrzuca zgadywanie offline — nie da się dołączyć na podstawie samych danych OSINT.
            </p>
          )}

          {connected ? (
            <OSBadge tone="ok">
              <Wifi size={11} /> połączono
            </OSBadge>
          ) : (
            <OSButton size="sm" variant="primary" icon={<Wifi size={14} />} onClick={connect} disabled={!pass}>
              Połącz z {net.ssid}
            </OSButton>
          )}
          {msg && <p className={`text-2xs ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</p>}
        </>
      )}

      {connected && devices.length > 0 && (
        <div>
          <p className="os-label mb-1.5">Urządzenia w sieci (osobne zabezpieczenia)</p>
          <ul className="space-y-1.5">
            {devices.map((h) => {
              const access = (engine.player.accessByHost[h!.id] ?? []).length > 0;
              return (
                <li key={h!.id} className="flex items-center gap-2 rounded-lg border hairline bg-white/[0.03] px-2.5 py-2">
                  {access ? <Unlock size={14} className="text-ok" /> : <Lock size={14} className="text-muted" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-xs text-fg">{h!.hostname}</span>
                    <span className="block font-mono text-2xs text-muted">{h!.ip}</span>
                  </span>
                  <OSButton size="sm" variant="ghost" icon={<Terminal size={13} />} onClick={() => inTerminal(`nmap ${h!.ip}`)}>
                    nmap
                  </OSButton>
                  {h!.id === "home-router" && (
                    <OSButton size="sm" variant="ghost" onClick={() => openUrl("http://192.168.1.1/")}>
                      panel
                    </OSButton>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-1.5 text-2xs text-muted">Połączenie z Wi-Fi to nie dostęp do urządzeń — każde ma własne logowanie.</p>
        </div>
      )}
    </div>
  );
}

export default function WifiApp({ mobile }: { mobile: boolean }) {
  const engine = useGame((s) => s.engine)!;
  const run = useGame((s) => s.run);
  useGame((s) => s.tick);
  const nets = engine.wifiNetworks();
  const monitor = engine.player.wifiMonitor ?? false;
  const connected = engine.player.wifiConnected;
  const [sel, setSel] = useState<string | null>(null);
  const selNet = nets.find((n) => n.ssid === sel) ?? null;

  const list = (
    <div className={mobile ? "" : "w-[300px] shrink-0 border-r hairline"}>
      <div className="flex items-center justify-between gap-2 border-b hairline px-3 py-2">
        <span className="flex items-center gap-1.5 text-2xs text-text2">
          <RadioTower size={13} className={monitor ? "text-accent" : "text-muted"} /> wlan0 · {monitor ? "monitor" : "zarządzany"}
        </span>
        <OSButton size="sm" variant={monitor ? "secondary" : "primary"} onClick={() => run(`wifi mon ${monitor ? "off" : "on"}`)}>
          {monitor ? "Wyłącz monitor" : "Włącz monitor"}
        </OSButton>
      </div>
      {!monitor ? (
        <div className="p-6">
          <OSEmptyState icon={<WifiOff size={20} />} title="Monitor wyłączony">
            Włącz tryb monitorowania adaptera, aby zeskanować sieci w zasięgu.
          </OSEmptyState>
        </div>
      ) : (
        <ul className="scroll-area max-h-full overflow-auto p-2">
          {[...nets]
            .sort((a, b) => b.signal - a.signal)
            .map((n) => {
              const active = sel === n.ssid;
              return (
                <li key={n.ssid}>
                  <button
                    onClick={() => setSel(n.ssid)}
                    aria-pressed={active}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left ${active ? "bg-accent/10" : "hover:bg-white/5"}`}
                  >
                    <Bars dbm={n.signal} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-mono text-xs text-fg">{n.ssid}</span>
                        {connected === n.ssid && <Wifi size={11} className="shrink-0 text-ok" />}
                      </span>
                      <span className="block font-mono text-2xs text-muted">{n.band} GHz · kan. {n.channel}</span>
                    </span>
                    <OSBadge tone={SEC_TONE[n.security]}>{SEC_LABEL[n.security]}</OSBadge>
                  </button>
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );

  return (
    <div className={mobile ? "flex h-full flex-col" : "flex h-full"}>
      {list}
      <div className="min-w-0 flex-1 scroll-area overflow-auto p-4">
        {selNet ? (
          <NetworkDetail net={selNet} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <OSEmptyState icon={<Wifi size={22} />} title="Wybierz sieć">
              Zeskanuj eter i wybierz sieć z listy, aby zobaczyć analizę zabezpieczeń, przetestować siłę hasła i — w ramach
              autoryzowanego zlecenia — połączyć się z nią.
            </OSEmptyState>
          </div>
        )}
      </div>
    </div>
  );
}
