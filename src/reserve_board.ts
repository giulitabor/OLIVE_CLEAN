import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { sb } from "./connection.ts";

interface Tree {
  tree_id: string;
  name: string;
  image_url: string;
  description: string;
  total_shares: number;
  shares_sold?: number;

  location?: string;
  age?: string;
  height?: string;
  variety?: string;
}

let selectedTree: Tree | null = null;
let paymentMode: "mollie" | "paypal" | "crypto" = "mollie";

function showToast(msg: string, isError = false) {
  if ((window as any).showGlobalToast) {
    (window as any).showGlobalToast(msg, isError);
  } else {
    console.log(`[TOAST] ${msg}`);
  }
}
/* =========================================================
   WAIT FOR PROGRAM
========================================================= */

async function waitForProgram() {
  let attempts = 0;

  while (!(window as any)._program && attempts < 20) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    attempts++;
  }

  return (window as any)._program;
}

/* =========================================================
   HELPERS
========================================================= */

let treesCache: any[] | null = null;
let treesPromise: Promise<any[]> | null = null;

export async function getTrees() {
    if (treesCache) return treesCache;

    if (treesPromise) return treesPromise;

    treesPromise = (async () => {
        console.log("🌳 Fetching trees ONCE");

        const result = await (window as any)._program.account.tree.all();
        treesCache = result;

        return result;
    })();

    return treesPromise;
}
//let positionsCache: any[] | null = null;
//let positionsPromise: Promise<any[]> | null = null;


// Make sure these are declared in scope if not imported
let positionsCache: any[] | null = null;
let positionsPromise: Promise<any[]> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 8000; // 8 seconds memory lifetime

export async function getAllPositions(forceRefresh = false): Promise<any[]> {
  const now = Date.now();

  // 1. If cache is valid and fresh, return it instantly (Zero RPC load)
  if (positionsCache && !forceRefresh && (now - cacheTimestamp < CACHE_TTL)) {
    return positionsCache;
  }

  // 2. Deduplication Latch: If an RPC call is mid-flight, return the active thread pointer
  if (positionsPromise) {
    console.log("[POSITIONS] Request deduplicated. Hooking into active RPC flight...");
    return positionsPromise;
  }

  console.log("[RPC] 🛰️ Initiating single network query for all position accounts...");

  // 3. Store the Promise instance *before* awaiting it.
  // Any concurrent calls in the next millisecond will catch the if-statement above.
  positionsPromise = _program.account.sharePosition.all()
    .then((data) => {
      positionsCache = data;
      cacheTimestamp = Date.now();
      return data;
    })
    .catch((err) => {
      // Fail-safe: Clear the pending promise trace on crash so subsequent attempts can try again
      positionsPromise = null;
      throw err;
    })
    .finally(() => {
      // Clear the promise handle once resolved so future cycles can fetch fresh data if cache expires
      positionsPromise = null;
    });

  return positionsPromise;
}

let walletState = {
  connected: false,
  pubkey: null as string | null
};

function Wallet() {
  // 1. Try checking the active live window providers
  const provider = (window as any)._provider;

  // SUPPORT BOTH EXTENSION AND EMBEDDED PROVIDER STRUCUTRES
  const pubKey =
    provider?.wallet?.publicKey ||
    provider?.publicKey ||
    (window as any).solana?.publicKey ||
    (window as any).walletPubKey ||
    null;

  if (pubKey) return pubKey.toString();

  // 2. FALLBACK: Read from local storage identity so stats work instantly on reload!
  try {
    const cached = localStorage.getItem("olivium_identity");
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.type === "wallet" && parsed.wallet) {
        return parsed.wallet;
      }
      if (parsed.type === "email" && parsed.custodialWallet) {
        return parsed.custodialWallet; // This maps to the fiat user's non-custodial on-chain key
      }
    }
  } catch (e) {
    console.error("Failed reading cached identity for stats layout:", e);
  }

  return null;
}



/* ==========================================================================
   SELL & DETAIL MODAL CONTROLLER BINDINGS
   ========================================================================== */

let activeSellTreeId: string | null = null;
let maxAvailableSellShares = 0;

/**
 * Initializes and triggers configuration deployment for asset share sales
 */
(window as any).openSellModal = (treeId: string, currentShares: number) => {
  console.log(`[SELL MODAL] Triggering window configuration context for: ${treeId}`);
  activeSellTreeId = String(treeId);
  maxAvailableSellShares = currentShares;

  const modal = document.getElementById('sell-modal');
  const title = document.getElementById('sell-modal-title');
  const ownedCount = document.getElementById('sell-modal-owned');
  const inputAmount = document.getElementById('sell-amount-input') as HTMLInputElement;

  if (title) title.textContent = `Sell Shares — Tree #${treeId}`;
  if (ownedCount) ownedCount.textContent = `${currentShares.toLocaleString()} Shares Registered`;
  if (inputAmount) {
    inputAmount.value = Math.min(10, currentShares).toString();
    inputAmount.max = currentShares.toString();
  }

  recalculateExpectedPayout();
  modal?.classList.remove('hidden');
};

/**
 * Closes the asset sale liquidation panel overlay layout context safely
 */
function closeSellModal() {
  document.getElementById('sell-modal')?.classList.add('hidden');
  activeSellTreeId = null;
  maxAvailableSellShares = 0;
}
(window as any).closeSellModal = closeSellModal;

/**
 * Updates inputs automatically to match maximum user share count boundaries
 */
(window as any).setSellMax = () => {
  const inputAmount = document.getElementById('sell-amount-input') as HTMLInputElement;
  if (inputAmount) {
    inputAmount.value = maxAvailableSellShares.toString();
    recalculateExpectedPayout();
  }
};

/**
 * Real-time event listener computation mirroring protocol conversion pricing models
 */
function recalculateExpectedPayout() {
  const inputAmount = document.getElementById('sell-amount-input') as HTMLInputElement;
  const payoutDisplay = document.getElementById('sell-modal-payout');

  if (!inputAmount || !payoutDisplay) return;

  const sharesToSell = parseInt(inputAmount.value) || 0;

  // Calculate standard base conversion (e.g. 12.40 EUR converted via cached Sol Price matrix metrics)
  const euroVal = sharesToSell * 12.40;
  const solPrice = (window as any).cachedSolPrice || 100;
  const solPayoutEstimate = euroVal / solPrice;

  payoutDisplay.textContent = `${solPayoutEstimate.toFixed(3)} SOL`;
}

// Bind live updates if user is typing values inside input field nodes manually
document.getElementById('sell-amount-input')?.addEventListener('input', recalculateExpectedPayout);

/**
 * Bridges user selection validation vectors over to your standard Solana on-chain tx parameters
 */
async function confirmSellAction() {
  const submitBtn = document.getElementById('sell-submit-btn') as HTMLButtonElement;
  const inputAmount = document.getElementById('sell-amount-input') as HTMLInputElement;

  if (!activeSellTreeId || !inputAmount || !submitBtn) return;

  const amountToSell = parseInt(inputAmount.value) || 0;

  if (amountToSell <= 0 || amountToSell > maxAvailableSellShares) {
    alert("Please specify a valid subscription quantity within ownership bounds.");
    return;
  }

  try {
    submitBtn.disabled = true;
    submitBtn.textContent = "Processing Block...";

    // Call your existing fully-fleshed on-chain pipeline parameters setup function
    await (window as any).sellShares(activeSellTreeId, amountToSell);

    closeSellModal();
  } catch (err: any) {
    console.error("[LIQUIDATION SUBMIT ERROR]", err);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Confirm Liquidation";
    }
  }
}
(window as any).confirmSellAction = confirmSellAction;
async function updateWalletUI() {
  const wallet = Wallet();

  // Sync internal state
  walletState.connected = !!wallet;
  walletState.pubkey = wallet;

  window.OliviumIdentity = wallet
    ? { type: "wallet", wallet }
    : { type: "guest" };

  // Delegate all button / pill / stat rendering to refreshIdentityUI in board.html
  // so there is exactly one place that owns the nav button appearance.
  if (typeof (window as any).refreshIdentityUI === 'function') {
    await (window as any).refreshIdentityUI();
  }
}
async function updateStatsUI() {
  const treeCount = document.getElementById("treeCountStat");
  const shareCount = document.getElementById("shareCountStat");
  const groveCount = document.getElementById("grovePositionStat");

  const wallet = Wallet();

  // If NO wallet/identity is active, we can still load and show global on-chain stats!
  if (!wallet) {
    try {
      await waitForProgram();
      const allTrees = await getTrees();
      if (treeCount) treeCount.innerText = String(allTrees ? allTrees.length : 0);
    } catch (e) {
      if (treeCount) treeCount.innerText = "--";
    }
    if (shareCount) shareCount.innerText = "--";
    if (groveCount) groveCount.innerText = "0";
    return;
  }

  try {
    await waitForProgram();

    // Fetch both datasets concurrently using your memory-cached layers
    const [allTrees, positions] = await Promise.all([
      getTrees(),
      (window as any).loadUserTreePositions?.()
    ]);

    if (!positions) return;


    // 1. GLOBAL METRICS: The complete total number of trees physically live on the blockchain
    const totalTreesOnChain = allTrees ? allTrees.length : 0;

    // 2. USER METRICS: Total unique tree IDs the user personally holds allocations in
    const userUniqueTreesCount = new Set(positions.map(p => p.treeId)).size;

    // 3. USER METRICS: Total sum weights of individual shares owned
    const totalSharesCount = positions.reduce((s, p) => s + p.sharesOwned, 0);

    // Apply accurate metric outputs to the DOM elements
    if (treeCount) treeCount.innerText = String(totalTreesOnChain); // Displays "10"
    if (shareCount) shareCount.innerText = String(totalSharesCount);
    if (groveCount) groveCount.innerText = String(userUniqueTreesCount);

  } catch (err) {
    console.error("[STATS UPDATE ERROR]", err);
    if (treeCount) treeCount.innerText = "--";
    if (shareCount) shareCount.innerText = "--";
    if (groveCount) groveCount.innerText = "0";
  }
}
async function startStripeCheckout() {
  const response = await fetch("/create-checkout-session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      treeId: selectedTree?.tree_id,
      shares: Number(
        (document.getElementById("shareInput") as HTMLInputElement).value
      ),
      user: window.OliviumAuth?.getUser()
    }),
  });

  const data = await response.json();

  window.location.href = data.url;
}
async function initWalletOnLoad() {
  const wallet = Wallet();

  await updateWalletUI();

  if (wallet) {
    console.log("[WALLET] Auto-detected:", wallet);

    // load identity immediately
    window.OliviumIdentity = {
      type: "wallet",
      wallet
    };

    // update stats instantly
    await updateStatsUI();

    // load user grove instantly
    await (window as any).loadUserTreePositions?.();
  } else {
    console.log("[WALLET] No wallet detected");
    await updateStatsUI(); // Added await for clean promise execution ordering
  }
}

function updateIdentityUI(data?: {
  wallet?: string;
  totalTrees?: number;
  totalShares?: number;
  positions?: number;
}) {

  const treesEl = document.getElementById("treeCountStat");
  const sharesEl = document.getElementById("shareCountStat");
  const identityEl = document.getElementById("identityTypeStat");
  const positionsEl = document.getElementById("grovePositionStat");

  // Trees owned
  if (treesEl) {
    treesEl.innerText = String(data?.totalTrees || 0);
  }

  // Total shares owned
  if (sharesEl) {
    sharesEl.innerText = String(data?.totalShares || 0);
  }

  // Connected identity
  if (identityEl) {
    if (data?.wallet) {
      identityEl.innerText = `${data.wallet.slice(0,4)}...${data.wallet.slice(-4)}`;
    } else {
      identityEl.innerText = "Guest";
    }
  }

  // Grove positions
  if (positionsEl) {
    positionsEl.innerText = String(data?.positions || 0);
  }
}
function User() {
  try {
    return JSON.parse(localStorage.getItem("olivium_user") || "null");
  } catch {
    return null;
  }
}

function setUser(user) {
  localStorage.setItem("olivium_user", JSON.stringify(user));
}

const fallbackImages = [
  "https://raw.githubusercontent.com/kyngrick/olivium_photos/main/Tree%20F1-FR-001.jpeg",
  "https://raw.githubusercontent.com/kyngrick/olivium_photos/main/Tree%20F1-FR-002.jpeg",
  "https://raw.githubusercontent.com/kyngrick/olivium_photos/main/tree04.jpeg",
  "https://raw.githubusercontent.com/kyngrick/olivium_photos/main/tree08.jpeg",
  "https://raw.githubusercontent.com/kyngrick/olivium_photos/main/tree06.jpeg",
  "https://raw.githubusercontent.com/kyngrick/olivium_photos/main/tree07.jpeg",
  "https://raw.githubusercontent.com/kyngrick/olivium_photos/main/Tree%20F1-FR-005.jpeg",
];

function randomFallback() {
  return fallbackImages[Math.floor(Math.random() * fallbackImages.length)];
}

function ValidSharesAmount(val: number): number {
  const slider = document.getElementById(
    "shareSlider"
  ) as HTMLInputElement | null;

  if (!slider) return val;

  const min = Number(slider.min) || 1;
  const max = Number(slider.max) || 1000;

  return Math.max(min, Math.min(max, val));
}


export async function AllPositions() {
    if (positionsCache) return positionsCache;
    if (positionsPromise) return positionsPromise;

    positionsPromise = (window as any)._program.account.sharePosition.all();

    positionsCache = await positionsPromise;
    return positionsCache;
}


/* =========================================================
   LOAD TREES
========================================================= */

async function loadTrees(filter = "all") {
  const container = document.getElementById("treeGrid");

  if (!container) return;

  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>🌿 Syncing live grove availability...</p>
    </div>
  `;

  const program = await waitForProgram();

  const { data: dbTrees, error } = await sb
    .from("tree_metadata")
    .select("*")
    .order("tree_id", { ascending: true });

  if (error || !dbTrees) {
    container.innerHTML = `
      <p style="padding:40px;text-align:center;">
        Failed to load trees.
      </p>
    `;
    return;
  }

  let onChainTrees: any[] = [];
  let userPositions: any[] = [];

  if (program) {
    try {
      console.log("[RPC] Fetching all tree accounts...");
      onChainTrees = await program.account.tree.all();
      console.log(
        `[RPC] Successfully fetched ${onChainTrees.length} trees from blockchain.`
      );

      // Fetch user positions to accurately display dynamic on-chain share allocations and ownership status
      if (typeof (window as any).loadUserTreePositions === "function") {
        userPositions = await (window as any).loadUserTreePositions();
      } else if (typeof (window as any).getAllPositions === "function") {
        const rawPositions = await (window as any).getAllPositions();
        const activeWallet = typeof (window as any).Wallet === "function" ? (window as any).Wallet() : null;
        if (activeWallet) {
          userPositions = rawPositions.filter(
            (p: any) => p.account.buyer.toBase58() === activeWallet
          );
        }
      }
    } catch (err) {
      console.error("On-chain fetch failed:", err);
    }
  }

  container.innerHTML = "";

  for (const dbTree of dbTrees) {
    const onChainData = onChainTrees.find(
      (t) => t.account.treeId === dbTree.tree_id
    );

    let sharesSold = dbTree.shares_sold || 0;
    let totalShares = dbTree.total_shares || 1000;
    let isLiveOnChain = false;

    if (onChainData) {
      isLiveOnChain = true;

      sharesSold = onChainData.account.sharesSold.toNumber();
      totalShares = onChainData.account.totalShares.toNumber();

      dbTree.shares_sold = sharesSold;
      dbTree.total_shares = totalShares;
    }

    const percent = Math.round((sharesSold / totalShares) * 100);
    const status = percent >= 100 ? "full" : "available";

    /* =========================================================
       HYBRID OWNERSHIP VERIFICATION
    ========================================================= */
    const user = window.OliviumAuth?.user;
    const myWalletOrEmail = user?.email || user?.id;

    const matchesFiatOwnership = myWalletOrEmail
      ? dbTree.owner === myWalletOrEmail || dbTree.user_email === myWalletOrEmail
      : false;

    const matchedPosition = userPositions.find((p) => {
      const pTreeId = p.treeId || p.account?.treeId;
      return String(pTreeId) === String(dbTree.tree_id);
    });

    const ownedShares = matchedPosition
      ? matchedPosition.sharesOwned || matchedPosition.account?.sharesOwned?.toNumber() || 0
      : 0;

    const isMine = matchesFiatOwnership || ownedShares > 0;

    // 1. Non-on-chain trees: only visible in "all" view
    if (!isLiveOnChain && filter !== "all") continue;

    // 2. HANDLE "MY" FILTER
    if (filter === "my" && !isMine) continue;

    // 3. HANDLE STATUS FILTERS (available / full)
    if (filter !== "all" && filter !== "my" && filter !== status) continue;
    const available = totalShares - sharesSold;

    const card = document.createElement("div");
    card.className = "tree-card";

    if (sharesSold > 0) {
      card.classList.add("has-sales");
    }

    // Scarcity UX
    if (percent >= 90) {
      card.style.border = "2px solid #d94d4d";
    } else if (percent >= 60) {
      card.style.border = "2px solid #d7a728";
    }

    const displayImg =
      dbTree.image_url ||
      "https://raw.githubusercontent.com/kyngrick/olivium_photos/main/olivium_logo2.png";

    card.innerHTML = `
      <img class="tree-image" src="${displayImg}" />

      <div class="tree-content">
        <div class="tree-name">
          ${dbTree.name || dbTree.tree_id}
        </div>

        <div class="tree-meta">
          <span>${available} shares left</span>
          <span>${percent}% adopted</span>
        </div>

        <div class="availability">
          <div class="availability-label">
            <span>${sharesSold} / ${totalShares} sold</span>
          </div>

          <div class="progress-bar">
            <div class="progress-fill" style="width:${percent}%"></div>
          </div>

          <div class="shares-left">
            ${available > 0 ? "Available now" : "Fully adopted"}
          </div>
        </div>

        ${
          isLiveOnChain
            ? `
          <div class="live-badge">
            ⛓ LIVE ON-CHAIN
          </div>
        `
            : ""
        }

        <div class="card-actions" style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; width: 100%;">
        <button class="action-btn details-btn" style="flex:1;min-width:70px;padding:8px;background:#B8860B;color:white;border:none;border-radius:6px;cursor:pointer;font-size:0.85rem;font-weight:500;">Details</button>
          ${
            available > 0
              ? `
            <button class="action-btn adopt-btn" style="flex: 1; min-width: 70px; padding: 8px; background: #556B2F; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: 500;">
              Adopt
            </button>
          `
              : ""
          }

          ${
            isMine
              ? `
            <button class="action-btn release-btn" style="flex: 1; min-width: 70px; padding: 8px; background: #d94d4d; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: 500; width: 100%;">
              Release Shares
            </button>
          `
              : ""
          }
        </div>

      </div>
    `;

    // Bind event tracking directly to Details control node element
    card.querySelector(".details-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (typeof (window as any).openTreeDetailModal === "function") {
        (window as any).openTreeDetailModal(dbTree.tree_id);
      }
    });

    // Bind event tracking directly to Adopt control selection node element
    card.querySelector(".adopt-btn")?.addEventListener("click", (e) => {
      e.stopPropagation(); // Stop parent bubble triggers
      if (typeof (window as any).openModal === "function") {
        (window as any).openModal(dbTree);
      } else if (typeof (window as any).openTreeDetailModal === "function") {
        (window as any).openTreeDetailModal(dbTree.tree_id);
      }
    });

    // Bind event tracking directly to share liquidation release control selection node element
    card.querySelector(".release-btn")?.addEventListener("click", (e) => {
      e.stopPropagation(); // Avoid overlapping card-click events
      if (typeof (window as any).openSellModal === "function") {
        (window as any).openSellModal(dbTree.tree_id, ownedShares || 10);
      } else {
        console.warn("Global operation handler window.openSellModal is not available in environment execution paths.");
      }
    });

    container.appendChild(card);
  }
}

/**
 * Opens the Enhanced Tree Detail Modal and populates it with live data from database/blockchain registries
 */
async function openTreeDetailModal(treeId: string) {
  const modal = document.getElementById("tree-detail-modal");
  if (!modal) return;

  // Show modal immediately, default to overview tab
  modal.classList.remove("hidden");
  switchTreeDetailTab("overview");

  const set = (id: string, val: string) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
  };

  // ── 1. Supabase + on-chain in parallel ───────────────────────────────────
  const [sbResult, onChainTrees] = await Promise.all([
    sb.from("tree_metadata").select("*").eq("tree_id", treeId).single(),
    (async () => {
      try {
        const prog = (window as any)._program;
        if (!prog) return [];
        return await prog.account.tree.all();
      } catch { return []; }
    })(),
  ]);

  const d = sbResult?.data ?? null;
  if (!d) console.warn("[MODAL] No Supabase row for tree_id:", treeId);

  // Find matching on-chain account
  const onChain = (onChainTrees as any[]).find(
    (t: any) => t.account?.treeId === treeId || String(t.account?.treeId) === String(treeId)
  );

  // Prefer live on-chain counts, fall back to Supabase
  const totalShares  = onChain ? onChain.account.totalShares.toNumber() : (d?.total_shares ?? 1000);
  const sharesSold   = onChain ? onChain.account.sharesSold.toNumber()  : (d?.shares_sold  ?? 0);
  const available    = totalShares - sharesSold;
  const pct          = totalShares > 0 ? Math.round((sharesSold / totalShares) * 100) : 0;

  // Mint comes from on-chain account if present, else Supabase on_chain_address / mint columns
  const mintAddress  = onChain?.account?.mint?.toBase58?.()
    ?? d?.mint
    ?? d?.on_chain_address
    ?? "—";

  // ── 2. Hero ───────────────────────────────────────────────────────────────
  const heroEl = document.getElementById("tree-detail-hero-img");
  if (heroEl) heroEl.style.backgroundImage = `url('${d?.photo_url || "https://raw.githubusercontent.com/kyngrick/olivium_photos/main/close1.jpeg"}')`;

  set("tree-detail-name",      d?.name          || `Tree #${treeId}`);
  set("tree-detail-location",  d?.field_id ? `Field ${d.field_id} · ${d.latitude?.toFixed(4)}, ${d.longitude?.toFixed(4)}` : "—");
  set("tree-detail-field-id",  d?.field_id      || "—");
  set("tree-detail-health",    d?.health_score   != null ? `${(d.health_score * 100).toFixed(0)}%` : "—");
  set("tree-detail-status-badge", d?.status     || "—");

  // ── 3. Overview tab ───────────────────────────────────────────────────────
  set("tree-detail-age",     d?.age_years    != null ? `${d.age_years} yrs`                 : "—");
  set("tree-detail-height",  d?.height_cm    != null ? `${d.height_cm} cm`                  : "—");
  set("tree-detail-variety", d?.variety       || "—");
  set("tree-overview-shares", `${sharesSold.toLocaleString()} / ${totalShares.toLocaleString()}`);
  set("tree-overview-pct",   `${pct}%`);
  set("tree-overview-sold-label",  `${sharesSold.toLocaleString()} sold`);
  set("tree-overview-total-label", `${totalShares.toLocaleString()} total`);

  const bar = document.getElementById("tree-overview-bar");
  if (bar) (bar as HTMLElement).style.width = `${pct}%`;

  set("tree-detail-last-treatment",  d?.last_treatment  ? new Date(d.last_treatment).toLocaleDateString()  : "—");
  set("tree-detail-treatment-type",  d?.treatment_type  || "—");
  set("tree-detail-last-fertilizer", d?.last_fertilizer ? new Date(d.last_fertilizer).toLocaleDateString() : "—");
  set("tree-detail-fertilizer-type", d?.fertilizer_type || "—");

  // ── 4. Physical tab ────────────────────────────────────────────────────────
  set("phys-age",           d?.age_years       != null ? String(d.age_years)          : "—");
  set("phys-height",        d?.height_cm       != null ? String(d.height_cm)          : "—");
  set("phys-circumference", d?.circumference_cm != null ? String(d.circumference_cm)  : "—");
  set("phys-diameter",      d?.diameter_cm     != null ? String(d.diameter_cm)        : "—");
  set("phys-crown",         d?.crown_spread_cm != null ? String(d.crown_spread_cm)    : "—");
  set("phys-altitude",      d?.altitude_m      != null ? String(d.altitude_m)         : "—");
  set("phys-coords",
    d?.latitude != null && d?.longitude != null
      ? `${d.latitude}, ${d.longitude}`
      : "—"
  );

  // ── 5. On-Chain / Metadata tab ────────────────────────────────────────────
  set("tree-detail-meta-id",        treeId);
  set("tree-detail-meta-field",     d?.field_id          || "—");
  set("tree-detail-meta-onchain",   d?.on_chain_address  || "—");
  set("tree-detail-meta-mint",      mintAddress);
  set("tree-detail-meta-status",    d?.status            || "—");
  set("tree-detail-meta-total",     totalShares.toLocaleString());
  set("tree-detail-meta-sold",      sharesSold.toLocaleString());
  set("tree-detail-meta-available", available.toLocaleString());
  set("tree-detail-meta-variety",   d?.variety           || "—");
  set("tree-detail-meta-coords",
    d?.latitude != null && d?.longitude != null
      ? `${d.latitude}, ${d.longitude}`
      : "—"
  );
  set("tree-detail-meta-updated",
    d?.updated_at ? new Date(d.updated_at).toLocaleString() : "—"
  );

  // ── 6. Gallery tab ─────────────────────────────────────────────────────────
  const galleryGrid = document.getElementById("tree-detail-gallery-grid");
  if (galleryGrid) {
    const photos: string[] = [];
    if (d?.photo_url) photos.push(d.photo_url);
    // fallback to known repo images for this tree id pattern
    const repoBase = "https://raw.githubusercontent.com/kyngrick/olivium_photos/main";
    if (photos.length === 0) {
      photos.push(
        `${repoBase}/Tree%20F1-FR-001.jpeg`,
        `${repoBase}/Tree%20F1-FR-002.jpeg`,
        `${repoBase}/close1.jpeg`,
      );
    }
    galleryGrid.innerHTML = photos
      .map(url => `<img src="${url}" class="rounded-xl w-full h-40 object-cover" onerror="this.style.display='none'" />`)
      .join("");
  }

  // ── 7. Sensors + Weather (parallel, after on-chain so modal is already visible) ─
  const fieldId = d?.field_id ?? null;
  const sensorData = await fetchFieldSensors(fieldId);

  // Use sensor lat/lon; fall back to tree_metadata lat/lon if present
  const lat = sensorData?.lat ?? d?.latitude  ?? null;
  const lon = sensorData?.lon ?? d?.longitude ?? null;

  // Show coords label in weather tab
  if (lat != null && lon != null) {
    set("weather-coords-label", `${Number(lat).toFixed(4)}°N, ${Number(lon).toFixed(4)}°E`);
  }
  if (fieldId) set("env-field-label", fieldId);

  const [weatherData] = await Promise.all([fetchOpenMeteo(lat, lon)]);

  populateSensorUI(sensorData);
  populateWeatherUI(weatherData);
}

/* =========================================================
   SENSOR FETCH  —  Supabase node_sensors
   Pulls the most-recent reading row for the given field_id.
   Actual columns: id, created_at, soil_moisture, leaf_wetness,
     co2, temperature, humidity, uv_index, wind_speed,
     rain_rate, lat, lon, field_id
========================================================= */
async function fetchFieldSensors(fieldId: string | null): Promise<any | null> {
  if (!fieldId) {
    console.warn("[SENSORS] No field_id on tree — skipping sensor fetch.");
    return null;
  }

  try {
    const { data, error } = await sb
      .from("node_sensors")
      .select("*")
      .eq("field_id", fieldId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[SENSORS] Supabase query error:", error);
      return null;
    }

    return data;
  } catch (err) {
    console.error("[SENSORS] Unexpected fetch error:", err);
    return null;
  }
}

function populateSensorUI(s: any | null) {
  const na = "—";

  // Helper: set innerText safely
  const set = (id: string, val: string) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
  };

  if (!s) {
    // No sensor row — show dashes so UI stays clean
    set("oracle-confidence-value", na);
    set("oracle-confidence-text",  na);
    set("oracle-soil-moisture",    na);
    set("oracle-moisture-status",  "No data");
    set("oracle-soil-temp",        na);
    set("oracle-leaf-wetness",     na);
    set("oracle-light",            na);
    set("oracle-co2",              na);
    set("oracle-wind",             na);
    set("oracle-rain",             na);
    set("oracle-humidity",         na);
    set("oracle-last-update",      "No sensor data");

    const bar = document.getElementById("oracle-moisture-bar") as HTMLElement | null;
    if (bar) bar.style.width = "0%";
    return;
  }

  const confidence = null; // not in schema — badge hidden
  const moisture   = s.soil_moisture  ?? null;
  const temp       = s.temperature    ?? null;
  const leaf       = s.leaf_wetness   ?? null;
  const light      = null;             // not in schema
  const co2        = s.co2            ?? null;
  const wind       = s.wind_speed     ?? null;
  const rain       = s.rain_rate      ?? null;
  const humidity   = s.humidity       ?? null;
  const uvIndex    = s.uv_index       ?? null;
  const updatedAt  = s.created_at     ?? null;

  // Confidence badge — hide if no data
  const confidenceBadge = document.getElementById("oracle-confidence-badge");
  if (confidenceBadge) confidenceBadge.style.display = confidence !== null ? "" : "none";

  set("oracle-soil-moisture",   moisture !== null ? `${Number(moisture).toFixed(1)}%`            : na);
  set("oracle-moisture-status", moisture !== null ? (moisture > 50 ? "Optimal" : "Balanced")     : "No data");
  set("oracle-soil-temp",       temp     !== null ? `${Number(temp).toFixed(1)}°C`               : na);
  set("oracle-leaf-wetness",    leaf     !== null ? Number(leaf).toFixed(2)                       : na);
  set("oracle-light",           light    !== null ? `${Number(light).toLocaleString()} lux`       : "No sensor");
  set("oracle-co2",             co2      !== null ? `${Number(co2).toFixed(1)} ppm`               : na);
  set("oracle-wind",            wind     !== null ? `${Number(wind).toFixed(1)} m/s`              : na);
  set("oracle-rain",            rain     !== null ? `${Number(rain).toFixed(2)} mm/hr`            : na);
  set("oracle-humidity",        humidity !== null ? `${Number(humidity).toFixed(1)}%`             : na);
  set("oracle-uv",              uvIndex  !== null ? String(uvIndex)                               : na);
  set("oracle-last-update",     updatedAt
        ? new Date(updatedAt).toLocaleTimeString()
        : new Date().toLocaleTimeString());

  const bar = document.getElementById("oracle-moisture-bar") as HTMLElement | null;
  if (bar) bar.style.width = moisture !== null ? `${Math.min(moisture, 100)}%` : "0%";
}

/* =========================================================
   WEATHER FETCH  —  Open-Meteo (free, no API key)
   Uses lat/lon from the node_sensors row for this field.
   Falls back gracefully if coords are null.
========================================================= */
async function fetchOpenMeteo(lat: number | null, lon: number | null): Promise<any | null> {
  if (lat === null || lon === null) {
    console.warn("[WEATHER] No coordinates on tree — skipping weather fetch.");
    return null;
  }

  try {
    const params = new URLSearchParams({
      latitude:  String(lat),
      longitude: String(lon),
      current:   [
        "temperature_2m",
        "relative_humidity_2m",
        "wind_speed_10m",
        "surface_pressure",
        "rain",
        "uv_index",
        "shortwave_radiation",
      ].join(","),
      wind_speed_unit: "ms",
      timezone: "auto",
    });

    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);

    if (!res.ok) {
      console.error("[WEATHER] Open-Meteo responded with:", res.status);
      return null;
    }

    const json = await res.json();
    return json?.current ?? null;
  } catch (err) {
    console.error("[WEATHER] Fetch error:", err);
    return null;
  }
}

function populateWeatherUI(w: any | null) {
  const na = "—";

  const set = (id: string, val: string) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
  };

  if (!w) {
    set("weather-temp",     na);
    set("weather-wind",     na);
    set("weather-humidity", na);
    set("weather-pressure", na);
    set("weather-rain",     na);
    set("weather-uv",       na);
    set("weather-solar",    na);
    return;
  }

  const uvRaw = w.uv_index ?? null;
  const uvLabel = uvRaw !== null
    ? `${uvRaw} (${uvRaw <= 2 ? "Low" : uvRaw <= 5 ? "Moderate" : uvRaw <= 7 ? "High" : "Very High"})`
    : na;

  set("weather-temp",     w.temperature_2m       !== undefined ? `${w.temperature_2m}°C`        : na);
  set("weather-wind",     w.wind_speed_10m        !== undefined ? `${w.wind_speed_10m} m/s`      : na);
  set("weather-humidity", w.relative_humidity_2m  !== undefined ? `${w.relative_humidity_2m}%`   : na);
  set("weather-pressure", w.surface_pressure      !== undefined ? `${w.surface_pressure} hPa`    : na);
  set("weather-rain",     w.rain                  !== undefined ? `${w.rain} mm`                 : na);
  set("weather-uv",       uvLabel);
  set("weather-solar",    w.shortwave_radiation   !== undefined ? `${w.shortwave_radiation} W/m²`: na);
}

/**
 * Dismisses and hides the tree detail modal safely
 */
function closeTreeDetailModal() {
  const modal = document.getElementById("tree-detail-modal");
  if (modal) modal.classList.add("hidden");
}

/**
 * Handles tab-navigation updates across the interior contents of the modal view
 */
function switchTreeDetailTab(tabName: string) {
  // Hide all dynamic panel sections
  const containers = document.querySelectorAll(".tree-detail-tab-content");
  containers.forEach((el) => el.classList.add("hidden"));

  // Reveal targeted container content window element explicitly
  const targetContainer = document.getElementById(`tree-detail-tab-${tabName}`);
  if (targetContainer) targetContainer.classList.remove("hidden");

  // Reset highlight state across all interactive tabs selectors
  const tabs = document.querySelectorAll(".tree-detail-tab");
  tabs.forEach((tab) => {
    tab.classList.remove("active", "border-green-600", "text-green-600");
    tab.classList.add("border-transparent", "text-stone-500");
  });

  // Highlight active target navigation element selection trigger node
  const eventTargetBtn = Array.from(tabs).find(
    (t) => t.getAttribute("onclick")?.includes(`'${tabName}'`)
  );
  if (eventTargetBtn) {
    eventTargetBtn.classList.add("active", "border-green-600", "text-green-600");
    eventTargetBtn.classList.remove("border-transparent", "text-stone-500");
  }
}

// Bind methods explicitly into active execution global scopes
(window as any).openTreeDetailModal = openTreeDetailModal;
(window as any).closeTreeDetailModal = closeTreeDetailModal;
(window as any).switchTreeDetailTab = switchTreeDetailTab;
/* =========================================================
   FILTERS (FIXED & FULLY IMPLEMENTED)
========================================================= */
function initFilters() {
  const filterButtons = document.querySelectorAll(".filter-btn");

  filterButtons.forEach((button) => {
    button.addEventListener("click", async (e) => {
      // 1. Remove active state from all buttons safely
      filterButtons.forEach((btn) => btn.classList.remove("active"));

      // 2. FIXED: Changed 'e.tar' to 'e.currentTarget' to guarantee we get the button element
      const el = e.currentTarget as HTMLElement;
      if (!el) return;

      el.classList.add("active");

      const filter = el.dataset.filter || "all";

      if (filter === "my") {
        const positions = await (window as any).loadUserTreePositions?.();

        if (!positions || positions.length === 0) {
          // 3. FIXED: Changed 'document.ElementById' to 'document.getElementById'
          const container = document.getElementById("treeGrid");
          if (container) {
            container.innerHTML = `
              <div style="padding:40px;text-align:center;color:var(--text-muted, #8a8a8a);">
                <h3>No trees found in your grove</h3>
                <p>Connect wallet or purchase shares first.</p>
              </div>
            `;
          }
          return;
        }

        // Render matching positions successfully
        renderMyTreesFromPositions(positions);
        return;
      }

      // Handle fallback filter groups ('all', 'available', etc.)
      loadTrees(filter);
    });
  });
}

/**
 * Completely clears application caches, breaks reference streams,
 * and resets the core dashboard statistics back to zero.
 */
export function handleDisconnectReset() {
  console.log("🔄 Disconnecting identity: Purging memory caches and resetting dashboard...");

  // 1. Evaporate memory cache hooks
  (window as any).positionsCache = null;
  (window as any).positionsPromise = null;
  (window as any).treesCache = null;
  (window as any).treesPromise = null;

  // 2. Clear local tracking layers
  localStorage.removeItem("olivium_user");
  if ((window as any).OliviumAuth) {
    (window as any).OliviumAuth.user = null;
  }

  // 3. Clear data grid interfaces
  const container = document.getElementById("treeGrid");
  if (container) {
    container.innerHTML = `
      <div style="padding:40px; text-align:center; color: var(--text-muted, #8a8a8a);">
        <h3>Identity Disconnected</h3>
        <p>Please connect your wallet or sign in via email to view your grove allocations.</p>
      </div>
    `;
  }

  // 4. Force reset raw text dashboard metrics across UI elements
  // Targets standard metric tracking identifiers
  const statSelectors = {
    totalShares: document.querySelectorAll(".total-shares-count, [data-metric='shares']"),
    grovePositions: document.querySelectorAll(".grove-positions-count, [data-metric='positions']"),
    connectedIdentity: document.querySelectorAll(".identity-address-display, [data-metric='identity']")
  };

  statSelectors.totalShares.forEach(el => el.textContent = "0");
  statSelectors.grovePositions.forEach(el => el.textContent = "0");
  statSelectors.connectedIdentity.forEach(el => el.textContent = "Not Connected");

  // 5. Hide syncing status hooks gracefully
  const spinner = document.getElementById("grove-sync-spinner") || document.querySelector(".syncing-indicator");
  if (spinner) {
    spinner.style.display = "none";
  }
  const villaIdentity = document.getElementById("villaStayIdentity");
const villaTier = document.getElementById("villaTierStat");
const villaDiscount = document.getElementById("villaDiscountStat");
if (villaIdentity) villaIdentity.textContent = "Not Connected";
if (villaTier) villaTier.textContent = "Standard Guest";
if (villaDiscount) villaDiscount.textContent = "0%";

  console.log("✅ Dashboard values cleared successfully.");
}

/* =========================================================
   MODAL
========================================================= */

(window as any).openModal = (tree: Tree) => {
  if (!tree) return;

  selectedTree = tree;

  const modal = document.getElementById("modalOverlay");

  if (!modal) return;

  document.body.style.overflow = "hidden";

  // RESET PAYMENT MODE
  paymentMode = "mollie";

  document
    .querySelectorAll(".payment-option")
    .forEach((el) => el.classList.remove("active"));

  document
    .getElementById("mollieOption")
    ?.classList.add("active");

  const total = tree.total_shares || 1000;
  const sold = tree.shares_sold || 0;
  const available = total - sold;

  // TITLE
  const title = document.getElementById("modalTitle");

  if (title) {
    title.innerText = tree.name || tree.tree_id;
  }

  // DESCRIPTION
  const desc = document.getElementById("modalDescription");

  if (desc) {
    desc.innerText =
      tree.description ||
      "Secure your digital olive tree adoption.";
  }

  // IMAGE
  const modalImg = document.getElementById(
    "modalImage"
  ) as HTMLImageElement | null;

  if (modalImg) {
    const fallback = randomFallback();

    modalImg.src = tree.image_url || fallback;

    modalImg.onerror = () => {
      modalImg.src = fallback;
    };
  }

  // SHARE INPUT
  const shareInput = document.getElementById(
    "shareInput"
  ) as HTMLInputElement | null;

  const slider = document.getElementById(
    "shareSlider"
  ) as HTMLInputElement | null;

  const sliderMaxLabel =
    document.getElementById("sliderMaxLabel");

  if (shareInput) {
    shareInput.value = available <= 0 ? "0" : "1";
    shareInput.dataset.max = available.toString();
  }

  if (slider) {
    slider.min = available <= 0 ? "0" : "1";
    slider.max = available.toString();
    slider.value = available <= 0 ? "0" : "1";
  }

  if (sliderMaxLabel) {
    sliderMaxLabel.textContent = available.toString();
  }

  // MAX BUTTON
  const maxBtn = document.getElementById("maxShareBtn");

  if (maxBtn) {
    maxBtn.textContent = `Max (${available})`;
  }

  // BUTTON
  const adoptBtn = document.getElementById(
    "adoptBtn"
  ) as HTMLButtonElement | null;

  if (adoptBtn) {
    if (available <= 0) {
      adoptBtn.disabled = true;
      adoptBtn.innerText = "Sold Out";
    } else {
      adoptBtn.disabled = false;
      adoptBtn.innerText = "Continue to Agreement";
    }
  }

  modal.style.display = "flex";

  (window as any).updateShares();
};


(window as any).closeModal = () => {
  const modal = document.getElementById("modalOverlay");

  if (modal) {
    modal.style.display = "none";
  }

  document.body.style.overflow = "";

  // RESET SHARE STATE
  const shareInput = document.getElementById(
    "shareInput"
  ) as HTMLInputElement | null;

  const slider = document.getElementById(
    "shareSlider"
  ) as HTMLInputElement | null;

  const shareValue = document.getElementById("shareValue");

  if (shareInput) shareInput.value = "1";
  if (slider) slider.value = "1";
  if (shareValue) shareValue.textContent = "1";
};


async function syncVillaUI() {
    const activeSessionData = localStorage.getItem("olivium_identity");
    const navBtn = document.getElementById("connectBtn");  // ✅ Correct ID
    const navTierLabel = document.getElementById("nav-tier-label");
    const navIdentityDisplay = document.getElementById("nav-identity-display");

    if (!activeSessionData) {
        // Guest mode
        if (navBtn) {
            navBtn.innerText = "Connect";
            navBtn.style.color = '';
            navBtn.style.borderColor = '';
        }
        if (navTierLabel) navTierLabel.innerText = "Guest Mode";
        if (navIdentityDisplay) navIdentityDisplay.innerText = "UNRESOLVED_USER";
    } else {
        try {
            const parsedIdentity = JSON.parse(activeSessionData);

            // Determine wallet address based on identity type
            let walletAddress = '';
            let identityLabel = '';

            if (parsedIdentity.type === 'wallet' && parsedIdentity.wallet) {
                walletAddress = parsedIdentity.wallet;
                identityLabel = "Wallet Connected";
            } else if (parsedIdentity.type === 'email' && parsedIdentity.custodialWallet) {
                walletAddress = parsedIdentity.custodialWallet;
                identityLabel = "Email Secured";
            } else if (parsedIdentity.address) {
                // Fallback for legacy format
                walletAddress = parsedIdentity.address;
                identityLabel = "Connected";
            }

            if (walletAddress) {
                const truncated = `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;

                // Update button
                if (navBtn) {
                    navBtn.innerText = "Disconnect";
                    navBtn.style.color = '#d94d4d';
                    navBtn.style.borderColor = '#d94d4d';
                }

                // Update nav tier label (will be updated by updateVillaStayUI)
                if (navTierLabel) navTierLabel.innerText = identityLabel;

                // Update nav identity display
                if (navIdentityDisplay) navIdentityDisplay.innerText = truncated;
            }
        } catch (e) {
            console.error('Failed to parse identity:', e);
            if (navBtn) navBtn.innerText = "Connect";
            if (navTierLabel) navTierLabel.innerText = "Guest Mode";
            if (navIdentityDisplay) navIdentityDisplay.innerText = "PARSE_ERROR";
        }
    }

    // Fetch tier info and update nav-tier-label with actual tier
    if (window.updateVillaStayUI) {
        await window.updateVillaStayUI();

        // After updateVillaStayUI runs, update nav-tier-label with tier name
        const tierNameEl = document.getElementById("tier-name");
        if (tierNameEl && navTierLabel && activeSessionData) {
            navTierLabel.innerText = tierNameEl.innerText || "Standard Account";
        }
    }
}

const FALLBACK_TREE_IMAGE =
  "https://raw.githubusercontent.com/kyngrick/olivium_photos/main/olivium_logo2.png";

/**
 * Prevent HTML/script injection from database content
 */

interface PositionAccount {
  treeId?: string;
  sharesOwned?: {
    toNumber?: () => number;
  };
}

interface Position {
  treeId?: string;
  sharesOwned?: number;
  account?: PositionAccount;
}

interface TreeMetadata {
  tree_id: string | number;
  name?: string;
  total_shares?: number;
  image_url?: string;
  location?: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };

    return entities[char] || char;
  });
}

async function renderMyTreesFromPositions(
  positions: Position[]
): Promise<void> {
  const container = document.getElementById("treeGrid");

  if (!container) {
    console.error("[TREE GRID] Container '#treeGrid' not found.");
    return;
  }

  // Clear existing cards safely
  container.innerHTML = "";

  // Graceful empty state
  if (!Array.isArray(positions) || positions.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #7A8275;">
        <p>🌿 You don't have any adopted positions linked to this wallet account profile yet.</p>
      </div>
    `;
    return;
  }

  // ----------------------------------------
  // Fetch metadata once
  // ----------------------------------------

  let treeMap = new Map<string, TreeMetadata>();

  try {
    const { data, error } = await sb
      .from("tree_metadata")
      .select("*");

    if (error) {
      console.error("[SUPABASE] Metadata fetch failed:", error);
    } else if (Array.isArray(data)) {
      treeMap = new Map(
        data.map((tree: TreeMetadata) => [
          String(tree.tree_id),
          tree,
        ])
      );
    }
  } catch (err) {
    console.error("[SUPABASE] Unexpected metadata fetch error:", err);
  }

  // ----------------------------------------
  // Render each position card
  // ----------------------------------------

  for (const pos of positions) {
    try {
      const treeId =
        pos.treeId ??
        pos.account?.treeId ??
        "";

      const sharesOwned =
        pos.sharesOwned ??
        pos.account?.sharesOwned?.toNumber?.() ??
        0;

      const metadata = treeMap.get(String(treeId));

      const displayName = escapeHtml(
        metadata?.name || `Tree #${treeId}`
      );

      const totalCapacity =
        metadata?.total_shares ?? 1000;

      const displayImg =
        metadata?.image_url ||
        "https://raw.githubusercontent.com/kyngrick/olivium_photos/main/olivium_logo2.png";

      const ownershipPercent = Math.min(
        (sharesOwned / totalCapacity) * 100,
        100
      );

      // ----------------------------------------
      // Card creation
      // ----------------------------------------

      const card = document.createElement("div");

      card.className = "tree-card has-sales";

      Object.assign(card.style, {
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      });

      card.innerHTML = `
        <div>

          <img
            class="tree-image"
            src="${displayImg}"
            alt="${displayName}"
            style="
              width: 100%;
              height: 160px;
              object-fit: cover;
              border-radius: 8px;
            "
            onerror="this.onerror=null;this.src='https://raw.githubusercontent.com/kyngrick/olivium_photos/main/olivium_logo2.png';"
          />

          <div class="tree-content" style="margin-top: 12px;">

            <div
              class="tree-name"
              style="font-size: 1.2rem; font-weight: 600;"
            >
              ${displayName}
            </div>

            <div
              class="tree-meta"
              style="margin-top: 4px; font-size: 0.85rem;"
            >
              <span>
                <strong>${sharesOwned.toLocaleString()}</strong>
                shares owned
              </span>

              <span style="margin-left: 6px; opacity: 0.65;">
                (${totalCapacity.toLocaleString()} total units)
              </span>
            </div>

            <div class="availability" style="margin-top: 12px;">

              <div
                class="progress-bar"
                style="
                  width: 100%;
                  height: 6px;
                  background: rgba(0,0,0,0.05);
                  border-radius: 3px;
                  overflow: hidden;
                "
              >
                <div
                  class="progress-fill"
                  style="
                    width: ${ownershipPercent}%;
                    height: 100%;
                    background: #6B7F5A;
                    transition: width 0.3s ease;
                  "
                ></div>
              </div>

              <div
                class="shares-left"
                style="
                  margin-top: 6px;
                  font-size: 0.8rem;
                  font-weight: 600;
                  color: #6B7F5A;
                  text-transform: uppercase;
                "
              >
                ${ownershipPercent.toFixed(2)}% ownership
              </div>

            </div>

          </div>

        </div>

        <div
          class="card-actions"
          style="
            display: flex;
            gap: 8px;
            margin-top: 16px;
            width: 100%;
          "
        >

          <button
            class="action-btn details-btn"
            style="
              flex: 1;
              padding: 8px;
              background: #6B7F5A;
              color: white;
              border: none;
              border-radius: 6px;
              cursor: pointer;
              font-size: 0.85rem;
              font-weight: 500;
            "
          >
            Details
          </button>

          <button
            class="action-btn release-btn"
            style="
              flex: 1;
              padding: 8px;
              background: #d94d4d;
              color: white;
              border: none;
              border-radius: 6px;
              cursor: pointer;
              font-size: 0.85rem;
              font-weight: 500;
            "
          >
            Release Shares
          </button>

        </div>
      `;

      // ----------------------------------------
      // Details button
      // ----------------------------------------

      const detailsBtn =
        card.querySelector(".details-btn");

      if (detailsBtn instanceof HTMLButtonElement) {
        detailsBtn.addEventListener("click", async (e) => {
          e.stopPropagation();

          try {
            const targetTreeId = String(treeId);

            const { data: dbTree, error } = await sb
              .from("tree_metadata")
              .select("*")
              .eq("tree_id", targetTreeId)
              .single();

            if (error || !dbTree) {
              console.warn(
                `[TREE DETAILS] Metadata not found for Tree #${targetTreeId}`
              );
              return;
            }

            const deepModal =
              document.getElementById("tree-detail-modal");

            const modalName =
              document.getElementById("tree-detail-name");

            const modalLocation =
              document.getElementById("tree-detail-location");

            if (!deepModal) {
              console.error(
                "[TREE MODAL] '#tree-detail-modal' missing."
              );
              return;
            }

            // Populate modal safely
            if (modalName) {
              modalName.textContent =
                dbTree.name ||
                `Tree #${dbTree.tree_id}`;
            }

            if (modalLocation) {
              modalLocation.textContent =
                dbTree.location
                  ? `📍 ${dbTree.location}`
                  : "📍 Coordinates not specified";
            }

            // Optional dynamic tabs hook
            if (
              typeof (window as any).populateTreeTabs ===
              "function"
            ) {
              await (window as any).populateTreeTabs(dbTree);
            }

            // Open modal
            deepModal.classList.remove("hidden");

            // Activate overview tab
            if (
              typeof (window as any).switchTreeDetailTab ===
              "function"
            ) {
              (window as any).switchTreeDetailTab("overview");
            }
          } catch (err) {
            console.error(
              "[TREE DETAILS MODAL ERROR]",
              err
            );
          }
        });
      }

      // ----------------------------------------
      // Release button
      // ----------------------------------------

      const releaseBtn =
        card.querySelector(".release-btn");

      if (releaseBtn instanceof HTMLButtonElement) {
        releaseBtn.addEventListener("click", (e) => {
          e.stopPropagation();

          try {
            if (
              typeof (window as any).openSellModal ===
              "function"
            ) {
              (window as any).openSellModal(
                treeId,
                sharesOwned
              );
            } else {
              alert(
                "Liquidation system component is currently loading or offline."
              );
            }
          } catch (err) {
            console.error(
              "[SELL MODAL INITIALIZATION ERROR]",
              err
            );
          }
        });
      }

      // ----------------------------------------
      // Append card
      // ----------------------------------------

      container.appendChild(card);

    } catch (renderErr) {
      console.error(
        "[TREE CARD RENDER FAILURE]",
        renderErr
      );
    }
  }
}

/* =========================================================
   SHARE CONTROLS
========================================================= */

(window as any).syncFromSlider = () => {
  const slider = document.getElementById(
    "shareSlider"
  ) as HTMLInputElement | null;

  const hiddenInput = document.getElementById(
    "shareInput"
  ) as HTMLInputElement | null;

  if (!slider || !hiddenInput) return;

  hiddenInput.value = slider.value;

  (window as any).updateShares();
};
/* =========================================================
   SHARE CONSTRAINTS VALIDATOR
========================================================= */
function getValidSharesAmount(val: number): number {
  const slider = document.getElementById("shareSlider") as HTMLInputElement | null;
  if (!slider) return val;

  const min = Number(slider.min) || 1;
  const max = Number(slider.max) || 1000;

  return Math.max(min, Math.min(max, val));
}
(window as any).changeShares = (delta: number) => {
  const hiddenInput = document.getElementById(
    "shareInput"
  ) as HTMLInputElement | null;

  const slider = document.getElementById(
    "shareSlider"
  ) as HTMLInputElement | null;

  if (!hiddenInput) return;

  let current = Number(hiddenInput.value) || 1;

  let nextAmount = getValidSharesAmount(current + delta);

  hiddenInput.value = nextAmount.toString();

  if (slider) {
    slider.value = nextAmount.toString();
  }

  (window as any).updateShares();
};

window.setFilter = function(type) {
  console.log("Filter switched:", type);

  const event = new CustomEvent("olivium:filter", {
    detail: { type }
  });

  window.dispatchEvent(event);
};
(window as any).setShares = (amount: number | string) => {
  const hiddenInput = document.getElementById(
    "shareInput"
  ) as HTMLInputElement | null;

  const slider = document.getElementById(
    "shareSlider"
  ) as HTMLInputElement | null;

  if (!hiddenInput || !slider) return;

  let nextValue = 1;

  if (amount === "max") {
    nextValue = Number(slider.max);
  } else {
    nextValue = getValidSharesAmount(Number(amount));
  }

  hiddenInput.value = nextValue.toString();
  slider.value = nextValue.toString();

  (window as any).updateShares();
};

/* =========================================================
   UPDATE SHARES
========================================================= */

(window as any).updateShares = async () => {
    const hiddenInput = document.getElementById(
    "shareInput"
  ) as HTMLInputElement | null;

  const shareValueDisplay =
    document.getElementById("shareValue");

  const priceDisplay =
    document.getElementById("priceDisplay");

  const priceSub =
    document.getElementById("priceSub");

  const adoptBtn = document.getElementById(
    "adoptBtn"
  ) as HTMLButtonElement | null;

  const connectBtn = document.getElementById(
    "adoptConnectBtn"
  ) as HTMLButtonElement | null;

  if (!hiddenInput) return;

  const provider =
    (window as any)._provider ||
    (window as any).provider;

  const pubKey =
    provider?.wallet?.publicKey ||
    (window as any).walletPubKey;

  const shares = Number(hiddenInput.value) || 1;

  const euroPerShare = 12.40;

// Calculate EUR first
const totalEuro = shares * euroPerShare;

// Fetch live SOL price
const solPrice = await getSolPriceEUR();

// Convert EUR → SOL
const totalSol = totalEuro / solPrice;
// TIER SOL PRICE UPDATES
const starterSolEl =
  document.getElementById("starter-sol-price");

const keeperSolEl =
  document.getElementById("keeper-sol-price");

const fullTreeSolEl =
  document.getElementById("fulltree-sol-price");

// SHARE COUNTS
const starterShares = 10;
const keeperShares = 100;
const fullTreeShares = 1000;

// CALCULATIONS
const starterSol =
  (starterShares * euroPerShare) / solPrice;

const keeperSol =
  (keeperShares * euroPerShare) / solPrice;

const fullTreeSol =
  (fullTreeShares * euroPerShare) / solPrice;

// UPDATE UI
if (starterSolEl) {
  starterSolEl.innerText =
    `~${starterSol.toFixed(2)} SOL`;
}

if (keeperSolEl) {
  keeperSolEl.innerText =
    `~${keeperSol.toFixed(2)} SOL`;
}

if (fullTreeSolEl) {
  fullTreeSolEl.innerText =
    `~${fullTreeSol.toFixed(2)} SOL`;
}

  const isCryptoMode = paymentMode === "crypto";

  const isSoldOut =
    adoptBtn?.innerText === "Sold Out";

  // SHARE DISPLAY
  if (shareValueDisplay) {
    shareValueDisplay.innerText =
      shares.toLocaleString();
  }

  // PRICE DISPLAY
  if (priceDisplay) {
    if (isCryptoMode) {
      priceDisplay.innerHTML = `
        ◎ ${totalSol.toFixed(2)}
        <span style="font-size:0.6em;font-weight:normal;">
          SOL
        </span>
      `;
    } else {
      priceDisplay.innerText =
        `€${totalEuro.toLocaleString()}`;
    }
  }

  // PRICE SUB
  if (priceSub) {
    if (isCryptoMode) {
      priceSub.innerText =
      `${shares} share${shares > 1 ? "s" : ""} × ◎ ${(euroPerShare / solPrice).toFixed(4)} SOL`;
    } else {
      priceSub.innerText =
        `${shares} share${shares > 1 ? "s" : ""} × €${euroPerShare}`;
    }
  }

  // ── Button visibility: crypto vs fiat ────────────────────────────────────
  if (isCryptoMode && !isSoldOut) {
    if (pubKey) {
      // Wallet connected — show Continue, hide connect prompt
      if (connectBtn) connectBtn.style.display = "none";
      if (adoptBtn) {
        adoptBtn.style.display = "block";
        adoptBtn.innerText = "Continue to Agreement";
      }
    } else {
      // No wallet — replace the action button with a Connect prompt
      if (adoptBtn) adoptBtn.style.display = "none";
      if (connectBtn) {
        connectBtn.style.display = "block";
        connectBtn.style.background = "var(--green)";
        connectBtn.style.color = "white";
        connectBtn.style.border = "none";
        connectBtn.style.width = "100%";
        connectBtn.style.padding = "14px";
        connectBtn.style.borderRadius = "10px";
        connectBtn.style.fontSize = "1rem";
        connectBtn.style.fontWeight = "600";
        connectBtn.style.cursor = "pointer";
        connectBtn.innerText = "🔗 Connect Wallet to Continue";

        // Re-assign each call to avoid stale closure
        connectBtn.onclick = async () => {
          try {
            const provider = (window as any).solana || (window as any).phantom?.solana;
            if (!provider) {
              alert("Phantom or Solflare wallet extension required.");
              return;
            }
            const resp = await provider.connect();
            const pubKeyStr = resp.publicKey?.toBase58() ?? provider.publicKey?.toBase58();
            if (pubKeyStr) {
              localStorage.setItem("olivium_identity", JSON.stringify({
                type: "wallet", wallet: pubKeyStr, source: "solana"
              }));
              window.walletPubKey = resp.publicKey || provider.publicKey;
              window.dispatchEvent(new Event("solana:connection-complete"));
            }
          } catch (err) {
            console.error("[adoptModal] wallet connect failed:", err);
          }
          // Re-run updateShares so button state reflects the new connection
          await (window as any).updateShares();
        };
      }
    }
  } else {
    // Fiat mode or sold out
    if (connectBtn) connectBtn.style.display = "none";
    if (!isSoldOut && adoptBtn) {
      adoptBtn.style.display = "block";
      adoptBtn.innerText = "Continue to Agreement";
    }
  }
};

/* =========================================================
   PAYMENT SELECTOR
========================================================= */

function initPaymentSelector() {
  // Payment options are wired via the DOMContentLoaded payment-option loop below.
  // This stub is retained for compatibility; individual payment-option click handlers
  // update `paymentMode` and call updateShares() directly.
}

/* =========================================================
   AGREEMENT MODAL
========================================================= */

(window as any).openAgreement = () => {
  if (!selectedTree) return;

  document.body.style.overflow = "hidden";

  const agreeImg = document.getElementById(
    "agreeImage"
  ) as HTMLImageElement | null;

  const fallback = randomFallback();

  if (agreeImg) {
    agreeImg.src = selectedTree.image_url || fallback;

    agreeImg.onerror = () => {
      agreeImg.src = fallback;
    };
  }

  const agreeTitle =
    document.getElementById("agreeTitle");

  if (agreeTitle) {
    agreeTitle.innerText =
      `Adopting ${selectedTree.name || selectedTree.tree_id}`;
  }

  const loc = document.getElementById("agreeLocation");
  const age = document.getElementById("agreeAge");
  const height = document.getElementById("agreeHeight");
  const variety = document.getElementById("agreeVariety");

  if (loc) {
    loc.innerText = selectedTree.location || "Field F1";
  }

  if (age) {
    age.innerText = selectedTree.age || "5";
  }

  if (height) {
    height.innerText = selectedTree.height || "1.5m";
  }

  if (variety) {
    variety.innerText = selectedTree.variety || "Frantoio";
  }

  const check = document.getElementById(
    "agreeCheckbox"
  ) as HTMLInputElement | null;

  const finalBtn = document.getElementById(
    "finalConfirmBtn"
  ) as HTMLButtonElement | null;

  if (check && finalBtn) {
    check.checked = false;

    finalBtn.disabled = true;

    finalBtn.innerText = "Confirm & Pay";

    check.onchange = () => {
      finalBtn.disabled = !check.checked;
    };
  }

  const selectionModal =
    document.getElementById("modalOverlay");

  const agreementModal =
    document.getElementById("agreementModal");

  if (selectionModal) {
    selectionModal.style.display = "none";
  }

  if (agreementModal) {
    agreementModal.style.display = "flex";
  }
};

(window as any).closeAgreement = () => {
  const agreementModal =
    document.getElementById("agreementModal");

  const selectionModal =
    document.getElementById("modalOverlay");

  if (agreementModal) {
    agreementModal.style.display = "none";
  }

  if (selectionModal) {
    selectionModal.style.display = "flex";
  }
};

/* =========================================================
   SUCCESS MODAL
========================================================= */

(window as any).closeSuccess = () => {
  const successModal =
    document.getElementById("successModal");

  if (successModal) {
    successModal.style.display = "none";
  }

  document.body.style.overflow = "";
};



/* =========================================================
   FIAT TX
========================================================= */

async function startMollieCheckout() {
  console.log("MOLLIE BUY");

  try {

    const shares = Number(
      (
        document.getElementById(
          "shareInput"
        ) as HTMLInputElement
      ).value
    );

    const response = await fetch(
      "http://localhost:3000/create-mollie-payment",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({

          shares,

          treeId:
            selectedTree?.tree_id,

          treeName:
            selectedTree?.name,

          userEmail:
            window.OliviumAuth?.user?.email || null

        }),
      }
    );

    const data = await response.json();

    if (data.checkoutUrl) {

      window.location.href =
        data.checkoutUrl;

    } else {

      alert("Failed to create payment");

    }

  } catch (err) {

    console.error(err);

    alert("Payment server error");

  }

}


async function startPaypalCheckout() {

console.log("startPaypalCheckout");

}
/* =========================================================
   BLOCKCHAIN TX
========================================================= */

(window as any).processBlockchainTx = async () => {
  const program = (window as any)._program;
  const provider = (window as any)._provider || (window as any).provider;
  const finalBtn = document.getElementById("finalConfirmBtn") as HTMLButtonElement | null;

  // 🛑 GUARD 1: If already running/processing, exit immediately to stop concurrent double clicks
  if (finalBtn && (finalBtn.disabled || finalBtn.dataset.processing === "true")) {
    return;
  }

  if (!program || !provider) {
    alert("Wallet connection not fully ready. Please sign in.");
    return;
  }

  if (!selectedTree) return;

  const amountInput = document.getElementById("shareInput") as HTMLInputElement | null;
  if (!amountInput) return;

  const amount = new anchor.BN(amountInput.value);

  // DYNAMICALLY EXTRACT ACTIVE PUBLIC KEY FROM NATIVE OR EMBEDDED WALLET OBJECT
  const buyerPublicKey = provider.wallet?.publicKey || provider.publicKey;
  if (!buyerPublicKey) {
    alert("Could not resolve signing authority public key.");
    return;
  }

  try {
    // 🛑 GUARD 2: Instantly freeze the UI state before calling any blockchain/wallet signatures
    if (finalBtn) {
      finalBtn.disabled = true;
      finalBtn.dataset.processing = "true";
      finalBtn.innerText = "Processing...";
    }

    const [treePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("tree"), Buffer.from(selectedTree.tree_id)],
      program.programId
    );

    const [positionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("position"), buyerPublicKey.toBuffer(), Buffer.from(selectedTree.tree_id)],
      program.programId
    );

    const [protocolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("protocol")],
      program.programId
    );

    const [treasuryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury")],
      program.programId
    );

    // Build the instruction explicitly
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

    const connection = program.provider.connection;
    const transaction = new anchor.web3.Transaction().add(ix);
    transaction.feePayer = buyerPublicKey;
    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

    // CHOOSE SIGNING PATHWAY BASED ON HOW WALLET INTEGRATES
    let signature = "";
    if (provider.wallet && typeof provider.wallet.signTransaction === "function") {
      // Standard anchor provider extension flow
      const signedTx = await provider.wallet.signTransaction(transaction);
      signature = await connection.sendRawTransaction(signedTx.serialize());
    } else if (typeof provider.signTransaction === "function") {
      // Direct Web3Auth/Embedded provider interaction pipeline
      const signedTx = await provider.signTransaction(transaction);
      signature = await connection.sendRawTransaction(signedTx.serialize());
    } else {
      // Fallback custom adapter anchor execution trigger
      signature = await program.provider.sendAndConfirm(transaction, []);
    }

    await connection.confirmTransaction(signature, "confirmed");

    const agreementModal = document.getElementById("agreementModal");
    const successModal = document.getElementById("successModal");

    if (agreementModal) agreementModal.style.display = "none";
    if (successModal) successModal.style.display = "flex";

    // Clean up processing state since it succeeded
    if (finalBtn) {
      delete finalBtn.dataset.processing;
    }

    loadTrees();
  } catch (err) {
    console.error("Transaction Error:", err);
    alert("Transaction failed. Check wallet balance or signing approval authorization window.");

    // 🔄 ROLLBACK: Only re-enable the payment button if the transaction execution strictly errored out
    if (finalBtn) {
      finalBtn.disabled = false;
      delete finalBtn.dataset.processing;
      finalBtn.innerText = "Confirm & Pay";
    }
  }
};


// ══════════════════════════════════════════════════════════════
// SELL SHARES - Fixed PDA and Type Casting
// ══════════════════════════════════════════════════════════════
async function sellShares(treeId: string | number, amount: number) {
  const treeIdStr = String(treeId);
  console.log(`\n[SELL] Starting sale: Tree ${treeIdStr}, ${amount} shares`);

  // 1. GATHER GLOBALS
  const program = window._program;
  // Use the provider's wallet publicKey if available, else fall back to the saved string
  const walletInput = window._provider?.wallet?.publicKey || window.walletPubKey;

  if (!program || !walletInput) {
    showToast("Protocol not initialized or wallet not connected", true);
    return;
  }

  try {
    // 2. NORMALIZE PUBLICKEY
    // This ensures findPositionPDA receives a proper PublicKey object
    const ownerPublicKey = typeof walletInput === 'string'
      ? new anchor.web3.PublicKey(walletInput)
      : walletInput;

    // 3. DERIVE PDAs (Consistency check: use 'positionPDA' everywhere)
    const [treePDA] = findTreePDA(treeIdStr);
    const [positionPDA] = await findPositionPDA(ownerPublicKey, treeIdStr);
    const [protocolPDA] = findProtocolPDA();
    const [treasuryPDA] = findTreasuryPDA(program);

    console.log("[SELL] PDAs derived:", { treePDA: treePDA.toBase58(), positionPDA: positionPDA.toBase58() });

    // 4. FETCH POSITION DATA
    // Note: Ensure your anchor account name matches 'sharePosition' in your IDL
    const currentPosition = await program.account.sharePosition.fetch(positionPDA);
    const currentShares = Number(currentPosition.sharesOwned);
    const newTotal = currentShares - amount;

    if (newTotal < 0) {
      throw new Error(`Insufficient shares. You own ${currentShares}, trying to sell ${amount}.`);
    }

    // Logic for Guardian status (if applicable to your DB sync)
    const isGuardian = newTotal >= 1000;

    // 5. EXECUTE ON-CHAIN TRANSACTION
    console.log("[SELL] Sending transaction...");
    const tx = await program.methods
      .sellShares(treeIdStr, new anchor.BN(amount))
      .accounts({
        tree: treePDA,
        position: positionPDA,
        protocol: protocolPDA,
        treasury: treasuryPDA,
        seller: ownerPublicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log(`[SELL] ✅ On-chain success: ${tx}`);
   // showToast(`Sold ${amount} shares!`);

    // 6. SYNC TO DATABASE
    if (typeof syncTransactionToSupabase === 'function') {
        await syncTransactionToSupabase(
          ownerPublicKey.toBase58(),
          treeIdStr,
          amount,
          'SELL',
          tx,
          newTotal,
          isGuardian
        );
    }

    // 7. REFRESH UI
    await     loadTrees();

  } catch (err: any) {
    console.error(`[SELL] ❌ Sale failed:`, err);
    // Handle the "Account not found" error specifically
    if (err.message.includes("Account does not exist")) {
        console.log("Error: Share position record not found on-chain.", true);
    } else {
        console.log("Sell failed: " + err.message, true);
    }
  }
}
(window as any).sellShares = sellShares;
/* =========================================================
   ESCAPE KEY
========================================================= */

window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;

  const agreementModal =
    document.getElementById("agreementModal");

  const selectionModal =
    document.getElementById("modalOverlay");

  if (
    agreementModal &&
    agreementModal.style.display === "flex"
  ) {
    (window as any).closeAgreement();
  } else if (
    selectionModal &&
    selectionModal.style.display === "flex"
  ) {
    (window as any).closeModal();
  }
});
let cachedSolPrice = 100;
let lastPriceFetch = 0;

async function getSolPriceEUR(): Promise<number> {
    const now = Date.now();

    // Cache for 60 seconds
    if (now - lastPriceFetch < 60000) {
        return cachedSolPrice;
    }

    try {
        const res = await fetch(
            "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=eur"
        );

        const data = await res.json();

        if (data?.solana?.eur) {
            cachedSolPrice = data.solana.eur;
            lastPriceFetch = now;

            console.log("[PRICE] Live SOL/EUR:", cachedSolPrice);

            return cachedSolPrice;
        }
    } catch (err) {
        console.error("CoinGecko price fetch failed:", err);
    }

    // fallback
    return cachedSolPrice;
}


export function getActiveWallet(): string | null {
  const i = getIdentity();

  if (i.type === "wallet") return i.wallet || null;
  if (i.type === "email") return i.custodialWallet || null;

  return null;
}
/* =========================================================
   INIT
========================================================= */
const walletBtn =
  document.getElementById("connectWalletBtn");

if (walletBtn) {
  walletBtn.addEventListener("click", async () => {
    try {
      console.log("[WALLET] Connecting...");

      await (window as any).connectWallet();

      const wallet =
  (window as any).solana?.publicKey?.toBase58();

const positions =
  await (window as any).loadUserTreePositions();

const totalShares =
  positions.reduce(
    (sum: number, p: any) =>
      sum + (p.sharesOwned || 0),
    0
  );

updateIdentityUI({
  wallet,
  totalTrees: positions.length,
  totalShares,
  positions: positions.length,
});

      const modal =
        document.getElementById("connectModal");

      if (modal) {
        modal.style.display = "none";
      }

      loadTrees("my");

    } catch (err) {
      console.error("[WALLET ERROR]", err);
    }
  });
}

const emailBtn =
  document.getElementById("emailLoginBtn");

//if (emailBtn) {
//  emailBtn.addEventListener("click", () => {
//    window.location.href = "./crypto2.html";
//  });
//}


(window as any).loadUserTreePositions = async function () {
  const program = (window as any)._program;
  const wallet = (window as any).solana;

  const fallbackWalletAddress = Wallet();
  let checkingPublicKey: PublicKey | null = null;

  if (wallet?.publicKey) {
    checkingPublicKey = wallet.publicKey;
  } else if (fallbackWalletAddress) {
    try {
      checkingPublicKey = new PublicKey(fallbackWalletAddress);
    } catch (e) {
      console.error("[POSITIONS] Fallback wallet parsing failed:", e);
    }
  }

  if (!checkingPublicKey) {
    console.warn("[POSITIONS] Missing active authorized wallet public key reference");
    return [];
  }

  try {
    const targetUserAddressStr = checkingPublicKey.toBase58();
    console.log("[POSITIONS] Filtering cached positions for target:", targetUserAddressStr);

    // Fetch data safely through your cache wrapper functions
    const [allPositions, allTrees] = await Promise.all([
      getAllPositions(),
      getTrees()
    ]);

    // Trace deep log of one item to explicitly debug exact Anchor struct field formatting if it keeps mismatching
    if (allPositions.length > 0) {
      console.log("[POSITIONS DEBUG] Structure sample of position account schema:", allPositions[0].account);
    }

    // Fetch OVL Staked amount for the active checking key
    let totalStakedOlv = 0;
    try {
      const [stakePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("stake"), checkingPublicKey.toBuffer()],
        program.programId
      );
      const stakeAccount = await program.account.stakeAccount.fetch(stakePda);
      totalStakedOlv = (stakeAccount.amount?.toNumber() || 0) / 1_000_000_000;
    } catch (e) {
      console.log("[POSITIONS] No StakeAccount found for this user.");
    }

    const positions = allPositions
      .filter((pos: any) => {
        const acc = pos.account;

        // Find whichever ownership field your layout contains
        const rawAuthority = acc.authority || acc.owner || acc.wallet || acc.user;

        if (!rawAuthority) return false;

        // SAFE CONVERSION: Normalize whatever type rawAuthority is (String, PublicKey, or object with toBase58)
        let authorityStr = "";
        if (typeof rawAuthority === "string") {
          authorityStr = rawAuthority;
        } else if (typeof rawAuthority.toBase58 === "function") {
          authorityStr = rawAuthority.toBase58();
        } else if (rawAuthority._bn || rawAuthority.toString) {
          try {
            authorityStr = new PublicKey(rawAuthority).toBase58();
          } catch {
            authorityStr = rawAuthority.toString();
          }
        }

        return authorityStr === targetUserAddressStr;
      })
      .map((pos: any) => {
        const acc = pos.account;

        // Match the tree tracking ID
        const tree = allTrees.find(
          (t: any) => t.account.treeId.toString() === acc.treeId.toString()
        );

        return {
          treeId: acc.treeId.toString(),
          sharesOwned: acc.sharesOwned?.toNumber() || acc.sharesOwned || 0,
          treeName: tree?.account.name || "Unknown",
          // Hydrate with your requested metadata configurations
          treeMetadata: tree?.account.treeMetadata || null,
          totalStakedOlv: totalStakedOlv,
        };
      })
      .filter((p: any) => p.sharesOwned > 0);

    console.log("[POSITIONS] Filtered output matched for user successfully:", positions);
    return positions;

  } catch (err) {
    console.error("[POSITIONS ERROR]", err);
    return [];
  }
};
/**
 * Completely purges live user profiles, resets metric values to safe fallbacks,
 * and refreshes tree grids back to Guest mode context.
 */
 /**
  * Destroys cached records, drops dynamic management authorization fields,
  * resets individual asset markers, and re-syncs all live tree layouts back to guest mode.
  */

  /**
 * Complete UI and State Purge Routine for Disconnect Actions
 * Clears caches, flattens counts, strips action buttons, and returns layout to Guest mode.
 */
async function clearAllUserUiAndStates() {
  console.log("🧹 [TEARDOWN] Beginning complete profile state scrub...");

  // 1. Invalidate and wipe module-level position caches completely
  try {
    (window as any).positionsCache = null;
    (window as any).positionsPromise = null;

    // Explicitly target local file-scoped cache variables if they are stored in window context
    if ('positionsCache' in window) { (window as any).positionsCache = null; }
    if ('positionsPromise' in window) { (window as any).positionsPromise = null; }
  } catch (e) {
    console.warn("Error purging memory cache pointers:", e);
  }

  // 2. Roll back global identity states back to default visitor configurations
  if ((window as any).walletState) {
    (window as any).walletState.connected = false;
    (window as any).walletState.pubkey = null;
  }

  (window as any).walletPubKey = null;
  window.OliviumIdentity = { type: "guest" };

  // 3. Flatten out UI metric counters instantly inside the DOM
  const treeCountStat = document.getElementById("treeCountStat");
  const shareCountStat = document.getElementById("shareCountStat");
  const grovePositionStat = document.getElementById("grovePositionStat");
  const identityTypeStat = document.getElementById("identityTypeStat");

  if (treeCountStat) treeCountStat.innerText = "--";
  if (shareCountStat) shareCountStat.innerText = "--";
  if (grovePositionStat) grovePositionStat.innerText = "0"; // Hard reset the 6 positions to 0
  if (identityTypeStat) identityTypeStat.innerText = "Guest";

  console.log("📊 [TEARDOWN] Metric counters cleared. Refreshing layout components...");

  // 4. Force synchronous interface loops to clean and update the DOM
  try {
    // Refresh header bar tracking configurations via the safe wrapper hook
    if (typeof window.refreshIdentityUI === 'function') {
      window.refreshIdentityUI();
    }

    // Force an isolated layout statistics recalculation
    if (typeof (window as any).updateStatsUI === 'function') {
      await (window as any).updateStatsUI();
    }

    // Force a sync sequence across the villa dashboard system
    if (typeof (window as any).updateVillaStayUI === 'function') {
      await (window as any).updateVillaStayUI();
    }

    // CRITICAL: Reload the tree catalog without any cached user position credentials.
    // Because caches are nullified and identity is 'guest', isMine evaluates false for everything,
    // dropping all interactive owner components ("Release Shares" buttons) automatically.
    if (typeof (window as any).loadTrees === 'function') {
      await (window as any).loadTrees("all");
    }

    console.log("✨ [TEARDOWN] UI scrub complete. Application is in pristine read-only mode.");
  } catch (err) {
    console.error("Encountered an anomaly during component re-rendering cycles:", err);
  }
}

// Map the teardown process directly to global context for cross-module accessibility
(window as any).resetProfileAndUI = clearAllUserUiAndStates;

// Handle decoupled disconnect events fired by wallet connection modules
window.addEventListener("olivium:disconnected", async () => {
  await clearAllUserUiAndStates();
});
// Add this at the beginning of your web app
(function() {
  // Detect if running in Expo
  if (window.ReactNativeWebView || window.__EXPO_ENV__) {
    console.log('Running in Expo WebView');

    // Override wallet connection for mobile
    window.connectWalletMobile = async function() {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'REQUEST_WALLET'
        }));
      }
    };

    // If wallet connection button exists, override it
    const connectBtn = document.getElementById('connectWalletBtn');
    if (connectBtn) {
      const originalClick = connectBtn.onclick;
      connectBtn.onclick = async (e) => {
        e.preventDefault();
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'REQUEST_WALLET'
          }));
        } else if (originalClick) {
          originalClick(e);
        }
      };
    }

    // Prevent modals from closing during MFA
    const authModal = document.getElementById('authModalOverlay');
    if (authModal) {
      const preventClose = function(e) {
        const signupOtp = document.getElementById('signupOtpBox');
        if (signupOtp && signupOtp.style.display !== 'none') {
          e.stopPropagation();
        }
      };
      authModal.addEventListener('click', preventClose);
    }
  }
})();
 async function resetProfileAndUI() {
   console.log("[TEARDOWN] Purging active state and re-syncing tree content layout blocks...");

   // 1. Completely wipe local memory cache trackers to remove stale footprint histories
   (window as any).positionsCache = null;
   (window as any).positionsPromise = null;

   // Also clear internal module-scoped layout reference caches if initialized
   if ('positionsCache' in window) { (window as any).positionsCache = null; }

   // 2. Ensure state parameters reflect absolute default visitor settings
   walletState.connected = false;
   walletState.pubkey = null;
   window.OliviumIdentity = { type: "guest" };

   // 3. Flatten out text metrics natively inside DOM elements immediately
   const treeCount = document.getElementById("treeCountStat");
   const shareCount = document.getElementById("shareCountStat");
   const groveCount = document.getElementById("grovePositionStat");
   const identityEl = document.getElementById("identityTypeStat");

   if (treeCount) treeCount.innerText = "--";
   if (shareCount) shareCount.innerText = "--";
   if (groveCount) groveCount.innerText = "0"; // Correctly zero out grove metrics explicitly
   if (identityEl) identityEl.innerText = "Guest";

   // 4. Run native layout re-render pipelines
   try {
     // Refresh header bar/pill interfaces via embedded alias wrapper
     if (typeof (window as any).refreshIdentityUI === 'function') {
       await (window as any).refreshIdentityUI();
     }

     // Force a structural execution cycle update over global tree layouts
     await updateStatsUI();

     // Force drop dynamic user markers and drop "Release Shares" button containers safely
     await loadTrees("all");
   } catch (err) {
     console.error("Error occurred during UI catalog scrubbing:", err);
   }
 }

 // Map reference layout straight to global window scope context
 (window as any).resetProfileAndUI = resetProfileAndUI;

 // Intercept decoupled custom event loops to safeguard operational integrity
 window.addEventListener("olivium:disconnected", async () => {
   await resetProfileAndUI();
 });

/* =========================================================
   VILLA STAY UI HYDRATION & LOYALTY UPDATER
========================================================= */
export async function updateVillaStayUI() {
  console.log("🏨 Syncing real on-chain assets with villa_stay view...");

  // Layout Display Counters & Badges
  const sharesCountDisplay = document.getElementById("shares-count-display");
  const creditsCountDisplay = document.getElementById("credits-count-display");

  // Membership Tier Progress Components
  const tierName = document.getElementById("tier-name");
  const tierProgressText = document.getElementById("tier-progress-text");
  const nextTierLabel = document.getElementById("next-tier-label");
  const tierPercentLabel = document.getElementById("tier-percent-label");
  const tierProgressBar = document.getElementById("tier-progress-bar");
  const tierIcon = document.getElementById("tier-icon");

  // Overview Benefit Presentation Cards
  const cardTier1 = document.getElementById("card-tier-1");
  const cardTier2 = document.getElementById("card-tier-2");
  const cardTier3 = document.getElementById("card-tier-3");

  // Active Privilege Grid Selection Matrix
  const perkGov = document.getElementById("perk-gov");
  const perkShipping = document.getElementById("perk-shipping");
  const perkDiscount = document.getElementById("perk-discount");
  const perkStay = document.getElementById("perk-stay");

  // Interactive Booking Widget State Flags
  const patronDiscountBadge = document.getElementById("patronDiscountBadge");
  const bookingRateDisplay = document.getElementById("bookingRateDisplay");

  const wallet = Wallet();

  // 1. Handling Guest / Disconnected State Fallback Contexts
  if (!wallet) {
    if (sharesCountDisplay) sharesCountDisplay.innerHTML = `0 <span class="text-xs text-gold font-mono block mt-1">Nodes Detected</span>`;
    if (creditsCountDisplay) creditsCountDisplay.innerHTML = `00 <span class="text-xs text-gold font-mono block mt-1">Sanctuary Days</span>`;
    if (tierName) tierName.innerText = "Guest Mode";
    if (tierProgressText) tierProgressText.innerText = "Please log in to query chain states";
    if (patronDiscountBadge) patronDiscountBadge.innerText = "Standard Account";
    if (bookingRateDisplay) bookingRateDisplay.innerText = "$450 USD / Nightly standard baseline";

    // Set fallback default tier views to match standard layout
    [cardTier1, cardTier2, cardTier3, perkGov, perkShipping, perkDiscount, perkStay].forEach(el => {
      if (el) { el.classList.remove("opacity-100"); el.classList.add("opacity-40"); }
    });
    return;
  }

  try {
    await waitForProgram();

    // 2. Fetch User Positions & Credits from Both Sources
const positions = await (window as any).loadUserTreePositions?.();
const walletAddr = Wallet();

// Initialize defaults
let totalSharesOwned = 0;
let totalCredits = 0;

if (positions && positions.length > 0) {
  totalSharesOwned = positions.reduce((sum, p) => sum + p.sharesOwned, 0);
}

// Fetch credits from Supabase users table
if (walletAddr) {
  try {
    const { data: userData, error } = await sb
      .from('users')
      .select('credits')
      .eq('wallet', walletAddr)
      .maybeSingle();

    if (userData && !error) {
      totalCredits = userData.credits || 0;
    }
  } catch (err) {
    console.warn('Failed to fetch user credits from Supabase:', err);
  }
}

// Update displays
if (sharesCountDisplay) {
  sharesCountDisplay.innerHTML = `${totalSharesOwned.toLocaleString()} <span class="text-xs text-gold font-mono block mt-1">Nodes Detected</span>`;
}

if (creditsCountDisplay) {
  creditsCountDisplay.innerHTML = `${totalCredits} <span class="text-xs text-gold font-mono block mt-1">Sanctuary Days</span>`;
}

    // 4. Process Dynamic Asset Tier Levels & Visual Opacity Style Metrics
    let currentTier = "Standard Account";
    let nextTier = "Seed Supporter";
    let progressPercent = 0;
    let iconEmoji = "🫒";
    let progressLabelText = "";

    // Reset layout component weights smoothly
    [cardTier1, cardTier2, cardTier3, perkGov, perkShipping, perkDiscount, perkStay].forEach(el => {
      if (el) { el.classList.remove("opacity-100"); el.classList.add("opacity-40"); }
    });

    if (totalSharesOwned >= 1000) {
      currentTier = "Grove Patron";
      nextTier = "Max Tier Achieved";
      progressPercent = 100;
      iconEmoji = "👑";
      progressLabelText = "VIP Privileges unlocked";

      if (cardTier3) { cardTier3.classList.remove("opacity-40"); cardTier3.classList.add("opacity-100"); }
      [perkGov, perkShipping, perkDiscount, perkStay].forEach(el => {
        if (el) { el.classList.remove("opacity-40"); el.classList.add("opacity-100"); }
      });
    } else if (totalSharesOwned >= 500) {
      currentTier = "Tree Guardian";
      nextTier = "Grove Patron";
      progressPercent = Math.round(((totalSharesOwned - 500) / 500) * 100);
      iconEmoji = "🌳";
      progressLabelText = `${1000 - totalSharesOwned} shares to Patron level`;

      if (cardTier2) { cardTier2.classList.remove("opacity-40"); cardTier2.classList.add("opacity-100"); }
      [perkGov, perkShipping, perkDiscount].forEach(el => {
        if (el) { el.classList.remove("opacity-40"); el.classList.add("opacity-100"); }
      });
    } else if (totalSharesOwned >= 100) {
      currentTier = "Seed Supporter";
      nextTier = "Tree Guardian";
      progressPercent = Math.round(((totalSharesOwned - 100) / 400) * 100);
      iconEmoji = "🌱";
      progressLabelText = `${500 - totalSharesOwned} shares to Guardian level`;

      if (cardTier1) { cardTier1.classList.remove("opacity-40"); cardTier1.classList.add("opacity-100"); }
      [perkGov, perkShipping].forEach(el => {
        if (el) { el.classList.remove("opacity-40"); el.classList.add("opacity-100"); }
      });
    } else {
      currentTier = "Standard Account";
      nextTier = "Seed Supporter";
      progressPercent = Math.round((totalSharesOwned / 100) * 100);
      progressLabelText = `${100 - totalSharesOwned} shares to unlock Seed level`;
    }

    // Hydrate Primary Tier Presentation Content Node fields safely
    if (tierName) tierName.innerText = currentTier;
    if (tierIcon) tierIcon.innerText = iconEmoji;
    if (tierProgressText) tierProgressText.innerText = progressLabelText;
    if (nextTierLabel) nextTierLabel.innerText = `Next: ${nextTier}`;
    if (tierPercentLabel) tierPercentLabel.innerText = `${progressPercent}%`;
    if (tierProgressBar) tierProgressBar.style.width = `${progressPercent}%`;

    // 5. Apply Loyalty Pricing Protocol overrides onto Booking Widget
    let pricingTierLabel = "Standard Account";
    let calculatedRateString = "$450 USD / Nightly standard baseline";

    // Genesis Rule constraint check: First 3 tree id indexes (2026-02-07)
    const hasGenesisTree = positions.some((p: any) => Number(p.treeId) <= 3);

    if (hasGenesisTree || totalSharesOwned >= 1000) {
      pricingTierLabel = "👑 Grove Patron Tier";
      calculatedRateString = "$382.50 USD / Nightly (15% Patron Override Applied)";
    } else if (totalSharesOwned >= 500) {
      pricingTierLabel = "🌳 Guardian Tier";
      calculatedRateString = "$382.50 USD / Nightly (15% Guardian Override Applied)";
    } else if (totalSharesOwned >= 100) {
      pricingTierLabel = "🌱 Seed Supporter";
      calculatedRateString = "$450 USD / Nightly standard baseline";
    }

    if (patronDiscountBadge) patronDiscountBadge.innerText = pricingTierLabel;
    if (bookingRateDisplay) bookingRateDisplay.innerText = calculatedRateString;

  } catch (err) {
    console.error("❌ [VILLA STAY UPDATE ERROR]", err);
  }
}
// At the bottom of reserve.ts, BEFORE the event listeners:

// Make functions globally accessible for villa_stay.html
(window as any).updateVillaStayUI = updateVillaStayUI;
(window as any).updateStatsUI = updateStatsUI;
(window as any).updateWalletUI = updateWalletUI;
(window as any).getAllPositions = getAllPositions;

/* =========================================================
   EVENT LISTENERS - CONSOLIDATED & DEDUPLICATED
========================================================= */

// Single handler for wallet/blockchain connection completion
window.addEventListener("solana:connection-complete", async () => {
  console.log("[SYNC EVENT] Blockchain initialized. Regenerating all UI components...");

  // Update all UI components in sequence
  await updateWalletUI();
  await updateStatsUI();
  await updateVillaStayUI();

  // Reload tree grid if "My Grove" filter is active
  const activeFilter = document.querySelector(".filter-btn.active") as HTMLElement | null;
  if (activeFilter && activeFilter.dataset.filter === "my") {
    const positions = await (window as any).loadUserTreePositions?.();
    if (positions && positions.length > 0) {
      renderMyTreesFromPositions(positions);
    }
  }
});

// Single DOM initialization handler
window.addEventListener("DOMContentLoaded", async () => {
  console.log("[INIT] Initializing application...");

  // Initialize UI components
  initFilters();
  initPaymentSelector();

  // Load wallet and data from cache/providers
  initWalletOnLoad();
  loadTrees();


    // Load all UI components on initial page load
    await updateWalletUI();
    await updateStatsUI();
    await updateVillaStayUI();
  document.querySelectorAll(".payment-option").forEach((option) => {

  option.addEventListener("click", () => {

    // remove active state
    document
      .querySelectorAll(".payment-option")
      .forEach((el) => el.classList.remove("active"));

    // activate clicked button
    option.classList.add("active");

    // update mode
    paymentMode = option.getAttribute("data-payment") as
      | "mollie"
      | "paypal"
      | "crypto";

    console.log("PAYMENT MODE:", paymentMode);

    // IMPORTANT
    // refresh price display instantly
    (window as any).updateShares?.();

  });


  });
  document.getElementById("finalConfirmBtn")?.addEventListener(
    "click",
    async () => {

      if (paymentMode === "mollie") {
        await startMollieCheckout();
        return;
      }

      if (paymentMode === "paypal") {
        await startPaypalCheckout();
        return;
      }

      if (paymentMode === "crypto") {
        (window as any).processBlockchainTx();
        return;
      }

    }
  );
 });
