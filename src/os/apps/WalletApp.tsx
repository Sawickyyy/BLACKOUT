"use client";

import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Building2, Check, Coins, Cpu, Package, ShieldCheck, Wallet } from "lucide-react";
import { STORE, bankDeposit, bankWithdraw, buyItem, type StoreItem } from "@/engine/economy";
import type { SkillSet } from "@/engine/types";
import { useGame } from "@/store/gameStore";
import { OSButton, OSEmptyState, OSInput, OSTabs, OSTabPanel } from "../ui";

const SKILL_LABEL: Record<keyof SkillSet, string> = {
  recon: "Rozpoznanie",
  exploitation: "Eksploatacja",
  crypto: "Kryptografia",
  forensics: "Śledczość",
  social: "Socjotechnika",
  stealth: "Skrytość",
};

const KIND_ICON = {
  software: <Package size={16} />,
  hardware: <Cpu size={16} />,
  subscription: <ShieldCheck size={16} />,
  license: <Package size={16} />,
};

function Money({ v }: { v: number }) {
  return <span className="tabular">{v.toLocaleString("pl-PL")}</span>;
}

export default function WalletApp({ mobile }: { mobile: boolean }) {
  const engine = useGame((s) => s.engine)!;
  const mutate = useGame((s) => s.mutate);
  const pushNote = useGame((s) => s.pushNote);
  useGame((s) => s.tick);
  const p = engine.player;
  const [tab, setTab] = useState<"overview" | "store">("overview");
  const [amount, setAmount] = useState("100");
  const [bankMsg, setBankMsg] = useState<string | null>(null);
  const amt = parseInt(amount, 10) || 0;

  const bank = (dir: "in" | "out") =>
    mutate((e) => {
      const res = dir === "in" ? bankDeposit(e.player, amt) : bankWithdraw(e.player, amt);
      setBankMsg(res.ok ? null : res.reason);
    });

  const buy = (item: StoreItem) =>
    mutate((e) => {
      const res = buyItem(e.player, item.id);
      pushNote(res.ok ? "info" : "alert", res.ok ? `Kupiono: ${item.name}` : res.reason === "insufficient" ? "Za mało kredytów" : "Zakup nieudany");
    });

  return (
    <div className="scroll-area h-full">
      <div className={`mx-auto max-w-2xl ${mobile ? "px-4 pb-6 pt-4" : "p-5"}`}>
        {/* balance cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="relative overflow-hidden rounded-os-lg border border-accent/20 bg-gradient-to-br from-accent/[0.12] to-transparent p-4">
            <div className="flex items-center gap-1.5 text-accent">
              <Wallet size={15} />
              <span className="os-label text-accent/80">Portfel</span>
            </div>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-fg">
              <Money v={p.credits} /> <span className="text-sm font-normal text-text2">kr</span>
            </p>
          </div>
          <div className="relative overflow-hidden rounded-os-lg border border-accent2/20 bg-gradient-to-br from-accent2/[0.1] to-transparent p-4">
            <div className="flex items-center gap-1.5 text-accent2">
              <Building2 size={15} />
              <span className="os-label text-accent2/80">Konto bankowe</span>
            </div>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-fg">
              <Money v={p.bankBalance} /> <span className="text-sm font-normal text-text2">kr</span>
            </p>
          </div>
        </div>

        <OSTabs
          idPrefix="wallet"
          label="Sekcje portfela"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "overview", label: "Przegląd" },
            { id: "store", label: "Sklep" },
          ]}
          className="my-4"
        />

        {tab === "overview" ? (
          <OSTabPanel idPrefix="wallet" id="overview" className="space-y-4">
            {/* bank transfer */}
            <section className="os-surface rounded-os-lg p-4">
              <h3 className="mb-3 text-[0.8125rem] font-semibold text-fg">Przelew bankowy</h3>
              <div className="flex flex-wrap items-end gap-2">
                <OSInput
                  label="Kwota (kr)"
                  type="text"
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value.replace(/[^\d]/g, ""));
                    setBankMsg(null);
                  }}
                  error={bankMsg}
                  className="w-32"
                />
                <OSButton size="md" variant="secondary" icon={<ArrowUpRight size={15} />} disabled={amt <= 0} onClick={() => bank("in")}>
                  Wpłać
                </OSButton>
                <OSButton size="md" variant="secondary" icon={<ArrowDownLeft size={15} />} disabled={amt <= 0} onClick={() => bank("out")}>
                  Wypłać
                </OSButton>
              </div>
            </section>

            {/* skills */}
            <section className="os-surface rounded-os-lg p-4">
              <h3 className="mb-3 text-[0.8125rem] font-semibold text-fg">Umiejętności</h3>
              <ul className="space-y-2.5">
                {(Object.keys(SKILL_LABEL) as (keyof SkillSet)[]).map((k) => (
                  <li key={k} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-xs text-text2">{SKILL_LABEL[k]}</span>
                    <span className="flex flex-1 gap-1" aria-hidden>
                      {Array.from({ length: 10 }, (_, i) => (
                        <span key={i} className={`h-2 flex-1 rounded-sm ${i < p.skills[k] ? "bg-accent" : "bg-white/[0.07]"}`} />
                      ))}
                    </span>
                    <span className="w-6 text-right tabular text-xs text-fg" aria-label={`${p.skills[k]} na 10`}>
                      {p.skills[k]}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {/* transactions */}
            <section className="os-surface rounded-os-lg p-4">
              <h3 className="mb-3 text-[0.8125rem] font-semibold text-fg">Historia transakcji</h3>
              {p.transactions.length === 0 ? (
                <p className="text-xs text-muted">Brak transakcji. Ukończ zlecenie, aby zdobyć pierwsze kredyty.</p>
              ) : (
                <ul className="divide-y divide-white/[0.04]">
                  {[...p.transactions]
                    .reverse()
                    .slice(0, 20)
                    .map((t) => (
                      <li key={t.id} className="flex items-center gap-3 py-2">
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${t.amount >= 0 ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger"}`}
                          aria-hidden
                        >
                          {t.amount >= 0 ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs text-fg">{t.memo}</span>
                        <span className={`shrink-0 text-xs font-semibold tabular ${t.amount >= 0 ? "text-ok" : "text-danger"}`}>
                          {t.amount >= 0 ? "+" : ""}
                          <Money v={t.amount} />
                        </span>
                      </li>
                    ))}
                </ul>
              )}
            </section>
          </OSTabPanel>
        ) : (
          <OSTabPanel idPrefix="wallet" id="store" className="space-y-2.5">
            {STORE.map((item) => {
              const owned = p.inventory.some((i) => i.id === item.id);
              const afford = p.credits >= item.price;
              return (
                <div key={item.id} className="flex items-center gap-3 os-surface rounded-os-lg p-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-accent">
                    {KIND_ICON[item.kind]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-fg">{item.name}</p>
                    <p className="line-clamp-2 text-2xs text-text2">{item.description}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="flex items-center gap-1 text-xs font-semibold text-fg">
                      <Coins size={12} className="text-accent" />
                      <Money v={item.price} />
                    </span>
                    {owned ? (
                      <span className="flex items-center gap-1 text-2xs text-ok">
                        <Check size={13} /> posiadane
                      </span>
                    ) : (
                      <OSButton size="sm" variant={afford ? "primary" : "secondary"} disabled={!afford} onClick={() => buy(item)}>
                        {afford ? "Kup" : "Za mało"}
                      </OSButton>
                    )}
                  </div>
                </div>
              );
            })}
          </OSTabPanel>
        )}
      </div>
    </div>
  );
}
