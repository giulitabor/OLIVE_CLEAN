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
        const program = (window as any)._program;
        if (!program) throw new Error("[getTrees] program not initialized");
        const result = await program.account.tree.all();
        treesCache = result;
        return result;
    })();
 
    return treesPromise;
}

let positionsCache: any[] | null = null;
let positionsPromise: Promise<any[]> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 8000;

export async function getAllPositions(forceRefresh = false): Promise<any[]> {
  const now = Date.now();

  if (positionsCache && !forceRefresh && (now - cacheTimestamp < CACHE_TTL)) {
    return positionsCache;
  }

  if (positionsPromise) {
    console.log("[POSITIONS] Request deduplicated. Hooking into active RPC flight...");
    return positionsPromise;
  }

  console.log("[RPC] 🛰️ Initiating single network query for all position accounts...");

  const program = (window as any)._program;
  if (!program) return [];

  positionsPromise = program.account.sharePosition.all()
    .then((data) => {
      positionsCache = data;
      cacheTimestamp = Date.now();
      return data;
    })
    .catch((err) => {
      positionsPromise = null;
      throw err;
    })
    .finally(() => {
      positionsPromise = null;
    });

  return positionsPromise;
}

let walletState = {
  connected: false,
  pubkey: null as string | null
};

function Wallet() {
  const state = (window as any).walletState;
  if (state && state.connected === false) {
    return null;
  }

  const provider = (window as any)._provider;
  const pubKey =
    provider?.wallet?.publicKey ||
    provider?.publicKey ||
    (window as any).walletPubKey ||
    null;

  if (pubKey) {
    return pubKey.toString();
  }
  return null;
}

/* ==========================================================================
   SELL & DETAIL MODAL CONTROLLER BINDINGS
   ========================================================================== */

let activeSellTreeId: string | null = null;
let maxAvailableSellShares = 0;

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

function closeSellModal() {
  document.getElementById('sell-modal')?.classList.add('hidden');
  activeSellTreeId = null;
  maxAvailableSellShares = 0;
}
(window as any).closeSellModal = closeSellModal;

(window as any).setSellMax = () => {
  const inputAmount = document.getElementById('sell-amount-input') as HTMLInputElement;
  if (inputAmount) {
    inputAmount.value = maxAvailableSellShares.toString();
    recalculateExpectedPayout();
  }
};

function recalculateExpectedPayout() {
  const inputAmount = document.getElementById('sell-amount-input') as HTMLInputElement;
  const payoutDisplay = document.getElementById('sell-modal-payout');

  if (!inputAmount || !payoutDisplay) return;

  const sharesToSell = parseInt(inputAmount.value) || 0;
  const euroVal = sharesToSell * 12.40;
  const solPrice = (window as any).cachedSolPrice || 100;
  const solPayoutEstimate = euroVal / solPrice;

  payoutDisplay.textContent = `${solPayoutEstimate.toFixed(3)} SOL`;
}

document.getElementById('sell-amount-input')?.addEventListener('input', recalculateExpectedPayout);

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

/* =========================================================
   UPDATE IDENTITY BALANCE UI - FIXED VERSION
========================================================= */

async function updateIdentityBalanceUI() {
  try {
    const pillEl = document.getElementById("identityPill");
    const stat = document.getElementById("identityTypeStat");
    const connectBtn = document.getElementById("connectBtn");

    const saved = JSON.parse(
      localStorage.getItem("olivium_identity") || "null"
    );

    // GUEST MODE (single source of truth)
    if (!saved) {
      if (pillEl) pillEl.innerHTML = "🌿 Guest Mode";
      if (stat) stat.innerHTML = "Guest";
      if (connectBtn) {
        connectBtn.innerText = "Connect Profile";
        connectBtn.style.color = "white";
        connectBtn.style.border = "";
        connectBtn.style.background = "var(--green)";
      }
      // Clear any residual wallet references
      window._provider = null;
      window.walletPubKey = null;
      return;
    }

    // EMAIL MODE
    if (saved.type === "email") {
      if (pillEl) pillEl.innerHTML = `✉️ ${saved.address || "Email User"}`;
      if (stat) stat.innerHTML = "Email Secured";
      if (connectBtn) {
        connectBtn.innerText = "Disconnect";
        connectBtn.style.color = "#d94d4d";
        connectBtn.style.border = "1px solid #d94d4d";
        connectBtn.style.background = "transparent";
      }
      return;
    }

    // WALLET MODE
    if (saved.type === "wallet" && saved.wallet) {
      let shortAddr = saved.wallet.slice(0, 4) + "..." + saved.wallet.slice(-4);
      let solBalance = "—";

      try {
        const connection = new Connection("https://api.devnet.solana.com", "confirmed");
        const pubKey = new PublicKey(saved.wallet);
        const lamports = await connection.getBalance(pubKey);
        solBalance = (lamports / 1_000_000_000).toFixed(3);
      } catch (err) {
        console.warn("Balance fetch failed:", err);
      }

      if (pillEl) {
        pillEl.innerHTML = `◎ ${solBalance} SOL <span style="opacity:.5;margin:0 6px">|</span> 🔑 ${shortAddr}`;
      }
      if (stat) stat.innerHTML = "Wallet Mode";
      if (connectBtn) {
        connectBtn.innerText = "Disconnect";
        connectBtn.style.color = "#d94d4d";
        connectBtn.style.border = "1px solid #d94d4d";
        connectBtn.style.background = "transparent";
      }
      return;
    }

  } catch (err) {
    console.error("[updateIdentityBalanceUI]", err);
  }
}

window.updateIdentityBalanceUI = updateIdentityBalanceUI;

/* =========================================================
   UPDATE STATS UI - FIXED FOR CLEAN STATE
========================================================= */

async function updateStatsUI() {
  const treeCount = document.getElementById("treeCountStat");
  const shareCount = document.getElementById("shareCountStat");
  const groveCount = document.getElementById("grovePositionStat");

  const identity = JSON.parse(localStorage.getItem("olivium_identity") || "null");
  const guestMode = !identity;

  // If NO wallet/identity is active, show clean stats
  if (guestMode) {
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
    const [allTrees, positions] = await Promise.all([
      getTrees(),
      (window as any).loadUserTreePositions?.()
    ]);

    if (!positions) return;

    const totalTreesOnChain = allTrees ? allTrees.length : 0;
    const userUniqueTreesCount = new Set(positions.map(p => p.treeId)).size;
    const totalSharesCount = positions.reduce((s, p) => s + p.sharesOwned, 0);

    if (treeCount) treeCount.innerText = String(totalTreesOnChain);
    if (shareCount) shareCount.innerText = String(totalSharesCount);
    if (groveCount) groveCount.innerText = String(userUniqueTreesCount);

  } catch (err) {
    console.error("[STATS UPDATE ERROR]", err);
    if (treeCount) treeCount.innerText = "--";
    if (shareCount) shareCount.innerText = "--";
    if (groveCount) groveCount.innerText = "0";
  }
}

async function updateWalletUI() {
  if (!(window as any).walletState?.connected) {
    window.OliviumIdentity = { type: "guest" };
    if (typeof (window as any).refreshIdentityUI === "function") {
      await (window as any).refreshIdentityUI();
    }
    return;
  }

  const wallet = Wallet();
  walletState.connected = !!wallet;
  walletState.pubkey = wallet;

  window.OliviumIdentity = wallet ? { type: "wallet", wallet } : { type: "guest" };

  if (typeof (window as any).refreshIdentityUI === "function") {
    await (window as any).refreshIdentityUI();
  }
}

async function startStripeCheckout() {
  const response = await fetch("/create-checkout-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      treeId: selectedTree?.tree_id,
      shares: Number((document.getElementById("shareInput") as HTMLInputElement).value),
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
    window.OliviumIdentity = { type: "wallet", wallet };
    await updateStatsUI();
    await (window as any).loadUserTreePositions?.();
  } else {
    console.log("[WALLET] No wallet detected");
    await updateStatsUI();
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

  if (treesEl) treesEl.innerText = String(data?.totalTrees || 0);
  if (sharesEl) sharesEl.innerText = String(data?.totalShares || 0);
  if (identityEl) {
    if (data?.wallet) {
      identityEl.innerText = `${data.wallet.slice(0,4)}...${data.wallet.slice(-4)}`;
    } else {
      identityEl.innerText = "Guest";
    }
  }
  if (positionsEl) positionsEl.innerText = String(data?.positions || 0);
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
  const slider = document.getElementById("shareSlider") as HTMLInputElement | null;
  if (!slider) return val;
  const min = Number(slider.min) || 1;
  const max = Number(slider.max) || 1000;
  return Math.max(min, Math.min(max, val));
}

export async function AllPositions() {
    if (positionsCache) return positionsCache;
    if (positionsPromise) return positionsPromise;
    const program = (window as any)._program;
    if (!program) return [];
    positionsPromise = program.account.sharePosition.all();
    positionsCache = await positionsPromise;
    return positionsCache;
}

/* =========================================================
   LOAD TREES - FIXED FOR CLEAN STATE
========================================================= */

async function loadTrees(filter = "all") {
  const container = document.getElementById("treeGrid");
  console.log("about to load trees");

  if (!container) return;

  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>🌿 Syncing live grove availability...</p>
    </div>
  `;

  const program = await waitForProgram();
  console.log(program);

  const { data: dbTrees, error } = await sb
    .from("tree_metadata")
    .select("*")
    .order("tree_id", { ascending: true });

  if (error || !dbTrees) {
    container.innerHTML = `<p style="padding:40px;text-align:center;">Failed to load trees.</p>`;
    return;
  }

  let onChainTrees: any[] = [];
  let userPositions: any[] = [];
  const identity = JSON.parse(localStorage.getItem("olivium_identity") || "null");
  const guestMode = !identity;
  console.log("Guest mode:", guestMode);

  // Only fetch on-chain data if program exists AND not in guest mode
  if (program && !guestMode) {
    try {
      console.log("[RPC] Fetching all tree accounts...");
      onChainTrees = await program.account.tree.all();
      console.log(`[RPC] Successfully fetched ${onChainTrees.length} trees from blockchain.`);

      if (typeof (window as any).loadUserTreePositions === "function") {
        userPositions = await (window as any).loadUserTreePositions();
      } else if (typeof (window as any).getAllPositions === "function") {
        const rawPositions = await (window as any).getAllPositions();
        const activeWallet = typeof (window as any).Wallet === "function" ? (window as any).Wallet() : null;
        if (activeWallet) {
          userPositions = rawPositions.filter((p: any) => p.account.buyer.toBase58() === activeWallet);
        }
      }
    } catch (err) {
      console.error("On-chain fetch failed:", err);
    }
  }

  container.innerHTML = "";

  for (const dbTree of dbTrees) {
    const onChainData = onChainTrees.find((t) => t.account.treeId === dbTree.tree_id);

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

    const user = window.OliviumAuth?.user;
    const myWalletOrEmail = user?.email || user?.id;
    const matchesFiatOwnership = myWalletOrEmail ? dbTree.owner === myWalletOrEmail || dbTree.user_email === myWalletOrEmail : false;
    const matchedPosition = userPositions.find((p) => {
      const pTreeId = p.treeId || p.account?.treeId;
      return String(pTreeId) === String(dbTree.tree_id);
    });
    const ownedShares = matchedPosition ? matchedPosition.sharesOwned || matchedPosition.account?.sharesOwned?.toNumber() || 0 : 0;
    const isMine = matchesFiatOwnership || ownedShares > 0;

    if (!isLiveOnChain && filter !== "all") continue;
    if (filter === "my" && !isMine) continue;
    if (filter !== "all" && filter !== "my" && filter !== status) continue;
    
    const available = totalShares - sharesSold;
    const card = document.createElement("div");
    card.className = "tree-card";

    if (sharesSold > 0) card.classList.add("has-sales");
    if (percent >= 90) {
      card.style.border = "2px solid #d94d4d";
    } else if (percent >= 60) {
      card.style.border = "2px solid #d7a728";
    }

    const displayImg = dbTree.image_url || "https://raw.githubusercontent.com/kyngrick/olivium_photos/main/olivium_logo2.png";

    card.innerHTML = `
      <img class="tree-image" src="${displayImg}" />
      <div class="tree-content">
        <div class="tree-name">${dbTree.name || dbTree.tree_id}</div>
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
          <div class="shares-left">${available > 0 ? "Available now" : "Fully adopted"}</div>
        </div>
        ${isLiveOnChain ? `<div class="live-badge">⛓ LIVE ON-CHAIN</div>` : ""}
        <div class="card-actions" style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; width: 100%;">
          <button class="action-btn details-btn" style="flex:1;min-width:70px;padding:8px;background:#B8860B;color:white;border:none;border-radius:6px;cursor:pointer;font-size:0.85rem;font-weight:500;">Details</button>
          ${available > 0 ? `<button class="action-btn adopt-btn" style="flex: 1; min-width: 70px; padding: 8px; background: #556B2F; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: 500;">Adopt</button>` : ""}
          ${isMine ? `<button class="action-btn release-btn" style="flex: 1; min-width: 70px; padding: 8px; background: #d94d4d; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: 500; width: 100%;">Release Shares</button>` : ""}
        </div>
      </div>
    `;

    card.querySelector(".details-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (typeof (window as any).openTreeDetailModal === "function") {
        (window as any).openTreeDetailModal(dbTree.tree_id);
      }
    });

    card.querySelector(".adopt-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (typeof (window as any).openModal === "function") {
        (window as any).openModal(dbTree);
      } else if (typeof (window as any).openTreeDetailModal === "function") {
        (window as any).openTreeDetailModal(dbTree.tree_id);
      }
    });

    card.querySelector(".release-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (typeof (window as any).openSellModal === "function") {
        (window as any).openSellModal(dbTree.tree_id, ownedShares || 10);
      } else {
        console.warn("Global operation handler window.openSellModal is not available in environment execution paths.");
      }
    });

    container.appendChild(card);
  }
}

/* =========================================================
   TREE DETAIL MODAL
========================================================= */

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
        if (!prog) return [];
        return await prog.account.tree.all();
      } catch { return []; }
    })(),
  ]);

  const d = sbResult?.data ?? null;
  if (!d) console.warn("[MODAL] No Supabase row for tree_id:", treeId);

  const onChain = (onChainTrees as any[]).find(
    (t: any) => t.account?.treeId === treeId || String(t.account?.treeId) === String(treeId)
  );

  const totalShares = onChain ? onChain.account.totalShares.toNumber() : (d?.total_shares ?? 1000);
  const sharesSold = onChain ? onChain.account.sharesSold.toNumber() : (d?.shares_sold ?? 0);
  const available = totalShares - sharesSold;
  const pct = totalShares > 0 ? Math.round((sharesSold / totalShares) * 100) : 0;
  const mintAddress = onChain?.account?.mint?.toBase58?.() ?? d?.mint ?? d?.on_chain_address ?? "—";

  const heroEl = document.getElementById("tree-detail-hero-img");
  if (heroEl) heroEl.style.backgroundImage = `url('${d?.photo_url || "https://raw.githubusercontent.com/kyngrick/olivium_photos/main/close1.jpeg"}')`;

  set("tree-detail-name", d?.name || `Tree #${treeId}`);
  set("tree-detail-location", d?.field_id ? `Field ${d.field_id} · ${d.latitude?.toFixed(4)}, ${d.longitude?.toFixed(4)}` : "—");
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
  set("tree-detail-meta-coords", d?.latitude != null && d?.longitude != null ? `${d.latitude}, ${d.longitude}` : "—");
  set("tree-detail-meta-updated", d?.updated_at ? new Date(d.updated_at).toLocaleString() : "—");

  const galleryGrid = document.getElementById("tree-detail-gallery-grid");
  if (galleryGrid) {
    const photos: string[] = [];
    if (d?.photo_url) photos.push(d.photo_url);
    const repoBase = "https://raw.githubusercontent.com/kyngrick/olivium_photos/main";
    if (photos.length === 0) {
      photos.push(`${repoBase}/Tree%20F1-FR-001.jpeg`, `${repoBase}/Tree%20F1-FR-002.jpeg`, `${repoBase}/close1.jpeg`);
    }
    galleryGrid.innerHTML = photos.map(url => `<img src="${url}" class="rounded-xl w-full h-40 object-cover" onerror="this.style.display='none'" />`).join("");
  }

  const fieldId = d?.field_id ?? null;
  const sensorData = await fetchFieldSensors(fieldId);
  const lat = sensorData?.lat ?? d?.latitude ?? null;
  const lon = sensorData?.lon ?? d?.longitude ?? null;

  if (lat != null && lon != null) {
    set("weather-coords-label", `${Number(lat).toFixed(4)}°N, ${Number(lon).toFixed(4)}°E`);
  }
  if (fieldId) set("env-field-label", fieldId);

  const [weatherData] = await Promise.all([fetchOpenMeteo(lat, lon)]);
  populateSensorUI(sensorData);
  populateWeatherUI(weatherData);
}

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
  const set = (id: string, val: string) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
  };

  if (!s) {
    set("oracle-soil-moisture", na);
    set("oracle-moisture-status", "No data");
    set("oracle-soil-temp", na);
    set("oracle-leaf-wetness", na);
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
  const temp = s.temperature ?? null;
  const leaf = s.leaf_wetness ?? null;
  const co2 = s.co2 ?? null;
  const wind = s.wind_speed ?? null;
  const rain = s.rain_rate ?? null;
  const humidity = s.humidity ?? null;
  const uvIndex = s.uv_index ?? null;
  const updatedAt = s.created_at ?? null;

  set("oracle-soil-moisture", moisture !== null ? `${Number(moisture).toFixed(1)}%` : na);
  set("oracle-moisture-status", moisture !== null ? (moisture > 50 ? "Optimal" : "Balanced") : "No data");
  set("oracle-soil-temp", temp !== null ? `${Number(temp).toFixed(1)}°C` : na);
  set("oracle-leaf-wetness", leaf !== null ? Number(leaf).toFixed(2) : na);
  set("oracle-co2", co2 !== null ? `${Number(co2).toFixed(1)} ppm` : na);
  set("oracle-wind", wind !== null ? `${Number(wind).toFixed(1)} m/s` : na);
  set("oracle-rain", rain !== null ? `${Number(rain).toFixed(2)} mm/hr` : na);
  set("oracle-humidity", humidity !== null ? `${Number(humidity).toFixed(1)}%` : na);
  set("oracle-uv", uvIndex !== null ? String(uvIndex) : na);
  set("oracle-last-update", updatedAt ? new Date(updatedAt).toLocaleTimeString() : new Date().toLocaleTimeString());

  const bar = document.getElementById("oracle-moisture-bar") as HTMLElement | null;
  if (bar) bar.style.width = moisture !== null ? `${Math.min(moisture, 100)}%` : "0%";
}

async function fetchOpenMeteo(lat: number | null, lon: number | null): Promise<any | null> {
  if (lat === null || lon === null) {
    console.warn("[WEATHER] No coordinates on tree — skipping weather fetch.");
    return null;
  }

  try {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      current: ["temperature_2m", "relative_humidity_2m", "wind_speed_10m", "surface_pressure", "rain", "uv_index", "shortwave_radiation"].join(","),
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
  const uvLabel = uvRaw !== null ? `${uvRaw} (${uvRaw <= 2 ? "Low" : uvRaw <= 5 ? "Moderate" : uvRaw <= 7 ? "High" : "Very High"})` : na;

  set("weather-temp", w.temperature_2m !== undefined ? `${w.temperature_2m}°C` : na);
  set("weather-wind", w.wind_speed_10m !== undefined ? `${w.wind_speed_10m} m/s` : na);
  set("weather-humidity", w.relative_humidity_2m !== undefined ? `${w.relative_humidity_2m}%` : na);
  set("weather-pressure", w.surface_pressure !== undefined ? `${w.surface_pressure} hPa` : na);
  set("weather-rain", w.rain !== undefined ? `${w.rain} mm` : na);
  set("weather-uv", uvLabel);
  set("weather-solar", w.shortwave_radiation !== undefined ? `${w.shortwave_radiation} W/m²` : na);
}

function closeTreeDetailModal() {
  const modal = document.getElementById("tree-detail-modal");
  if (modal) modal.classList.add("hidden");
}

function switchTreeDetailTab(tabName: string) {
  const containers = document.querySelectorAll(".tree-detail-tab-content");
  containers.forEach((el) => el.classList.add("hidden"));

  const targetContainer = document.getElementById(`tree-detail-tab-${tabName}`);
  if (targetContainer) targetContainer.classList.remove("hidden");

  const tabs = document.querySelectorAll(".tree-detail-tab");
  tabs.forEach((tab) => {
    tab.classList.remove("active", "border-green-600", "text-green-600");
    tab.classList.add("border-transparent", "text-stone-500");
  });

  const eventTargetBtn = Array.from(tabs).find((t) => t.getAttribute("onclick")?.includes(`'${tabName}'`));
  if (eventTargetBtn) {
    eventTargetBtn.classList.add("active", "border-green-600", "text-green-600");
    eventTargetBtn.classList.remove("border-transparent", "text-stone-500");
  }
}

(window as any).openTreeDetailModal = openTreeDetailModal;
(window as any).closeTreeDetailModal = closeTreeDetailModal;
(window as any).switchTreeDetailTab = switchTreeDetailTab;

/* =========================================================
   FILTERS
========================================================= */

function initFilters() {
  const filterButtons = document.querySelectorAll(".filter-btn");
  filterButtons.forEach((button) => {
    button.addEventListener("click", async (e) => {
      filterButtons.forEach((btn) => btn.classList.remove("active"));
      const el = e.currentTarget as HTMLElement;
      if (!el) return;
      el.classList.add("active");
      const filter = el.dataset.filter || "all";

      if (filter === "my") {
        const positions = await (window as any).loadUserTreePositions?.();
        if (!positions || positions.length === 0) {
          const container = document.getElementById("treeGrid");
          if (container) {
            container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted, #8a8a8a);"><h3>No trees found in your grove</h3><p>Connect wallet or purchase shares first.</p></div>`;
          }
          return;
        }
        renderMyTreesFromPositions(positions);
        return;
      }
      loadTrees(filter);
    });
  });
}

/* =========================================================
   RENDER MY TREES
========================================================= */

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

async function renderMyTreesFromPositions(positions: Position[]): Promise<void> {
  const container = document.getElementById("treeGrid");
  if (!container) {
    console.error("[TREE GRID] Container '#treeGrid' not found.");
    return;
  }

  container.innerHTML = "";
  if (!Array.isArray(positions) || positions.length === 0) {
    container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #7A8275;"><p>🌿 You don't have any adopted positions linked to this wallet account profile yet.</p></div>`;
    return;
  }

  let treeMap = new Map<string, TreeMetadata>();
  try {
    const { data, error } = await sb.from("tree_metadata").select("*");
    if (error) {
      console.error("[SUPABASE] Metadata fetch failed:", error);
    } else if (Array.isArray(data)) {
      treeMap = new Map(data.map((tree: TreeMetadata) => [String(tree.tree_id), tree]));
    }
  } catch (err) {
    console.error("[SUPABASE] Unexpected metadata fetch error:", err);
  }

  for (const pos of positions) {
    try {
      const treeId = pos.treeId ?? pos.account?.treeId ?? "";
      const sharesOwned = pos.sharesOwned ?? pos.account?.sharesOwned?.toNumber?.() ?? 0;
      const metadata = treeMap.get(String(treeId));
      const displayName = escapeHtml(metadata?.name || `Tree #${treeId}`);
      const totalCapacity = metadata?.total_shares ?? 1000;
      const displayImg = metadata?.image_url || "https://raw.githubusercontent.com/kyngrick/olivium_photos/main/olivium_logo2.png";
      const ownershipPercent = Math.min((sharesOwned / totalCapacity) * 100, 100);

      const card = document.createElement("div");
      card.className = "tree-card has-sales";
      Object.assign(card.style, { display: "flex", flexDirection: "column", justifyContent: "space-between" });

      card.innerHTML = `
        <div>
          <img class="tree-image" src="${displayImg}" alt="${displayName}" style="width: 100%; height: 160px; object-fit: cover; border-radius: 8px;" onerror="this.onerror=null;this.src='https://raw.githubusercontent.com/kyngrick/olivium_photos/main/olivium_logo2.png';" />
          <div class="tree-content" style="margin-top: 12px;">
            <div class="tree-name" style="font-size: 1.2rem; font-weight: 600;">${displayName}</div>
            <div class="tree-meta" style="margin-top: 4px; font-size: 0.85rem;">
              <span><strong>${sharesOwned.toLocaleString()}</strong> shares owned</span>
              <span style="margin-left: 6px; opacity: 0.65;">(${totalCapacity.toLocaleString()} total units)</span>
            </div>
            <div class="availability" style="margin-top: 12px;">
              <div class="progress-bar" style="width: 100%; height: 6px; background: rgba(0,0,0,0.05); border-radius: 3px; overflow: hidden;">
                <div class="progress-fill" style="width: ${ownershipPercent}%; height: 100%; background: #6B7F5A; transition: width 0.3s ease;"></div>
              </div>
              <div class="shares-left" style="margin-top: 6px; font-size: 0.8rem; font-weight: 600; color: #6B7F5A; text-transform: uppercase;">${ownershipPercent.toFixed(2)}% ownership</div>
            </div>
          </div>
        </div>
        <div class="card-actions" style="display: flex; gap: 8px; margin-top: 16px; width: 100%;">
          <button class="action-btn details-btn" style="flex: 1; padding: 8px; background: #6B7F5A; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: 500;">Details</button>
          <button class="action-btn release-btn" style="flex: 1; padding: 8px; background: #d94d4d; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: 500;">Release Shares</button>
        </div>
      `;

      const detailsBtn = card.querySelector(".details-btn");
      if (detailsBtn instanceof HTMLButtonElement) {
        detailsBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          try {
            const targetTreeId = String(treeId);
            const { data: dbTree, error } = await sb.from("tree_metadata").select("*").eq("tree_id", targetTreeId).single();
            if (error || !dbTree) {
              console.warn(`[TREE DETAILS] Metadata not found for Tree #${targetTreeId}`);
              return;
            }
            const deepModal = document.getElementById("tree-detail-modal");
            const modalName = document.getElementById("tree-detail-name");
            const modalLocation = document.getElementById("tree-detail-location");
            if (!deepModal) {
              console.error("[TREE MODAL] '#tree-detail-modal' missing.");
              return;
            }
            if (modalName) modalName.textContent = dbTree.name || `Tree #${dbTree.tree_id}`;
            if (modalLocation) modalLocation.textContent = dbTree.location ? `📍 ${dbTree.location}` : "📍 Coordinates not specified";
            if (typeof (window as any).populateTreeTabs === "function") {
              await (window as any).populateTreeTabs(dbTree);
            }
            deepModal.classList.remove("hidden");
            if (typeof (window as any).switchTreeDetailTab === "function") {
              (window as any).switchTreeDetailTab("overview");
            }
          } catch (err) {
            console.error("[TREE DETAILS MODAL ERROR]", err);
          }
        });
      }

      const releaseBtn = card.querySelector(".release-btn");
      if (releaseBtn instanceof HTMLButtonElement) {
        releaseBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          try {
            if (typeof (window as any).openSellModal === "function") {
              (window as any).openSellModal(treeId, sharesOwned);
            } else {
              alert("Liquidation system component is currently loading or offline.");
            }
          } catch (err) {
            console.error("[SELL MODAL INITIALIZATION ERROR]", err);
          }
        });
      }

      container.appendChild(card);
    } catch (renderErr) {
      console.error("[TREE CARD RENDER FAILURE]", renderErr);
    }
  }
}

/* =========================================================
   SHARE CONTROLS
========================================================= */

(window as any).syncFromSlider = () => {
  const slider = document.getElementById("shareSlider") as HTMLInputElement | null;
  const hiddenInput = document.getElementById("shareInput") as HTMLInputElement | null;
  if (!slider || !hiddenInput) return;
  hiddenInput.value = slider.value;
  (window as any).updateShares();
};

function getValidSharesAmount(val: number): number {
  const slider = document.getElementById("shareSlider") as HTMLInputElement | null;
  if (!slider) return val;
  const min = Number(slider.min) || 1;
  const max = Number(slider.max) || 1000;
  return Math.max(min, Math.min(max, val));
}

(window as any).changeShares = (delta: number) => {
  const hiddenInput = document.getElementById("shareInput") as HTMLInputElement | null;
  const slider = document.getElementById("shareSlider") as HTMLInputElement | null;
  if (!hiddenInput) return;
  let current = Number(hiddenInput.value) || 1;
  let nextAmount = getValidSharesAmount(current + delta);
  hiddenInput.value = nextAmount.toString();
  if (slider) slider.value = nextAmount.toString();
  (window as any).updateShares();
};

window.setFilter = function(type: string) {
  console.log("Filter switched:", type);
  const event = new CustomEvent("olivium:filter", { detail: { type } });
  window.dispatchEvent(event);
};

(window as any).setShares = (amount: number | string) => {
  const hiddenInput = document.getElementById("shareInput") as HTMLInputElement | null;
  const slider = document.getElementById("shareSlider") as HTMLInputElement | null;
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

let cachedSolPrice = 100;
let lastPriceFetch = 0;

async function getSolPriceEUR(): Promise<number> {
  const now = Date.now();
  if (now - lastPriceFetch < 60000) {
    return cachedSolPrice;
  }
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=eur");
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
  return cachedSolPrice;
}

(window as any).updateShares = async () => {
  const hiddenInput = document.getElementById("shareInput") as HTMLInputElement | null;
  const shareValueDisplay = document.getElementById("shareValue");
  const priceDisplay = document.getElementById("priceDisplay");
  const priceSub = document.getElementById("priceSub");
  const adoptBtn = document.getElementById("adoptBtn") as HTMLButtonElement | null;
  const connectBtn = document.getElementById("adoptConnectBtn") as HTMLButtonElement | null;

  if (!hiddenInput) return;

  const provider = (window as any)._provider || (window as any).provider;
  const pubKey = provider?.wallet?.publicKey || (window as any).walletPubKey;
  const shares = Number(hiddenInput.value) || 1;
  const euroPerShare = 12.40;
  const totalEuro = shares * euroPerShare;
  const solPrice = await getSolPriceEUR();
  const totalSol = totalEuro / solPrice;

  const starterSolEl = document.getElementById("starter-sol-price");
  const keeperSolEl = document.getElementById("keeper-sol-price");
  const fullTreeSolEl = document.getElementById("fulltree-sol-price");
  const starterShares = 10;
  const keeperShares = 100;
  const fullTreeShares = 1000;
  const starterSol = (starterShares * euroPerShare) / solPrice;
  const keeperSol = (keeperShares * euroPerShare) / solPrice;
  const fullTreeSol = (fullTreeShares * euroPerShare) / solPrice;

  if (starterSolEl) starterSolEl.innerText = `~${starterSol.toFixed(2)} SOL`;
  if (keeperSolEl) keeperSolEl.innerText = `~${keeperSol.toFixed(2)} SOL`;
  if (fullTreeSolEl) fullTreeSolEl.innerText = `~${fullTreeSol.toFixed(2)} SOL`;

  const isCryptoMode = paymentMode === "crypto";
  const isSoldOut = adoptBtn?.innerText === "Sold Out";

  if (shareValueDisplay) shareValueDisplay.innerText = shares.toLocaleString();
  if (priceDisplay) {
    if (isCryptoMode) {
      priceDisplay.innerHTML = `◎ ${totalSol.toFixed(2)} <span style="font-size:0.6em;font-weight:normal;">SOL</span>`;
    } else {
      priceDisplay.innerText = `€${totalEuro.toLocaleString()}`;
    }
  }
  if (priceSub) {
    if (isCryptoMode) {
      priceSub.innerText = `${shares} share${shares > 1 ? "s" : ""} × ◎ ${(euroPerShare / solPrice).toFixed(4)} SOL`;
    } else {
      priceSub.innerText = `${shares} share${shares > 1 ? "s" : ""} × €${euroPerShare}`;
    }
  }

  if (isCryptoMode && !isSoldOut) {
    if (pubKey) {
      if (connectBtn) connectBtn.style.display = "none";
      if (adoptBtn) {
        adoptBtn.style.display = "block";
        adoptBtn.innerText = "Continue to Agreement";
      }
    } else {
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
              localStorage.setItem("olivium_identity", JSON.stringify({ type: "wallet", wallet: pubKeyStr, source: "solana" }));
              window.walletPubKey = resp.publicKey || provider.publicKey;
              window.dispatchEvent(new Event("solana:connection-complete"));
            }
          } catch (err) {
            console.error("[adoptModal] wallet connect failed:", err);
          }
          await (window as any).updateShares();
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

/* =========================================================
   MODAL
========================================================= */

(window as any).openModal = (tree: Tree) => {
  if (!tree) return;
  selectedTree = tree;
  const modal = document.getElementById("modalOverlay");
  if (!modal) return;
  document.body.style.overflow = "hidden";
  paymentMode = "mollie";
  document.querySelectorAll(".payment-option").forEach((el) => el.classList.remove("active"));
  document.getElementById("mollieOption")?.classList.add("active");
  const total = tree.total_shares || 1000;
  const sold = tree.shares_sold || 0;
  const available = total - sold;
  const title = document.getElementById("modalTitle");
  if (title) title.innerText = tree.name || tree.tree_id;
  const desc = document.getElementById("modalDescription");
  if (desc) desc.innerText = tree.description || "Secure your digital olive tree adoption.";
  const modalImg = document.getElementById("modalImage") as HTMLImageElement | null;
  if (modalImg) {
    const fallback = randomFallback();
    modalImg.src = tree.image_url || fallback;
    modalImg.onerror = () => { modalImg.src = fallback; };
  }
  const shareInput = document.getElementById("shareInput") as HTMLInputElement | null;
  const slider = document.getElementById("shareSlider") as HTMLInputElement | null;
  const sliderMaxLabel = document.getElementById("sliderMaxLabel");
  if (shareInput) {
    shareInput.value = available <= 0 ? "0" : "1";
    shareInput.dataset.max = available.toString();
  }
  if (slider) {
    slider.min = available <= 0 ? "0" : "1";
    slider.max = available.toString();
    slider.value = available <= 0 ? "0" : "1";
  }
  if (sliderMaxLabel) sliderMaxLabel.textContent = available.toString();
  const maxBtn = document.getElementById("maxShareBtn");
  if (maxBtn) maxBtn.textContent = `Max (${available})`;
  const adoptBtn = document.getElementById("adoptBtn") as HTMLButtonElement | null;
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
  if (modal) modal.style.display = "none";
  document.body.style.overflow = "";
  const shareInput = document.getElementById("shareInput") as HTMLInputElement | null;
  const slider = document.getElementById("shareSlider") as HTMLInputElement | null;
  const shareValue = document.getElementById("shareValue");
  if (shareInput) shareInput.value = "1";
  if (slider) slider.value = "1";
  if (shareValue) shareValue.textContent = "1";
};

/* =========================================================
   AGREEMENT MODAL
========================================================= */

(window as any).openAgreement = () => {
  if (!selectedTree) return;
  document.body.style.overflow = "hidden";
  const agreeImg = document.getElementById("agreeImage") as HTMLImageElement | null;
  const fallback = randomFallback();
  if (agreeImg) {
    agreeImg.src = selectedTree.image_url || fallback;
    agreeImg.onerror = () => { agreeImg.src = fallback; };
  }
  const agreeTitle = document.getElementById("agreeTitle");
  if (agreeTitle) agreeTitle.innerText = `Adopting ${selectedTree.name || selectedTree.tree_id}`;
  const loc = document.getElementById("agreeLocation");
  const age = document.getElementById("agreeAge");
  const height = document.getElementById("agreeHeight");
  const variety = document.getElementById("agreeVariety");
  if (loc) loc.innerText = selectedTree.location || "Field F1";
  if (age) age.innerText = selectedTree.age || "5";
  if (height) height.innerText = selectedTree.height || "1.5m";
  if (variety) variety.innerText = selectedTree.variety || "Frantoio";
  const check = document.getElementById("agreeCheckbox") as HTMLInputElement | null;
  const finalBtn = document.getElementById("finalConfirmBtn") as HTMLButtonElement | null;
  if (check && finalBtn) {
    check.checked = false;
    finalBtn.disabled = true;
    finalBtn.innerText = "Confirm & Pay";
    check.onchange = () => { finalBtn.disabled = !check.checked; };
  }
  const selectionModal = document.getElementById("modalOverlay");
  const agreementModal = document.getElementById("agreementModal");
  if (selectionModal) selectionModal.style.display = "none";
  if (agreementModal) agreementModal.style.display = "flex";
};

(window as any).closeAgreement = () => {
  const agreementModal = document.getElementById("agreementModal");
  const selectionModal = document.getElementById("modalOverlay");
  if (agreementModal) agreementModal.style.display = "none";
  if (selectionModal) selectionModal.style.display = "flex";
};

/* =========================================================
   SUCCESS MODAL
========================================================= */

(window as any).closeSuccess = () => {
  const successModal = document.getElementById("successModal");
  if (successModal) successModal.style.display = "none";
  document.body.style.overflow = "";
};

/* =========================================================
   FIAT TX
========================================================= */

async function startMollieCheckout() {
  console.log("MOLLIE BUY");
  try {
    const shares = Number((document.getElementById("shareInput") as HTMLInputElement).value);
    const response = await fetch("http://localhost:3000/create-mollie-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shares,
        treeId: selectedTree?.tree_id,
        treeName: selectedTree?.name,
        userEmail: window.OliviumAuth?.user?.email || null
      }),
    });
    const data = await response.json();
    if (data.checkoutUrl) {
      window.location.href = data.checkoutUrl;
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
  const buyerPublicKey = provider.wallet?.publicKey || provider.publicKey;
  if (!buyerPublicKey) {
    alert("Could not resolve signing authority public key.");
    return;
  }

  try {
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

    let signature = "";
    if (provider.wallet && typeof provider.wallet.signTransaction === "function") {
      const signedTx = await provider.wallet.signTransaction(transaction);
      signature = await connection.sendRawTransaction(signedTx.serialize());
    } else if (typeof provider.signTransaction === "function") {
      const signedTx = await provider.signTransaction(transaction);
      signature = await connection.sendRawTransaction(signedTx.serialize());
    } else {
      signature = await program.provider.sendAndConfirm(transaction, []);
    }

    await connection.confirmTransaction(signature, "confirmed");

    const agreementModal = document.getElementById("agreementModal");
    const successModal = document.getElementById("successModal");

    if (agreementModal) agreementModal.style.display = "none";
    if (successModal) successModal.style.display = "flex";

    if (finalBtn) {
      delete finalBtn.dataset.processing;
    }

    loadTrees();
  } catch (err) {
    console.error("Transaction Error:", err);
    alert("Transaction failed. Check wallet balance or signing approval authorization window.");
    if (finalBtn) {
      finalBtn.disabled = false;
      delete finalBtn.dataset.processing;
      finalBtn.innerText = "Confirm & Pay";
    }
  }
};

/* =========================================================
   ESCAPE KEY
========================================================= */

window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const agreementModal = document.getElementById("agreementModal");
  const selectionModal = document.getElementById("modalOverlay");
  if (agreementModal && agreementModal.style.display === "flex") {
    (window as any).closeAgreement();
  } else if (selectionModal && selectionModal.style.display === "flex") {
    (window as any).closeModal();
  }
});

export function getActiveWallet(): string | null {
  try {
    const raw = localStorage.getItem("olivium_identity");
    if (!raw) return null;
    const i = JSON.parse(raw);
    if (i.type === "wallet") return i.wallet || null;
    if (i.type === "email") return i.custodialWallet || null;
  } catch (_) {}
  return null;
}

/* =========================================================
   LOAD USER TREE POSITIONS
========================================================= */

(window as any).loadUserTreePositions = async function () {
  const program = (window as any)._program;
  if (!program) {
    console.log("[POSITIONS] No program - returning empty array");
    return [];
  }
  const identity = JSON.parse(localStorage.getItem("olivium_identity") || "null");
  if (!identity) {
    console.log("[POSITIONS] Guest mode detected");
    return [];
  }

  const fallbackWalletAddress = Wallet();
  let checkingPublicKey: PublicKey | null = null;

  if (fallbackWalletAddress) {
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

    const [allPositions, allTrees] = await Promise.all([getAllPositions(), getTrees()]);

    if (allPositions.length > 0) {
      console.log("[POSITIONS DEBUG] Structure sample of position account schema:", allPositions[0].account);
    }

    let totalStakedOlv = 0;
    try {
      const [stakePda] = PublicKey.findProgramAddressSync([Buffer.from("stake"), checkingPublicKey.toBuffer()], program.programId);
      const stakeAccount = await program.account.stakeAccount.fetch(stakePda);
      totalStakedOlv = (stakeAccount.amount?.toNumber() || 0) / 1_000_000_000;
    } catch (e) {
      console.log("[POSITIONS] No StakeAccount found for this user.");
    }

    const positions = allPositions
      .filter((pos: any) => {
        const acc = pos.account;
        const rawAuthority = acc.authority || acc.owner || acc.wallet || acc.user;
        if (!rawAuthority) return false;
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
        const tree = allTrees.find((t: any) => t.account.treeId.toString() === acc.treeId.toString());
        return {
          treeId: acc.treeId.toString(),
          sharesOwned: acc.sharesOwned?.toNumber() || acc.sharesOwned || 0,
          treeName: tree?.account.name || "Unknown",
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

/* =========================================================
   CLEAR ALL USER UI AND STATES - FIXED FOR CLEAN STATE
========================================================= */

async function clearAllUserUiAndStates() {
  console.log("🧹 [TEARDOWN] Beginning complete profile state scrub...");

  // Clear all caches
  (window as any).positionsCache = null;
  (window as any).positionsPromise = null;
  (window as any).treesCache = null;
  (window as any).treesPromise = null;
  if ('positionsCache' in window) { (window as any).positionsCache = null; }
  if ('positionsPromise' in window) { (window as any).positionsPromise = null; }

  // Reset global state
  if ((window as any).walletState) {
    (window as any).walletState.connected = false;
    (window as any).walletState.pubkey = null;
  }
  (window as any).walletPubKey = null;
  (window as any)._provider = null;
  window.OliviumIdentity = { type: "guest" };

  // Clear localStorage
  localStorage.removeItem("olivium_identity");
  localStorage.removeItem("olivium_user");
  localStorage.removeItem("walletConnected");

  // Reset UI metrics
  const treeCountStat = document.getElementById("treeCountStat");
  const shareCountStat = document.getElementById("shareCountStat");
  const grovePositionStat = document.getElementById("grovePositionStat");
  const identityTypeStat = document.getElementById("identityTypeStat");
  const identityPill = document.getElementById("identityPill");
  const connectBtn = document.getElementById("connectBtn");

  if (treeCountStat) treeCountStat.innerText = "--";
  if (shareCountStat) shareCountStat.innerText = "--";
  if (grovePositionStat) grovePositionStat.innerText = "0";
  if (identityTypeStat) identityTypeStat.innerText = "Guest";
  if (identityPill) identityPill.innerHTML = "🌿 Guest Mode";
  if (connectBtn) {
    connectBtn.innerText = "Connect Profile";
    connectBtn.style.color = "white";
    connectBtn.style.border = "";
    connectBtn.style.background = "var(--green)";
  }

  console.log("📊 [TEARDOWN] Metric counters cleared. Refreshing layout components...");

  try {
    if (typeof window.refreshIdentityUI === 'function') {
      window.refreshIdentityUI();
    }
    if (typeof (window as any).updateStatsUI === 'function') {
      await (window as any).updateStatsUI();
    }
    if (typeof (window as any).updateVillaStayUI === 'function') {
      await (window as any).updateVillaStayUI();
    }
    if (typeof (window as any).loadTrees === 'function') {
      await (window as any).loadTrees("all");
    }
    console.log("✨ [TEARDOWN] UI scrub complete. Application is in pristine read-only mode.");
  } catch (err) {
    console.error("Encountered an anomaly during component re-rendering cycles:", err);
  }
}

(window as any).resetProfileAndUI = clearAllUserUiAndStates;
window.addEventListener("olivium:disconnected", async () => {
  await clearAllUserUiAndStates();
});

/* =========================================================
   VILLA STAY UI HYDRATION & LOYALTY UPDATER
========================================================= */

export async function updateVillaStayUI() {
  console.log("🏨 Syncing real on-chain assets with villa_stay view...");

  const sharesCountDisplay = document.getElementById("shares-count-display");
  const creditsCountDisplay = document.getElementById("credits-count-display");
  const tierName = document.getElementById("tier-name");
  const tierProgressText = document.getElementById("tier-progress-text");
  const nextTierLabel = document.getElementById("next-tier-label");
  const tierPercentLabel = document.getElementById("tier-percent-label");
  const tierProgressBar = document.getElementById("tier-progress-bar");
  const tierIcon = document.getElementById("tier-icon");
  const cardTier1 = document.getElementById("card-tier-1");
  const cardTier2 = document.getElementById("card-tier-2");
  const cardTier3 = document.getElementById("card-tier-3");
  const perkGov = document.getElementById("perk-gov");
  const perkShipping = document.getElementById("perk-shipping");
  const perkDiscount = document.getElementById("perk-discount");
  const perkStay = document.getElementById("perk-stay");
  const patronDiscountBadge = document.getElementById("patronDiscountBadge");
  const bookingRateDisplay = document.getElementById("bookingRateDisplay");

  const identity = JSON.parse(localStorage.getItem("olivium_identity") || "null");
  const guestMode = !identity;

  if (guestMode) {
    if (sharesCountDisplay) sharesCountDisplay.innerHTML = `0 <span class="text-xs text-gold font-mono block mt-1">Nodes Detected</span>`;
    if (creditsCountDisplay) creditsCountDisplay.innerHTML = `00 <span class="text-xs text-gold font-mono block mt-1">Sanctuary Days</span>`;
    if (tierName) tierName.innerText = "Guest Mode";
    if (tierProgressText) tierProgressText.innerText = "Please log in to query chain states";
    if (patronDiscountBadge) patronDiscountBadge.innerText = "Standard Account";
    if (bookingRateDisplay) bookingRateDisplay.innerText = "$450 USD / Nightly standard baseline";
    [cardTier1, cardTier2, cardTier3, perkGov, perkShipping, perkDiscount, perkStay].forEach(el => {
      if (el) { el.classList.remove("opacity-100"); el.classList.add("opacity-40"); }
    });
    return;
  }

  try {
    await waitForProgram();
    const positions = await (window as any).loadUserTreePositions?.();
    const walletAddr = Wallet();

    let totalSharesOwned = 0;
    let totalCredits = 0;

    if (positions && positions.length > 0) {
      totalSharesOwned = positions.reduce((sum, p) => sum + p.sharesOwned, 0);
    }

    if (walletAddr) {
      try {
        const { data: userData, error } = await sb.from('users').select('credits').eq('wallet', walletAddr).maybeSingle();
        if (userData && !error) {
          totalCredits = userData.credits || 0;
        }
      } catch (err) {
        console.warn('Failed to fetch user credits from Supabase:', err);
      }
    }

    if (sharesCountDisplay) {
      sharesCountDisplay.innerHTML = `${totalSharesOwned.toLocaleString()} <span class="text-xs text-gold font-mono block mt-1">Nodes Detected</span>`;
    }
    if (creditsCountDisplay) {
      creditsCountDisplay.innerHTML = `${totalCredits} <span class="text-xs text-gold font-mono block mt-1">Sanctuary Days</span>`;
    }

    let currentTier = "Standard Account";
    let nextTier = "Seed Supporter";
    let progressPercent = 0;
    let iconEmoji = "🫒";
    let progressLabelText = "";

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

    if (tierName) tierName.innerText = currentTier;
    if (tierIcon) tierIcon.innerText = iconEmoji;
    if (tierProgressText) tierProgressText.innerText = progressLabelText;
    if (nextTierLabel) nextTierLabel.innerText = `Next: ${nextTier}`;
    if (tierPercentLabel) tierPercentLabel.innerText = `${progressPercent}%`;
    if (tierProgressBar) tierProgressBar.style.width = `${progressPercent}%`;

    let pricingTierLabel = "Standard Account";
    let calculatedRateString = "$450 USD / Nightly standard baseline";

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

/* =========================================================
   GLOBAL EXPORTS
========================================================= */

(window as any).updateVillaStayUI = updateVillaStayUI;
(window as any).updateStatsUI = updateStatsUI;
(window as any).updateWalletUI = updateWalletUI;
(window as any).getAllPositions = getAllPositions;
(window as any).loadTrees = loadTrees;
(window as any).Wallet = Wallet;

/* =========================================================
   DOM INITIALIZATION - COMPLETE CLEAN STATE RESET
========================================================= */

window.addEventListener("DOMContentLoaded", async () => {
  console.log("[INIT] Hard resetting to CLEAN state...");
  
  // COMPLETELY CLEAR ALL CACHES AND STORAGE
  localStorage.removeItem("olivium_identity");
  localStorage.removeItem("olivium_user");
  localStorage.removeItem("walletConnected");
  
  // CLEAR MEMORY CACHES
  window.positionsCache = null;
  window.positionsPromise = null;
  window.treesCache = null;
  window.treesPromise = null;
  window._provider = null;
  window.walletPubKey = null;
  (window as any).walletState = { connected: false, pubkey: null };
  window.OliviumIdentity = { type: "guest" };
  
  if (window.OliviumAuth) {
    window.OliviumAuth.user = null;
  }
  
  // RESET UI METRICS IMMEDIATELY
  const treeCountStat = document.getElementById("treeCountStat");
  const shareCountStat = document.getElementById("shareCountStat");
  const grovePositionStat = document.getElementById("grovePositionStat");
  const identityTypeStat = document.getElementById("identityTypeStat");
  const identityPill = document.getElementById("identityPill");
  const connectBtn = document.getElementById("connectBtn");
  
  if (treeCountStat) treeCountStat.innerText = "--";
  if (shareCountStat) shareCountStat.innerText = "--";
  if (grovePositionStat) grovePositionStat.innerText = "0";
  if (identityTypeStat) identityTypeStat.innerText = "Guest";
  if (identityPill) identityPill.innerHTML = "🌿 Guest Mode";
  
  if (connectBtn) {
    connectBtn.innerText = "Connect Profile";
    connectBtn.style.color = "white";
    connectBtn.style.border = "";
    connectBtn.style.background = "var(--green)";
  }
  
  // CLEAR ANY ACTIVE FILTER HIGHLIGHTS
  const filterButtons = document.querySelectorAll(".filter-btn");
  filterButtons.forEach(btn => btn.classList.remove("active"));
  const allFilter = document.querySelector('.filter-btn[data-filter="all"]');
  if (allFilter) allFilter.classList.add("active");
  
  // FORCE REFRESH TREES DISPLAY (NOT USING CACHE)
  console.log("[INIT] Loading fresh trees from blockchain...");
  
  // Initialize UI components
  initFilters();
  
  // Load wallet and data from cache/providers
  initWalletOnLoad();
  
  // Load trees after all initialization
  await loadTrees("all");
  
  // Update all UI components
  await updateWalletUI();
  await updateStatsUI();
  await updateVillaStayUI();
  
  // Setup payment options
  document.querySelectorAll(".payment-option").forEach((option) => {
    option.addEventListener("click", () => {
      document.querySelectorAll(".payment-option").forEach((el) => el.classList.remove("active"));
      option.classList.add("active");
      paymentMode = option.getAttribute("data-payment") as "mollie" | "paypal" | "crypto";
      console.log("PAYMENT MODE:", paymentMode);
      (window as any).updateShares?.();
    });
  });
  
  // Setup final confirm button
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
      (window as any).processBlockchainTx();
      return;
    }
  });
  
  console.log("[INIT] Clean state initialized successfully");
});

// Handle solana connection event
window.addEventListener("solana:connection-complete", async () => {
  const connected = (window as any).walletState?.connected;
  if (!connected) {
    console.log("[SYNC EVENT] Ignored because wallet is disconnected.");
    return;
  }
  console.log("[SYNC EVENT] Blockchain initialized. Regenerating all UI components...");
  await updateWalletUI();
  await updateStatsUI();
  await updateVillaStayUI();
  
  const activeFilter = document.querySelector(".filter-btn.active") as HTMLElement | null;
  if (activeFilter && activeFilter.dataset.filter === "my") {
    const positions = await (window as any).loadUserTreePositions?.();
    if (positions && positions.length > 0) {
      renderMyTreesFromPositions(positions);
    }
  }
});
