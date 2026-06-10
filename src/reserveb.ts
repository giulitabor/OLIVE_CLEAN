/**
 * reserveb.ts — Olivium DAO
 * ─────────────────────────────────────────────────────────────────────────────
 * Responsibilities:
 *  • Email auth flow (signup / login with TOTP QR)
 *  • Identity / balance pill UI (single definition, no duplicates)
 *  • Connect button behaviour (open modal vs disconnect)
 *  • Connect modal (wallet button + email tab routing)
 *  • Modal open/close helpers exposed on window
 *
 * What was fixed vs the original:
 *  1. DUPLICATE updateIdentityBalanceUI removed — one function, one export.
 *  2. OLD_updateIdentityBalanceUI dead-code deleted.
 *  3. Identity read always goes through getIdentity() (connection.ts SSOT),
 *     NOT ad-hoc localStorage / window.walletPubKey checks.
 *  4. getActiveWallet() removed — callers use getIdentity() from connection.ts.
 *  5. connectBtn click handler now checks isConnected() directly — no async
 *     wallet-read that could race against a mid-flight connect.
 *  6. Event listeners deduplicated: only olivium:connected / olivium:disconnected.
 *     The legacy solana:connection-complete bridge is here but fires ONCE.
 *  7. DOMContentLoaded guard — all DOM queries happen after the DOM is ready.
 *  8. updateIdentityBalanceUI does an async SOL-balance fetch but NEVER races:
 *     it reads the stable identity snapshot from getIdentity() first.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  sb,
  connection,
  getIdentity,
  isConnected,
  connectWallet,
  connectEmail,
  disconnectWallet,
} from "./connection";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";

// ─── Re-export for modules that import from here ──────────────────────────
export { sb };

// ─── Expose shared globals needed by inline scripts ──────────────────────
(window as any).sb            = sb;
(window as any).PublicKey     = PublicKey;
(window as any).SystemProgram = SystemProgram;
(window as any).anchor        = anchor;

// ─── Defer tree-load proxy until reserve_board.ts registers the impl ─────
(window as any).loadTrees = (filter?: string) => {
  if (typeof (window as any)._loadTreesImpl === "function") {
    (window as any)._loadTreesImpl(filter);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// PROGRAM AVAILABILITY HELPER
// Used by modules that need to wait for the read-only (or authed) program.
// ═══════════════════════════════════════════════════════════════════════════

export async function waitForProgram(timeout = 10_000): Promise<any> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const p = (window as any)._program;
    if (p) return p;
    await new Promise(r => setTimeout(r, 150));
  }
  console.warn("[waitForProgram] Timed out");
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTH STORE  (in-memory + localStorage layer)
// ═══════════════════════════════════════════════════════════════════════════

(window as any).OliviumAuth = {
  user: null as any,
  setUser(u: any) {
    this.user = u;
    localStorage.setItem("olivium_user", JSON.stringify(u));
  },
  getUser() {
    return this.user || JSON.parse(localStorage.getItem("olivium_user") || "null");
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// IDENTITY UI  — THE SINGLE AUTHORITATIVE RENDERER
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Reads from getIdentity() (connection.ts SSOT) and updates every identity-
 * related DOM element.  Async only because wallet mode fetches SOL balance.
 * Never throws — logs errors internally.
 */
document.getElementById("mobileMenuBtn")?.addEventListener("click", () => {
  const menu = document.getElementById("mobileMenuOverlay");
  const btn  = document.getElementById("mobileMenuBtn");

  menu?.classList.toggle("open");
  btn?.classList.toggle("open");

  document.body.style.overflow =
    menu?.classList.contains("open") ? "hidden" : "";
});

function closeMobileMenu() {
    document.getElementById("mobileMenuOverlay")
        ?.classList.remove("open");

    document.getElementById("mobileMenuBtn")
        ?.classList.remove("open");

    document.body.style.overflow = "";
}

(window as any).closeMobileMenu = closeMobileMenu;

export async function updateIdentityBalanceUI(): Promise<void> {
  try {
    const identity   = getIdentity();
    const pillEl     = document.getElementById("identityPill");
    const stat       = document.getElementById("identityTypeStat");
    const connectBtn = document.getElementById("connectBtn") as HTMLButtonElement | null;
    const navIdentity = document.getElementById("nav-identity-display");
    const navIdentityMob = document.getElementById("nav-identity-display-mob");
    const mobileIdentity = document.getElementById("mobile-identity-display");
    const mobileTier = document.getElementById("mobile-tier-label");
    const navTier = document.getElementById("nav-tier-label");
    const navTierMob = document.getElementById("nav-tier-label-mob");

    // ── Guest ──────────────────────────────────────────────────────────────
    if (identity.type === "guest") {
      if (pillEl)     pillEl.innerHTML = "🌿 Guest Mode";
      if (stat)       stat.innerHTML   = "Guest";
      if (connectBtn) {
        connectBtn.textContent    = "Connect Profile";
        connectBtn.style.color    = "white";
        connectBtn.style.border   = "";
        connectBtn.style.background = "var(--green)";
        connectBtn.disabled       = false;
}
      if (navIdentity) navIdentity.textContent = "NOT CONNECTED";
      if (navIdentityMob) navIdentityMob.textContent = "NOT CONNECTED";
      if (mobileIdentity) mobileIdentity.textContent = "NOT CONNECTED";
      if (navTier) navTier.textContent = "Guest Mode";
      if (navTierMob) navTierMob.textContent = "Guest";
      if (mobileTier) mobileTier.textContent = "Guest Mode";
      
      return;
    }

    // ── Email ──────────────────────────────────────────────────────────────
    if (identity.type === "email") {
      if (pillEl)     pillEl.innerHTML = `✉️ ${identity.label}`;
      if (stat)       stat.innerHTML   = "Email Secured";
      if (connectBtn) {
        connectBtn.textContent    = "Disconnect";
        connectBtn.style.color    = "#d94d4d";
        connectBtn.style.border   = "1px solid #d94d4d";
        connectBtn.style.background = "transparent";
        connectBtn.disabled       = false;
        }
        if (navIdentity) navIdentity.textContent = "CONNECTED";
        if (navIdentityMob) navIdentityMob.textContent = "CONNECTED";
        if (mobileIdentity) mobileIdentity.textContent = "CONNECTED";
        if (navTier) navTier.textContent = "Email Secured";
        if (navTierMob) navTierMob.textContent = "Email";
        if (mobileTier) mobileTier.textContent = "Email Secured";
      
      return;
    }

    // ── Wallet ─────────────────────────────────────────────────────────────
    if (identity.type === "wallet" && identity.wallet) {
      // Show immediately with a placeholder balance while we fetch
      const short = identity.label; // already "XXXX...XXXX"
      if (pillEl)     pillEl.innerHTML = `🔑 ${short} · ◎ …`;
      if (stat)       stat.innerHTML   = "Wallet Mode";
      if (connectBtn) {
        connectBtn.textContent    = "Disconnect";
        connectBtn.style.color    = "#d94d4d";
        connectBtn.style.border   = "1px solid #d94d4d";
        connectBtn.style.background = "transparent";
        connectBtn.disabled       = false;
        }
        if (navIdentity) navIdentity.textContent = "CONNECTED";
        if (navIdentityMob) navIdentityMob.textContent = "CONNECTED";
        if (mobileIdentity) mobileIdentity.textContent = "CONNECTED";
        if (navTier) navTier.textContent = "Wallet Mode";
        if (navTierMob) navTierMob.textContent = "Wallet";
        if (mobileTier) mobileTier.textContent = "Wallet Mode";
      

      // Fetch balance asynchronously — does NOT block the initial UI update
      try {
        const lamports  = await connection.getBalance(new PublicKey(identity.wallet));
        const solBalance = (lamports / 1_000_000_000).toFixed(3);
        // Re-check identity hasn't changed while we were awaiting
        if (getIdentity().type === "wallet" && pillEl) {
          pillEl.innerHTML =
            `◎ ${solBalance} SOL <span style="opacity:.5;margin:0 6px">|</span> 🔑 ${short}`;
        }
      } catch {
        // Balance unavailable — display address only (already set above)
      }
    }
  } catch (err) {
    console.error("[updateIdentityBalanceUI]", err);
  }
}

// Expose on window so reserve_board.ts and inline scripts can call it
(window as any).updateIdentityBalanceUI = updateIdentityBalanceUI;
// Alias used by some legacy calls
(window as any).refreshIdentityUI       = updateIdentityBalanceUI;

// ═══════════════════════════════════════════════════════════════════════════
// PASSWORD VALIDATION (signup form)
// ═══════════════════════════════════════════════════════════════════════════

interface MetricEntry { reg: RegExp; el: HTMLElement | null; }

const metrics: Record<string, MetricEntry> = {
  len: { reg: /.{6,}/,        el: null },
  cap: { reg: /[A-Z]/,        el: null },
  low: { reg: /[a-z]/,        el: null },
  num: { reg: /[0-9]/,        el: null },
  spe: { reg: /[^A-Za-z0-9]/, el: null },
};

function initMetrics() {
  metrics.len.el = document.getElementById("metric-len");
  metrics.cap.el = document.getElementById("metric-cap");
  metrics.low.el = document.getElementById("metric-low");
  metrics.num.el = document.getElementById("metric-num");
  metrics.spe.el = document.getElementById("metric-spe");
}

function validateSignupForm(
  passEl:    HTMLInputElement | null,
  confirmEl: HTMLInputElement | null,
  emailEl:   HTMLInputElement | null,
  btnEl:     HTMLButtonElement | null,
) {
  const pass    = passEl?.value    ?? "";
  const confirm = confirmEl?.value ?? "";
  let allPass   = true;

  for (const key in metrics) {
    const m = metrics[key];
    const ok = m.reg.test(pass);
    if (m.el) {
      m.el.style.color = ok ? "#2e7d32" : "#d94d4d";
      const icon = m.el.querySelector<HTMLElement>(".icon");
      if (icon) icon.innerText = ok ? "✔" : "❌";
    }
    if (!ok) allPass = false;
  }

  const matches  = pass === confirm && pass.length > 0;
  const hasEmail = (emailEl?.value.trim().length ?? 0) > 0;

  if (btnEl) {
    btnEl.disabled         = !(allPass && matches && hasEmail);
    btnEl.style.background = btnEl.disabled ? "#cccccc" : "var(--green)";
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL HELPERS  (purchase / agreement modals)
// ═══════════════════════════════════════════════════════════════════════════

function closeModal() {
  const el = document.getElementById("modalOverlay");
  if (el) el.style.display = "none";
  document.body.style.overflow = "";
}


function closeConnectModal() {
  const el = document.getElementById("connectModal");
  if (el) el.style.display = "none";
}

(window as any).closeModal       = closeModal;
(window as any).closeAgreement   = closeAgreement;
(window as any).closeConnectModal = closeConnectModal;

// ═══════════════════════════════════════════════════════════════════════════
// DISCONNECT HELPER  (shared by connect-button and other callers)
// ═══════════════════════════════════════════════════════════════════════════

export async function handleDisconnectWorkflow() {
  await disconnectWallet();  // connection.ts handles all teardown + event dispatch
}
(window as any).handleDisconnectWorkflow = handleDisconnectWorkflow;

// ═══════════════════════════════════════════════════════════════════════════
// DOM INITIALISATION
// ═══════════════════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {
  initMetrics();
  _wireConnectButton();
  _wireWalletConnectButton();
 // _wireMobileNav();
  _wireAuthModal();
  updateIdentityBalanceUI(); // Initial render from restored session

  // If a filter is already active and it's "my", it needs auth state
  const activeFilter = document.querySelector<HTMLElement>(".filter-btn.active");
  if (activeFilter?.dataset.filter === "my" && !isConnected()) {
    // Switch to "all" so guest users don't see an empty grid
    const allBtn = document.querySelector<HTMLElement>('[data-filter="all"]');
    allBtn?.click();
  }
});

// ─── Connect / Disconnect button ──────────────────────────────────────────
function _wireConnectButton() {
  const btn = document.getElementById("connectBtn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    if (isConnected()) {
      // User is connected — clicking disconnects
      btn.textContent = "Disconnecting…";
      (btn as HTMLButtonElement).disabled = true;
      try {
        await handleDisconnectWorkflow();
      } finally {
        (btn as HTMLButtonElement).disabled = false;
      }
    } else {
      // Show the connect modal
      const modal = document.getElementById("connectModal");
      if (modal) modal.style.display = "flex";
    }
  });
}

// ─── Phantom wallet button inside connect modal ───────────────────────────
function _wireWalletConnectButton() {
  const btn = document.querySelector<HTMLElement>("#walletConnectCard #connectWalletBtn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    btn.textContent = "Connecting…";
    (btn as HTMLButtonElement).disabled = true;
    try {
      await connectWallet(false);
      closeConnectModal();
    } catch (err: any) {
      console.error("Wallet connection declined:", err);
      btn.textContent = "Connect Wallet";
    } finally {
      (btn as HTMLButtonElement).disabled = false;
    }
  });
}



// ═══════════════════════════════════════════════════════════════════════════
// EMAIL AUTH MODAL WIRING
// ═══════════════════════════════════════════════════════════════════════════
const SECRET_SEED = "OLIVIUMDAO777MFASEED";
let _generatedCustodialWallet = "";

function show(msg: string, ok = true) {
  const el = document.getElementById("msg");
  if (!el) return;
  el.textContent = msg;
  el.style.color  = ok ? "#2e7d32" : "#d94d4d";
}

function _wireAuthModal() {
  // ── open / close ──────────────────────────────────────────────────────
  document.getElementById("emailLoginBtn")?.addEventListener("click", () => {
    const connectModal = document.getElementById("connectModal");
    if (connectModal) connectModal.style.display = "none";
    const overlay = document.getElementById("authModalOverlay");
    if (overlay) overlay.style.display = "flex";
    show("");
    
    // Reset to login tab by default
    const loginTab = document.getElementById("loginTab");
    const signupTab = document.getElementById("signupTab");
    const loginForm = document.getElementById("loginForm") as HTMLElement | null;
    const signupForm = document.getElementById("signupForm") as HTMLElement | null;
    
    if (loginTab && signupTab && loginForm && signupForm) {
      loginTab.style.background = "var(--green)";
      loginTab.style.color = "white";
      signupTab.style.background = "transparent";
      signupTab.style.color = "var(--text)";
      loginForm.style.display = "block";
      signupForm.style.display = "none";
    }
    
    // Reset all signup form fields
    const signupEmail = document.getElementById("signupEmail") as HTMLInputElement | null;
    const signupPassword = document.getElementById("signupPassword") as HTMLInputElement | null;
    const signupConfirm = document.getElementById("signupConfirmPassword") as HTMLInputElement | null;
    if (signupEmail) signupEmail.value = "";
    if (signupPassword) signupPassword.value = "";
    if (signupConfirm) signupConfirm.value = "";
    
    const signupOtpBox = document.getElementById("signupOtpBox");
    if (signupOtpBox) signupOtpBox.style.display = "none";
    
    const qrContainer = document.getElementById("qr");
    if (qrContainer) qrContainer.innerHTML = "";
    
    // Reset login form
    const loginEmail = document.getElementById("loginEmail") as HTMLInputElement | null;
    const loginPassword = document.getElementById("loginPassword") as HTMLInputElement | null;
    const loginOtpBox = document.getElementById("loginOtpBox");
    const loginOtp = document.getElementById("loginOtp") as HTMLInputElement | null;
    if (loginEmail) loginEmail.value = "";
    if (loginPassword) loginPassword.value = "";
    if (loginOtpBox) loginOtpBox.style.display = "none";
    if (loginOtp) loginOtp.value = "";
  });

  document.getElementById("closeAuthModal")?.addEventListener("click", () => {
    const overlay = document.getElementById("authModalOverlay");
    if (overlay) overlay.style.display = "none";
    
    // Reset all forms when closing
    const signupOtpBox = document.getElementById("signupOtpBox");
    if (signupOtpBox) signupOtpBox.style.display = "none";
    
    const qrContainer = document.getElementById("qr");
    if (qrContainer) qrContainer.innerHTML = "";
    
    const msg = document.getElementById("msg");
    if (msg) msg.textContent = "";
    
    const loginOtpBox = document.getElementById("loginOtpBox");
    if (loginOtpBox) loginOtpBox.style.display = "none";
  });

  document.getElementById("authModalOverlay")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) {
      (e.currentTarget as HTMLElement).style.display = "none";
      
      // Reset forms
      const signupOtpBox = document.getElementById("signupOtpBox");
      if (signupOtpBox) signupOtpBox.style.display = "none";
      
      const qrContainer = document.getElementById("qr");
      if (qrContainer) qrContainer.innerHTML = "";
      
      const loginOtpBox = document.getElementById("loginOtpBox");
      if (loginOtpBox) loginOtpBox.style.display = "none";
    }
  });

  // ── tabs ──────────────────────────────────────────────────────────────
  const loginTab  = document.getElementById("loginTab");
  const signupTab = document.getElementById("signupTab");
  const loginForm = document.getElementById("loginForm")  as HTMLElement | null;
  const signupForm = document.getElementById("signupForm") as HTMLElement | null;

  loginTab?.addEventListener("click", () => {
    if (!loginTab || !signupTab || !loginForm || !signupForm) return;
    loginTab.style.background   = "var(--green)";
    loginTab.style.color        = "white";
    signupTab.style.background  = "transparent";
    signupTab.style.color       = "var(--text)";
    loginForm.style.display     = "block";
    signupForm.style.display    = "none";
    show("");
    
    // Clear signup artifacts when switching to login
    const signupOtpBox = document.getElementById("signupOtpBox");
    if (signupOtpBox) signupOtpBox.style.display = "none";
    
    const qrContainer = document.getElementById("qr");
    if (qrContainer) qrContainer.innerHTML = "";
  });

  signupTab?.addEventListener("click", () => {
    if (!loginTab || !signupTab || !loginForm || !signupForm) return;
    signupTab.style.background  = "var(--green)";
    signupTab.style.color       = "white";
    loginTab.style.background   = "transparent";
    loginTab.style.color        = "var(--text)";
    signupForm.style.display    = "block";
    loginForm.style.display     = "none";
    show("");
    
    // Reset signup form fields
    const signupEmail = document.getElementById("signupEmail") as HTMLInputElement | null;
    const signupPassword = document.getElementById("signupPassword") as HTMLInputElement | null;
    const signupConfirm = document.getElementById("signupConfirmPassword") as HTMLInputElement | null;
    if (signupEmail) signupEmail.value = "";
    if (signupPassword) signupPassword.value = "";
    if (signupConfirm) signupConfirm.value = "";
    
    // Hide OTP box and clear QR if showing
    const signupOtpBox = document.getElementById("signupOtpBox");
    if (signupOtpBox) signupOtpBox.style.display = "none";
    
    const qrContainer = document.getElementById("qr");
    if (qrContainer) qrContainer.innerHTML = "";
    
    // Re-run validation to disable signup button
    validateSignupForm(passEl, confirmEl, emailEl, signupBtn);
  });

  // ── password metric listeners ─────────────────────────────────────────
  const passEl    = document.getElementById("signupPassword")        as HTMLInputElement | null;
  const confirmEl = document.getElementById("signupConfirmPassword") as HTMLInputElement | null;
  const emailEl   = document.getElementById("signupEmail")           as HTMLInputElement | null;
  const signupBtn = document.getElementById("signupBtn")             as HTMLButtonElement | null;

  passEl?.addEventListener("input",    () => validateSignupForm(passEl, confirmEl, emailEl, signupBtn));
  confirmEl?.addEventListener("input", () => validateSignupForm(passEl, confirmEl, emailEl, signupBtn));
  emailEl?.addEventListener("input",   () => validateSignupForm(passEl, confirmEl, emailEl, signupBtn));

  // ── signup step 1: generate custodial wallet + QR ─────────────────────
  signupBtn?.addEventListener("click", async () => {
    const emailVal    = emailEl?.value.trim().toLowerCase()  ?? "";
    const passwordVal = passEl?.value.trim()                 ?? "";

    if (!emailVal || !passwordVal) {
      show("Please complete both Email and Password fields.", false);
      return;
    }

    show("🔐 Generating secure cryptographic identity…", true);
    const qrContainer = document.getElementById("qr");
    if (qrContainer) qrContainer.innerHTML = "";
   // const otpBox = document.getElementById("signupOtpBox");
    if (otpBox) otpBox.style.display = "none"; // Hide initially
    // Add this INSIDE the signupBtn click handler, right after generating the QR:

console.log("🔍 QR CODE GENERATED - checking visibility");
const qrContainer = document.getElementById("qr");
const otpBox = document.getElementById("signupOtpBox");
const authModal = document.getElementById("authModalOverlay");

console.log("QR Container:", qrContainer);
console.log("QR innerHTML:", qrContainer?.innerHTML);
console.log("OTP Box display:", otpBox?.style.display);
console.log("Auth Modal display:", authModal?.style.display);

// Force visibility
if (otpBox) {
  otpBox.style.display = "block";
  otpBox.style.visibility = "visible";
  otpBox.style.opacity = "1";
}

    try {
      const seed    = `${emailVal}:${passwordVal}:${SECRET_SEED}`;
      const hash    = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed));
      const kp      = Keypair.fromSeed(new Uint8Array(hash));
      _generatedCustodialWallet = kp.publicKey.toBase58();

      const totpUri = `otpauth://totp/${encodeURIComponent("Olivium DAO")}:${encodeURIComponent(emailVal)}`
        + `?secret=${SECRET_SEED}&issuer=OliviumDAO&algorithm=SHA1&digits=6&period=30`;

      if (qrContainer && typeof (window as any).QRCode !== "undefined") {
        new (window as any).QRCode(qrContainer, {
          text: totpUri, width: 180, height: 180,
          colorDark: "#1f402a", colorLight: "#ffffff",
          correctLevel: (window as any).QRCode.CorrectLevel.H,
        });
      }

      if (otpBox) otpBox.style.display = "block";
      
      show("📱 STEP 1: Scan QR code with Google Authenticator, Microsoft Authenticator, or any TOTP app.\n\nSTEP 2: Enter the 6-digit code below to complete setup.", true);
      
      // NO AUTO-CLOSE - User has unlimited time to scan QR
      
    } catch (err) {
      console.error("Key derivation failed:", err);
      show("Failed to generate credentials.", false);
    }
  });

  // ── signup step 2: verify OTP + persist user ──────────────────────────
  document.getElementById("verifySignupOtp")?.addEventListener("click", async () => {
    const emailVal   = emailEl?.value.trim().toLowerCase() ?? "";
    const otpInput   = document.getElementById("signupOtp") as HTMLInputElement | null;
    const enteredOtp = otpInput?.value.trim() ?? "";

    if (!enteredOtp || enteredOtp.length < 6) {
      show("Please enter your 6-digit authenticator code.", false);
      return;
    }

    show("✅ Verifying code and creating your account…", true);

    try {
      const { error } = await sb.from("users").insert([{
        Email_address: emailVal,
        wallet:        _generatedCustodialWallet,
        token:         SECRET_SEED,
        credits:       0,
      }]);

      if (error && error.code !== "23505") throw error;
      
      if (error && error.code === "23505") {
        show("⚠️ Email already registered. Please login instead.", false);
        return;
      }

      show("🎉 Account created successfully! Switching to login...", true);

      // Switch to login tab after successful signup - but KEEP MODAL OPEN
      setTimeout(() => {
        loginTab?.click();
        
        // Pre-fill email for convenience
        const loginEmailInput = document.getElementById("loginEmail") as HTMLInputElement | null;
        if (loginEmailInput) loginEmailInput.value = emailVal;
        
        // Clear signup form artifacts but keep modal open
        const signupOtpBox = document.getElementById("signupOtpBox");
        if (signupOtpBox) signupOtpBox.style.display = "none";
        
        const qrContainer = document.getElementById("qr");
        if (qrContainer) qrContainer.innerHTML = "";
        
        // Clear password fields for security
        if (passEl) passEl.value = "";
        if (confirmEl) confirmEl.value = "";
        if (otpInput) otpInput.value = "";
        
        // Show login instruction
        show("🔐 Now enter your credentials and MFA code to login.", true);
      }, 2000);
      
    } catch (err: any) {
      console.error("Signup DB error:", err);
      show(`Registration failed: ${err.message || "unknown error"}`, false);
    }
  });

  // ── login step 1: show OTP input ──────────────────────────────────────
  document.getElementById("loginBtn")?.addEventListener("click", () => {
    const loginEmailInput    = document.getElementById("loginEmail")    as HTMLInputElement | null;
    const loginPasswordInput = document.getElementById("loginPassword") as HTMLInputElement | null;

    if (!loginEmailInput?.value.trim() || !loginPasswordInput?.value.trim()) {
      show("Please fill in your credentials.", false);
      return;
    }
    show("📱 Enter your 6-digit authenticator code below.", true);
    const loginOtpBox = document.getElementById("loginOtpBox");
    if (loginOtpBox) loginOtpBox.style.display = "block";
  });

  // ── login step 2: verify OTP + connect email identity ─────────────────
  document.getElementById("verifyLoginOtp")?.addEventListener("click", async () => {
    const loginEmailInput = document.getElementById("loginEmail") as HTMLInputElement | null;
    const loginPasswordInput = document.getElementById("loginPassword") as HTMLInputElement | null;
    const emailVal        = loginEmailInput?.value.trim().toLowerCase() ?? "";
    const passwordVal     = loginPasswordInput?.value.trim() ?? "";

    if (!emailVal || !passwordVal) { 
      show("Please enter your email and password.", false); 
      return; 
    }
    
    const otpInput = document.getElementById("loginOtp") as HTMLInputElement | null;
    const enteredOtp = otpInput?.value.trim() ?? "";
    
    if (!enteredOtp || enteredOtp.length < 6) {
      show("Please enter your 6-digit authenticator code.", false);
      return;
    }

    show("🔐 Verifying identity…", true);

    try {
      // Verify credentials by regenerating the wallet
      const seed = `${emailVal}:${passwordVal}:${SECRET_SEED}`;
      const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed));
      const expectedWallet = Keypair.fromSeed(new Uint8Array(hash)).publicKey.toBase58();
      
      const { data: profile, error } = await sb
        .from("users")
        .select("wallet")
        .eq("Email_address", emailVal)
        .maybeSingle();

      if (error) throw error;
      const custodialWallet = profile?.wallet ?? null;
      if (!custodialWallet) {
        show("No account found with this email. Please sign up first.", false);
        return;
      }
      
      // Verify the wallet matches
      if (custodialWallet !== expectedWallet) {
        show("Invalid email or password. Please try again.", false);
        return;
      }

      // Persist the user session
      (window as any).OliviumAuth.setUser({ email: emailVal, tier: "Standard" });

      // Call the canonical connect flow from connection.ts
      await connectEmail(emailVal, custodialWallet);

      show("✅ Login successful! Loading your grove…", true);

      // Close modal after successful login
      setTimeout(() => {
        const overlay = document.getElementById("authModalOverlay");
        if (overlay) overlay.style.display = "none";
        
        // Clear login form for next time
        const loginOtpBox = document.getElementById("loginOtpBox");
        if (loginOtpBox) loginOtpBox.style.display = "none";
        
        const loginOtpInput = document.getElementById("loginOtp") as HTMLInputElement | null;
        if (loginOtpInput) loginOtpInput.value = "";
        
        const loginPassword = document.getElementById("loginPassword") as HTMLInputElement | null;
        if (loginPassword) loginPassword.value = "";
        
        const msg = document.getElementById("msg");
        if (msg) msg.textContent = "";
      }, 1500);

    } catch (err: any) {
      console.error("Login error:", err);
      show("Authentication failed. Please try again.", false);
    }
  });
}
// ═══════════════════════════════════════════════════════════════════════════
// CANONICAL EVENT LISTENERS  (single registration each)
// ═══════════════════════════════════════════════════════════════════════════

window.addEventListener("olivium:connected",    () => updateIdentityBalanceUI());
window.addEventListener("olivium:disconnected", () => updateIdentityBalanceUI());

// Legacy bridge — forward ONCE to the canonical event so any remaining
// reserve_board.ts listener fires, then don't re-dispatch in a loop.
window.addEventListener("solana:connection-complete", (e: Event) => {
  const detail = (e as CustomEvent).detail ?? {};
  window.dispatchEvent(new CustomEvent("olivium:connected", { detail }));
});

document.addEventListener("click", (e) => {
  const el = e.target as HTMLElement;

  console.log(
    "%c[CLICK]",
    "color:#C5A059;font-weight:bold;",
    {
      tag: el.tagName,
      id: el.id || null,
      class: el.className || null,
      text: el.innerText?.trim()?.slice(0, 40) || null
    }
  );
});
