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
  guardTree: 5000,
} as const;

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

    // Dom updates inside the connectModal layout
    const tierNameEl = document.getElementById("selectedTierName");
    const tierSharesEl = document.getElementById("selectedTierShares");
    const tierSolEl = document.getElementById("selectedTierSol");
    const tierEuroEl = document.getElementById("selectedTierEuro");

    if (tierNameEl) tierNameEl.innerText = tierName;
    if (tierSharesEl) tierSharesEl.innerText = `${shares.toLocaleString()} Shares`;
    if (tierSolEl) tierSolEl.innerText = `~${solTotal.toFixed(2)} SOL`;
    if (tierEuroEl) tierEuroEl.innerText = `€${euroTotal.toLocaleString()}`;

    // Reveal container natively
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

// Attach event bindings to landing page tier selection layouts
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

  // Global overlay listener to close elements when backdrop clicked
  window.addEventListener("click", (e) => {
    const connectModal = document.getElementById("connectModal");
    const legalModal = document.getElementById("legalModal");
    const roadmapModal = document.getElementById("roadmapModal");
    const authModalOverlay = document.getElementById("authModalOverlay");

    if (e.target === connectModal) closeConnectModal();
    if (e.target === legalModal) closeLegalModal();
    if (e.target === roadmapModal) closeRoadmapModal();
    if (e.target === authModalOverlay) closeAuthModal();
  });
}

// Expose handlers to window if needed by HTML attributes
(window as any).openTierPurchase = openTierPurchase;
(window as any).closeConnectModal = closeConnectModal;

/* =========================================================
   THEME MODE TOGGLE CONTROLLER
========================================================= */

function initThemeToggle(): void {
  const modeToggleBtn = document.getElementById("modeToggleBtn");
  if (!modeToggleBtn) return;

  // Sync state if body already contains light-mode on boot
  if (document.body.classList.contains("light-mode")) {
    modeToggleBtn.innerText = "🌙 Dark Mode";
  }

  modeToggleBtn.addEventListener("click", () => {
    const isLight = document.body.classList.toggle("light-mode");
    modeToggleBtn.innerText = isLight ? "🌙 Dark Mode" : "☀️ Light Mode";
    console.log("[THEME] Layout swapped. Light Mode active:", isLight);
  });
}

/* =========================================================
   ADDITIONAL MARKETING AND SYSTEM MODALS HANDLERS
========================================================= */

function openLegalModal(): void {
  const modal = document.getElementById("legalModal");
  if (modal) modal.style.display = "flex";
}

function closeLegalModal(): void {
  const modal = document.getElementById("legalModal");
  if (modal) modal.style.display = "none";
}

function openRoadmapModal(): void {
  const modal = document.getElementById("roadmapModal");
  if (modal) modal.style.display = "flex";
}

function closeRoadmapModal(): void {
  const modal = document.getElementById("roadmapModal");
  if (modal) modal.style.display = "none";
}

function closeAuthModal(): void {
  const modal = document.getElementById("authModalOverlay");
  if (modal) modal.style.display = "none";
}

function initExtraModals(): void {
  // Connect Modal "X" close icon trigger bind
  const closeConnectModalBtn = document.getElementById("closeConnectModalBtn");
  if (closeConnectModalBtn) {
    closeConnectModalBtn.addEventListener("click", closeConnectModal);
  }

  // Legal Modal bindings
  const openLegalDisclosure = document.getElementById("openLegalDisclosure");
  const openLegalTerms = document.getElementById("openLegalTerms");
  const closeLegalTopBtn = document.getElementById("closeLegalTopBtn");
  const closeLegalBtn = document.getElementById("closeLegalBtn");

  if (openLegalDisclosure) openLegalDisclosure.addEventListener("click", openLegalModal);
  if (openLegalTerms) openLegalTerms.addEventListener("click", openLegalModal);
  if (closeLegalTopBtn) closeLegalTopBtn.addEventListener("click", closeLegalModal);
  if (closeLegalBtn) closeLegalBtn.addEventListener("click", closeLegalModal);

  // Roadmap Modal bindings
  const openRoadmapFooter = document.getElementById("openRoadmapFooter");
  const closeRoadmapHeaderBtn = document.getElementById("closeRoadmapHeaderBtn");
  const closeRoadmapFooterBtn = document.getElementById("closeRoadmapFooterBtn");

  if (openRoadmapFooter) openRoadmapFooter.addEventListener("click", openRoadmapModal);
  if (closeRoadmapHeaderBtn) closeRoadmapHeaderBtn.addEventListener("click", closeRoadmapModal);
  if (closeRoadmapFooterBtn) closeRoadmapFooterBtn.addEventListener("click", closeRoadmapModal);

  // MFA Auth Close button binding
  const closeAuthModalBtn = document.getElementById("closeAuthModal");
  if (closeAuthModalBtn) {
    closeAuthModalBtn.addEventListener("click", closeAuthModal);
  }
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
}

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
    const transaction = new anchor.web3.Transaction().add(ix);
    transaction.feePayer = buyerPublicKey;
    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

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

    await connection.confirmTransaction(signature, "confirmed");

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
    alert("Transaction failed. Check wallet balance or approval.");

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

  const connectModal = document.getElementById("connectModal");
  const agreementModal = document.getElementById("agreementModal");
  const selectionModal = document.getElementById("modalOverlay");
  const legalModal = document.getElementById("legalModal");
  const roadmapModal = document.getElementById("roadmapModal");
  const authModalOverlay = document.getElementById("authModalOverlay");

  // Dismiss whichever overlay interface layer is currently visible
  if (connectModal && connectModal.style.display === "flex") {
    closeConnectModal();
  } else if (agreementModal && agreementModal.style.display === "flex") {
    closeAgreement();
  } else if (legalModal && legalModal.style.display === "flex") {
    closeLegalModal();
  } else if (roadmapModal && roadmapModal.style.display === "flex") {
    closeRoadmapModal();
  } else if (authModalOverlay && authModalOverlay.style.display === "flex") {
    closeAuthModal();
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
  
  // Bind events to UI elements on load
  initTierButtons();
  initThemeToggle();
  initExtraModals();
  initPaymentSelector();

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
