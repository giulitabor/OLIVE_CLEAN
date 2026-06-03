/**
 * stay.ts - Olivium Villa Stay Page
 * Uses only events (no subscribeToIdentity)
 */

import { PublicKey } from "@solana/web3.js";
import { sb, connection, getIdentity } from "./connection.ts";

// ============================================================
// TYPES
// ============================================================

interface Position {
  treeId: string;
  sharesOwned: number;
}

// ============================================================
// STATE
// ============================================================

let totalShares = 0;
let totalCredits = 0;

// ============================================================
// HELPER - WAIT FOR PROGRAM
// ============================================================

async function waitForProgram(timeout = 10000): Promise<any> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const prog = (window as any)._program;
    if (prog) return prog;
    await new Promise(r => setTimeout(r, 150));
  }
  console.warn("[STAY] Program timeout");
  return null;
}

// ============================================================
// FETCH USER POSITIONS (Shares Owned)
// ============================================================

async function fetchUserPositions(): Promise<Position[]> {
  const identity = getIdentity();
  if (!identity.walletAddress) {
    console.log("[STAY] No wallet connected");
    return [];
  }

  try {
    const program = await waitForProgram();
    if (!program) return [];

    const allPositions = await program.account.sharePosition.all();
    const targetAddress = identity.walletAddress;

    const userPositions = allPositions
      .filter((pos: any) => {
        const acc = pos.account;
        const owner = acc.authority || acc.owner || acc.wallet || acc.user || acc.buyer;
        if (!owner) return false;

        let ownerStr = "";
        if (typeof owner === "string") ownerStr = owner;
        else if (typeof owner?.toBase58 === "function") ownerStr = owner.toBase58();
        else {
          try { ownerStr = new PublicKey(owner).toBase58(); }
          catch { ownerStr = String(owner); }
        }
        return ownerStr === targetAddress;
      })
      .map((pos: any) => ({
        treeId: pos.account.treeId.toString(),
        sharesOwned: pos.account.sharesOwned?.toNumber?.() || pos.account.sharesOwned || 0,
      }))
      .filter(p => p.sharesOwned > 0);

    console.log(`[STAY] Found ${userPositions.length} positions, total shares: ${userPositions.reduce((s, p) => s + p.sharesOwned, 0)}`);
    return userPositions;

  } catch (err) {
    console.error("[STAY] Error fetching positions:", err);
    return [];
  }
}

// ============================================================
// FETCH USER CREDITS FROM SUPABASE
// ============================================================

async function fetchUserCredits(walletAddress: string): Promise<number> {
  try {
    // Try wallet_address first, then wallet
    const { data, error } = await sb
      .from("users")
      .select("credits")
      .eq("wallet_address", walletAddress)
      .maybeSingle();

    if (error) {
      // Try with 'wallet' column
      const { data: data2, error: error2 } = await sb
        .from("users")
        .select("credits")
        .eq("wallet", walletAddress)
        .maybeSingle();
      
      if (error2) {
        console.warn("[STAY] Credits fetch error:", error2.message);
        return 0;
      }
      return data2?.credits || 0;
    }
    return data?.credits || 0;
  } catch (err) {
    console.warn("[STAY] Credits fetch failed:", err);
    return 0;
  }
}

// ============================================================
// CALCULATE TIER BASED ON SHARES
// ============================================================

function calculateTier(shares: number): { tier: string; icon: string; nextTier: string; sharesNeeded: number } {
  if (shares >= 1000) {
    return { tier: "Grove Patron", icon: "👑", nextTier: "Max", sharesNeeded: 0 };
  } else if (shares >= 500) {
    return { tier: "Tree Guardian", icon: "🌳", nextTier: "Grove Patron", sharesNeeded: 1000 - shares };
  } else if (shares >= 100) {
    return { tier: "Seed Supporter", icon: "🌱", nextTier: "Tree Guardian", sharesNeeded: 500 - shares };
  } else {
    return { tier: "Standard Account", icon: "🫒", nextTier: "Seed Supporter", sharesNeeded: 100 - shares };
  }
}

// ============================================================
// UPDATE NAVIGATION UI
// ============================================================

function updateNavUI(identity: any, tier: string) {
  const connectBtn = document.getElementById("connectBtn");
  const navTierLabel = document.getElementById("nav-tier-label");
  const navIdentityDisplay = document.getElementById("nav-identity-display");

  if (!connectBtn) return;

  if (identity.walletAddress) {
    const shortAddr = `${identity.walletAddress.slice(0, 4)}...${identity.walletAddress.slice(-4)}`;
    connectBtn.innerText = "Disconnect";
    connectBtn.style.color = "#d94d4d";
    connectBtn.style.border = "1px solid #d94d4d";
    connectBtn.style.background = "transparent";
    
    if (navTierLabel) navTierLabel.innerText = tier;
    if (navIdentityDisplay) navIdentityDisplay.innerText = shortAddr;
    
    connectBtn.onclick = async () => {
      const { disconnectWallet } = await import("./connection.ts");
      await disconnectWallet();
      // Refresh page after disconnect
      window.location.reload();
    };
  } else {
    connectBtn.innerText = "Connect Profile";
    connectBtn.style.color = "white";
    connectBtn.style.border = "";
    connectBtn.style.background = "var(--green)";
    
    if (navTierLabel) navTierLabel.innerText = "Guest Mode";
    if (navIdentityDisplay) navIdentityDisplay.innerText = "Not Connected";
    
    connectBtn.onclick = () => {
      const modal = document.getElementById("connectModal");
      if (modal) modal.style.display = "flex";
    };
  }
}

// ============================================================
// UPDATE MAIN UI (Tiers, Counters, Booking Rate)
// ============================================================

async function updateMainUI(totalShares: number, totalCredits: number) {
  console.log("[STAY] Updating main UI...");
  
  const sharesDisplay = document.getElementById("shares-count-display");
  const creditsDisplay = document.getElementById("credits-count-display");
  const tierNameEl = document.getElementById("tier-name");
  const tierIconEl = document.getElementById("tier-icon");
  const tierProgressText = document.getElementById("tier-progress-text");
  const nextTierLabel = document.getElementById("next-tier-label");
  const tierPercentLabel = document.getElementById("tier-percent-label");
  const tierProgressBar = document.getElementById("tier-progress-bar");
  const patronDiscountBadge = document.getElementById("patronDiscountBadge");
  const bookingRateDisplay = document.getElementById("bookingRateDisplay");
  
  // Update displays
  if (sharesDisplay) {
    sharesDisplay.innerHTML = `${totalShares.toLocaleString()} <span class="text-xs text-gold font-mono block mt-1">Nodes Detected</span>`;
  }
  
  if (creditsDisplay) {
    creditsDisplay.innerHTML = `${totalCredits} <span class="text-xs text-gold font-mono block mt-1">Sanctuary Days</span>`;
  }
  
  // Calculate and update tier
  const tierInfo = calculateTier(totalShares);
  
  if (tierNameEl) tierNameEl.innerText = tierInfo.tier;
  if (tierIconEl) tierIconEl.innerText = tierInfo.icon;
  
  const progressPercent = totalShares >= 1000 ? 100 : Math.min(100, Math.round((totalShares / 1000) * 100));
  if (tierProgressBar) (tierProgressBar as HTMLElement).style.width = `${progressPercent}%`;
  if (tierPercentLabel) tierPercentLabel.innerText = `${progressPercent}%`;
  
  if (tierInfo.sharesNeeded > 0) {
    if (tierProgressText) tierProgressText.innerText = `${tierInfo.sharesNeeded} shares to ${tierInfo.nextTier}`;
    if (nextTierLabel) nextTierLabel.innerText = `Next: ${tierInfo.nextTier}`;
  } else {
    if (tierProgressText) tierProgressText.innerText = "Maximum tier achieved!";
    if (nextTierLabel) nextTierLabel.innerText = "Max Level";
  }
  
  // Update card opacities based on tier
  const cardTier1 = document.getElementById("card-tier-1");
  const cardTier2 = document.getElementById("card-tier-2");
  const cardTier3 = document.getElementById("card-tier-3");
  const cardTier4 = document.getElementById("card-tier-4");
  
  [cardTier1, cardTier2, cardTier3, cardTier4].forEach(card => {
    if (card) card.style.opacity = "0.4";
  });
  
  if (totalShares >= 100) { if (cardTier1) cardTier1.style.opacity = "1"; }
  if (totalShares >= 500) { if (cardTier2) cardTier2.style.opacity = "1"; }
  if (totalShares >= 1000) { if (cardTier3) cardTier3.style.opacity = "1"; }
  
  // Update booking rate based on tier
  let rateString = "$450 USD / Nightly standard baseline";
  let badgeText = "Standard Account";
  
  if (totalShares >= 1000) {
    rateString = "$382.50 USD / Nightly (15% Patron Discount)";
    badgeText = "👑 Grove Patron (15% off)";
  } else if (totalShares >= 500) {
    rateString = "$382.50 USD / Nightly (15% Guardian Discount)";
    badgeText = "🌳 Tree Guardian (15% off)";
  } else if (totalShares >= 100) {
    rateString = "$450 USD / Nightly standard baseline";
    badgeText = "🌱 Seed Supporter";
  }
  
  if (patronDiscountBadge) patronDiscountBadge.innerText = badgeText;
  if (bookingRateDisplay) bookingRateDisplay.innerText = rateString;
}

// ============================================================
// REFRESH ALL DATA
// ============================================================

async function refreshAllData() {
  console.log("[STAY] Refreshing all data...");
  
  const identity = getIdentity();
  
  if (!identity.walletAddress) {
    // Guest mode - reset UI
    await updateMainUI(0, 0);
    updateNavUI(identity, "Guest Mode");
    return;
  }
  
  // Fetch data in parallel
  const [positions, credits] = await Promise.all([
    fetchUserPositions(),
    fetchUserCredits(identity.walletAddress)
  ]);
  
  const shares = positions.reduce((sum, p) => sum + p.sharesOwned, 0);
  const tierInfo = calculateTier(shares);
  
  await updateMainUI(shares, credits);
  updateNavUI(identity, tierInfo.tier);
  
  console.log(`[STAY] Refresh complete: ${shares} shares, ${credits} credits, tier: ${tierInfo.tier}`);
}

// ============================================================
// ESCAPE KEY HANDLER
// ============================================================

function setupEscapeHandler() {
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    
    const modals = ["connectModal", "authModalOverlay"];
    modals.forEach(id => {
      const modal = document.getElementById(id);
      if (modal && modal.style.display === "flex") {
        modal.style.display = "none";
      }
    });
  });
}

// ============================================================
// INITIALIZATION
// ============================================================

async function init() {
  console.log("[STAY] Initializing villa page...");
  
  setupEscapeHandler();
  
  // Initial data load
  await refreshAllData();
  
  // Listen for connection events (no subscribeToIdentity needed)
  window.addEventListener("olivium:connected", async () => {
    console.log("[STAY] Connected event received");
    await refreshAllData();
  });
  
  window.addEventListener("olivium:disconnected", async () => {
    console.log("[STAY] Disconnected event received");
    await refreshAllData();
  });
  
  // Also listen for storage events (if identity changes in another tab)
  window.addEventListener("storage", async (e) => {
    if (e.key === "olivium_identity" || e.key === "olivium_identity_v2") {
      console.log("[STAY] Storage changed, refreshing...");
      await refreshAllData();
    }
  });
  
  console.log("[STAY] Villa page ready");
}

// Start the app
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// Expose for debugging
(window as any).refreshVillaData = refreshAllData;
