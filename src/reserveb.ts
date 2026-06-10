/**
 * reserveb.ts — Olivium DAO
 * ─────────────────────────────────────────────────────────────────────────────
 * Responsibilities:
 *  • Email auth flow (signup / login with TOTP QR)
 *  • Identity / balance pill UI (single definition, no duplicates)
 *  • Connect button behaviour (open modal vs disconnect)
 *  • Connect modal (wallet button + email tab routing)
 *  • Modal open/close helpers exposed on window
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
// AUTH STORE
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
// MOBILE MENU
// ═══════════════════════════════════════════════════════════════════════════

document.getElementById("mobileMenuBtn")?.addEventListener("click", () => {
  const menu = document.getElementById("mobileMenuOverlay");
  const btn  = document.getElementById("mobileMenuBtn");
  menu?.classList.toggle("open");
  btn?.classList.toggle("open");
  document.body.style.overflow = menu?.classList.contains("open") ? "hidden" : "";
});

function closeMobileMenu() {
  document.getElementById("mobileMenuOverlay")?.classList.remove("open");
  document.getElementById("mobileMenuBtn")?.classList.remove("open");
  document.body.style.overflow = "";
}
(window as any).closeMobileMenu = closeMobileMenu;

// ═══════════════════════════════════════════════════════════════════════════
// IDENTITY UI — THE SINGLE AUTHORITATIVE RENDERER
// ═══════════════════════════════════════════════════════════════════════════

export async function updateIdentityBalanceUI(): Promise<void> {
  try {
    const identity = getIdentity();
    const pillEl = document.getElementById("identityPill");
    const stat = document.getElementById("identityTypeStat");
    const connectBtn = document.getElementById("connectBtn") as HTMLButtonElement | null;
    const navIdentity = document.getElementById("nav-identity-display");
    const navIdentityMob = document.getElementById("nav-identity-display-mob");
    const mobileIdentity = document.getElementById("mobile-identity-display");
    const mobileTier = document.getElementById("mobile-tier-label");
    const navTier = document.getElementById("nav-tier-label");
    const navTierMob = document.getElementById("nav-tier-label-mob");

    if (identity.type === "guest") {
      if (pillEl) pillEl.innerHTML = "🌿 Guest Mode";
      if (stat) stat.innerHTML = "Guest";
      if (connectBtn) {
        connectBtn.textContent = "Connect Profile";
        connectBtn.style.color = "white";
        connectBtn.style.border = "";
        connectBtn.style.background = "var(--green)";
        connectBtn.disabled = false;
      }
      if (navIdentity) navIdentity.textContent = "NOT CONNECTED";
      if (navIdentityMob) navIdentityMob.textContent = "NOT CONNECTED";
      if (mobileIdentity) mobileIdentity.textContent = "NOT CONNECTED";
      if (navTier) navTier.textContent = "Guest Mode";
      if (navTierMob) navTierMob.textContent = "Guest";
      if (mobileTier) mobileTier.textContent = "Guest Mode";
      return;
    }

    if (identity.type === "email") {
      if (pillEl) pillEl.innerHTML = `✉️ ${identity.label}`;
      if (stat) stat.innerHTML = "Email Secured";
      if (connectBtn) {
        connectBtn.textContent = "Disconnect";
        connectBtn.style.color = "#d94d4d";
        connectBtn.style.border = "1px solid #d94d4d";
        connectBtn.style.background = "transparent";
        connectBtn.disabled = false;
      }
      if (navIdentity) navIdentity.textContent = "CONNECTED";
      if (navIdentityMob) navIdentityMob.textContent = "CONNECTED";
      if (mobileIdentity) mobileIdentity.textContent = "CONNECTED";
      if (navTier) navTier.textContent = "Email Secured";
      if (navTierMob) navTierMob.textContent = "Email";
      if (mobileTier) mobileTier.textContent = "Email Secured";
      return;
    }

    if (identity.type === "wallet" && identity.wallet) {
      const short = identity.label;
      if (pillEl) pillEl.innerHTML = `🔑 ${short} · ◎ …`;
      if (stat) stat.innerHTML = "Wallet Mode";
      if (connectBtn) {
        connectBtn.textContent = "Disconnect";
        connectBtn.style.color = "#d94d4d";
        connectBtn.style.border = "1px solid #d94d4d";
        connectBtn.style.background = "transparent";
        connectBtn.disabled = false;
      }
      if (navIdentity) navIdentity.textContent = "CONNECTED";
      if (navIdentityMob) navIdentityMob.textContent = "CONNECTED";
      if (mobileIdentity) mobileIdentity.textContent = "CONNECTED";
      if (navTier) navTier.textContent = "Wallet Mode";
      if (navTierMob) navTierMob.textContent = "Wallet";
      if (mobileTier) mobileTier.textContent = "Wallet Mode";

      try {
        const lamports = await connection.getBalance(new PublicKey(identity.wallet));
        const solBalance = (lamports / 1_000_000_000).toFixed(3);
        if (getIdentity().type === "wallet" && pillEl) {
          pillEl.innerHTML = `◎ ${solBalance} SOL <span style="opacity:.5;margin:0 6px">|</span> 🔑 ${short}`;
        }
      } catch {
        // Balance unavailable
      }
    }
  } catch (err) {
    console.error("[updateIdentityBalanceUI]", err);
  }
}

// Force UI refresh helper
export async function forceRefreshUI() {
  console.log("🔄 FORCE REFRESHING UI...");
  const identity = getIdentity();
  console.log("Current identity from connection.ts:", identity);
  await updateIdentityBalanceUI();
  if (typeof (window as any).updateStatsUI === 'function') {
    await (window as any).updateStatsUI();
  }
  if (typeof (window as any).loadTrees === 'function') {
    (window as any).loadTrees('my');
  }
  console.log("✅ UI refresh complete");
}

(window as any).updateIdentityBalanceUI = updateIdentityBalanceUI;
(window as any).refreshIdentityUI = updateIdentityBalanceUI;
(window as any).forceRefreshUI = forceRefreshUI;

// ═══════════════════════════════════════════════════════════════════════════
// PASSWORD VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

interface MetricEntry { reg: RegExp; el: HTMLElement | null; }

const metrics: Record<string, MetricEntry> = {
  len: { reg: /.{6,}/, el: null },
  cap: { reg: /[A-Z]/, el: null },
  low: { reg: /[a-z]/, el: null },
  num: { reg: /[0-9]/, el: null },
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
  passEl: HTMLInputElement | null,
  confirmEl: HTMLInputElement | null,
  emailEl: HTMLInputElement | null,
  btnEl: HTMLButtonElement | null,
) {
  const pass = passEl?.value ?? "";
  const confirm = confirmEl?.value ?? "";
  let allPass = true;

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

  const matches = pass === confirm && pass.length > 0;
  const hasEmail = (emailEl?.value.trim().length ?? 0) > 0;

  if (btnEl) {
    btnEl.disabled = !(allPass && matches && hasEmail);
    btnEl.style.background = btnEl.disabled ? "#cccccc" : "var(--green)";
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL HELPERS
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

(window as any).closeModal = closeModal;
(window as any).closeAgreement = closeModal;
(window as any).closeConnectModal = closeConnectModal;

// ═══════════════════════════════════════════════════════════════════════════
// DISCONNECT HELPER
// ═══════════════════════════════════════════════════════════════════════════

export async function handleDisconnectWorkflow() {
  await disconnectWallet();
}
(window as any).handleDisconnectWorkflow = handleDisconnectWorkflow;

// ═══════════════════════════════════════════════════════════════════════════
// DOM INITIALISATION
// ═══════════════════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {
  initMetrics();
  _wireConnectButton();
  _wireWalletConnectButton();
  _wireAuthModal();
  updateIdentityBalanceUI();

  const activeFilter = document.querySelector<HTMLElement>(".filter-btn.active");
  if (activeFilter?.dataset.filter === "my" && !isConnected()) {
    const allBtn = document.querySelector<HTMLElement>('[data-filter="all"]');
    allBtn?.click();
  }
});

function _wireConnectButton() {
  const btn = document.getElementById("connectBtn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    if (isConnected()) {
      btn.textContent = "Disconnecting…";
      (btn as HTMLButtonElement).disabled = true;
      try {
        await handleDisconnectWorkflow();
      } finally {
        (btn as HTMLButtonElement).disabled = false;
      }
    } else {
      const modal = document.getElementById("connectModal");
      if (modal) modal.style.display = "flex";
    }
  });
}

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
  el.style.color = ok ? "#2e7d32" : "#d94d4d";
}

function _wireAuthModal() {
  const loginTab = document.getElementById("loginTab");
  const signupTab = document.getElementById("signupTab");
  const loginForm = document.getElementById("loginForm") as HTMLElement | null;
  const signupForm = document.getElementById("signupForm") as HTMLElement | null;
  const passEl = document.getElementById("signupPassword") as HTMLInputElement | null;
  const confirmEl = document.getElementById("signupConfirmPassword") as HTMLInputElement | null;
  const emailEl = document.getElementById("signupEmail") as HTMLInputElement | null;
  const signupBtn = document.getElementById("signupBtn") as HTMLButtonElement | null;

  // Open modal from email button
  document.getElementById("emailLoginBtn")?.addEventListener("click", () => {
    const connectModal = document.getElementById("connectModal");
    if (connectModal) connectModal.style.display = "none";
    const overlay = document.getElementById("authModalOverlay");
    if (overlay) overlay.style.display = "flex";
    show("");
    
    if (loginTab && signupTab && loginForm && signupForm) {
      loginTab.style.background = "var(--green)";
      loginTab.style.color = "white";
      signupTab.style.background = "transparent";
      signupTab.style.color = "var(--text)";
      loginForm.style.display = "block";
      signupForm.style.display = "none";
    }
  });

  // Close modal
  document.getElementById("closeAuthModal")?.addEventListener("click", () => {
    const overlay = document.getElementById("authModalOverlay");
    if (overlay) overlay.style.display = "none";
    const signupOtpBox = document.getElementById("signupOtpBox");
    const qrContainer = document.getElementById("qr");
    if (signupOtpBox) signupOtpBox.style.display = "none";
    if (qrContainer) qrContainer.innerHTML = "";
    const msg = document.getElementById("msg");
    if (msg) msg.textContent = "";
  });

  // Click outside to close
  document.getElementById("authModalOverlay")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) {
      (e.currentTarget as HTMLElement).style.display = "none";
      const signupOtpBox = document.getElementById("signupOtpBox");
      const qrContainer = document.getElementById("qr");
      if (signupOtpBox) signupOtpBox.style.display = "none";
      if (qrContainer) qrContainer.innerHTML = "";
    }
  });

  // Tab switching
  loginTab?.addEventListener("click", () => {
    if (!loginTab || !signupTab || !loginForm || !signupForm) return;
    loginTab.style.background = "var(--green)";
    loginTab.style.color = "white";
    signupTab.style.background = "transparent";
    signupTab.style.color = "var(--text)";
    loginForm.style.display = "block";
    signupForm.style.display = "none";
    show("");
    
    const signupOtpBox = document.getElementById("signupOtpBox");
    const qrContainer = document.getElementById("qr");
    if (signupOtpBox) signupOtpBox.style.display = "none";
    if (qrContainer) qrContainer.innerHTML = "";
  });

  signupTab?.addEventListener("click", () => {
    if (!loginTab || !signupTab || !loginForm || !signupForm) return;
    signupTab.style.background = "var(--green)";
    signupTab.style.color = "white";
    loginTab.style.background = "transparent";
    loginTab.style.color = "var(--text)";
    signupForm.style.display = "block";
    loginForm.style.display = "none";
    show("");
    
    if (emailEl) emailEl.value = "";
    if (passEl) passEl.value = "";
    if (confirmEl) confirmEl.value = "";
    
    const signupOtpBox = document.getElementById("signupOtpBox");
    const qrContainer = document.getElementById("qr");
    if (signupOtpBox) signupOtpBox.style.display = "none";
    if (qrContainer) qrContainer.innerHTML = "";
    
    validateSignupForm(passEl, confirmEl, emailEl, signupBtn);
  });

  passEl?.addEventListener("input", () => validateSignupForm(passEl, confirmEl, emailEl, signupBtn));
  confirmEl?.addEventListener("input", () => validateSignupForm(passEl, confirmEl, emailEl, signupBtn));
  emailEl?.addEventListener("input", () => validateSignupForm(passEl, confirmEl, emailEl, signupBtn));

  // ==================== SIGNUP FLOW ====================
  
  signupBtn?.addEventListener("click", async () => {
    const emailVal = emailEl?.value.trim().toLowerCase() ?? "";
    const passwordVal = passEl?.value.trim() ?? "";

    if (!emailVal || !passwordVal) {
      show("Please complete both Email and Password fields.", false);
      return;
    }

    show("🔐 Generating secure cryptographic identity…", true);
    
    const qrContainer = document.getElementById("qr");
    const signupOtpBox = document.getElementById("signupOtpBox");
    
    if (qrContainer) {
      qrContainer.innerHTML = "";
      qrContainer.style.minHeight = "200px";
    }
    
    if (signupOtpBox) {
      signupOtpBox.style.display = "none";
    }

    try {
      const seed = `${emailVal}:${passwordVal}:${SECRET_SEED}`;
      const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed));
      const kp = Keypair.fromSeed(new Uint8Array(hash));
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

      if (signupOtpBox) {
        signupOtpBox.style.display = "block";
      }
      
      (window as any)._pendingSignup = {
        email: emailVal,
        password: passwordVal,
        wallet: _generatedCustodialWallet
      };
      
      show("📱 Scan QR code with Google Authenticator, then enter the 6-digit code below", true);
      
    } catch (err) {
      console.error("Key derivation failed:", err);
      show("Failed to generate credentials.", false);
    }
  });

  // SIGNUP - Verify OTP
  const verifySignupBtn = document.getElementById("verifySignupOtp");
  if (verifySignupBtn) {
    const newVerifyBtn = verifySignupBtn.cloneNode(true);
    verifySignupBtn.parentNode?.replaceChild(newVerifyBtn, verifySignupBtn);
    
    newVerifyBtn.addEventListener("click", async () => {
      const emailVal = emailEl?.value.trim().toLowerCase() ?? "";
      const otpInput = document.getElementById("signupOtp") as HTMLInputElement | null;
      const enteredOtp = otpInput?.value.trim() ?? "";

      if (!enteredOtp || enteredOtp.length < 6) {
        show("Please enter your 6-digit authenticator code.", false);
        return;
      }

      show("✅ Verifying code and creating your account…", true);

      try {
        const pending = (window as any)._pendingSignup;
        if (!pending) {
          show("Session expired. Please try signing up again.", false);
          return;
        }
        
        const { error } = await sb.from("users").insert([{
          Email_address: emailVal,
          wallet: pending.wallet,
          token: SECRET_SEED,
          credits: 0,
        }]);

        if (error && error.code !== "23505") throw error;
        
        if (error && error.code === "23505") {
          show("⚠️ Email already registered. Please login instead.", false);
          return;
        }

        show("✅ Account created! Logging you in...", true);

        try {
          await connectEmail(pending.email, pending.wallet);
          
          (window as any).OliviumAuth.setUser({ 
            email: pending.email, 
            tier: "Standard",
            wallet: pending.wallet
          });
          
          show("✅ Login successful! Loading your grove…", true);
          
          setTimeout(async () => {
            const overlay = document.getElementById("authModalOverlay");
            if (overlay) overlay.style.display = "none";
            
            await forceRefreshUI();
            
            window.dispatchEvent(new CustomEvent("olivium:connected", { 
              detail: { type: "email", email: pending.email }
            }));
            
            delete (window as any)._pendingSignup;
            
            const signupOtpBox = document.getElementById("signupOtpBox");
            const qrContainer = document.getElementById("qr");
            if (signupOtpBox) signupOtpBox.style.display = "none";
            if (qrContainer) qrContainer.innerHTML = "";
            if (otpInput) otpInput.value = "";
            
            const msg = document.getElementById("msg");
            if (msg) msg.textContent = "";
            
            setTimeout(() => {
              console.log("Post-login identity check:", getIdentity());
              forceRefreshUI();
            }, 500);
          }, 500);
          
        } catch (loginErr) {
          console.error("Auto-login failed:", loginErr);
          show("Account created but auto-login failed. Please login manually.", false);
          
          setTimeout(() => {
            loginTab?.click();
            const loginEmailInput = document.getElementById("loginEmail") as HTMLInputElement | null;
            if (loginEmailInput) loginEmailInput.value = emailVal;
          }, 2000);
        }
        
      } catch (err: any) {
        console.error("Signup DB error:", err);
        show(`Registration failed: ${err.message || "unknown error"}`, false);
      }
    });
  }

  // ==================== LOGIN FLOW ====================
  
  document.getElementById("loginBtn")?.addEventListener("click", () => {
    const loginEmailInput = document.getElementById("loginEmail") as HTMLInputElement | null;
    const loginPasswordInput = document.getElementById("loginPassword") as HTMLInputElement | null;

    if (!loginEmailInput?.value.trim() || !loginPasswordInput?.value.trim()) {
      show("Please fill in your credentials.", false);
      return;
    }
    show("📱 Enter your 6-digit authenticator code below.", true);
    const loginOtpBox = document.getElementById("loginOtpBox");
    if (loginOtpBox) loginOtpBox.style.display = "block";
  });

  // LOGIN - Verify OTP
  const verifyLoginBtn = document.getElementById("verifyLoginOtp");
  if (verifyLoginBtn) {
    const newVerifyLoginBtn = verifyLoginBtn.cloneNode(true);
    verifyLoginBtn.parentNode?.replaceChild(newVerifyLoginBtn, verifyLoginBtn);
    
    newVerifyLoginBtn.addEventListener("click", async () => {
      const loginEmailInput = document.getElementById("loginEmail") as HTMLInputElement | null;
      const loginPasswordInput = document.getElementById("loginPassword") as HTMLInputElement | null;
      const emailVal = loginEmailInput?.value.trim().toLowerCase() ?? "";
      const passwordVal = loginPasswordInput?.value.trim() ?? "";

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
        
        if (custodialWallet !== expectedWallet) {
          show("Invalid email or password. Please try again.", false);
          return;
        }

        await connectEmail(emailVal, custodialWallet);
        
        (window as any).OliviumAuth.setUser({ 
          email: emailVal, 
          tier: "Standard",
          wallet: custodialWallet
        });

        show("✅ Login successful! Loading your grove…", true);

        setTimeout(async () => {
          const overlay = document.getElementById("authModalOverlay");
          if (overlay) overlay.style.display = "none";
          
          await forceRefreshUI();
          
          window.dispatchEvent(new CustomEvent("olivium:connected", { 
            detail: { type: "email", email: emailVal }
          }));
          
          const loginOtpBox = document.getElementById("loginOtpBox");
          if (loginOtpBox) loginOtpBox.style.display = "none";
          
          if (otpInput) otpInput.value = "";
          if (loginPasswordInput) loginPasswordInput.value = "";
          
          const msg = document.getElementById("msg");
          if (msg) msg.textContent = "";
          
          setTimeout(() => {
            console.log("Post-login identity check:", getIdentity());
            forceRefreshUI();
          }, 500);
        }, 500);

      } catch (err: any) {
        console.error("Login error:", err);
        show(`Authentication failed: ${err.message || "Please try again"}`, false);
      }
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL HELPERS (purchase / agreement modals)
// ═══════════════════════════════════════════════════════════════════════════

function closeModal() {
  const el = document.getElementById("modalOverlay");
  if (el) el.style.display = "none";
  document.body.style.overflow = "";
}

function closeAgreement() {
  const agreementModal = document.getElementById("agreementModal");
  const selectionModal = document.getElementById("modalOverlay");
  if (agreementModal) agreementModal.style.display = "none";
  if (selectionModal) selectionModal.style.display = "flex";
  document.body.style.overflow = "";
}

function closeConnectModal() {
  const el = document.getElementById("connectModal");
  if (el) el.style.display = "none";
}

function closeSuccess() {
  const el = document.getElementById("successModal");
  if (el) el.style.display = "none";
  document.body.style.overflow = "";
}

function closeRelease() {
  const el = document.getElementById("releaseModal");
  if (el) el.style.display = "none";
  document.body.style.overflow = "";
}

(window as any).closeModal = closeModal;
(window as any).closeAgreement = closeAgreement;
(window as any).closeConnectModal = closeConnectModal;
(window as any).closeSuccess = closeSuccess;
(window as any).closeRelease = closeRelease;

// ═══════════════════════════════════════════════════════════════════════════
// CANONICAL EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════════════════

window.addEventListener("olivium:connected", () => updateIdentityBalanceUI());
window.addEventListener("olivium:disconnected", () => updateIdentityBalanceUI());

window.addEventListener("solana:connection-complete", (e: Event) => {
  const detail = (e as CustomEvent).detail ?? {};
  window.dispatchEvent(new CustomEvent("olivium:connected", { detail }));
});

document.addEventListener("click", (e) => {
  const el = e.target as HTMLElement;
  console.log("%c[CLICK]", "color:#C5A059;font-weight:bold;", {
    tag: el.tagName,
    id: el.id || null,
    class: el.className || null,
    text: el.innerText?.trim()?.slice(0, 40) || null
  });
});
