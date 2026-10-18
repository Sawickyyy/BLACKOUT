"use client";

import { useState } from "react";
import { STORE, bankDeposit, bankWithdraw, buyItem } from "@/engine/economy";
import { useGame } from "@/store/gameStore";

export default function WalletPanel() {
  const engine = useGame((s) => s.engine);
  const mutate = useGame((s) => s.mutate);
  const pushNote = useGame((s) => s.pushNote);
  useGame((s) => s.tick);
  const [amount, setAmount] = useState("100");
  if (!engine) return null;
  const p = engine.player;

  const buy = (id: string) =>
    mutate((e) => {
      const res = buyItem(e.player, id);
      pushNote(res.ok ? "info" : "alert", res.ok ? `Kupiono: ${res.item.name}` : "Zakup nieudany");
    });

  const amt = parseInt(amount, 10) || 0;

  return (
    <div className="flex flex-col gap-3 p-3 text-xs">
      <h2 className="text-sm font-bold text-accent">Portfel i konto</h2>

      <div className="surface rounded-md p-3">
        <div className="flex justify-between">
          <span className="text-muted">Portfel</span>
          <span className="text-fg">{p.credits} kr</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Konto bankowe</span>
          <span className="text-fg">{p.bankBalance} kr</span>
        </div>
        <div className="mt-2 flex gap-2">
          <input
            className="input flex-1 py-1"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
          />
          <button className="btn" onClick={() => mutate((e) => bankDeposit(e.player, amt))}>
            Wpłać
          </button>
          <button className="btn" onClick={() => mutate((e) => bankWithdraw(e.player, amt))}>
            Wypłać
          </button>
        </div>
      </div>

      <div>
        <h3 className="mb-1 font-bold text-accent2">Umiejętności</h3>
        <div className="space-y-1">
          {Object.entries(p.skills).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2">
              <span className="w-20 text-muted">{k}</span>
              <div className="h-2 flex-1 overflow-hidden rounded bg-panel2">
                <div className="h-full bg-accent" style={{ width: `${(v / 10) * 100}%` }} />
              </div>
              <span className="w-6 text-right text-fg">{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-1 font-bold text-accent2">Sklep</h3>
        <div className="space-y-2">
          {STORE.map((it) => {
            const owned = p.inventory.some((i) => i.id === it.id);
            return (
              <div key={it.id} className="surface rounded-md p-2">
                <div className="flex items-center justify-between">
                  <span className="text-fg">{it.name}</span>
                  <span className="text-muted">{it.price} kr</span>
                </div>
                <p className="my-1 text-[11px] text-muted">{it.description}</p>
                <button
                  className={`btn w-full py-1 ${owned ? "" : "btn-primary"}`}
                  disabled={owned || p.credits < it.price}
                  onClick={() => buy(it.id)}
                >
                  {owned ? "Posiadane" : p.credits < it.price ? "Za mało kredytów" : "Kup"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {p.transactions.length > 0 && (
        <div>
          <h3 className="mb-1 font-bold text-accent2">Historia transakcji</h3>
          <div className="space-y-1">
            {[...p.transactions]
              .reverse()
              .slice(0, 12)
              .map((t) => (
                <div key={t.id} className="flex justify-between text-[11px]">
                  <span className="text-muted">{t.memo}</span>
                  <span className={t.amount >= 0 ? "text-ok" : "text-danger"}>
                    {t.amount >= 0 ? "+" : ""}
                    {t.amount}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
