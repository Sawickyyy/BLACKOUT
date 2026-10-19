"use client";

import { useState, type ReactNode } from "react";
import {
  Accessibility,
  Cloud,
  Download,
  HardDrive,
  Info,
  LogOut,
  Monitor,
  Palette,
  RotateCcw,
  SquareTerminal,
  Trash2,
  Upload,
} from "lucide-react";
import { MISSIONS } from "@/engine/missions/defs";
import { useGame } from "@/store/gameStore";
import AutosaveSection from "@/components/panels/AutosaveSection";
import { usePrefs, type UiPrefs } from "../prefs";
import { deleteAccountData, logout } from "../session";
import { OSButton, OSDialog, OSInput } from "../ui";

function Section({ icon, title, desc, children }: { icon: ReactNode; title: string; desc?: string; children: ReactNode }) {
  return (
    <section className="os-surface rounded-os-lg p-4">
      <header className="mb-3 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.05] text-accent">{icon}</span>
        <div>
          <h3 className="text-[0.8125rem] font-semibold text-fg">{title}</h3>
          {desc && <p className="text-2xs text-muted">{desc}</p>}
        </div>
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs text-fg">{label}</p>
        {hint && <p className="text-2xs text-muted">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-10 rounded-full transition-colors duration-fast ${checked ? "bg-accent" : "bg-white/[0.12]"}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-fast ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`}
      />
    </button>
  );
}

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-lg border hairline bg-bg/40 p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2.5 py-1 text-2xs font-medium transition-colors ${
            o.value === value ? "bg-elevated text-fg" : "text-text2 hover:text-fg"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function SettingsApp({ mobile }: { mobile: boolean }) {
  const engine = useGame((s) => s.engine)!;
  const applySettings = useGame((s) => s.applySettings);
  const resetToNewGame = useGame((s) => s.resetToNewGame);
  const backend = useGame((s) => s.backend);
  const username = useGame((s) => s.username);
  const slot = useGame((s) => s.slot);
  useGame((s) => s.tick);
  const prefs = usePrefs();
  const setPref = usePrefs((s) => s.setPref);
  const s = engine.player.settings;
  const [confirm, setConfirm] = useState<null | "reset" | "delete">(null);

  const setP = <K extends keyof UiPrefs>(k: K, v: UiPrefs[K]) => setPref(k, v);
  const completed = Object.values(engine.player.missions).filter((m) => m.status === "completed").length;

  return (
    <div className="scroll-area h-full">
      <div className={`mx-auto max-w-2xl space-y-3 ${mobile ? "px-4 pb-8 pt-4" : "p-5"}`}>
        <Section icon={<Palette size={16} />} title="Wygląd" desc="Motyw i efekty wizualne BLACKNET OS">
          <Row label="Motyw akcentów">
            <Segmented
              label="Motyw"
              value={s.theme}
              onChange={(v) => applySettings({ theme: v as "green" | "amber" | "blue" })}
              options={[
                { value: "green", label: "Zielony" },
                { value: "amber", label: "Bursztyn" },
                { value: "blue", label: "Niebieski" },
              ]}
            />
          </Row>
          <Row label="Przezroczystość paneli" hint="Efekt szkła w paskach i menu">
            <input
              type="range"
              min={0.55}
              max={0.95}
              step={0.05}
              value={prefs.glassAlpha}
              aria-label="Przezroczystość paneli"
              onChange={(e) => setP("glassAlpha", Number(e.target.value))}
              className="w-32 accent-[rgb(var(--accent))]"
            />
          </Row>
          <Row label="Rozmycie tła" hint="Wyłącz dla lepszej wydajności">
            <Toggle label="Rozmycie tła" checked={prefs.blur} onChange={(v) => setP("blur", v)} />
          </Row>
          <Row label="Animowane tło" hint="Subtelny ruch siatki pulpitu">
            <Toggle label="Animowane tło" checked={prefs.ambient} onChange={(v) => setP("ambient", v)} />
          </Row>
        </Section>

        <Section icon={<SquareTerminal size={16} />} title="Terminal">
          <Row label="Rozmiar czcionki">
            <div className="flex items-center gap-2">
              <OSButton size="sm" variant="ghost" disabled={s.fontSize <= 10} onClick={() => applySettings({ fontSize: s.fontSize - 1 })} aria-label="Zmniejsz">
                −
              </OSButton>
              <span className="w-6 text-center tabular text-sm text-fg">{s.fontSize}</span>
              <OSButton size="sm" variant="ghost" disabled={s.fontSize >= 22} onClick={() => applySettings({ fontSize: s.fontSize + 1 })} aria-label="Powiększ">
                +
              </OSButton>
            </div>
          </Row>
          <Row label="Efekt CRT" hint="Linie skanowania w oknie terminala">
            <Toggle label="Efekt CRT" checked={s.crt} onChange={(v) => applySettings({ crt: v })} />
          </Row>
        </Section>

        <Section icon={<Accessibility size={16} />} title="Animacje i dostępność">
          <Row label="Ogranicz animacje" hint="Wyłącza ruch i przejścia interfejsu">
            <Toggle label="Ogranicz animacje" checked={s.reducedMotion} onChange={(v) => applySettings({ reducedMotion: v })} />
          </Row>
          <Row label="Animacja uruchamiania" hint="Krótki ekran startowy po zalogowaniu">
            <Toggle label="Animacja uruchamiania" checked={prefs.bootAnimation} onChange={(v) => setP("bootAnimation", v)} />
          </Row>
          <Row label="Wysoki kontrast" hint="Mocniejsze obramowania i czytelniejszy tekst">
            <Toggle label="Wysoki kontrast" checked={prefs.contrast === "high"} onChange={(v) => setP("contrast", v ? "high" : "normal")} />
          </Row>
          <Row label="Skala interfejsu">
            <Segmented
              label="Skala interfejsu"
              value={prefs.scale}
              onChange={(v) => setP("scale", v)}
              options={[
                { value: 90, label: "90%" },
                { value: 100, label: "100%" },
                { value: 110, label: "110%" },
                { value: 120, label: "120%" },
              ]}
            />
          </Row>
        </Section>

        <Section
          icon={backend === "cloud" ? <Cloud size={16} /> : <HardDrive size={16} />}
          title="Konto"
          desc={`${username} · ${backend === "cloud" ? "chmura" : "lokalnie"} · slot ${slot}`}
        >
          <div className="flex flex-wrap gap-2">
            <OSButton size="sm" variant="secondary" icon={<LogOut size={14} />} onClick={() => void logout()}>
              {backend === "cloud" ? "Wyloguj" : "Zakończ sesję"}
            </OSButton>
            <OSButton size="sm" variant="secondary" icon={<RotateCcw size={14} />} onClick={() => setConfirm("reset")}>
              Nowa gra
            </OSButton>
            <OSButton size="sm" variant="danger" icon={<Trash2 size={14} />} onClick={() => setConfirm("delete")}>
              Usuń dane
            </OSButton>
          </div>
        </Section>

        <Section icon={<Download size={16} />} title="Zapisy gry" desc="Autozapis, kopie zapasowe, eksport i import">
          <div className="-mt-1">
            <AutosaveSection />
          </div>
        </Section>

        <Section icon={<Info size={16} />} title="O systemie">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            {[
              ["System", "BLACKNET OS 2.0"],
              ["Operator", username],
              ["Ukończone zlecenia", `${completed} / ${MISSIONS.length}`],
              ["Znane hosty", String(engine.player.discovered.length)],
              ["Narzędzia", engine.player.capabilities.join(", ") || "—"],
              ["Tryb zapisu", backend === "cloud" ? "chmura (Supabase)" : "lokalny"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2 border-b border-white/[0.03] py-1">
                <dt className="text-muted">{k}</dt>
                <dd className="truncate text-right font-mono text-text2">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="pt-1 text-2xs leading-relaxed text-muted">
            Wszystkie systemy, sieci i organizacje w grze są fikcyjne. Żadne polecenie nie opuszcza symulacji.
          </p>
        </Section>
      </div>

      <OSDialog
        open={confirm === "reset"}
        title="Rozpocząć nową grę?"
        message="Obecny postęp trafi do kopii zapasowych, a gra zacznie się od nowa. Możesz go później przywrócić."
        confirmLabel="Nowa gra"
        onConfirm={() => {
          void resetToNewGame();
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />
      <OSDialog
        open={confirm === "delete"}
        danger
        title="Usunąć wszystkie dane?"
        message={
          backend === "cloud"
            ? "Usunięte zostaną zapisy w chmurze i na tym urządzeniu oraz kopie zapasowe. Tej operacji nie można cofnąć."
            : "Usunięte zostaną zapisy i kopie zapasowe na tym urządzeniu. Tej operacji nie można cofnąć."
        }
        confirmLabel="Usuń trwale"
        onConfirm={() => void deleteAccountData()}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
