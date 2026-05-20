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

        const result = await _program.account.tree.all();
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

async function updateWalletUI() {
  const wallet = Wallet();

  // 1. Look for the main nav button first, fall back to the modal button
  const connectBtn = document.getElementById("connectBtn") || document.getElementById("connectWalletBtn");
  const identityStat = document.getElementById("identityTypeStat");
  const walletWrapper = document.getElementById("walletWrapper");

  if (!connectBtn) return;

  if (wallet) {
    // 2. Retain all critical internal state mechanics
    walletState.connected = true;
    walletState.pubkey = wallet;

    // identity cache
    window.OliviumIdentity = {
      type: "wallet",
      wallet
    };

    // UI stats
    // Check identity type
  const cachedIdentity = localStorage.getItem('olivium_identity');
  let identityType = 'Wallet';

  if (cachedIdentity) {
    try {
      const parsed = JSON.parse(cachedIdentity);
      if (parsed.type === 'email') {
        identityType = 'Email Secured';
      } else if (parsed.type === 'wallet') {
        identityType = 'Wallet Mode';
      }
    } catch (e) {
      console.error('Failed to parse identity type:', e);
    }
  }

  if (identityStat) {
    identityStat.innerText = identityType;
  }
    // 3. Inject the live SOL balance safely into the wrapper without breaking the button node
    if (walletWrapper && walletWrapper.querySelector('#connectBtn')) {
      const pubKeyStr = typeof wallet === 'object' && wallet.publicKey ? wallet.publicKey.toBase58() : String(wallet);
      let solBalance = "0.00";

      try {
        // Fetch balance dynamically from your Solana network cluster connection instance
        const lamports = await connection.getBalance(typeof wallet === 'object' && wallet.publicKey ? wallet.publicKey : wallet);
        solBalance = (lamports / 1_000_000_000).toFixed(2);
      } catch (err) {
        console.warn("Failed to fetch runtime SOL balance:", err);
      }

      // Re-structure the wrapper into the split pill layout dynamically while keeping the connectBtn reference intact
      walletWrapper.innerHTML = `
        <div class="wallet-balance-pill">
          <span class="sol-amount">◎ ${solBalance} SOL</span>
          <button class="nav-btn" id="connectBtn"></button>
        </div>
      `;

      // Re-assign our active working variable pointer to the new DOM node instance
      var activeBtn = document.getElementById("connectBtn")!;
    } else {
      var activeBtn = connectBtn;
    }

    // 4. Apply your EXACT red text disconnect styles to the active node instance
    activeBtn.style.display = "block";
    activeBtn.style.background = "transparent";       // Remove solid color block
    activeBtn.style.color = "#d94d4d";                // Red text color
    activeBtn.style.border = "1px solid #d94d4d";      // Red outline border

    // Use truncated address if it's the main header nav element, otherwise generic "Disconnect" text
    if (activeBtn.id === "connectBtn" && typeof wallet === 'object') {
      const pubKeyStr = wallet.publicKey ? wallet.publicKey.toBase58() : String(wallet);
      activeBtn.innerText = `${pubKeyStr.slice(0, 4)}...${pubKeyStr.slice(-4)} (Disconnect)`;
      activeBtn.style.padding = "6px 14px";
      activeBtn.style.fontSize = "0.85rem";
    } else {
      activeBtn.innerText = `Disconnect`;
    }

    // 5. Fire your identical disconnect lifecycle logic
    activeBtn.onclick = async (e) => {
      e.preventDefault();
      try {
        await (window as any).disconnectWallet?.();
      } catch (e) {
        console.error(e);
      }

      walletState.connected = false;
      walletState.pubkey = null;

      // Reset identity cache
      localStorage.removeItem('olivium_identity');
      console.log("WE OUT!!");
      await initFilters();
    //  refreshIdentityUI();
//updateWalletUI();
    await  updateStatsUI();

      // Sync layout changes back to crypto.html if needed
      if (typeof (window as any).refreshIdentityUI === 'function') {
        (window as any).refreshIdentityUI();
      }
    };

  } else {
    // 6. Complete guest fallback logic restored precisely
    walletState.connected = false;
    walletState.pubkey = null;

    window.OliviumIdentity = {
      type: "guest"
    };

    if (identityStat) {
      identityStat.innerText = "Guest";
    }


    // BUTTON → CONNECT STATE RESTORE
    connectBtn.style.display = "block";
    connectBtn.style.background = "var(--green)";
    connectBtn.style.color = "white";
    connectBtn.style.border = "";
connectBtn.innerText = "Connect Profile";
    connectBtn.onclick = () => {
      // If the main nav element was clicked, open the login overlay modal
      const connectModal = document.getElementById('connectModal');
      if (connectModal && connectBtn.id === "connectBtn") {
        connectModal.style.display = 'flex';
        return;
      }

      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        window.location.href = "https://phantom.app/ul/browse/https://your-site-url";
        return;
      }

      alert("Please install Phantom or Solflare wallet to continue.");
      window.open("https://phantom.app/", "_blank");
    };
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
    return JSON.parse(localStorage.Item("olivium_user") || "null");
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

    positionsPromise = _program.account.sharePosition.all();

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

  if (program) {
    try {
      console.log("[RPC] Fetching all tree accounts...");
      onChainTrees = await program.account.tree.all();
      console.log(
        `[RPC] Successfully fetched ${onChainTrees.length} trees from blockchain.`
      );
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


    /* =========================
       FILTER LOGIC (IMPROVED)
    ========================= */

const user = window.OliviumAuth?.user;
    const myWalletOrEmail = user?.email || user?.id;

    // ownership check (temporary placeholder logic)
    const isMine = myWalletOrEmail
      ? dbTree.owner === myWalletOrEmail || dbTree.user_email === myWalletOrEmail
      : false;

    // 1. HANDLE "MY" FILTER FIRST
    if (filter === "my" && !isMine) continue;

    // 2. HANDLE STATUS FILTERS
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

      </div>
    `;

    card.onclick = () => {
      (window as any).openModal(dbTree);
    };

    container.appendChild(card);
  }
}

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
    (window as any).OliviumAuth.user = Guest;
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
        if (tierNameEl && nav-tier-label && activeSessionData) {
            navtierlabel.innerText = tierNameEl.innerText || "Standard Account";
        }
    }
}
function renderMyTreesFromPositions(positions: any[]) {
  const container = document.getElementById("treeGrid");
  if (!container) return;

  container.innerHTML = "";

  for (const pos of positions) {
    const card = document.createElement("div");

    card.className = "tree-card has-sales";

    const percent = 100; // user owns shares, not market status

    card.innerHTML = `
      <div class="tree-content">

        <div class="tree-name">
          ${pos.treeName}
        </div>

        <div class="tree-meta">
          <span>${pos.sharesOwned} shares owned</span>
          <span>${pos.totalTreeShares} total</span>
        </div>

        <div class="availability">
          <div class="progress-bar">
            <div class="progress-fill" style="width:${percent}%"></div>
          </div>

          <div class="shares-left">
            Your Position
          </div>
        </div>

      </div>
    `;

    container.appendChild(card);
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
    "connectWalletBtn"
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

  // CRYPTO MODE
  if (isCryptoMode) {
    if (!isSoldOut) {
      if (pubKey) {
        if (connectBtn) {
          const addr = pubKey.toString();

          connectBtn.style.display = "block";
          connectBtn.style.background = "#eef0eb";
          connectBtn.style.color = "#1f402a";

          connectBtn.innerText =
            `Connected: ${addr.slice(0, 4)}...${addr.slice(-4)} (✖)`;

          connectBtn.onclick = async () => {
            try {
              await (window as any).disconnectWallet();
            } catch (err) {
              console.error(err);
            }

            (window as any).updateShares();
          };
        }

        if (adoptBtn) {
          adoptBtn.style.display = "block";
        }
      } else {
        if (connectBtn) {
          connectBtn.style.display = "block";
          connectBtn.style.background = "var(--green)";
          connectBtn.style.color = "white";

          connectBtn.innerText = "Connect Wallet";

          connectBtn.onclick = async () => {
            try {
              await (window as any).connectWallet();
              const positions = await (window as any).loadUserTreePositions?.();

              await renderMyTreesFromPositions(positions);
              console.log(positions);

              connectBtn.style.background = "var(--red)";

              connectBtn.innerText = "Disconnect Wallet";


            } catch (err) {
              console.error(err);
            }

            (window as any).updateShares();
          };
        }

        if (adoptBtn) {
          adoptBtn.style.display = "none";
        }
      }
    }
  } else {
    // FIAT MODE
    if (connectBtn) {
      connectBtn.style.display = "none";
    }

    if (!isSoldOut && adoptBtn) {
      adoptBtn.style.display = "block";
    }
  }
};

/* =========================================================
   PAYMENT SELECTOR
========================================================= */

function initPaymentSelector() {
  const fiatOption = document.getElementById("fiatOption");

  const cryptoOption =
    document.getElementById("cryptoOption");

  if (!fiatOption || !cryptoOption) return;

  fiatOption.addEventListener("click", () => {
    paymentMode = "fiat";

    fiatOption.classList.add("active");
    cryptoOption.classList.remove("active");

    (window as any).updateShares();
  });

  cryptoOption.addEventListener("click", () => {
    paymentMode = "crypto";

    cryptoOption.classList.add("active");
    fiatOption.classList.remove("active");

    (window as any).updateShares();
  });
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
    // 3. Compute Aggregated Total Metrics
    totalSharesOwned = positions.reduce((s, p) => s + p.sharesOwned, 0);
    const totalOlvStaked = positions[0]?.totalStakedOlv || 0;

    // Update Layout Metric display targets
    if (sharesCountDisplay) {
      sharesCountDisplay.innerHTML = `${totalSharesOwned.toLocaleString()} <span class="text-xs text-gold font-mono block mt-1">Nodes Detected</span>`;
    }
    if (creditsCountDisplay) {
      creditsCountDisplay.innerHTML = `${Math.floor(totalOlvStaked)} <span class="text-xs text-gold font-mono block mt-1">Sanctuary Days</span>`;
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
