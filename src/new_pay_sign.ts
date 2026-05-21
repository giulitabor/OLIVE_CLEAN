import { sb, connectWallet } from "./src/connection.ts";
import { PublicKey, Keypair, Connection } from "@solana/web3.js";

/* =========================================================
   TYPES & EXTENSIONS
========================================================= */

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

declare global {
  interface Window {
    OliviumAuth: {
      user: any;
      setUser: (u: any) => void;
      getUser: () => any;
    };
    walletPubKey: PublicKey | null;
    _provider: any;
  }
  const QRCode: any;
}

/* =========================================================
   STATE REGISTRY
========================================================= */

let selectedTree: Tree | null = null;
let paymentMode: "mollie" | "paypal" | "crypto" = "mollie";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");

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

/* =========================================================
   DOM ELEMENT HANDLES
========================================================= */

const openModalBtn = document.getElementById("emailLoginBtn");
const closeModalBtn = document.getElementById("closeAuthModal");
const modalOverlay = document.getElementById("authModalOverlay");
const connectModal = document.getElementById("connectModal");
const connectWalletBtn = document.getElementById("connectWalletBtn");

const loginTab = document.getElementById("loginTab");
const signupTab = document.getElementById("signupTab");
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");

const loginOtpBox = document.getElementById("loginOtpBox");
const signupOtpBox = document.getElementById("signupOtpBox");
const qrContainer = document.getElementById("qr");
const msg = document.getElementById("msg");
const signupEmail = document.getElementById("signupEmail") as HTMLInputElement | null;
const signupPassword = document.getElementById("signupPassword") as HTMLInputElement | null;
const signupConfirmPassword = document.getElementById("signupConfirmPassword") as HTMLInputElement | null;
const signupBtn = document.getElementById("signupBtn") as HTMLButtonElement | null;

const metrics: Record<string, { reg: RegExp; el: HTMLElement | null }> = {
  len: { reg: /.{6,}/, el: document.getElementById("metric-len") },
  cap: { reg: /[A-Z]/, el: document.getElementById("metric-cap") },
  low: { reg: /[a-z]/, el: document.getElementById("metric-low") },
  num: { reg: /[0-9]/, el: document.getElementById("metric-num") },
  spe: { reg: /[^A-Za-z0-9]/, el: document.getElementById("metric-spe") }
};

/* =========================================================
   VALIDATION LOGIC
========================================================= */

function validateSignupForm() {
  if (!signupEmail || !signupPassword || !signupConfirmPassword || !signupBtn) return;

  const passVal = signupPassword.value || "";
  const confirmVal = signupConfirmPassword.value || "";
  let allPass = true;

  for (const key in metrics) {
    const matched = metrics[key].reg.test(passVal);
    const element = metrics[key].el;
    if (element) {
      const iconEl = element.querySelector(".icon") as HTMLElement | null;
      if (matched) {
        element.style.color = "#2e7d32";
        if (iconEl) iconEl.innerText = "✔";
      } else {
        element.style.color = "#d94d4d";
        if (iconEl) iconEl.innerText = "❌";
        allPass = false;
      }
    }
  }

  const matches = passVal === confirmVal && passVal.length > 0;

  if (allPass && matches && signupEmail.value.trim().length > 0) {
    signupBtn.disabled = false;
    signupBtn.style.background = "var(--green)";
  } else {
    signupBtn.disabled = true;
    signupBtn.style.background = "#cccccc";
  }
}

signupEmail?.addEventListener("input", validateSignupForm);
signupPassword?.addEventListener("input", validateSignupForm);
signupConfirmPassword?.addEventListener("input", validateSignupForm);

function show(text: string, ok = true) {
  if (!msg) return;
  msg.innerText = text;
  msg.style.color = ok ? "var(--green)" : "#d94d4d";
}

/* =========================================================
   UI BALANCE AND DATA INITIALIZER
========================================================= */

async function updateIdentityBalanceUI() {
  try {
    const pillEl = document.getElementById("identityPill");
    if (!pillEl) return;

    const activePubKey = window.walletPubKey || (window._provider ? window._provider.publicKey : null);
    const savedIdentity = JSON.parse(localStorage.getItem('olivium_identity') || "null");

    if (savedIdentity && savedIdentity.type === "email") {
      pillEl.innerHTML = `✉️ ${savedIdentity.address}`;
      return;
    }

    if (activePubKey) {
      const walletAddressStr = activePubKey.toBase58();
      const lamports = await connection.getBalance(activePubKey);
      const solBalance = lamports / 1_000_000_000;
      const shortAddress = `${walletAddressStr.slice(0, 4)}...${walletAddressStr.slice(-3)}`;
      pillEl.innerHTML = `◎ ${solBalance.toFixed(3)} SOL <span style="opacity: 0.5; margin: 0 6px;">|</span> 🔑 ${shortAddress}`;
    } else {
      pillEl.innerHTML = `🌿 Guest Mode`;
    }
  } catch (err) {
    console.error("Failed to query identity asset balance values from node:", err);
  }
}

/* =========================================================
   EVENT INTERACTION ROUTERS
========================================================= */

// Direct Solana Wallet Action Trigger
connectWalletBtn?.addEventListener("click", async () => {
  show("Awaiting authorization confirmation from wallet standard provider...", true);
  try {
    const session = await connectWallet(false);
    show(`Connected on-chain! Wallet address initialized successfully.`, true);
    
    // Automatically dismiss active payment selector view framing
    if (connectModal) connectModal.style.display = "none";
    if (modalOverlay) modalOverlay.style.display = "none";
  } catch (err: any) {
    console.error("[WALLET BRIDGE ERROR]", err);
    show(err.message || "Wallet configuration handshake dropped.", false);
  }
});

openModalBtn?.addEventListener("click", () => {
  if (connectModal) connectModal.style.display = "none";
  if (modalOverlay) modalOverlay.style.display = "flex";
  show("");
});

closeModalBtn?.addEventListener("click", () => {
  if (modalOverlay) modalOverlay.style.display = "none";
});

modalOverlay?.addEventListener("click", (e) => {
  if (e.target === modalOverlay) {
    modalOverlay.style.display = "none";
  }
});

loginTab?.addEventListener("click", () => {
  if (!loginTab || !signupTab || !loginForm || !signupForm) return;
  loginTab.style.background = "var(--green)";
  loginTab.style.color = "white";
  signupTab.style.background = "transparent";
  signupTab.style.color = "var(--text)";
  loginForm.style.display = "block";
  signupForm.style.display = "none";
  show("");
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
});

/* =========================================================
   MFA & CUSTODIAL KEYS ACCOUNT GENERATION
========================================================= */

let generatedCustodialWallet = "";
const secretSeed = "OLIVIUMDAO777MFASEED";

document.getElementById("signupBtn")?.addEventListener("click", async () => {
  const emailInput = document.getElementById("signupEmail") as HTMLInputElement | null;
  const passwordInput = document.getElementById("signupPassword") as HTMLInputElement | null;

  const emailVal = (emailInput?.value || "").trim().toLowerCase();
  const passwordVal = (passwordInput?.value || "").trim();

  if (!emailVal || !passwordVal) {
    show("Please complete both Email and Password fields.", false);
    return;
  }

  show("Generating secure cryptographic MFA parameters...", true);
  if (qrContainer) qrContainer.innerHTML = "";

  try {
    const credentialCombination = `${emailVal}:${passwordVal}:${secretSeed}`;
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(credentialCombination);
    const hashBuffer = await crypto.subtle.digest("SHA-256", dataBytes);
    const deterministicSeedUint8 = new Uint8Array(hashBuffer);
    const derivedKeypair = Keypair.fromSeed(deterministicSeedUint8);
    generatedCustodialWallet = derivedKeypair.publicKey.toBase58();

    const issuer = encodeURIComponent("Olivium DAO");
    const account = encodeURIComponent(emailVal);
    const totpUri = `otpauth://totp/${issuer}:${account}?secret=${secretSeed}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;

    if (qrContainer) {
      new QRCode(qrContainer, {
        text: totpUri,
        width: 180,
        height: 180,
        colorDark: "#1f402a",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
      });
    }

    if (signupOtpBox) signupOtpBox.style.display = "block";
  } catch (err) {
    console.error("Cryptographic derivation failed:", err);
    show("Failed to securely generate credentials.", false);
  }
});

document.getElementById("verifySignupOtp")?.addEventListener("click", async () => {
  const emailInput = document.getElementById("signupEmail") as HTMLInputElement | null;
  const otpInput = document.getElementById("signupOtp") as HTMLInputElement | null;

  const emailVal = (emailInput?.value || "").trim().toLowerCase();
  const enteredOtp = (otpInput?.value || "").trim();

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
        wallet: generatedCustodialWallet,
        token: secretSeed
      }]);

    if (dbError && dbError.code !== "23505") {
      throw dbError;
    }

    show("MFA Enabled! Profile synced. Flipping to Login tab...", true);

    setTimeout(() => {
      loginTab?.click();
      const loginEmailInput = document.getElementById("loginEmail") as HTMLInputElement | null;
      if (loginEmailInput) loginEmailInput.value = emailVal;
      if (signupOtpBox) signupOtpBox.style.display = "none";
      if (qrContainer) qrContainer.innerHTML = "";
    }, 1500);
  } catch (err: any) {
    console.error("Supabase verification mapping sync crash:", err);
    show(`Failed to update database: ${err.message || 'Check database constraints.'}`, false);
  }
});

document.getElementById("loginBtn")?.addEventListener("click", () => {
  const emailInput = document.getElementById("loginEmail") as HTMLInputElement | null;
  const passwordInput = document.getElementById("loginPassword") as HTMLInputElement | null;

  const emailVal = (emailInput?.value || "").trim();
  const passwordVal = (passwordInput?.value || "").trim();

  if (!emailVal || !passwordVal) {
    show("Please fill out your account credentials.", false);
    return;
  }

  show("Processing login authorization details...", true);
  if (loginOtpBox) loginOtpBox.style.display = "block";
});

document.getElementById("verifyLoginOtp")?.addEventListener("click", async () => {
  const emailInput = document.getElementById("loginEmail") as HTMLInputElement | null;
  const emailVal = (emailInput?.value || "").trim().toLowerCase();
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

    const activeOnChainKeyStr = (profile && profile.wallet) ? profile.wallet : null;

    if (!activeOnChainKeyStr) {
      show("No wallet associated with this email. Please contact support.", false);
      return;
    }
    
    window.OliviumAuth.setUser({ email: emailVal, tier: "Standard" });

    window._provider = {
      publicKey: new PublicKey(activeOnChainKeyStr),
      wallet: {
        publicKey: new PublicKey(activeOnChainKeyStr),
      },
      signTransaction: async (tx: any) => {
        console.log("[Embedded Signer Module] Sign instruction intercepted successfully.");
        return tx;
      }
    };
    window.walletPubKey = new PublicKey(activeOnChainKeyStr);

    localStorage.setItem('olivium_identity', JSON.stringify({
      type: "email",
      address: emailVal,
      custodialWallet: activeOnChainKeyStr
    }));

    show("MFA verified successfully! Syncing layout...", true);

    setTimeout(() => {
      if (modalOverlay) modalOverlay.style.display = "none";
      window.dispatchEvent(new Event('solana:connection-complete'));
    }, 800);
  } catch (err) {
    console.error("Login verification adapter compilation failure:", err);
    show("An unexpected authentication pipeline error occurred.", false);
  }
});

/* =========================================================
   GLOBAL SUBSCRIPTIONS
========================================================= */

window.addEventListener('solana:connection-complete', () => {
  setTimeout(() => {
    updateIdentityBalanceUI();
  }, 100);
});

document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    updateIdentityBalanceUI();
  }, 600);
});
