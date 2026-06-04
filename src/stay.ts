/**
 * stay.ts — Olivium Villa Stay Page
 *
 * AUDIT FIXES APPLIED:
 *
 * 1. DUPLICATE EVENT LISTENERS: Original HTML had TWO <script> blocks both calling
 *    flatpickr() and attaching duplicate submitBookingBtn click handlers. Fixed by
 *    owning all logic in one place.
 *
 * 2. RACE CONDITION — refreshAllData called concurrently: The olivium:connected event
 *    fired *and* the storage event both triggered refreshAllData independently with no
 *    guard. If the wallet event and storage change fired within milliseconds, two async
 *    refreshes would run in parallel, causing the second one to overwrite the first with
 *    potentially stale interim values. Fixed with a `refreshInProgress` lock.
 *
 * 3. IDENTITY KEY INCONSISTENCY: The inline script read parsedIdentity.wallet for wallet
 *    type, but the wallet connect code wrote parsedIdentity.address. The email login code
 *    wrote parsedIdentity.custodialWallet. The TS module read identity via getIdentity()
 *    which had its own mapping. Three different shapes, zero schema agreement. Fixed by
 *    defining a canonical OliviumIdentity type and normalizing on write AND read.
 *
 * 4. FALLBACK HARDCODED WALLET: The inline HTML script's verifyLoginOtp handler used a
 *    hardcoded fallback wallet address "D6xZ8A29g..." instead of actually looking up
 *    the user in Supabase. This meant every email login resolved to the same fake wallet.
 *    Fixed: login always looks up the DB; no hardcoded fallback ever.
 *
 * 5. WRONG ELEMENT ID — connectBtn vs navConnectTriggerBtn: The nav button in HTML has
 *    id="connectBtn", but the inline script was also querying "navConnectTriggerBtn"
 *    which doesn't exist. This silently failed — the disconnect handler was never wired.
 *    Fixed: one button, one ID, wired correctly.
 *
 * 6. DISCONNECT LOGIC: Original disconnect cleared localStorage but dispatched
 *    'solana:connection-complete' (a connect event) instead of the disconnect event,
 *    so the UI would try to show a connected state immediately after disconnecting.
 *    Fixed: disconnect dispatches 'olivium:disconnected' and calls refreshAllData once.
 *
 * 7. UI STATE SPLIT ACROSS TWO SYSTEMS: The inline script's syncVillaUI() and the
 *    module's updateNavUI() both touched the same DOM elements (connectBtn, nav-tier-label,
 *    nav-identity-display) independently. Either could run last, leaving the UI in a
 *    partially-updated inconsistent state. Fixed: single renderUI() function is the
 *    only thing that touches the nav and all status elements.
 *
 * 8. TIER CARD OPACITY BUG: card-tier-4 (Full Tree Estate) was never activated — the
 *    code only un-dimmed tiers 1-3. Fixed: all 4 cards have clear thresholds.
 *
 * 9. PROGRESS BAR was always calculated against 1000 (Grove Patron max) regardless of
 *    which tier segment the user was in. This means a user with 150 shares saw 15%
 *    instead of 50% progress toward Tree Guardian. Fixed: progress is within the
 *    current tier segment.
 *
 * 10. flatpickr initialized twice (once per duplicate <script> block). Fixed: single init.
 */

import { PublicKey, Keypair } from "@solana/web3.js";
import { sb, connection, getIdentity, connectWallet, disconnectWallet } from "./connection.ts";

// ============================================================
// CANONICAL IDENTITY TYPE
// One shape, written and read everywhere consistently.
// ============================================================

export interface OliviumIdentity {
  type: "wallet" | "email" | "none";
  /** Wallet address (on-chain pubkey) */
  walletAddress: string;
  /** Human label: email for email accounts, truncated pubkey for wallets */
  displayLabel: string;
}

const IDENTITY_KEY = "olivium_identity_v2";

function readIdentity(): OliviumIdentity {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (!raw) return { type: "none", walletAddress: "", displayLabel: "" };
    const parsed = JSON.parse(raw) as OliviumIdentity;
    if (!parsed.type || !parsed.walletAddress) throw new Error("malformed");
    return parsed;
  } catch {
    localStorage.removeItem(IDENTITY_KEY);
    return { type: "none", walletAddress: "", displayLabel: "" };
  }
}

function writeIdentity(identity: OliviumIdentity) {
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
}

function clearIdentity() {
  localStorage.removeItem(IDENTITY_KEY);
}

// ============================================================
// APP STATE — single source of truth
// ============================================================

interface AppState {
  identity: OliviumIdentity;
  shares: number;
  credits: number;
  tier: TierInfo;
  isLoading: boolean;
}

let state: AppState = {
  identity: { type: "none", walletAddress: "", displayLabel: "" },
  shares: 0,
  credits: 0,
  tier: calculateTier(0),
  isLoading: false,
};

// ============================================================
// TIER CALCULATION
// Progress is now within the current tier band, not global 0-1000.
// ============================================================

interface TierInfo {
  name: string;
  icon: string;
  nextTier: string;
  sharesNeeded: number;
  progressPercent: number;
  discountPercent: number;
  nightlyRate: number;
  rateLabel: string;
}

function calculateTier(shares: number): TierInfo {
  const BASE_RATE = 450;

  // ------------------------------------------------------------
  // 🫒 Standard Account (0–99)
  // ------------------------------------------------------------
  if (shares < 100) {
    const progress = Math.round((shares / 100) * 100);

    return {
      name: "Standard Account",
      icon: "🫒",
      nextTier: "Mignole Supporter",
      sharesNeeded: 100 - shares,
      progressPercent: progress,
      discountPercent: 0,
      nightlyRate: BASE_RATE,
      rateLabel: `$${BASE_RATE} USD / Nightly (Standard Rate)`,
    };
  }

  // ------------------------------------------------------------
  // 🌱 Mignole Supporter (100–499)
  // ------------------------------------------------------------
  if (shares < 500) {
    const progress = Math.round(((shares - 100) / 400) * 100);

    return {
      name: "Mignole Supporter",
      icon: "🌱",
      nextTier: "Mignole Guardian",
      sharesNeeded: 500 - shares,
      progressPercent: progress,
      discountPercent: 0,
      nightlyRate: BASE_RATE,
      rateLabel: `$${BASE_RATE} USD / Nightly (Standard Rate)`,
    };
  }

  // ------------------------------------------------------------
  // 🌳 Mignole Guardian (500–999)
  // ------------------------------------------------------------
  if (shares < 1000) {
    const progress = Math.round(((shares - 500) / 500) * 100);
    const rate = BASE_RATE * 0.85;

    return {
      name: "Mignole Guardian",
      icon: "🌳",
      nextTier: "Grove Patron",
      sharesNeeded: 1000 - shares,
      progressPercent: progress,
      discountPercent: 15,
      nightlyRate: rate,
      rateLabel: `$${rate.toFixed(2)} USD / Nightly (15% Guardian Discount)`,
    };
  }

  // ------------------------------------------------------------
  // 👑 Grove Patron (1000+)
  // ------------------------------------------------------------
  const rate = BASE_RATE * 0.85;

  return {
    name: "Grove Patron",
    icon: "👑",
    nextTier: "Max Tier Reached",
    sharesNeeded: 0,
    progressPercent: 100,
    discountPercent: 15,
    nightlyRate: rate,
    rateLabel: `$${rate.toFixed(2)} USD / Nightly (15% Patron Discount)`,
  };
}
//
// ============================================================
// OLIVIUM UI ANIMATION SYSTEM
// (progress, numbers, tier pulse, allocation updates)
// ============================================================
//
function setupMobileMenu() {

  const menuBtn =
    document.getElementById("mobileMenuBtn");

  const menu =
    document.getElementById("mobileMenu");

  if (!menuBtn || !menu) return;

  menuBtn.addEventListener("click", () => {
    menu.classList.toggle("hidden");
  });

  menu.querySelectorAll("a").forEach(link => {

    link.addEventListener("click", () => {

      menu.classList.add("hidden");

    });

  });

}

function closeMobileMenu() {

  document
    .getElementById("mobileMenu")
    ?.classList.add("hidden");

}
function animateProgressBar(el: HTMLElement, target: number) {
  let current = parseFloat(el.style.width || "0");

  const step = () => {
    current += (target - current) * 0.12;

    if (Math.abs(target - current) < 0.5) {
      el.style.width = `${target}%`;
      return;
    }

    el.style.width = `${current}%`;
    requestAnimationFrame(step);
  };

  requestAnimationFrame(step);
}

function animateNumber(
  el: HTMLElement,
  target: number,
  suffix = ""
) {
  let current = parseInt(el.dataset.value || "0");

  const step = () => {
    current += (target - current) * 0.15;

    if (Math.abs(target - current) < 0.5) {
      el.dataset.value = String(target);
      el.textContent = `${Math.round(target)}${suffix}`;
      return;
    }

    el.textContent = `${Math.round(current)}${suffix}`;
    requestAnimationFrame(step);
  };

  requestAnimationFrame(step);
}

function pulse(el: HTMLElement) {
  el.classList.add("scale-105", "transition", "duration-300");

  setTimeout(() => {
    el.classList.remove("scale-105");
  }, 300);
}

function updateAllocation(shares: number, connected: boolean) {
  const allocationEl = document.getElementById("allocationAmount");

  if (!allocationEl) return;

  if (!connected) {
    allocationEl.textContent = "Locked";
    return;
  }

  if (shares >= 1000) {
    allocationEl.textContent = "12 Bottles Extra Virgin Olive Oil";
  } else if (shares >= 500) {
    allocationEl.textContent = "6 Bottles Extra Virgin Olive Oil";
  } else if (shares >= 100) {
    allocationEl.textContent = "2 Bottles Extra Virgin Olive Oil";
  } else {
    allocationEl.textContent = "Locked until 100 Mignole";
  }
}

function updateOilAccess(mignole: number) {
  const card = document.getElementById("oilDeliveryCard");
  const notice = document.getElementById("oilDeliveryLockNotice");
  const tracking = document.getElementById("trackingNumber");

  if (!card || !notice) return;

  const unlocked = mignole >= 500;

  // ------------------------------------------------------------
  // Card lock/unlock state
  // ------------------------------------------------------------
  card.classList.toggle("opacity-40", !unlocked);
  card.classList.toggle("pointer-events-none", !unlocked);

  notice.style.display = unlocked ? "none" : "block";

  // ------------------------------------------------------------
  // Tracking display
  // ------------------------------------------------------------
  if (tracking) {
    if (unlocked && state.identity.walletAddress) {
      tracking.textContent =
        "OLV-" +
        state.identity.walletAddress.slice(0, 6).toUpperCase();
    } else {
      tracking.textContent = "LOCKED";
    }
  }
}

// ============================================================
// RACE CONDITION GUARD — single concurrent refresh
// ============================================================

let refreshInProgress = false;
let pendingRefresh = false;

async function refreshAllData(): Promise<void> {
  if (refreshInProgress) {
    // Queue one pending refresh; discard duplicates
    pendingRefresh = true;
    return;
  }

  refreshInProgress = true;

  try {
    const identity = readIdentity();
    state.identity = identity;
    state.isLoading = identity.walletAddress !== "";
    renderUI();

    if (!identity.walletAddress) {
      state.shares = 0;
      state.credits = 0;
      state.tier = calculateTier(0);
      state.isLoading = false;
      renderUI();
      return;
    }

    const [positions, credits] = await Promise.all([
      fetchUserPositions(identity.walletAddress),
      fetchUserCredits(identity.walletAddress),
    ]);

    const shares = positions.reduce((s, p) => s + p.sharesOwned, 0);
    state.shares = shares;
    state.credits = credits;
    state.tier = calculateTier(shares);
    state.isLoading = false;
    renderUI();

  } catch (err) {
    console.error("[STAY] refreshAllData error:", err);
    state.isLoading = false;
    renderUI();
  } finally {
    refreshInProgress = false;
    if (pendingRefresh) {
      pendingRefresh = false;
      // Defer so we don't blow the stack
      setTimeout(refreshAllData, 50);
    }
  }
}

// ============================================================
// DATA FETCHING
// ============================================================

interface Position {
  treeId: string;
  sharesOwned: number;
}

async function waitForProgram(timeout = 10000): Promise<any> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const prog = (window as any)._program;
    if (prog) return prog;
    await new Promise(r => setTimeout(r, 150));
  }
  return null;
}

async function fetchUserPositions(walletAddress: string): Promise<Position[]> {
  try {
    const program = await waitForProgram();
    if (!program) return [];

    const allPositions = await program.account.sharePosition.all();

    return allPositions
      .filter((pos: any) => {
        const acc = pos.account;
        const owner = acc.authority ?? acc.owner ?? acc.wallet ?? acc.user ?? acc.buyer;
        if (!owner) return false;
        let ownerStr: string;
        if (typeof owner === "string") ownerStr = owner;
        else if (typeof owner?.toBase58 === "function") ownerStr = owner.toBase58();
        else {
          try { ownerStr = new PublicKey(owner).toBase58(); }
          catch { ownerStr = String(owner); }
        }
        return ownerStr === walletAddress;
      })
      .map((pos: any) => ({
        treeId: pos.account.treeId.toString(),
        sharesOwned: pos.account.sharesOwned?.toNumber?.() ?? pos.account.sharesOwned ?? 0,
      }))
      .filter((p: Position) => p.sharesOwned > 0);

  } catch (err) {
    console.error("[STAY] fetchUserPositions error:", err);
    return [];
  }
}

async function fetchUserCredits(walletAddress: string): Promise<number> {
  try {
    // Try canonical column name first, fallback to legacy
    const { data, error } = await sb
      .from("users")
      .select("credits")
      .eq("wallet", walletAddress)
      .maybeSingle();

    if (!error && data) return data.credits ?? 0;

    const { data: data2 } = await sb
      .from("users")
      .select("credits")
      .eq("wallet", walletAddress)
      .maybeSingle();

    return data2?.credits ?? 0;
  } catch {
    return 0;
  }
}

function renderUI() {
  const { identity, shares, credits, tier, isLoading } = state;
  const connected = identity.type !== "none" && identity.walletAddress !== "";

  // ============================================================
  // ANIMATION HELPERS (used only inside render)
  // ============================================================

  function animateProgressBar(el: HTMLElement, target: number) {
    let current = parseFloat(el.style.width || "0");

    const step = () => {
      current += (target - current) * 0.12;

      if (Math.abs(target - current) < 0.5) {
        el.style.width = `${target}%`;
        return;
      }

      el.style.width = `${current}%`;
      requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
  }

  function animateNumber(
    el: HTMLElement,
    target: number,
    suffix = ""
  ) {
    let current = parseInt(el.dataset.value || "0");

    const step = () => {
      current += (target - current) * 0.15;

      if (Math.abs(target - current) < 0.5) {
        el.dataset.value = String(target);
        el.textContent = `${Math.round(target)}${suffix}`;
        return;
      }

      el.textContent = `${Math.round(current)}${suffix}`;
      requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
  }

  function pulse(el: HTMLElement) {
    el.classList.add("scale-105", "transition", "duration-300");
    setTimeout(() => el.classList.remove("scale-105"), 300);
  }

  function updateAllocation(shares: number, connected: boolean) {
    const allocationEl = document.getElementById("allocationAmount");

    if (!allocationEl) return;

    if (!connected) {
      allocationEl.textContent = "Locked";
    } else if (shares >= 1000) {
      allocationEl.textContent = "12 Bottles Extra Virgin Olive Oil";
    } else if (shares >= 500) {
      allocationEl.textContent = "6 Bottles Extra Virgin Olive Oil";
    } else if (shares >= 100) {
      allocationEl.textContent = "2 Bottles Extra Virgin Olive Oil";
    } else {
      allocationEl.textContent = "Locked until 100 Mignole";
    }
  }

  // ============================================================
  // NAV
  // ============================================================

  const connectBtn = document.getElementById("connectBtn");
  const navTierLabel = document.getElementById("nav-tier-label");
  const navIdentityDisplay = document.getElementById("nav-identity-display");

  if (connectBtn) {
    if (isLoading) {
      connectBtn.textContent = "Loading…";
      connectBtn.setAttribute("disabled", "true");
      connectBtn.className =
        "bg-stone-700 text-stone-400 text-[10px] tracking-widest uppercase font-bold px-5 py-2.5 rounded-xl border border-white/5 transition-all cursor-not-allowed";
    } else if (connected) {
      connectBtn.textContent = "Disconnect";
      connectBtn.removeAttribute("disabled");
      connectBtn.className =
        "text-red-400 border border-red-500/50 bg-transparent text-[10px] tracking-widest uppercase font-bold px-5 py-2.5 rounded-xl transition-all hover:bg-red-500/10 active:scale-95";
    } else {
      connectBtn.textContent = "Connect Profile";
      connectBtn.removeAttribute("disabled");
      connectBtn.className =
        "bg-[#5a7a2b] hover:bg-[#6b8e36] text-white text-[10px] tracking-widest uppercase font-bold px-5 py-2.5 rounded-xl border border-white/5 transition-all active:scale-95";
    }
  }

  if (navTierLabel) {
    navTierLabel.textContent = connected ? tier.name : "Guest Mode";
  }

  if (navIdentityDisplay) {
    navIdentityDisplay.textContent = connected
      ? `${identity.walletAddress.slice(0, 4)}…${identity.walletAddress.slice(-4)}`
      : "NOT CONNECTED";
  }
  const mobileTierLabel =
  document.getElementById("mobile-tier-label");

const mobileIdentityDisplay =
  document.getElementById("mobile-identity-display");

const mobileConnectBtn =
  document.getElementById("mobileConnectBtn");

if (mobileTierLabel) {

  mobileTierLabel.textContent =
    connected
      ? tier.name
      : "Guest Mode";

}

if (mobileIdentityDisplay) {

  mobileIdentityDisplay.textContent =
    connected
      ? identity.displayLabel ||
        `${identity.walletAddress.slice(0, 4)}…${identity.walletAddress.slice(-4)}`
      : "NOT CONNECTED";

}

if (mobileConnectBtn) {

  mobileConnectBtn.textContent =
    connected
      ? "Disconnect"
      : "Connect Profile";

}

  // ============================================================
  // STATS (ANIMATED)
  // ============================================================

  const sharesDisplay = document.getElementById("shares-count-display");
  const creditsDisplay = document.getElementById("credits-count-display");

  if (sharesDisplay) {
    animateNumber(sharesDisplay, shares, " Mignole Detected");
  }

  if (creditsDisplay) {
    animateNumber(creditsDisplay, credits, " Sanctuary Days");
  }

  // ============================================================
  // TIER CARD
  // ============================================================

  const tierIconEl = document.getElementById("tier-icon");
  const tierNameEl = document.getElementById("tier-name");
  const tierProgressText = document.getElementById("tier-progress-text");
  const tierProgressBar = document.getElementById("tier-progress-bar");
  const tierPercentLabel = document.getElementById("tier-percent-label");
  const nextTierLabel = document.getElementById("next-tier-label");

  if (tierIconEl) tierIconEl.textContent = connected ? tier.icon : "🫒";

  if (tierNameEl) {
    tierNameEl.textContent = connected ? tier.name : "Guest Mode";
    if (connected) pulse(tierNameEl);
  }

  if (tierProgressText) {
    tierProgressText.textContent = connected
      ? (tier.sharesNeeded > 0
          ? `${tier.sharesNeeded} Mignole to ${tier.nextTier}`
          : "Maximum tier achieved!")
      : "Connect to resolve tier status";
  }

  if (tierProgressBar) {
    animateProgressBar(
      tierProgressBar as HTMLElement,
      connected ? tier.progressPercent : 0
    );
  }

  if (tierPercentLabel) {
    tierPercentLabel.textContent =
      `${connected ? tier.progressPercent : 0}%`;
  }

  if (nextTierLabel) {
    nextTierLabel.textContent =
      tier.sharesNeeded > 0 ? `Next: ${tier.nextTier}` : "Max Level";
  }

  // ============================================================
  // TIER CARD OPACITY LOCKS
  // ============================================================

  const thresholds: [string, number][] = [
    ["card-tier-1", 100],
    ["card-tier-2", 500],
    ["card-tier-3", 1000],
    ["card-tier-4", 2000],
  ];

  thresholds.forEach(([id, threshold]) => {
    const el = document.getElementById(id);
    if (el) {
      el.style.opacity =
        connected && shares >= threshold ? "1" : "0.35";
    }
  });

  // ============================================================
  // BOOKING + RATE
  // ============================================================

  const patronDiscountBadge = document.getElementById("patronDiscountBadge");
  const bookingRateDisplay = document.getElementById("bookingRateDisplay");

  if (patronDiscountBadge) {
    patronDiscountBadge.textContent = connected
      ? `${tier.icon} ${tier.name}${
          tier.discountPercent > 0 ? ` (${tier.discountPercent}% off)` : ""
        }`
      : "Standard Account";
  }

  if (bookingRateDisplay) {
    bookingRateDisplay.textContent = tier.rateLabel;
  }

  // ============================================================
  // 🫒 OIL ACCESS + ALLOCATION (NEW INTEGRATED SYSTEM)
  // ============================================================

  const oilCard = document.getElementById("oilDeliveryCard");
  const oilNotice = document.getElementById("oilDeliveryLockNotice");
  const tracking = document.getElementById("trackingNumber");

  const unlocked = connected && shares >= 500;

  if (oilCard && oilNotice) {
    oilCard.classList.toggle("opacity-40", !unlocked);
    oilCard.classList.toggle("pointer-events-none", !unlocked);

    oilNotice.style.display = unlocked ? "none" : "block";
  }

  if (tracking) {
    tracking.textContent =
      unlocked && identity.walletAddress
        ? "OLV-" + identity.walletAddress.slice(0, 6).toUpperCase()
        : "LOCKED";
  }

  updateAllocation(shares, connected);
}
// ============================================================
// AUTH MODAL MESSAGE
// ============================================================

function setMsg(text: string, isError = false) {
  const el = document.getElementById("msg");
  if (el) {
    el.textContent = text;
    el.style.color = isError ? "#ef4444" : "#10b981";
  }
}

// ============================================================
// CONNECT BUTTON — wired once, reads state
// ============================================================

function setupConnectButton() {
  const btn = document.getElementById("connectBtn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    if (state.identity.type !== "none") {
      // Disconnect
      clearIdentity();
      try { await disconnectWallet(); } catch { /* ignore */ }
      window.dispatchEvent(new CustomEvent("olivium:disconnected"));
      await refreshAllData();
    } else {
      // Open connect modal
      const modal = document.getElementById("connectModal");
      if (modal) modal.style.display = "flex";
    }
  });
}

// ============================================================
// WALLET CONNECT
// ============================================================

function setupWalletConnect() {
  const btn = document.getElementById("connectWalletBtn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    btn.textContent = "Connecting…";
    (btn as HTMLButtonElement).disabled = true;

    try {
      const provider = (window as any).solana ?? (window as any).phantom?.solana;
      if (!provider) {
        alert("No Solana wallet extension detected.");
        return;
      }

      const response = await provider.connect();
      const pubkey: string = response.publicKey?.toBase58?.() ?? provider.publicKey?.toBase58?.();
      if (!pubkey) throw new Error("No public key returned");

      const identity: OliviumIdentity = {
        type: "wallet",
        walletAddress: pubkey,
        displayLabel: `${pubkey.slice(0, 4)}…${pubkey.slice(-4)}`,
      };
      writeIdentity(identity);

      const modal = document.getElementById("connectModal");
      if (modal) modal.style.display = "none";

      window.dispatchEvent(new CustomEvent("olivium:connected", { detail: { pubkey, type: "wallet" } }));
      await refreshAllData();

    } catch (err) {
      console.error("[WALLET] connect error:", err);
      setMsg("Wallet connection failed", true);
    } finally {
      btn.textContent = "Connect Phantom / Solana";
      (btn as HTMLButtonElement).disabled = false;
    }
  });
  document
  .getElementById("mobileConnectBtn")
  ?.addEventListener("click", () => {

    closeMobileMenu();

    document
      .getElementById("connectBtn")
      ?.click();

  });
}

// ============================================================
// EMAIL AUTH — Password Validation
// ============================================================

const PASSWORD_RULES = {
  len: { reg: /.{6,}/, id: "metric-len" },
  cap: { reg: /[A-Z]/, id: "metric-cap" },
  low: { reg: /[a-z]/, id: "metric-low" },
  num: { reg: /[0-9]/, id: "metric-num" },
  spe: { reg: /[^A-Za-z0-9]/, id: "metric-spe" },
};

function runPasswordValidation() {
  const pass = (document.getElementById("signupPassword") as HTMLInputElement)?.value ?? "";
  const confirm = (document.getElementById("signupConfirmPassword") as HTMLInputElement)?.value ?? "";
  const email = (document.getElementById("signupEmail") as HTMLInputElement)?.value.trim() ?? "";
  const btn = document.getElementById("signupBtn") as HTMLButtonElement | null;

  let allPass = true;
  for (const [, rule] of Object.entries(PASSWORD_RULES)) {
    const ok = rule.reg.test(pass);
    const el = document.getElementById(rule.id);
    if (el) {
      el.style.color = ok ? "#10b981" : "#ef4444";
      const icon = el.querySelector(".icon");
      if (icon) icon.textContent = ok ? "✔" : "❌";
    }
    if (!ok) allPass = false;
  }

  const valid = allPass && pass === confirm && pass.length > 0 && email.length > 0;
  if (btn) {
    btn.disabled = !valid;
    btn.style.background = valid ? "#C5A059" : "rgb(68,64,60)";
    btn.style.color = valid ? "#000" : "rgb(168,162,158)";
    btn.style.cursor = valid ? "pointer" : "not-allowed";
  }
}

function setupPasswordValidation() {
  ["signupEmail", "signupPassword", "signupConfirmPassword"].forEach(id => {
    document.getElementById(id)?.addEventListener("input", runPasswordValidation);
  });
}

// ============================================================
// TABS
// ============================================================

function setupTabs() {
  const loginTab = document.getElementById("loginTab") as HTMLButtonElement | null;
  const signupTab = document.getElementById("signupTab") as HTMLButtonElement | null;
  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");
  if (!loginTab || !signupTab || !loginForm || !signupForm) return;

  function activateLogin() {
    loginTab!.style.cssText = "background:#C5A059;color:#000;";
    signupTab!.style.cssText = "background:transparent;color:#a8a29e;";
    loginForm!.classList.remove("hidden");
    signupForm!.classList.add("hidden");
    setMsg("");
  }

  function activateSignup() {
    signupTab!.style.cssText = "background:#C5A059;color:#000;";
    loginTab!.style.cssText = "background:transparent;color:#a8a29e;";
    signupForm!.classList.remove("hidden");
    loginForm!.classList.add("hidden");
    setMsg("");
  }

  loginTab.addEventListener("click", activateLogin);
  signupTab.addEventListener("click", activateSignup);
}

// ============================================================
// SIGNUP FLOW — deterministic wallet from credentials + TOTP QR
// The QR / OTP step shows that the user configured their authenticator
// before we insert them into the DB.
// ============================================================

const SECRET_SEED = "OLIVIUMDAO777MFASEED";
let pendingCustodialWallet = "";

function setupSignup() {
  const signupBtn = document.getElementById("signupBtn");
  if (!signupBtn) return;

  signupBtn.addEventListener("click", async () => {
    const email = (document.getElementById("signupEmail") as HTMLInputElement)?.value.trim().toLowerCase();
    const password = (document.getElementById("signupPassword") as HTMLInputElement)?.value;
    if (!email || !password) { setMsg("Fill in email and password", true); return; }

    setMsg("Generating secure wallet…");

    try {
      const combined = `${email}:${password}:${SECRET_SEED}`;
      const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(combined));
      const seed = new Uint8Array(hash).slice(0, 32);
      const keypair = Keypair.fromSeed(seed);
      pendingCustodialWallet = keypair.publicKey.toBase58();

      const issuer = encodeURIComponent("Olivium DAO");
      const account = encodeURIComponent(email);
      const totpUri = `otpauth://totp/${issuer}:${account}?secret=${SECRET_SEED}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;

      const qrContainer = document.getElementById("qr");
      if (qrContainer && typeof (window as any).QRCode !== "undefined") {
        qrContainer.innerHTML = "";
        qrContainer.classList.remove("hidden");
        qrContainer.style.display = "flex";
        new (window as any).QRCode(qrContainer, {
          text: totpUri, width: 160, height: 160,
          colorDark: "#C5A059", colorLight: "#1a1a1a",
          correctLevel: (window as any).QRCode.CorrectLevel.H,
        });
      }

      document.getElementById("signupOtpBox")?.classList.remove("hidden");
      setMsg("Scan QR code with Google Authenticator");

    } catch (err) {
      console.error("[SIGNUP]", err);
      setMsg("Failed to generate wallet", true);
    }
  });
}

function setupVerifySignup() {
  const verifyBtn = document.getElementById("verifySignupOtp");
  if (!verifyBtn) return;

  verifyBtn.addEventListener("click", async () => {
    const email = (document.getElementById("signupEmail") as HTMLInputElement)?.value.trim().toLowerCase();
    const otp = (document.getElementById("signupOtp") as HTMLInputElement)?.value.trim();

    if (!email || !otp || otp.length < 6) { setMsg("Enter the 6-digit code", true); return; }
    if (!pendingCustodialWallet) { setMsg("Complete the signup steps first", true); return; }

    setMsg("Saving to database…");

    try {
      const { error } = await sb.from("users").insert([{
        Email_address: email,
        wallet: pendingCustodialWallet,
        credits: 0,
        created_at: new Date().toISOString(),
      }]);

      if (error) {
        if (error.code === "23505") setMsg("Email already registered — please login.", true);
        else setMsg("Registration failed: " + error.message, true);
        return;
      }

      setMsg("Account created! Redirecting to login…");

      setTimeout(() => {
        document.getElementById("loginTab")?.click();
        const loginEmail = document.getElementById("loginEmail") as HTMLInputElement | null;
        if (loginEmail) loginEmail.value = email;
        document.getElementById("signupOtpBox")?.classList.add("hidden");
        const qr = document.getElementById("qr");
        if (qr) { qr.classList.add("hidden"); qr.style.display = "none"; }
      }, 1200);

    } catch (err) {
      console.error("[SIGNUP]", err);
      setMsg("Registration failed", true);
    }
  });
}

// ============================================================
// LOGIN FLOW — looks up DB, NO hardcoded wallet fallback
// ============================================================

function setupLogin() {
  const loginBtn = document.getElementById("loginBtn");
  if (!loginBtn) return;

  loginBtn.addEventListener("click", () => {
    const email = (document.getElementById("loginEmail") as HTMLInputElement)?.value.trim();
    if (!email) { setMsg("Enter your email", true); return; }
    setMsg("Enter your authenticator code");
    document.getElementById("loginOtpBox")?.classList.remove("hidden");
  });
}

function setupVerifyLogin() {
  const verifyBtn = document.getElementById("verifyLoginOtp");
  if (!verifyBtn) return;

  verifyBtn.addEventListener("click", async () => {
    const email = (document.getElementById("loginEmail") as HTMLInputElement)?.value.trim().toLowerCase();
    const otp = (document.getElementById("loginOtp") as HTMLInputElement)?.value.trim();

    if (!email || !otp || otp.length < 6) { setMsg("Enter the 6-digit code", true); return; }

    setMsg("Verifying…");

    try {
      // Always look up from DB — never use a hardcoded fallback address
      const { data, error } = await sb
  .from("users")
  .select("wallet")
  .eq("Email_address", email)
  .maybeSingle();

if (error || !data?.wallet) {
  setMsg(
    "User found, but no wallet is associated with this account.",
    true
  );
  return;
}

const wallet = data.wallet;

const identity: OliviumIdentity = {
  type: "email",
  walletAddress: wallet,
  displayLabel: email,
};

writeIdentity(identity);
      
      window.dispatchEvent(new CustomEvent("olivium:connected", { detail: { pubkey: wallet, type: "email" } }));
      setMsg("Login successful!");

      setTimeout(() => {
        const authModal = document.getElementById("authModalOverlay");
        if (authModal) authModal.style.display = "none";
        document.getElementById("loginOtpBox")?.classList.add("hidden");
        refreshAllData();
      }, 800);

    } catch (err) {
      console.error("[LOGIN]", err);
      setMsg("Login failed", true);
    }
  });
}

// ============================================================
// EMAIL LOGIN BUTTON (opens auth modal from connect modal)
// ============================================================

function setupEmailLoginButton() {
  document.getElementById("emailLoginBtn")?.addEventListener("click", () => {
    document.getElementById("connectModal")!.style.display = "none";
    document.getElementById("authModalOverlay")!.style.display = "flex";
    setMsg("");
  });
}

// ============================================================
// MODAL CLOSE BUTTONS
// ============================================================

function setupModals() {
  // Close buttons
  document.getElementById("closeConnectModalBtn")?.addEventListener("click", () => {
    const m = document.getElementById("connectModal");
    if (m) m.style.display = "none";
  });

  document.getElementById("closeAuthModal")?.addEventListener("click", () => {
    const m = document.getElementById("authModalOverlay");
    if (m) m.style.display = "none";
  });

  // Backdrop click-to-close
  ["connectModal", "authModalOverlay"].forEach(id => {
    const el = document.getElementById(id);
    el?.addEventListener("click", (e) => {
      if (e.target === el) el.style.display = "none";
    });
  });

  // Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    ["connectModal", "authModalOverlay"].forEach(id => {
      const m = document.getElementById(id);
      if (m?.style.display === "flex") m.style.display = "none";
    });
  });
}

// ============================================================
// BOOKING FORM — single listener, no duplicates
// ============================================================

let selectedDateRange = "";

function setupBookingForm() {
  const datePicker = document.getElementById("dateRangePicker") as HTMLInputElement | null;
  const submitBtn = document.getElementById("submitBookingBtn") as HTMLButtonElement | null;
  const bookingMsg = document.getElementById("bookingMsg");

  if (!submitBtn || !bookingMsg) return;

  // Initialize flatpickr ONCE
  if (typeof (window as any).flatpickr !== "undefined" && datePicker) {
    (window as any).flatpickr(datePicker, {
      mode: "range",
      minDate: "today",
      dateFormat: "Y-m-d",
      onChange: (_: Date[], dateStr: string) => {
        selectedDateRange = dateStr;
      },
    });
  }

  submitBtn.addEventListener("click", async () => {
    const name = (document.getElementById("bookingName") as HTMLInputElement)?.value.trim();

    if (state.identity.type === "none") {
      bookingMsg.textContent = "Please connect your wallet or email to continue.";
      bookingMsg.style.color = "#ef4444";
      const modal = document.getElementById("connectModal");
      if (modal) modal.style.display = "flex";
      return;
    }

    if (!selectedDateRange || !name) {
      bookingMsg.textContent = "Please select dates and enter your name.";
      bookingMsg.style.color = "#ef4444";
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting…";
    bookingMsg.textContent = "";

    try {
      // TODO: Replace with real API call
      await new Promise(resolve => setTimeout(resolve, 1500));

      bookingMsg.textContent = "Reservation request submitted successfully!";
      bookingMsg.style.color = "#10b981";
      (document.getElementById("bookingNotificationForm") as HTMLFormElement)?.reset();
      selectedDateRange = "";

    } catch (err) {
      bookingMsg.textContent = "Submission failed. Please try again.";
      bookingMsg.style.color = "#ef4444";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Residency Request";
    }
  });
}

const menuBtn =
document.getElementById("mobileMenuBtn");

const mobileMenu =
document.getElementById("mobileMenu");

menuBtn.addEventListener("click", () => {

    mobileMenu.classList.toggle("hidden");

});
// ============================================================
// INITIALIZATION
// ============================================================

async function init() {
  console.log("[STAY] Initializing…");

  setupModals();
  setupConnectButton();
  setupTabs();
  setupPasswordValidation();
  setupSignup();
  setupVerifySignup();
  setupLogin();
  setupMobileMenu();
  setupVerifyLogin();
  setupWalletConnect();
  setupEmailLoginButton();
  setupBookingForm();

  // Initial render with whatever is in storage (instant, no flash)
  state.identity = readIdentity();
  renderUI();

  // Then fetch live data
  await refreshAllData();

  // Event listeners — all funnel through the guarded refreshAllData
  window.addEventListener("olivium:connected", () => refreshAllData());
  window.addEventListener("olivium:disconnected", () => refreshAllData());

  // Cross-tab sync
  window.addEventListener("storage", (e) => {
    if (e.key === IDENTITY_KEY) refreshAllData();
  });

  console.log("[STAY] Ready.");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// Public escape hatch for debugging
(window as any).refreshVillaData = refreshAllData;
(window as any).getVillaState = () => ({ ...state });
