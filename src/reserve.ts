import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";

/* =========================================================
   TYPES
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

/* =========================================================
   CONSTANTS
========================================================= */

const EURO_PER_SHARE = 12.40;
const PRICE_CACHE_DURATION = 60000; // 60 seconds

const TIER_SHARES = {
  starter: 10,
  keeper: 100,
  fullTree: 1000,
  guardTree: 5000,
} as const;

// Environment-based API URL
const API_BASE_URL = import.meta.env?.VITE_API_URL || 
  (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://api.yourdomain.com');

/* =========================================================
   STATE
========================================================= */

let selectedTree: Tree | null = null;
let paymentMode: "fiat" | "crypto" = "fiat";
let cachedSolPrice = 100;
let lastPriceFetch = 0;
let selectedPurchaseShares = 0;

/* =========================================================
   PRICE FETCHING
========================================================= */

async function getSolPriceEUR(): Promise<number> {
  const now = Date.now();

  if (now - lastPriceFetch < PRICE_CACHE_DURATION) {
    return cachedSolPrice;
  }

  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=eur"
    );
    const data = await res.json();

    if (data?.solana?.eur) {
      cachedSolPrice = data.solana.eur;
      lastPriceFetch = now;
      console.log("[PRICE] Live SOL/EUR:", cachedSolPrice);
      return cachedSolPrice;
    }
  } catch (err) {
    console.error("CoinGecko price fetch failed:", err);
  }

  return cachedSolPrice;
}

/* =========================================================
   UPDATE SHARES & PRICING
========================================================= */

async function updateShares(): Promise<void> {
  console.log("updateShares firing");
  const solPrice = await getSolPriceEUR();
  console.log("SOL PRICE:", solPrice);

  const starterSolEl = document.getElementById("starter-sol-price");
  const keeperSolEl = document.getElementById("keeper-sol-price");
  const fullTreeSolEl = document.getElementById("fulltree-sol-price");
  const guardTreeSolEl = document.getElementById("guardian-sol-price");

  const starterSol = (TIER_SHARES.starter * EURO_PER_SHARE) / solPrice;
  const keeperSol = (TIER_SHARES.keeper * EURO_PER_SHARE) / solPrice;
  const fullTreeSol = (TIER_SHARES.fullTree * EURO_PER_SHARE) / solPrice;
  const guardTreeSol = (TIER_SHARES.guardTree * EURO_PER_SHARE) / solPrice;

  if (starterSolEl) starterSolEl.innerText = `~${starterSol.toFixed(2)} SOL`;
  if (keeperSolEl) keeperSolEl.innerText = `~${keeperSol.toFixed(2)} SOL`;
  if (fullTreeSolEl) fullTreeSolEl.innerText = `~${fullTreeSol.toFixed(2)} SOL`;
  if (guardTreeSolEl) guardTreeSolEl.innerText = `~${guardTreeSol.toFixed(2)} SOL`; 
}

/* =========================================================
   DYNAMIC TIER PURCHASE MODAL (CONNECT MODAL)
========================================================= */

async function openTierPurchase(tierName: string, shares: number): Promise<void> {
  console.log(`[MODAL] Initializing checkout layout for Tier: ${tierName}`);
  selectedPurchaseShares = shares;

  try {
    const euroTotal = shares * EURO_PER_SHARE;
    const solPrice = await getSolPriceEUR();
    const solTotal = euroTotal / solPrice;

    const tierNameEl = document.getElementById("selectedTierName");
    const tierSharesEl = document.getElementById("selectedTierShares");
    const tierSolEl = document.getElementById("selectedTierSol");
    const tierEuroEl = document.getElementById("selectedTierEuro");

    if (tierNameEl) tierNameEl.innerText = tierName;
    if (tierSharesEl) tierSharesEl.innerText = `${shares.toLocaleString()} Shares`;
    if (tierSolEl) tierSolEl.innerText = `~${solTotal.toFixed(2)} SOL`;
    if (tierEuroEl) tierEuroEl.innerText = `€${euroTotal.toLocaleString()}`;

    const connectModal = document.getElementById("connectModal");
    if (connectModal) {
      connectModal.style.display = "flex";
    }
  } catch (err) {
    console.error("[MODAL ERROR] Failed to compute purchase conversion:", err);
  }
}

function closeConnectModal(): void {
  const connectModal = document.getElementById("connectModal");
  if (connectModal) connectModal.style.display = "none";
}

function initTierButtons(): void {
  const tierButtons = document.querySelectorAll(".tier-select");
  tierButtons.forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const target = e.currentTarget as HTMLElement;
      const tier = target.dataset.tier || "Starter";
      const shares = Number(target.dataset.shares || 10);
      await openTierPurchase(tier, shares);
    });
  });

  window.addEventListener("click", (e) => {
    const connectModal = document.getElementById("connectModal");
    if (e.target === connectModal) {
      closeConnectModal();
    }
  });
}

/* =========================================================
   PAYMENT SELECTOR
========================================================= */

function initPaymentSelector(): void {
  const fiatOption = document.getElementById("fiatOption");
  const cryptoOption = document.getElementById("cryptoOption");

  if (!fiatOption || !cryptoOption) return;

  fiatOption.addEventListener("click", () => {
    paymentMode = "fiat";
    fiatOption.classList.add("active");
    cryptoOption.classList.remove("active");
    updateShares();
  });

  cryptoOption.addEventListener("click", () => {
    paymentMode = "crypto";
    cryptoOption.classList.add("active");
    fiatOption.classList.remove("active");
    updateShares();
  });
}

/* =========================================================
   MODAL UTILITIES
========================================================= */

function randomFallback(): string {
  return "https://via.placeholder.com/400x300?text=Olive+Tree";
}

/* =========================================================
   AGREEMENT MODAL
========================================================= */

function openAgreement(): void {
  if (!selectedTree) return;

  document.body.style.overflow = "hidden";

  const agreeImg = document.getElementById("agreeImage") as HTMLImageElement | null;
  const fallback = randomFallback();

  if (agreeImg) {
    agreeImg.src = selectedTree.image_url || fallback;
    agreeImg.onerror = () => {
      agreeImg.src = fallback;
    };
  }

  const agreeTitle = document.getElementById("agreeTitle");
  if (agreeTitle) {
    agreeTitle.innerText = `Adopting ${selectedTree.name || selectedTree.tree_id}`;
  }

  const details = {
    agreeLocation: selectedTree.location || "Field F1",
    agreeAge: selectedTree.age || "5",
    agreeHeight: selectedTree.height || "1.5m",
    agreeVariety: selectedTree.variety || "Frantoio",
  };

  Object.entries(details).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.innerText = value;
  });

  const checkbox = document.getElementById("agreeCheckbox") as HTMLInputElement | null;
  const finalBtn = document.getElementById("finalConfirmBtn") as HTMLButtonElement | null;

  if (checkbox && finalBtn) {
    checkbox.checked = false;
    finalBtn.disabled = true;
    finalBtn.innerText = "Confirm & Pay";

    checkbox.onchange = () => {
      finalBtn.disabled = !checkbox.checked;
    };
  }

  const selectionModal = document.getElementById("modalOverlay");
  const agreementModal = document.getElementById("agreementModal");

  if (selectionModal) selectionModal.style.display = "none";
  if (agreementModal) agreementModal.style.display = "flex";
}

function closeAgreement(): void {
  const agreementModal = document.getElementById("agreementModal");
  const selectionModal = document.getElementById("modalOverlay");

  if (agreementModal) agreementModal.style.display = "none";
  if (selectionModal) selectionModal.style.display = "flex";
  document.body.style.overflow = "";
}

/* =========================================================
   SUCCESS MODAL
========================================================= */

function closeSuccess(): void {
  const successModal = document.getElementById("successModal");
  if (successModal) successModal.style.display = "none";
  document.body.style.overflow = "";
}

/* =========================================================
   FIAT PAYMENT
========================================================= */

async function startMollieCheckout(): Promise<void> {
  console.log("[PAYMENT] Starting Mollie checkout");

  try {
    const shareInput = document.getElementById("shareInput") as HTMLInputElement;
    if (!shareInput) throw new Error("Share input not found");

    const shares = Number(shareInput.value);
    if (isNaN(shares) || shares <= 0) {
      throw new Error("Invalid share amount");
    }

    const response = await fetch(`${API_BASE_URL}/create-mollie-payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        shares,
        treeId: selectedTree?.tree_id,
        treeName: selectedTree?.name,
        userEmail: window.OliviumAuth?.user?.email || null,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.checkoutUrl) {
      window.location.href = data.checkoutUrl;
    } else {
      alert("Failed to create payment: No checkout URL returned");
    }
  } catch (err) {
    console.error("[PAYMENT] Error:", err);
    alert(`Payment server error: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}

/* =========================================================
   BLOCKCHAIN TRANSACTION
========================================================= */

async function processBlockchainTx(): Promise<void> {
  const program = (window as any)._program;
  const provider = (window as any)._provider || (window as any).provider;
  const finalBtn = document.getElementById("finalConfirmBtn") as HTMLButtonElement | null;

  if (finalBtn && (finalBtn.disabled || finalBtn.dataset.processing === "true")) {
    return;
  }

  if (!program || !provider) {
    alert("Wallet connection not fully ready. Please sign in.");
    return;
  }

  if (!selectedTree) {
    alert("No tree selected for adoption.");
    return;
  }

  const amountInput = document.getElementById("shareInput") as HTMLInputElement | null;
  if (!amountInput) return;

  const amountValue = parseInt(amountInput.value, 10);
  if (isNaN(amountValue) || amountValue <= 0) {
    alert("Please enter a valid number of shares.");
    return;
  }

  const amount = new anchor.BN(amountValue);
  const buyerPublicKey = provider.wallet?.publicKey || provider.publicKey;
  
  if (!buyerPublicKey) {
    alert("Could not resolve signing authority public key.");
    return;
  }

  try {
    if (finalBtn) {
      finalBtn.disabled = true;
      finalBtn.dataset.processing = "true";
      finalBtn.innerText = "Processing...";
    }

    const [treePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("tree"), Buffer.from(selectedTree.tree_id)],
      program.programId
    );

    const [positionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("position"), buyerPublicKey.toBuffer(), Buffer.from(selectedTree.tree_id)],
      program.programId
    );

    const [protocolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("protocol")],
      program.programId
    );

    const [treasuryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury")],
      program.programId
    );

    const ix = await program.methods
      .purchaseShares(selectedTree.tree_id, amount)
      .accounts({
        tree: treePda,
        position: positionPda,
        protocol: protocolPda,
        treasury: treasuryPda,
        buyer: buyerPublicKey,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const connection = program.provider.connection;
    const transaction = new Transaction().add(ix);
    transaction.feePayer = buyerPublicKey;
    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

    let signature = "";
    
    // Sign transaction based on provider type
    if (provider.wallet && typeof provider.wallet.signTransaction === "function") {
      const signedTx = await provider.wallet.signTransaction(transaction);
      signature = await connection.sendRawTransaction(signedTx.serialize());
    } else if (typeof provider.signTransaction === "function") {
      const signedTx = await provider.signTransaction(transaction);
      signature = await connection.sendRawTransaction(signedTx.serialize());
    } else {
      // Fallback for Anchor provider
      signature = await program.provider.sendAndConfirm(transaction, []);
    }

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(signature, "confirmed");
    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${confirmation.value.err}`);
    }

    console.log("[BLOCKCHAIN] Transaction confirmed:", signature);

    const agreementModal = document.getElementById("agreementModal");
    const successModal = document.getElementById("successModal");

    if (agreementModal) agreementModal.style.display = "none";
    if (successModal) successModal.style.display = "flex";

    if (finalBtn) delete finalBtn.dataset.processing;

    if (typeof (window as any).loadTrees === "function") {
      (window as any).loadTrees();
    }
  } catch (err) {
    console.error("[BLOCKCHAIN] Transaction error:", err);
    alert(`Transaction failed: ${err instanceof Error ? err.message : 'Check wallet balance or approval.'}`);

    if (finalBtn) {
      finalBtn.disabled = false;
      delete finalBtn.dataset.processing;
      finalBtn.innerText = "Confirm & Pay";
    }
  }
}

// Expose functions to window with proper typing
(window as any).openTierPurchase = openTierPurchase;
(window as any).closeConnectModal = closeConnectModal;
(window as any).openAgreement = openAgreement;
(window as any).closeAgreement = closeAgreement;
(window as any).closeSuccess = closeSuccess;
(window as any).startMollieCheckout = startMollieCheckout;
(window as any).processBlockchainTx = processBlockchainTx;

/* =========================================================
   KEYBOARD SHORTCUTS
========================================================= */

window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;

  const agreementModal = document.getElementById("agreementModal");
  const selectionModal = document.getElementById("modalOverlay");

  if (agreementModal && agreementModal.style.display === "flex") {
    closeAgreement();
  } else if (selectionModal && selectionModal.style.display === "flex") {
    if (typeof (window as any).closeModal === "function") {
      (window as any).closeModal();
    }
  }
});

/* =========================================================
   INITIALIZATION
========================================================= */

window.addEventListener("DOMContentLoaded", async () => {
  console.log("[INIT] Initializing Olivium application...");
  
  initTierButtons();
  initPaymentSelector();
  await updateShares();
  
  console.log("[INIT] Application ready");
});

// Self-invoking function for immediate execution
(async () => {
  console.log("[BOOT] Running immediate pricing init");
  try {
    await updateShares();
  } catch (err) {
    console.error("[BOOT ERROR]", err);
  }
})();
