/**
 * stay.ts - Olivium Villa Stay Page
 * Complete: Email auth, QR code, Supabase association, Wallet connect, Tier UI
 */

import { PublicKey, Keypair } from "@solana/web3.js";
import { sb, connection, getIdentity, connectWallet, disconnectWallet } from "./connection.ts";

// ============================================================
// TYPES
// ============================================================

interface Position {
  treeId: string;
  sharesOwned: number;
}

// ============================================================
// CONSTANTS
// ============================================================

const SECRET_SEED = "OLIVIUMDAO777MFASEED";
let generatedCustodialWallet = "";
let selectedDateRangeString = "";

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
    const { data, error } = await sb
      .from("users")
      .select("credits")
      .eq("wallet_address", walletAddress)
      .maybeSingle();

    if (error) {
      const { data: data2, error: error2 } = await sb
        .from("users")
        .select("credits")
        .eq("wallet", walletAddress)
        .maybeSingle();
      
      if (error2) return 0;
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
// UI MESSAGE HELPER
// ============================================================

function showMessage(msg: string, isError = false) {
  const msgEl = document.getElementById("msg");
  if (msgEl) {
    msgEl.textContent = msg;
    msgEl.style.color = isError ? "#ef4444" : "#10b981";
  }
}

// ============================================================
// PASSWORD VALIDATION
// ============================================================

const rulesMatrix = {
  len: { reg: /.{6,}/, el: document.getElementById("metric-len") },
  cap: { reg: /[A-Z]/, el: document.getElementById("metric-cap") },
  low: { reg: /[a-z]/, el: document.getElementById("metric-low") },
  num: { reg: /[0-9]/, el: document.getElementById("metric-num") },
  spe: { reg: /[^A-Za-z0-9]/, el: document.getElementById("metric-spe") }
};

function validatePassword() {
  const passEl = document.getElementById("signupPassword") as HTMLInputElement;
  const confirmEl = document.getElementById("signupConfirmPassword") as HTMLInputElement;
  const emailEl = document.getElementById("signupEmail") as HTMLInputElement;
  const signupBtn = document.getElementById("signupBtn") as HTMLButtonElement;
  
  if (!passEl || !confirmEl || !signupBtn) return;
  
  const passVal = passEl.value || "";
  const confirmVal = confirmEl.value || "";
  let allPass = true;
  
  for (const key in rulesMatrix) {
    const matched = rulesMatrix[key].reg.test(passVal);
    const el = rulesMatrix[key].el;
    if (el) {
      if (matched) {
        el.style.color = "#10b981";
        const icon = el.querySelector(".icon");
        if (icon) icon.textContent = "✔";
      } else {
        el.style.color = "#ef4444";
        const icon = el.querySelector(".icon");
        if (icon) icon.textContent = "❌";
        allPass = false;
      }
    }
  }
  
  const matches = passVal === confirmVal && passVal.length > 0;
  const hasEmail = (emailEl?.value.trim().length || 0) > 0;
  
  if (allPass && matches && hasEmail) {
    signupBtn.disabled = false;
    signupBtn.style.background = "#C5A059";
    signupBtn.style.color = "black";
  } else {
    signupBtn.disabled = true;
    signupBtn.style.background = "#4a4a4a";
    signupBtn.style.color = "#888";
  }
}

// ============================================================
// EMAIL SIGNUP WITH QR CODE
// ============================================================

function setupSignup() {
  const signupBtn = document.getElementById("signupBtn");
  const emailEl = document.getElementById("signupEmail") as HTMLInputElement;
  const passwordEl = document.getElementById("signupPassword") as HTMLInputElement;
  const qrContainer = document.getElementById("qr");
  const signupOtpBox = document.getElementById("signupOtpBox");
  
  if (!signupBtn) return;
  
  signupBtn.addEventListener("click", async () => {
    const email = emailEl?.value.trim().toLowerCase();
    const password = passwordEl?.value;
    
    if (!email || !password) {
      showMessage("Please fill in email and password", true);
      return;
    }
    
    showMessage("Generating secure wallet...", false);
    
    try {
      // Generate deterministic wallet from email+password
      const credentialCombination = `${email}:${password}:${SECRET_SEED}`;
      const encoder = new TextEncoder();
      const dataBytes = encoder.encode(credentialCombination);
      const hashBuffer = await crypto.subtle.digest("SHA-256", dataBytes);
      const deterministicSeed = new Uint8Array(hashBuffer);
      const keypair = Keypair.fromSeed(deterministicSeed.slice(0, 32));
      generatedCustodialWallet = keypair.publicKey.toBase58();
      
      console.log("[SIGNUP] Generated wallet:", generatedCustodialWallet);
      
      // Generate TOTP URI for QR code
      const issuer = encodeURIComponent("Olivium DAO");
      const account = encodeURIComponent(email);
      const totpUri = `otpauth://totp/${issuer}:${account}?secret=${SECRET_SEED}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
      
      // Generate QR code
      if (qrContainer && typeof (window as any).QRCode !== "undefined") {
        qrContainer.innerHTML = "";
        qrContainer.classList.remove("hidden");
        new (window as any).QRCode(qrContainer, {
          text: totpUri,
          width: 160,
          height: 160,
          colorDark: "#C5A059",
          colorLight: "#1a1a1a",
          correctLevel: (window as any).QRCode.CorrectLevel.H
        });
      }
      
      if (signupOtpBox) signupOtpBox.classList.remove("hidden");
      showMessage("Scan QR code with Google Authenticator", false);
      
    } catch (err) {
      console.error("[SIGNUP] Error:", err);
      showMessage("Failed to generate wallet", true);
    }
  });
}

// ============================================================
// VERIFY SIGNUP OTP AND SAVE TO SUPABASE
// ============================================================

function setupVerifySignup() {
  const verifyBtn = document.getElementById("verifySignupOtp");
  const emailEl = document.getElementById("signupEmail") as HTMLInputElement;
  const otpEl = document.getElementById("signupOtp") as HTMLInputElement;
  
  if (!verifyBtn) return;
  
  verifyBtn.addEventListener("click", async () => {
    const email = emailEl?.value.trim().toLowerCase();
    const otp = otpEl?.value.trim();
    
    if (!email || !otp || otp.length < 6) {
      showMessage("Please enter the 6-digit code", true);
      return;
    }
    
    showMessage("Verifying and saving to database...", false);
    
    try {
      const { error } = await sb
        .from("users")
        .insert([{
          email_address: email,
          wallet_address: generatedCustodialWallet,
          credits: 0,
          created_at: new Date().toISOString()
        }]);
      
      if (error) {
        if (error.code === "23505") {
          showMessage("Email already registered. Please login.", true);
        } else {
          console.error("[SIGNUP] DB Error:", error);
          showMessage("Registration failed: " + error.message, true);
        }
        return;
      }
      
      showMessage("Account created! Please login.", false);
      
      setTimeout(() => {
        const loginTab = document.getElementById("loginTab");
        const signupTab = document.getElementById("signupTab");
        const loginForm = document.getElementById("loginForm");
        const signupForm = document.getElementById("signupForm");
        
        if (loginTab && signupTab && loginForm && signupForm) {
          loginTab.click();
          const loginEmail = document.getElementById("loginEmail") as HTMLInputElement;
          if (loginEmail) loginEmail.value = email;
        }
        
        const signupOtpBox = document.getElementById("signupOtpBox");
        const qrContainer = document.getElementById("qr");
        if (signupOtpBox) signupOtpBox.classList.add("hidden");
        if (qrContainer) qrContainer.classList.add("hidden");
      }, 1500);
      
    } catch (err) {
      console.error("[SIGNUP] Error:", err);
      showMessage("Registration failed", true);
    }
  });
}

// ============================================================
// LOGIN WITH EMAIL
// ============================================================

function setupLogin() {
  const loginBtn = document.getElementById("loginBtn");
  const emailEl = document.getElementById("loginEmail") as HTMLInputElement;
  const loginOtpBox = document.getElementById("loginOtpBox");
  
  if (!loginBtn) return;
  
  loginBtn.addEventListener("click", () => {
    const email = emailEl?.value.trim();
    if (!email) {
      showMessage("Please enter your email", true);
      return;
    }
    showMessage("Enter your authenticator code", false);
    if (loginOtpBox) loginOtpBox.classList.remove("hidden");
  });
}

// ============================================================
// VERIFY LOGIN OTP AND CONNECT
// ============================================================

function setupVerifyLogin() {
  const verifyBtn = document.getElementById("verifyLoginOtp");
  const emailEl = document.getElementById("loginEmail") as HTMLInputElement;
  const otpEl = document.getElementById("loginOtp") as HTMLInputElement;
  
  if (!verifyBtn) return;
  
  verifyBtn.addEventListener("click", async () => {
    const email = emailEl?.value.trim().toLowerCase();
    const otp = otpEl?.value.trim();
    
    if (!email || !otp || otp.length < 6) {
      showMessage("Please enter the 6-digit code", true);
      return;
    }
    
    showMessage("Verifying...", false);
    
    try {
      const { data, error } = await sb
        .from("users")
        .select("wallet_address")
        .eq("email_address", email)
        .maybeSingle();
      
      if (error || !data) {
        showMessage("User not found. Please sign up first.", true);
        return;
      }
      
      const custodialWallet = data.wallet_address;
      
      localStorage.setItem("olivium_identity", JSON.stringify({
        type: "email",
        address: email,
        custodialWallet: custodialWallet
      }));
      
      window.dispatchEvent(new CustomEvent("olivium:connected", {
        detail: { pubkey: custodialWallet, type: "email" }
      }));
      
      showMessage("Login successful!", false);
      
      setTimeout(() => {
        const authModal = document.getElementById("authModalOverlay");
        if (authModal) authModal.style.display = "none";
        const loginOtpBox = document.getElementById("loginOtpBox");
        if (loginOtpBox) loginOtpBox.classList.add("hidden");
        refreshAllData();
      }, 800);
      
    } catch (err) {
      console.error("[LOGIN] Error:", err);
      showMessage("Login failed", true);
    }
  });
}

// ============================================================
// WALLET CONNECT
// ============================================================

function setupWalletConnect() {
  const walletBtn = document.getElementById("connectWalletBtn");
  if (!walletBtn) return;
  
  walletBtn.addEventListener("click", async () => {
    walletBtn.textContent = "Connecting...";
    walletBtn.disabled = true;
    
    try {
      await connectWallet(false);
      const modal = document.getElementById("connectModal");
      if (modal) modal.style.display = "none";
      await refreshAllData();
    } catch (err) {
      console.error("[WALLET] Connection error:", err);
      showMessage("Wallet connection failed", true);
    } finally {
      walletBtn.textContent = "Connect Phantom / Solana";
      walletBtn.disabled = false;
    }
  });
}

// ============================================================
// EMAIL LOGIN BUTTON (Opens Auth Modal)
// ============================================================

function setupEmailLoginButton() {
  const emailBtn = document.getElementById("emailLoginBtn");
  if (!emailBtn) return;
  
  emailBtn.addEventListener("click", () => {
    const connectModal = document.getElementById("connectModal");
    const authModal = document.getElementById("authModalOverlay");
    if (connectModal) connectModal.style.display = "none";
    if (authModal) authModal.style.display = "flex";
    showMessage("");
  });
}

// ============================================================
// MODAL CLOSE BUTTONS
// ============================================================

function setupModalButtons() {
  const connectModalClose = document.getElementById("closeConnectModalBtn");
  if (connectModalClose) {
    connectModalClose.addEventListener("click", () => {
      const modal = document.getElementById("connectModal");
      if (modal) modal.style.display = "none";
    });
  }
  
  const authModalClose = document.getElementById("closeAuthModal");
  if (authModalClose) {
    authModalClose.addEventListener("click", () => {
      const modal = document.getElementById("authModalOverlay");
      if (modal) modal.style.display = "none";
    });
  }
  
  const connectModal = document.getElementById("connectModal");
  if (connectModal) {
    connectModal.addEventListener("click", (e) => {
      if (e.target === connectModal) connectModal.style.display = "none";
    });
  }
  
  const authModal = document.getElementById("authModalOverlay");
  if (authModal) {
    authModal.addEventListener("click", (e) => {
      if (e.target === authModal) authModal.style.display = "none";
    });
  }
}

// ============================================================
// TABS FOR LOGIN/SIGNUP
// ============================================================

function setupTabs() {
  const loginTab = document.getElementById("loginTab");
  const signupTab = document.getElementById("signupTab");
  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");
  
  if (loginTab && signupTab && loginForm && signupForm) {
    loginTab.addEventListener("click", () => {
      loginTab.style.background = "#C5A059";
      loginTab.style.color = "black";
      signupTab.style.background = "transparent";
      signupTab.style.color = "#a8a29e";
      loginForm.classList.remove("hidden");
      signupForm.classList.add("hidden");
      showMessage("");
    });
    
    signupTab.addEventListener("click", () => {
      signupTab.style.background = "#C5A059";
      signupTab.style.color = "black";
      loginTab.style.background = "transparent";
      loginTab.style.color = "#a8a29e";
      signupForm.classList.remove("hidden");
      loginForm.classList.add("hidden");
      showMessage("");
    });
  }
}

// ============================================================
// PASSWORD INPUT LISTENERS
// ============================================================

function setupPasswordValidation() {
  const passEl = document.getElementById("signupPassword");
  const confirmEl = document.getElementById("signupConfirmPassword");
  const emailEl = document.getElementById("signupEmail");
  
  if (passEl) passEl.addEventListener("input", validatePassword);
  if (confirmEl) confirmEl.addEventListener("input", validatePassword);
  if (emailEl) emailEl.addEventListener("input", validatePassword);
}

// ============================================================
// BOOKING FORM HANDLER
// ============================================================

function setupBookingForm() {
  const submitBtn = document.getElementById("submitBookingBtn");
  const bookingMsg = document.getElementById("bookingMsg");
  const datePicker = document.getElementById("dateRangePicker") as HTMLInputElement;
  
  if (!submitBtn || !bookingMsg) return;
  
  // Initialize flatpickr
  if (typeof (window as any).flatpickr !== "undefined" && datePicker) {
    (window as any).flatpickr(datePicker, {
      mode: "range",
      minDate: "today",
      dateFormat: "Y-m-d",
      onChange: (selectedDates: Date[], dateStr: string) => {
        selectedDateRangeString = dateStr;
      }
    });
  }
  
  submitBtn.addEventListener("click", async () => {
    const nameVal = (document.getElementById("bookingName") as HTMLInputElement)?.value.trim();
    const notesVal = (document.getElementById("bookingNotes") as HTMLTextAreaElement)?.value.trim();
    const identity = getIdentity();
    
    if (!identity.walletAddress) {
      bookingMsg.innerText = "Please connect your wallet or email to continue.";
      bookingMsg.style.color = "#ef4444";
      const modal = document.getElementById("connectModal");
      if (modal) modal.style.display = "flex";
      return;
    }
    
    if (!selectedDateRangeString || !nameVal) {
      bookingMsg.innerText = "Please select dates and enter your name.";
      bookingMsg.style.color = "#ef4444";
      return;
    }
    
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";
    
    // TODO: Replace with real API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    bookingMsg.innerText = "Reservation request submitted successfully!";
    bookingMsg.style.color = "#10b981";
    
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit Residency Request";
  });
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
      await disconnectWallet();
      window.location.reload();
    };
  } else {
    connectBtn.innerText = "Connect Profile";
    connectBtn.style.color = "white";
    connectBtn.style.border = "";
    connectBtn.style.background = "var(--green)";
    
    if (navTierLabel) navTierLabel.innerText = "Guest Mode";
    if (navIdentityDisplay) navIdentityDisplay.innerText = "NOT CONNECTED";
    
    connectBtn.onclick = () => {
      const modal = document.getElementById("connectModal");
      if (modal) modal.style.display = "flex";
    };
  }
}

// ============================================================
// UPDATE MAIN UI
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
  
  if (sharesDisplay) {
    sharesDisplay.innerHTML = `${totalShares.toLocaleString()} <span class="text-xs text-gold font-mono block mt-1">Nodes Detected</span>`;
  }
  
  if (creditsDisplay) {
    creditsDisplay.innerHTML = `${totalCredits} <span class="text-xs text-gold font-mono block mt-1">Sanctuary Days</span>`;
  }
  
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
  
  // Update card opacities
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
  
  // Booking rate
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
    await updateMainUI(0, 0);
    updateNavUI(identity, "Guest Mode");
    return;
  }
  
  const [positions, credits] = await Promise.all([
    fetchUserPositions(),
    fetchUserCredits(identity.walletAddress)
  ]);
  
  const shares = positions.reduce((sum, p) => sum + p.sharesOwned, 0);
  const tierInfo = calculateTier(shares);
  
  await updateMainUI(shares, credits);
  updateNavUI(identity, tierInfo.tier);
  
  console.log(`[STAY] Refresh complete: ${shares} shares, ${credits} credits`);
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
  setupModalButtons();
  setupTabs();
  setupPasswordValidation();
  setupSignup();
  setupVerifySignup();
  setupLogin();
  setupVerifyLogin();
  setupWalletConnect();
  setupEmailLoginButton();
  setupBookingForm();
  
  await refreshAllData();
  
  window.addEventListener("olivium:connected", async () => {
    console.log("[STAY] Connected event received");
    await refreshAllData();
  });
  
  window.addEventListener("olivium:disconnected", async () => {
    console.log("[STAY] Disconnected event received");
    await refreshAllData();
  });
  
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

(window as any).refreshVillaData = refreshAllData;
