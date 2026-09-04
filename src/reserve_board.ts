/**
 * reserve_board.ts — Olivium DAO
 * ─────────────────────────────────────────────────────────────────────────────
 * All original functionality preserved + bugs fixed.
 * Exports added for module consumption.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  sb,
  connection,
  getIdentity,
  isConnected,
} from "./connection";

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface Tree {
  tree_id: string;
  name?: string;
  image_url?: string;
  description?: string;
  total_shares: number;
  shares_sold?: number;
  location?: string;
  age?: string;
  height?: string;
  variety?: string;
}

export interface NormalisedPosition {
  treeId: string;
  sharesOwned: number;
  treeName?: string;
  treeMetadata?: any;
  totalStakedOlv?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROGRAM HELPER
// ═══════════════════════════════════════════════════════════════════════════

export function _requireProgram() {
  const p = (window as any)._program;
  if (!p) throw new Error("Program not ready");
  return p;
}

export async function waitForProgram(timeout = 10_000): Promise<any> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const p = (window as any)._program;
    if (p) return p;
    await new Promise(r => setTimeout(r, 150));
  }
  console.warn("[waitForProgram] Timed out");
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// PDA HELPERS
// ═══════════════════════════════════════════════════════════════════════════

export function findProtocolPDA() {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("protocol")],
    _requireProgram().programId
  );
}

export function findTreePDA(treeId: string) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("tree"), Buffer.from(treeId)],
    _requireProgram().programId
  );
}

export function findTreasuryPDA(prog: any) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    prog.programId
  );
}

export async function findPositionPDA(ownerKey: PublicKey, treeId: string) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("position"), ownerKey.toBuffer(), Buffer.from(treeId)],
    _requireProgram().programId
  );
}

(window as any).findProtocolPDA = findProtocolPDA;
(window as any).findTreePDA = findTreePDA;
(window as any).findTreasuryPDA = findTreasuryPDA;

// ═══════════════════════════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════════════════════════

export function showToast(msg: string, isError = false) {
  if (typeof (window as any).showGlobalToast === "function") {
    (window as any).showGlobalToast(msg, isError);
  } else {
    console.log(`[TOAST${isError ? " ERR" : ""}] ${msg}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA CACHES (module-scoped)
// ═══════════════════════════════════════════════════════════════════════════

let treesCache: any[] | null = null;
let treesPromise: Promise<any[]> | null = null;

let positionsCache: any[] | null = null;
let positionsPromise: Promise<any[]> | null = null;
let positionsCacheTime = 0;
const POSITIONS_TTL = 8_000;

let loadTreesPromise: Promise<void> | null = null;

export function _invalidateCaches() {
  treesCache = null;
  treesPromise = null;
  positionsCache = null;
  positionsPromise = null;
  positionsCacheTime = 0;
  loadTreesPromise = null;
}

export async function getTrees(): Promise<any[]> {
  if (treesCache) return treesCache;
  if (treesPromise) return treesPromise;

  treesPromise = (async () => {
    const prog = await waitForProgram();
    if (!prog) return [];
    const data = await prog.account.tree.all();
    treesCache = data;
    return data;
  })().finally(() => {
    treesPromise = null;
  });

  return treesPromise;
}

export async function getAllPositions(force = false): Promise<any[]> {
  const now = Date.now();
  if (positionsCache && !force && now - positionsCacheTime < POSITIONS_TTL) {
    return positionsCache;
  }
  if (positionsPromise) return positionsPromise;

  positionsPromise = (async () => {
    const prog = await waitForProgram();
    if (!prog) return [];
    const data = await prog.account.sharePosition.all();
    positionsCache = data;
    positionsCacheTime = Date.now();
    return data;
  })()
    .catch(err => {
      positionsPromise = null;
      throw err;
    })
    .finally(() => {
      positionsPromise = null;
    });

  return positionsPromise;
}

export function _pkToString(raw: any): string {
  if (!raw) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw.toBase58 === "function") return raw.toBase58();
  try {
    return new PublicKey(raw).toBase58();
  } catch {
    return String(raw);
  }
}

export async function loadUserTreePositions(): Promise<NormalisedPosition[]> {
  const identity = getIdentity();
  if (!identity.wallet) return [];

  const targetAddr = identity.wallet;

  try {
    const prog = await waitForProgram();

    const [allPositions, allTrees] = await Promise.all([getAllPositions(), getTrees()]);

    if (allPositions.length > 0) {
      console.log("[POSITIONS] Sample account fields:", Object.keys(allPositions[0].account));
    }

    let totalStakedOlv = 0;
    if (prog) {
      try {
        const ownerKey = new PublicKey(targetAddr);
        const [stakePda] = PublicKey.findProgramAddressSync(
          [Buffer.from("stake"), ownerKey.toBuffer()],
          prog.programId
        );
        const stakeAcc = await prog.account.stakeAccount.fetch(stakePda);
        totalStakedOlv = (stakeAcc.amount?.toNumber() || 0) / 1_000_000_000;
      } catch {
        /* no stake account */
      }
    }

    const positions = allPositions
      .filter((pos: any) => {
        const acc = pos.account;
        const ownerRaw = acc.authority ?? acc.owner ?? acc.wallet ?? acc.user ?? acc.buyer ?? null;
        if (!ownerRaw) return false;
        return _pkToString(ownerRaw) === targetAddr;
      })
      .map((pos: any) => {
        const acc = pos.account;
        const treeId = acc.treeId?.toString() ?? "";
        const sharesOwned =
          typeof acc.sharesOwned?.toNumber === "function"
            ? acc.sharesOwned.toNumber()
            : Number(acc.sharesOwned ?? 0);

        const tree = allTrees.find((t: any) => t.account.treeId?.toString() === treeId);

        return {
          treeId,
          sharesOwned,
          treeName: tree?.account.name || "Unknown",
          treeMetadata: tree?.account.treeMetadata || null,
          totalStakedOlv,
        } as NormalisedPosition;
      })
      .filter(p => p.sharesOwned > 0);

    console.log(`[POSITIONS] Found ${positions.length} positions for ${targetAddr.slice(0, 8)}…`);
    return positions;
  } catch (err) {
    console.error("[loadUserTreePositions]", err);
    return [];
  }
}

(window as any).loadUserTreePositions = loadUserTreePositions;
(window as any).getAllPositions = getAllPositions;

// ═══════════════════════════════════════════════════════════════════════════
// SOL PRICE
// ═══════════════════════════════════════════════════════════════════════════

let _cachedSolPrice = 100;
let _lastPriceFetch = 0;
(window as any).cachedSolPrice = _cachedSolPrice;

export async function getSolPriceEUR(): Promise<number> {
  const now = Date.now();
  if (now - _lastPriceFetch < 60_000) return _cachedSolPrice;
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=eur"
    );
    const data = await res.json();
    if (data?.solana?.eur) {
      _cachedSolPrice = data.solana.eur;
      _lastPriceFetch = now;
      (window as any).cachedSolPrice = _cachedSolPrice;
    }
  } catch {
    /* fallback */
  }
  return _cachedSolPrice;
}

// ═══════════════════════════════════════════════════════════════════════════
// SELL MODAL
// ═══════════════════════════════════════════════════════════════════════════

let activeSellTreeId: string | null = null;
let maxAvailableSellShares = 0;

export function openSellModal(treeId: string, currentShares: number) {
  activeSellTreeId = String(treeId);
  maxAvailableSellShares = currentShares;

  const modal = document.getElementById("sell-modal");
  const title = document.getElementById("sell-modal-title");
  const owned = document.getElementById("sell-modal-owned");
  const input = document.getElementById("sell-amount-input") as HTMLInputElement | null;

  if (title) title.textContent = `Release Mignoli — Tree #${treeId}`;
  if (owned) owned.textContent = `${currentShares.toLocaleString()} Mignole Registered`;
  if (input) {
    input.value = String(Math.min(10, currentShares));
    input.max = String(currentShares);
  }

  _recalculatePayout();
  modal?.classList.remove("hidden");
}
(window as any).openSellModal = openSellModal;

export function _closeSellModal() {
  document.getElementById("sell-modal")?.classList.add("hidden");
  activeSellTreeId = null;
  maxAvailableSellShares = 0;
}
(window as any).closeSellModal = _closeSellModal;

export function setSellMax() {
  const input = document.getElementById("sell-amount-input") as HTMLInputElement | null;
  if (input) {
    input.value = String(maxAvailableSellShares);
    _recalculatePayout();
  }
}
(window as any).setSellMax = setSellMax;

export function _recalculatePayout() {
  const input = document.getElementById("sell-amount-input") as HTMLInputElement | null;
  const display = document.getElementById("sell-modal-payout");
  if (!input || !display) return;
  const shares = parseInt(input.value) || 0;
  display.textContent = `${((shares * 12.4) / _cachedSolPrice).toFixed(3)} SOL`;
}

// ═══════════════════════════════════════════════════════════════════════════
// SELL CONFIRM ACTION - Button reset belongs here
// ═══════════════════════════════════════════════════════════════════════════

export async function _confirmSellAction() {
  const btn = document.getElementById("sell-submit-btn") as HTMLButtonElement | null;
  const input = document.getElementById("sell-amount-input") as HTMLInputElement | null;
  
  if (!activeSellTreeId || !input || !btn) return;

  const amount = parseInt(input.value) || 0;
  if (amount <= 0 || amount > maxAvailableSellShares) {
    alert("Please specify a valid quantity within your ownership bounds.");
    return;
  }
  
  // Disable button and show processing
  btn.disabled = true;
  btn.textContent = "Processing...";
  btn.dataset.processing = "true";
  
  try {
    await (window as any).sellShares?.(activeSellTreeId, amount);
    _closeSellModal();
    _invalidateCaches();
    await loadTrees();
    await updateStatsUI();
    
    if (typeof (window as any).updateIdentityBalanceUI === "function") {
      await (window as any).updateIdentityBalanceUI();
    }
    
    showToast(`Successfully released ${amount} Mignole!`, false);
    
  } catch (err: any) {
    console.error("[SELL ERROR]", err);
    showToast(`Sell failed: ${err.message || "Unknown error"}`, true);
    
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Confirm Release";
      delete btn.dataset.processing;
    }
  }
}

(window as any).confirmSellAction = _confirmSellAction;

// ═══════════════════════════════════════════════════════════════════════════
// STATS UI
// ═══════════════════════════════════════════════════════════════════════════

export async function updateStatsUI() {
  const treeCountEl = document.getElementById("treeCountStat");
  const shareCountEl = document.getElementById("shareCountStat");
  const groveCountEl = document.getElementById("grovePositionStat");

  try {
    await waitForProgram();
    const allTrees = await getTrees();
    if (treeCountEl) treeCountEl.innerText = String(allTrees.length);
  } catch {
    if (treeCountEl) treeCountEl.innerText = "--";
  }

  const identity = getIdentity();
  if (!identity.wallet) {
    if (shareCountEl) shareCountEl.innerText = "--";
    if (groveCountEl) groveCountEl.innerText = "--";
    return;
  }

  try {
    const positions = await loadUserTreePositions();
    const totalShares = positions.reduce((s, p) => s + p.sharesOwned, 0);
    const uniqueTrees = new Set(positions.map(p => p.treeId)).size;
    if (shareCountEl) shareCountEl.innerText = String(totalShares);
    if (groveCountEl) groveCountEl.innerText = String(uniqueTrees);
  } catch (err) {
    console.error("[updateStatsUI]", err);
    if (shareCountEl) shareCountEl.innerText = "0";
    if (groveCountEl) groveCountEl.innerText = "0";
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// WALLET UI
// ═══════════════════════════════════════════════════════════════════════════

export async function updateWalletUI() {
  if (typeof (window as any).updateIdentityBalanceUI === "function") {
    await (window as any).updateIdentityBalanceUI();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// VILLA STAY TIER UI
// ═══════════════════════════════════════════════════════════════════════════

export async function updateVillaStayUI() {
  const sharesDisplay = document.getElementById("shares-count-display");
  const creditsDisplay = document.getElementById("credits-count-display");
  const tierName = document.getElementById("tier-name");
  const tierIcon = document.getElementById("tier-icon");
  const tierPrgTxt = document.getElementById("tier-progress-text");
  const nextTierLbl = document.getElementById("next-tier-label");
  const tierPctLbl = document.getElementById("tier-percent-label");
  const tierBar = document.getElementById("tier-progress-bar");
  const patronBadge = document.getElementById("patronDiscountBadge");
  const bookingRate = document.getElementById("bookingRateDisplay");
  const cardTier1 = document.getElementById("card-tier-1");
  const cardTier2 = document.getElementById("card-tier-2");
  const cardTier3 = document.getElementById("card-tier-3");
  const perkGov = document.getElementById("perk-gov");
  const perkShipping = document.getElementById("perk-shipping");
  const perkDiscount = document.getElementById("perk-discount");
  const perkStay = document.getElementById("perk-stay");

  const tierEls = [cardTier1, cardTier2, cardTier3, perkGov, perkShipping, perkDiscount, perkStay];
  const dim = (el: Element | null) => {
    el?.classList.remove("opacity-100");
    el?.classList.add("opacity-40");
  };
  const lit = (el: Element | null) => {
    el?.classList.remove("opacity-40");
    el?.classList.add("opacity-100");
  };

  const identity = getIdentity();

  if (!identity.wallet) {
    if (sharesDisplay)
      sharesDisplay.innerHTML = `0 <span class="text-xs text-gold font-mono block mt-1">Mignole Detected</span>`;
    if (creditsDisplay)
      creditsDisplay.innerHTML = `00 <span class="text-xs text-gold font-mono block mt-1">Sanctuary Days</span>`;
    if (tierName) tierName.innerText = "Guest Mode";
    if (tierPrgTxt) tierPrgTxt.innerText = "Connect to view tier status";
    if (patronBadge) patronBadge.innerText = "Standard Account";
    if (bookingRate) bookingRate.innerText = "$450 USD / Nightly standard baseline";
    tierEls.forEach(dim);
    return;
  }

  try {
    await waitForProgram();

    const positions = await loadUserTreePositions();
    const totalShares = positions.reduce((s, p) => s + p.sharesOwned, 0);

    let totalCredits = 0;
    try {
      const { data } = await sb
        .from("users")
        .select("credits")
        .eq("wallet", identity.wallet)
        .maybeSingle();
      if (data) totalCredits = data.credits || 0;
    } catch {
      /* non-critical */
    }

    if (sharesDisplay)
      sharesDisplay.innerHTML = `${totalShares.toLocaleString()} <span class="text-xs text-gold font-mono block mt-1">Mignole Detected</span>`;
    if (creditsDisplay)
      creditsDisplay.innerHTML = `${totalCredits} <span class="text-xs text-gold font-mono block mt-1">Sanctuary Days</span>`;

    tierEls.forEach(dim);

    let currentTier = "Standard Account";
    let nextTier = "Mignole Supporter";
    let pct = 0;
    let icon = "🫒";
    let label = "";

    if (totalShares >= 1000) {
      currentTier = "Tree Guardian";
      nextTier = "Grove Patron";
      pct = 100;
      icon = "👑";
      label = "VIP Privileges unlocked";
      lit(cardTier3);
      [perkGov, perkShipping, perkDiscount, perkStay].forEach(lit);
    } else if (totalShares >= 500) {
      currentTier = "Mignole Guardian";
      nextTier = "Tree Guardian";
      pct = Math.round(((totalShares - 500) / 500) * 100);
      icon = "🌳";
      label = `${1000 - totalShares} shares to Patron`;
      lit(cardTier2);
      [perkGov, perkShipping, perkDiscount].forEach(lit);
    } else if (totalShares >= 100) {
      currentTier = "Mignole Supporter";
      nextTier = "Mignole Guardian";
      pct = Math.round(((totalShares - 100) / 400) * 100);
      icon = "🌱";
      label = `${500 - totalShares} shares to Guardian`;
      lit(cardTier1);
      [perkGov, perkShipping].forEach(lit);
    } else {
      pct = Math.round((totalShares / 100) * 100);
      label = `${100 - totalShares} shares to Seed level`;
    }

    if (tierName) tierName.innerText = currentTier;
    if (tierIcon) tierIcon.innerText = icon;
    if (tierPrgTxt) tierPrgTxt.innerText = label;
    if (nextTierLbl) nextTierLbl.innerText = `Next: ${nextTier}`;
    if (tierPctLbl) tierPctLbl.innerText = `${pct}%`;
    if (tierBar) (tierBar as HTMLElement).style.width = `${pct}%`;

    const hasGenesis = positions.some(p => Number(p.treeId) <= 3);
    let pricingLabel = "Standard Account";
    let rateStr = "$450 USD / Nightly standard baseline";
    if (hasGenesis || totalShares >= 1000) {
      pricingLabel = "👑 Grove Patron Tier";
      rateStr = "$382.50 USD / Nightly (15% Patron Override Applied)";
    } else if (totalShares >= 500) {
      pricingLabel = "🌳 Guardian Tier";
      rateStr = "$382.50 USD / Nightly (15% Guardian Override Applied)";
    } else if (totalShares >= 100) {
      pricingLabel = "🌱 Mignole Supporter";
    }

    if (patronBadge) patronBadge.innerText = pricingLabel;
    if (bookingRate) bookingRate.innerText = rateStr;
  } catch (err) {
    console.error("[updateVillaStayUI]", err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DISCONNECT CLEANUP
// ═══════════════════════════════════════════════════════════════════════════

export async function clearAllUserUiAndStates() {
  console.log("🔄 Clearing user UI and caches…");

  _invalidateCaches();

  localStorage.removeItem("olivium_user");
  if ((window as any).OliviumAuth) (window as any).OliviumAuth.user = null;

  const setEl = (id: string, v: string) => {
    const el = document.getElementById(id);
    if (el) el.innerText = v;
  };
  setEl("shareCountStat", "--");
  setEl("grovePositionStat", "--");
  setEl("identityTypeStat", "Guest");

  await updateStatsUI();
  await updateVillaStayUI();

  const activeFilter = document.querySelector<HTMLElement>(".filter-btn.active");
  if (activeFilter?.dataset.filter === "my") {
    document.querySelector<HTMLElement>('[data-filter="all"]')?.click();
  } else {
    loadTrees("all");
  }
}
(window as any).resetProfileAndUI = clearAllUserUiAndStates;

// ═══════════════════════════════════════════════════════════════════════════
// FILTER BUTTONS
// ═══════════════════════════════════════════════════════════════════════════

export function initFilters() {
  document.querySelectorAll<HTMLElement>(".filter-btn").forEach(btn => {
    btn.addEventListener("click", async e => {
      document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
      (e.currentTarget as HTMLElement).classList.add("active");

      const filter = (e.currentTarget as HTMLElement).dataset.filter || "all";

      if (filter === "my") {
        if (!isConnected()) {
          const c = document.getElementById("treeGrid");
          if (c)
            c.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted,#8a8a8a);"><h3>Connect your profile to view your grove</h3></div>`;
          return;
        }
        const positions = await loadUserTreePositions();
        if (!positions.length) {
          const c = document.getElementById("treeGrid");
          if (c)
            c.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted,#8a8a8a);"><h3>No trees in your grove yet</h3><p>Adopt shares to get started.</p></div>`;
          return;
        }
        (window as any).renderMyTreesFromPositions?.(positions);
        return;
      }

      loadTrees(filter);
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PAYMENT SELECTOR
// ═══════════════════════════════════════════════════════════════════════════

export let paymentMode: "mollie" | "paypal" | "crypto" = "mollie";

export function initPaymentSelector() {
  document.querySelectorAll<HTMLElement>(".payment-option").forEach(opt => {
    opt.addEventListener("click", () => {
      document.querySelectorAll(".payment-option").forEach(o => o.classList.remove("active"));
      opt.classList.add("active");
      paymentMode = (opt.dataset.payment as any) || "mollie";
      (window as any).updateShares?.();
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARE CONTROLS
// ═══════════════════════════════════════════════════════════════════════════

export function _getValidShares(val: number): number {
  const slider = document.getElementById("shareSlider") as HTMLInputElement | null;
  if (!slider) return val;
  return Math.max(Number(slider.min) || 1, Math.min(Number(slider.max) || 1000, val));
}

export function syncFromSlider() {
  const slider = document.getElementById("shareSlider") as HTMLInputElement | null;
  const input = document.getElementById("shareInput") as HTMLInputElement | null;
  if (!slider || !input) return;
  input.value = slider.value;
  (window as any).updateShares?.();
}
(window as any).syncFromSlider = syncFromSlider;

export function changeShares(delta: number) {
  const input = document.getElementById("shareInput") as HTMLInputElement | null;
  const slider = document.getElementById("shareSlider") as HTMLInputElement | null;
  if (!input) return;
  const next = _getValidShares((Number(input.value) || 1) + delta);
  input.value = String(next);
  if (slider) slider.value = String(next);
  (window as any).updateShares?.();
}
(window as any).changeShares = changeShares;

export function setShares(amount: number | "max") {
  const input = document.getElementById("shareInput") as HTMLInputElement | null;
  const slider = document.getElementById("shareSlider") as HTMLInputElement | null;
  if (!input || !slider) return;
  const next = amount === "max" ? Number(slider.max) : _getValidShares(Number(amount));
  input.value = String(next);
  slider.value = String(next);
  (window as any).updateShares?.();
}
(window as any).setShares = setShares;

export async function updateShares() {
  const input = document.getElementById("shareInput") as HTMLInputElement | null;
  const shareDisplay = document.getElementById("shareValue");
  const priceDisplay = document.getElementById("priceDisplay");
  const priceSub = document.getElementById("priceSub");
  const adoptBtn = document.getElementById("adoptBtn") as HTMLButtonElement | null;
  const connectBtn = document.getElementById("adoptConnectBtn") as HTMLButtonElement | null;

  if (!input) return;

  const shares = Number(input.value) || 1;
  const euroPerShare = 12.4;
  const totalEuro = shares * euroPerShare;
  const solPrice = await getSolPriceEUR();
  const totalSol = totalEuro / solPrice;
  const isCrypto = paymentMode === "crypto";
  const isSoldOut = adoptBtn?.innerText === "Sold Out";

  const update = (id: string, v: string) => {
    const el = document.getElementById(id);
    if (el) el.innerText = v;
  };
  update("starter-sol-price", `~${((10 * euroPerShare) / solPrice).toFixed(2)} SOL`);
  update("keeper-sol-price", `~${((100 * euroPerShare) / solPrice).toFixed(2)} SOL`);
  update("fulltree-sol-price", `~${((1000 * euroPerShare) / solPrice).toFixed(2)} SOL`);

  if (shareDisplay) shareDisplay.innerText = shares.toLocaleString();

  if (priceDisplay) {
    priceDisplay.innerHTML = isCrypto
      ? `◎ ${totalSol.toFixed(2)} <span style="font-size:.6em;font-weight:normal;">SOL</span>`
      : `€${totalEuro.toLocaleString()}`;
  }

  if (priceSub) {
    priceSub.innerText = isCrypto
      ? `${shares} share${shares > 1 ? "s" : ""} × ◎ ${(euroPerShare / solPrice).toFixed(4)} SOL`
      : `${shares} share${shares > 1 ? "s" : ""} × €${euroPerShare}`;
  }

  const identity = getIdentity();
  if (isCrypto && !isSoldOut) {
    if (identity.wallet) {
      if (connectBtn) connectBtn.style.display = "none";
      if (adoptBtn) {
        adoptBtn.style.display = "block";
        adoptBtn.innerText = "Continue to Agreement";
      }
    } else {
      if (adoptBtn) adoptBtn.style.display = "none";
      if (connectBtn) {
        connectBtn.style.display = "block";
        connectBtn.innerText = "🔗 Connect Wallet to Continue";
        connectBtn.onclick = async () => {
          try {
            if (typeof (window as any).connectWallet === "function") {
              await (window as any).connectWallet(false);
            } else {
              const prov = (window as any).phantom?.solana || (window as any).solana;
              if (!prov) {
                alert("Phantom wallet required.");
                return;
              }
              const resp = await prov.connect();
              const pk = resp.publicKey?.toBase58() ?? prov.publicKey?.toBase58();
              if (pk) window.dispatchEvent(new CustomEvent("olivium:connected", { detail: { pubkey: pk } }));
            }
          } catch (err) {
            console.error("wallet connect:", err);
          }
          (window as any).updateShares?.();
        };
      }
    }
  } else {
    if (connectBtn) connectBtn.style.display = "none";
    if (!isSoldOut && adoptBtn) {
      adoptBtn.style.display = "block";
      adoptBtn.innerText = "Continue to Agreement";
    }
  }
}
(window as any).updateShares = updateShares;

// ═══════════════════════════════════════════════════════════════════════════
// LOAD TREES
// ═══════════════════════════════════════════════════════════════════════════

export function _esc(str: string): string {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function loadTrees(filter = "all") {
  const container = document.getElementById("treeGrid");
  if (!container) return;

  if (loadTreesPromise) {
    await loadTreesPromise;
    return;
  }

  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>🌿 Syncing live grove availability…</p>
    </div>`;

  loadTreesPromise = _doLoadTrees(filter, container).finally(() => {
    loadTreesPromise = null;
  });

  return loadTreesPromise;
}

export async function _doLoadTrees(filter: string, container: HTMLElement) {
  const program = await waitForProgram();

  const { data: dbTrees, error } = await sb
    .from("tree_metadata")
    .select("*")
    .order("tree_id", { ascending: true });

  if (error || !dbTrees) {
    container.innerHTML = `<p style="padding:40px;text-align:center;">Failed to load trees. Please try again.</p>`;
    return;
  }

  let onChainTrees: any[] = [];
  let userPositions: NormalisedPosition[] = [];

  if (program) {
    try {
      onChainTrees = await program.account.tree.all();
    } catch (err) {
      console.error("[loadTrees] on-chain fetch:", err);
    }
    userPositions = await loadUserTreePositions();
  }

  container.innerHTML = "";
  let cardCount = 0;

  for (const dbTree of dbTrees) {
    const onChainData = onChainTrees.find(t => t.account.treeId === dbTree.tree_id);

    let sharesSold = dbTree.shares_sold || 0;
    let totalShares = dbTree.total_shares || 1000;
    const isLive = !!onChainData;

    if (onChainData) {
      sharesSold = onChainData.account.sharesSold.toNumber();
      totalShares = onChainData.account.totalShares.toNumber();
      dbTree.shares_sold = sharesSold;
      dbTree.total_shares = totalShares;
    }

    const percent = totalShares > 0 ? Math.round((sharesSold / totalShares) * 100) : 0;
    const status = percent >= 100 ? "full" : "available";
    const available = totalShares - sharesSold;

    const authUser = (window as any).OliviumAuth?.getUser?.();
    const emailOrId = authUser?.email || authUser?.id;
    const matchesFiat = emailOrId ? dbTree.owner === emailOrId || dbTree.user_email === emailOrId : false;
    const matchedPos = userPositions.find(p => String(p.treeId) === String(dbTree.tree_id));
    const ownedShares = matchedPos?.sharesOwned ?? 0;
    const isMine = matchesFiat || ownedShares > 0;

    if (!isLive && filter !== "all") continue;
    if (filter === "my" && !isMine) continue;
    if (filter === "available" && status !== "available") continue;
    if (filter === "full" && status !== "full") continue;

    const card = document.createElement("div");
    card.className = "tree-card";
    if (sharesSold > 0) card.classList.add("has-sales");
    if (percent >= 90) card.style.border = "2px solid #d94d4d";
    else if (percent >= 60) card.style.border = "2px solid #d7a728";

    const displayImg =
      dbTree.image_url || "https://raw.githubusercontent.com/kyngrick/olivium_photos/main/olivium_logo2.png";

    card.innerHTML = `
      <img class="tree-image" src="${_esc(displayImg)}" alt="${_esc(dbTree.name || dbTree.tree_id)}" />
      <div class="tree-content">
        <div class="tree-name">${_esc(dbTree.name || dbTree.tree_id)}</div>
        <div class="tree-meta">
          <span>${available} Mignole left</span>
          <span>${percent}% adopted</span>
        </div>
        <div class="availability">
          <div class="availability-label"><span>${sharesSold} / ${totalShares} sold</span></div>
          <div class="progress-bar"><div class="progress-fill" style="width:${percent}%"></div></div>
          <div class="shares-left">${available > 0 ? "Available now" : "Fully adopted"}</div>
        </div>
        ${isLive ? '<div class="live-badge">⛓ LIVE ON-CHAIN</div>' : ""}
        ${isMine && ownedShares > 0 ? `<div class="owned-badge" style="margin-top:6px;font-size:.75rem;color:#6B7F5A;font-weight:600;">✅ You own ${ownedShares.toLocaleString()} Mignole</div>` : ""}
        <div class="card-actions" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:16px;">
          <button class="action-btn details-btn">Details</button>
          ${available > 0 ? '<button class="action-btn adopt-btn">Adopt</button>' : ""}
          ${isMine ? '<button class="action-btn release-btn" style="background:#d94d4d;">Release Mignole</button>' : ""}
        </div>
      </div>`;

    card.querySelector(".details-btn")?.addEventListener("click", e => {
      e.stopPropagation();
      (window as any).openTreeDetailModal?.(dbTree.tree_id);
    });
    card.querySelector(".adopt-btn")?.addEventListener("click", e => {
      e.stopPropagation();
      (window as any).openModal?.(dbTree);
    });
    card.querySelector(".release-btn")?.addEventListener("click", e => {
      e.stopPropagation();
      (window as any).openSellModal?.(dbTree.tree_id, ownedShares || 10);
    });

    container.appendChild(card);
    cardCount++;
  }

  if (cardCount === 0) {
    container.innerHTML = `
      <div style="padding:40px;text-align:center;color:var(--text-muted,#8a8a8a);">
        <h3>${filter === "my" ? "No trees in your grove yet" : "No trees match this filter"}</h3>
      </div>`;
  }
}

(window as any)._loadTreesImpl = loadTrees;
