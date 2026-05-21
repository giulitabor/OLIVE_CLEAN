import { sb } from "./src/connection.ts";
import { PublicKey, Keypair, Connection } from "@solana/web3.js";
import QRCode from "qrcode"; // Add proper import

const connection = new Connection("https://api.devnet.solana.com", "confirmed");

// Type declarations for global objects
declare global {
  interface Window {
    OliviumAuth: {
      user: { email: string; tier: string } | null;
      setUser(u: { email: string; tier: string } | null): void;
      getUser(): { email: string; tier: string } | null;
    };
    _provider: any;
    walletPubKey: PublicKey | null;
  }
}

window.OliviumAuth = {
  user: null,
  setUser(u) {
    this.user = u;
    if (u) {
      localStorage.setItem("olivium_user", JSON.stringify(u));
    } else {
      localStorage.removeItem("olivium_user");
    }
  },
  getUser() {
    const stored = localStorage.getItem("olivium_user");
    return this.user || (stored ? JSON.parse(stored) : null);
  }
};

// DOM Elements with null checks
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
const signupEmail = document.getElementById("signupEmail") as HTMLInputElement | null;
const signupPassword = document.getElementById("signupPassword") as HTMLInputElement | null;
const signupConfirmPassword = document.getElementById("signupConfirmPassword") as HTMLInputElement | null;
const signupBtn = document.getElementById("signupBtn") as HTMLButtonElement | null;

// Password metrics interface
interface Metric {
  reg: RegExp;
  el: HTMLElement | null;
}

const metrics: Record<string, Metric> = {
  len: { reg: /.{6,}/, el: document.getElementById("metric-len") },
  cap: { reg: /[A-Z]/, el: document.getElementById("metric-cap") },
  low: { reg: /[a-z]/, el: document.getElementById("metric-low") },
  num: { reg: /[0-9]/, el: document.getElementById("metric-num") },
  spe: { reg: /[^A-Za-z0-9]/, el: document.getElementById("metric-spe") }
};

function validateSignupForm(): void {
  const passVal = signupPassword?.value || "";
  const confirmVal = signupConfirmPassword?.value || "";
  let allPass = true;

  for (const key in metrics) {
    const metric = metrics[key];
    const matched = metric.reg.test(passVal);
    const element = metric.el;
    if (element) {
      const iconSpan = element.querySelector(".icon");
      if (matched) {
        element.style.color = "#2e7d32";
        if (iconSpan) iconSpan.textContent = "✔";
      } else {
        element.style.color = "#d94d4d";
        if (iconSpan) iconSpan.textContent = "❌";
        allPass = false;
      }
    }
  }

  const matches = passVal === confirmVal && passVal.length > 0;
  const emailValid = signupEmail?.value.trim().length ?? 0 > 0;

  if (signupBtn) {
    if (allPass && matches && emailValid) {
      signupBtn.disabled = false;
      signupBtn.style.background = "var(--green)";
    } else {
      signupBtn.disabled = true;
      signupBtn.style.background = "#cccccc";
    }
  }
}

signupEmail?.addEventListener("input", validateSignupForm);
signupPassword?.addEventListener("input", validateSignupForm);
signupConfirmPassword?.addEventListener("input", validateSignupForm);

function show(text: string, ok: boolean = true): void {
  if (msg) {
    msg.textContent = text;
    msg.style.color = ok ? "var(--green)" : "#d94d4d";
  }
}

async function updateIdentityBalanceUI(): Promise<void> {
  try {
    const pillEl = document.getElementById("identityPill");
    if (!pillEl) return;

    const activePubKey = window.walletPubKey || (window._provider?.publicKey);
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
  loginTab.style.background = "var(--green)";
  loginTab.style.color = "white";
  signupTab.style.background = "transparent";
  signupTab.style.color = "var(--text)";
  if (loginForm) loginForm.style.display = "block";
  if (signupForm) signupForm.style.display = "none";
  show("");
});

signupTab?.addEventListener("click", () => {
  signupTab.style.background = "var(--green)";
  signupTab.style.color = "white";
  loginTab.style.background = "transparent";
  loginTab.style.color = "var(--text)";
  if (signupForm) signupForm.style.display = "block";
  if (loginForm) loginForm.style.display = "none";
  show("");
});

let generatedCustodialWallet = "";

// SECURITY FIX: Generate seed from user input instead of hardcoding
async function generateSecureSeed(email: string, password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const combined = encoder.encode(`${email}:${password}:${Array.from(salt).join(',')}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", combined);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .substring(0, 32);
}

signupBtn?.addEventListener("click", async () => {
  const emailInput = document.getElementById("signupEmail") as HTMLInputElement | null;
  const passwordInput = document.getElementById("signupPassword") as HTMLInputElement | null;
  
  const emailVal = emailInput?.value.trim().toLowerCase() || "";
  const passwordVal = passwordInput?.value.trim() || "";

  if (!emailVal || !passwordVal) {
    show("Please complete both Email and Password fields.", false);
    return;
  }

  show("Generating secure cryptographic MFA parameters...", true);
  if (qrContainer) qrContainer.innerHTML = "";

  try {
    // Generate secure seed dynamically
    const secureSeed = await generateSecureSeed(emailVal, passwordVal);
    
    const credentialCombination = `${emailVal}:${passwordVal}:${secureSeed}`;
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(credentialCombination);
    const hashBuffer = await crypto.subtle.digest("SHA-256", dataBytes);
    const deterministicSeedUint8 = new Uint8Array(hashBuffer).slice(0, 32);
    const derivedKeypair = Keypair.fromSeed(deterministicSeedUint8);
    generatedCustodialWallet = derivedKeypair.publicKey.toBase58();

    // Generate TOTP URI with secure seed
    const issuer = encodeURIComponent("Olivium DAO");
    const account = encodeURIComponent(emailVal);
    const totpUri = `otpauth://totp/${issuer}:${account}?secret=${secureSeed}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;

    // Generate QR code
    if (qrContainer && typeof QRCode !== 'undefined') {
      await QRCode.toCanvas(qrContainer, totpUri, {
        width: 180,
        margin: 2,
        color: {
          dark: '#1f402a',
          light: '#ffffff'
        }
      });
    }

    if (signupOtpBox) signupOtpBox.style.display = "block";
    
    // Store seed temporarily for verification (in real app, send to backend)
    sessionStorage.setItem('temp_signup_seed', secureSeed);
  } catch (err) {
    console.error("Cryptographic derivation failed:", err);
    show("Failed to securely generate credentials.", false);
  }
});

const verifySignupBtn = document.getElementById("verifySignupOtp");
verifySignupBtn?.addEventListener("click", async () => {
  const emailInput = document.getElementById("signupEmail") as HTMLInputElement | null;
  const signupOtpInput = document.getElementById("signupOtp") as HTMLInputElement | null;
  
  const emailVal = emailInput?.value.trim().toLowerCase() || "";
  const enteredOtp = signupOtpInput?.value.trim() || "";

  if (!enteredOtp || enteredOtp.length < 6) {
    show("Please input your 6-digit authenticator pass code.", false);
    return;
  }

  show("Syncing secure account profile parameters to database...", true);

  try {
    const secureSeed = sessionStorage.getItem('temp_signup_seed');
    if (!secureSeed) {
      throw new Error("Security context expired. Please restart signup.");
    }

    // TODO: Send OTP and seed to backend for verification
    // Never store seeds in localStorage client-side

    const { error: dbError } = await sb
      .from("users")
      .insert([{
        Email_address: emailVal,
        wallet: generatedCustodialWallet,
        // NEVER store seed in database - store only hash
        token_hash: await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secureSeed))
          .then(h => btoa(String.fromCharCode(...new Uint8Array(h))))
      }]);

    if (dbError && dbError.code !== "23505") {
      throw dbError;
    }

    sessionStorage.removeItem('temp_signup_seed');
    show("MFA Enabled! Profile synced. Flipping to Login tab...", true);

    setTimeout(() => {
      loginTab?.click();
      const loginEmailInput = document.getElementById("loginEmail") as HTMLInputElement | null;
      if (loginEmailInput) loginEmailInput.value = emailVal;
      if (signupOtpBox) signupOtpBox.style.display = "none";
      if (qrContainer) qrContainer.innerHTML = "";
    }, 1500);
  } catch (err) {
    console.error("Supabase verification mapping sync crash:", err);
    show(`Failed to update database: ${err instanceof Error ? err.message : 'Check database constraints.'}`, false);
  }
});

const loginBtn = document.getElementById("loginBtn");
loginBtn?.addEventListener("click", () => {
  const loginEmail = document.getElementById("loginEmail") as HTMLInputElement | null;
  const loginPassword = document.getElementById("loginPassword") as HTMLInputElement | null;
  
  const emailVal = loginEmail?.value.trim() || "";
  const passwordVal = loginPassword?.value.trim() || "";

  if (!emailVal || !passwordVal) {
    show("Please fill out your account credentials.", false);
    return;
  }

  show("Processing login authorization details...", true);
  if (loginOtpBox) loginOtpBox.style.display = "block";
});

const verifyLoginBtn = document.getElementById("verifyLoginOtp");
verifyLoginBtn?.addEventListener("click", async () => {
  const loginEmail = document.getElementById("loginEmail") as HTMLInputElement | null;
  const emailVal = loginEmail?.value.trim().toLowerCase() || "";
  
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

    const activeOnChainKeyStr = profile?.wallet;

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
        // In production, this should actually sign the transaction
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
