/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OLIVIUM DAO - CONNECTION OPTIMIZATION (FIXED)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, setProvider } from "@coral-xyz/anchor";
import idl from "./SIMPLE/idl/idl.json";
import { createClient } from "@supabase/supabase-js";

// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE CLIENT
// ═══════════════════════════════════════════════════════════════════════════
export const sb = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ═══════════════════════════════════════════════════════════════════════════
// OPTIMIZED BLOCKCHAIN CONNECTION
// ═══════════════════════════════════════════════════════════════════════════
const RPC_URL = import.meta.env.VITE_RPC_URL || "https://api.devnet.solana.com"
console.log(`[CONNECTION] Using RPC: ${RPC_URL}`);

export const connection = new Connection(RPC_URL, "confirmed");
export const PROGRAM_ID = new PublicKey(idl.address);

const connectionConfig: {
  commitment: Commitment;
  confirmTransactionInitialTimeout?: number;
} = {
  commitment: "confirmed",
  confirmTransactionInitialTimeout: 60000,
};

export const connection = new Connection(RPC_URL, connectionConfig);
export const PROGRAM_ID = new PublicKey(idl.address);

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL STATE TRACKING
// ═══════════════════════════════════════════════════════════════════════════
let _program: Program | null = null;
let _provider: AnchorProvider | null = null;
let _isInitialized = false;

type WalletConnectionState =
  | {
      status: "connected";
      provider: AnchorProvider;
      program: Program;
      pubkey: string;
      isAdmin: boolean;
    }
  | {
      status: "not_installed";
      message: string;
      installUrl: string;
    }
  | {
      status: "rejected";
      message: string;
    }
  | {
      status: "error";
      message: string;
    };

// ═══════════════════════════════════════════════════════════════════════════
// SAFE GETTERS
// ═══════════════════════════════════════════════════════════════════════════
export function getProgram(): Program {
  if (!_program) {
    throw new Error("❌ Program not initialized. Connect wallet first.");
  }
  return _program;
}

export function getProvider(): AnchorProvider {
  if (!_provider) {
    throw new Error("❌ Provider not initialized. Connect wallet first.");
  }
  return _provider;
}

export let program: Program;
export let provider: AnchorProvider;

// ═══════════════════════════════════════════════════════════════════════════
// ✅ COMPLETE UI RESET TO DEFAULT VALUES
// ═══════════════════════════════════════════════════════════════════════════
async function resetAllUIDefaults() {
  console.log("[UI RESET] Resetting all UI elements to default values...");

  // 1. Reset identity pill
  const identityPill = document.getElementById("identityPill");
  if (identityPill) identityPill.innerHTML = "🌿 Guest Mode";

  // 2. Reset identity stat
  const identityStat = document.getElementById("identityTypeStat");
  if (identityStat) identityStat.innerText = "Guest";

  // 3. Reset connect button text
  const connectBtn = document.getElementById("connectBtn");
  if (connectBtn) {
    connectBtn.innerText = "Connect Profile";
    connectBtn.style.color = "white";
    connectBtn.style.border = "";
    connectBtn.style.background = "var(--green)";
  }

  // 4. Reset tree count stat
  const treeCountStat = document.getElementById("treeCountStat");
  if (treeCountStat) treeCountStat.innerText = "--";

  // 5. Reset share count stat
  const shareCountStat = document.getElementById("shareCountStat");
  if (shareCountStat) shareCountStat.innerText = "--";

  // 6. Reset grove position stat
  const grovePositionStat = document.getElementById("grovePositionStat");
  if (grovePositionStat) grovePositionStat.innerText = "0";

  // 7. Reset villa UI elements if they exist
  const sharesCountDisplay = document.getElementById("shares-count-display");
  if (sharesCountDisplay) sharesCountDisplay.innerHTML = `0 <span class="text-xs text-gold font-mono block mt-1">Nodes Detected</span>`;

  const creditsCountDisplay = document.getElementById("credits-count-display");
  if (creditsCountDisplay) creditsCountDisplay.innerHTML = `00 <span class="text-xs text-gold font-mono block mt-1">Sanctuary Days</span>`;

  const tierName = document.getElementById("tier-name");
  if (tierName) tierName.innerText = "Guest Mode";

  const patronDiscountBadge = document.getElementById("patronDiscountBadge");
  if (patronDiscountBadge) patronDiscountBadge.innerText = "Standard Account";

  const bookingRateDisplay = document.getElementById("bookingRateDisplay");
  if (bookingRateDisplay) bookingRateDisplay.innerText = "$450 USD / Nightly standard baseline";

  // 8. Reset tree grid to show all trees
  if (typeof (window as any).loadTrees === "function") {
    await (window as any).loadTrees("all");
  }

  // 9. Clear any active filters
  const filterButtons = document.querySelectorAll(".filter-btn");
  filterButtons.forEach(btn => btn.classList.remove("active"));
  const allFilter = document.querySelector('.filter-btn[data-filter="all"]');
  if (allFilter) allFilter.classList.add("active");

  // 10. Clear any modals that might be open
  const modals = ['modalOverlay', 'agreementModal', 'successModal', 'connectModal', 'authModalOverlay'];
  modals.forEach(modalId => {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = "none";
  });

  // 11. Clear any cached data
  (window as any).positionsCache = null;
  (window as any).positionsPromise = null;
  (window as any).treesCache = null;
  (window as any).treesPromise = null;

  // 12. Clear localStorage identities (keep only necessary)
  localStorage.removeItem("olivium_identity");
  localStorage.removeItem("olivium_user");
  localStorage.removeItem("walletConnected");

  // 13. Reset OliviumAuth if exists
  if ((window as any).OliviumAuth) {
    (window as any).OliviumAuth.user = null;
  }

  console.log("[UI RESET] Complete UI reset to default values");
}

// ═══════════════════════════════════════════════════════════════════════════
// ✅ CONNECT WALLET (FIXED)
// ═══════════════════════════════════════════════════════════════════════════
export async function connectWallet(auto = false): Promise<WalletConnectionState> {
  console.log(`[CONNECT] Starting wallet connection (auto=${auto})...`);

  const phantom = (window as any)?.phantom?.solana;
  const wallet = phantom || (window as any)?.solana;

  // Handle missing wallet
  if (!wallet) {
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    
    if (isMobile) {
      console.log("[CONNECT] Mobile detected, redirecting to Phantom Deep Link...");
      const cleanUrl = window.location.href.replace(/^https?:\/\//, '');
      window.location.href = `https://phantom.app/ul/browse/https://${cleanUrl}`;
      return { status: "error", message: "Redirecting to Phantom..." };
    } else {
      console.log("[CONNECT] Desktop browser - showing modal");
      const modal = document.getElementById('wallet-missing-modal');
      if (modal) {
        modal.classList.remove('hidden');
      } else {
        alert("Please install Phantom wallet to continue.");
      }
      return { status: "not_installed", message: "Modal shown", installUrl: "https://phantom.app/" };
    }
  }

  try {
    // Connect wallet
    if (auto) {
      await wallet.connect({ onlyIfTrusted: true });
    } else if (!wallet.publicKey) {
      await wallet.connect();
    }

    if (!wallet.publicKey) {
      return { status: "error", message: "Wallet connected but no public key found" };
    }

    const pubkey = wallet.publicKey.toBase58();
    console.log(`✅ Wallet connected: ${pubkey.slice(0, 8)}...`);
     
    localStorage.setItem("walletConnected", "true");

    // Create provider
    _provider = new AnchorProvider(connection, wallet, {
      preflightCommitment: "confirmed",
      commitment: "confirmed",
    });

    setProvider(_provider);

    // Initialize program
    _program = new Program(idl as any, _provider);

    // Legacy exports
    provider = _provider;
    program = _program;

    // Globals
    (window as any)._program = _program;
    (window as any).program = _program;
    (window as any)._provider = _provider;
    (window as any).provider = _provider;
    (window as any)._sb = sb;
    (window as any).sb = sb;
    (window as any)._connection = connection;
    (window as any).connection = connection;
    (window as any).walletPubKey = wallet.publicKey;
    (window as any).wallet = wallet;

    console.log("✅ Globals initialized");

    // Initialize protocol
    console.log("[CONNECT] Initializing protocol...");
    await ensureProtocolInitialized();

    // ✅ SAVE IDENTITY TO LOCALSTORAGE
    localStorage.setItem('olivium_identity', JSON.stringify({
      type: "wallet",
      wallet: pubkey,
      source: "solana"
    }));

    // ✅ UPDATE ALL UI COMPONENTS
    await refreshAllUIAfterConnection(pubkey);

    const isAdmin = pubkey === "8xkNHk2VpWBM6Nk3enitFCs7vwh2inCveTNintcXHc54";

    window.dispatchEvent(
      new CustomEvent("olivium:connected", {
        detail: { pubkey, isAdmin },
      })
    );

    console.log("✅ Connection complete");

    _isInitialized = true;

    return {
      status: "connected",
      provider: _provider,
      program: _program,
      pubkey,
      isAdmin,
    };
  } catch (err: any) {
    console.error("❌ Connection failed:", err);

    _program = null;
    _provider = null;
    _isInitialized = false;

    const rejected = err?.code === 4001 || err?.message?.toLowerCase()?.includes("reject");

    if (rejected) {
      return { status: "rejected", message: "Wallet connection cancelled" };
    }

    return { status: "error", message: err?.message || "Wallet connection failed" };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ✅ REFRESH ALL UI AFTER CONNECTION (NEW FUNCTION)
// ═══════════════════════════════════════════════════════════════════════════
async function refreshAllUIAfterConnection(pubkey: string) {
  console.log("[UI REFRESH] Updating all UI components after connection...");

  // Update identity pill
  const identityPill = document.getElementById("identityPill");
  if (identityPill) {
    const shortAddr = `${pubkey.slice(0, 4)}...${pubkey.slice(-4)}`;
    identityPill.innerHTML = `◎ <span id="solBalance">--</span> SOL <span style="opacity:0.5;margin:0 6px">|</span> 🔑 ${shortAddr}`;
    
    // Fetch SOL balance
    try {
      const balance = await connection.getBalance(new PublicKey(pubkey));
      const solBalance = (balance / 1_000_000_000).toFixed(3);
      const balanceSpan = document.getElementById("solBalance");
      if (balanceSpan) balanceSpan.innerText = solBalance;
    } catch (err) {
      console.error("Failed to fetch SOL balance:", err);
    }
  }

  // Update identity stat
  const identityStat = document.getElementById("identityTypeStat");
  if (identityStat) identityStat.innerText = "Wallet Mode";

  // Update connect button
  const connectBtn = document.getElementById("connectBtn");
  if (connectBtn) {
    const shortAddr = `${pubkey.slice(0, 4)}...${pubkey.slice(-4)}`;
    connectBtn.innerText = `${shortAddr} (Disconnect)`;
    connectBtn.style.color = "var(--danger, #d94d4d)";
    connectBtn.style.border = "1px solid var(--danger, #d94d4d)";
    connectBtn.style.background = "transparent";
  }

  // Update stats
  if (typeof (window as any).updateStatsUI === "function") {
    await (window as any).updateStatsUI();
  }

  // Update villa UI
  if (typeof (window as any).updateVillaStayUI === "function") {
    await (window as any).updateVillaStayUI();
  }

  // Load user positions
  if (typeof (window as any).loadUserTreePositions === "function") {
    await (window as any).loadUserTreePositions();
  }

  // Refresh tree grid if my filter is active
  const activeFilter = document.querySelector(".filter-btn.active");
  if (activeFilter && activeFilter.getAttribute("data-filter") === "my") {
    if (typeof (window as any).loadTrees === "function") {
      await (window as any).loadTrees("my");
    }
  } else {
    if (typeof (window as any).loadTrees === "function") {
      await (window as any).loadTrees("all");
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ✅ DISCONNECT WALLET (FIXED - COMPLETE RESET)
// ═══════════════════════════════════════════════════════════════════════════
export async function disconnectWallet() {
  console.log("[DISCONNECT] Starting disconnect and full UI reset...");

  const wallet = (window as any)?.phantom?.solana || (window as any)?.solana;

  try {
    if (wallet?.disconnect) {
      await wallet.disconnect();
    }
  } catch (err) {
    console.error("Disconnect error:", err);
  }

  // Clear all internal state
  _program = null;
  _provider = null;
  _isInitialized = false;

  // Clear all window globals
  (window as any)._program = null;
  (window as any).program = null;
  (window as any)._provider = null;
  (window as any).provider = null;
  (window as any)._protocol = null;
  (window as any).protocol = null;
  (window as any).walletPubKey = null;
  (window as any).wallet = null;
  (window as any).OliviumIdentity = { type: 'guest' };
  
  // Clear all cached data
  (window as any).positionsCache = null;
  (window as any).positionsPromise = null;
  (window as any).treesCache = null;
  (window as any).treesPromise = null;

  // Reset all UI to default values
  await resetAllUIDefaults();

  console.log("✅ Disconnect complete - UI fully reset to defaults");

  // Dispatch disconnect event
  window.dispatchEvent(new CustomEvent("olivium:disconnected"));
  
  // Also dispatch solana:connection-complete for any legacy listeners
  window.dispatchEvent(new Event('solana:connection-complete'));
}

// ═══════════════════════════════════════════════════════════════════════════
// PROTOCOL INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════
export async function ensureProtocolInitialized(): Promise<any> {
  console.log("[PROTOCOL] Checking initialization...");

  if ((window as any)._protocol) {
    console.log("[PROTOCOL] Using cached protocol");
    return (window as any)._protocol;
  }

  const prog = getProgram();
  const [protocolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("protocol")],
    prog.programId
  );

  try {
    const protocol = await prog.account.protocolConfig.fetch(protocolPda);

    (window as any)._protocol = protocol;
    (window as any).protocol = protocol;
    (window as any).protocolPda = protocolPda;

    console.log("✅ Protocol initialized:", {
      authority: protocol.authority.toBase58().slice(0, 8),
      totalTrees: protocol.totalTrees,
      sharePriceLamports: protocol.sharePriceLamports.toString(),
    });

    return protocol;
  } catch (err) {
    console.warn("⚠️ Protocol not found on-chain.");
    (window as any)._protocol = null;
    (window as any).protocol = null;
    (window as any).protocolPda = protocolPda;
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CHECK IF CONNECTED
// ═══════════════════════════════════════════════════════════════════════════
export function isConnected(): boolean {
  return _isInitialized && _program !== null && _provider !== null;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONNECTION HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════
export async function checkConnectionHealth(): Promise<{
  rpc: boolean;
  wallet: boolean;
  program: boolean;
  protocol: boolean;
}> {
  const health = { rpc: false, wallet: false, program: false, protocol: false };

  try {
    await connection.getSlot();
    health.rpc = true;
  } catch (e) {
    console.error("[HEALTH] RPC check failed:", e);
  }

  const wallet = (window as any).wallet;
  health.wallet = !!(wallet?.publicKey);
  health.program = !!_program;
  health.protocol = !!(window as any)._protocol;

  console.log("[HEALTH] Connection health:", health);
  return health;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPOSE GLOBALS
// ═══════════════════════════════════════════════════════════════════════════
(window as any).checkConnectionHealth = checkConnectionHealth;
(window as any).connectWallet = connectWallet;
(window as any).disconnectWallet = disconnectWallet;
(window as any).resetAllUIDefaults = resetAllUIDefaults;

console.log("[connection.ts] ✅ Optimized module loaded with complete UI reset");
