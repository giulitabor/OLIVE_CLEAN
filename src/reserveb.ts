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
(window as any).sb = sb;
(window as any).PublicKey = PublicKey;
(window as any).SystemProgram = SystemProgram;
(window as any).anchor = anchor;

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
  const btn = document.getElementById("mobileMenuBtn");
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
        // Re-check identity is still wallet before updating — avoids stale write
        if (getIdentity().type === "wallet" && pillEl) {
          pillEl.innerHTML = `◎ ${solBalance} SOL <span style="opacity:.5;margin:0 6px">|</span> 🔑 ${short}`;
        }
      } catch {
        // Balance unavailable — pill already shows address, that's fine
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
  if (typeof (window as any).updateStatsUI === "function") {
    await (window as any).updateStatsUI();
  }
  if (typeof (window as any).loadTrees === "function") {
    (window as any).loadTrees("my");
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
// AUTH MODAL WIRING
// ═══════════════════════════════════════════════════════════════════════════

// FIX: SECRET_SEED is used only for wallet key derivation.
// It is NOT stored in the DB and NOT used as the TOTP secret.
// The TOTP secret must be a separate per-user value or a fixed app-level
// secret — here we keep it as a fixed app constant since the app currently
// relies on a single shared TOTP flow (Google Authenticator static seed).
const WALLET_DERIVE_SEED = "OLIVIUMDAO777WALLETDERIVE";
const TOTP_SECRET        = "OLIVIUMDAO777MFASEED";     // shown in QR only

function show(msg: string, ok = true) {
  const el = document.getElementById("msg");
  if (!el) return;
  el.textContent = msg;
  el.style.color = ok ? "#2e7d32" : "#d94d4d";
}

function _resetAuthModal() {
  const signupOtpBox = document.getElementById("signupOtpBox");
  const qrContainer  = document.getElementById("qr");
  const otpSignup    = document.getElementById("signupOtp") as HTMLInputElement | null;
  const otpLogin     = document.getElementById("loginOtp")  as HTMLInputElement | null;
  const loginOtpBox  = document.getElementById("loginOtpBox");
  if (signupOtpBox) signupOtpBox.style.display = "none";
  if (loginOtpBox)  loginOtpBox.style.display  = "none";
  if (qrContainer)  qrContainer.innerHTML      = "";
  if (otpSignup)    otpSignup.value             = "";
  if (otpLogin)     otpLogin.value              = "";
  const msg = document.getElementById("msg");
  if (msg) msg.textContent = "";
}

function _setVerifyBtnBusy(btn: Element | null, busy: boolean, label = "Verify Code") {
  if (!btn) return;
  (btn as HTMLButtonElement).disabled = busy;
  (btn as HTMLButtonElement).textContent = busy ? "Verifying…" : label;
}

function _wireAuthModal() {
  const loginTab  = document.getElementById("loginTab");
  const signupTab = document.getElementById("signupTab");
  const loginForm  = document.getElementById("loginForm")  as HTMLElement | null;
  const signupForm = document.getElementById("signupForm") as HTMLElement | null;
  const passEl    = document.getElementById("signupPassword")        as HTMLInputElement | null;
  const confirmEl = document.getElementById("signupConfirmPassword") as HTMLInputElement | null;
  const emailEl   = document.getElementById("signupEmail")           as HTMLInputElement | null;
  const signupBtn = document.getElementById("signupBtn")             as HTMLButtonElement | null;

  // ── helpers to switch tabs ────────────────────────────────────────────
  function showLoginTab() {
    if (!loginTab || !signupTab || !loginForm || !signupForm) return;
    loginTab.style.background  = "var(--green)"; loginTab.style.color  = "white";
    signupTab.style.background = "transparent";  signupTab.style.color = "var(--text)";
    loginForm.style.display  = "block";
    signupForm.style.display = "none";
    _resetAuthModal();
  }

  function showSignupTab() {
    if (!loginTab || !signupTab || !loginForm || !signupForm) return;
    signupTab.style.background = "var(--green)"; signupTab.style.color = "white";
    loginTab.style.background  = "transparent";  loginTab.style.color  = "var(--text)";
    signupForm.style.display = "block";
    loginForm.style.display  = "none";
    // FIX: clear fields when switching to signup tab
    if (emailEl)   emailEl.value   = "";
    if (passEl)    passEl.value    = "";
    if (confirmEl) confirmEl.value = "";
    _resetAuthModal();
    validateSignupForm(passEl, confirmEl, emailEl, signupBtn);
  }

  // ── open modal from email button ──────────────────────────────────────
  document.getElementById("emailLoginBtn")?.addEventListener("click", () => {
    const connectModal = document.getElementById("connectModal");
    if (connectModal) connectModal.style.display = "none";
    const overlay = document.getElementById("authModalOverlay");
    if (overlay) overlay.style.display = "flex";
    showLoginTab();
  });

  // ── close modal ───────────────────────────────────────────────────────
  function closeAuthModal() {
    const overlay = document.getElementById("authModalOverlay");
    if (overlay) overlay.style.display = "none";
    delete (window as any)._pendingSignup;
    _resetAuthModal();
  }

  document.getElementById("closeAuthModal")?.addEventListener("click", closeAuthModal);

  document.getElementById("authModalOverlay")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeAuthModal();
  });

  loginTab?.addEventListener("click",  showLoginTab);
  signupTab?.addEventListener("click", showSignupTab);

  passEl?.addEventListener("input",    () => validateSignupForm(passEl, confirmEl, emailEl, signupBtn));
  confirmEl?.addEventListener("input", () => validateSignupForm(passEl, confirmEl, emailEl, signupBtn));
  emailEl?.addEventListener("input",   () => validateSignupForm(passEl, confirmEl, emailEl, signupBtn));

  // ══════════════════════════════════════════════════════════════════════
  // SIGNUP FLOW
  // ══════════════════════════════════════════════════════════════════════

  signupBtn?.addEventListener("click", async () => {
    console.log("🔵 SIGNUP BUTTON CLICKED");
    const emailVal    = emailEl?.value.trim().toLowerCase() ?? "";
    const passwordVal = passEl?.value.trim() ?? "";

    if (!emailVal || !passwordVal) {
      show("Please complete both Email and Password fields.", false);
      return;
    }

    show("🔐 Generating secure cryptographic identity…", true);

    const qrContainer  = document.getElementById("qr");
    const signupOtpBox = document.getElementById("signupOtpBox");

    if (qrContainer)  { qrContainer.innerHTML  = ""; qrContainer.style.minHeight = "200px"; }
    if (signupOtpBox) signupOtpBox.style.display = "none";

    try {
      // FIX: use a dedicated seed constant for wallet derivation, not the
      // TOTP secret, so the two concerns are independent.
      const seed = `${emailVal}:${passwordVal}:${WALLET_DERIVE_SEED}`;
      const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed));
      const kp   = Keypair.fromSeed(new Uint8Array(hash));
      const derivedWallet = kp.publicKey.toBase58();
      console.log("🔑 Generated wallet:", derivedWallet);

      const totpUri =
        `otpauth://totp/${encodeURIComponent("Olivium DAO")}:${encodeURIComponent(emailVal)}`
        + `?secret=${TOTP_SECRET}&issuer=OliviumDAO&algorithm=SHA1&digits=6&period=30`;

      if (qrContainer && typeof (window as any).QRCode !== "undefined") {
        new (window as any).QRCode(qrContainer, {
          text: totpUri, width: 180, height: 180,
          colorDark: "#1f402a", colorLight: "#ffffff",
          correctLevel: (window as any).QRCode.CorrectLevel.H,
        });
        console.log("✅ QR Code created");
      }

      if (signupOtpBox) signupOtpBox.style.display = "block";

      // FIX: store wallet in _pendingSignup directly, not in a module-level
      // variable that could be clobbered by a second signup click.
      (window as any)._pendingSignup = { email: emailVal, password: passwordVal, wallet: derivedWallet };
      console.log("📦 Pending signup stored:", (window as any)._pendingSignup);

      show("📱 Scan QR code with Google Authenticator, then enter the 6-digit code below", true);

    } catch (err) {
      console.error("Key derivation failed:", err);
      show("Failed to generate credentials.", false);
    }
  });

  // ── Signup: verify OTP ─────────────────────────────────────────────────
  // FIX: removed cloneNode hack — listeners are wired once inside
  // DOMContentLoaded so duplicates are never an issue.
  const verifySignupBtn = document.getElementById("verifySignupOtp");
  verifySignupBtn?.addEventListener("click", async () => {
    console.log("🟢 SIGNUP VERIFY BUTTON CLICKED");

    // FIX: guard against double-submission
    if ((verifySignupBtn as HTMLButtonElement).disabled) return;

    const otpInput   = document.getElementById("signupOtp") as HTMLInputElement | null;
    const enteredOtp = otpInput?.value.trim() ?? "";

    if (!enteredOtp || enteredOtp.length < 6) {
      show("Please enter your 6-digit authenticator code.", false);
      return;
    }

    const pending = (window as any)._pendingSignup;
    if (!pending) {
      show("Session expired. Please fill in your details and click Sign Up again.", false);
      return;
    }

    _setVerifyBtnBusy(verifySignupBtn, true);
    show("✅ Verifying code and creating your account…", true);

    try {
      console.log("💾 Inserting user into Supabase…");
      const { error } = await sb.from("users").insert([{
        Email_address: pending.email,
        wallet:        pending.wallet,
        // FIX: do not store WALLET_DERIVE_SEED as token — store TOTP_SECRET
        // which is what the authenticator app was set up with.
        token:   TOTP_SECRET,
        credits: 0,
      }]);

      // FIX: handle duplicate email clearly before attempting login
      if (error) {
        if (error.code === "23505") {
          show("⚠️ Email already registered. Please login instead.", false);
          return;
        }
        throw error;
      }

      console.log("✅ User inserted successfully");
      show("✅ Account created! Logging you in…", true);

      console.log("🔐 Calling connectEmail…");
      const result = await connectEmail(pending.email, pending.wallet);
      console.log("📞 connectEmail result:", result);

      // FIX: check connectEmail succeeded before proceeding
      if (!result) {
        show("Account created but login failed. Please use the Login tab.", false);
        showLoginTab();
        const loginEmailInput = document.getElementById("loginEmail") as HTMLInputElement | null;
        if (loginEmailInput) loginEmailInput.value = pending.email;
        return;
      }

      (window as any).OliviumAuth.setUser({
        email:  pending.email,
        tier:   "Standard",
        wallet: pending.wallet,
      });

      console.log("🆔 Identity after connectEmail:", getIdentity());
      show("✅ Login successful! Loading your grove…", true);

      // FIX: await the UI refresh before closing the modal so the user never
      // sees a "NOT CONNECTED" flash.
      const overlay = document.getElementById("authModalOverlay");
      if (overlay) overlay.style.display = "none";

      await forceRefreshUI();

      window.dispatchEvent(new CustomEvent("olivium:connected", {
        detail: { type: "email", email: pending.email },
      }));

      delete (window as any)._pendingSignup;
      _resetAuthModal();

      console.log("✅ Signup complete, modal closed");

    } catch (err: any) {
      console.error("❌ Signup error:", err);
      show(`Registration failed: ${err.message ?? "unknown error"}`, false);
    } finally {
      _setVerifyBtnBusy(verifySignupBtn, false);
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  // LOGIN FLOW
  // ══════════════════════════════════════════════════════════════════════

  document.getElementById("loginBtn")?.addEventListener("click", () => {
    console.log("🔵 LOGIN BUTTON CLICKED");
    const loginEmailInput    = document.getElementById("loginEmail")    as HTMLInputElement | null;
    const loginPasswordInput = document.getElementById("loginPassword") as HTMLInputElement | null;

    if (!loginEmailInput?.value.trim() || !loginPasswordInput?.value.trim()) {
      show("Please fill in your credentials.", false);
      return;
    }

    // FIX: only show the OTP box if it isn't already visible
    const loginOtpBox = document.getElementById("loginOtpBox");
    if (loginOtpBox && loginOtpBox.style.display !== "block") {
      loginOtpBox.style.display = "block";
    }
    show("📱 Enter your 6-digit authenticator code below.", true);
  });

  // ── Login: verify OTP ──────────────────────────────────────────────────
  const verifyLoginBtn = document.getElementById("verifyLoginOtp");
  verifyLoginBtn?.addEventListener("click", async () => {
    console.log("🟢 LOGIN VERIFY BUTTON CLICKED");

    // FIX: guard against double-submission
    if ((verifyLoginBtn as HTMLButtonElement).disabled) return;

    const loginEmailInput    = document.getElementById("loginEmail")    as HTMLInputElement | null;
    const loginPasswordInput = document.getElementById("loginPassword") as HTMLInputElement | null;
    const emailVal    = loginEmailInput?.value.trim().toLowerCase() ?? "";
    const passwordVal = loginPasswordInput?.value.trim() ?? "";

    if (!emailVal || !passwordVal) {
      show("Please enter your email and password.", false);
      return;
    }

    const otpInput   = document.getElementById("loginOtp") as HTMLInputElement | null;
    const enteredOtp = otpInput?.value.trim() ?? "";

    if (!enteredOtp || enteredOtp.length < 6) {
      show("Please enter your 6-digit authenticator code.", false);
      return;
    }

    _setVerifyBtnBusy(verifyLoginBtn, true);
    show("🔐 Verifying identity…", true);

    try {
      // Regenerate the expected wallet from credentials
      console.log("🔑 Regenerating wallet from credentials…");
      const seed           = `${emailVal}:${passwordVal}:${WALLET_DERIVE_SEED}`;
      const hash           = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed));
      const expectedWallet = Keypair.fromSeed(new Uint8Array(hash)).publicKey.toBase58();
      console.log("🔑 Expected wallet:", expectedWallet);

      console.log("📡 Fetching user from Supabase…");
      const { data: profile, error } = await sb
        .from("users")
        .select("wallet")
        .eq("Email_address", emailVal)
        .maybeSingle();

      if (error) throw error;

      const custodialWallet = profile?.wallet ?? null;
      console.log("📡 Retrieved wallet from DB:", custodialWallet);

      if (!custodialWallet) {
        show("No account found with this email. Please sign up first.", false);
        return;
      }

      if (custodialWallet !== expectedWallet) {
        console.log("❌ Wallet mismatch — wrong password");
        show("Invalid email or password. Please try again.", false);
        return;
      }

      console.log("✅ Credentials verified, calling connectEmail…");
      const result = await connectEmail(emailVal, custodialWallet);
      console.log("📞 connectEmail result:", result);

      // FIX: check connectEmail succeeded
      if (!result) {
        show("Authentication error. Please try again.", false);
        return;
      }

      (window as any).OliviumAuth.setUser({
        email:  emailVal,
        tier:   "Standard",
        wallet: custodialWallet,
      });

      console.log("🆔 Identity after connectEmail:", getIdentity());
      show("✅ Login successful! Loading your grove…", true);

      // FIX: await refresh before closing modal
      const overlay = document.getElementById("authModalOverlay");
      if (overlay) overlay.style.display = "none";

      await forceRefreshUI();

      window.dispatchEvent(new CustomEvent("olivium:connected", {
        detail: { type: "email", email: emailVal },
      }));

      // FIX: clear both email and password fields after successful login
      const loginOtpBox = document.getElementById("loginOtpBox");
      if (loginOtpBox)         loginOtpBox.style.display  = "none";
      if (otpInput)            otpInput.value              = "";
      if (loginPasswordInput)  loginPasswordInput.value   = "";
      if (loginEmailInput)     loginEmailInput.value      = "";

      const msg = document.getElementById("msg");
      if (msg) msg.textContent = "";

      console.log("✅ Login complete, modal closed");

    } catch (err: any) {
      console.error("❌ Login error:", err);
      show(`Authentication failed: ${err.message ?? "Please try again"}`, false);
    } finally {
      _setVerifyBtnBusy(verifyLoginBtn, false);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CANONICAL EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════════════════

window.addEventListener("olivium:connected",    () => updateIdentityBalanceUI());
window.addEventListener("olivium:disconnected", () => updateIdentityBalanceUI());

window.addEventListener("solana:connection-complete", (e: Event) => {
  const detail = (e as CustomEvent).detail ?? {};
  window.dispatchEvent(new CustomEvent("olivium:connected", { detail }));
});

document.addEventListener("click", (e) => {
  const el = e.target as HTMLElement;
  console.log("%c[CLICK]", "color:#C5A059;font-weight:bold;", {
    tag:   el.tagName,
    id:    el.id || null,
    class: el.className || null,
    text:  el.innerText?.trim()?.slice(0, 40) || null,
  });
});
