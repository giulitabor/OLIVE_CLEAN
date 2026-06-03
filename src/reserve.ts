import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { sb, connection, getIdentity, isConnected, connectWallet, disconnectWallet } from "./connection.ts";

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

// ============================================================
// WAIT FOR PROGRAM
// ============================================================

async function waitForProgram() {
  let attempts = 0;
  while (!(window as any)._program && attempts < 20) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    attempts++;
  }
  return (window as any)._program;
}

// ============================================================
// HELPERS - SINGLE Wallet() FUNCTION
// ============================================================

let treesCache: any[] | null = null;
let treesPromise: Promise<any[]> | null = null;

export async function getTrees() {
  if (treesCache) return treesCache;
  if (treesPromise) return treesPromise;

  treesPromise = (async () => {
    console.log("🌳 Fetching trees ONCE");
    const prog = await waitForProgram();
    if (!prog) return [];
    const result = await prog.account.tree.all();
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
  if (positionsPromise) return positionsPromise;

  const prog = await waitForProgram();
  if (!prog) return [];

  positionsPromise = prog.account.sharePosition.all()
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

// SINGLE Wallet() FUNCTION - uses getIdentity() from connection.ts
function Wallet(): string | null {
  const identity = getIdentity();
  if (identity.walletAddress) return identity.walletAddress;
  
  // Fallback for backward compatibility
  try {
    const cached = localStorage.getItem("olivium_identity");
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.type === "wallet" && parsed.wallet) return parsed.wallet;
      if (parsed.type === "email" && parsed.custodialWallet) return parsed.custodialWallet;
    }
  } catch (e) {
    console.error("Failed reading cached identity:", e);
  }
  return null;
}

// ============================================================
// SELL MODAL
// ============================================================

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
  payoutDisplay.textContent = `${(euroVal / solPrice).toFixed(3)} SOL`;
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

  submitBtn.disabled = true;
  submitBtn.textContent = "Processing Block...";

  try {
    await (window as any).sellShares(activeSellTreeId, amountToSell);
    closeSellModal();
    // Refresh UI after successful sell
    await loadTrees();
    await updateStatsUI();
    await updateWalletUI();
  } catch (err: any) {
    console.error("[SELL ERROR]", err);
    alert("Transaction failed: " + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Confirm Liquidation";
  }
}
(window as any).confirmSellAction = confirmSellAction;

// ============================================================
// UPDATE WALLET UI - FIXED DISCONNECT
// ============================================================

async function updateWalletUI() {
  console.log("[UI] Updating wallet UI...");
  
  const connectBtn = document.getElementById("connectBtn") || document.getElementById("connectWalletBtn");
  const identityStat = document.getElementById("identityTypeStat");
  const walletWrapper = document.getElementById("walletWrapper");
  const isWalletConnected = isConnected();
  const identity = getIdentity();

  if (!connectBtn) return;

  if (isWalletConnected && identity.walletAddress) {
    // Connected state
    walletState.connected = true;
    walletState.pubkey = identity.walletAddress;

    window.OliviumIdentity = { type: "wallet", wallet: identity.walletAddress };

    // Update identity stat
    const cachedIdentity = localStorage.getItem('olivium_identity');
    let identityType = 'Wallet Mode';
    if (cachedIdentity) {
      try {
        const parsed = JSON.parse(cachedIdentity);
        if (parsed.type === 'email') identityType = 'Email Secured';
      } catch (e) {}
    }
    if (identityStat) identityStat.innerText = identityType;

    // Get truncated address
    const shortAddr = `${identity.walletAddress.slice(0, 4)}...${identity.walletAddress.slice(-4)}`;
    
    // Update button appearance
    connectBtn.style.display = "block";
    connectBtn.style.background = "transparent";
    connectBtn.style.color = "#d94d4d";
    connectBtn.style.border = "1px solid #d94d4d";
    connectBtn.innerText = `${shortAddr} (Disconnect)`;
    connectBtn.style.padding = "6px 14px";
    connectBtn.style.fontSize = "0.85rem";

    // Set disconnect handler
    connectBtn.onclick = async (e) => {
      e.preventDefault();
      console.log("[UI] Disconnect clicked");
      connectBtn.disabled = true;
      connectBtn.innerText = "Disconnecting...";
      
      try {
        await disconnectWallet();
        await updateWalletUI();
        await updateStatsUI();
        await loadTrees("all");
      } catch (err) {
        console.error("[DISCONNECT] Error:", err);
      } finally {
        connectBtn.disabled = false;
      }
    };

    // Update wallet wrapper with balance if it exists
    if (walletWrapper) {
      let solBalance = "0.00";
      try {
        const lamports = await connection.getBalance(new PublicKey(identity.walletAddress));
        solBalance = (lamports / 1_000_000_000).toFixed(2);
      } catch (err) {
        console.warn("Failed to fetch balance:", err);
      }
      walletWrapper.innerHTML = `
        <div class="wallet-balance-pill">
          <span class="sol-amount">◎ ${solBalance} SOL</span>
          <button class="nav-btn" id="connectBtn">${shortAddr} (Disconnect)</button>
        </div>
      `;
      // Re-bind the button after replacing HTML
      const newBtn = document.getElementById("connectBtn");
      if (newBtn) {
        newBtn.onclick = connectBtn.onclick;
      }
    }

  } else {
    // Disconnected / Guest state
    walletState.connected = false;
    walletState.pubkey = null;
    window.OliviumIdentity = { type: "guest" };
    if (identityStat) identityStat.innerText = "Guest";

    connectBtn.style.display = "block";
    connectBtn.style.background = "var(--green)";
    connectBtn.style.color = "white";
    connectBtn.style.border = "";
    connectBtn.innerText = "Connect Profile";
    
    connectBtn.onclick = () => {
      const connectModal = document.getElementById('connectModal');
      if (connectModal) connectModal.style.display = 'flex';
    };
  }
}

let walletState = { connected: false, pubkey: null as string | null };

// ============================================================
// STATS UI
// ============================================================

async function updateStatsUI() {
  const treeCount = document.getElementById("treeCountStat");
  const shareCount = document.getElementById("shareCountStat");
  const groveCount = document.getElementById("grovePositionStat");

  const wallet = Wallet();

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

// ============================================================
// LOAD TREES (keep your existing implementation)
// ============================================================

async function loadTrees(filter = "all") {
  const container = document.getElementById("treeGrid");
  if (!container) return;

  container.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>🌿 Syncing live grove availability...</p></div>`;

  const program = await waitForProgram();
  const { data: dbTrees, error } = await sb.from("tree_metadata").select("*").order("tree_id", { ascending: true });

  if (error || !dbTrees) {
    container.innerHTML = `<p style="padding:40px;text-align:center;">Failed to load trees.</p>`;
    return;
  }

  let onChainTrees: any[] = [];
  let userPositions: any[] = [];

  if (program) {
    try {
      onChainTrees = await program.account.tree.all();
      if (typeof (window as any).loadUserTreePositions === "function") {
        userPositions = await (window as any).loadUserTreePositions();
      }
    } catch (err) {
      console.error("On-chain fetch failed:", err);
    }
  }

  container.innerHTML = "";

  for (const dbTree of dbTrees) {
    const onChainData = onChainTrees.find(t => t.account.treeId === dbTree.tree_id);
    let sharesSold = dbTree.shares_sold || 0;
    let totalShares = dbTree.total_shares || 1000;
    let isLiveOnChain = false;

    if (onChainData) {
      isLiveOnChain = true;
      sharesSold = onChainData.account.sharesSold.toNumber();
      totalShares = onChainData.account.totalShares.toNumber();
    }

    const percent = Math.round((sharesSold / totalShares) * 100);
    const status = percent >= 100 ? "full" : "available";
    const available = totalShares - sharesSold;

    const matchedPosition = userPositions.find((p) => String(p.treeId) === String(dbTree.tree_id));
    const ownedShares = matchedPosition?.sharesOwned || 0;
    const isMine = ownedShares > 0;

    if (filter === "my" && !isMine) continue;
    if (filter !== "all" && filter !== "my" && filter !== status) continue;

    // ... rest of your card creation logic (keep as is)
    const card = document.createElement("div");
    card.className = "tree-card";
    if (sharesSold > 0) card.classList.add("has-sales");
    if (percent >= 90) card.style.border = "2px solid #d94d4d";
    else if (percent >= 60) card.style.border = "2px solid #d7a728";

    const displayImg = dbTree.image_url || "https://raw.githubusercontent.com/kyngrick/olivium_photos/main/olivium_logo2.png";

    card.innerHTML = `
      <img class="tree-image" src="${displayImg}" />
      <div class="tree-content">
        <div class="tree-name">${dbTree.name || dbTree.tree_id}</div>
        <div class="tree-meta"><span>${available} shares left</span><span>${percent}% adopted</span></div>
        <div class="availability">
          <div class="progress-bar"><div class="progress-fill" style="width:${percent}%"></div></div>
          <div class="shares-left">${available > 0 ? "Available now" : "Fully adopted"}</div>
        </div>
        ${isLiveOnChain ? '<div class="live-badge">⛓ LIVE ON-CHAIN</div>' : ''}
        <div class="card-actions" style="display:flex;gap:8px;margin-top:16px;">
          <button class="action-btn details-btn" style="flex:1;padding:8px;background:#B8860B;color:white;border:none;border-radius:6px;">Details</button>
          ${available > 0 ? '<button class="action-btn adopt-btn" style="flex:1;padding:8px;background:#556B2F;color:white;border:none;border-radius:6px;">Adopt</button>' : ''}
          ${isMine ? '<button class="action-btn release-btn" style="flex:1;padding:8px;background:#d94d4d;color:white;border:none;border-radius:6px;">Release Shares</button>' : ''}
        </div>
      </div>
    `;

    card.querySelector(".details-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (typeof (window as any).openModal === "function") (window as any).openModal(dbTree);
      else if (typeof (window as any).openTreeDetailModal === "function") (window as any).openTreeDetailModal(dbTree.tree_id);
    });

    card.querySelector(".adopt-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (typeof (window as any).openModal === "function") (window as any).openModal(dbTree);
    });

    card.querySelector(".release-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (typeof (window as any).openSellModal === "function") (window as any).openSellModal(dbTree.tree_id, ownedShares || 10);
    });

    container.appendChild(card);
  }
}

// ============================================================
// SELL SHARES FUNCTION
// ============================================================

async function sellShares(treeId: string, amount: number) {
  const program = (window as any)._program;
  const identity = getIdentity();
  
  if (!program || !identity.walletAddress) {
    throw new Error("Wallet not connected");
  }

  const ownerKey = new PublicKey(identity.walletAddress);
  const [treePDA] = PublicKey.findProgramAddressSync([Buffer.from("tree"), Buffer.from(treeId)], program.programId);
  const [positionPDA] = PublicKey.findProgramAddressSync([Buffer.from("position"), ownerKey.toBuffer(), Buffer.from(treeId)], program.programId);
  const [protocolPDA] = PublicKey.findProgramAddressSync([Buffer.from("protocol")], program.programId);
  const [treasuryPDA] = PublicKey.findProgramAddressSync([Buffer.from("treasury")], program.programId);

  const tx = await program.methods
    .sellShares(treeId, new anchor.BN(amount))
    .accounts({
      tree: treePDA,
      position: positionPDA,
      protocol: protocolPDA,
      treasury: treasuryPDA,
      seller: ownerKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("[SELL] Success:", tx);
  return tx;
}
(window as any).sellShares = sellShares;

// ============================================================
// FIXED DISCONNECT RESET
// ============================================================

export function handleDisconnectReset() {
  console.log("🔄 Disconnecting identity: Purging memory caches...");
  
  (window as any).positionsCache = null;
  (window as any).positionsPromise = null;
  (window as any).treesCache = null;
  (window as any).treesPromise = null;
  
  localStorage.removeItem("olivium_user");
  if ((window as any).OliviumAuth) (window as any).OliviumAuth.user = null;
  
  const container = document.getElementById("treeGrid");
  if (container) {
    container.innerHTML = `<div style="padding:40px;text-align:center;"><h3>Identity Disconnected</h3><p>Please connect your wallet to view your grove.</p></div>`;
  }
  
  const setEl = (id: string, v: string) => { const el = document.getElementById(id); if (el) el.innerText = v; };
  setEl("shareCountStat", "--");
  setEl("grovePositionStat", "0");
  setEl("identityTypeStat", "Guest");
}

// ============================================================
// INITIALIZATION
// ============================================================

async function initWalletOnLoad() {
  const wallet = Wallet();
  await updateWalletUI();
  if (wallet) {
    console.log("[WALLET] Auto-detected:", wallet.slice(0, 8) + "...");
    window.OliviumIdentity = { type: "wallet", wallet };
    await updateStatsUI();
    await (window as any).loadUserTreePositions?.();
  } else {
    console.log("[WALLET] No wallet detected");
    await updateStatsUI();
  }
}

// Keep your existing functions: openTreeDetailModal, closeTreeDetailModal, switchTreeDetailTab,
// initFilters, openModal, closeModal, openAgreement, closeAgreement, etc.
// (They remain unchanged from your original)

// ============================================================
// EVENT LISTENERS
// ============================================================

window.addEventListener("solana:connection-complete", async () => {
  console.log("[SYNC] Connection complete - refreshing UI");
  await updateWalletUI();
  await updateStatsUI();
  await (window as any).updateVillaStayUI?.();
  
  const activeFilter = document.querySelector(".filter-btn.active") as HTMLElement;
  if (activeFilter?.dataset.filter === "my") {
    const positions = await (window as any).loadUserTreePositions?.();
    if (positions?.length) renderMyTreesFromPositions(positions);
  }
});

window.addEventListener("DOMContentLoaded", async () => {
  console.log("[INIT] Application starting...");
  initFilters();
  initPaymentSelector?.();
  initWalletOnLoad();
  await loadTrees("all");
  await updateWalletUI();
  await updateStatsUI();
  
  // Your existing payment option handlers...
});

// Make sure these are exposed
(window as any).loadTrees = loadTrees;
(window as any).updateWalletUI = updateWalletUI;
(window as any).updateStatsUI = updateStatsUI;
(window as any).disconnectWallet = disconnectWallet;
