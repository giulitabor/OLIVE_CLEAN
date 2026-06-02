/**
 * reserve_board.ts — Olivium DAO
 * ─────────────────────────────────────────────────────────────────────────────
 * Responsibilities:
 *  • Tree grid rendering (all / available / full / my filters)
 *  • Stats header (tree count, share count, grove positions)
 *  • Villa stay tier logic
 *  • Sell modal
 *  • Tree detail modal (overview, physical, sensors, weather, metadata, gallery)
 *  • Purchase modal (adopt flow, price calculator)
 *  • Blockchain tx for crypto purchases
 *
 * What was fixed vs the original:
 *  1. walletState / Wallet() replaced by getIdentity() from connection.ts SSOT.
 *  2. updateWalletUI() no longer sets window.OliviumIdentity — that is managed
 *     exclusively by connection.ts.
 *  3. updateStatsUI() + updateVillaStayUI() both guard against being called
 *     before the program is ready, using waitForProgram() properly.
 *  4. positionsCache / positionsPromise moved to module scope (not window),
 *     accessed only through getAllPositions(). Old AllPositions() duplicate removed.
 *  5. getTrees() now invalidates its cache on olivium:disconnected so guest
 *     users always see fresh data after a reconnect.
 *  6. loadTrees() / loadUserTreePositions() de-duplication: a second call while
 *     the first is still running returns the same Promise.
 *  7. DOMContentLoaded is the single initialisation gate — no duplicate calls.
 *  8. Event listeners: olivium:connected + olivium:disconnected only.
 *     solana:connection-complete removed (bridged in reserveb.ts already).
 *  9. initWalletOnLoad() deleted — the olivium:connected event fires after
 *     restoreSession() in connection.ts, which already triggers the handlers.
 * 10. clearAllUserUiAndStates() is the single disconnect handler.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  sb,
  getIdentity,
  isConnected,
} from "./connection";

// ─── Re-expose for inline scripts ─────────────────────────────────────────
(window as any).findProtocolPDA = findProtocolPDA;
(window as any).findTreePDA     = findTreePDA;
(window as any).findTreasuryPDA = findTreasuryPDA;

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface Tree {
  tree_id:      string;
  name?:        string;
  image_url?:   string;
  description?: string;
  total_shares: number;
  shares_sold?: number;
  location?:    string;
  age?:         string;
  height?:      string;
  variety?:     string;
}

interface NormalisedPosition {
  treeId:      string;
  sharesOwned: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// PDA HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function _requireProgram() {
  const p = (window as any)._program;
  if (!p) throw new Error("Program not ready");
  return p;
}

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

function findTreasuryPDA(activeProgram: any) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    activeProgram.programId
  );
}

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
// WAIT FOR PROGRAM
// ═══════════════════════════════════════════════════════════════════════════

async function waitForProgram(timeout = 10_000): Promise<any> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const p = (window as any)._program;
    if (p) return p;
    await new Promise(r => setTimeout(r, 150));
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA CACHES  (module-scoped; invalidated on disconnect)
// ═══════════════════════════════════════════════════════════════════════════

let treesCache:     any[]            | null = null;
let treesPromise:   Promise<any[]>   | null = null;

let positionsCache:     any[]            | null = null;
let positionsPromise:   Promise<any[]>   | null = null;
let positionsCacheTime  = 0;
const POSITIONS_TTL     = 8_000; // ms

let loadTreesPromise: Promise<void> | null = null;

function _invalidateCaches() {
  treesCache      = null;
  treesPromise    = null;
  positionsCache  = null;
  positionsPromise = null;
  positionsCacheTime = 0;
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
  })().finally(() => { treesPromise = null; });

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
    positionsCache     = data;
    positionsCacheTime = Date.now();
    return data;
  })()
    .catch(err => { positionsPromise = null; throw err; })
    .finally(() => { positionsPromise = null; });

  return positionsPromise;
}

/**
 * Returns normalised position objects for the currently connected wallet.
 * Empty array when not connected or no positions found.
 */
export async function loadUserTreePositions(): Promise<NormalisedPosition[]> {
  const identity = getIdentity();
  if (!identity.wallet) return [];

  try {
    const raw = await getAllPositions();
    return raw
      .filter(p => {
        const buyer = p.account?.buyer;
        return buyer && buyer.toBase58() === identity.wallet;
      })
      .map(p => ({
        treeId:      String(p.account.treeId),
        sharesOwned: typeof p.account.sharesOwned?.toNumber === "function"
          ? p.account.sharesOwned.toNumber()
          : Number(p.account.sharesOwned ?? 0),
      }));
  } catch (err) {
    console.error("[loadUserTreePositions]", err);
    return [];
  }
}
(window as any).loadUserTreePositions = loadUserTreePositions;
(window as any).getAllPositions       = getAllPositions;

// ═══════════════════════════════════════════════════════════════════════════
// SELL MODAL
// ═══════════════════════════════════════════════════════════════════════════

let activeSellTreeId:        string | null = null;
let maxAvailableSellShares   = 0;

(window as any).openSellModal = (treeId: string, currentShares: number) => {
  activeSellTreeId         = String(treeId);
  maxAvailableSellShares   = currentShares;

  const modal   = document.getElementById("sell-modal");
  const title   = document.getElementById("sell-modal-title");
  const owned   = document.getElementById("sell-modal-owned");
  const input   = document.getElementById("sell-amount-input") as HTMLInputElement | null;

  if (title)  title.textContent = `Sell Shares — Tree #${treeId}`;
  if (owned)  owned.textContent = `${currentShares.toLocaleString()} Shares Registered`;
  if (input) {
    input.value = String(Math.min(10, currentShares));
    input.max   = String(currentShares);
  }

  _recalculatePayout();
  modal?.classList.remove("hidden");
};

function _closeSellModal() {
  document.getElementById("sell-modal")?.classList.add("hidden");
  activeSellTreeId       = null;
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
  const input   = document.getElementById("sell-amount-input") as HTMLInputElement | null;
  const display = document.getElementById("sell-modal-payout");
  if (!input || !display) return;

  const shares   = parseInt(input.value) || 0;
  const euro     = shares * 12.40;
  const solPrice = (window as any).cachedSolPrice || 100;
  display.textContent = `${(euro / solPrice).toFixed(3)} SOL`;
}

async function _confirmSellAction() {
  const btn   = document.getElementById("sell-submit-btn") as HTMLButtonElement | null;
  const input = document.getElementById("sell-amount-input") as HTMLInputElement | null;

  if (!activeSellTreeId || !input || !btn) return;

  const amount = parseInt(input.value) || 0;
  if (amount <= 0 || amount > maxAvailableSellShares) {
    alert("Please specify a valid quantity within your ownership bounds.");
    return;
  }

  btn.disabled    = true;
  btn.textContent = "Processing…";
  try {
    await (window as any).sellShares(activeSellTreeId, amount);
    _closeSellModal();
  } catch (err) {
    console.error("[SELL ERROR]", err);
    showToast("Sell transaction failed.", true);
  } finally {
    btn.disabled    = false;
    btn.textContent = "Confirm Liquidation";
  }
}
(window as any).confirmSellAction = _confirmSellAction;

// ═══════════════════════════════════════════════════════════════════════════
// STATS UI
// ═══════════════════════════════════════════════════════════════════════════

async function updateStatsUI() {
  const treeCountEl  = document.getElementById("treeCountStat");
  const shareCountEl = document.getElementById("shareCountStat");
  const groveCountEl = document.getElementById("grovePositionStat");

  // Always show global tree count (works for guests)
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
    if (groveCountEl) groveCountEl.innerText = "0";
    return;
  }

  try {
    const positions = await loadUserTreePositions();
    const totalShares  = positions.reduce((s, p) => s + p.sharesOwned, 0);
    const uniqueTrees  = new Set(positions.map(p => p.treeId)).size;

    if (shareCountEl) shareCountEl.innerText = String(totalShares);
    if (groveCountEl) groveCountEl.innerText = String(uniqueTrees);
  } catch (err) {
    console.error("[updateStatsUI]", err);
    if (shareCountEl) shareCountEl.innerText = "--";
    if (groveCountEl) groveCountEl.innerText = "0";
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// WALLET UI  (delegates label rendering to reserveb.ts's updateIdentityBalanceUI)
// ═══════════════════════════════════════════════════════════════════════════

async function updateWalletUI() {
  // Delegate pill / button / stat rendering to the single renderer in reserveb.ts
  if (typeof (window as any).updateIdentityBalanceUI === "function") {
    await (window as any).updateIdentityBalanceUI();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// VILLA STAY TIER UI
// ═══════════════════════════════════════════════════════════════════════════

async function updateVillaStayUI() {
  // DOM refs
  const sharesCountDisplay  = document.getElementById("villaSharesCount");
  const creditsCountDisplay = document.getElementById("villaNightsCount");
  const tierName            = document.getElementById("tier-name");
  const tierIcon            = document.getElementById("tier-icon");
  const tierProgressText    = document.getElementById("tier-progress-text");
  const nextTierLabel       = document.getElementById("next-tier-label");
  const tierPercentLabel    = document.getElementById("tier-percent-label");
  const tierProgressBar     = document.getElementById("tier-progress-bar");
  const patronDiscountBadge = document.getElementById("patron-discount-badge");
  const bookingRateDisplay  = document.getElementById("booking-rate-display");
  const cardTier1 = document.getElementById("tier-card-1");
  const cardTier2 = document.getElementById("tier-card-2");
  const cardTier3 = document.getElementById("tier-card-3");
  const perkGov      = document.getElementById("perk-governance");
  const perkShipping = document.getElementById("perk-shipping");
  const perkDiscount = document.getElementById("perk-discount");
  const perkStay     = document.getElementById("perk-stay");

  const tierEls = [cardTier1, cardTier2, cardTier3, perkGov, perkShipping, perkDiscount, perkStay];
  const dim = (el: Element | null) => { el?.classList.remove("opacity-100"); el?.classList.add("opacity-40"); };
  const lit = (el: Element | null) => { el?.classList.remove("opacity-40"); el?.classList.add("opacity-100"); };

  // ── Guest default ────────────────────────────────────────────────────
  const identity = getIdentity();
  if (!identity.wallet) {
    if (sharesCountDisplay)  sharesCountDisplay.innerHTML  = `0 <span class="text-xs text-gold font-mono block mt-1">Nodes Detected</span>`;
    if (creditsCountDisplay) creditsCountDisplay.innerHTML = `00 <span class="text-xs text-gold font-mono block mt-1">Sanctuary Days</span>`;
    if (tierName)            tierName.innerText            = "Guest Mode";
    if (tierProgressText)    tierProgressText.innerText    = "Connect to view tier status";
    if (patronDiscountBadge) patronDiscountBadge.innerText = "Standard Account";
    if (bookingRateDisplay)  bookingRateDisplay.innerText  = "$450 USD / Nightly standard baseline";
    tierEls.forEach(dim);
    return;
  }

  try {
    await waitForProgram();

    const positions   = await loadUserTreePositions();
    const totalShares = positions.reduce((s, p) => s + p.sharesOwned, 0);

    // Credits from Supabase
    let totalCredits = 0;
    try {
      const { data } = await sb
        .from("users")
        .select("credits")
        .eq("wallet", identity.wallet)
        .maybeSingle();
      if (data) totalCredits = data.credits || 0;
    } catch { /* non-critical */ }

    if (sharesCountDisplay)  sharesCountDisplay.innerHTML  = `${totalShares.toLocaleString()} <span class="text-xs text-gold font-mono block mt-1">Nodes Detected</span>`;
    if (creditsCountDisplay) creditsCountDisplay.innerHTML = `${totalCredits} <span class="text-xs text-gold font-mono block mt-1">Sanctuary Days</span>`;

    // ── Tier logic ─────────────────────────────────────────────────────
    tierEls.forEach(dim);

    let currentTier     = "Standard Account";
    let nextTier        = "Seed Supporter";
    let progressPercent = 0;
    let iconEmoji       = "🫒";
    let progressLabel   = "";

    if (totalShares >= 1000) {
      currentTier = "Grove Patron"; nextTier = "Max Tier Achieved";
      progressPercent = 100; iconEmoji = "👑"; progressLabel = "VIP Privileges unlocked";
      lit(cardTier3); [perkGov, perkShipping, perkDiscount, perkStay].forEach(lit);
    } else if (totalShares >= 500) {
      currentTier = "Tree Guardian"; nextTier = "Grove Patron";
      progressPercent = Math.round(((totalShares - 500) / 500) * 100);
      iconEmoji = "🌳"; progressLabel = `${1000 - totalShares} shares to Patron`;
      lit(cardTier2); [perkGov, perkShipping, perkDiscount].forEach(lit);
    } else if (totalShares >= 100) {
      currentTier = "Seed Supporter"; nextTier = "Tree Guardian";
      progressPercent = Math.round(((totalShares - 100) / 400) * 100);
      iconEmoji = "🌱"; progressLabel = `${500 - totalShares} shares to Guardian`;
      lit(cardTier1); [perkGov, perkShipping].forEach(lit);
    } else {
      currentTier = "Standard Account"; nextTier = "Seed Supporter";
      progressPercent = Math.round((totalShares / 100) * 100);
      progressLabel = `${100 - totalShares} shares to Seed level`;
    }

    if (tierName)         tierName.innerText         = currentTier;
    if (tierIcon)         tierIcon.innerText         = iconEmoji;
    if (tierProgressText) tierProgressText.innerText = progressLabel;
    if (nextTierLabel)    nextTierLabel.innerText    = `Next: ${nextTier}`;
    if (tierPercentLabel) tierPercentLabel.innerText = `${progressPercent}%`;
    if (tierProgressBar)  (tierProgressBar as HTMLElement).style.width = `${progressPercent}%`;

    // ── Booking rate ─────────────────────────────────────────────────
    const hasGenesis = positions.some(p => Number(p.treeId) <= 3);
    let pricingLabel = "Standard Account";
    let rateStr      = "$450 USD / Nightly standard baseline";

    if (hasGenesis || totalShares >= 1000) {
      pricingLabel = "👑 Grove Patron Tier";
      rateStr      = "$382.50 USD / Nightly (15% Patron Override Applied)";
    } else if (totalShares >= 500) {
      pricingLabel = "🌳 Guardian Tier";
      rateStr      = "$382.50 USD / Nightly (15% Guardian Override Applied)";
    } else if (totalShares >= 100) {
      pricingLabel = "🌱 Seed Supporter";
    }

    if (patronDiscountBadge) patronDiscountBadge.innerText = pricingLabel;
    if (bookingRateDisplay)  bookingRateDisplay.innerText  = rateStr;

  } catch (err) {
    console.error("[updateVillaStayUI]", err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CLEAR ALL USER UI  (called on disconnect)
// ═══════════════════════════════════════════════════════════════════════════

function clearAllUserUiAndStates() {
  console.log("🔄 Clearing user UI and caches…");
  _invalidateCaches();

  localStorage.removeItem("olivium_user");
  if ((window as any).OliviumAuth) (window as any).OliviumAuth.user = null;

  // Stats
  const setEl = (id: string, v: string) => {
    const el = document.getElementById(id);
    if (el) el.innerText = v;
  };
  setEl("shareCountStat",    "--");
  setEl("grovePositionStat", "0");
  setEl("identityTypeStat",  "Guest");

  // Villa
  setEl("villaStayIdentity", "Not Connected");
  setEl("villaTierStat",     "Standard Guest");
  setEl("villaDiscountStat", "0%");

  // Reload tree grid (filter to "all" so guest still sees trees)
  const activeFilter = document.querySelector<HTMLElement>(".filter-btn.active");
  if (activeFilter?.dataset.filter === "my") {
    document.querySelector<HTMLElement>('[data-filter="all"]')?.click();
  } else {
    loadTrees("all");
  }

  // Re-run stats to repopulate global tree count
  updateStatsUI();
  updateVillaStayUI();
}

// ═══════════════════════════════════════════════════════════════════════════
// FILTER BUTTONS
// ═══════════════════════════════════════════════════════════════════════════

function initFilters() {
  document.querySelectorAll<HTMLElement>(".filter-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
      (e.currentTarget as HTMLElement).classList.add("active");

      const filter = (e.currentTarget as HTMLElement).dataset.filter || "all";

      if (filter === "my") {
        if (!isConnected()) {
          const container = document.getElementById("treeGrid");
          if (container) {
            container.innerHTML = `
              <div style="padding:40px;text-align:center;color:var(--text-muted,#8a8a8a);">
                <h3>Connect your profile to view your grove</h3>
              </div>`;
          }
          return;
        }
        const positions = await loadUserTreePositions();
        if (!positions.length) {
          const container = document.getElementById("treeGrid");
          if (container) container.innerHTML = `
            <div style="padding:40px;text-align:center;color:var(--text-muted,#8a8a8a);">
              <h3>No trees in your grove yet</h3>
              <p>Adopt shares to get started.</p>
            </div>`;
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
      _syncCryptoConnectButton();
    });
  });
}

function _syncCryptoConnectButton() {
  const connectBtn = document.getElementById("adoptConnectBtn");
  const adoptBtn   = document.getElementById("adoptBtn");
  if (!connectBtn || !adoptBtn) return;

  if (paymentMode === "crypto" && !isConnected()) {
    connectBtn.style.display = "block";
    adoptBtn.style.display   = "none";
  } else {
    connectBtn.style.display = "none";
    adoptBtn.style.display   = "block";
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LOAD TREES  (de-duplicated)
// ═══════════════════════════════════════════════════════════════════════════

async function loadTrees(filter = "all") {
  const container = document.getElementById("treeGrid");
  if (!container) return;

  // If a load is already in progress for the same filter, don't duplicate
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

  let onChainTrees:  any[]                   = [];
  let userPositions: NormalisedPosition[]    = [];

  if (program) {
    try {
      onChainTrees = await program.account.tree.all();
    } catch (err) {
      console.error("[loadTrees] On-chain fetch failed:", err);
    }
    userPositions = await loadUserTreePositions();
  }

  container.innerHTML = "";

  let cardCount = 0;

  for (const dbTree of dbTrees) {
    const onChainData = onChainTrees.find(t => t.account.treeId === dbTree.tree_id);

    let sharesSold  = dbTree.shares_sold  || 0;
    let totalShares = dbTree.total_shares || 1000;
    const isLiveOnChain = !!onChainData;

    if (onChainData) {
      sharesSold  = onChainData.account.sharesSold.toNumber();
      totalShares = onChainData.account.totalShares.toNumber();
      dbTree.shares_sold  = sharesSold;
      dbTree.total_shares = totalShares;
    }

    const percent   = Math.round((sharesSold / totalShares) * 100);
    const status    = percent >= 100 ? "full" : "available";
    const available = totalShares - sharesSold;

    // ── Ownership check ────────────────────────────────────────────────
    const authUser         = (window as any).OliviumAuth?.getUser?.();
    const emailOrId        = authUser?.email || authUser?.id;
    const matchesFiatOwner = emailOrId
      ? dbTree.owner === emailOrId || dbTree.user_email === emailOrId
      : false;

    const matchedPos  = userPositions.find(p => String(p.treeId) === String(dbTree.tree_id));
    const ownedShares = matchedPos?.sharesOwned ?? 0;
    const isMine      = matchesFiatOwner || ownedShares > 0;

    // ── Filter gates ───────────────────────────────────────────────────
    if (!isLiveOnChain && filter !== "all") continue;
    if (filter === "my"        && !isMine)          continue;
    if (filter === "available" && status !== "available") continue;
    if (filter === "full"      && status !== "full")      continue;

    // ── Card ───────────────────────────────────────────────────────────
    const card = document.createElement("div");
    card.className = "tree-card";
    if (sharesSold > 0)  card.classList.add("has-sales");
    if (percent >= 90)   card.style.border = "2px solid #d94d4d";
    else if (percent >= 60) card.style.border = "2px solid #d7a728";

    const displayImg = dbTree.image_url
      || "https://raw.githubusercontent.com/kyngrick/olivium_photos/main/olivium_logo2.png";

    card.innerHTML = `
      <img class="tree-image" src="${_esc(displayImg)}" alt="${_esc(dbTree.name || dbTree.tree_id)}" />
      <div class="tree-content">
        <div class="tree-name">${_esc(dbTree.name || dbTree.tree_id)}</div>
        <div class="tree-meta">
          <span>${available} shares left</span>
          <span>${percent}% adopted</span>
        </div>
        <div class="availability">
          <div class="availability-label"><span>${sharesSold} / ${totalShares} sold</span></div>
          <div class="progress-bar"><div class="progress-fill" style="width:${percent}%"></div></div>
          <div class="shares-left">${available > 0 ? "Available now" : "Fully adopted"}</div>
        </div>
        ${isLiveOnChain ? '<div class="live-badge">⛓ LIVE ON-CHAIN</div>' : ""}
        <div class="card-actions" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:16px;">
          <button class="action-btn details-btn">Details</button>
          ${available > 0 ? '<button class="action-btn adopt-btn">Adopt</button>' : ""}
          ${isMine       ? '<button class="action-btn release-btn">Release Shares</button>' : ""}
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

// ── Register the impl so the proxy in reserveb.ts works ──────────────────
(window as any)._loadTreesImpl = loadTrees;

// ═══════════════════════════════════════════════════════════════════════════
// MY-TREES CARD RENDERER  (positions already loaded)
// ═══════════════════════════════════════════════════════════════════════════

async function renderMyTreesFromPositions(positions: NormalisedPosition[]) {
  const container = document.getElementById("treeGrid");
  if (!container) return;

  container.innerHTML = "";

  if (!positions.length) {
    container.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:40px;color:#7A8275;">
        <p>🌿 No adopted positions yet for this wallet.</p>
      </div>`;
    return;
  }

  // Batch-fetch metadata
  let treeMap = new Map<string, any>();
  try {
    const { data } = await sb.from("tree_metadata").select("*");
    if (Array.isArray(data)) {
      treeMap = new Map(data.map(t => [String(t.tree_id), t]));
    }
  } catch { /* non-critical */ }

  for (const pos of positions) {
    const meta           = treeMap.get(String(pos.treeId));
    const displayName    = _esc(meta?.name || `Tree #${pos.treeId}`);
    const totalCapacity  = meta?.total_shares ?? 1000;
    const displayImg     = meta?.image_url
      || "https://raw.githubusercontent.com/kyngrick/olivium_photos/main/olivium_logo2.png";
    const ownerPct       = Math.min((pos.sharesOwned / totalCapacity) * 100, 100).toFixed(2);

    const card = document.createElement("div");
    card.className = "tree-card has-sales";
    card.innerHTML = `
      <img class="tree-image" src="${_esc(displayImg)}" alt="${displayName}"
           style="width:100%;height:160px;object-fit:cover;border-radius:8px;"
           onerror="this.onerror=null;this.src='https://raw.githubusercontent.com/kyngrick/olivium_photos/main/olivium_logo2.png'" />
      <div class="tree-content" style="margin-top:12px;">
        <div class="tree-name" style="font-size:1.2rem;font-weight:600;">${displayName}</div>
        <div class="tree-meta" style="margin-top:4px;font-size:0.85rem;">
          <strong>${pos.sharesOwned.toLocaleString()}</strong> shares owned
          <span style="opacity:.65;">(${totalCapacity.toLocaleString()} total)</span>
        </div>
        <div class="availability" style="margin-top:12px;">
          <div class="progress-bar" style="width:100%;height:6px;background:rgba(0,0,0,.05);border-radius:3px;overflow:hidden;">
            <div class="progress-fill" style="width:${ownerPct}%;height:100%;background:#6B7F5A;transition:width .3s;"></div>
          </div>
          <div style="margin-top:6px;font-size:.8rem;font-weight:600;color:#6B7F5A;text-transform:uppercase;">
            ${ownerPct}% ownership
          </div>
        </div>
      </div>
      <div class="card-actions" style="display:flex;gap:8px;margin-top:16px;">
        <button class="action-btn details-btn">Details</button>
        <button class="action-btn release-btn" style="background:#d94d4d;">Release Shares</button>
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
// PURCHASE MODAL
// ═══════════════════════════════════════════════════════════════════════════

let selectedTree: Tree | null = null;

(window as any).openModal = (tree: Tree) => {
  if (!tree) return;
  selectedTree = tree;

  const modal = document.getElementById("modalOverlay");
  if (!modal) return;

  document.body.style.overflow = "hidden";
  paymentMode = "mollie";

  document.querySelectorAll(".payment-option").forEach(el => el.classList.remove("active"));
  document.getElementById("mollieOption")?.classList.add("active");

  const total     = tree.total_shares || 1000;
  const sold      = tree.shares_sold  || 0;
  const available = total - sold;

  const setT = (id: string, v: string) => { const el = document.getElementById(id); if (el) el.innerText = v; };
  setT("modalTitle",       tree.name || tree.tree_id);
  setT("modalDescription", tree.description || "Secure your digital olive tree adoption.");

  const img = document.getElementById("modalImage") as HTMLImageElement | null;
  if (img) {
    img.src = tree.image_url || _randomFallback();
    img.onerror = () => { img.src = _randomFallback(); };
  }

  const shareInput = document.getElementById("shareInput")  as HTMLInputElement | null;
  const slider     = document.getElementById("shareSlider") as HTMLInputElement | null;
  const maxLabel   = document.getElementById("sliderMaxLabel");
  const maxBtn     = document.getElementById("maxShareBtn");
  const adoptBtn   = document.getElementById("adoptBtn")    as HTMLButtonElement | null;

  if (shareInput) { shareInput.value = available <= 0 ? "0" : "1"; shareInput.dataset.max = String(available); }
  if (slider)     { slider.min = available <= 0 ? "0" : "1"; slider.max = String(available); slider.value = available <= 0 ? "0" : "1"; }
  if (maxLabel)   maxLabel.textContent  = String(available);
  if (maxBtn)     maxBtn.textContent    = `Max (${available})`;
  if (adoptBtn) {
    adoptBtn.disabled  = available <= 0;
    adoptBtn.innerText = available <= 0 ? "Sold Out" : "Continue to Agreement";
  }

  modal.style.display = "flex";
  _syncCryptoConnectButton();
  (window as any).updateShares?.();
};

(window as any).closeModal = () => {
  const modal = document.getElementById("modalOverlay");
  if (modal) modal.style.display = "none";
  document.body.style.overflow = "";

  const shareInput = document.getElementById("shareInput")  as HTMLInputElement | null;
  const slider     = document.getElementById("shareSlider") as HTMLInputElement | null;
  const shareValue = document.getElementById("shareValue");
  if (shareInput) shareInput.value     = "1";
  if (slider)     slider.value         = "1";
  if (shareValue) shareValue.textContent = "1";
};

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
        const prog = (window as any)._program;
        return prog ? await prog.account.tree.all() : [];
      } catch { return []; }
    })(),
  ]);

  const d = sbResult?.data ?? null;

  const onChain     = (onChainTrees as any[]).find(
    t => t.account?.treeId === treeId || String(t.account?.treeId) === String(treeId)
  );
  const totalShares = onChain ? onChain.account.totalShares.toNumber() : (d?.total_shares ?? 1000);
  const sharesSold  = onChain ? onChain.account.sharesSold.toNumber()  : (d?.shares_sold  ?? 0);
  const available   = totalShares - sharesSold;
  const pct         = totalShares > 0 ? Math.round((sharesSold / totalShares) * 100) : 0;
  const mintAddress = onChain?.account?.mint?.toBase58?.() ?? d?.mint ?? d?.on_chain_address ?? "—";

  const heroEl = document.getElementById("tree-detail-hero-img");
  if (heroEl) heroEl.style.backgroundImage = `url('${d?.photo_url || "https://raw.githubusercontent.com/kyngrick/olivium_photos/main/close1.jpeg"}')`;

  set("tree-detail-name",     d?.name       || `Tree #${treeId}`);
  set("tree-detail-location", d?.field_id   ? `Field ${d.field_id} · ${d.latitude?.toFixed(4)}, ${d.longitude?.toFixed(4)}` : "—");
  set("tree-detail-field-id", d?.field_id   || "—");
  set("tree-detail-health",   d?.health_score != null ? `${(d.health_score * 100).toFixed(0)}%` : "—");
  set("tree-detail-status-badge", d?.status || "—");

  // Overview
  set("tree-detail-age",     d?.age_years  != null ? `${d.age_years} yrs` : "—");
  set("tree-detail-height",  d?.height_cm  != null ? `${d.height_cm} cm`  : "—");
  set("tree-detail-variety", d?.variety    || "—");
  set("tree-overview-shares",      `${sharesSold.toLocaleString()} / ${totalShares.toLocaleString()}`);
  set("tree-overview-pct",         `${pct}%`);
  set("tree-overview-sold-label",  `${sharesSold.toLocaleString()} sold`);
  set("tree-overview-total-label", `${totalShares.toLocaleString()} total`);

  const bar = document.getElementById("tree-overview-bar");
  if (bar) (bar as HTMLElement).style.width = `${pct}%`;

  set("tree-detail-last-treatment",  d?.last_treatment  ? new Date(d.last_treatment).toLocaleDateString()  : "—");
  set("tree-detail-treatment-type",  d?.treatment_type  || "—");
  set("tree-detail-last-fertilizer", d?.last_fertilizer ? new Date(d.last_fertilizer).toLocaleDateString() : "—");
  set("tree-detail-fertilizer-type", d?.fertilizer_type || "—");

  // Physical
  set("phys-age",           d?.age_years        != null ? String(d.age_years)         : "—");
  set("phys-height",        d?.height_cm        != null ? String(d.height_cm)         : "—");
  set("phys-circumference", d?.circumference_cm != null ? String(d.circumference_cm)  : "—");
  set("phys-diameter",      d?.diameter_cm      != null ? String(d.diameter_cm)       : "—");
  set("phys-crown",         d?.crown_spread_cm  != null ? String(d.crown_spread_cm)   : "—");
  set("phys-altitude",      d?.altitude_m       != null ? String(d.altitude_m)        : "—");
  set("phys-coords", d?.latitude != null && d?.longitude != null ? `${d.latitude}, ${d.longitude}` : "—");

  // Metadata
  set("tree-detail-meta-id",        treeId);
  set("tree-detail-meta-field",     d?.field_id         || "—");
  set("tree-detail-meta-onchain",   d?.on_chain_address || "—");
  set("tree-detail-meta-mint",      mintAddress);
  set("tree-detail-meta-status",    d?.status           || "—");
  set("tree-detail-meta-total",     totalShares.toLocaleString());
  set("tree-detail-meta-sold",      sharesSold.toLocaleString());
  set("tree-detail-meta-available", available.toLocaleString());
  set("tree-detail-meta-variety",   d?.variety          || "—");
  set("tree-detail-meta-coords",    d?.latitude != null ? `${d.latitude}, ${d.longitude}` : "—");
  set("tree-detail-meta-updated",   d?.updated_at ? new Date(d.updated_at).toLocaleString() : "—");

  // Gallery
  const galleryGrid = document.getElementById("tree-detail-gallery-grid");
  if (galleryGrid) {
    const photos: string[] = [];
    if (d?.photo_url) photos.push(d.photo_url);
    if (!photos.length) {
      const base = "https://raw.githubusercontent.com/kyngrick/olivium_photos/main";
      photos.push(`${base}/Tree%20F1-FR-001.jpeg`, `${base}/Tree%20F1-FR-002.jpeg`, `${base}/close1.jpeg`);
    }
    galleryGrid.innerHTML = photos
      .map(url => `<img src="${url}" class="rounded-xl w-full h-40 object-cover" onerror="this.style.display='none'" />`)
      .join("");
  }

  // Sensors + weather (parallel, after modal is visible)
  const fieldId    = d?.field_id ?? null;
  const sensorData = await fetchFieldSensors(fieldId);
  const lat        = sensorData?.lat ?? d?.latitude  ?? null;
  const lon        = sensorData?.lon ?? d?.longitude ?? null;

  if (lat != null && lon != null) {
    set("weather-coords-label", `${Number(lat).toFixed(4)}°N, ${Number(lon).toFixed(4)}°E`);
  }
  if (fieldId) set("env-field-label", fieldId);

  const weatherData = await fetchOpenMeteo(lat, lon);
  populateSensorUI(sensorData);
  populateWeatherUI(weatherData);
}
(window as any).openTreeDetailModal = openTreeDetailModal;

function switchTreeDetailTab(tab: string) {
  document.querySelectorAll<HTMLElement>(".tree-detail-tab-content").forEach(el => el.classList.add("hidden"));
  document.querySelectorAll<HTMLElement>(".tree-detail-tab-btn").forEach(el => el.classList.remove("active"));
  document.getElementById(`tree-detail-tab-${tab}`)?.classList.remove("hidden");
  document.querySelector<HTMLElement>(`[data-tab="${tab}"]`)?.classList.add("active");
}
(window as any).switchTreeDetailTab = switchTreeDetailTab;

// ═══════════════════════════════════════════════════════════════════════════
// SENSOR + WEATHER FETCHERS  (unchanged logic, just type-annotated)
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
    if (error) { console.error("[SENSORS]", error); return null; }
    return data;
  } catch (err) {
    console.error("[SENSORS]", err);
    return null;
  }
}

async function fetchOpenMeteo(lat: number | null, lon: number | null): Promise<any | null> {
  if (lat == null || lon == null) return null;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
      + `&current=temperature_2m,wind_speed_10m,relative_humidity_2m,surface_pressure,precipitation,uv_index,shortwave_radiation`;
    const res = await fetch(url);
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

function populateSensorUI(data: any) {
  if (!data) return;
  const set = (id: string, v: string) => { const el = document.getElementById(id); if (el) el.innerText = v; };
  set("oracle-soil-moisture", data.soil_moisture != null ? `${data.soil_moisture}%`  : "—");
  set("oracle-soil-temp",     data.temperature   != null ? `${data.temperature}°C`   : "—");
  set("oracle-leaf-wetness",  data.leaf_wetness  != null ? `${data.leaf_wetness}`    : "—");
  set("oracle-uv",            data.uv_index      != null ? `${data.uv_index}`        : "—");
  set("oracle-co2",           data.co2           != null ? `${data.co2} ppm`         : "—");
  set("oracle-wind",          data.wind_speed    != null ? `${data.wind_speed} m/s`  : "—");
  set("oracle-humidity",      data.humidity      != null ? `${data.humidity}%`       : "—");
  set("oracle-rain",          data.rain_rate     != null ? `${data.rain_rate} mm/h`  : "—");
  set("oracle-last-update",   data.created_at    ? new Date(data.created_at).toLocaleString() : "—");

  const bar = document.getElementById("oracle-moisture-bar");
  if (bar && data.soil_moisture != null) {
    (bar as HTMLElement).style.width = `${Math.min(data.soil_moisture, 100)}%`;
  }
  const statusEl = document.getElementById("oracle-moisture-status");
  if (statusEl && data.soil_moisture != null) {
    statusEl.innerText = data.soil_moisture < 20 ? "🔴 Dry" : data.soil_moisture < 60 ? "🟡 Moderate" : "🟢 Optimal";
  }
}

function populateWeatherUI(data: any) {
  if (!data?.current) return;
  const c   = data.current;
  const set = (id: string, v: string) => { const el = document.getElementById(id); if (el) el.innerText = v; };
  set("weather-temp",     c.temperature_2m      != null ? `${c.temperature_2m}°C`        : "—");
  set("weather-wind",     c.wind_speed_10m       != null ? `${c.wind_speed_10m} km/h`    : "—");
  set("weather-humidity", c.relative_humidity_2m != null ? `${c.relative_humidity_2m}%`  : "—");
  set("weather-pressure", c.surface_pressure     != null ? `${c.surface_pressure} hPa`   : "—");
  set("weather-rain",     c.precipitation        != null ? `${c.precipitation} mm`       : "—");
  set("weather-uv",       c.uv_index             != null ? `${c.uv_index}`               : "—");
  set("weather-solar",    c.shortwave_radiation  != null ? `${c.shortwave_radiation} W/m²` : "—");
}

// ═══════════════════════════════════════════════════════════════════════════
// CHECKOUT HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

async function startMollieCheckout() {
  const shareInput = document.getElementById("shareInput") as HTMLInputElement | null;
  const res = await fetch("/create-mollie-checkout", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      treeId: selectedTree?.tree_id,
      shares: Number(shareInput?.value || 1),
      user:   (window as any).OliviumAuth?.getUser?.(),
    }),
  });
  const data = await res.json();
  if (data?.url) window.location.href = data.url;
  else showToast("Failed to start checkout.", true);
}

async function startPaypalCheckout() {
  const shareInput = document.getElementById("shareInput") as HTMLInputElement | null;
  const res = await fetch("/create-paypal-checkout", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      treeId: selectedTree?.tree_id,
      shares: Number(shareInput?.value || 1),
      user:   (window as any).OliviumAuth?.getUser?.(),
    }),
  });
  const data = await res.json();
  if (data?.url) window.location.href = data.url;
  else showToast("Failed to start PayPal checkout.", true);
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════════════════════════════════

function _esc(v: string): string {
  return String(v).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c] ?? c)
  );
}

const _fallbackImages = [
  "https://raw.githubusercontent.com/kyngrick/olivium_photos/main/Tree%20F1-FR-001.jpeg",
  "https://raw.githubusercontent.com/kyngrick/olivium_photos/main/Tree%20F1-FR-002.jpeg",
  "https://raw.githubusercontent.com/kyngrick/olivium_photos/main/tree04.jpeg",
  "https://raw.githubusercontent.com/kyngrick/olivium_photos/main/tree08.jpeg",
];
function _randomFallback() {
  return _fallbackImages[Math.floor(Math.random() * _fallbackImages.length)];
}

// ═══════════════════════════════════════════════════════════════════════════
// GLOBAL WINDOW EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

(window as any).updateVillaStayUI  = updateVillaStayUI;
(window as any).updateStatsUI      = updateStatsUI;
(window as any).updateWalletUI     = updateWalletUI;

// ═══════════════════════════════════════════════════════════════════════════
// EVENT LISTENERS  — single registration, canonical events only
// ═══════════════════════════════════════════════════════════════════════════

window.addEventListener("olivium:connected", async () => {
  console.log("[SYNC] olivium:connected — refreshing UI…");
  _invalidateCaches();                       // force fresh data after re-connect

  await updateWalletUI();
  await Promise.all([updateStatsUI(), updateVillaStayUI()]);

  // Reload grid respecting current active filter
  const activeFilter = document.querySelector<HTMLElement>(".filter-btn.active");
  const filter       = activeFilter?.dataset.filter || "all";

  if (filter === "my") {
    const positions = await loadUserTreePositions();
    positions.length ? renderMyTreesFromPositions(positions) : loadTrees("all");
  } else {
    loadTrees(filter);
  }
});

window.addEventListener("olivium:disconnected", () => {
  clearAllUserUiAndStates();
});

// ═══════════════════════════════════════════════════════════════════════════
// DOM INIT  — single DOMContentLoaded handler
// ═══════════════════════════════════════════════════════════════════════════

window.addEventListener("DOMContentLoaded", async () => {
  console.log("[INIT] DOMContentLoaded — reserve_board.ts");

  initFilters();
  initPaymentSelector();

  // Initial data load (no wallet needed for tree grid + global stats)
  await waitForProgram();
  loadTrees("all");
  updateStatsUI();
  updateVillaStayUI();

  // Wire up sell-amount input live updates
  document.getElementById("sell-amount-input")
    ?.addEventListener("input", _recalculatePayout);

  // Wire final confirm button
  document.getElementById("finalConfirmBtn")?.addEventListener("click", async () => {
    if (paymentMode === "mollie")  { await startMollieCheckout();  return; }
    if (paymentMode === "paypal")  { await startPaypalCheckout();  return; }
    if (paymentMode === "crypto")  { (window as any).processBlockchainTx?.(); return; }
  });

  // Tab buttons inside tree detail modal
  document.querySelectorAll<HTMLElement>(".tree-detail-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      switchTreeDetailTab(btn.dataset.tab || "overview");
    });
  });
});
