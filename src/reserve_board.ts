/**
 * reserve_board.ts — Olivium DAO
 * ─────────────────────────────────────────────────────────────────────────────
 * All original functionality preserved + bugs fixed.
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

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface Tree {
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

interface NormalisedPosition {
  treeId: string;
  sharesOwned: number;
  treeName?: string;
  treeMetadata?: any;
  totalStakedOlv?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROGRAM HELPER
// ═══════════════════════════════════════════════════════════════════════════
const mobileToggle = document.getElementById("mobileToggle");
const navLinks = document.getElementById("navLinks");

if (mobileToggle && navLinks) {
  // OPEN / CLOSE MENU
  mobileToggle.addEventListener("click", () => {
    navLinks.classList.toggle("open");
  });

  // CLOSE MENU WHEN ANY LINK OR BUTTON IS CLICKED
  navLinks.querySelectorAll("a, button").forEach((el) => {
    el.addEventListener("click", () => {
      navLinks.classList.remove("open");
    });
  });
}

function _requireProgram() {
  const p = (window as any)._program;
  if (!p) throw new Error("Program not ready");
  return p;
}

async function waitForProgram(timeout = 10_000): Promise<any> {
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

function findProtocolPDA() {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("protocol")],
    _requireProgram().programId
  );
}

function findTreePDA(treeId: string) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("tree"), Buffer.from(treeId)],
    _requireProgram().programId
  );
}

function findTreasuryPDA(prog: any) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    prog.programId
  );
}

async function findPositionPDA(ownerKey: PublicKey, treeId: string) {
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

function showToast(msg: string, isError = false) {
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

function _invalidateCaches() {
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

function _pkToString(raw: any): string {
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

async function getSolPriceEUR(): Promise<number> {
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

(window as any).openSellModal = (treeId: string, currentShares: number) => {
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
};

function _closeSellModal() {
  document.getElementById("sell-modal")?.classList.add("hidden");
  activeSellTreeId = null;
  maxAvailableSellShares = 0;
}
(window as any).closeSellModal = _closeSellModal;

(window as any).setSellMax = () => {
  const input = document.getElementById("sell-amount-input") as HTMLInputElement | null;
  if (input) {
    input.value = String(maxAvailableSellShares);
    _recalculatePayout();
  }
};

function _recalculatePayout() {
  const input = document.getElementById("sell-amount-input") as HTMLInputElement | null;
  const display = document.getElementById("sell-modal-payout");
  if (!input || !display) return;
  const shares = parseInt(input.value) || 0;
  display.textContent = `${((shares * 12.4) / _cachedSolPrice).toFixed(3)} SOL`;
}

// ═══════════════════════════════════════════════════════════════════════════
// SELL CONFIRM ACTION - Button reset belongs here
// ═══════════════════════════════════════════════════════════════════════════

async function _confirmSellAction() {
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
    await sellShares(activeSellTreeId, amount);
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

async function updateStatsUI() {
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

async function updateWalletUI() {
  if (typeof (window as any).updateIdentityBalanceUI === "function") {
    await (window as any).updateIdentityBalanceUI();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// VILLA STAY TIER UI
// ═══════════════════════════════════════════════════════════════════════════

async function updateVillaStayUI() {
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

async function clearAllUserUiAndStates() {
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

function initFilters() {
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
        renderMyTreesFromPositions(positions);
        return;
      }

      loadTrees(filter);
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PAYMENT SELECTOR
// ═══════════════════════════════════════════════════════════════════════════

let paymentMode: "mollie" | "paypal" | "crypto" = "mollie";

function initPaymentSelector() {
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

function _getValidShares(val: number): number {
  const slider = document.getElementById("shareSlider") as HTMLInputElement | null;
  if (!slider) return val;
  return Math.max(Number(slider.min) || 1, Math.min(Number(slider.max) || 1000, val));
}

(window as any).syncFromSlider = () => {
  const slider = document.getElementById("shareSlider") as HTMLInputElement | null;
  const input = document.getElementById("shareInput") as HTMLInputElement | null;
  if (!slider || !input) return;
  input.value = slider.value;
  (window as any).updateShares?.();
};

(window as any).changeShares = (delta: number) => {
  const input = document.getElementById("shareInput") as HTMLInputElement | null;
  const slider = document.getElementById("shareSlider") as HTMLInputElement | null;
  if (!input) return;
  const next = _getValidShares((Number(input.value) || 1) + delta);
  input.value = String(next);
  if (slider) slider.value = String(next);
  (window as any).updateShares?.();
};

(window as any).setShares = (amount: number | "max") => {
  const input = document.getElementById("shareInput") as HTMLInputElement | null;
  const slider = document.getElementById("shareSlider") as HTMLInputElement | null;
  if (!input || !slider) return;
  const next = amount === "max" ? Number(slider.max) : _getValidShares(Number(amount));
  input.value = String(next);
  slider.value = String(next);
  (window as any).updateShares?.();
};

(window as any).updateShares = async () => {
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
};

// ═══════════════════════════════════════════════════════════════════════════
// LOAD TREES
// ═══════════════════════════════════════════════════════════════════════════

async function loadTrees(filter = "all") {
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

async function _doLoadTrees(filter: string, container: HTMLElement) {
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

// ═══════════════════════════════════════════════════════════════════════════
// MY-TREES CARD RENDERER
// ═══════════════════════════════════════════════════════════════════════════

async function renderMyTreesFromPositions(positions: NormalisedPosition[]) {
  const container = document.getElementById("treeGrid");
  if (!container) return;
  container.innerHTML = "";

  if (!positions.length) {
    container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:#7A8275;"><p>🌿 No adopted positions yet for this wallet.</p></div>`;
    return;
  }

  let treeMap = new Map<string, any>();
  try {
    const { data } = await sb.from("tree_metadata").select("*");
    if (Array.isArray(data)) treeMap = new Map(data.map(t => [String(t.tree_id), t]));
  } catch {
    /* non-critical */
  }

  for (const pos of positions) {
    const meta = treeMap.get(String(pos.treeId));
    const name = _esc(meta?.name || `Tree #${pos.treeId}`);
    const totalCap = meta?.total_shares ?? 1000;
    const img =
      meta?.image_url || "https://raw.githubusercontent.com/kyngrick/olivium_photos/main/olivium_logo2.png";
    const ownerPct = Math.min((pos.sharesOwned / totalCap) * 100, 100).toFixed(2);

    const card = document.createElement("div");
    card.className = "tree-card has-sales";
    card.innerHTML = `
      <img class="tree-image" src="${_esc(img)}" alt="${name}"
           style="width:100%;height:160px;object-fit:cover;border-radius:8px;"
           onerror="this.onerror=null;this.src='https://raw.githubusercontent.com/kyngrick/olivium_photos/main/olivium_logo2.png'" />
      <div class="tree-content" style="margin-top:12px;">
        <div class="tree-name" style="font-size:1.2rem;font-weight:600;">${name}</div>
        <div class="tree-meta" style="margin-top:4px;font-size:.85rem;">
          <strong>${pos.sharesOwned.toLocaleString()}</strong> Mignole adopted
          <span style="opacity:.65;">(${totalCap.toLocaleString()} total)</span>
        </div>
        <div class="availability" style="margin-top:12px;">
          <div class="progress-bar" style="width:100%;height:6px;background:rgba(0,0,0,.05);border-radius:3px;overflow:hidden;">
            <div class="progress-fill" style="width:${ownerPct}%;height:100%;background:#6B7F5A;transition:width .3s;"></div>
          </div>
          <div style="margin-top:6px;font-size:.8rem;font-weight:600;color:#6B7F5A;text-transform:uppercase;">${ownerPct}% participation</div>
        </div>
      </div>
      <div class="card-actions" style="display:flex;gap:8px;margin-top:16px;">
        <button class="action-btn details-btn">Details</button>
        <button class="action-btn release-btn" style="background:#d94d4d;">Release Mignole</button>
      </div>`;

    card.querySelector(".details-btn")?.addEventListener("click", e => {
      e.stopPropagation();
      (window as any).openTreeDetailModal?.(pos.treeId);
    });
    card.querySelector(".release-btn")?.addEventListener("click", e => {
      e.stopPropagation();
      (window as any).openSellModal?.(pos.treeId, pos.sharesOwned);
    });

    container.appendChild(card);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function _esc(str: string): string {
  return str.replace(/[&<>]/g, m => {
    if (m === "&") return "&amp;";
    if (m === "<") return "&lt;";
    if (m === ">") return "&gt;";
    return m;
  });
}

const _fallbackImages = [
  "https://raw.githubusercontent.com/kyngrick/olivium_photos/main/Tree%20F1-FR-001.jpeg",
  "https://raw.githubusercontent.com/kyngrick/olivium_photos/main/Tree%20F1-FR-002.jpeg",
  "https://raw.githubusercontent.com/kyngrick/olivium_photos/main/tree04.jpeg",
  "https://raw.githubusercontent.com/kyngrick/olivium_photos/main/tree08.jpeg",
];

function _randomFallback(): string {
  return _fallbackImages[Math.floor(Math.random() * _fallbackImages.length)];
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// PURCHASE MODAL - COMPLETE FIXED VERSION
// Normalizes Supabase data so agreement modal works correctly
// ═══════════════════════════════════════════════════════════════════════════

let selectedTree: Tree | null = null;

(window as any).openModal = (tree: any) => {
  console.log("[MODAL] === OPENING PURCHASE MODAL ===");
  console.log("[MODAL] Raw tree data from Supabase:", tree);
  
  if (!tree) {
    console.error("[MODAL] No tree data provided!");
    showToast("Error loading tree details", true);
    return;
  }

  // ✅ NORMALIZE THE DATA - Map Supabase field names to what the UI expects
  const normalizedTree = {
    // Core identifiers
    tree_id: tree.tree_id,
    
    // Display fields with fallbacks
    name: tree.name || `Tree ${tree.tree_id}`,
    description: tree.description || "Secure your digital olive tree adoption. Each mignole represents participation in adoption of a real olive tree, with verified on-chain proof.",
    
    // Location data
    location: tree.location || (tree.field_id ? `Field ${tree.field_id}` : "Toscagialla Heritage Grove, Tuscany"),
    field_id: tree.field_id,
    latitude: tree.latitude,
    longitude: tree.longitude,
    
    // Physical characteristics - Map your actual field names
    age: tree.age || (tree.age_years ? `${tree.age_years} years` : "5+ years"),
    age_years: tree.age_years,
    height: tree.height || (tree.height_cm ? `${tree.height_cm} cm` : "2.5m"),
    height_cm: tree.height_cm,
    variety: tree.variety || "Frantoio",
    
    // Images
    image_url: tree.image_url || tree.photo_url || "https://raw.githubusercontent.com/kyngrick/olivium_photos/main/olivium_logo2.png",
    photo_url: tree.photo_url,
    
    // Share data
    total_shares: Number(tree.total_shares) || 1000,
    shares_sold: Number(tree.shares_sold) || 0,
    
    // On-chain data
    on_chain: tree.on_chain || false,
    on_chain_address: tree.on_chain_address,
    mint: tree.mint,
    status: tree.status,
    
    // Health data
    health_score: tree.health_score,
    
    // Metadata
    field_pda: tree.field_pda,
    updated_at: tree.updated_at
  };
  
  console.log("[MODAL] Normalized tree data:", normalizedTree);
  console.log("[MODAL] Name:", normalizedTree.name);
  console.log("[MODAL] Location:", normalizedTree.location);
  console.log("[MODAL] Age:", normalizedTree.age);
  console.log("[MODAL] Height:", normalizedTree.height);
  console.log("[MODAL] Variety:", normalizedTree.variety);
  console.log("[MODAL] Image URL:", normalizedTree.image_url);
  console.log("[MODAL] Shares:", normalizedTree.total_shares, "Sold:", normalizedTree.shares_sold);
  
  // ✅ Store the normalized tree for agreement modal
  selectedTree = normalizedTree;
  
  // Also expose to window for debugging
  (window as any).selectedTree = selectedTree;

  // Get modal element
  const modal = document.getElementById("modalOverlay");
  if (!modal) {
    console.error("[MODAL] Modal overlay not found!");
    return;
  }

  // Lock body scroll
  document.body.style.overflow = "hidden";
  
  // Reset payment mode to default
  paymentMode = "mollie";
  
  // Reset payment options UI
  document.querySelectorAll(".payment-option").forEach(el => el.classList.remove("active"));
  const mollieOption = document.getElementById("mollieOption");
  if (mollieOption) mollieOption.classList.add("active");

  // Calculate available shares
  const totalShares = normalizedTree.total_shares;
  const sharesSold = normalizedTree.shares_sold;
  const available = Math.max(0, totalShares - sharesSold);
  
  console.log("[MODAL] Available shares:", available);

  // Update modal title
  const titleEl = document.getElementById("modalTitle");
  if (titleEl) titleEl.innerText = normalizedTree.name;

  // Update description
  const descEl = document.getElementById("modalDescription");
  if (descEl) descEl.innerText = normalizedTree.description;

  // Update image with fallback
  const img = document.getElementById("modalImage") as HTMLImageElement | null;
  if (img) {
    img.src = normalizedTree.image_url;
    img.onerror = () => {
      console.warn("[MODAL] Image failed to load, using fallback");
      img.src = "https://raw.githubusercontent.com/kyngrick/olivium_photos/main/olivium_logo2.png";
    };
  }

  // Update share input
  const shareInput = document.getElementById("shareInput") as HTMLInputElement | null;
  const slider = document.getElementById("shareSlider") as HTMLInputElement | null;
  const maxLabel = document.getElementById("sliderMaxLabel");
  const maxBtn = document.getElementById("maxShareBtn");
  const adoptBtn = document.getElementById("adoptBtn") as HTMLButtonElement | null;

  if (shareInput) {
    shareInput.value = available <= 0 ? "0" : "1";
    shareInput.dataset.max = String(available);
    shareInput.max = String(available);
  }
  
  if (slider) {
    slider.min = available <= 0 ? "0" : "1";
    slider.max = String(available);
    slider.value = available <= 0 ? "0" : "1";
  }
  
  if (maxLabel) maxLabel.textContent = String(available);
  if (maxBtn) maxBtn.textContent = `Max (${available})`;
  
  if (adoptBtn) {
    if (available <= 0) {
      adoptBtn.disabled = true;
      adoptBtn.innerText = "Sold Out";
    } else {
      adoptBtn.disabled = false;
      adoptBtn.innerText = "Continue to Agreement";
    }
  }

  // Show the modal
  modal.style.display = "flex";
  console.log("[MODAL] Purchase modal opened");
  
  // Update price display
  if (typeof (window as any).updateShares === "function") {
    (window as any).updateShares();
  }
};

(window as any).closeModal = () => {
  console.log("[MODAL] Closing purchase modal");
  
  const modal = document.getElementById("modalOverlay");
  if (modal) modal.style.display = "none";
  document.body.style.overflow = "";
  
  // Reset share inputs to default
  const shareInput = document.getElementById("shareInput") as HTMLInputElement | null;
  const slider = document.getElementById("shareSlider") as HTMLInputElement | null;
  const shareValue = document.getElementById("shareValue");
  
  if (shareInput) shareInput.value = "1";
  if (slider) slider.value = "1";
  if (shareValue) shareValue.textContent = "1";
};
// ═══════════════════════════════════════════════════════════════════════════
// AGREEMENT MODAL - COMPLETE FIXED VERSION
// Now works because selectedTree has been normalized
// ═══════════════════════════════════════════════════════════════════════════
(window as any).openAgreement = () => {
  console.log("[AGREEMENT] Opening with tree:", selectedTree);
  
  if (!selectedTree) {
    console.error("[AGREEMENT] No selected tree!");
    return;
  }

  // ✅ READ YOUR ACTUAL FIELD NAMES
  const treeName = selectedTree.name || `Tree ${selectedTree.tree_id}`;
  const treeLocation = selectedTree.location || `Field ${selectedTree.field_id || 'F1'}`;
  const treeAge = selectedTree.age || (selectedTree.age_years ? `${selectedTree.age_years} years` : "5+ years");
  const treeHeight = selectedTree.height || (selectedTree.height_cm ? `${selectedTree.height_cm} cm` : "2.5m");
  const treeVariety = selectedTree.variety || "Frantoio";
  const treeImage = selectedTree.image_url || selectedTree.photo_url || "https://raw.githubusercontent.com/kyngrick/olivium_photos/main/olivium_logo2.png";

  console.log("[AGREEMENT] Mapped values:", {treeName, treeLocation, treeAge, treeHeight, treeVariety});

  // Get modal elements
  const agreeModal = document.getElementById("agreementModal");
  const purchaseModal = document.getElementById("modalOverlay");
  
  if (!agreeModal) return;

  // Toggle modals
  document.body.style.overflow = "hidden";
  if (purchaseModal) purchaseModal.style.display = "none";
  agreeModal.style.display = "flex";

  // Set the values using your actual data
  const titleEl = document.getElementById("agreeTitle");
  if (titleEl) titleEl.innerText = `Adopting ${treeName}`;
  
  const imgEl = document.getElementById("agreeImage") as HTMLImageElement;
  if (imgEl) imgEl.src = treeImage;
  
  const locationEl = document.getElementById("agreeLocation");
  if (locationEl) locationEl.innerText = treeLocation;
  
  const ageEl = document.getElementById("agreeAge");
  if (ageEl) ageEl.innerText = treeAge;
  
  const heightEl = document.getElementById("agreeHeight");
  if (heightEl) heightEl.innerText = treeHeight;
  
  const varietyEl = document.getElementById("agreeVariety");
  if (varietyEl) varietyEl.innerText = treeVariety;

  // Setup checkbox
  const checkbox = document.getElementById("agreeCheckbox") as HTMLInputElement;
  const finalBtn = document.getElementById("finalConfirmBtn") as HTMLButtonElement;
  
  if (checkbox && finalBtn) {
    checkbox.checked = false;
    finalBtn.disabled = true;
    checkbox.onchange = () => { finalBtn.disabled = !checkbox.checked; };
  }
};

(window as any).closeAgreement = () => {
  console.log("[AGREEMENT] Closing agreement modal");
  
  const agreeModal = document.getElementById("agreementModal");
  const purchaseModal = document.getElementById("modalOverlay");
  
  if (agreeModal) agreeModal.style.display = "none";
  if (purchaseModal) purchaseModal.style.display = "flex";
  
  document.body.style.overflow = "";
};

(window as any).closeSuccess = () => {
  const el = document.getElementById("successModal");
  if (el) el.style.display = "none";
  document.body.style.overflow = "";
};

// ═══════════════════════════════════════════════════════════════════════════
// BLOCKCHAIN TX - FIXED VERSION
// ═══════════════════════════════════════════════════════════════════════════

(window as any).processBlockchainTx = async () => {
  const program = (window as any)._program;
  const provider = (window as any)._provider || (window as any).provider;
  const finalBtn = document.getElementById("finalConfirmBtn") as HTMLButtonElement | null;

  if (finalBtn && (finalBtn.disabled || finalBtn.dataset.processing === "true")) return;
  if (!program || !provider) {
    alert("Wallet not fully connected. Please sign in.");
    return;
  }
  if (!selectedTree) return;

  const amountInput = document.getElementById("shareInput") as HTMLInputElement | null;
  if (!amountInput) return;

  const amount = new anchor.BN(Number(amountInput.value)); // FIXED: Convert to number first
  const buyerPublicKey = provider.wallet?.publicKey || provider.publicKey;
  if (!buyerPublicKey) {
    alert("Could not resolve wallet public key.");
    return;
  }

  try {
    if (finalBtn) {
      finalBtn.disabled = true;
      finalBtn.dataset.processing = "true";
      finalBtn.innerText = "Processing…";
    }

    const [treePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("tree"), Buffer.from(selectedTree.tree_id)],
      program.programId
    );
    const [positionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("position"), buyerPublicKey.toBuffer(), Buffer.from(selectedTree.tree_id)],
      program.programId
    );
    const [protocolPda] = PublicKey.findProgramAddressSync([Buffer.from("protocol")], program.programId);
    const [treasuryPda] = PublicKey.findProgramAddressSync([Buffer.from("treasury")], program.programId);

    const ix = await program.methods
      .purchaseShares(selectedTree.tree_id, amount)
      .accounts({
        tree: treePda,
        position: positionPda,
        protocol: protocolPda,
        treasury: treasuryPda,
        buyer: buyerPublicKey,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const conn = program.provider.connection;
    const tx = new anchor.web3.Transaction().add(ix);
    tx.feePayer = buyerPublicKey;
    tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;

    let sig = "";
    if (provider.wallet?.signTransaction) {
      const s = await provider.wallet.signTransaction(tx);
      sig = await conn.sendRawTransaction(s.serialize());
    } else if (provider.signTransaction) {
      const s = await provider.signTransaction(tx);
      sig = await conn.sendRawTransaction(s.serialize());
    } else {
      sig = await program.provider.sendAndConfirm(tx, []);
    }

    await conn.confirmTransaction(sig, "confirmed");

    _invalidateCaches();
    loadTrees();
    updateStatsUI();
    const agreeModal = document.getElementById("agreementModal");
    const successModal = document.getElementById("successModal");
    if (agreeModal) agreeModal.style.display = "none";
    if (successModal) successModal.style.display = "flex";
    
    if (finalBtn) {
      delete finalBtn.dataset.processing;
      finalBtn.disabled = false;
      finalBtn.textContent = "Confirm & Pay";
    }    

    loadTrees();
    updateStatsUI();
    
    if (typeof (window as any).updateIdentityBalanceUI === "function") {
      await (window as any).updateIdentityBalanceUI();
    }
    
    showToast("Adoption successful! Your Mignole is added.", false);
    
    // FIXED: Use 'sig' (the transaction signature string) instead of 'tx' (the transaction object)
    const txDetails = await program.provider.connection.getTransaction(sig, {
      commitment: "confirmed"
    });

    const solPaid = txDetails?.meta?.fee
      ? txDetails.meta.fee / 1_000_000_000
      : Number(amount) * _cachedSolPrice;
      
    await syncTransactionToSupabase(
      buyerPublicKey.toBase58(),
      selectedTree.tree_id,
      Number(amountInput.value),
      "BUY",
      sig,
      0,
      false,
      solPaid
    );
    
  } catch (err) {
    console.error("TX Error:", err);
    alert("Transaction failed. Check wallet balance or signing approval.");
    if (finalBtn) {
      finalBtn.disabled = false;
      delete finalBtn.dataset.processing;
      finalBtn.innerText = "Confirm & Pay";
    }
  }
};
// ═══════════════════════════════════════════════════════════════════════════
// SELL SHARES
// ═══════════════════════════════════════════════════════════════════════════

async function sellShares(treeId: string | number, amount: number) {
  const treeIdStr = String(treeId);
  const program = (window as any)._program;
  const identity = getIdentity();
  const walletStr = identity.wallet;

  if (!program || !walletStr) {
    console.error("[SELL] Missing program or wallet");
    return;
  }

  try {
    const ownerKey = new anchor.web3.PublicKey(walletStr);
    const [treePDA] = findTreePDA(treeIdStr);
    const [posPDA] = await findPositionPDA(ownerKey, treeIdStr);
    const [protoPDA] = findProtocolPDA();
    const [treasPDA] = findTreasuryPDA(program);

    const current = await program.account.sharePosition.fetch(posPDA);
    const currentQty = Number(current.sharesOwned);
    const newTotal = currentQty - amount;
    if (newTotal < 0) throw new Error(`Insufficient shares. Own ${currentQty}, selling ${amount}.`);

    const tx = await program.methods
      .sellShares(treeIdStr, new anchor.BN(amount))
      .accounts({
        tree: treePDA,
        position: posPDA,
        protocol: protoPDA,
        treasury: treasPDA,
        seller: ownerKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    showToast("Release successful! Your support was appreciated.", false);
    const txDetails = await program.provider.connection.getTransaction(tx, {
  commitment: "confirmed"
});

const solPaid =
  txDetails?.meta?.fee
    ? txDetails.meta.fee / 1_000_000_000
    : amount * _cachedSolPrice;

    console.log("[SELL] SUCCESS:", tx);

await syncTransactionToSupabase(
  walletStr,
  treeIdStr,
  amount,
  "SELL",
  tx,
  newTotal,
  newTotal >= 1000,
  solPaid
);
    _invalidateCaches();
    loadTrees();
    updateStatsUI();
  } catch (err: any) {
    console.error("[SELL FAILED]", err);
    throw err;
  }
}
(window as any).sellShares = sellShares;

// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE TRANSACTION SYNC
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE TRANSACTION SYNC (Fixed column name)
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE TRANSACTION SYNC (Fixed column name)
// ═══════════════════════════════════════════════════════════════════════════

async function syncTransactionToSupabase(
  wallet: string,
  treeId: string,
  amount: number,
  type: "BUY" | "SELL",
  txSig: string,
  newTotal: number,
  isGuardian: boolean,
  solPaid: number | null = null
) {
  try {
    const { error } = await sb.from("transactions").insert([
      {
        wallet_address: wallet,
        tree_id: treeId,
        amount: amount,
        type: type,
        tx_signature: txSig,
        new_total: newTotal,
        is_guardian: isGuardian,
        sol_paid: solPaid,
      },
    ]);

    if (error) {
      console.warn("[syncTransactionToSupabase] Insert failed:", error.message);
    }
  } catch (err) {
    console.warn("[syncTransactionToSupabase] Non-critical error:", err);
  }
}
// ═══════════════════════════════════════════════════════════════════════════
// CHECKOUT
// ═══════════════════════════════════════════════════════════════════════════

async function startMollieCheckout() {
  const shares = Number((document.getElementById("shareInput") as HTMLInputElement)?.value || 1);
  try {
    const res = await fetch(`${API_URL}/create-mollie-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shares,
        treeId: selectedTree?.tree_id,
        treeName: selectedTree?.name,
        userEmail: (window as any).OliviumAuth?.user?.email || null,
      }),
    });
    const data = await res.json();
    if (data.checkoutUrl) window.location.href = data.checkoutUrl;
    else alert("Failed to create payment");
  } catch (err) {
    console.error(err);
    alert("Payment server error");
  }
}

async function startPaypalCheckout() {
  console.log("[PAYPAL] startPaypalCheckout — implement backend endpoint");
}

// ═══════════════════════════════════════════════════════════════════════════
// TREE DETAIL MODAL
// ═══════════════════════════════════════════════════════════════════════════

async function openTreeDetailModal(treeId: string) {
  const modal = document.getElementById("tree-detail-modal");
  if (!modal) return;

  modal.classList.remove("hidden");
  switchTreeDetailTab("overview");

  const set = (id: string, val: string) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
  };

  const [sbResult, onChainTrees] = await Promise.all([
    sb.from("tree_metadata").select("*").eq("tree_id", treeId).single(),
    (async () => {
      try {
        const p = (window as any)._program;
        return p ? await p.account.tree.all() : [];
      } catch {
        return [];
      }
    })(),
  ]);

  const d = sbResult?.data ?? null;
  const onChain = (onChainTrees as any[]).find(
    t => t.account?.treeId === treeId || String(t.account?.treeId) === String(treeId)
  );

  const totalShares = onChain ? onChain.account.totalShares.toNumber() : d?.total_shares ?? 1000;
  const sharesSold = onChain ? onChain.account.sharesSold.toNumber() : d?.shares_sold ?? 0;
  const available = totalShares - sharesSold;
  const pct = totalShares > 0 ? Math.round((sharesSold / totalShares) * 100) : 0;
  const mintAddress = onChain?.account?.mint?.toBase58?.() ?? d?.mint ?? d?.on_chain_address ?? "—";

  const heroEl = document.getElementById("tree-detail-hero-img");
  if (heroEl) {
    heroEl.style.backgroundImage = `url('${d?.photo_url || "https://raw.githubusercontent.com/kyngrick/olivium_photos/main/close1.jpeg"}')`;
  }

  set("tree-detail-name", d?.name || `Tree #${treeId}`);
  set(
    "tree-detail-location",
    d?.field_id ? `Field ${d.field_id} · ${d.latitude?.toFixed(4)}, ${d.longitude?.toFixed(4)}` : "—"
  );
  set("tree-detail-field-id", d?.field_id || "—");
  set("tree-detail-health", d?.health_score != null ? `${(d.health_score * 100).toFixed(0)}%` : "—");
  set("tree-detail-status-badge", d?.status || "—");
  set("tree-detail-age", d?.age_years != null ? `${d.age_years} yrs` : "—");
  set("tree-detail-height", d?.height_cm != null ? `${d.height_cm} cm` : "—");
  set("tree-detail-variety", d?.variety || "—");
  set("tree-overview-shares", `${sharesSold.toLocaleString()} / ${totalShares.toLocaleString()}`);
  set("tree-overview-pct", `${pct}%`);
  set("tree-overview-sold-label", `${sharesSold.toLocaleString()} sold`);
  set("tree-overview-total-label", `${totalShares.toLocaleString()} total`);

  const bar = document.getElementById("tree-overview-bar");
  if (bar) (bar as HTMLElement).style.width = `${pct}%`;

  set("tree-detail-last-treatment", d?.last_treatment ? new Date(d.last_treatment).toLocaleDateString() : "—");
  set("tree-detail-treatment-type", d?.treatment_type || "—");
  set("tree-detail-last-fertilizer", d?.last_fertilizer ? new Date(d.last_fertilizer).toLocaleDateString() : "—");
  set("tree-detail-fertilizer-type", d?.fertilizer_type || "—");

  set("phys-age", d?.age_years != null ? String(d.age_years) : "—");
  set("phys-height", d?.height_cm != null ? String(d.height_cm) : "—");
  set("phys-circumference", d?.circumference_cm != null ? String(d.circumference_cm) : "—");
  set("phys-diameter", d?.diameter_cm != null ? String(d.diameter_cm) : "—");
  set("phys-crown", d?.crown_spread_cm != null ? String(d.crown_spread_cm) : "—");
  set("phys-altitude", d?.altitude_m != null ? String(d.altitude_m) : "—");
  set("phys-coords", d?.latitude != null && d?.longitude != null ? `${d.latitude}, ${d.longitude}` : "—");

  set("tree-detail-meta-id", treeId);
  set("tree-detail-meta-field", d?.field_id || "—");
  set("tree-detail-meta-onchain", d?.on_chain_address || "—");
  set("tree-detail-meta-mint", mintAddress);
  set("tree-detail-meta-status", d?.status || "—");
  set("tree-detail-meta-total", totalShares.toLocaleString());
  set("tree-detail-meta-sold", sharesSold.toLocaleString());
  set("tree-detail-meta-available", available.toLocaleString());
  set("tree-detail-meta-variety", d?.variety || "—");
  set("tree-detail-meta-coords", d?.latitude != null ? `${d.latitude}, ${d.longitude}` : "—");
  set("tree-detail-meta-updated", d?.updated_at ? new Date(d.updated_at).toLocaleString() : "—");

  const galleryGrid = document.getElementById("tree-detail-gallery-grid");
  if (galleryGrid) {
    const photos: string[] = [];
    if (d?.photo_url) photos.push(d.photo_url);
    if (!photos.length) {
      const b = "https://raw.githubusercontent.com/kyngrick/olivium_photos/main";
      photos.push(`${b}/Tree%20F1-FR-001.jpeg`, `${b}/Tree%20F1-FR-002.jpeg`, `${b}/close1.jpeg`);
    }
    galleryGrid.innerHTML = photos
      .map(url => `<img src="${url}" class="rounded-xl w-full h-40 object-cover" onerror="this.style.display='none'" />`)
      .join("");
  }

  const fieldId = d?.field_id ?? null;
  const sensorData = await fetchFieldSensors(fieldId);
  const lat = sensorData?.lat ?? d?.latitude ?? null;
  const lon = sensorData?.lon ?? d?.longitude ?? null;
  if (lat != null && lon != null) set("weather-coords-label", `${Number(lat).toFixed(4)}°N, ${Number(lon).toFixed(4)}°E`);
  if (fieldId) set("env-field-label", fieldId);

  const weatherData = await fetchOpenMeteo(lat, lon);
  populateSensorUI(sensorData);
  populateWeatherUI(weatherData);
}
(window as any).openTreeDetailModal = openTreeDetailModal;

function closeTreeDetailModal() {
  document.getElementById("tree-detail-modal")?.classList.add("hidden");
}
(window as any).closeTreeDetailModal = closeTreeDetailModal;

function switchTreeDetailTab(tabName: string) {
  document.querySelectorAll(".tree-detail-tab-content").forEach(el => el.classList.add("hidden"));
  document.getElementById(`tree-detail-tab-${tabName}`)?.classList.remove("hidden");

  document.querySelectorAll(".tree-detail-tab").forEach(tab => {
    tab.classList.remove("active", "border-green-600", "text-green-600");
    tab.classList.add("border-transparent", "text-stone-500");
  });
  const active = Array.from(document.querySelectorAll(".tree-detail-tab")).find(
    t => t.getAttribute("onclick")?.includes(`'${tabName}'`)
  );
  if (active) {
    active.classList.add("active", "border-green-600", "text-green-600");
    active.classList.remove("border-transparent", "text-stone-500");
  }
}
(window as any).switchTreeDetailTab = switchTreeDetailTab;

// ═══════════════════════════════════════════════════════════════════════════
// SENSORS & WEATHER
// ═══════════════════════════════════════════════════════════════════════════

async function fetchFieldSensors(fieldId: string | null): Promise<any | null> {
  if (!fieldId) return null;
  try {
    const { data, error } = await sb
      .from("node_sensors")
      .select("*")
      .eq("field_id", fieldId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("[SENSORS]", error);
      return null;
    }
    return data;
  } catch (err) {
    console.error("[SENSORS]", err);
    return null;
  }
}

async function fetchOpenMeteo(lat: number | null, lon: number | null): Promise<any | null> {
  if (lat == null || lon == null) return null;
  try {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      current: ["temperature_2m", "relative_humidity_2m", "wind_speed_10m", "surface_pressure", "rain", "uv_index", "shortwave_radiation"].join(","),
      wind_speed_unit: "ms",
      timezone: "auto",
    });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json?.current ?? null;
  } catch {
    return null;
  }
}

function populateSensorUI(s: any | null) {
  const na = "—";
  const set = (id: string, val: string) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
  };

  if (!s) {
    set("oracle-soil-moisture", na);
    set("oracle-moisture-status", "No data");
    set("oracle-soil-temp", na);
    set("oracle-leaf-wetness", na);
    set("oracle-light", na);
    set("oracle-co2", na);
    set("oracle-wind", na);
    set("oracle-rain", na);
    set("oracle-humidity", na);
    set("oracle-uv", na);
    set("oracle-last-update", "No sensor data");
    const bar = document.getElementById("oracle-moisture-bar") as HTMLElement | null;
    if (bar) bar.style.width = "0%";
    return;
  }

  const moisture = s.soil_moisture ?? null;
  set("oracle-soil-moisture", moisture !== null ? `${Number(moisture).toFixed(1)}%` : na);
  set("oracle-moisture-status", moisture !== null ? (moisture > 50 ? "Optimal" : "Balanced") : "No data");
  set("oracle-soil-temp", s.temperature != null ? `${Number(s.temperature).toFixed(1)}°C` : na);
  set("oracle-leaf-wetness", s.leaf_wetness != null ? Number(s.leaf_wetness).toFixed(2) : na);
  set("oracle-co2", s.co2 != null ? `${Number(s.co2).toFixed(1)} ppm` : na);
  set("oracle-wind", s.wind_speed != null ? `${Number(s.wind_speed).toFixed(1)} m/s` : na);
  set("oracle-rain", s.rain_rate != null ? `${Number(s.rain_rate).toFixed(2)} mm/hr` : na);
  set("oracle-humidity", s.humidity != null ? `${Number(s.humidity).toFixed(1)}%` : na);
  set("oracle-uv", s.uv_index != null ? String(s.uv_index) : na);
  set("oracle-last-update", s.created_at ? new Date(s.created_at).toLocaleTimeString() : new Date().toLocaleTimeString());

  const bar = document.getElementById("oracle-moisture-bar") as HTMLElement | null;
  if (bar) bar.style.width = moisture !== null ? `${Math.min(moisture, 100)}%` : "0%";
}

function populateWeatherUI(w: any | null) {
  const na = "—";
  const set = (id: string, val: string) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
  };

  if (!w) {
    set("weather-temp", na);
    set("weather-wind", na);
    set("weather-humidity", na);
    set("weather-pressure", na);
    set("weather-rain", na);
    set("weather-uv", na);
    set("weather-solar", na);
    return;
  }

  const uvRaw = w.uv_index ?? null;
  const uvLabel =
    uvRaw !== null ? `${uvRaw} (${uvRaw <= 2 ? "Low" : uvRaw <= 5 ? "Moderate" : uvRaw <= 7 ? "High" : "Very High"})` : na;

  set("weather-temp", w.temperature_2m !== undefined ? `${w.temperature_2m}°C` : na);
  set("weather-wind", w.wind_speed_10m !== undefined ? `${w.wind_speed_10m} m/s` : na);
  set("weather-humidity", w.relative_humidity_2m !== undefined ? `${w.relative_humidity_2m}%` : na);
  set("weather-pressure", w.surface_pressure !== undefined ? `${w.surface_pressure} hPa` : na);
  set("weather-rain", w.rain !== undefined ? `${w.rain} mm` : na);
  set("weather-uv", uvLabel);
  set("weather-solar", w.shortwave_radiation !== undefined ? `${w.shortwave_radiation} W/m²` : na);
}

// ═══════════════════════════════════════════════════════════════════════════
// GLOBAL EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

(window as any).updateVillaStayUI = updateVillaStayUI;
(window as any).updateStatsUI = updateStatsUI;
(window as any).updateWalletUI = updateWalletUI;
(window as any).loadTrees = loadTrees;

// ═══════════════════════════════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════════════════

window.addEventListener("olivium:connected", async () => {
  console.log("[SYNC] olivium:connected — refreshing UI…");
  _invalidateCaches();

  await updateWalletUI();
  await Promise.all([updateStatsUI(), updateVillaStayUI()]);

  const activeFilter = document.querySelector<HTMLElement>(".filter-btn.active");
  const filter = activeFilter?.dataset.filter || "all";

  if (filter === "my") {
    const positions = await loadUserTreePositions();
    if (positions.length) {
      renderMyTreesFromPositions(positions);
    } else {
      loadTrees("all");
    }
  } else {
    loadTrees(filter);
  }
});

window.addEventListener("olivium:disconnected", () => {
  clearAllUserUiAndStates();
});

// ═══════════════════════════════════════════════════════════════════════════
// DOM INIT
// ═══════════════════════════════════════════════════════════════════════════

window.addEventListener("DOMContentLoaded", async () => {
  console.log("[INIT] DOMContentLoaded — reserve_board.ts");

  initFilters();
  initPaymentSelector();

  await waitForProgram();
  loadTrees("all");
  updateStatsUI();
  updateVillaStayUI();

  document.getElementById("sell-amount-input")?.addEventListener("input", _recalculatePayout);

  document.getElementById("finalConfirmBtn")?.addEventListener("click", async () => {
    if (paymentMode === "mollie") {
      await startMollieCheckout();
      return;
    }
    if (paymentMode === "paypal") {
      await startPaypalCheckout();
      return;
    }
    if (paymentMode === "crypto") {
      (window as any).processBlockchainTx?.();
      return;
    }
  });
});
