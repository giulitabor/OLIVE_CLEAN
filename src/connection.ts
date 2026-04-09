import { Buffer } from "buffer";
import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, setProvider } from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import idl from "./SIMPLE/idl/idl.json";
import { createClient } from "@supabase/supabase-js";

// ── Polyfills ──────────────────────────────────────────────────────────────
if (typeof (window as any).Buffer === "undefined") {
  (window as any).Buffer = Buffer;
}

// ── Supabase ───────────────────────────────────────────────────────────────
export const sb = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

async function hasSignedTOS(wallet: string): Promise<boolean> {
  const { data, error } = await sb
    .from("legal_sign")
    .select("id")
    .eq("wallet_pubkey", wallet)
    .limit(1);

  if (error) {
    console.error("SB TOS check failed:", error.message);
    return false;
  }
  return data.length > 0;
}

async function saveTOS(wallet: string): Promise<void> {
  const { error } = await sb.from("legal_sign").insert([{ wallet_pubkey: wallet }]);
  if (error) {
    console.error("SB TOS insert failed:", error.message);
  } else {
    console.log("✅ TOS stored in Supabase");
  }
}

// ── Core exports ───────────────────────────────────────────────────────────
export const connection = new Connection("http://127.0.0.1:8899", "confirmed");
export const PROGRAM_ID = new PublicKey(idl.address);

const OLV_MINT = new PublicKey("DYmefEbHQXyQfGQDCKQfVwuR4ZvjXSkVv3N76NEJHaKa");

export let provider: AnchorProvider;
export let program: Program;

// ── connectWallet ──────────────────────────────────────────────────────────
// Pure connect: sets up Anchor provider/program and updates shared UI slots
// (wallet-display, wallet-container, connectBtn hide). Does NOT rewire modal
// event listeners — each page handles its own TOS flow.
export async function connectWallet() {
  const wallet = (window as any).solana;
  if (!wallet) {
    alert("Phantom wallet not found!");
    throw new Error("Wallet not found");
  }

  await wallet.connect();

  provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  setProvider(provider);
  program = new Program(idl as any, provider);

  // Expose globals for debugging
  (window as any).provider  = provider;
  (window as any).program   = program;
  (window as any).connection = connection;

  console.log("Wallet Connected:", wallet.publicKey.toBase58());

  // Optional UI slots that may or may not exist on the current page
  const pubkey = wallet.publicKey.toBase58();
  const short  = pubkey.slice(0, 4) + "..." + pubkey.slice(-4);

  const walletDisplayEl    = document.getElementById("wallet-display");
  const walletContainerEl  = document.getElementById("wallet-container");
  const connectBtnEl       = document.getElementById("connectBtn");   // market.html
  const btnConnectEl       = document.getElementById("btn-connect");  // gov.html

  if (walletDisplayEl)   walletDisplayEl.innerText = pubkey;
  if (walletContainerEl) walletContainerEl.classList.remove("hidden");
  if (connectBtnEl)      connectBtnEl.classList.add("hidden");
  if (btnConnectEl)      { btnConnectEl.innerText = short; btnConnectEl.classList.add("connected"); }

  // Notify any page that has registered a post-connect hook
  if (typeof (window as any).showMainContent === "function") {
    (window as any).showMainContent();
  }

  // Fire a DOM event so pages can react without polling
  window.dispatchEvent(new CustomEvent("olivium:connected", { detail: { pubkey } }));

  return { provider, program };
}

// ── TOS sign helper (single canonical version) ────────────────────────────
export async function signTermsOfService(walletPubKey: string): Promise<boolean> {
  const wallet = (window as any).solana;
  if (!wallet) return false;

  const message = `
Welcome to Olivium Protocol.
By signing this message, you agree to the Terms of Service:

NOTICE: ASSET CLASSIFICATION & RISK DISCLOSURE

1. NOT A FINANCIAL INSTRUMENT: Olivium SFTs represent fractional rights to agricultural
   yields (Olive Oil) and ecological data (Carbon Sequestration) from physical olive groves.
   These are not shares, investment contracts, or securities.

2. REGENERATIVE UTILITY: Participation is intended for users supporting sustainability,
   eco-tourism, and regenerative agriculture. Olivium makes no guarantee of profit or
   secondary market liquidity.

3. PHYSICAL RISKS: Yields are subject to environmental factors including weather,
   biological health, and climate change.

Timestamp: ${new Date().toISOString()}
Wallet: ${walletPubKey}
  `.trim();

  try {
    const signed = await wallet.signMessage(new TextEncoder().encode(message), "utf8");
    console.log("✅ TOS Signed:", signed);
    return true;
  } catch (err) {
    console.error("❌ User rejected TOS signature.");
    return false;
  }
}

// ── DOMContentLoaded — wire up TOS modal for pages that use #connectBtn ───
// This handles market.html (id="connectBtn") and index.html.
// gov.html uses id="btn-connect" with window.connect() and handles its own flow.
window.addEventListener("DOMContentLoaded", () => {
  const connectBtn = document.getElementById("connectBtn") as HTMLButtonElement | null;
  const modal      = document.getElementById("tos-modal")   as HTMLElement | null;
  const confirmBtn = document.getElementById("confirm-tos-btn") as HTMLButtonElement | null;
  const cancelBtn  = document.getElementById("cancel-tos-btn")  as HTMLButtonElement | null;

  if (!connectBtn || !modal || !confirmBtn) {
    // Page does not use this TOS modal pattern (e.g. gov.html) — skip silently.
    return;
  }

  // Step 1: clicking connect shows the TOS modal
  connectBtn.addEventListener("click", () => {
    modal.style.display = "flex";
  });

  // Step 2: cancel closes the modal
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      modal.style.display = "none";
    });
  }

  // Step 3: confirm — check Supabase, sign if first time, then connect
  confirmBtn.addEventListener("click", async () => {
    modal.style.display = "none";

    const wallet = (window as any).solana;
    if (!wallet) {
      alert("Phantom not found. Please install the Phantom browser extension.");
      return;
    }

    try {
      connectBtn.innerText = "Connecting...";
      connectBtn.setAttribute("disabled", "true");

      // Connect wallet first so we have publicKey
      await wallet.connect();
      const pubkey = wallet.publicKey.toBase58();

      const alreadySigned = await hasSignedTOS(pubkey);

      if (!alreadySigned) {
        // First visit — get the user's cryptographic signature
        const accepted = await signTermsOfService(pubkey);
        if (!accepted) {
          // User rejected the signature
          connectBtn.innerText = "Connect Wallet";
          connectBtn.removeAttribute("disabled");
          return;
        }
        // Persist acceptance to Supabase so we don't ask again
        await saveTOS(pubkey);
      }

      // Now set up the full Anchor provider + program
      await connectWallet();

      connectBtn.innerText = pubkey.slice(0, 4) + "..." + pubkey.slice(-4);
      connectBtn.removeAttribute("disabled");

      // Let market.ts refresh the UI if available
      if (typeof (window as any).refreshMarket === "function") {
        await (window as any).refreshMarket();
      }

    } catch (err) {
      console.error("Connection flow failed:", err);
      connectBtn.innerText = "Connect Wallet";
      connectBtn.removeAttribute("disabled");
    }
  });
});

// ── fetchBalances (used by index.html oracle page) ─────────────────────────
export async function fetchBalances() {
  if (!program || !provider?.publicKey) return;

  const walletPubKey = provider.publicKey;

  let totalStakedOlv   = 0;
  let totalStakedShares = 0;
  let liquidTreeShares  = 0;
  let olvTokenBalance   = "0";
  let solBalance        = 0;

  try {
    solBalance = (await provider.connection.getBalance(walletPubKey)) / 1e9;

    try {
      const userAta = getAssociatedTokenAddressSync(OLV_MINT, walletPubKey);
      const bal = await program.provider.connection.getTokenAccountBalance(userAta);
      olvTokenBalance = bal.value.uiAmountString || "0";
    } catch { olvTokenBalance = "0"; }

    try {
      const [stakePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("stake"), walletPubKey.toBuffer()],
        program.programId
      );
      const stakeAccount = await program.account.stakeAccount.fetchNullable(stakePda);
      totalStakedOlv = (stakeAccount?.amount?.toNumber() || 0) / 1_000_000_000;
    } catch { totalStakedOlv = 0; }

    try {
      const positions = await program.account.treePosition.all([
        { memcmp: { offset: 8, bytes: walletPubKey.toBase58() } }
      ]);
      positions.forEach((p: any) => {
        liquidTreeShares  += p.account.shares?.toNumber()       ?? 0;
        totalStakedShares += p.account.lockedShares?.toNumber() ?? 0;
      });
    } catch { liquidTreeShares = 0; totalStakedShares = 0; }

    const set = (id: string, v: string) => {
      const el = document.getElementById(id);
      if (el) el.innerText = v;
    };
    set("balance-sol",    solBalance.toFixed(2));
    set("balance-liquid", `${liquidTreeShares} Shares`);
    set("balance-staked", `${totalStakedShares} Locked`);
    set("global-weight",  `${totalStakedOlv.toFixed(2)} OLV`);

  } catch (err) {
    console.error("fetchBalances failed:", err);
  }
}
