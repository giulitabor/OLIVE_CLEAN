import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { sb } from "./connection.ts";

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
   UPDATE SHARES
========================================================= */
(window as any).updateShares = async () => {

  const hiddenInput = document.getElementById("shareInput") as HTMLInputElement | null;
  if (!hiddenInput) return;

  const shares = Number(hiddenInput.value) || 1;

  const euroPerShare = 12.40;

  const totalEuro = shares * euroPerShare;

  const solPrice = await getSolPriceEUR();

  const totalSol = totalEuro / solPrice;

  const isCryptoMode = paymentMode === "crypto";

  const starterSolEl = document.getElementById("starter-sol-price");
  const keeperSolEl = document.getElementById("keeper-sol-price");
  const fullTreeSolEl = document.getElementById("fulltree-sol-price");

  const starterShares = 10;
  const keeperShares = 100;
  const fullTreeShares = 1000;

  const starterSol = (starterShares * euroPerShare) / solPrice;
  const keeperSol = (keeperShares * euroPerShare) / solPrice;
  const fullTreeSol = (fullTreeShares * euroPerShare) / solPrice;

  if (starterSolEl) starterSolEl.innerText = `~${starterSol.toFixed(2)} SOL`;
  if (keeperSolEl) keeperSolEl.innerText = `~${keeperSol.toFixed(2)} SOL`;
  if (fullTreeSolEl) fullTreeSolEl.innerText = `~${fullTreeSol.toFixed(2)} SOL`;

};

/* =========================================================
   PAYMENT SELECTOR
========================================================= */

function initPaymentSelector() {
  const fiatOption = document.getElementById("fiatOption");

  const cryptoOption =
    document.getElementById("cryptoOption");

  if (!fiatOption || !cryptoOption) return;

  fiatOption.addEventListener("click", () => {
    paymentMode = "fiat";

    fiatOption.classList.add("active");
    cryptoOption.classList.remove("active");

    (window as any).updateShares();
  });

  cryptoOption.addEventListener("click", () => {
    paymentMode = "crypto";

    cryptoOption.classList.add("active");
    fiatOption.classList.remove("active");

    (window as any).updateShares();
  });
}

/* =========================================================
   AGREEMENT MODAL
========================================================= */

(window as any).openAgreement = () => {
  if (!selectedTree) return;

  document.body.style.overflow = "hidden";

  const agreeImg = document.getElementById(
    "agreeImage"
  ) as HTMLImageElement | null;

  const fallback = randomFallback();

  if (agreeImg) {
    agreeImg.src = selectedTree.image_url || fallback;

    agreeImg.onerror = () => {
      agreeImg.src = fallback;
    };
  }

  const agreeTitle =
    document.getElementById("agreeTitle");

  if (agreeTitle) {
    agreeTitle.innerText =
      `Adopting ${selectedTree.name || selectedTree.tree_id}`;
  }

  const loc = document.getElementById("agreeLocation");
  const age = document.getElementById("agreeAge");
  const height = document.getElementById("agreeHeight");
  const variety = document.getElementById("agreeVariety");

  if (loc) {
    loc.innerText = selectedTree.location || "Field F1";
  }

  if (age) {
    age.innerText = selectedTree.age || "5";
  }

  if (height) {
    height.innerText = selectedTree.height || "1.5m";
  }

  if (variety) {
    variety.innerText = selectedTree.variety || "Frantoio";
  }

  const check = document.getElementById(
    "agreeCheckbox"
  ) as HTMLInputElement | null;

  const finalBtn = document.getElementById(
    "finalConfirmBtn"
  ) as HTMLButtonElement | null;

  if (check && finalBtn) {
    check.checked = false;

    finalBtn.disabled = true;

    finalBtn.innerText = "Confirm & Pay";

    check.onchange = () => {
      finalBtn.disabled = !check.checked;
    };
  }

  const selectionModal =
    document.getElementById("modalOverlay");

  const agreementModal =
    document.getElementById("agreementModal");

  if (selectionModal) {
    selectionModal.style.display = "none";
  }

  if (agreementModal) {
    agreementModal.style.display = "flex";
  }
};

(window as any).closeAgreement = () => {
  const agreementModal =
    document.getElementById("agreementModal");

  const selectionModal =
    document.getElementById("modalOverlay");

  if (agreementModal) {
    agreementModal.style.display = "none";
  }

  if (selectionModal) {
    selectionModal.style.display = "flex";
  }
};

/* =========================================================
   SUCCESS MODAL
========================================================= */

(window as any).closeSuccess = () => {
  const successModal =
    document.getElementById("successModal");

  if (successModal) {
    successModal.style.display = "none";
  }

  document.body.style.overflow = "";
};



/* =========================================================
   FIAT TX
========================================================= */

async function startMollieCheckout() {
  console.log("MOLLIE BUY");

  try {

    const shares = Number(
      (
        document.getElementById(
          "shareInput"
        ) as HTMLInputElement
      ).value
    );

    const response = await fetch(
      "http://localhost:3000/create-mollie-payment",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({

          shares,

          treeId:
            selectedTree?.tree_id,

          treeName:
            selectedTree?.name,

          userEmail:
            window.OliviumAuth?.user?.email || null

        }),
      }
    );

    const data = await response.json();

    if (data.checkoutUrl) {

      window.location.href =
        data.checkoutUrl;

    } else {

      alert("Failed to create payment");

    }

  } catch (err) {

    console.error(err);

    alert("Payment server error");

  }

}


async function startPaypalCheckout() {

console.log("startPaypalCheckout");

}
/* =========================================================
   BLOCKCHAIN TX
========================================================= */

(window as any).processBlockchainTx = async () => {
  const program = (window as any)._program;
  const provider = (window as any)._provider || (window as any).provider;
  const finalBtn = document.getElementById("finalConfirmBtn") as HTMLButtonElement | null;

  // 🛑 GUARD 1: If already running/processing, exit immediately to stop concurrent double clicks
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

  // DYNAMICALLY EXTRACT ACTIVE PUBLIC KEY FROM NATIVE OR EMBEDDED WALLET OBJECT
  const buyerPublicKey = provider.wallet?.publicKey || provider.publicKey;
  if (!buyerPublicKey) {
    alert("Could not resolve signing authority public key.");
    return;
  }

  try {
    // 🛑 GUARD 2: Instantly freeze the UI state before calling any blockchain/wallet signatures
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

    // Build the instruction explicitly
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

    // CHOOSE SIGNING PATHWAY BASED ON HOW WALLET INTEGRATES
    let signature = "";
    if (provider.wallet && typeof provider.wallet.signTransaction === "function") {
      // Standard anchor provider extension flow
      const signedTx = await provider.wallet.signTransaction(transaction);
      signature = await connection.sendRawTransaction(signedTx.serialize());
    } else if (typeof provider.signTransaction === "function") {
      // Direct Web3Auth/Embedded provider interaction pipeline
      const signedTx = await provider.signTransaction(transaction);
      signature = await connection.sendRawTransaction(signedTx.serialize());
    } else {
      // Fallback custom adapter anchor execution trigger
      signature = await program.provider.sendAndConfirm(transaction, []);
    }

    await connection.confirmTransaction(signature, "confirmed");

    const agreementModal = document.getElementById("agreementModal");
    const successModal = document.getElementById("successModal");

    if (agreementModal) agreementModal.style.display = "none";
    if (successModal) successModal.style.display = "flex";

    // Clean up processing state since it succeeded
    if (finalBtn) {
      delete finalBtn.dataset.processing;
    }

    loadTrees();
  } catch (err) {
    console.error("Transaction Error:", err);
    alert("Transaction failed. Check wallet balance or signing approval authorization window.");

    // 🔄 ROLLBACK: Only re-enable the payment button if the transaction execution strictly errored out
    if (finalBtn) {
      finalBtn.disabled = false;
      delete finalBtn.dataset.processing;
      finalBtn.innerText = "Confirm & Pay";
    }
  }
};

/* =========================================================
   ESCAPE KEY
========================================================= */

window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;

  const agreementModal =
    document.getElementById("agreementModal");

  const selectionModal =
    document.getElementById("modalOverlay");

  if (
    agreementModal &&
    agreementModal.style.display === "flex"
  ) {
    (window as any).closeAgreement();
  } else if (
    selectionModal &&
    selectionModal.style.display === "flex"
  ) {
    (window as any).closeModal();
  }
});
let cachedSolPrice = 100;
let lastPriceFetch = 0;

async function getSolPriceEUR(): Promise<number> {
    const now = Date.now();

    // Cache for 60 seconds
    if (now - lastPriceFetch < 60000) {
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

    // fallback
    return cachedSolPrice;
}

// Single DOM initialization handler
window.addEventListener("DOMContentLoaded", async () => {
  console.log("[INIT] Initializing application..JUST SHOW CORREST SOL PRICE.");

 // initPaymentSelector();
 await updateShares();
  }
