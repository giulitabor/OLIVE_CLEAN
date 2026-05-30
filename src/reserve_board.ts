import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { sb } from "./connection";

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
   WAIT FOR PROGRAM (IMPROVED)
========================================================= */

async function waitForProgram(timeout = 10000): Promise<any> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const program = (window as any)._program;
    if (program) {
      console.log("[PROGRAM] Found program instance");
      return program;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  
  console.warn("[PROGRAM] Timeout waiting for program");
  return null;
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
        const program = await waitForProgram();
        if (!program) {
          console.warn("[TREES] No program available");
          return [];
        }
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

  const program = await waitForProgram();
  if (!program) {
    console.warn("[POSITIONS] No program available");
    return [];
  }

  console.log("[RPC] 🛰️ Initiating single network query for all position accounts...");

  positionsPromise = program.account.sharePosition.all()
    .then((data) => {
      positionsCache = data;
      cacheTimestamp = Date.now();
      return data;
    })
    .catch((err) => {
      console.error("[POSITIONS] Fetch error:", err);
      positionsPromise = null;
      return [];
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
  const provider = (window as any)._provider;
  const pubKey =
    provider?.wallet?.publicKey ||
    provider?.publicKey ||
    (window as any).solana?.publicKey ||
    (window as any).walletPubKey ||
    null;

  if (pubKey) return pubKey.toString();

  try {
    const cached = localStorage.getItem("olivium_identity");
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.type === "wallet" && parsed.wallet) {
        return parsed.wallet;
      }
      if (parsed.type === "email" && parsed.custodialWallet) {
        return parsed.custodialWallet;
      }
    }
  } catch (e) {
    console.error("Failed reading cached identity:", e);
  }

  return null;
}

function getIdentity(): { type: string; wallet?: string; custodialWallet?: string } {
  try {
    const cached = localStorage.getItem("olivium_identity");
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (e) {
    console.error("Failed to parse identity:", e);
  }
  return { type: "guest" };
}

/* ==========================================================================
   SELL & DETAIL MODAL CONTROLLER BINDINGS
   ========================================================================== */

let activeSellTreeId: string | null = null;
let maxAvailableSellShares = 0;

(window as any).openSellModal = (treeId: string, currentShares: number) => {
  console.log(`[SELL MODAL] Opening for: ${treeId}`);
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
    alert("Please specify a valid quantity within ownership bounds.");
    return;
  }

  try {
    submitBtn.disabled = true;
    submitBtn.textContent = "Processing Block...";
    await (window as any).sellShares(activeSellTreeId, amountToSell);
    closeSellModal();
  } catch (err: any) {
    console.error("[LIQUIDATION ERROR]", err);
    alert(err.message || "Transaction failed");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Confirm Liquidation";
    }
  }
}
(window as any).confirmSellAction = confirmSellAction;

/* =========================================================
   SELL SHARES — on-chain transaction
========================================================= */
(window as any).sellShares = async (treeId: string, sharesToSell: number): Promise<void> => {
  const program = await waitForProgram();
  const protocol = (window as any)._protocol;
  const walletPubKey = (window as any).walletPubKey ?? (window as any).wallet?.publicKey;

  if (!program) throw new Error("Program not initialized. Connect wallet first.");
  if (!walletPubKey) throw new Error("No wallet connected.");
  if (!protocol) throw new Error("Protocol not initialized.");

  if (sharesToSell <= 0) throw new Error("Share amount must be greater than zero.");

  const [protocolPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("protocol")],
    program.programId
  );
  const [treePda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("tree"), Buffer.from(treeId)],
    program.programId
  );
  const [positionPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("position"), walletPubKey.toBuffer(), Buffer.from(treeId)],
    program.programId
  );
  const treasuryPda = protocol.treasury;

  console.log("⚡ [sellShares] Sending transaction...", { treeId, sharesToSell });

  let tx: string;
  try {
    tx = await program.methods
      .sellShares(treeId, new anchor.BN(sharesToSell))
      .accounts({
        tree: treePda,
        position: positionPda,
        protocol: protocolPda,
        treasury: treasuryPda,
        seller: walletPubKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    console.log(`✅ [sellShares] Confirmed: ${tx}`);
  } catch (rpcErr: any) {
    if (rpcErr.toString().includes("already been processed")) {
      console.warn("⚠️ Transaction already processed.");
      tx = "PROCESSED_ON_CHAIN";
    } else {
      throw rpcErr;
    }
  }

  if (typeof (window as any).refreshUserGrove === "function") await (window as any).refreshUserGrove();
  if (typeof (window as any).loadTrees === "function") await (window as any).loadTrees();
  if (typeof (window as any).updateStatsUI === "function") await (window as any).updateStatsUI();
};

async function updateWalletUI() {
  const wallet = Wallet();
  walletState.connected = !!wallet;
  walletState.pubkey = wallet;
  window.OliviumIdentity = wallet ? { type: "wallet", wallet } : { type: "guest" };
  
  if (typeof (window as any).refreshIdentityUI === 'function') {
    await (window as any).refreshIdentityUI();
  }
}

async function updateStatsUI() {
  const treeCount = document.getElementById("treeCountStat");
  const shareCount = document.getElementById("shareCountStat");
  const groveCount = document.getElementById("grovePositionStat");

  const wallet = Wallet();

  if (!wallet) {
    try {
      const program = await waitForProgram();
      if (program) {
        const allTrees = await getTrees();
        if (treeCount) treeCount.innerText = String(allTrees ? allTrees.length : 0);
      } else {
        if (treeCount) treeCount.innerText = "--";
      }
    } catch (e) {
      if (treeCount) treeCount.innerText = "--";
    }
    if (shareCount) shareCount.innerText = "--";
    if (groveCount) groveCount.innerText = "0";
    return;
  }

  try {
    const program = await waitForProgram();
    if (!program) {
      console.warn("[STATS] No program available");
      return;
    }

    const [allTrees, positions] = await Promise.all([
      getTrees(),
      (window as any).loadUserTreePositions?.()
    ]);

    if (!positions) return;

    const totalTreesOnChain = allTrees ? allTrees.length : 0;
    const userUniqueTreesCount = new Set(positions.map((p: any) => p.treeId)).size;
    const totalSharesCount = positions.reduce((s: number, p: any) => s + p.sharesOwned, 0);

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
  if (identityEl) identityEl.innerText = data?.wallet ? `${data.wallet.slice(0,4)}...${data.wallet.slice(-4)}` : "Guest";
  if (positionsEl) positionsEl.innerText = String(data?.positions || 0);
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

/* =========================================================
   LOAD TREES (FIXED)
========================================================= */

async function loadTrees(filter = "all") {
  const container = document.getElementById("treeGrid");
  if (!container) return;

  container.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>🌿 Syncing live grove availability...</p></div>`;

  const program = await waitForProgram();
  if (!program) {
    container.innerHTML = `<p style="padding:40px;text-align:center;">Waiting for connection...</p>`;
    return;
  }

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

  try {
    console.log("[RPC] Fetching all tree accounts...");
    onChainTrees = await program.account.tree.all();
    console.log(`[RPC] Fetched ${onChainTrees.length} trees`);

    if (typeof (window as any).loadUserTreePositions === "function") {
      userPositions = await (window as any).loadUserTreePositions();
    }
  } catch (err) {
    console.error("On-chain fetch failed:", err);
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

    const user = (window as any).OliviumAuth?.user;
    const myWalletOrEmail = user?.email || user?.id;
    const matchesFiatOwnership = myWalletOrEmail ? dbTree.owner === myWalletOrEmail || dbTree.user_email === myWalletOrEmail : false;

    const matchedPosition = userPositions.find((p) => String(p.treeId) === String(dbTree.tree_id));
    const ownedShares = matchedPosition ? matchedPosition.sharesOwned || 0 : 0;
    const isMine = matchesFiatOwnership || ownedShares > 0;

    if (!isLiveOnChain && filter !== "all") continue;
    if (filter === "my" && !isMine) continue;
    if (filter !== "all" && filter !== "my" && filter !== status) continue;

    const available = totalShares - sharesSold;
    const displayImg = dbTree.image_url || "https://raw.githubusercontent.com/kyngrick/olivium_photos/main/olivium_logo2.png";

    const card = document.createElement("div");
    card.className = "tree-card";
    if (sharesSold > 0) card.classList.add("has-sales");
    if (percent >= 90) card.style.border = "2px solid #d94d4d";
    else if (percent >= 60) card.style.border = "2px solid #d7a728";

    card.innerHTML = `
      <img class="tree-image" src="${displayImg}" />
      <div class="tree-content">
        <div class="tree-name">${dbTree.name || dbTree.tree_id}</div>
        <div class="tree-meta"><span>${available} shares left</span><span>${percent}% adopted</span></div>
        <div class="availability">
          <div class="availability-label"><span>${sharesSold} / ${totalShares} sold</span></div>
          <div class="progress-bar"><div class="progress-fill" style="width:${percent}%"></div></div>
          <div class="shares-left">${available > 0 ? "Available now" : "Fully adopted"}</div>
        </div>
        ${isLiveOnChain ? `<div class="live-badge">⛓ LIVE ON-CHAIN</div>` : ""}
        <div class="card-actions" style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; width: 100%;">
          <button class="action-btn details-btn" style="flex:1;min-width:70px;padding:8px;background:#B8860B;color:white;border:none;border-radius:6px;cursor:pointer;">Details</button>
          ${available > 0 ? `<button class="action-btn adopt-btn" style="flex:1;padding:8px;background:#556B2F;color:white;border:none;border-radius:6px;cursor:pointer;">Adopt</button>` : ""}
          ${isMine ? `<button class="action-btn release-btn" style="flex:1;padding:8px;background:#d94d4d;color:white;border:none;border-radius:6px;cursor:pointer;">Release Shares</button>` : ""}
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
      }
    });

    card.querySelector(".release-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (typeof (window as any).openSellModal === "function") {
        (window as any).openSellModal(dbTree.tree_id, ownedShares || 10);
      }
    });

    container.appendChild(card);
  }
}

// Make loadTrees available globally
(window as any).loadTrees = loadTrees;
(window as any)._loadTreesImpl = loadTrees;

// Export for module usage
export { loadTrees };

// Continue with the rest of your existing functions...
// (openTreeDetailModal, fetchFieldSensors, populateSensorUI, fetchOpenMeteo, 
// populateWeatherUI, closeTreeDetailModal, switchTreeDetailTab, initFilters, 
// handleDisconnectReset, openModal, closeModal, etc.)

// Make sure to also export these at the bottom:
(window as any).updateStatsUI = updateStatsUI;
(window as any).updateWalletUI = updateWalletUI;
(window as any).getAllPositions = getAllPositions;
(window as any).Wallet = Wallet;
