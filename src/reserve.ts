import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";

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
} as const;

/* =========================================================
   STATE
========================================================= */

let selectedTree: Tree | null = null;
let paymentMode: "fiat" | "crypto" = "fiat";
let cachedSolPrice = 100;
let lastPriceFetch = 0;

/* =========================================================
   PRICE FETCHING
========================================================= */

async function getSolPriceEUR(): Promise<number> {
  const now = Date.now();

  // Return cached price if still valid
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

  // Return cached fallback
  return cachedSolPrice;
}

/* =========================================================
   UPDATE SHARES & PRICING
========================================================= */

async function updateShares(): Promise<void> {
   console.log("updateShares firing");
   

  const shares = Number(hiddenInput.value) || 1;
  const totalEuro = shares * EURO_PER_SHARE;
  const solPrice = await getSolPriceEUR();
  const totalSol = totalEuro / solPrice;

  // Update tier pricing display
  const starterSolEl = document.getElementById("starter-sol-price");
  const keeperSolEl = document.getElementById("keeper-sol-price");
  const fullTreeSolEl = document.getElementById("fulltree-sol-price");

  if (starterSolEl) {
    const starterSol = (TIER_SHARES.starter * EURO_PER_SHARE) / solPrice;
    starterSolEl.innerText = `~${starterSol.toFixed(2)} SOL`;
  }

  if (keeperSolEl) {
    const keeperSol = (TIER_SHARES.keeper * EURO_PER_SHARE) / solPrice;
    keeperSolEl.innerText = `~${keeperSol.toFixed(2)} SOL`;
  }

  if (fullTreeSolEl) {
    const fullTreeSol = (TIER_SHARES.fullTree * EURO_PER_SHARE) / solPrice;
    fullTreeSolEl.innerText = `~${fullTreeSol.toFixed(2)} SOL`;
  }
   console.log({
  starterSolEl,
  keeperSolEl,
  fullTreeSolEl
});
}

// Expose to window for external access
(window as any).updateShares = updateShares;

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
  // Add your fallback image logic here
  return "https://via.placeholder.com/400x300?text=Olive+Tree";
}

/* =========================================================
   AGREEMENT MODAL
========================================================= */

function openAgreement(): void {
  if (!selectedTree) return;

  document.body.style.overflow = "hidden";

  // Update image
  const agreeImg = document.getElementById("agreeImage") as HTMLImageElement | null;
  const fallback = randomFallback();

  if (agreeImg) {
    agreeImg.src = selectedTree.image_url || fallback;
    agreeImg.onerror = () => {
      agreeImg.src = fallback;
    };
  }

  // Update title
  const agreeTitle = document.getElementById("agreeTitle");
  if (agreeTitle) {
    agreeTitle.innerText = `Adopting ${selectedTree.name || selectedTree.tree_id}`;
  }

  // Update tree details
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

  // Setup checkbox and button
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

  // Show agreement modal
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
}

// Expose to window
(window as any).openAgreement = openAgreement;
(window as any).closeAgreement = closeAgreement;

/* =========================================================
   SUCCESS MODAL
========================================================= */

function closeSuccess(): void {
  const successModal = document.getElementById("successModal");
  if (successModal) successModal.style.display = "none";
  document.body.style.overflow = "";
}

(window as any).closeSuccess = closeSuccess;

/* =========================================================
   FIAT PAYMENT
========================================================= */

async function startMollieCheckout(): Promise<void> {
  console.log("[PAYMENT] Starting Mollie checkout");

  try {
    const shareInput = document.getElementById("shareInput") as HTMLInputElement;
    if (!shareInput) throw new Error("Share input not found");

    const shares = Number(shareInput.value);

    const response = await fetch("http://localhost:3000/create-mollie-payment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        shares,
        treeId: selectedTree?.tree_id,
        treeName: selectedTree?.name,
        userEmail: (window as any).OliviumAuth?.user?.email || null,
      }),
    });

    const data = await response.json();

    if (data.checkoutUrl) {
      window.location.href = data.checkoutUrl;
    } else {
      alert("Failed to create payment");
    }
  } catch (err) {
    console.error("[PAYMENT] Error:", err);
    alert("Payment server error");
  }
}

/* =========================================================
   BLOCKCHAIN TRANSACTION
========================================================= */

async function processBlockchainTx(): Promise<void> {
  const program = (window as any)._program;
  const provider = (window as any)._provider || (window as any).provider;
  const finalBtn = document.getElementById("finalConfirmBtn") as HTMLButtonElement | null;

  // Guard: Prevent concurrent transactions
  if (finalBtn && (finalBtn.disabled || finalBtn.dataset.processing === "true")) {
    return;
  }

  if (!program || !provider) {
    alert("Wallet connection not fully ready. Please sign in.");
    return;
  }

  if (!selectedTree) return;

  const amountInput = document.getElementById("shareInput") as HTMLInputElement | null;
  if (!amountInput) return;

  const amount = new anchor.BN(amountInput.value);

  // Extract public key from wallet
  const buyerPublicKey = provider.wallet?.publicKey || provider.publicKey;
  if (!buyerPublicKey) {
    alert("Could not resolve signing authority public key.");
    return;
  }

  try {
    // Lock UI
    if (finalBtn) {
      finalBtn.disabled = true;
      finalBtn.dataset.processing = "true";
      finalBtn.innerText = "Processing...";
    }

    // Derive PDAs
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

    // Build transaction
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
    const transaction = new anchor.web3.Transaction().add(ix);
    transaction.feePayer = buyerPublicKey;
    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

    // Sign and send transaction
    let signature = "";
    if (provider.wallet && typeof provider.wallet.signTransaction === "function") {
      const signedTx = await provider.wallet.signTransaction(transaction);
      signature = await connection.sendRawTransaction(signedTx.serialize());
    } else if (typeof provider.signTransaction === "function") {
      const signedTx = await provider.signTransaction(transaction);
      signature = await connection.sendRawTransaction(signedTx.serialize());
    } else {
      signature = await program.provider.sendAndConfirm(transaction, []);
    }

    // Confirm transaction
    await connection.confirmTransaction(signature, "confirmed");

    // Show success
    const agreementModal = document.getElementById("agreementModal");
    const successModal = document.getElementById("successModal");

    if (agreementModal) agreementModal.style.display = "none";
    if (successModal) successModal.style.display = "flex";

    if (finalBtn) delete finalBtn.dataset.processing;

    // Reload trees (assuming this function exists)
    if (typeof (window as any).loadTrees === "function") {
      (window as any).loadTrees();
    }
  } catch (err) {
    console.error("[BLOCKCHAIN] Transaction error:", err);
    alert("Transaction failed. Check wallet balance or approval.");

    // Re-enable button on error
    if (finalBtn) {
      finalBtn.disabled = false;
      delete finalBtn.dataset.processing;
      finalBtn.innerText = "Confirm & Pay";
    }
  }
}

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

  // Initialize payment selector if needed
  // initPaymentSelector();

  // Update share prices
  await updateShares();

  console.log("[INIT] Application ready");
});
(async () => {

  console.log("[BOOT] Running immediate pricing init");

  try {

    await updateShares();

  } catch (err) {

    console.error("[BOOT ERROR]", err);

  }

})();
