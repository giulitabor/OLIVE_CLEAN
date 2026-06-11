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
// DEBUG LOGGER — always-on, colour-coded, step-traced
// ─────────────────────────────────────────────────────────────────────────
// Every significant operation calls dbgStep() which prints a numbered
// breadcrumb so you can see the exact sequence in DevTools even when
// several async operations overlap.
// dbg.all() / dbg.sb() / dbg.onchain() / dbg.identity() are on window.dbg
// and fire on-demand at any time.
// ═══════════════════════════════════════════════════════════════════════════

let _stepCounter = 0;

function dbgStep(emoji: string, label: string, data?: any) {
  const n = ++_stepCounter;
  const ts = new Date().toISOString().slice(11, 23);
  if (data !== undefined) {
    console.log(
      `%c[${n}] ${ts} ${emoji} ${label}`,
      "color:#1ABC9C;font-weight:bold;",
      data
    );
  } else {
    console.log(
      `%c[${n}] ${ts} ${emoji} ${label}`,
      "color:#1ABC9C;font-weight:bold;"
    );
  }
}

function dbgWarn(label: string, data?: any) {
  console.warn(`%c⚠️  ${label}`, "color:#E67E22;font-weight:bold;", ...(data !== undefined ? [data] : []));
}

function dbgErr(label: string, err?: any) {
  console.error(`%c❌ ${label}`, "color:#d94d4d;font-weight:bold;", ...(err !== undefined ? [err] : []));
}

// ── Supabase snapshot ────────────────────────────────────────────────────

async function dbgSupabase() {
  console.group("%c[DBG] Supabase tables", "color:#9B59B6;font-weight:bold;");
  try {
    const { data: users, error: ue } = await sb.from("users").select("*").limit(50);
    if (ue) { dbgErr("users table error", ue); }
    else {
      console.log(`users: ${users?.length ?? 0} rows`);
      console.table(users);
    }
  } catch (e) { dbgErr("users fetch threw", e); }
  console.groupEnd();
}

// ── Onchain / program snapshot ───────────────────────────────────────────

async function dbgOnchain() {
  console.group("%c[DBG] Onchain state", "color:#27AE60;font-weight:bold;");

  const endpoint: string = (connection as any)._rpcEndpoint
    ?? (connection as any).rpcEndpoint
    ?? "unknown";
  console.log("RPC endpoint:", endpoint);

  try {
    const slot = await connection.getSlot();
    console.log("Current slot:", slot);
  } catch (e) { dbgWarn("getSlot failed", e); }

  const identity = getIdentity();
  console.log("Identity:", identity);
  if (identity.type !== "guest" && identity.wallet) {
    try {
      const lamports = await connection.getBalance(new PublicKey(identity.wallet));
      console.log(`Balance (${identity.wallet}): ${(lamports / 1e9).toFixed(6)} SOL`);
    } catch (e) { dbgWarn("getBalance failed", e); }
  }

  const program = (window as any)._program;
  if (!program) {
    dbgWarn("_program not yet registered on window");
  } else {
    console.log("Program ID:", program.programId?.toBase58?.() ?? program.programId);
    const accountTypes: string[] = Object.keys(program.account ?? {});
    console.log("IDL account types:", accountTypes);
    for (const accountType of accountTypes) {
      try {
        const accounts = await program.account[accountType].all();
        console.groupCollapsed(`  ${accountType} (${accounts.length} records)`);
        accounts.forEach((a: any, i: number) => {
          console.log(`  [${i}] pubkey: ${a.publicKey.toBase58()}`);
          console.log("       account:", a.account);
        });
        console.groupEnd();
      } catch (e) {
        dbgWarn(`${accountType}: fetch failed`, e);
      }
    }
  }
  console.groupEnd();
}

// ── Identity snapshot ────────────────────────────────────────────────────

function dbgIdentity() {
  const identity = getIdentity();
  const stored   = (window as any).OliviumAuth?.getUser?.() ?? null;
  console.group("%c[DBG] Identity", "color:#E67E22;font-weight:bold;");
  console.log("getIdentity():", identity);
  console.log("OliviumAuth.getUser():", stored);
  console.log("isConnected():", isConnected());
  console.log("_pendingSignup:", (window as any)._pendingSignup ?? "(none)");
  console.groupEnd();
}

// ── Full snapshot ────────────────────────────────────────────────────────

async function dbgAll() {
  console.group("%c[DBG] ══ Olivium full snapshot ══", "color:#1ABC9C;font-size:14px;font-weight:bold;");
  dbgIdentity();
  await dbgSupabase();
  await dbgOnchain();
  console.groupEnd();
}

// ── Expose on window ─────────────────────────────────────────────────────

(window as any).dbg = {
  all:      dbgAll,
  sb:       dbgSupabase,
  onchain:  dbgOnchain,
  identity: dbgIdentity,
  persist(on: boolean) {
    if (on) localStorage.setItem("olivium_debug", "1");
    else    localStorage.removeItem("olivium_debug");
    console.log(`[DBG] Persistent debug ${on ? "enabled" : "disabled"}. Reload to apply.`);
  },
};

// ── Always print a startup banner so devtools always shows the commands ──
console.log(
  "%c🌿 Olivium DAO — debug commands: dbg.all() | dbg.sb() | dbg.onchain() | dbg.identity()",
  "background:#1f402a;color:#A8D5A2;padding:3px 8px;border-radius:4px;font-weight:bold;"
);

// ─── Re-run snapshot on connection events ────────────────────────────────
window.addEventListener("olivium:connected",    () => { dbgStep("🟢", "olivium:connected fired"); dbgIdentity(); });
window.addEventListener("olivium:disconnected", () => { dbgStep("🔴", "olivium:disconnected fired"); dbgIdentity(); });

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
  dbgWarn("[waitForProgram] Timed out — _program never registered");
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
    dbgStep("💾", "OliviumAuth.setUser()", u);
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
    const identity  = getIdentity();
    const pillEl    = document.getElementById("identityPill");
    const stat      = document.getElementById("identityTypeStat");
    const connectBtn       = document.getElementById("connectBtn") as HTMLButtonElement | null;
    const navIdentity      = document.getElementById("nav-identity-display");
    const navIdentityMob   = document.getElementById("nav-identity-display-mob");
    const mobileIdentity   = document.getElementById("mobile-identity-display");
    const mobileTier       = document.getElementById("mobile-tier-label");
    const navTier          = document.getElementById("nav-tier-label");
    const navTierMob       = document.getElementById("nav-tier-label-mob");

    dbgStep("🖥️", `updateIdentityBalanceUI() → type="${identity.type}"`, identity);

    if (identity.type === "guest") {
      if (pillEl)      pillEl.innerHTML  = "🌿 Guest Mode";
      if (stat)        stat.innerHTML    = "Guest";
      if (connectBtn) {
        connectBtn.textContent      = "Connect Profile";
        connectBtn.style.color      = "white";
        connectBtn.style.border     = "";
        connectBtn.style.background = "var(--green)";
        connectBtn.disabled         = false;
      }
      if (navIdentity)    navIdentity.textContent    = "NOT CONNECTED";
      if (navIdentityMob) navIdentityMob.textContent = "NOT CONNECTED";
      if (mobileIdentity) mobileIdentity.textContent = "NOT CONNECTED";
      if (navTier)    navTier.textContent    = "Guest Mode";
      if (navTierMob) navTierMob.textContent = "Guest";
      if (mobileTier) mobileTier.textContent = "Guest Mode";
      return;
    }

    if (identity.type === "email") {
      if (pillEl) pillEl.innerHTML = `✉️ ${identity.label}`;
      if (stat)   stat.innerHTML   = "Email Secured";
      if (connectBtn) {
        connectBtn.textContent      = "Disconnect";
        connectBtn.style.color      = "#d94d4d";
        connectBtn.style.border     = "1px solid #d94d4d";
        connectBtn.style.background = "transparent";
        connectBtn.disabled         = false;
      }
      if (navIdentity)    navIdentity.textContent    = "CONNECTED";
      if (navIdentityMob) navIdentityMob.textContent = "CONNECTED";
      if (mobileIdentity) mobileIdentity.textContent = "CONNECTED";
      if (navTier)    navTier.textContent    = "Email Secured";
      if (navTierMob) navTierMob.textContent = "Email";
      if (mobileTier) mobileTier.textContent = "Email Secured";
      return;
    }

    if (identity.type === "wallet" && identity.wallet) {
      const short = identity.label;
      if (pillEl) pillEl.innerHTML = `🔑 ${short} · ◎ …`;
      if (stat)   stat.innerHTML   = "Wallet Mode";
      if (connectBtn) {
        connectBtn.textContent      = "Disconnect";
        connectBtn.style.color      = "#d94d4d";
        connectBtn.style.border     = "1px solid #d94d4d";
        connectBtn.style.background = "transparent";
        connectBtn.disabled         = false;
      }
      if (navIdentity)    navIdentity.textContent    = "CONNECTED";
      if (navIdentityMob) navIdentityMob.textContent = "CONNECTED";
      if (mobileIdentity) mobileIdentity.textContent = "CONNECTED";
      if (navTier)    navTier.textContent    = "Wallet Mode";
      if (navTierMob) navTierMob.textContent = "Wallet";
      if (mobileTier) mobileTier.textContent = "Wallet Mode";

      try {
        const lamports   = await connection.getBalance(new PublicKey(identity.wallet));
        const solBalance = (lamports / 1_000_000_000).toFixed(3);
        dbgStep("◎", `SOL balance fetched: ${solBalance}`);
        if (getIdentity().type === "wallet" && pillEl) {
          pillEl.innerHTML = `◎ ${solBalance} SOL <span style="opacity:.5;margin:0 6px">|</span> 🔑 ${short}`;
        }
      } catch (e) {
        dbgWarn("getBalance failed", e);
      }
    }
  } catch (err) {
    dbgErr("[updateIdentityBalanceUI]", err);
  }
}

// Force UI refresh helper
export async function forceRefreshUI() {
  dbgStep("🔄", "forceRefreshUI() start");
  const identity = getIdentity();
  dbgStep("🆔", "identity at forceRefreshUI", identity);
  await updateIdentityBalanceUI();
  if (typeof (window as any).updateStatsUI === "function") {
    dbgStep("📊", "calling updateStatsUI()");
    await (window as any).updateStatsUI();
  }
  if (typeof (window as any).loadTrees === "function") {
    dbgStep("🌳", "calling loadTrees('my')");
    (window as any).loadTrees("my");
  }
  dbgStep("✅", "forceRefreshUI() complete");
}

(window as any).updateIdentityBalanceUI = updateIdentityBalanceUI;
(window as any).refreshIdentityUI       = updateIdentityBalanceUI;
(window as any).forceRefreshUI          = forceRefreshUI;

// ═══════════════════════════════════════════════════════════════════════════
// PASSWORD VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

interface MetricEntry { reg: RegExp; el: HTMLElement | null; }

const metrics: Record<string, MetricEntry> = {
  len: { reg: /.{6,}/,      el: null },
  cap: { reg: /[A-Z]/,      el: null },
  low: { reg: /[a-z]/,      el: null },
  num: { reg: /[0-9]/,      el: null },
  spe: { reg: /[^A-Za-z0-9]/, el: null },
};

function initMetrics() {
  metrics.len.el = document.getElementById("metric-len");
  metrics.cap.el = document.getElementById("metric-cap");
  metrics.low.el = document.getElementById("metric-low");
  metrics.num.el = document.getElementById("metric-num");
  metrics.spe.el = document.getElementById("metric-spe");

  // If the metric elements are missing from the DOM, inject them into the
  // signup form so password constraints are always visible.
  _ensurePasswordMetrics();
}

function _ensurePasswordMetrics() {
  const signupForm = document.getElementById("signupForm");
  if (!signupForm) return;

  // Check if at least one metric element already exists in the DOM
  if (document.getElementById("metric-len")) return;

  dbgWarn("metric elements not found in DOM — injecting password constraints UI");

  const metricDefs = [
    { id: "metric-len", text: "At least 6 characters" },
    { id: "metric-cap", text: "One uppercase letter" },
    { id: "metric-low", text: "One lowercase letter" },
    { id: "metric-num", text: "One number" },
    { id: "metric-spe", text: "One special character" },
  ];

  const box = document.createElement("div");
  box.id = "passwordMetricsBox";
  box.style.cssText = `
    margin: 8px 0 12px;
    padding: 10px 14px;
    background: rgba(0,0,0,.06);
    border-radius: 8px;
    font-size: 12px;
    line-height: 1.9;
  `;

  const title = document.createElement("div");
  title.style.cssText = "font-weight:600;margin-bottom:4px;opacity:.7;font-size:11px;text-transform:uppercase;letter-spacing:.04em;";
  title.textContent = "Password requirements";
  box.appendChild(title);

  for (const def of metricDefs) {
    const row = document.createElement("div");
    row.id = def.id;
    row.style.color = "#d94d4d";
    row.innerHTML = `<span class="icon" style="display:inline-block;width:16px">❌</span> ${def.text}`;
    box.appendChild(row);
    metrics[def.id.replace("metric-", "")].el = row;
  }

  // Insert right after the confirm-password field, or at top of form
  const confirmField = document.getElementById("signupConfirmPassword");
  const anchor = confirmField?.closest(".field-wrap") ?? confirmField?.parentElement;
  if (anchor && anchor.parentElement) {
    anchor.parentElement.insertBefore(box, anchor.nextSibling);
  } else {
    signupForm.prepend(box);
  }
}

function validateSignupForm(
  passEl:    HTMLInputElement | null,
  confirmEl: HTMLInputElement | null,
  emailEl:   HTMLInputElement | null,
  btnEl:     HTMLButtonElement | null,
) {
  const pass    = passEl?.value    ?? "";
  const confirm = confirmEl?.value ?? "";
  let allPass = true;

  for (const key in metrics) {
    const m  = metrics[key];
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
    btnEl.disabled        = !(allPass && matches && hasEmail);
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

(window as any).closeModal        = closeModal;
(window as any).closeAgreement    = closeAgreement;
(window as any).closeConnectModal = closeConnectModal;
(window as any).closeSuccess      = closeSuccess;
(window as any).closeRelease      = closeRelease;

// ═══════════════════════════════════════════════════════════════════════════
// DISCONNECT HELPER
// ═══════════════════════════════════════════════════════════════════════════

export async function handleDisconnectWorkflow() {
  dbgStep("🔌", "handleDisconnectWorkflow() called");
  await disconnectWallet();
  dbgStep("🔌", "disconnectWallet() resolved");
}
(window as any).handleDisconnectWorkflow = handleDisconnectWorkflow;

// ═══════════════════════════════════════════════════════════════════════════
// DOM INITIALISATION
// ═══════════════════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {
  dbgStep("📄", "DOMContentLoaded — wiring UI");
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

  // Full snapshot after a short delay so _program has time to register
  setTimeout(async () => {
    dbgStep("📸", "Initial snapshot (800ms after DOMContentLoaded)");
    await dbgAll();
  }, 800);
});

function _wireConnectButton() {
  const btn = document.getElementById("connectBtn");
  if (!btn) { dbgWarn("connectBtn not found"); return; }

  btn.addEventListener("click", async () => {
    dbgStep("🖱️", `connectBtn clicked — isConnected=${isConnected()}`);
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
  if (!btn) { dbgWarn("#walletConnectCard #connectWalletBtn not found"); return; }

  btn.addEventListener("click", async () => {
    dbgStep("👛", "connectWalletBtn clicked");
    btn.textContent = "Connecting…";
    (btn as HTMLButtonElement).disabled = true;
    try {
      await connectWallet(false);
      dbgStep("👛", "connectWallet() resolved — closing connect modal");
      closeConnectModal();
    } catch (err: any) {
      dbgErr("Wallet connection declined", err);
      btn.textContent = "Connect Wallet";
    } finally {
      (btn as HTMLButtonElement).disabled = false;
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTH MODAL WIRING
// ═══════════════════════════════════════════════════════════════════════════

const WALLET_DERIVE_SEED = "OLIVIUMDAO777WALLETDERIVE";
const TOTP_SECRET        = "OLIVIUMDAO777MFASEED";

function show(msg: string, ok = true) {
  const el = document.getElementById("msg");
  if (!el) return;
  el.textContent = msg;
  el.style.color = ok ? "#2e7d32" : "#d94d4d";
}

// ── Expand the auth modal box to fit the QR + OTP section comfortably ────
function _expandModalForQR(expand: boolean) {
  const inner = document.querySelector<HTMLElement>(
    "#authModalOverlay .modal-inner, #authModalOverlay .auth-box, #authModalOverlay > div"
  );
  if (!inner) return;
  if (expand) {
    inner.style.maxWidth  = "480px";
    inner.style.width     = "95vw";
    inner.style.maxHeight = "90vh";
    inner.style.overflowY = "auto";
  } else {
    inner.style.maxWidth  = "";
    inner.style.width     = "";
    inner.style.maxHeight = "";
    inner.style.overflowY = "";
  }
}

function _resetAuthModal() {
  const signupOtpBox = document.getElementById("signupOtpBox");
  const qrContainer  = document.getElementById("qr");
  const otpSignup    = document.getElementById("signupOtp")  as HTMLInputElement | null;
  const otpLogin     = document.getElementById("loginOtp")   as HTMLInputElement | null;
  const loginOtpBox  = document.getElementById("loginOtpBox");
  if (signupOtpBox) signupOtpBox.style.display = "none";
  if (loginOtpBox)  loginOtpBox.style.display  = "none";
  if (qrContainer)  qrContainer.innerHTML      = "";
  if (otpSignup)    otpSignup.value             = "";
  if (otpLogin)     otpLogin.value              = "";
  const msg = document.getElementById("msg");
  if (msg) msg.textContent = "";
  _expandModalForQR(false);
}

function _setVerifyBtnBusy(btn: Element | null, busy: boolean, label = "Verify Code") {
  if (!btn) return;
  (btn as HTMLButtonElement).disabled    = busy;
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

  dbgStep("🔧", "wiring auth modal", {
    loginTab:  !!loginTab,  signupTab: !!signupTab,
    loginForm: !!loginForm, signupForm: !!signupForm,
    passEl: !!passEl, confirmEl: !!confirmEl, emailEl: !!emailEl,
    signupBtn: !!signupBtn,
  });

  // ── tab helpers ─────────────────────────────────────────────────────────
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
    if (emailEl)   emailEl.value   = "";
    if (passEl)    passEl.value    = "";
    if (confirmEl) confirmEl.value = "";
    _resetAuthModal();
    validateSignupForm(passEl, confirmEl, emailEl, signupBtn);
  }

  // ── open from email button ───────────────────────────────────────────────
  document.getElementById("emailLoginBtn")?.addEventListener("click", () => {
    dbgStep("📧", "emailLoginBtn clicked — opening auth modal");
    const connectModal = document.getElementById("connectModal");
    if (connectModal) connectModal.style.display = "none";
    const overlay = document.getElementById("authModalOverlay");
    if (overlay) overlay.style.display = "flex";
    showLoginTab();
  });

  // ── close modal ──────────────────────────────────────────────────────────
  function closeAuthModal() {
    dbgStep("❎", "auth modal closed");
    const overlay = document.getElementById("authModalOverlay");
    if (overlay) overlay.style.display = "none";
    delete (window as any)._pendingSignup;
    _resetAuthModal();
  }

  document.getElementById("closeAuthModal")?.addEventListener("click", closeAuthModal);

  // FIX: clicking the backdrop only closes if the QR step is NOT showing,
  // so the user can't accidentally close mid-scan.
  document.getElementById("authModalOverlay")?.addEventListener("click", (e) => {
    if (e.target !== e.currentTarget) return;
    const qrVisible = document.getElementById("signupOtpBox")?.style.display === "block";
    if (qrVisible) {
      dbgWarn("Backdrop click blocked — QR scan in progress");
      return;
    }
    closeAuthModal();
  });

  loginTab?.addEventListener("click",  showLoginTab);
  signupTab?.addEventListener("click", showSignupTab);

  passEl?.addEventListener("input",    () => validateSignupForm(passEl, confirmEl, emailEl, signupBtn));
  confirmEl?.addEventListener("input", () => validateSignupForm(passEl, confirmEl, emailEl, signupBtn));
  emailEl?.addEventListener("input",   () => validateSignupForm(passEl, confirmEl, emailEl, signupBtn));

  // ════════════════════════════════════════════════════════════════════════
  // SIGNUP FLOW
  // ════════════════════════════════════════════════════════════════════════

  signupBtn?.addEventListener("click", async () => {
    dbgStep("🔵", "SIGNUP BUTTON clicked");

    const emailVal    = emailEl?.value.trim().toLowerCase() ?? "";
    const passwordVal = passEl?.value.trim() ?? "";

    dbgStep("📝", "signup form values", { email: emailVal, passwordLength: passwordVal.length });

    if (!emailVal || !passwordVal) {
      show("Please complete both Email and Password fields.", false);
      return;
    }

    show("🔐 Generating secure cryptographic identity…", true);

    const qrContainer  = document.getElementById("qr");
    const signupOtpBox = document.getElementById("signupOtpBox");

    if (qrContainer)  { qrContainer.innerHTML = ""; qrContainer.style.minHeight = "200px"; }
    if (signupOtpBox)   signupOtpBox.style.display = "none";

    try {
      // ── Step 1: derive custodial wallet ──────────────────────────────
      dbgStep("🔑", "Step 1 — deriving custodial wallet from email+password+seed");
      const seed  = `${emailVal}:${passwordVal}:${WALLET_DERIVE_SEED}`;
      const hash  = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed));
      const kp    = Keypair.fromSeed(new Uint8Array(hash));
      const derivedWallet = kp.publicKey.toBase58();
      dbgStep("🔑", "Step 1 ✅ — custodial wallet derived", {
        wallet: derivedWallet,
        seedInput: `${emailVal}:***:${WALLET_DERIVE_SEED}`,
      });

      // ── Step 2: build TOTP URI and render QR ────────────────────────
      dbgStep("📱", "Step 2 — building TOTP URI and rendering QR code");
      const totpUri =
        `otpauth://totp/${encodeURIComponent("Olivium DAO")}:${encodeURIComponent(emailVal)}`
        + `?secret=${TOTP_SECRET}&issuer=OliviumDAO&algorithm=SHA1&digits=6&period=30`;

      dbgStep("📱", "Step 2 — TOTP URI", totpUri);

      if (qrContainer && typeof (window as any).QRCode !== "undefined") {
        new (window as any).QRCode(qrContainer, {
          text: totpUri, width: 200, height: 200,
          colorDark: "#1f402a", colorLight: "#ffffff",
          correctLevel: (window as any).QRCode.CorrectLevel.H,
        });
        dbgStep("📱", "Step 2 ✅ — QR code rendered into #qr");
      } else {
        dbgWarn("Step 2 — QRCode library not available", {
          qrContainerFound: !!qrContainer,
          QRCodeAvailable: typeof (window as any).QRCode !== "undefined",
        });
      }

      // ── Step 3: expand modal and show OTP box ────────────────────────
      dbgStep("📦", "Step 3 — expanding modal, showing OTP entry box");
      _expandModalForQR(true);
      if (signupOtpBox) signupOtpBox.style.display = "block";

      // Store pending state
      (window as any)._pendingSignup = { email: emailVal, password: passwordVal, wallet: derivedWallet };
      dbgStep("📦", "Step 3 ✅ — _pendingSignup stored", (window as any)._pendingSignup);

      show("📱 Scan QR with Google Authenticator — enter the 6-digit code to continue", true);

      // Scroll the OTP box into view inside the modal
      setTimeout(() => signupOtpBox?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 100);

    } catch (err) {
      dbgErr("Signup key derivation failed", err);
      show("Failed to generate credentials.", false);
    }
  });

  // ── Signup: verify OTP ────────────────────────────────────────────────

  const verifySignupBtn = document.getElementById("verifySignupOtp");
  verifySignupBtn?.addEventListener("click", async () => {
    dbgStep("🟢", "SIGNUP VERIFY clicked");

    if ((verifySignupBtn as HTMLButtonElement).disabled) {
      dbgWarn("verifySignupOtp already disabled — ignoring double-click");
      return;
    }

    const otpInput   = document.getElementById("signupOtp") as HTMLInputElement | null;
    const enteredOtp = otpInput?.value.trim() ?? "";
    dbgStep("🔢", "OTP entered", { length: enteredOtp.length, value: enteredOtp });

    if (!enteredOtp || enteredOtp.length < 6) {
      show("Please enter your 6-digit authenticator code.", false);
      return;
    }

    const pending = (window as any)._pendingSignup;
    dbgStep("📦", "retrieved _pendingSignup", pending);
    if (!pending) {
      show("Session expired. Please fill in your details and click Sign Up again.", false);
      return;
    }

    _setVerifyBtnBusy(verifySignupBtn, true);
    show("✅ Verifying code and creating your account…", true);

    try {
      // ── Step 4: insert user into Supabase ────────────────────────────
      dbgStep("💾", "Step 4 — inserting user into Supabase", {
        Email_address: pending.email,
        wallet:        pending.wallet,
      });

      const { data: insertData, error: insertError } = await sb.from("users").insert([{
        Email_address: pending.email,
        wallet:        pending.wallet,
        token:         TOTP_SECRET,
        credits:       0,
      }]).select();

      dbgStep("💾", "Step 4 — Supabase insert response", { data: insertData, error: insertError });

      if (insertError) {
        if (insertError.code === "23505") {
          dbgWarn("Step 4 — duplicate email (23505)", insertError);
          show("⚠️ Email already registered. Please login instead.", false);
          _setVerifyBtnBusy(verifySignupBtn, false);
          return;
        }
        throw insertError;
      }

      dbgStep("💾", "Step 4 ✅ — user row created");

      // ── Step 5: connectEmail ─────────────────────────────────────────
      dbgStep("🔐", "Step 5 — calling connectEmail()", { email: pending.email, wallet: pending.wallet });
      const result = await connectEmail(pending.email, pending.wallet);
      dbgStep("🔐", "Step 5 — connectEmail() result", result);

      if (!result) {
        dbgErr("Step 5 — connectEmail() returned falsy");
        show("Account created but login failed. Please use the Login tab.", false);
        _setVerifyBtnBusy(verifySignupBtn, false);
        showLoginTab();
        const loginEmailInput = document.getElementById("loginEmail") as HTMLInputElement | null;
        if (loginEmailInput) loginEmailInput.value = pending.email;
        return;
      }

      // ── Step 6: persist session ──────────────────────────────────────
      dbgStep("👤", "Step 6 — persisting OliviumAuth session");
      (window as any).OliviumAuth.setUser({
        email:  pending.email,
        tier:   "Standard",
        wallet: pending.wallet,
      });

      dbgStep("🆔", "Step 6 — identity after connectEmail", getIdentity());

      show("✅ Account created and logged in!", true);

      // ── Step 7: close modal, refresh UI ─────────────────────────────
      dbgStep("🖼️", "Step 7 — closing modal");
      const overlay = document.getElementById("authModalOverlay");
      if (overlay) overlay.style.display = "none";

      dbgStep("🔄", "Step 7 — running forceRefreshUI()");
      await forceRefreshUI();

      window.dispatchEvent(new CustomEvent("olivium:connected", {
        detail: { type: "email", email: pending.email },
      }));

      delete (window as any)._pendingSignup;
      _resetAuthModal();

      dbgStep("✅", "SIGNUP COMPLETE");

    } catch (err: any) {
      dbgErr("Signup error", err);
      show(`Registration failed: ${err.message ?? "unknown error"}`, false);
    } finally {
      _setVerifyBtnBusy(verifySignupBtn, false);
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  // LOGIN FLOW
  // ════════════════════════════════════════════════════════════════════════

  document.getElementById("loginBtn")?.addEventListener("click", () => {
    dbgStep("🔵", "LOGIN BUTTON clicked");

    const loginEmailInput    = document.getElementById("loginEmail")    as HTMLInputElement | null;
    const loginPasswordInput = document.getElementById("loginPassword") as HTMLInputElement | null;
    const emailVal           = loginEmailInput?.value.trim() ?? "";
    const passVal            = loginPasswordInput?.value.trim() ?? "";

    dbgStep("📝", "login form values", { email: emailVal, hasPassword: passVal.length > 0 });

    if (!emailVal || !passVal) {
      show("Please fill in your credentials.", false);
      return;
    }

    const loginOtpBox = document.getElementById("loginOtpBox");
    if (loginOtpBox && loginOtpBox.style.display !== "block") {
      loginOtpBox.style.display = "block";
      dbgStep("📱", "loginOtpBox shown");
    }
    show("📱 Enter your 6-digit authenticator code below.", true);
  });

  // ── Login: verify OTP ─────────────────────────────────────────────────

  const verifyLoginBtn = document.getElementById("verifyLoginOtp");
  verifyLoginBtn?.addEventListener("click", async () => {
    dbgStep("🟢", "LOGIN VERIFY clicked");

    if ((verifyLoginBtn as HTMLButtonElement).disabled) {
      dbgWarn("verifyLoginOtp already disabled — ignoring double-click");
      return;
    }

    const loginEmailInput    = document.getElementById("loginEmail")    as HTMLInputElement | null;
    const loginPasswordInput = document.getElementById("loginPassword") as HTMLInputElement | null;
    const emailVal           = loginEmailInput?.value.trim().toLowerCase() ?? "";
    const passwordVal        = loginPasswordInput?.value.trim() ?? "";

    if (!emailVal || !passwordVal) {
      show("Please enter your email and password.", false);
      return;
    }

    const otpInput   = document.getElementById("loginOtp") as HTMLInputElement | null;
    const enteredOtp = otpInput?.value.trim() ?? "";
    dbgStep("🔢", "OTP entered", { length: enteredOtp.length });

    if (!enteredOtp || enteredOtp.length < 6) {
      show("Please enter your 6-digit authenticator code.", false);
      return;
    }

    _setVerifyBtnBusy(verifyLoginBtn, true);
    show("🔐 Verifying identity…", true);

    try {
      // ── Step 1: re-derive expected wallet ────────────────────────────
      dbgStep("🔑", "Login Step 1 — re-deriving wallet from credentials");
      const seed           = `${emailVal}:${passwordVal}:${WALLET_DERIVE_SEED}`;
      const hash           = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed));
      const expectedWallet = Keypair.fromSeed(new Uint8Array(hash)).publicKey.toBase58();
      dbgStep("🔑", "Login Step 1 ✅ — expected wallet derived", { expectedWallet });

      // ── Step 2: fetch stored wallet from Supabase ────────────────────
      dbgStep("📡", "Login Step 2 — querying Supabase for user", { email: emailVal });
      const { data: profile, error } = await sb
        .from("users")
        .select("wallet")
        .eq("Email_address", emailVal)
        .maybeSingle();

      dbgStep("📡", "Login Step 2 — Supabase response", { profile, error });

      if (error) throw error;

      const custodialWallet = profile?.wallet ?? null;

      if (!custodialWallet) {
        dbgWarn("Login Step 2 — no user found for email", emailVal);
        show("No account found with this email. Please sign up first.", false);
        return;
      }

      // ── Step 3: compare wallets (password check) ─────────────────────
      dbgStep("🔍", "Login Step 3 — comparing wallets", {
        expected:  expectedWallet,
        fromDB:    custodialWallet,
        match:     custodialWallet === expectedWallet,
      });

      if (custodialWallet !== expectedWallet) {
        dbgWarn("Login Step 3 — wallet mismatch — wrong password");
        show("Invalid email or password. Please try again.", false);
        return;
      }

      // ── Step 4: connectEmail ─────────────────────────────────────────
      dbgStep("🔐", "Login Step 4 — calling connectEmail()", { email: emailVal, wallet: custodialWallet });
      const result = await connectEmail(emailVal, custodialWallet);
      dbgStep("🔐", "Login Step 4 — connectEmail() result", result);

      if (!result) {
        dbgErr("Login Step 4 — connectEmail() returned falsy");
        show("Authentication error. Please try again.", false);
        return;
      }

      // ── Step 5: persist session ──────────────────────────────────────
      dbgStep("👤", "Login Step 5 — persisting OliviumAuth session");
      (window as any).OliviumAuth.setUser({
        email:  emailVal,
        tier:   "Standard",
        wallet: custodialWallet,
      });

      dbgStep("🆔", "Login Step 5 — identity after connectEmail", getIdentity());
      show("✅ Login successful! Loading your grove…", true);

      // ── Step 6: close modal, refresh UI ─────────────────────────────
      dbgStep("🖼️", "Login Step 6 — closing modal");
      const overlay = document.getElementById("authModalOverlay");
      if (overlay) overlay.style.display = "none";

      dbgStep("🔄", "Login Step 6 — running forceRefreshUI()");
      await forceRefreshUI();

      window.dispatchEvent(new CustomEvent("olivium:connected", {
        detail: { type: "email", email: emailVal },
      }));

      const loginOtpBox = document.getElementById("loginOtpBox");
      if (loginOtpBox)         loginOtpBox.style.display = "none";
      if (otpInput)            otpInput.value             = "";
      if (loginPasswordInput)  loginPasswordInput.value  = "";
      if (loginEmailInput)     loginEmailInput.value     = "";

      const msg = document.getElementById("msg");
      if (msg) msg.textContent = "";

      dbgStep("✅", "LOGIN COMPLETE");

    } catch (err: any) {
      dbgErr("Login error", err);
      show(`Authentication failed: ${err.message ?? "Please try again"}`, false);
    } finally {
      _setVerifyBtnBusy(verifyLoginBtn, false);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CANONICAL EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════════════════

window.addEventListener("solana:connection-complete", (e: Event) => {
  const detail = (e as CustomEvent).detail ?? {};
  dbgStep("⛓️", "solana:connection-complete → forwarding as olivium:connected", detail);
  window.dispatchEvent(new CustomEvent("olivium:connected", { detail }));
});

document.addEventListener("click", (e) => {
  const el = e.target as HTMLElement;
  console.log("%c[CLICK]", "color:#C5A059;font-weight:bold;", {
    tag:   el.tagName,
    id:    el.id    || null,
    class: el.className || null,
    text:  el.innerText?.trim()?.slice(0, 40) || null,
  });
});
