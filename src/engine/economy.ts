// In-game economy: store catalog, server-authoritative purchases, and bank
// transfers between the wallet (credits) and the bank account. No real money.

import type { InventoryItem, PlayerState, Transaction } from "./types";

export interface StoreItem {
  id: string;
  name: string;
  kind: InventoryItem["kind"];
  price: number;
  description: string;
  /** Capability flag unlocked on purchase. */
  unlocks?: string;
  /** One-time skill bonus applied on purchase. */
  skill?: { key: keyof PlayerState["skills"]; amount: number };
}

export const STORE: StoreItem[] = [
  {
    id: "hydra",
    name: "Hydra (łamacz haseł)",
    kind: "software",
    price: 1200,
    description: "Automatyczne zgadywanie haseł SSH ze słownika. Odblokowuje polecenie `hydra`.",
    unlocks: "hydra",
  },
  {
    id: "vpn",
    name: "Abonament VPN",
    kind: "subscription",
    price: 800,
    description: "Maskuje ruch — o połowę wolniej rośnie poziom podejrzeń.",
    unlocks: "vpn",
  },
  {
    id: "proxychains",
    name: "Proxychains + sieć relay",
    kind: "software",
    price: 2200,
    description: "Łańcuch pośredników — mocno ogranicza wykrywalność skanów.",
    unlocks: "proxychains",
  },
  {
    id: "cpu",
    name: "Upgrade CPU (stacja robocza)",
    kind: "hardware",
    price: 1500,
    description: "Szybsze łamanie skrótów i skany. +1 do umiejętności crypto.",
    skill: { key: "crypto", amount: 1 },
  },
  {
    id: "ram",
    name: "Dodatkowa pamięć RAM",
    kind: "hardware",
    price: 600,
    description: "Więcej równoległych zadań. +1 do umiejętności recon.",
    skill: { key: "recon", amount: 1 },
  },
  {
    id: "server",
    name: "Wynajem serwera VPS",
    kind: "subscription",
    price: 1000,
    description: "Własny punkt przerzutowy w sieci. Element fabularny do operacji.",
    unlocks: "vps",
  },
];

export type BuyResult =
  | { ok: true; item: StoreItem; balance: number }
  | { ok: false; reason: "unknown" | "insufficient" | "owned" };

/** Server-authoritative purchase. Validates funds + ownership, then applies. */
export function buyItem(player: PlayerState, itemId: string): BuyResult {
  const item = STORE.find((i) => i.id === itemId);
  if (!item) return { ok: false, reason: "unknown" };
  if (player.inventory.some((i) => i.id === item.id)) return { ok: false, reason: "owned" };
  if (player.credits < item.price) return { ok: false, reason: "insufficient" };

  player.credits -= item.price;
  player.inventory.push({
    id: item.id,
    name: item.name,
    kind: item.kind,
    description: item.description,
    unlocks: item.unlocks,
  });
  if (item.unlocks && !player.capabilities.includes(item.unlocks)) {
    player.capabilities.push(item.unlocks);
  }
  if (item.skill) {
    player.skills[item.skill.key] = Math.min(10, player.skills[item.skill.key] + item.skill.amount);
  }
  player.transactions.push(mkTx(-item.price, player.bankBalance, `Zakup: ${item.name}`));
  return { ok: true, item, balance: player.credits };
}

export type BankResult = { ok: true; balance: number; credits: number } | { ok: false; reason: string };

export function bankDeposit(player: PlayerState, amount: number): BankResult {
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: "Kwota musi być dodatnia" };
  if (amount > player.credits) return { ok: false, reason: "Za mało środków w portfelu" };
  player.credits -= amount;
  player.bankBalance += amount;
  player.transactions.push(mkTx(amount, player.bankBalance, "Wpłata do banku"));
  return { ok: true, balance: player.bankBalance, credits: player.credits };
}

export function bankWithdraw(player: PlayerState, amount: number): BankResult {
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: "Kwota musi być dodatnia" };
  if (amount > player.bankBalance) return { ok: false, reason: "Za mało środków na koncie" };
  player.bankBalance -= amount;
  player.credits += amount;
  player.transactions.push(mkTx(-amount, player.bankBalance, "Wypłata z banku"));
  return { ok: true, balance: player.bankBalance, credits: player.credits };
}

function mkTx(amount: number, balanceAfter: number, memo: string): Transaction {
  return {
    id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    amount,
    balanceAfter,
    memo,
  };
}
