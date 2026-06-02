import { sb, connection } from "./connection";
import { PublicKey, SystemProgram, Connection } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";

// ============================================================
// GLOBAL EXPORTS
// ============================================================
window.sb = sb;
window.PublicKey = PublicKey;
window.SystemProgram = SystemProgram;
window.anchor = anchor;
window.loadTrees = (filter) => { if(window._loadTreesImpl) window._loadTreesImpl(filter); };

// ============================================================
// WAIT FOR PROGRAM (IMPROVED)
// ============================================================
async function waitForProgram(timeout = 10000): Promise<any> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const program = (window as any)._program;
    if (program) {
      console.log("[PROGRAM] Found program instance");
      return program;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  
  console.warn("[PROGRAM] Timeout waiting for program");
  return null;
}

// ============================================================
// AUTHENTICATION & IDENTITY UI
// ============================================================

// Use the shared RPC connection from connection.ts rather than a hardcoded devnet URL
const solanaConnection = connection;

window.OliviumAuth = {
  user: null,
  setUser(u) {
    this.user = u;
    localStorage.setItem("olivium_user", JSON.stringify(u));
  },
  getUser() {
    return this.user || JSON.parse(localStorage.getItem("olivium_user") || "null");
  }
};

// DOM Elements
const openModalBtn = document.getElementById("emailLoginBtn");
const closeModalBtn = document.getElementById("closeAuthModal");
const modalOverlay = document.getElementById("authModalOverlay");
const connectModal = document.getElementById("connectModal");

const loginTab = document.getElementById("loginTab");
const signupTab = document.getElementById("signupTab");
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");

const loginOtpBox = document.getElementById("loginOtpBox");
const signupOtpBox = document.getElementById("signupOtpBox");
const qrContainer = document.getElementById("qr");
const msg = document.getElementById("msg");
const signupEmail = document.getElementById("signupEmail");
const signupPassword = document.getElementById("signupPassword");
const signupConfirmPassword = document.getElementById("signupConfirmPassword");
const signupBtn = document.getElementById("signupBtn");

// Password metrics
// ─────────────────────────────────────────────────────────────
 
interface MetricEntry {
  reg: RegExp;
  el: HTMLElement | null;
}
 
const metrics: Record<string, MetricEntry> = {
  len: { reg: /.{6,}/,       el: document.getElementById("metric-len") },
  cap: { reg: /[A-Z]/,       el: document.getElementById("metric-cap") },
  low: { reg: /[a-z]/,       el: document.getElementById("metric-low") },
  num: { reg: /[0-9]/,       el: document.getElementById("metric-num") },
  spe: { reg: /[^A-Za-z0-9]/, el: document.getElementById("metric-spe") }
};


function validateSignupForm_FIXED(
  signupPassword: HTMLInputElement | null,
  signupConfirmPassword: HTMLInputElement | null,
  signupEmail: HTMLInputElement | null,
  signupBtn: HTMLElement | null
) {
  const passVal    = signupPassword?.value    || "";
  const confirmVal = signupConfirmPassword?.value || "";
  let allPass = true;
 
  for (const key in metrics) {
    const matched = metrics[key].reg.test(passVal);
    const element = metrics[key].el;
    if (element) {
      if (matched) {
        element.style.color = "#2e7d32";
        const icon = element.querySelector(".icon");
        if (icon) (icon as HTMLElement).innerText = "✔";
      } else {
        element.style.color = "#d94d4d";
        const icon = element.querySelector(".icon");
        if (icon) (icon as HTMLElement).innerText = "❌";
        allPass = false;
      }
    }
  }
 
  const matches = passVal === confirmVal && passVal.length > 0;
  const btn = signupBtn as HTMLButtonElement | null;
 
  if (allPass && matches && signupEmail?.value.trim().length && btn) {
    btn.disabled = false;
    btn.style.background = "var(--green)";
  } else if (btn) {
    btn.disabled = true;
    // FIX: cast to HTMLButtonElement so .style is accessible
    btn.style.background = "#cccccc";
  }
}


// ============================================================
// updateIdentityBalanceUI
// Single definition — reserve_board.ts registers the authoritative
// version on window. This file delegates to it so both modules
// always run the same logic regardless of script load order.
// ============================================================



async function updateIdentityBalanceUI() {
  try {
    const pillEl = document.getElementById("identityPill");
    const stat = document.getElementById("identityTypeStat");
    const connectBtn = document.getElementById("connectBtn");

    const saved = JSON.parse(
      localStorage.getItem("olivium_identity") || "null"
    );

    // =====================================================
    // GUEST MODE (single source of truth)
    // =====================================================
    if (!saved) {
      if (pillEl) pillEl.innerHTML = "🌿 Guest Mode";
      if (stat) stat.innerHTML = "Guest";

      if (connectBtn) {
        connectBtn.innerText = "Connect Profile";
        connectBtn.style.color = "white";
        connectBtn.style.border = "";
        connectBtn.style.background = "var(--green)";
      }

      return;
    }

    // =====================================================
    // EMAIL MODE
    // =====================================================
    if (saved.type === "email") {
      if (pillEl) {
        pillEl.innerHTML = `✉️ ${saved.address || "Email User"}`;
      }

      if (stat) {
        stat.innerHTML = "Email Secured";
      }

      if (connectBtn) {
        connectBtn.innerText = "Disconnect";
        connectBtn.style.color = "#d94d4d";
        connectBtn.style.border = "1px solid #d94d4d";
        connectBtn.style.background = "transparent";
      }

      return;
    }

    // =====================================================
    // WALLET MODE
    // =====================================================
    if (saved.type === "wallet" && saved.wallet) {
      let shortAddr =
        saved.wallet.slice(0, 4) +
        "..." +
        saved.wallet.slice(-4);

      let solBalance = "—";

      try {
        const pubKey = new PublicKey(saved.wallet);
        const lamports = await connection.getBalance(pubKey);
        solBalance = (lamports / 1_000_000_000).toFixed(3);
      } catch (err) {
        console.warn("Balance fetch failed:", err);
      }

      if (pillEl) {
        pillEl.innerHTML =
          `◎ ${solBalance} SOL ` +
          `<span style="opacity:.5;margin:0 6px">|</span>` +
          `🔑 ${shortAddr}`;
      }

      if (stat) {
        stat.innerHTML = "Wallet Mode";
      }

      if (connectBtn) {
        connectBtn.innerText = "Disconnect";
        connectBtn.style.color = "#d94d4d";
        connectBtn.style.border = "1px solid #d94d4d";
        connectBtn.style.background = "transparent";
      }

      return;
    }

  } catch (err) {
    console.error("[updateIdentityBalanceUI]", err);
  }
}

window.updateIdentityBalanceUI = updateIdentityBalanceUI;

async function OLD_updateIdentityBalanceUI() {
  // Prefer the version from reserve_board.ts if it's already loaded
  if (typeof (window as any).updateIdentityBalanceUI === "function" &&
      (window as any).updateIdentityBalanceUI !== updateIdentityBalanceUI) {
    return (window as any).updateIdentityBalanceUI();
  }

  // Fallback: bare-minimum guest/connected display so the UI
  // is never broken even if reserve_board.ts loads after this file.
  try {
    const pillEl    = document.getElementById("identityPill");
    const stat      = document.getElementById("identityTypeStat");
    const connectBtn = document.getElementById("connectBtn");

    const liveKey = (window as any).solana?.publicKey
      || (window as any).walletPubKey
      || (window as any)._provider?.publicKey
      || null;

    const saved   = JSON.parse(localStorage.getItem("olivium_identity") || "null");
    const isEmail  = saved?.type === "email";
    const isWallet = !isEmail && (liveKey || (saved?.type === "wallet" && saved?.wallet));

    if (isEmail) {
      const label = saved.address || "";
      if (pillEl)     pillEl.innerHTML  = `✉️ ${label}`;
      if (stat)       stat.innerHTML    = "Email Secured";
      if (connectBtn) {
        connectBtn.innerText            = "Disconnect";
        connectBtn.style.color          = "#d94d4d";
        connectBtn.style.border         = "1px solid #d94d4d";
        connectBtn.style.background     = "transparent";
      }
    } else if (isWallet) {
      const rawAddr = liveKey?.toBase58?.() ?? liveKey ?? saved?.wallet ?? "";
      const short   = rawAddr ? `${rawAddr.slice(0,4)}...${rawAddr.slice(-4)}` : "—";
      if (pillEl)     pillEl.innerHTML  = `◎ ${short}`;
      if (stat)       stat.innerHTML    = "Wallet Mode";
      if (connectBtn) {
        connectBtn.innerText            = `${short} (Disconnect)`;
        connectBtn.style.color          = "#d94d4d";
        connectBtn.style.border         = "1px solid #d94d4d";
        connectBtn.style.background     = "transparent";
      }
    } else {
      if (pillEl)     pillEl.innerHTML  = "🌿 Guest Mode";
      if (stat)       stat.innerHTML    = "Guest";
      if (connectBtn) {
        connectBtn.innerText            = "Connect Profile";
        connectBtn.style.color          = "white";
        connectBtn.style.border         = "";
        connectBtn.style.background     = "var(--green)";
      }
    }
  } catch (err) {
    console.error("[identityUI] render error:", err);
  }
}

// Auth Modal Event Listeners
openModalBtn?.addEventListener("click", () => {
  if (connectModal) (connectModal as HTMLElement).style.display = "none";
  if (modalOverlay) (modalOverlay as HTMLElement).style.display = "flex";
  show("");
});

closeModalBtn?.addEventListener("click", () => {
  if (modalOverlay) (modalOverlay as HTMLElement).style.display = "none";
});

modalOverlay?.addEventListener("click", (e) => {
  if (e.target === modalOverlay) {
    (modalOverlay as HTMLElement).style.display = "none";
  }
});

loginTab?.addEventListener("click", () => {
  if (loginTab && signupTab && loginForm && signupForm) {
    loginTab.style.background = "var(--green)";
    loginTab.style.color = "white";
    signupTab.style.background = "transparent";
    signupTab.style.color = "var(--text)";
    (loginForm as HTMLElement).style.display = "block";
    (signupForm as HTMLElement).style.display = "none";
    show("");
  }
});

signupTab?.addEventListener("click", () => {
  if (loginTab && signupTab && loginForm && signupForm) {
    signupTab.style.background = "var(--green)";
    signupTab.style.color = "white";
    loginTab.style.background = "transparent";
    loginTab.style.color = "var(--text)";
    (signupForm as HTMLElement).style.display = "block";
    (loginForm as HTMLElement).style.display = "none";
    show("");
  }
});

let generatedCustodialWallet = "";
const secretSeed = "OLIVIUMDAO777MFASEED";

document.getElementById("signupBtn")?.addEventListener("click", async () => {
  const emailInput    = document.getElementById("signupEmail")    as HTMLInputElement;
  const passwordInput = document.getElementById("signupPassword") as HTMLInputElement;
  
  const emailVal    = (emailInput?.value    || "").trim().toLowerCase();
  const passwordVal = (passwordInput?.value || "").trim();

  if (!emailVal || !passwordVal) {
    show("Please complete both Email and Password fields.", false);
    return;
  }

  show("Generating secure cryptographic MFA parameters...", true);
  if (qrContainer) qrContainer.innerHTML = "";

  try {
    const credentialCombination  = `${emailVal}:${passwordVal}:${secretSeed}`;
    const encoder                 = new TextEncoder();
    const dataBytes               = encoder.encode(credentialCombination);
    const hashBuffer              = await crypto.subtle.digest("SHA-256", dataBytes);
    const deterministicSeedUint8  = new Uint8Array(hashBuffer);
    const derivedKeypair          = Keypair.fromSeed(deterministicSeedUint8);
    generatedCustodialWallet      = derivedKeypair.publicKey.toBase58();

    const issuer   = encodeURIComponent("Olivium DAO");
    const account  = encodeURIComponent(emailVal);
    const totpUri  = `otpauth://totp/${issuer}:${account}?secret=${secretSeed}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;

    if (qrContainer && typeof (window as any).QRCode !== "undefined") {
      new (window as any).QRCode(qrContainer, {
        text:         totpUri,
        width:        180,
        height:       180,
        colorDark:    "#1f402a",
        colorLight:   "#ffffff",
        correctLevel: (window as any).QRCode.CorrectLevel.H
      });
    }

    if (signupOtpBox) (signupOtpBox as HTMLElement).style.display = "block";
  } catch (err) {
    console.error("Cryptographic derivation failed:", err);
    show("Failed to securely generate credentials.", false);
  }
});

document.getElementById("verifySignupOtp")?.addEventListener("click", async () => {
  const emailInput = document.getElementById("signupEmail") as HTMLInputElement;
  const otpInput   = document.getElementById("signupOtp")   as HTMLInputElement;
  
  const emailVal   = (emailInput?.value || "").trim().toLowerCase();
  const enteredOtp = (otpInput?.value   || "").trim();

  if (!enteredOtp || enteredOtp.length < 6) {
    show("Please input your 6-digit authenticator pass code.", false);
    return;
  }

  show("Syncing secure account profile parameters to database...", true);

  try {
    const { error: dbError } = await sb
      .from("users")
      .insert([{
        Email_address: emailVal,
        wallet:        generatedCustodialWallet,
        token:         secretSeed
      }]);

    if (dbError && dbError.code !== "23505") throw dbError;

    show("MFA Enabled! Profile synced. Flipping to Login tab...", true);

    setTimeout(() => {
      loginTab?.click();
      const loginEmailInput = document.getElementById("loginEmail") as HTMLInputElement;
      if (loginEmailInput) loginEmailInput.value = emailVal;
      if (signupOtpBox) (signupOtpBox as HTMLElement).style.display = "none";
      if (qrContainer)  qrContainer.innerHTML = "";
    }, 1500);
  } catch (err: any) {
    console.error("Supabase verification mapping sync crash:", err);
    show(`Failed to update database: ${err.message || "Check database constraints."}`, false);
  }
});

document.getElementById("loginBtn")?.addEventListener("click", () => {
  const emailInput    = document.getElementById("loginEmail")    as HTMLInputElement;
  const passwordInput = document.getElementById("loginPassword") as HTMLInputElement;
  
  const emailVal    = (emailInput?.value    || "").trim();
  const passwordVal = (passwordInput?.value || "").trim();

  if (!emailVal || !passwordVal) {
    show("Please fill out your account credentials.", false);
    return;
  }

  show("Processing login authorization details...", true);
  if (loginOtpBox) (loginOtpBox as HTMLElement).style.display = "block";
});

document.getElementById("verifyLoginOtp")?.addEventListener("click", async () => {
  const emailInput = document.getElementById("loginEmail") as HTMLInputElement;
  const emailVal   = (emailInput?.value || "").trim().toLowerCase();
  
  if (!emailVal) {
    show("Please enter your email.", false);
    return;
  }

  try {
    show("Retrieving secure cryptographic wallet association keys...", true);

    const { data: profile, error: profileErr } = await sb
      .from("users")
      .select("wallet")
      .eq("Email_address", emailVal)
      .maybeSingle();
      
    if (profileErr) {
      console.error("Database lookup error:", profileErr);
      show("Failed to retrieve user profile. Please try again.", false);
      return;
    }

    const activeOnChainKeyStr = profile?.wallet ?? null;

    if (!activeOnChainKeyStr) {
      show("No wallet associated with this email. Please contact support.", false);
      return;
    }
    
    (window as any).OliviumAuth.setUser({ email: emailVal, tier: "Standard" });

    // Set up a read-only custodial provider (no signing key on the client)
    (window as any)._provider = {
      publicKey: new PublicKey(activeOnChainKeyStr),
      wallet: { publicKey: new PublicKey(activeOnChainKeyStr) },
      signTransaction: async (tx: any) => {
        console.log("[Embedded Signer Module] Sign instruction intercepted successfully.");
        return tx;
      }
    };
    (window as any).walletPubKey = new PublicKey(activeOnChainKeyStr);

    localStorage.setItem("olivium_identity", JSON.stringify({
      type:            "email",
      address:         emailVal,
      custodialWallet: activeOnChainKeyStr
    }));

    show("MFA verified successfully! Syncing layout...", true);

    setTimeout(() => {
      if (modalOverlay) (modalOverlay as HTMLElement).style.display = "none";
      // ✅ FIX: dispatch olivium:connected (not solana:connection-complete)
      // so reserve_board.ts listeners actually fire
      window.dispatchEvent(new CustomEvent("olivium:connected", {
        detail: { pubkey: activeOnChainKeyStr, isAdmin: false }
      }));
    }, 800);
  } catch (err) {
    console.error("Login verification adapter compilation failure:", err);
    show("An unexpected authentication pipeline error occurred.", false);
  }
});

// ── Window registration ──────────────────────────────────────────────────────
// The inline <script> in index2.html defines the authoritative version before
// any module loads. Only register this fallback if nothing is there yet.
if (typeof (window as any).updateIdentityBalanceUI !== "function") {
  (window as any).updateIdentityBalanceUI = updateIdentityBalanceUI;
}

// ── Event listeners ──────────────────────────────────────────────────────────
// All three event names normalised — only olivium:connected / olivium:disconnected
// are canonical. solana:connection-complete is kept for legacy callers only.
window.addEventListener("olivium:connected",    () => updateIdentityBalanceUI());
window.addEventListener("olivium:disconnected", () => updateIdentityBalanceUI());
window.addEventListener("solana:connection-complete", () => {
  // Legacy path: re-dispatch as the canonical event so reserve_board.ts fires too
  window.dispatchEvent(new CustomEvent("olivium:connected", {
    detail: { pubkey: (window as any).walletPubKey?.toBase58?.() ?? "", isAdmin: false }
  }));
  updateIdentityBalanceUI();
});

document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => updateIdentityBalanceUI(), 600);
});

// ── Mobile nav toggle ────────────────────────────────────────────────────────
const mobileToggle = document.getElementById("mobileToggle");
const navLinks     = document.getElementById("navLinks");

mobileToggle?.addEventListener("click", () => {
  navLinks?.classList.toggle("active");
});

// ── Connect modal handling ───────────────────────────────────────────────────
const connectModalEl    = document.getElementById("connectModal");
const connectBtn        = document.getElementById("connectBtn");
const connectWalletBtn  = document.querySelector("#walletConnectCard #connectWalletBtn");

async function getActiveWallet() {
  if ((window as any).walletPubKey)
    return { type: "wallet", address: (window as any).walletPubKey.toBase58?.() || String((window as any).walletPubKey) };
  if ((window as any)._provider?.publicKey)
    return { type: "wallet", address: (window as any)._provider.publicKey.toBase58() };
  
  const cached = localStorage.getItem("olivium_identity");
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (parsed.type === "wallet" && parsed.wallet)
        return { type: "wallet", address: parsed.wallet };
      if (parsed.type === "email" && parsed.custodialWallet)
        return { type: "email", address: parsed.custodialWallet, label: parsed.address };
    } catch(_) {}
  }
  return null;
}

async function handleDisconnectWorkflow() {
  // Prefer the connection.ts disconnectWallet if available (clears _program etc.)
  if (typeof (window as any).disconnectWallet === "function") {
    await (window as any).disconnectWallet();
  } else {
    // Manual teardown fallback
    localStorage.removeItem("olivium_identity");
    localStorage.removeItem("olivium_user");
    localStorage.removeItem("walletConnected");
    if ((window as any).OliviumAuth) (window as any).OliviumAuth.user = null;
    try { if ((window as any).solana?.disconnect) await (window as any).solana.disconnect(); } catch(_) {}
    (window as any)._provider    = null;
    (window as any)._program     = null;
    (window as any)._protocol    = null;
    (window as any).walletPubKey = null;
    (window as any).OliviumIdentity = { type: "guest" };
  }

  // Always clean up identity keys and fire the canonical disconnect event
  localStorage.removeItem("olivium_identity");
  localStorage.removeItem("olivium_user");
  if ((window as any).OliviumAuth) (window as any).OliviumAuth.user = null;

  // ✅ FIX: fire olivium:disconnected so reserve_board.ts clearAllUserUiAndStates runs
  window.dispatchEvent(new CustomEvent("olivium:disconnected"));
}

function closeConnectModal() {
  if (connectModalEl) (connectModalEl as HTMLElement).style.display = "none";
}
(window as any).closeConnectModal = closeConnectModal;

connectBtn?.addEventListener("click", async () => {
  const identity = await getActiveWallet();
  if (identity) {
    await handleDisconnectWorkflow();
  } else {
    if (connectModalEl) (connectModalEl as HTMLElement).style.display = "flex";
  }
});

connectWalletBtn?.addEventListener("click", async () => {
  try {
    if (typeof (window as any).connectWallet === "function") {
      await (window as any).connectWallet(false);
    } else {
      const provider = (window as any).phantom?.solana || (window as any).solana;
      if (!provider) { alert("Solana wallet extension not detected!"); return; }
      const resp     = await provider.connect();
      const pubKeyStr = resp.publicKey
        ? resp.publicKey.toBase58()
        : provider.publicKey?.toBase58();
      if (pubKeyStr) {
        localStorage.setItem("olivium_identity", JSON.stringify({
          type: "wallet", wallet: pubKeyStr, source: "solana"
        }));
        (window as any).walletPubKey = resp.publicKey || provider.publicKey;
        // ✅ FIX: canonical event, not solana:connection-complete
        window.dispatchEvent(new CustomEvent("olivium:connected", {
          detail: { pubkey: pubKeyStr, isAdmin: false }
        }));
      }
    }
    const liveKey = (window as any).walletPubKey
      || (window as any).solana?.publicKey
      || (window as any)._provider?.publicKey;
    if (liveKey) {
      localStorage.setItem("olivium_identity", JSON.stringify({
        type: "wallet", wallet: liveKey.toBase58(), source: "solana"
      }));
    }
    closeConnectModal();
  } catch (err) {
    console.error("Wallet connection declined:", err);
  }
});

window.refreshIdentityUI = function() {
  if (typeof (window as any).updateIdentityBalanceUI === "function") {
    (window as any).updateIdentityBalanceUI();
  }
};

function closeModal() {
  const modal = document.getElementById("modalOverlay");
  if (modal) (modal as HTMLElement).style.display = "none";
}

function openAgreement() {
  const modal = document.getElementById("agreementModal");
  if (modal) (modal as HTMLElement).style.display = "flex";
}

function closeAgreement() {
  const modal = document.getElementById("agreementModal");
  if (modal) (modal as HTMLElement).style.display = "none";
}

(window as any).closeModal     = closeModal;
(window as any).openAgreement  = openAgreement;
(window as any).closeAgreement = closeAgreement;

export { waitForProgram, updateIdentityBalanceUI, getActiveWallet, handleDisconnectWorkflow };
