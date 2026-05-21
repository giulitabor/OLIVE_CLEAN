import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";

/* =========================================================
   TYPES & INTERFACES
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
  console.log("[PRICING] updateShares firing");
  const solPrice = await getSolPriceEUR();

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
   DYNAMIC CONNECT TIER COUPLING
========================================================= */

async function openTierPurchase(tierName: string, shares: number): Promise<void> {
  selectedPurchaseShares = shares;
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

  const shareInputEl = document.getElementById("shareInput") as HTMLInputElement | null;
  if (shareInputEl) {
    shareInputEl.value = shares.toString();
  }

  const connectModal = document.getElementById("connectModal");
  if (connectModal) {
    connectModal.style.display = "flex";
    document.body.style.overflow = "hidden";
  }
}

function closeConnectModal(): void {
  const connectModal = document.getElementById("connectModal");
  if (connectModal) {
    connectModal.style.display = "none";
    document.body.style.overflow = "auto";
  }
}

/* =========================================================
   MODAL INTERFACE INTERACTIVE HANDLERS
========================================================= */

function openLegal(): void {
  const modal = document.getElementById("legalModal");
  if (modal) {
    modal.style.display = "flex";
    document.body.style.overflow = "hidden";
  }
}

function closeLegal(): void {
  const modal = document.getElementById("legalModal");
  if (modal) {
    modal.style.display = "none";
    document.body.style.overflow = "auto";
  }
}

function openRoadmap(): void {
  const modal = document.getElementById("roadmapModal");
  if (modal) {
    modal.style.display = "flex";
    document.body.style.overflow = "hidden";
  }
}

function closeRoadmap(): void {
  const modal = document.getElementById("roadmapModal");
  if (modal) {
    modal.style.display = "none";
    document.body.style.overflow = "auto";
  }
}

function toggleThemeMode(): void {
  document.body.classList.toggle("light-mode");
  const btn = document.getElementById("modeToggleBtn");
  if (btn) {
    btn.textContent = document.body.classList.contains("light-mode") ? "🌙 Dark Mode" : "☀️ Light Mode";
  }
}

/* =========================================================
   FIAT PAYMENT & CHECKOUT
========================================================= */

async function startMollieCheckout(): Promise<void> {
  console.log("[PAYMENT] Starting Mollie checkout");
  try {
    const shareInput = document.getElementById("shareInput") as HTMLInputElement | null;
    if (!shareInput) throw new Error("Share input parameter element not located.");

    const shares = Number(shareInput.value);
    const response = await fetch("http://localhost:3000/create-mollie-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shares,
        treeId: selectedTree?.tree_id || null,
        treeName: selectedTree?.name || null,
        userEmail: (window as any).OliviumAuth?.user?.email || null,
      }),
    });

    const data = await response.json();
    if (data.checkoutUrl) {
      window.location.href = data.checkoutUrl;
    } else {
      alert("Failed to build settlement processing redirect.");
    }
  } catch (err) {
    console.error("[PAYMENT] Checkout fault:", err);
    alert("Payment runtime target exception.");
  }
}

/* =========================================================
   BLOCKCHAIN TRANSACTION EXECUTION
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
    const [protocolPda] = PublicKey.findProgramAddressSync([Buffer.from("protocol")], program.programId);
    const [treasuryPda] = PublicKey.findProgramAddressSync([Buffer.from("treasury")], program.programId);

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

/* =========================================================
   ANIMATION INTERSECTION OBSERVERS & COUNTERS
========================================================= */

function animateCounter(id: string, target: number): void {
  const element = document.getElementById(id);
  if (!element) return;
  let current = 0;
  const increment = target / 100;
  const timer = setInterval(() => {
    current += increment;
    if (current >= target) {
      element.textContent = target.toLocaleString();
      clearInterval(timer);
    } else {
      element.textContent = Math.floor(current).toLocaleString();
    }
  }, 20);
}

/* =========================================================
   DOM EVENT HOOKS RUNTIME BINDING
========================================================= */

window.addEventListener("DOMContentLoaded", async () => {
  console.log("[INIT] Initializing Olivium execution space...");

  // Update real-time pricing indicators immediately
  await updateShares();

  // Mode Toggler Action
  const themeToggle = document.getElementById("modeToggleBtn");
  if (themeToggle) themeToggle.addEventListener("click", toggleThemeMode);

  // Dynamic Tabs Controller Action
  const tabLinks = document.querySelectorAll(".tab-link");
  tabLinks.forEach(link => {
    link.addEventListener("click", (e) => {
      const target = e.currentTarget as HTMLElement;
      const targetTabName = target.dataset.tab;
      if (!targetTabName) return;

      const tabContents = document.getElementsByClassName("tab-content");
      for (let i = 0; i < tabContents.length; i++) {
        (tabContents[i] as HTMLElement).style.display = "none";
        tabContents[i].classList.remove("active");
      }

      tabLinks.forEach(tL => tL.classList.remove("active"));

      const targetTab = document.getElementById(targetTabName);
      if (targetTab) {
        targetTab.style.display = "block";
        targetTab.classList.add("active");
      }
      target.classList.add("active");
    });
  });

  // Sticky Scrolled Navbar Transition
  const navbar = document.getElementById("navbar");
  window.addEventListener("scroll", () => {
    if (navbar) {
      if (window.scrollY > 100) navbar.classList.add("scrolled");
      else navbar.classList.remove("scrolled");
    }
  });

  // Dynamic Tier Card Interceptor Click Selection Bindings
  const tierButtons = document.querySelectorAll(".tier-select");
  tierButtons.forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const target = e.currentTarget as HTMLElement;
      const tier = target.dataset.tier || "Starter";
      const shares = Number(target.dataset.shares || 10);
      await openTierPurchase(tier, shares);
    });
  });

  // Smooth Navigation Layout Scrolling Interceptor
  document.querySelectorAll('a[href^="#"]:not(.tier-select)').forEach(anchor => {
    anchor.addEventListener("click", function (this: HTMLAnchorElement, e) {
      e.preventDefault();
      const hash = this.getAttribute("href");
      if (hash) {
        const target = document.querySelector(hash);
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });

  // Legal Modal Triggers
  document.getElementById("openLegalDisclosure")?.addEventListener("click", openLegal);
  document.getElementById("openLegalTerms")?.addEventListener("click", openLegal);
  document.getElementById("closeLegalBtn")?.addEventListener("click", closeLegal);

  // Roadmap Modal Triggers
  document.getElementById("openRoadmapFooter")?.addEventListener("click", openRoadmap);
  document.getElementById("closeRoadmapHeaderBtn")?.addEventListener("click", closeRoadmap);
  document.getElementById("closeRoadmapFooterBtn")?.addEventListener("click", closeRoadmap);
  document.getElementById("closeConnectModalBtn")?.addEventListener("click", closeConnectModal);

  // Global Overlay Click Closures
  window.addEventListener("click", (e: MouseEvent) => {
    const legalModal = document.getElementById("legalModal");
    const roadmapModal = document.getElementById("roadmapModal");
    const connectModal = document.getElementById("connectModal");

    if (e.target === legalModal) closeLegal();
    if (e.target === roadmapModal) closeRoadmap();
    if (e.target === connectModal) closeConnectModal();
  });

  // Register Entry View Animation Observers
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) entry.target.classList.add("visible");
    });
  }, { threshold: 0.1, rootMargin: "0px 0px -100px 0px" });

  document.querySelectorAll(".fade-in").forEach(el => observer.observe(el));

  // Run Simulated Staking Counter Countdown 
  setTimeout(() => animateCounter("staked-olv", 125000), 1000);

  console.log("[INIT] Application context fully mapped and active.");
});

/* =========================================================
   KEYBOARD CONTROLLER INTERCEPTIONS
========================================================= */

window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.key !== "Escape") return;

  const agreementModal = document.getElementById("agreementModal");
  const selectionModal = document.getElementById("modalOverlay");
  const connectModal = document.getElementById("connectModal");

  if (agreementModal && agreementModal.style.display === "flex") {
    const agreementModalEl = document.getElementById("agreementModal");
    if (agreementModalEl) agreementModalEl.style.display = "none";
    const modalOverlayEl = document.getElementById("modalOverlay");
    if (modalOverlayEl) modalOverlayEl.style.display = "flex";
  } else if (connectModal && connectModal.style.display === "flex") {
    closeConnectModal();
  } else if (selectionModal && selectionModal.style.display === "flex") {
    if (typeof (window as any).closeModal === "function") {
      (window as any).closeModal();
    }
  }
});

/* =========================================================
   GLOBAL CONTEXT WORKSPACE BRIDGE EXPORTS
========================================================= */

(window as any).processBlockchainTx = processBlockchainTx;
(window as any).startMollieCheckout = startMollieCheckout;
(window as any).openTierPurchase = openTierPurchase;
(window as any).closeConnectModal = closeConnectModal;
