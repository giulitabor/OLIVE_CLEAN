/**
 * test.ts — Olivium DAO Browser Frontend
 */

import "./polyfill";
import { Buffer } from "buffer";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { connectWallet, sb, connection } from "./connection";
import './weatherEngine';
import { getAccount, getAssociatedTokenAddress } from "@solana/spl-token";


const idl = {
    "version": "0.1.0",
    "name": "olivium_dao",
    "address": "9ZmtBmwCBy2wvjr6DKBLmddRNu5AGd42S6mYg1thh9bV",
    "instructions": [
        { "name": "dummy", "discriminator": [0,0,0,0,0,0,0,0], "accounts": [], "args": [] }
    ],
    "accounts": [
        { "name": "ProtocolConfig", "discriminator": [207, 91, 250, 28, 152, 179, 215, 209] },
        { "name": "SharePosition", "discriminator": [239, 228, 59, 88, 149, 73, 218, 15] },
        { "name": "Tree", "discriminator": [100, 9, 213, 154, 6, 136, 109, 55] }
    ],
    "types": [
        { "name": "ProtocolConfig", "type": { "kind": "struct", "fields": [
            { "name": "authority", "type": "pubkey" },
            { "name": "treasury", "type": "pubkey" },
            { "name": "sharePriceLamports", "type": "u64" },
            { "name": "totalTrees", "type": "u32" }
        ]}},
        { "name": "Tree", "type": { "kind": "struct", "fields": [
            { "name": "treeId", "type": "string" },
            { "name": "name", "type": "string" },
            { "name": "variety", "type": "string" },
            { "name": "totalShares", "type": "u64" },
            { "name": "sharesSold", "type": "u64" }
        ]}},
        { "name": "SharePosition", "type": { "kind": "struct", "fields": [
            { "name": "owner", "type": "pubkey" },
            { "name": "treeId", "type": "string" },
            { "name": "sharesOwned", "type": "u64" }
        ]}}
    ]
};
//Add this to trigger the weather whenever the dashboard loads
async function initWeather() {
  console.log("TRYINGG TO LAOAD WEATHER");

    if ((window as any).refreshWeatherUI) {
        console.log("[INIT] Refreshing Weather UI...");
        await (window as any).refreshWeatherUI();
    }
}
//initWeather();

// ══════════════════════════════════════════════════════════════════════════════
// BUFFER POLYFILL
// ══════════════════════════════════════════════════════════════════════════════
if (typeof window !== "undefined" && !(window as any).Buffer) {
  (window as any).Buffer = Buffer;
  console.log("[INIT] Buffer polyfill installed");
}

// --- 1. Define Helpers First ---
const findProtocolPDA = () => {
  const program = (window as any)._program || (window as any).program;
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("protocol")],
    program.programId
  );
};

const findTreePDA = (treeId: string) => {
  const program = (window as any)._program || (window as any).program;
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("tree"), Buffer.from(treeId)],
    program.programId
  );
};

const findTreasuryPDA = (activeProgram: any) => {
    return anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("treasury")],
        activeProgram.programId
    );
};

// --- 2. IMMEDIATELY Expose to Window ---
(window as any).findProtocolPDA = findProtocolPDA;
(window as any).findTreePDA = findTreePDA;
(window as any).findTreasuryPDA = findTreasuryPDA;
/**
 * COMPLETE WALLET BALANCE + LIVE PRICE FEEDS
 *
 * Copy this entire block into your test.ts file
 * Place it BEFORE the loadDashboard() function (around line 240)
 */


// ══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ══════════════════════════════════════════════════════════════════════════════

const OLV_MINT = new PublicKey("DYmefEbHQXyQfGQDCKQfVwuR4ZvjXSkVv3N76NEJHaKa");
const CACHE_DURATION_MS = 60_000; // 1 minute

interface PriceCache {
  solPrice: number;
  olvPrice: number;
  lastUpdated: number;
}

const priceCache: PriceCache = {
  solPrice: 140.0,    // fallback if API fails
  olvPrice: 0.01,     // fallback if API fails
  lastUpdated: 0
};

// ══════════════════════════════════════════════════════════════════════════════
// LIVE PRICE FEEDS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch live SOL price from CoinGecko (free API, no key needed)
 */
async function fetchSolPrice(): Promise<number> {
  try {
    console.log("[PRICE] Fetching live SOL price from CoinGecko...");

    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
      {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const price = data.solana?.usd;

    if (typeof price !== "number" || price <= 0) {
      throw new Error("Invalid price data");
    }

    console.log(`[PRICE] ✅ Live SOL: $${price.toFixed(2)}`);
    return price;

  } catch (err: any) {
    console.warn(`[PRICE] ⚠️  CoinGecko failed: ${err.message}, using fallback`);
    return priceCache.solPrice;
  }
}

/**
 * Fetch OLV price from Jupiter aggregator
 * Falls back to hardcoded value if not found
 */
async function fetchOlvPrice(): Promise<number> {
  try {
    const response = await fetch(
      `https://price.jup.ag/v4/price?ids=${OLV_MINT.toBase58()}`
    );

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    const price = data.data?.[OLV_MINT.toBase58()]?.price;

    if (typeof price === "number" && price > 0) {
      console.log(`[PRICE] ✅ Live OLV: $${price.toFixed(6)}`);
      return price;
    }

    throw new Error("No Jupiter price data");
  } catch (err: any) {
    console.log(`[PRICE] OLV not on Jupiter, using fallback: $${priceCache.olvPrice}`);
    return priceCache.olvPrice;
  }
}

/**
 * Get current prices with smart caching
 * Fetches fresh prices if cache is older than CACHE_DURATION_MS
 */
async function getPrices(): Promise<{ solPrice: number; olvPrice: number }> {
  const now = Date.now();
  const cacheAge = now - priceCache.lastUpdated;

  // Return cached prices if fresh
  if (cacheAge < CACHE_DURATION_MS && priceCache.lastUpdated > 0) {
    const ageSeconds = Math.round(cacheAge / 1000);
    console.log(`[PRICE] Using cached prices (${ageSeconds}s old)`);
    return {
      solPrice: priceCache.solPrice,
      olvPrice: priceCache.olvPrice
    };
  }

  // Fetch fresh prices
  console.log("[PRICE] Fetching fresh prices...");

  const [solPrice, olvPrice] = await Promise.all([
    fetchSolPrice(),
    fetchOlvPrice()
  ]);

  // Update cache
  priceCache.solPrice = solPrice;
  priceCache.olvPrice = olvPrice;
  priceCache.lastUpdated = now;

  console.log(`[PRICE] 💰 Cached: SOL=$${solPrice.toFixed(2)}, OLV=$${olvPrice.toFixed(6)}`);

  return { solPrice, olvPrice };
}

// ══════════════════════════════════════════════════════════════════════════════
// WALLET BALANCE REFRESH
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch and display SOL + OLV balances with live USD conversion
 */
async function refreshWalletBalances(walletPubkey: PublicKey) {
  const conn = connection || (window as any)._connection;

  if (!conn) {
    console.error("[BALANCES] Connection not available");
    return;
  }

  try {
    const walletShort = walletPubkey.toBase58().slice(0, 8);
    console.log(`[BALANCES] Fetching for wallet ${walletShort}...`);

    // Get live prices
    const { solPrice, olvPrice } = await getPrices();

    // ═══════════════════════════════════════════════════════════════════
    // 1. SOL BALANCE
    // ═══════════════════════════════════════════════════════════════════
    const solLamports = await conn.getBalance(walletPubkey);
    const solBalance = solLamports / 1_000_000_000;
    const solUsd = solBalance * solPrice;

    const solBalEl = document.getElementById("wallet-sol-balance");
    const solUsdEl = document.getElementById("wallet-sol-usd");
    if (solBalEl) solBalEl.textContent = solBalance.toFixed(4);
    if (solUsdEl) solUsdEl.textContent = `$${solUsd.toFixed(2)}`;

    console.log(`[BALANCES] ✅ SOL: ${solBalance.toFixed(4)} @ $${solPrice.toFixed(2)} = $${solUsd.toFixed(2)}`);

    // ═══════════════════════════════════════════════════════════════════
    // 2. OLV TOKEN BALANCE
    // ═══════════════════════════════════════════════════════════════════
    let olvBalance = 0;
    let olvUsd = 0;

    try {
      const olvAta = await getAssociatedTokenAddress(OLV_MINT, walletPubkey);
      const olvAccount = await getAccount(conn, olvAta);
      olvBalance = Number(olvAccount.amount) / 1_000_000_000; // 9 decimals
      olvUsd = olvBalance * olvPrice;

      console.log(`[BALANCES] ✅ OLV: ${olvBalance.toLocaleString()} @ $${olvPrice.toFixed(6)} = $${olvUsd.toFixed(2)}`);
    } catch (err: any) {
      if (err.message?.includes("could not find account")) {
        console.log("[BALANCES] No OLV token account yet (balance: 0)");
      } else {
        console.warn(`[BALANCES] ⚠️  OLV fetch error: ${err.message}`);
      }
    }

    const olvBalEl = document.getElementById("wallet-olv-balance");
    const olvUsdEl = document.getElementById("wallet-olv-usd");

    if (olvBalEl) {
      olvBalEl.textContent = olvBalance > 0
        ? olvBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })
        : "0";
    }
    if (olvUsdEl) olvUsdEl.textContent = `$${olvUsd.toFixed(2)}`;

    // ═══════════════════════════════════════════════════════════════════
    // 3. TOTAL PORTFOLIO VALUE
    // ═══════════════════════════════════════════════════════════════════
    const totalUsd = solUsd + olvUsd;
    const totalEl = document.getElementById("wallet-total-usd");
    if (totalEl) totalEl.textContent = `$${totalUsd.toFixed(2)}`;

    console.log(`[BALANCES] ✅ Total Portfolio: $${totalUsd.toFixed(2)}`);
    console.log(`[BALANCES] ═══════════════════════════════════════════════════`);

  } catch (err: any) {
    console.error("[BALANCES] ❌ Fatal error:", err);
    console.error(err.stack);

    // Reset UI to placeholders on error
    const elementIds = [
      "wallet-sol-balance",
      "wallet-sol-usd",
      "wallet-olv-balance",
      "wallet-olv-usd",
      "wallet-total-usd"
    ];

    elementIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = "—";
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// EXPOSE GLOBALLY
// ══════════════════════════════════════════════════════════════════════════════

(window as any).refreshWalletBalances = refreshWalletBalances;
(window as any).getPrices = getPrices;

console.log("[INIT] ✅ Wallet balance functions loaded");
// ══════════════════════════════════════════════════════════════════════════════
// EXPOSE FOR HTML HELPERS
// ══════════════════════════════════════════════════════════════════════════════
(window as any)._sb          = sb;
(window as any)._connection  = connection;
const program = (window as any)._program || (window as any).program;
(window as any)._findTreePDA = findTreePDA;
(window as any)._buyShares   = (treeId: string | number, shares: number) => {
  const treeIdStr = String(treeId);
  console.log(`[_buyShares] Called from modal: treeId=${treeId} (converted to: ${treeIdStr}), shares=${shares}`);
  return buyShares(treeIdStr, shares).catch((e: any) => showToast(e.message, true));
};
(window as any)._sellShares  = (treeId: string | number, shares: number) => {
  const treeIdStr = String(treeId);
  console.log(`[_sellShares] Called from modal: treeId=${treeId} (converted to: ${treeIdStr}), shares=${shares}`);
  return sellShares(treeIdStr, shares).catch((e: any) => showToast(e.message, true));
};

console.log("[INIT] Window globals exposed: _sb, _connection, _program, _findTreePDA, _buyShares, _sellShares");



const REWARD_TIERS = [
  { id: 0, name: "Olive Enthusiast", min: 0, icon: "🫒", desc: "Start your journey in the grove" },
  { id: 1, name: "Olive Lover", min: 100, icon: "🫒", desc: "Quarterly oil shipments & reports" },
  { id: 2, name: "Eco Guardian", min: 500, icon: "🌿", desc: "Carbon credits & villa nights" },
  { id: 3, name: "Grove Patron", min: 1000, icon: "👑", desc: "Full harvest share & premium villa stay" },
  { id: 4, name: "Legacy Holder", min: 5000, icon: "🏛️", desc: "Governance rights & revenue priority" }
];

const PERKS_DATABASE = [
  { tier: 1, icon: "📦", title: "Quarterly EVOO", desc: "250ml Premium Cold-Pressed" },
  { tier: 1, icon: "📜", title: "Member Certificate", desc: "Digital Proof of Ownership" },
  { tier: 2, icon: "🌱", title: "Carbon Credits", desc: "Verified Sequestration Data" },
  { tier: 2, icon: "🌙", title: "1 Night Eco-Stay", desc: "Complimentary Villa Night" },
  { tier: 3, icon: "🍾", title: "24 Bottles/Year", desc: "Full Tree Harvest Payout" },
  { tier: 3, icon: "🏰", title: "3-Night Villa Stay", desc: "Premium Suite Experience" },
  { tier: 4, icon: "🗳️", title: "Governance Voting", desc: "Influence Farm Decisions" },
  { tier: 4, icon: "💰", title: "Revenue Priority", desc: "First-tier Profit Sharing" }
];

//HELPER ADMIN CONSOLE
const log = document.getElementById("admin-log");

function adminLog(msg: string) {
  console.log(msg);
  if (log) {
    log.innerHTML += msg + "\n";
    log.scrollTop = log.scrollHeight;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN WALLET PUBKEY
// ══════════════════════════════════════════════════════════════════════════════
const ADMIN_PUBKEY = "8xkNHk2VpWBM6Nk3enitFCs7vwh2inCveTNintcXHc54";
console.log(`[CONFIG] Admin pubkey: ${ADMIN_PUBKEY}`);

// ══════════════════════════════════════════════════════════════════════════════
// DOM REFS
// ══════════════════════════════════════════════════════════════════════════════
const treesContainer = document.getElementById("trees-grid") as HTMLElement;
console.log(`[DOM] Trees container found: ${!!treesContainer}`);

// ══════════════════════════════════════════════════════════════════════════════
// PDA HELPERS (must match lib.rs seeds exactly)
// ══════════════════════════════════════════════════════════════════════════════

//function findProtocolPDA() {
//    const program = window._program;

//    if (!program) {
////        throw new Error("Program not initialized");
//    }

//    return PublicKey.findProgramAddressSync(
//        [Buffer.from("protocol")],
//        program.programId
//    );
//}

//function findTreePDA(treeId: string | number): [PublicKey, number] {
//  const program = window._program;
//  if (!program) {
//      throw new Error("Program not initialized");
//  }

//  const treeIdStr = String(treeId);
//  const [pda, bump] = anchor.web3.PublicKey.findProgramAddressSync(
  //  [Buffer.from("tree"), Buffer.from(treeIdStr)],
  //  program.programId
//  );
  //console.log(`[PDA] Tree PDA for "${treeIdStr}": ${pda.toBase58()}, bump: ${bump}`);
  //return [pda, bump];
//}


let treesCache: any[] | null = null;
let treesPromise: Promise<any[]> | null = null;

export async function getTrees() {
    if (treesCache) return treesCache;

    if (treesPromise) return treesPromise;

    treesPromise = (async () => {
        console.log("🌳 Fetching trees ONCE");

        const result = await _program.account.tree.all();
        treesCache = result;

        return result;
    })();

    return treesPromise;
}

let positionsCache: any[] | null = null;
let positionsPromise: Promise<any[]> | null = null;

export async function getPositions() {
    if (positionsCache) return positionsCache;
    if (positionsPromise) return positionsPromise;

    positionsPromise = _program.account.sharePosition.all();

    positionsCache = await positionsPromise;
    return positionsCache;
}

function findPositionPDA(owner: PublicKey, treeId: string | number): [PublicKey, number] {
  const treeIdStr = String(treeId);
  const [pda, bump] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("position"),
      owner.toBuffer(),
      Buffer.from(treeIdStr)
    ],
    program.programId
  );
  console.log(`[PDA] Position PDA for tree "${treeIdStr}", owner ${owner.toBase58().slice(0,8)}: ${pda.toBase58()}, bump: ${bump}`);
  return [pda, bump];
}

// ══════════════════════════════════════════════════════════════════════════════
// WALLET HELPERS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Returns the current wallet's PublicKey.
 * Use this for addr.toBase58() or PDA derivation.
 */
function getPublicKey(): PublicKey {
  const wallet = (window as any).phantom?.solana || (window as any).solana;
  if (!wallet || !wallet.publicKey) {
    throw new Error("Wallet not connected or publicKey missing");
  }
  return wallet.publicKey;
}

/**
 * Returns the Anchor Provider and Program instance.
 */
function getWallet() {
  const provider = (window as any).provider;
  const program = (window as any).program || (window as any)._program;

  if (!provider || !program) {
    throw new Error("Anchor Provider or Program not initialized yet");
  }
  return { provider, program };
}
// ══════════════════════════════════════════════════════════════════════════════
// SAFE FETCH TREE (handles non-existent accounts gracefully)
// ══════════════════════════════════════════════════════════════════════════════

async function safeFetchTree(treePDA: PublicKey): Promise<any | null> {
  try {
    const account = await (program.account as any).tree.fetch(treePDA);
    console.log(`[FETCH] ✅ Tree ${treePDA.toBase58().slice(0,8)}: ${account.name} (${account.sharesSold}/${account.totalShares} sold)`);
    return account;
  } catch (err: any) {
    if (err.message?.includes("Account does not exist")) {
      console.log(`[FETCH] ⚠️  Tree ${treePDA.toBase58().slice(0,8)}: not initialized`);
      return null;
    }
    console.error(`[FETCH] ❌ Tree ${treePDA.toBase58().slice(0,8)}: ${err.message}`);
    throw err;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// CONNECT WALLET
// ══════════════════════════════════════════════════════════════════════════════

(window as any).connect = async () => {
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("[CONNECT] Starting wallet connection flow...");
  console.log("═══════════════════════════════════════════════════════════\n");

  try {
    await connectWallet();
    const wallet = (window as any).solana;
    if (!wallet || !wallet.publicKey) {
      throw new Error("Wallet not connected or publicKey missing");
    }
    const program = window._program;
    program.programId
    const addr = wallet.publicKey.toBase58();
    const isAdmin = addr === ADMIN_PUBKEY;
    console.log(`[CONNECT] ✅ Wallet connected: ${addr}`);
    console.log(`[CONNECT] Admin status: ${isAdmin ? "YES" : "NO"}`);

    // Tell HTML shell — shows app, hides hero, wires nav tabs
    if ((window as any).onWalletConnected) {
      console.log("[CONNECT] Calling onWalletConnected(addr, isAdmin)");

      (window as any).onWalletConnected(addr, isAdmin);
    } else {
      console.warn("[CONNECT] ⚠️  onWalletConnected not defined in HTML");
    }


    if (isAdmin) {
            console.log("[ADMIN] User is admin, populating admin panel...");

            // 1. Set Authority and Program ID display
            const set = (id: string, v: string) => {
                const el = document.getElementById(id);
                if(el) el.textContent = v;
            };
            set('admin-authority', addr.slice(0, 6) + '...' + addr.slice(-4));
            set('admin-program-id', program.programId.toBase58().slice(0, 8) + '...');

            // 2. Fill the Protocol Card using the function you provided
        const protocol = (window as any)._protocol;
        if (protocol && typeof (window as any).fillAdminProtocol === 'function') {
            (window as any).fillAdminProtocol(protocol);

        }
        // 3. Load the Supabase status table using the function you provided
            if (typeof (window as any).refreshAdminStatus === 'function') {
                await (window as any).refreshAdminStatus();
            }
      }
    console.log("[CONNECT] Loading dashboard.and wallets balance..");

    await loadDashboard();
  //  await renderAdminLedger();

    console.log("[CONNECT] ✅ Connection flow complete\n");

  } catch (err: any) {
    console.error("[CONNECT] ❌ Connection failed:", err);
    console.error("[CONNECT] Stack:", err.stack);
    showToast("Connect failed: " + err.message, true);
  }
};


/**
 * Synchronizes On-Chain state to Supabase after a transaction.
 * Updates ownership (active/inactive), global metadata, and logs the event.
 */
 /**
  * Synchronizes On-Chain state to Supabase after a transaction.
  * Uses the updated schema: 'wallet_address' and 'shares'
  */
 async function syncOnChainToSupabase(walletPubKey: PublicKey, treeId: string, amount: number, type: 'BUY' | 'SELL', txSignature: string) {
     const activeProgram = (window as any)._program || program;
     const walletAddr = walletPubKey.toBase58();

     console.log(`[SYNC] Starting audit for ${type} | Tree: ${treeId} | Wallet: ${walletAddr}`);

     try {
         // 1. Fetch Fresh On-Chain Data using the String ID
         const [treePDA] = (window as any)._findTreePDA(treeId);
         const treeAccount = await activeProgram.account.tree.fetch(treePDA);

         // Derive Position PDA to get current ownership state
         const [positionPDA] = PublicKey.findProgramAddressSync(
             [Buffer.from("position"), walletPubKey.toBuffer(), Buffer.from(treeId)],
             activeProgram.programId
         );

         let sharesOwned = 0;
         let isGuardian = false;

         try {
             const posAccount = await activeProgram.account.sharePosition.fetch(positionPDA);
             sharesOwned = posAccount.sharesOwned.toNumber();
             isGuardian = posAccount.isGuardian;
         } catch (e) {
             // Account might be closed if shares reached 0
             sharesOwned = 0;
         }

         // 2. Update Tree Metadata (Global Sold Count)
         await sb.from('tree_metadata').update({
             shares_sold: treeAccount.sharesSold.toNumber(),
             guardian_count: treeAccount.guardianCount,
             on_chain_address: treePDA.toBase58(),
             updated_at: new Date()
         }).eq('tree_id', treeId);

         // 3. Update User Ownership (Matches your new 'wallet_address' and 'shares' columns)
         const { error: upsertError } = await sb.from('tree_ownership').upsert({
             wallet_address: walletAddr,
             tree_id: treeId,
             shares: sharesOwned, // Updated from shares_owned to shares
             is_guardian: isGuardian,
             status: sharesOwned > 0 ? 'active' : 'inactive',
             last_sync: new Date()
         }, { onConflict: 'wallet_address,tree_id' });

         if (upsertError) throw upsertError;

         // 4. Log the Transaction
         await sb.from('transaction_log').insert({
             wallet_address: walletAddr,
             tree_id: treeId,
             type: type,
             amount: amount,
             signature: txSignature
         });

         console.log(`[SYNC] ✅ Supabase sync complete for ${txSignature.slice(0,8)}...`);
     } catch (err: any) {
         console.error("[SYNC] ❌ Sync failed:", err.message);
     }
 }

(window as any).refreshDashboard = () => {
  console.log("[REFRESH] Manual dashboard refresh triggered");
  return loadDashboard().catch(console.error);
};

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD — MAIN LOAD FUNCTION
// FIX #1: Protocol not initialized → graceful degradation instead of hard throw
// ══════════════════════════════════════════════════════════════════════════════
async function fetchUserPositions(walletInput: any) {
const activeProgram = (window as any)._program || (window as any).program;
  if (!activeProgram) return [];

  try {
    // FIX: Convert string or wallet object to PublicKey
    const walletPubKey = typeof walletInput === 'string'
      ? new PublicKey(walletInput)
      : (walletInput.publicKey || walletInput);

    const allPositions = await activeProgram.account.sharePosition.all([
      { memcmp: { offset: 8, bytes: walletPubKey.toBase58() } }
    ]);

    let totalSharesOwned = 0;
    allPositions.forEach((pos: any) => {
      totalSharesOwned += pos.account.sharesOwned.toNumber();
    });

    if (typeof (window as any).updateDashboardStats === 'function') {
      (window as any).updateDashboardStats(totalSharesOwned, allPositions.length);
    }
    return allPositions;
  } catch (e) {
    console.error("fetchUserPositions failed:", e);
    return [];
  }
}
 async function syncPurchaseToSupabase(walletPubKey, treeId) {
     const activeProgram = (window as any)._program;

     // 1. Derive PDAs (seeds from IDL)
     const [treePda] = PublicKey.findProgramAddressSync(
         [Buffer.from("tree"), new anchor.BN(treeId).toArrayLike(Buffer, 'le', 4)],
         activeProgram.programId
     );

     const [positionPda] = PublicKey.findProgramAddressSync(
         [Buffer.from("position"), walletPubKey.toBuffer(), new anchor.BN(treeId).toArrayLike(Buffer, 'le', 4)],
         activeProgram.programId
     );

     try {
         // 2. Fetch updated on-chain data
         const treeAccount = await activeProgram.account.tree.fetch(treePda);
         const positionAccount = await activeProgram.account.sharePosition.fetch(positionPda);

         // 3. Update tree_metadata (Syncs the pool of available shares)
         const { error: treeError } = await supabase
             .from('tree_metadata')
             .update({
                 shares_sold: treeAccount.sharesSold.toNumber(),
                 last_harvest_yield: treeAccount.lastHarvestYieldMl,
                 total_co2_kg: treeAccount.totalCo2Kg.toNumber(),
                 updated_at: new Date()
             })
             .eq('tree_id', treeId);

         // 4. Update tree_ownership (The audit trail for the wallet)
         const { error: ownershipError } = await supabase
             .from('tree_ownership')
             .upsert({
                 wallet_address: walletPubKey.toBase58(),
                 tree_id: treeId,
                 shares_owned: positionAccount.sharesOwned.toNumber(),
                 is_guardian: positionAccount.isGuardian,
                 on_chain_pda: positionPda.toBase58(),
                 last_sync: new Date()
             }, { onConflict: 'wallet_address, tree_id' });

         if (treeError || ownershipError) console.error("Sync Error:", treeError || ownershipError);

     } catch (e) {
         console.error("Failed to fetch on-chain data for sync:", e);
     }
 }
 /**
  * Updated Logic: Accepts Number for comparison
  */
 function getTierName(shares: number) {
     if (shares >= 5000) return "Legacy Holder";
     if (shares >= 1000) return "Grove Patron";
     if (shares >= 500) return "Eco Guardian";
     if (shares >= 100) return "Olive Lover";
     return "Olive Enthusiast";
 }

 function calculatePerks(shares: number) {
     if (shares < 100) return `${shares} / 100 shares to unlock Olive Lover`;
     if (shares < 500) return "Olive Lover Perks Active";
     if (shares < 1000) return "Eco Guardian Perks Active";
     return "Premium Perks Unlocked";
 }

// Helper to prevent blank reward fields
function calculatePendingRewards(account: any) {
    // If your contract stores rewardsAccrued, use it; otherwise return 0 instead of undefined
    return (account.rewardsAccrued?.toNumber() || 0) / 1_000_000_000;
}




function updateDashboardStats(totalShares: number, treeCount: number) {
    // 1. Identify all Dashboard Elements
    const elFarmPct = document.getElementById('farmSharePct');
    const elDashTrees = document.getElementById('dash-trees');
    const elDashShares = document.getElementById('dash-shares');
    const elDashOil = document.getElementById('dash-oil');
    const elDashBottles = document.getElementById('dash-bottles');

    // 1. Target the Banner IDs
        const elBannerTrees = document.getElementById('yourTrees');
        const elBannerShares = document.getElementById('portfolioShares');
        const elBannerOil = document.getElementById('oilLiters');
        const elBannerBottles = document.getElementById('bottles');
        const elBannerCarbon = document.getElementById('carbonEst');
        const elBannerValue = document.getElementById('portfolioValue');

        // 2. Calculations
        const annualLiters = totalShares * 0.020; // 20ml per share = 0.020L
        const annualBottles = Math.floor(annualLiters * 2); // 500ml bottles
        const carbonKg = (totalShares / 1000) * 25;
        const estValueSol = totalShares * 0.5; // Assuming 0.5 SOL/share based on your logs

    // Benefit Grid Elements
    const elBenefitOil = document.getElementById('benefit-oil');
    const elBenefitCarbon = document.getElementById('benefit-carbon');
    const elBenefitVisit = document.getElementById('benefit-visit');

    // 2. Calculations
    // Assuming 1,000,000 total shares in the entire grove for the %
    const protocol = (window as any)._protocol;
    const globalTotal = protocol?.totalShares?.toNumber?.() || 1000000;
    const ownershipPct = (totalShares / globalTotal) * 100;

    // Production: ~0.024L per share (24L per full tree of 1000 shares)
  //  const annualLiters = totalShares * 0.024;
  //  const annualBottles = Math.floor(annualLiters / 0.75);

    // Carbon: ~25kg per tree (1000 shares)
  //  const carbonKg = (totalShares / 1000) * 25;

    // 3. Helper to update text and kill shimmer
    const render = (el: HTMLElement | null, value: string) => {
        if (el) {
            el.textContent = value;
            el.classList.remove('shimmer');
        }
    };

    // 4. Execute Updates
    render(elFarmPct, `${ownershipPct.toFixed(4)}%`);
    render(elDashTrees, treeCount.toString());
    render(elDashShares, totalShares.toLocaleString());
    render(elDashOil, `${annualLiters.toFixed(1)}L`);
    render(elDashBottles, annualBottles.toString());

    // Update Benefits Cards
    render(elBenefitOil, `${annualLiters.toFixed(1)} L`);
    render(elBenefitCarbon, `${carbonKg.toFixed(1)} kg/yr`);

    // Special logic for Farm Access text
    if (elBenefitVisit) {
        let accessStatus = "No access yet";
        if (totalShares >= 1000) accessStatus = "Full Access Unlocked";
        else if (totalShares >= 500) accessStatus = "Day Visit Ready";
        render(elBenefitVisit, accessStatus);
    }

    console.log(`[DASHBOARD] UI Sync complete for ${totalShares} shares.`);
}
(window as any).setupProtocol = async (sharePriceSol: number) => {
  //const provider = new anchor.AnchorProvider(connection, wallet, {});
  const prog = new anchor.Program(idl, provider);

  //const prog = getActiveProgram();

  const [protocolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("protocol")],
    prog.programId
  );

  // 1. Check if it exists first
  const info = await connection.getAccountInfo(protocolPda);
  if (info) {
    console.log("⚠️ Protocol already exists. Skipping initialization.");
    return; // Or call an 'update' instruction if your program has one
  }
    console.log("[ADMIN] 🛠️ Initializing Protocol with 7 arguments...");

    // Use the reliable program instance
    const activeProgram = (window as any)._program || (window as any).program;
    const wallet = (window as any).solana;

    if (!activeProgram) {
        alert("Connect wallet first!");
        return;
    }

    try {
        // 1. Derive PDAs exactly as the contract expects
        const [protocolPDA] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("protocol")],
            activeProgram.programId
        );
        const [treasuryPDA] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("treasury")],
            activeProgram.programId
        );

        // 2. Prepare the 7 Arguments (must be BN for u64)
        const args = {
            sharePrice:  new anchor.BN((sharePriceSol || 0.5) * 1e9),
            buyFee:      new anchor.BN(100),   // 1%
            sellFee:     new anchor.BN(500),   // 5%
            threshold:   new anchor.BN(1000),  // 1000 shares
            totalShares: new anchor.BN(1000),  // 1000 shares per tree
            minPurchase: new anchor.BN(10)     // 10 shares min
        };

        console.log("Sending Init TX to PDA:", protocolPDA.toBase58());

        // 3. The RPC Call

                console.log("ARGS LENGTH:", [
          args.sharePrice,
          args.buyFee,
          args.sellFee,
          args.threshold,
          args.totalShares,
          args.minPurchase
        ].length);
        // NOTE: Use camelCase 'initializeProtocol' to match Anchor's auto-generated IDL methods
        const tx = await activeProgram.methods
            .initializeProtocol(
                args.sharePrice,
                args.buyFee,
                args.sellFee,
                args.threshold,
                args.totalShares,
                args.minPurchase
            )
            .accounts({
                protocol: protocolPDA,   // Account name from your IDL
                authority: wallet.publicKey,
                treasury: treasuryPDA,   // Account name from your IDL
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .rpc();

        console.log("✅ Protocol Initialized! TX:", tx);
        alert("Success! Protocol initialized on-chain.");

        // Reload to let the dashboard fetch the newly created account
        location.reload();

    } catch (err: any) {
        console.error("[ADMIN] Setup failed:", err);
        // Better error logging for Anchor errors
        if (err.logs) console.log("Program Logs:", err.logs);
        alert("Setup failed: " + err.message);
    }
};
let _cachedTrees: any[] = []; // Declare it here!

/**
 * Call this after loadDashboard() to populate the Admin Sync Table
 */
 // test.ts - Logic to calculate missing fields
 async function refreshAdminData() {
     try {
         const [protocolPda] = findProtocolPDA();
         const protocolAccount = await program.account.protocolConfig.fetch(protocolPda);

         // Use .all() to count actual accounts on-chain
         const allTreeAccounts = await program.account.tree.all();

         // 1. Calculate Total Shares Sold
         const totalSold = allTreeAccounts.reduce((sum, t) => sum + t.account.sharesSold.toNumber(), 0);

         // 2. Fetch the actual SOL balance of the Treasury
         const treasuryBal = await connection.getBalance(protocolAccount.treasury);
         const vaultSol = treasuryBal / 1_000_000_000;

         // 3. Update DOM directly for reliability
         document.getElementById('admin-tree-count').textContent = allTreeAccounts.length.toString();
         document.getElementById('admin-authority').textContent = protocolAccount.authority.toBase58().slice(0, 8) + '...';
         document.getElementById('admin-treasury-sol').textContent = `${vaultSol.toFixed(3)} SOL`;
         document.getElementById('admin-total-circulation').textContent = totalSold.toLocaleString();

         const debtEl = document.getElementById('admin-oil-debt');
         if (debtEl) debtEl.textContent = (totalSold * 0.1).toFixed(1) + ' Liters';

         // 4. Fill the "Protocol Config" table
         document.getElementById('admin-share-price').textContent = (protocolAccount.sharePriceLamports.toNumber() / 1e9) + ' SOL';
         document.getElementById('admin-total-trees').textContent = protocolAccount.totalTrees.toString();
         document.getElementById('admin-treasury').textContent = protocolAccount.treasury.toBase58();


         //5.
         console.log("Refreshing Admin Data...");

    // Update the live ledger (from previous step)
    await renderAdminLedger();

    // Update the Supabase ↔ Chain table
    await refreshAdminTreeStatus();

    // Update top-level stats (Program ID, Treasury, etc.)
    await loadAdminProtocolStats();


     } catch (e) {
         console.error("Failed to refresh admin data:", e);
     }
 }
(window as any).refreshAdminSyncTable = async () => {
    const { data: supabaseTrees } = await sb.from("tree_metadata").select("*").order("tree_id");
    const solanaTreesMap = new Map(_cachedTrees.map(t => [t.account.treeId, t.account]));

    const tbody = document.getElementById("admin-sync-body");
    if (!tbody) return;

    tbody.innerHTML = supabaseTrees?.map(sTree => {
        const onChain = solanaTreesMap.get(sTree.tree_id);
        const statusClass = onChain ? "text-green-500" : "text-red-500";

        return `
            <tr class="border-b border-gray-700">
                <td class="p-2">${sTree.tree_id}</td>
                <td class="p-2">${sTree.name}</td>
                <td class="p-2 ${statusClass}">${onChain ? "Live" : "Missing"}</td>
                <td class="p-2">
                    ${!onChain ?
                        `<button onclick="bootstrapTree('${sTree.tree_id}')" class="bg-blue-600 px-2 py-1 rounded text-xs">Bootstrap</button>` :
                        `<span class="text-gray-500 italic">Initialized</span>`
                    }
                </td>
            </tr>
        `;
    }).join("") || "";
};

/**
 * tree-detail-oracle.ts
 *
 * Functions to populate the enhanced tree detail modal with live Oracle data
 * Add this to your test.ts file or import it as a module
 */

// ══════════════════════════════════════════════════════════════════════════════
// TREE DETAIL MODAL WITH ORACLE INTEGRATION
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Opens the tree detail modal and populates it with Oracle data
 */
(window as any).openTreeDetailModal = (treeId: string) => {
  console.log(`[TREE MODAL] Opening detail for tree: ${treeId}`);

  const treeData = Object.values((window as any)._cachedTrees || {}).find(
    (t: any) => t.account.treeId === treeId
  ) as any;

  if (!treeData) {
    console.warn(`[TREE MODAL] Tree ${treeId} not found in cache`);
    return;
  }

  const modal = document.getElementById('tree-detail-modal');
  const acc = treeData.account;

  // ═══════════════════════════════════════════════════════════════════
  // 1. FILL BASIC TREE INFO (Header & Overview Tab)
  // ═══════════════════════════════════════════════════════════════════

  const setEl = (id: string, value: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  // Header
  setEl('tree-detail-name', `Tree #${acc.treeId} — ${acc.variety || 'Frantoio'}`);
  setEl('tree-detail-location', `Grove A • Row ${Math.floor(Math.random() * 10) + 1} • San Vincenzo, Tuscany`);

  // Overview Tab
  setEl('tree-detail-age', `${acc.age || 15} yrs`);
  setEl('tree-detail-height', `${(acc.age || 15) * 0.35}m`); // Rough estimate
  setEl('tree-detail-variety', acc.variety || 'Frantoio');
  setEl('tree-yield', `${(acc.sharesSold / 40).toFixed(1)} L`);
  setEl('tree-carbon', `${(acc.sharesSold * 0.05).toFixed(0)} kg/yr`);

  // Metadata Tab
  setEl('tree-detail-meta-id', acc.treeId);
  setEl('tree-detail-meta-sold', acc.sharesSold.toLocaleString());

  // Get mint address from Supabase if available
  if (treeData.mint_address) {
    setEl('tree-detail-meta-mint', treeData.mint_address);
  }

  // ═══════════════════════════════════════════════════════════════════
  // 2. POPULATE ORACLE DATA
  // ═══════════════════════════════════════════════════════════════════

  populateOracleData();

  // Start real-time updates
  startOracleUpdates();

  // Show modal
  modal?.classList.remove('hidden');

  // Default to overview tab
  switchTreeDetailTab('overview');
};

/**
 * Populates the Environment tab with live Oracle sensor data
 */
function populateOracleData() {
  const oracle = (window as any).Oracle;

  if (!oracle) {
    console.warn('[TREE MODAL] Oracle not available');
    return;
  }

  const env = oracle.getEnvironment();
  const decisions = oracle.getDecisions();

  if (!env) {
    console.warn('[TREE MODAL] No environment data available');
    return;
  }

  console.log('[TREE MODAL] Populating Oracle data:', env);

  // ═══════════════════════════════════════════════════════════════════
  // SENSOR DATA (Environment Tab)
  // ═══════════════════════════════════════════════════════════════════

  const setEl = (id: string, value: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  // Soil Metrics
  setEl('oracle-soil-moisture', `${env.soilMoisture.toFixed(1)}%`);
  setEl('oracle-soil-temp', `${env.soilTemperature.toFixed(1)}°C`);
  setEl('oracle-leaf-wetness', env.leafWetness.toFixed(0));

  // Moisture status
  let moistureStatus = 'Optimal';
  if (env.soilMoisture < 40) moistureStatus = 'Dry';
  else if (env.soilMoisture > 80) moistureStatus = 'Saturated';
  setEl('oracle-moisture-status', moistureStatus);

  // Moisture progress bar
  const moistureBar = document.getElementById('oracle-moisture-bar');
  if (moistureBar) {
    moistureBar.style.width = `${Math.min(env.soilMoisture, 100)}%`;
  }

  // Light & Air Quality
  setEl('oracle-light', env.ambientLight.toLocaleString());
  setEl('oracle-co2', env.co2Ppm.toFixed(0));
  setEl('oracle-wind', env.windLocal.toFixed(1));

  // Rain & Humidity
  setEl('oracle-rain', env.rainGauge.toFixed(1));
  setEl('oracle-humidity', env.humidity.toFixed(0));

  // ═══════════════════════════════════════════════════════════════════
  // WEATHER DATA (Weather Tab)
  // ═══════════════════════════════════════════════════════════════════

  setEl('weather-temp', `${env.temperature.toFixed(1)}°C`);
  setEl('weather-wind', `${env.windSpeed.toFixed(1)} m/s`);
  setEl('weather-humidity', `${env.humidity.toFixed(0)}%`);
  setEl('weather-pressure', `${env.pressure.toFixed(0)} hPa`);
  setEl('weather-rain-prob', `${(env.rainProb * 100).toFixed(0)}%`);
  setEl('weather-uv', env.uvIndex.toFixed(1));
  setEl('weather-solar', `${env.solar.toFixed(0)} W/m²`);

  // ═══════════════════════════════════════════════════════════════════
  // CONFIDENCE & QUALITY
  // ═══════════════════════════════════════════════════════════════════

  const confidencePct = (env.confidence * 100).toFixed(0);
  setEl('oracle-confidence-value', `${confidencePct}%`);
  setEl('oracle-confidence-text', `${confidencePct}%`);

  // Update confidence badge color
  const badge = document.getElementById('oracle-confidence-badge');
  if (badge) {
    if (env.confidence > 0.8) {
      badge.className = 'absolute top-4 right-20 px-3 py-1.5 bg-green-600 rounded-full text-white text-xs font-medium shadow-lg';
    } else if (env.confidence > 0.5) {
      badge.className = 'absolute top-4 right-20 px-3 py-1.5 bg-yellow-600 rounded-full text-white text-xs font-medium shadow-lg';
    } else {
      badge.className = 'absolute top-4 right-20 px-3 py-1.5 bg-red-600 rounded-full text-white text-xs font-medium shadow-lg';
    }
  }

  // Last update time
  const now = new Date();
  setEl('oracle-last-update', now.toLocaleTimeString());

  // ═══════════════════════════════════════════════════════════════════
  // DRIFT FLAGS & ALERTS
  // ═══════════════════════════════════════════════════════════════════

  if (env.driftFlags && env.driftFlags.length > 0) {
    const alertContainer = document.getElementById('oracle-sensor-alerts');
    const flagsContainer = document.getElementById('oracle-drift-flags');

    if (alertContainer && flagsContainer) {
      alertContainer.classList.remove('hidden');
      flagsContainer.innerHTML = env.driftFlags.map((flag: any) => `
        <div class="flex items-start gap-2">
          <span class="text-yellow-600">⚠️</span>
          <span>${flag.message}</span>
        </div>
      `).join('');
    }
  } else {
    document.getElementById('oracle-sensor-alerts')?.classList.add('hidden');
  }

  // ═══════════════════════════════════════════════════════════════════
  // ORACLE DECISIONS (Recommendations)
  // ═══════════════════════════════════════════════════════════════════

  if (decisions && decisions.length > 0) {
    const decisionsContainer = document.getElementById('oracle-decisions-container');
    if (decisionsContainer) {
      decisionsContainer.innerHTML = decisions.map((dec: any) => {
        const severityColors: any = {
          high: 'red',
          medium: 'yellow',
          low: 'blue',
          none: 'gray'
        };
        const color = severityColors[dec.severity] || 'gray';

        return `
          <div class="mt-3 p-4 bg-${color}-50 border border-${color}-200 rounded-xl">
            <div class="flex items-start gap-3">
              <span class="text-2xl">${getDecisionIcon(dec.type)}</span>
              <div class="flex-1">
                <h5 class="font-semibold text-${color}-900 mb-1">${dec.title}</h5>
                <p class="text-sm text-${color}-800">${dec.message}</p>
                ${dec.actions.length > 0 ? `
                  <div class="mt-2 space-y-1">
                    ${dec.actions.map((action: string) => `
                      <p class="text-xs text-${color}-700">• ${action}</p>
                    `).join('')}
                  </div>
                ` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // FORECAST
  // ═══════════════════════════════════════════════════════════════════

  const forecast = oracle.getForecast();
  if (forecast && forecast.length > 0) {
    const forecastContainer = document.getElementById('weather-forecast');
    if (forecastContainer) {
      forecastContainer.innerHTML = forecast.slice(0, 5).map((point: any) => `
        <div class="border border-stone-200 rounded-lg p-3 text-center">
          <p class="text-xs text-stone-400 mb-1">${new Date(point.hour).toLocaleDateString('en-US', { weekday: 'short' })}</p>
          <p class="text-2xl mb-1">${getWeatherIcon(point.tempC)}</p>
          <p class="font-bold text-stone-900">${point.tempC.toFixed(0)}°C</p>
          <p class="text-xs text-stone-500 mt-1">${(point.rainProb * 100).toFixed(0)}% rain</p>
        </div>
      `).join('');
    }
  }
}

/**
 * Starts real-time updates of Oracle data while modal is open
 */
let oracleUpdateInterval: any = null;

function startOracleUpdates() {
  // Clear any existing interval
  if (oracleUpdateInterval) {
    clearInterval(oracleUpdateInterval);
  }

  // Update every 5 seconds while modal is open
  oracleUpdateInterval = setInterval(() => {
    const modal = document.getElementById('tree-detail-modal');
    if (modal?.classList.contains('hidden')) {
      clearInterval(oracleUpdateInterval);
      oracleUpdateInterval = null;
    } else {
      populateOracleData();
    }
  }, 5000);
}

/**
 * Helper: Get icon for decision type
 */
function getDecisionIcon(type: string): string {
  const icons: any = {
    action: '🚨',
    alert: '⚠️',
    watch: '👁️',
    hold: '⏸️',
    nominal: '✅'
  };
  return icons[type] || '📊';
}

/**
 * Helper: Get weather icon based on temperature
 */
function getWeatherIcon(temp: number): string {
  if (temp > 30) return '☀️';
  if (temp > 20) return '⛅';
  if (temp > 10) return '☁️';
  return '🌧️';
}

/**
 * Switch between tabs in the tree detail modal
 */
(window as any).switchTreeDetailTab = (tabName: string) => {
  // Update tab buttons
  const tabs = document.querySelectorAll('.tree-detail-tab');
  tabs.forEach(tab => {
    tab.classList.remove('active', 'border-green-600', 'text-green-600');
    tab.classList.add('border-transparent', 'text-stone-500');
  });

  const activeTab = Array.from(tabs).find(tab =>
    tab.getAttribute('onclick')?.includes(tabName)
  );
  if (activeTab) {
    activeTab.classList.add('active', 'border-green-600', 'text-green-600');
    activeTab.classList.remove('border-transparent', 'text-stone-500');
  }

  // Show/hide content
  const contents = document.querySelectorAll('.tree-detail-tab-content');
  contents.forEach(content => {
    content.classList.add('hidden');
  });

  const activeContent = document.getElementById(`tree-detail-tab-${tabName}`);
  activeContent?.classList.remove('hidden');

  // If switching to environment or weather, refresh Oracle data
  if (tabName === 'environment' || tabName === 'weather') {
    populateOracleData();
  }
};

/**
 * Close the tree detail modal
 */
(window as any).closeTreeDetailModal = () => {
  // Clear update interval
  if (oracleUpdateInterval) {
    clearInterval(oracleUpdateInterval);
    oracleUpdateInterval = null;
  }

  document.getElementById('tree-detail-modal')?.classList.add('hidden');
};

console.log('[TREE MODAL] Oracle integration loaded ✅');
// openAdoptModal
(window as any).openAdoptModal = (idx: string) => {
    console.log("[MODAL] Opening tree index:", idx);

    // 1. Get the data from the cache
    const treeData = (window as any)._cachedTrees[idx];
    if (!treeData) {
        console.error("No tree data found at index", idx);
        return;
    }

    // 2. Identify the Modal
    const modal = document.getElementById('adopt-modal'); // Match your HTML ID
    if (!modal) {
        console.error("Could not find adopt-modal element");
        return;
    }

    // 3. THE FIX: Set the dataset so confirmAdopt can see it
    const account = treeData.account;
    modal.dataset.treeId = account.treeId;       // e.g., "F1-FR-001"
    modal.dataset.treeIndex = idx.toString();    // e.g., "0"

    // 4. Set Global References for the calculation functions
    (window as any)._modalTree = account;
    (window as any)._modalProtocol = (window as any)._protocol;

    // 5. Update UI Text
    const setText = (id: string, val: any) => {
        const el = document.getElementById(id);
        if (el) el.textContent = String(val);
    };

    const available = account.totalShares.toNumber() - account.sharesSold.toNumber();
    setText('modal-tree-name', `Tree ${account.treeId}`); // or account.name
    setText('modal-tree-meta', `Variety: ${account.variety || 'Tuscan'} · Health: ${account.healthStatus === 1 ? 'Excellent' : 'Good'}`);
    setText('modal-shares-left', available.toLocaleString());

    // 6. Reset Slider and Show
    const slider = document.getElementById('modal-slider') as HTMLInputElement;
    if (slider) {
        slider.max = available.toString();
        slider.value = Math.min(100, available).toString();
    }

    modal.classList.remove('hidden');

    if (typeof (window as any).updateModalCalc === 'function') {
        (window as any).updateModalCalc();
    }
};
/**
 * REFACTORED: loadDashboard
 * Includes Heavy Trace Engine & Global State Protection
 */
 async function loadDashboard() {
  const TRACE_ID = `DASH_${Date.now().toString().slice(-4)}`;
  console.group(`[${TRACE_ID}] 🔄 Syncing Grove...`);

  const activeProgram = (window as any)._program || (window as any).program;
  const activeSb = (window as any)._sb || (window as any).sb;

  if (!activeProgram) {
    console.error(`[${TRACE_ID}] ❌ ABORT: No active program found.`);
    console.groupEnd();
    return;
  }

  try {
    const wallet = (window as any).phantom?.solana || (window as any).solana;
    if (!wallet?.publicKey) throw new Error("Wallet not connected");

    const addr = wallet.publicKey.toBase58();
    const adminKeyStr = (window as any).ADMIN_PUBKEY || "8xkNHk2VpWBM6Nk3enitFCs7vwh2inCveTNintcXHc54";
    const isAdmin = addr === adminKeyStr;

    // 1. Corrected UI Setter (Fixed 'v is not defined' risk)
    const setUI = (id: string, value: string) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
      else console.debug(`[${TRACE_ID}] Element #${id} not in current view.`);
    };

    // 2. Protocol Fetch
    const [protocolPDA] = (window as any).findProtocolPDA();
    const accountClient = activeProgram.account.protocolConfig || activeProgram.account.protocol;
    const protocolData = await accountClient.fetchNullable(protocolPDA);
    (window as any)._protocol = protocolData;

    // 3. Data Fetching
    console.log(`[${TRACE_ID}] Fetching Chain Positions for ${addr.slice(0,8)}...`);
    const [onChainPositions, { data: dbTrees }] = await Promise.all([
      activeProgram.account.sharePosition.all([{ memcmp: { offset: 8, bytes: addr } }]),
      activeSb.from('tree_metadata').select('*')
    ]);

    // 4. Position Normalization (Crucial for F1-FR-005 mapping)
    const enrichedPositions = onChainPositions.map(pos => {
      // Anchor returns camelCase (treeId), but we check both just in case
      const tId = pos.account.treeId || pos.account.tree_id;
      const meta = dbTrees?.find(t => String(t.tree_id) === String(tId));
      return {
        ...pos,
        treeId: tId, // Normalize key for the renderer
        metadata: meta || { name: `Tree ${tId}`, variety: 'Unknown', image_url: '' }
      };
    });

    console.log(`[${TRACE_ID}] Normalized ${enrichedPositions.length} user positions.`);

    // 5. Global Stats Logic
    let totalShares = 0;
    enrichedPositions.forEach(p => {
      const s = p.account.sharesOwned || p.account.shares_owned || 0;
      totalShares += (typeof s === 'object' ? s.toNumber() : Number(s));
    });

    // 6. Update Dashboard Stats (Redesigned IDs)
    setUI('grove-tree-count', enrichedPositions.length.toString());
    setUI('grove-share-count', totalShares.toLocaleString());
    setUI('stat-oil', (totalShares * 0.02).toFixed(1) + "L");
    setUI('stat-carbon', (totalShares * 0.08).toFixed(1) + "kg");

    // Legacy IDs (Compatibility)
    setUI('yourTrees', enrichedPositions.length.toString());
    setUI('portfolioShares', totalShares.toLocaleString());

    // 7. Render Dispatch
    if (typeof (window as any).renderTrees === 'function' && protocolData) {
      // Build tree list for the marketplace grid
      const treesForGrid = (dbTrees || []).map(meta => ({
          account: { treeId: meta.tree_id, name: meta.name, variety: meta.variety },
          publicKey: null
      }));
      (window as any).renderTrees(treesForGrid, protocolData, enrichedPositions);
    }

    // Render the specific cards in "Your Grove"
    const positionsContainer = document.getElementById('tree-position-cards');
    if (positionsContainer && typeof (window as any).renderPositions === 'function') {
      (window as any).renderPositions(enrichedPositions);
    }

    // 8. Wallet & Admin Sync
    if (typeof (window as any).refreshWalletBalances === 'function') {
      await (window as any).refreshWalletBalances(wallet.publicKey);
    }

    if (isAdmin && typeof (window as any).fillAdminProtocol === 'function') {
        (window as any).fillAdminProtocol(protocolData);
    }

    console.log(`[${TRACE_ID}] ✅ Sync Complete.`);

  } catch (err: any) {
    console.error(`[${TRACE_ID}] ❌ Fatal Dashboard Error:`, err.message);
  } finally {
    console.groupEnd();
  }
}//------------
// refreshglobalpulse
//-----------------
async function refreshGlobalPulse() {
    const container = document.getElementById('global-activity-feed');
    const countEl = document.getElementById('global-active-count');
    if (!container || !(window as any)._sb) return;

    try {
        // Fetch last 15 global transactions
        const { data: txs, error } = await (window as any)._sb
            .from('transactions')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(15);

        if (error) throw error;

        // Update the "Active" counter for flavor
        if (countEl) countEl.textContent = `${txs.length + 12} GUARDIANS ACTIVE`;

        container.innerHTML = txs.map(tx => {
            const isBuy = tx.tx_type === 'BUY';
            const walletShort = `${tx.wallet_address.slice(0, 4)}...${tx.wallet_address.slice(-4)}`;

            // Randomize message for variety
            const buyMessages = ["just adopted", "is protecting", "became guardian of"];
            const sellMessages = ["released", "transferred"];
            const message = isBuy
                ? buyMessages[Math.floor(Math.random() * buyMessages.length)]
                : sellMessages[Math.floor(Math.random() * sellMessages.length)];

            return `
            <div class="flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-700">
                <div class="w-8 h-8 rounded-lg bg-white border border-stone-100 flex items-center justify-center text-sm shadow-sm">
                    ${isBuy ? '🌿' : '⚖️'}
                </div>
                <div class="flex-1">
                    <p class="text-[11px] leading-tight text-stone-600">
                        <span class="font-bold text-stone-900">${walletShort}</span>
                        ${message}
                        <span class="font-bold ${isBuy ? 'text-emerald-700' : 'text-stone-500'}">${tx.shares} shares</span>
                        of <span class="text-stone-900 font-medium">Tree ${tx.tree_id}</span>
                    </p>
                    <p class="text-[9px] text-stone-400 mt-0.5">${(window as any).formatTimeAgo(new Date(tx.timestamp))}</p>
                </div>
            </div>
            `;
        }).join('');

    } catch (err) {
        console.error("[GLOBAL_PULSE] Error:", err);
    }
}

function updateFarmOwnership(positions: any[], protocol: any) {
    const ownershipEl   = document.getElementById('farm-ownership-percent');
    const totalSharesEl = document.getElementById('total-grove-shares');
console.log("START FARRMM UPDATEs");

  //  if (!ownershipEl) return;

    // 1. User's total shares across all positions
    const userTotal = positions.reduce((sum, p) => {
        const amt = p.shares ?? p.account?.sharesOwned ?? 0;
        return sum + (typeof amt === 'object' ? amt.toNumber() : Number(amt));
    }, 0);
console.log("FOUND USERTOTAL");

    // 2. Grove capacity = sum of totalShares from ALL cached trees (not from protocol)
    //    protocol.totalShares does NOT exist in the IDL — it only has total_trees (u32)
    const cachedTrees: any[] = (window as any)._cachedTrees || [];
    const groveCapacity = cachedTrees.reduce((sum: number, t: any) => {
        const cap = t.account?.totalShares?.toNumber?.() ?? t.account?.totalShares ?? 1000;
        return sum + Number(cap);
    }, 0) || 240_000; // safe fallback: 240 trees × 1 000 shares each

    // 3. Ownership %
    const percentage = groveCapacity > 0 ? (userTotal / groveCapacity) * 100 : 0;

    // 4. Update both canonical IDs used across the HTML
    ownershipEl.textContent = `${percentage.toFixed(4)}%`;
    document.getElementById('farm-ownership-pct')?.textContent !== undefined &&
        (document.getElementById('farm-ownership-pct')!.textContent = `${percentage.toFixed(4)}%`);
    document.getElementById('farmSharePct')?.textContent !== undefined &&
        (document.getElementById('farmSharePct')!.textContent = `${percentage.toFixed(4)}%`);

    if (totalSharesEl) totalSharesEl.textContent = userTotal.toLocaleString();

    console.log(`[OWNERSHIP] ✅ User: ${userTotal} / Grove capacity: ${groveCapacity} = ${percentage.toFixed(4)}%`);
}

function renderTrees(trees: any[], protocol: any, positions: any[]) {
  const TRACE_ID = `RENDER_${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  console.group(`[${TRACE_ID}] 🎨 Rendering Grove Grid`);

  // CRITICAL: Cache the data so openAdoptModal(idx) can find it
  (window as any)._cachedTrees = trees;
  const treesContainer = document.getElementById("trees-grid");

  if (!treesContainer) {
    console.error(`[${TRACE_ID}] ❌ Trees container #trees-grid not found`);
    console.groupEnd();
    return;
  }

  treesContainer.innerHTML = "";

  if (trees.length === 0) {
    treesContainer.innerHTML = `<div class="col-span-full py-20 text-center text-stone-400">No trees found in the grove.</div>`;
    console.groupEnd();
    return;
  }

  const myTreeIds = new Set(
    positions.map((p: any) => String(p.treeId ?? p.tree_id ?? p.account?.treeId ?? p.account?.tree_id))
  );

  trees.forEach(({ account, publicKey }, idx) => {
    try {
      // 1. Defensive Property Access (Camel vs Snake)
      const currentTreeId = String(account.treeId ?? account.tree_id);
      const totalShares = Number(account.totalShares ?? account.total_shares ?? 0);
      const sharesSold = Number(account.sharesSold ?? account.shares_sold ?? 0);
      const healthStatus = Number(account.healthStatus ?? account.health_status ?? 0);
      const name = account.name || `Tree ${currentTreeId}`;
      const variety = account.variety || "Standard Tuscan";
      const age = account.age || "??";

      const pct = totalShares > 0 ? (sharesSold / totalShares) * 100 : 0;
      const isFull = sharesSold >= totalShares;
      const isMine = myTreeIds.has(currentTreeId);

      // 2. Price resolution
      const priceLamports = protocol?.sharePriceLamports ?? protocol?.share_price_lamports ?? 0;
      const price = (Number(priceLamports) / 1e9) || 0.5;

      const healthCls = healthStatus >= 80 ? "bg-emerald-500" : healthStatus >= 50 ? "bg-amber-500" : "bg-red-500";

      // 3. Ownership & Tier Logic
      const myPos = positions.find((p: any) =>
        String(p.treeId ?? p.tree_id ?? p.account?.treeId ?? p.account?.tree_id) === currentTreeId
      );
      const owned = Number(myPos?.sharesOwned ?? myPos?.shares_owned ?? myPos?.account?.sharesOwned ?? myPos?.account?.shares_owned ?? 0);

      const [tierLabel, tierCls] =
          owned >= 1000 ? ["👑 Guardian", "bg-amber-100 text-amber-700"]
        : owned >= 500  ? ["🌿 Eco Guardian", "bg-emerald-100 text-emerald-700"]
        : owned >= 1    ? ["🫒 Olive Lover", "bg-green-100 text-green-700"]
        : isFull        ? ["Adopted", "bg-stone-100 text-stone-500"]
        : ["Available", "bg-stone-50 text-stone-400"];

      // 4. Create UI Element
      const wrap = document.createElement("div");
      wrap.className = "tree-card-wrap";
      // IMPORTANT: Passing 'idx' to the modal function to match your modal logic
      wrap.innerHTML = `
        <div class="tree-card bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer"
             onclick="window.openAdoptModal('${idx}')">
          <div class="relative h-32 flex items-center justify-center text-5xl"
               style="background:linear-gradient(135deg,#e8f0d5,#c8dca0)">
            🫒
            ${isMine ? `<div class="absolute top-2 left-2 px-2 py-0.5 bg-white/90 rounded-full text-xs font-bold shadow-sm" style="color:var(--olive)">✓ Mine</div>` : ""}
          </div>
          <div class="p-4">
            <div class="flex items-start justify-between gap-2 mb-1">
              <h3 class="font-bold text-stone-900 text-sm leading-tight">${name}</h3>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase shrink-0 ${tierCls}">${tierLabel}</span>
            </div>
            <p class="text-xs text-stone-400 mb-3">${variety} · ${currentTreeId}</p>
            <div class="grid grid-cols-2 gap-2 mb-3">
              <div class="flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full ${healthCls}"></span>
                <span class="text-xs text-stone-600">${healthStatus}/100</span>
              </div>
              <div class="text-right text-xs text-stone-500">🌾 Age: ${age}</div>
            </div>
            <div class="mb-3">
              <div class="flex justify-between text-xs text-stone-500 mb-1">
                <span>Adoption</span>
                <span>${pct.toFixed(1)}%</span>
              </div>
              <div class="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                <div class="h-full" style="width:${pct}%; background:var(--olive)"></div>
              </div>
            </div>
            <div class="flex items-center justify-between pt-3 border-t border-stone-100">
              <div>
                <p class="text-xs text-stone-400">Price</p>
                <p class="font-bold text-stone-900">${price.toFixed(3)} SOL</p>
              </div>
              <button class="px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition-opacity ${isFull ? 'opacity-50' : 'hover:opacity-90'}"
                      style="background:var(--olive)" ${isFull ? 'disabled' : ''}>
                ${isFull ? 'Full' : 'Adopt'}
              </button>
            </div>
          </div>
        </div>`;
      treesContainer.appendChild(wrap);
    } catch (err) {
      console.error(`[${TRACE_ID}] Error rendering tree index ${idx}:`, err);
    }
  });

  console.groupEnd();
}
function renderPositions(positions: any[]) {
    const container  = document.getElementById('tree-position-cards');
    const emptyState = document.getElementById('tree-positions-empty');
    if (!container) return;

    if (positions.length === 0) {
        container.innerHTML = "";
        emptyState?.classList.remove('hidden');
        return;
    }

    emptyState?.classList.add('hidden');

    // Build a quick treeId → account lookup from the cache
    const cachedTrees: any[] = (window as any)._cachedTrees || [];
    const treeMap = new Map<string, any>();
    cachedTrees.forEach((t: any) => treeMap.set(String(t.account.tree_id), t.account));

    const protocol    = (window as any)._protocol;
    const sharePriceSol = (protocol?.sharePriceLamports?.toNumber?.() ?? 0) / 1e9 || 0.01;
    const SOL_PRICE   = priceCache.solPrice || 140;

    container.innerHTML = positions.map(pos => {
        const treeId  = pos.account.tree_id.toString();
        const shares  = pos.account.sharesOwned.toNumber();
        const isGuard = pos.account.isGuardian || shares >= 1000;

        // ✅ FIX: use actual totalShares from tree, not hardcoded 1000
        const treeAcc   = treeMap.get(treeId);
        const totalShrs = treeAcc?.totalShares?.toNumber?.() ?? treeAcc?.totalShares ?? 1000;
        const pctOwned  = totalShrs > 0 ? (shares / totalShrs) * 100 : 0;

        const oilL      = (shares * 0.020).toFixed(2);
        const carbonKg  = (shares * 0.25).toFixed(1);
        const valueSol  = (shares * sharePriceSol).toFixed(3);
        const valueUsd  = (shares * sharePriceSol * SOL_PRICE).toFixed(2);
        const epochRew  = (shares * 0.0008).toFixed(4); // SOL per epoch

        return `
        <div class="bg-white border border-stone-200 rounded-2xl p-5 hover:shadow-md transition">
            <div class="flex justify-between items-start mb-3">
                <div class="flex items-center gap-3">
                    <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-green-100 to-emerald-100 flex items-center justify-center text-2xl">
                        🫒
                    </div>
                    <div>
                        <h3 class="font-bold text-lg text-stone-900">
                            Tree ${treeId}
                            ${isGuard ? '<span class="ml-1 text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-bold">🛡️ Guardian</span>' : ''}
                        </h3>
                        <p class="text-xs text-stone-500">San Vincenzo · Tuscany</p>
                    </div>
                </div>
                <button onclick="openTreeDetailModal('${treeId}')"
                        class="w-8 h-8 flex items-center justify-center rounded-full bg-stone-50 text-stone-400 hover:text-green-700 hover:bg-green-50 transition">
                    <span class="text-xl">ⓘ</span>
                </button>
            </div>

            <!-- Farm ownership progress bar -->
            <div class="flex justify-between text-xs text-stone-400 mb-1">
                <span>Farm ownership</span>
                <span class="font-bold text-emerald-600">${pctOwned.toFixed(2)}%</span>
            </div>
            <div class="w-full bg-stone-100 h-2 rounded-full mb-4">
                <div class="bg-gradient-to-r from-emerald-500 to-emerald-600 h-2 rounded-full transition-all"
                     style="width:${Math.min(pctOwned, 100)}%"></div>
            </div>

            <!-- Stats grid -->
            <div class="grid grid-cols-2 gap-2 mb-4">
                <div class="bg-stone-50 rounded-xl p-3 text-center">
                    <p class="font-bold text-lg" style="color:var(--olive)">${oilL}L</p>
                    <p class="text-xs text-stone-400">oil/year</p>
                </div>
                <div class="bg-stone-50 rounded-xl p-3 text-center">
                    <p class="font-bold text-lg text-emerald-600">${carbonKg}kg</p>
                    <p class="text-xs text-stone-400">CO₂/year</p>
                </div>
                <div class="bg-amber-50 rounded-xl p-3 text-center">
                    <p class="font-bold text-base text-amber-700">${valueSol} SOL</p>
                    <p class="text-xs text-stone-400">≈ $${valueUsd}</p>
                </div>
                <div class="bg-emerald-50 rounded-xl p-3 text-center">
                    <p class="font-bold text-base text-emerald-700">${epochRew}</p>
                    <p class="text-xs text-stone-400">SOL/epoch</p>
                </div>
            </div>

            <button onclick="openSellModal('${treeId}', ${shares})"
                    class="w-full py-2.5 bg-stone-100 hover:bg-red-50 hover:text-red-600 text-stone-600 text-sm font-bold rounded-xl transition-colors">
                Sell Shares
            </button>
        </div>`;
    }).join('');
}

/**
 * Records the blockchain transaction into Supabase for the Activity Feed
 * and off-chain caching.
 */
 async function syncTransactionToSupabase(
   wallet: string,
   treeId: string,
   amount: number,
   type: 'BUY' | 'SELL',
   signature: string,
   newTotal: number,
   isGuardian: boolean
 ) {
   console.log(`[SUPABASE] Syncing ${type} for tree ${treeId}...`);

   if (!(window as any)._sb) return;
   const sb = (window as any)._sb;

   try {
     // 1. Update 'transactions' table (uses 'shares' and 'tx_type')
     const { error: txError } = await sb
       .from('transactions')
       .insert([{
         wallet_address: wallet,
         tree_id: treeId,
         shares: Number(amount),
         tx_type: type,
         signature: signature,
         new_total_shares: Number(newTotal),
         is_guardian: isGuardian,
         timestamp: new Date().toISOString()
       }]);

     if (txError) throw txError;

     // 2. Update 'transaction_log' table (uses 'amount' and 'action')
     const { error: logError } = await sb
       .from('transaction_log')
       .insert([{
         wallet: wallet,
         tree_id: treeId,
         amount: Number(amount),
         action: type,
         signature: signature,
         created_at: new Date().toISOString()
       }]);

     if (logError) console.warn("[SUPABASE] transaction_log sync failed:", logError.message);
     else console.log("[SUPABASE] ✅ Both tables synced successfully.");

   } catch (err: any) {
     console.error("[SUPABASE] ❌ Sync failed:", err.message);
     if (err.code === 'PGRST204') {
         console.error("FIX: Run the SQL ALTER TABLE commands provided to add missing columns.");
     }
   }
 }

 // Inside your loadDashboard function or where you process positions
async function updateFarmStats(positions: any[]) {
    // 1. Calculate totals from chain data
    const totalTreesOwned = positions.length;
    let totalSharesOwned = 0;
    positions.forEach(pos => {
        totalSharesOwned += pos.account.sharesOwned.toNumber();
    });

    // 2. Define the total Grove capacity (240 trees * 1000 shares each)
    const TOTAL_GROVE_TREES = 240;
    const TOTAL_GROVE_SHARES = TOTAL_GROVE_TREES * 1000;
    const ownershipPercentage = (totalSharesOwned / TOTAL_GROVE_SHARES) * 100;
    console.log("OWNERSNIP_CALC  ",ownershipPercentage);

    console.log("From  ",totalSharesOwned);

    // 3. Update the UI Elements (Handling both sets of IDs found in your HTML)
    const updateEl = (id: string, val: string) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    // Update the Dark Gradient Card (FARM OWNERSHIP)
    updateEl('farm-ownership-pct', ownershipPercentage.toFixed(2) + '%');
    updateEl('farm-trees-stat', totalTreesOwned.toString());
    updateEl('farm-shares-stat', totalSharesOwned.toLocaleString());

    // Update the Hero Row Card (Your Farm Ownership)
    updateEl('farmSharePct', ownershipPercentage.toFixed(2) + '%');
    updateEl('dash-trees', totalTreesOwned.toString());
    updateEl('dash-shares', totalSharesOwned.toLocaleString());

    // Update the Summary Text ("You own X trees · Y shares")
    const summaryHeader = document.querySelector('.dash-summary-header'); // Adjust selector if needed
    if (summaryHeader) {
        summaryHeader.textContent = `You own ${totalTreesOwned} trees · ${totalSharesOwned.toLocaleString()} shares`;
    }
}
// Make it globally available just in case
(window as any).syncTransactionToSupabase = syncTransactionToSupabase;
(window as any).switchTreeDetailTab = (tabName: string) => {
  // Hide all contents
  document.querySelectorAll('.tree-detail-tab-content').forEach(el => el.classList.add('hidden'));
  // Remove active styling from all buttons
  document.querySelectorAll('.tree-detail-tab').forEach(el => {
    el.classList.remove('active', 'border-green-600', 'text-green-600');
    el.classList.add('border-transparent', 'text-stone-500');
  });

  // Show selected content
  document.getElementById(`tree-detail-tab-${tabName}`)?.classList.remove('hidden');

  // Highlight clicked button (need to find the button that was clicked)
  const activeBtn = Array.from(document.querySelectorAll('.tree-detail-tab')).find(btn =>
    btn.textContent?.toLowerCase().includes(tabName)
  );
  if (activeBtn) {
    activeBtn.classList.add('active', 'border-green-600', 'text-green-600');
    activeBtn.classList.remove('border-transparent', 'text-stone-500');
  }
};


// ---------------------------
//refresh Activity
// -------------------
async function refreshActivityFeed(walletAddress: string) {
    const container = document.getElementById('activity-feed');
    const emptyState = document.getElementById('activity-empty');
    if (!container || !(window as any)._sb) return;

    try {
        // Fetch the last 5 transactions for this user
        const { data: txs, error } = await (window as any)._sb
            .from('transactions')
            .select('*')
            .eq('wallet_address', walletAddress)
            .order('timestamp', { ascending: false })
            .limit(5);

        if (error) throw error;

        if (!txs || txs.length === 0) {
            emptyState?.classList.remove('hidden');
            return;
        }

        emptyState?.classList.add('hidden');

        container.innerHTML = txs.map(tx => {
            const isBuy = tx.tx_type === 'BUY';
            const icon = isBuy ? '🌿' : '💰';
            const actionText = isBuy ? 'Adopted' : 'Sold';
            const colorClass = isBuy ? 'text-emerald-600' : 'text-amber-600';

            // Format date (e.g., "2 hours ago")
            const date = new Date(tx.timestamp);
            const timeAgo = (window as any).formatTimeAgo ? (window as any).formatTimeAgo(date) : date.toLocaleDateString();

            return `
            <div class="flex items-center justify-between p-3 bg-stone-50 rounded-xl border border-stone-100 hover:border-olive/20 transition-all group">
                <div class="flex items-start gap-3">
                    <div class="w-10 h-10 rounded-full bg-white border border-stone-100 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                        <span class="text-lg">${icon}</span>
                    </div>
                    <div>
                        <p class="text-sm font-bold text-stone-800">
                            ${actionText} <span class="${colorClass}">${tx.shares} shares</span>
                        </p>
                        <p class="text-[10px] text-stone-400 font-medium uppercase tracking-wider">
                            Tree ${tx.tree_id} • ${timeAgo}
                        </p>
                    </div>
                </div>
                <a href="https://explorer.solana.com/tx/${tx.signature}?cluster=devnet"
                   target="_blank"
                   class="opacity-0 group-hover:opacity-100 transition-opacity text-stone-300 hover:text-olive">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </a>
            </div>
            `;
        }).join('');

    } catch (err) {
        console.error("[FEED] Error loading activity:", err);
    }
}


(window as any).formatTimeAgo = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
};


// ══════════════════════════════════════════════════════════════
// BUY SHARES - With full Supabase sync
// ══════════════════════════════════════════════════════════════
async function buyShares(treeId: string | number, amount: number) {
  const treeIdStr = String(treeId);
  console.log(`\n[BUY] Starting purchase: Tree ${treeIdStr}, ${amount} shares`);

  try {
    const wallet = getWallet();
    const [treePDA] = findTreePDA(treeIdStr);
    const [protocolPDA] = findProtocolPDA();
    const [treasuryPda] = findTreasuryPDA(activeProgram);
    const [positionPDA] = findPositionPDA(wallet, treeIdStr);

    // Fetch current position to calculate new total
    let currentShares = 0;
    try {
      const currentPosition = await program.account.sharePosition.fetch(positionPDA);
      currentShares = Number(currentPosition.sharesOwned);
    } catch {
      console.log("[BUY] No existing position, starting from 0");
    }

    const newTotal = currentShares + amount;
    const isGuardian = newTotal >= 1000;

    // Execute on-chain transaction
    console.log("[BUY] Sending transaction...");
    const tx = await program.methods
      .purchaseShares(treeIdStr, new anchor.BN(amount))
      .accounts({
        tree: treePDA,
        position: positionPDA,
        protocol: protocolPDA,
        treasury: treasuryPDA,
        buyer: wallet,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log(`[BUY] ✅ On-chain success: ${tx}`);
    showToast(`Bought ${amount} shares!`);

    // Comprehensive Supabase sync
    await syncTransactionToSupabase(
      wallet,
      treeIdStr,
      amount,
      'BUY',
      tx,
      newTotal,
      isGuardian
    );
console.log("syncing----BUY--");

    // Reload dashboard to show updated data
//    await loadDashboard();

  } catch (err: any) {
    console.error(`[BUY] ❌ Purchase failed:`, err);
    showToast("Buy failed: " + err.message, true);
  }
}


// ══════════════════════════════════════════════════════════════
// SELL SHARES - With full Supabase sync
// ══════════════════════════════════════════════════════════════
async function sellShares(treeId: string | number, amount: number) {
  const treeIdStr = String(treeId);
  console.log(`\n[SELL] Starting sale: Tree ${treeIdStr}, ${amount} shares`);

  try {
    const wallet = getWallet();
    const [treePDA] = findTreePDA(treeIdStr);
    const [positionPDA] = findPositionPDA(wallet, treeIdStr);
    const [protocolPDA] = findProtocolPDA();
    const [treasuryPda] = findTreasuryPDA(activeProgram);

    // Fetch current position to calculate new total
    const currentPosition = await program.account.sharePosition.fetch(positionPDA);
    const currentShares = Number(currentPosition.sharesOwned);
    const newTotal = currentShares - amount;

    if (newTotal < 0) {
      throw new Error("Cannot sell more shares than you own");
    }

    const isGuardian = newTotal >= 1000;

    // Execute on-chain transaction
    console.log("[SELL] Sending transaction...");
    const tx = await program.methods
      .sellShares(treeIdStr, new anchor.BN(amount))
      .accounts({
        tree: treePDA,
        position: positionPDA,
        protocol: protocolPDA,
        treasury: treasuryPDA,
        seller: wallet,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log(`[SELL] ✅ On-chain success: ${tx}`);
    showToast(`Sold ${amount} shares!`);

    // Comprehensive Supabase sync
    await syncTransactionToSupabase(
      wallet,
      treeIdStr,
      amount,
      'SELL',
      tx,
      newTotal,
      isGuardian
    );

    // Reload dashboard to show updated data
    await loadDashboard();

  } catch (err: any) {
    console.error(`[SELL] ❌ Sale failed:`, err);
    showToast("Sell failed: " + err.message, true);
  }
}

// Update the window exports
(window as any).buyShares = buyShares;
(window as any).sellShares = sellShares;

/**
 * Fetches the global ledger with optional tree filtering
 */
async function fetchAdminLedger(treeIdFilter: string | null = null) {
    let query = supabase
        .from('admin_transaction_ledger')
        .select('*');

    // Apply the tree-specific filter if provided
    if (treeIdFilter) {
        query = query.eq('tree_id', treeIdFilter);
    }

    const { data, error } = await query.limit(100); // Pagination recommended for Admin UIs

    if (error) {
        console.error("Failed to fetch admin ledger:", error);
        return [];
    }

    return data;
}

async function logTransaction(walletAddr, treeId, type, amount, signature) {
    await sb
        .from('transaction_log')
        .insert({
            wallet_address: walletAddr,
            tree_id: treeId,
            type: type,
            amount: amount,
            signature: signature
        });
}

//===============================
//Perks
//====================
function updateActivePerks(totalShares: number) {
  const container = document.getElementById('active-perks-list');
  if (!container) return;

  // 1. Find the current tier based on share count
  const currentTier = REWARD_TIERS.reduce((prev, curr) =>
    (totalShares >= curr.min) ? curr : prev, REWARD_TIERS[0]
  );

  // 2. Find the next tier for the progress bar
  const nextTier = REWARD_TIERS.find(t => t.min > totalShares);

  // 3. Update the Badge UI
  document.getElementById('tier-icon')!.innerText = currentTier.icon;
  document.getElementById('tier-name')!.innerText = currentTier.name;
  document.getElementById('tier-desc')!.innerText = currentTier.desc;

  if (nextTier) {
    // Progress bar math
    const range = nextTier.min - currentTier.min;
    const progressWithinTier = totalShares - currentTier.min;
    const percent = Math.min(Math.round((progressWithinTier / range) * 100), 100);

    document.getElementById('tier-progress-bar')!.style.width = `${percent}%`;
    document.getElementById('tier-progress-text')!.innerText =
      `${nextTier.min - totalShares} more shares to unlock ${nextTier.name}`;
  }

  // 4. FIX: Filter only perks that match or are BELOW your current tier ID
  // Your current code was likely missing the '<=' or using the wrong ID comparison
  const unlockedPerks = PERKS_DATABASE.filter(p => p.tier <= currentTier.id);

  container.innerHTML = unlockedPerks.map(perk => `
    <div class="flex items-center gap-3 p-3 bg-white rounded-xl border border-stone-100 shadow-sm">
      <span class="text-2xl">${perk.icon}</span>
      <div>
        <p class="font-bold text-stone-800 text-sm leading-tight">${perk.title}</p>
        <p class="text-xs text-stone-500">${perk.desc}</p>
      </div>
    </div>
  `).join('');
}
(window as any).runAudit = async () => {
  console.log("🔍 [AUDIT] STARTING DATA INTEGRITY CHECK...");

  try {
    const activeProgram = (window as any)._program || (window as any).program;
    const activeSb = (window as any)._sb || (window as any).sb;

    // 1. Fetch Fresh Data
    const [treesOnChain, positionsOnChain] = await Promise.all([
      activeProgram.account.tree.all(),
      activeProgram.account.sharePosition.all()
    ]);

    const { data: dbTrees } = await activeSb.from("tree_metadata").select("*");
    const { data: dbPositions } = await activeSb.from("positions").select("*");

    console.log(`[AUDIT] Found ${treesOnChain.length} trees on-chain and ${dbTrees?.length || 0} in DB.`);

    // 2. 🌳 TREES AUDIT: Use string mapping
    const solanaTreesMap = new Map(
      treesOnChain.map(t => [String(t.account.treeId || t.account.tree_id), t.account])
    );

    const treeAuditRows = dbTrees.map(sTree => {
      const stringId = String(sTree.tree_id || sTree.id);
      const onChain = solanaTreesMap.get(stringId);

      return {
        "Tree ID": stringId,
        "SB Name": sTree.common_name || sTree.name,
        "On Solana?": onChain ? "✅ YES" : "❌ NO",
        "On-Chain Sold": onChain ? onChain.sharesSold.toString() : "0"
      };
    });

    console.log("\n--- 🌳 TREE SYNC STATUS ---");
    console.table(treeAuditRows);

    // 3. 💳 POSITIONS AUDIT
    console.log("\n--- 💳 POSITIONS SYNC STATUS ---");
    const positionAuditRows = positionsOnChain.map(p => {
      const acc = p.account;
      const owner = acc.owner.toBase58();
      const tid = String(acc.treeId || acc.tree_id);

      const dbMatch = dbPositions?.find(dbP =>
        dbP.wallet === owner && String(dbP.tree_id) === tid
      );

      return {
        "Owner": `${owner.slice(0, 4)}...${owner.slice(-4)}`,
        "Tree ID": tid,
        "Shares (Chain)": acc.sharesOwned.toString(),
        "Shares (SB)": dbMatch ? dbMatch.shares_owned : "❌ MISSING",
        "In Sync?": dbMatch && String(dbMatch.shares_owned) === acc.sharesOwned.toString() ? "✅" : "⚠️ MISMATCH"
      };
    });

    console.table(positionAuditRows);

  } catch (err) {
    console.error("❌ Audit failed:", err);
  }
};

async function upsertPositionInSupabase(wallet: string, treeId: number, delta: number, action: "buy" | "sell") {

  try {
    const { data: existing, error: fetchErr } = await sb
      .from("positions")
      .select("*")
      .eq("wallet", wallet)
      .eq("tree_id", treeId)
      .single();

    if (fetchErr && fetchErr.code !== "PGRST116") {
      // PGRST116 = row not found, which is fine for first buy
      console.warn("[SUPABASE] Position fetch warning:", fetchErr.message);
      return;
    }

    const currentShares = existing?.shares_owned ?? 0;
    const newShares = Math.max(0, currentShares + delta);

    const isGuardian = newShares >= 1000;

    const { error: upsertErr } = await sb
      .from("positions")
      .upsert({
        wallet:       wallet,
        tree_id:      treeId,
        shares_owned: newShares,
        is_guardian:  isGuardian,
      }, { onConflict: 'wallet,tree_id' });

    if (upsertErr) {
      console.warn("[SUPABASE] Position upsert warning:", upsertErr.message);
    } else {
      console.log(`[SUPABASE] ✅ Position updated: wallet ${wallet.slice(0,8)}, tree #${treeId}, shares → ${newShares}`);
    }
  } catch (e: any) {
    console.warn("[SUPABASE] upsertPositionInSupabase failed (non-fatal):", e.message);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN: GENESIS SYNC
// FIX #2: Supabase 'tree_meta' table not found → added descriptive error +
//         instructions for creating the table. The table name is correct in
//         code — the table just needs to exist in Supabase with these columns:
//           tree_id (int4, primary key), name (text), variety (text),
//           age_years (int2), field_id (text), on_chain (bool default false)
// ══════════════════════════════════════════════════════════════════════════════
async function initializeFromSupabase() {
  console.log(`\n╔════════════════════════════════════════════════════════╗`);
  console.log(`║           GENESIS SYNC — BOOTSTRAP FROM SUPABASE       ║`);
  console.log(`╚════════════════════════════════════════════════════════╝\n`);

  const log = document.getElementById("admin-log");
  function adminLog(msg: string) {
    console.log(msg);
    if (log) {
      log.innerHTML += msg + "\n";
      log.scrollTop = log.scrollHeight;
    }
  }

  try {
    adminLog("🔍 Starting Genesis Sync…");

    // 1. GET TOOLS & AUTH
    // FIX: Get the actual PublicKey object and program tools from your helpers
    const walletPubKey = getPublicKey();
    const { program } = getWallet();
    const addr = walletPubKey.toBase58();

    adminLog(`    Admin wallet: ${addr}`);

    // 2. VERIFY PROTOCOL
    const [configPda] = findProtocolPDA();
    adminLog(`\n🔗 Protocol PDA: ${configPda.toBase58()}`);

    try {
      await (program.account as any).protocolConfig.fetch(configPda);
      adminLog(`✅ Protocol config confirmed on-chain`);
    } catch {
      adminLog(`❌ Protocol not initialized. Run setupProtocol() first.`);
      throw new Error("Protocol not initialized. Call setupProtocol() first.");
    }

    // 3. FETCH TREES FROM SUPABASE
    adminLog("\n📊 Querying Supabase trees table...");

    // Uses the global 'sb' client from your connection.ts
    const activeSb = (window as any)._sb || sb;
    const { data: trees, error } = await activeSb
      .from("tree_metadata")
      .select("*")
      .order("tree_id", { ascending: true })
      .limit(6);

    if (error) {
      adminLog(`❌ Supabase error: ${error.message}`);
      throw new Error("Supabase: " + error.message);
    }

    if (!trees || trees.length === 0) {
      adminLog("ℹ️ No trees found in Supabase tree_metadata table.");
      return;
    }

    adminLog(`✅ ${trees.length} trees fetched from Supabase`);

    // 4. REGISTER EACH TREE ON-CHAIN
    adminLog(`\n🌱 Registering trees on-chain...\n`);

    let registered = 0;
    let skipped = 0;

    for (const tree of trees) {
      const treeIdStr = String(tree.tree_id);
      const [treePda] = findTreePDA(treeIdStr);

      // Check if already on-chain
      const onChain = await connection.getAccountInfo(treePda);
      if (onChain) {
        adminLog(`✅ Tree ${treeIdStr} (${tree.name ?? treeIdStr}) already on-chain, skipping`);
        skipped++;
        continue;
      }

      adminLog(`⚙️ Registering Tree ${treeIdStr}...`);

      const name = String(tree.name ?? treeIdStr).slice(0, 32);
      const variety = String(tree.variety ?? "Unknown").slice(0, 32);
      const age = Number(tree.age_years ?? 0);
      const location = String(tree.field_id ?? "Unknown").slice(0, 64);
      const last_inspection_url = "https://olivium.io/verify/" + treeIdStr;
      const carbon_credit_id = " ";
      const total_shares = new anchor.BN(1000);

      try {
        const tx = await program.methods
          .registerTree(
            treeIdStr,
            name,
            variety,
            age,
            location,
            total_shares,
            carbon_credit_id,
            last_inspection_url
          )
          .accounts({
            tree: treePda,
            protocol: configPda,
            authority: walletPubKey, // Use the PublicKey object directly
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();

        adminLog(`   ✅ TX: ${tx.slice(0, 16)}...`);
        registered++;

        // Update Supabase to mark as on-chain
        await activeSb
          .from("tree_metadata")
          .update({
            on_chain: true,
            on_chain_address: treePda.toBase58()
          })
          .eq("tree_id", treeIdStr);

      } catch (err: any) {
        adminLog(`   ❌ Failed to register ${treeIdStr}: ${err.message}`);
      }
    }

    // 5. SUMMARY
    adminLog(`\n╔════════════════════════════════════════════════════════╗`);
    adminLog(`║                  SYNC COMPLETE                         ║`);
    adminLog(`╚════════════════════════════════════════════════════════╝`);
    adminLog(`   🌱 Registered: ${registered}`);
    adminLog(`   ✅ Skipped: ${skipped}`);
    adminLog(`   📊 Total: ${trees.length}\n`);

    // UI Updates
    const badge = document.getElementById("sync-status-badge");
    if (badge) badge.classList.remove("hidden");

    adminLog("🔄 Refreshing dashboard...");
    await loadDashboard();

    if ((window as any).refreshAdminStatus) {
      await (window as any).refreshAdminStatus();
    }

    if (typeof (window as any).showToast === 'function') {
      (window as any).showToast("Genesis Sync complete!");
    }

  } catch (err: any) {
    console.error("[GENESIS] ❌ CRITICAL ERROR:", err);
    adminLog(`\n❌ SYNC FAILED: ${err.message}`);
    if (typeof (window as any).showToast === 'function') {
      (window as any).showToast("Sync failed: " + err.message, true);
    }
  }
}

// Attach to window
(window as any).initializeFromSupabase = initializeFromSupabase;

// ══════════════════════════════════════════════════════════════════════════════
// RECOMMENDATION #4 — EXECUTE GOVERNANCE PROPOSAL
// Wire to an "Execute" button on passed proposals once executeProposal is deployed
// ══════════════════════════════════════════════════════════════════════════════

export async function executeProposal(proposalId: number) {
  console.log(`\n[EXECUTE_PROPOSAL] Executing proposal #${proposalId}...`);
  try {
    const wallet = getWallet();

    // TODO: uncomment once executeProposal is in lib.rs
    // const [proposalPDA] = PublicKey.findProgramAddressSync(
    //   [Buffer.from("proposal"), Buffer.from(proposalId.toString())],
    //   program.programId
    // );
    // const [configPDA] = findProtocolPDA();
    //
    // const tx = await program.methods
    //   .executeProposal(proposalId)
    //   .accounts({ proposal: proposalPDA, globalConfig: configPDA, executor: wallet })
    //   .rpc();
    // console.log("[EXECUTE_PROPOSAL] ✅ Executed:", tx);
    // showToast(`Proposal #${proposalId} executed!`);
    // await loadDashboard();

    console.warn("[EXECUTE_PROPOSAL] ⚠️  executeProposal not yet in lib.rs — see audit doc for implementation.");
    showToast("Proposal execution coming soon.", true);
  } catch (err: any) {
    console.error("[EXECUTE_PROPOSAL] ❌", err);
    showToast("Execute failed: " + err.message, true);
  }
}
(window as any).executeProposal = executeProposal;

// ══════════════════════════════════════════════════════════════════════════════
// ANALYTICS ENGINE
// ══════════════════════════════════════════════════════════════════════════════

function pricePerShare(protocol: any, tree: any): number {
  const base = protocol.sharePriceLamports.toNumber();
  const util = tree.totalShares > 0 ? tree.sharesSold / tree.totalShares : 0;
  return base * (1 + util * 0.5);
}

function previewTrade(protocol: any, tree: any, amount: number) {
  const price = pricePerShare(protocol, tree);
  return {
    buySOL:        (price * amount) / 1e9,
    sellSOL:       (price * amount * 0.95) / 1e9,
    pricePerShare: price / 1e9,
  };
}


/**
 * Updates the price and fee calculations in the adoption modal
 * based on the slider input.
 */
 /**
  * Updates the price and fee calculations in the adoption modal
  */
 (window as any).updateModalCalc = function() {
     const slider = document.getElementById('modal-slider') as HTMLInputElement;
     const amountDisplay = document.getElementById('modal-amount-display');
     const costDisplay = document.getElementById('modal-cost-sol');
     const feeDisplay = document.getElementById('modal-fee-sol');

     if (!slider || !(window as any)._modalTree) return;

     const shares = parseInt(slider.value);
     // Retrieve protocol config stored during modal opening
     const protocol = (window as any)._protocol || (window as any)._modalProtocol;

     const pricePerShare = protocol.sharePriceLamports.toNumber() / 1_000_000_000;
     const feeBps = protocol.buyFeeBps || 0;

     const subtotal = shares * pricePerShare;
     const fee = (subtotal * feeBps) / 10000;

     if (amountDisplay) amountDisplay.textContent = shares.toString();
     if (costDisplay) costDisplay.textContent = subtotal.toFixed(4);
     if (feeDisplay) feeDisplay.textContent = fee.toFixed(4);
 };
/**
 * Closes the adoption modal.
 */
(window as any).closeAdoptModal = function() {
    const modal = document.getElementById('adopt-modal');
    if (modal) modal.classList.add('hidden');
};

(window as any).confirmAdopt = async () => {
  const modal = document.getElementById('adopt-modal');
    // Check if modal and the dataset exist before trying to read them
    if (!modal || !modal.dataset || !modal.dataset.treeIndex) {
      console.error("[MODAL] Could not find tree data in modal dataset");
      return;
    }
    const treeIndex = parseInt(modal.dataset.treeIndex);
    const treeId = modal.dataset.treeId; // This will now be "F1-FR-001"
    const tree = (window as any)._modalTree;
    const amount = parseInt((document.getElementById('modal-slider') as HTMLInputElement).value);

    if (!tree || !amount) return;

    try {
        // Pass the treeId from the on-chain account
        await (window as any).buyShares(treeId, amount);
        // Close modal and refresh
        document.getElementById('adopt-modal')?.classList.add('hidden');
        await (window as any).loadDashboard();
    } catch (e) {
        console.error("Purchase failed", e);
    }
};

function treeOilYield(tree: any): number {
  return 20 * Math.min(tree.age / 10, 1);
}

function treeCarbon(tree: any): number {
  return 8.5 * Math.min(tree.age / 10, 1);
}

function computeAnalytics(positions: any[], trees: any[], protocol: any) {
  console.log(`[ANALYTICS] Computing for ${positions.length} positions, ${trees.length} trees`);

  let totalShares = 0;
  let totalOil    = 0;
  let totalBottles = 0;
  let lamports    = 0;
  let carbonKg    = 0;

  for (const pos of positions) {
    const treeId = pos.tree_id != null ? Number(pos.tree_id)
      : pos.account?.tree_id != null
        ? (typeof pos.account.tree_id === 'object' ? pos.account.tree_id.toNumber() : Number(pos.account.tree_id))
        : undefined;
    const owned  = pos.shares_owned != null ? Number(pos.shares_owned)
      : pos.account?.sharesOwned != null
        ? (typeof pos.account.sharesOwned === 'object' ? pos.account.sharesOwned.toNumber() : Number(pos.account.sharesOwned))
        : 0;

    const entry = trees.find((t: any) => {
      const tid = typeof t.account.tree_id === 'object' ? t.account.treeId.toNumber() : Number(t.account.treeId);
      return tid === treeId;
    });
    if (!entry) { console.warn(`[ANALYTICS] ⚠️  Tree #${treeId} not found`); continue; }

    const tree  = entry.account;
    const ratio = owned / tree.totalShares;

    totalShares  += owned;
    lamports     += protocol ? pricePerShare(protocol, tree) * owned : 0;
    totalOil     += ratio * treeOilYield(tree);
    totalBottles += Math.floor(ratio * treeOilYield(tree) / 0.75);
    carbonKg     += ratio * treeCarbon(tree);
  }

  const result = { totalShares, totalOil, totalBottles, carbonKg, portfolioValue: lamports / 1e9 };
  console.log(`[ANALYTICS] Result:`, result);
  return result;
}

// ══════════════════════════════════════════════════════════════════════════════
// CACHE PROTOCOL (for modal use)
// ══════════════════════════════════════════════════════════════════════════════
async function cacheProtocol() {
    try {
        if (!program) return; // Silent exit if program isn't ready
        const [protocolPda] = PublicKey.findProgramAddressSync([Buffer.from("protocol")], program.programId);
        const config = await program.account.protocolConfig.fetch(protocolPda);
        (window as any)._protocol = config;
    } catch (e) {
        console.log("[CACHE_PROTOCOL] Protocol not initialized on-chain yet.");
    }
}
// ══════════════════════════════════════════════════════════════════════════════
// UI UTILITIES
// ══════════════════════════════════════════════════════════════════════════════

function setText(id: string, value: string) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = value;
  } else {
    console.warn(`[setText] Element #${id} not found`);
  }
}

function showToast(msg: string, isError = false) {
  if ((window as any).showGlobalToast) {
    (window as any).showGlobalToast(msg, isError);
  } else {
    console.log(`[TOAST] ${msg}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// DOM WIRING
// ══════════════════════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {
  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log("║              OLIVIUM DAO — DOM READY                   ║");
  console.log("╚════════════════════════════════════════════════════════╝\n");

  const btnConnect = document.getElementById("btn-connect");
  if (btnConnect) {
    btnConnect.addEventListener("click", () => {
      console.log("[DOM] Connect button clicked");
      (window as any).connect();
    });
    console.log("[DOM] ✅ Connect button wired");
  } else {
    console.warn("[DOM] ⚠️  Connect button (#btn-connect) not found");
  }

  const btnBootstrap = document.getElementById("btn-bootstrap");
  const btn = document.getElementById("btn-setupProtocol");

  document.getElementById("btn-audit")?.addEventListener("click", () => {
    (window as any).runAudit();
  });

  if (btn) {
    btn.addEventListener("click", async () => {
      console.log("[DOM] Setup button clicked");
      const log = document.getElementById("admin-log");
      if (log) { log.classList.remove("hidden"); log.innerHTML = ""; }
      try {
        await (window as any).setupProtocol(100);
      } catch (e: any) {
        console.error("[DOM] buttonerror error:", e);
        if (log) log.innerHTML += "❌ " + e.message + "\n";
      }
    });
    console.log("[DOM] ✅ setupProtocol button wired");
  } else {
    console.log("[DOM] ℹ️  Bootstrap button (#btn-bootstrap) not found (normal for non-admin)");
  }


  if (btnBootstrap) {
    btnBootstrap.addEventListener("click", async () => {
      console.log("[DOM] Bootstrap button clicked");
      const log = document.getElementById("admin-log");
      if (log) { log.classList.remove("hidden"); log.innerHTML = ""; }
      try {
        await initializeFromSupabase();
      } catch (e: any) {
        console.error("[DOM] Bootstrap error:", e);
        if (log) log.innerHTML += "❌ " + e.message + "\n";
      }
    });
    console.log("[DOM] ✅ Bootstrap button wired");
  } else {
    console.log("[DOM] ℹ️  Bootstrap button (#btn-setupProtocol) not found (normal for non-admin)");
  }

  console.log("[DOM] Attempting to cache protocol config...");
  cacheProtocol().catch(() => {
    console.log("[DOM] Protocol not yet initialized (normal for fresh deployment)");
  });

  console.log("\n[DOM] ✅ All event listeners wired. Ready for user interaction.\n");
  // Inside your DOMContentLoaded or Init logic
setInterval(() => {
    refreshGlobalPulse();
}, 30000); // 30 seconds

// Call it immediately on load
refreshGlobalPulse();
});

window.refreshAdminStatus = async function() {
  console.log('[ADMIN] 🔄 Starting Deep Sync: Supabase ↔ Solana');
const tableBody = document.getElementById('admin-tree-table');
const program = (window as any)._program;
    const sb = window._sb;

    if (!sb || !program) {
        console.log("[refreshAdminStatus] Connection not ready, skipping update...");
        return;
    }
      // Fetch Protocol Config to see Treasury SOL
        try {
        const [protocolPda] = PublicKey.findProgramAddressSync([Buffer.from("protocol")], program.programId);
        const protocol = await program.account.protocolConfig.fetch(protocolPda);

        // FETCH ACTUAL SOL FROM THE ADDRESS
        const balance = await connection.getBalance(protocol.treasury);
        const vaultSol = balance / 1_000_000_000;

        // SUM SHARES FROM ALL TREES (since it's not in ProtocolConfig)
        const allTrees = await program.account.tree.all();
        const totalSold = allTrees.reduce((sum, t) => sum + t.account.sharesSold.toNumber(), 0);

        // Create a lookup map for chain data
            const chainMap = new Map();
            allTrees.forEach((t: any) => {
              // Map by the string ID (e.g., "F1-FR-001")
              chainMap.set(t.account.treeIdString || t.account.treeId.toString(), t);
            });


            let mintedCount = 0;
                let tableHtml = '';
                let sbTrees =[];

        // Update UI
        if (typeof (window as any).fillAdminProtocol === 'function') {
            (window as any).fillAdminProtocol(protocol, vaultSol, totalSold);
        }
        document.getElementById('admin-total-circulation').textContent = totalSold.toLocaleString();
        const ledger = document.getElementById('admin-ledger');
        if (ledger) {
            ledger.innerHTML = `<div class="text-stone-500">[${new Date().toLocaleTimeString()}] Vault Sync: ${vaultSol.toFixed(3)} SOL</div>` + ledger.innerHTML;
        }

        // 3. Compare and Build Table
    sbTrees.forEach((tree: any) => {
      const onChain = chainMap.get(tree.tree_id);
      const isMinted = !!onChain;
      if (isMinted) mintedCount++;

      tableHtml += `
        <tr class="hover:bg-stone-50">
          <td class="px-4 py-3 font-mono text-stone-900">${tree.tree_id}</td>
          <td class="px-4 py-3">${tree.name || 'Unnamed Tree'}</td>
          <td class="px-4 py-3 text-stone-500">${tree.variety || 'Leccino'}</td>
          <td class="px-4 py-3 font-mono text-[10px]">
            ${onChain ? onChain.account.mint.toBase58().slice(0, 8) + '...' : '<span class="text-amber-500">Not Minted</span>'}
          </td>
          <td class="px-4 py-3">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${isMinted ? 'bg-green-100 text-green-700' : 'bg-stone-100 text-stone-400'}">
              ${isMinted ? 'On-Chain' : 'Pending'}
            </span>
          </td>
        </tr>
      `;
    });

    // 4. Update UI
    if (tableBody) tableBody.innerHTML = tableHtml;

    const stats = {
      'admin-sb-total': sbTrees.length.toString(),
      'admin-sb-minted': mintedCount.toString(),
      'admin-sb-pending': (sbTrees.length - mintedCount).toString(),
      'admin-total-trees': mintedCount.toString() // Syncs with the header
    };

    Object.entries(stats).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.innerText = val;
    });

    console.log(`[ADMIN] Sync Complete. Found ${mintedCount} on-chain matches.`);
    } catch (e) {
        console.error("Admin refresh failed:", e);
    }
};
async function watchTreasury() {
    const protocol = window._protocol;
    if (!protocol) return;

    // Listen for balance changes on the treasury
    window._connection.onAccountChange(protocol.treasury, (accountInfo) => {
        const newBal = accountInfo.lamports / 1e9;
        document.getElementById('admin-treasury-sol').textContent = `${newBal.toFixed(2)} SOL`;
        console.log("Treasury update detected!");
    });
}
// In test.ts — Add this helper function
//function findTreasuryPDA(program: Program) {
//  return PublicKey.findProgramAddressSync(
//    [Buffer.from("treasury")],
//    program.programId
///  );
//}
async function resetGroveDatabase() {
    console.log("[ADMIN] 🚨 Starting Hard Reset...");
    try {
        // 1. Reset Metadata: Mark every single tree as NOT on-chain.
        // We use .gt('tree_id', 0) or .neq('tree_id', '_none_')
        // to ensure we target all rows.
        await sb.from('tree_metadata')
            .update({
                on_chain: false,
                on_chain_address: null
            })
            .not('tree_id', 'is', null); // This targets every row with an ID

        // 2. Clear tree_ownership: This removes the adoption records
        await sb.from('tree_ownership')
            .delete()
            .not('tree_id', 'is', null);

        // 3. NEW: Clear positions: This removes the fractional share data
        // If this isn't cleared, the UI will still think people own parts of trees
        const { error: posError } =await sb.from('positions')
            .delete()
            .not('tree_id', 'is', null);

        if (posError) throw posError;


        await sb.from('transactions')
            .delete()
            .not('tree_id', 'is', null);

        console.log("✅ Database reset complete (Metadata, Ownership, and Positions).");

        // Give Supabase a moment to process before reloading
        setTimeout(() => {
            location.reload();
        }, 500);

    } catch (err: any) {
        console.error("❌ Reset Error:", err.message);
        alert("Reset failed: " + err.message);
    }
}
/**
 * Updates the Rewards & Perks tab based on positions and cached tree data.
 * ✅ FIXED: proper reward SOL math, farm ownership %, oil/carbon/value stats,
 *           and a single consolidated perks render (no duplicate functions).
 */
 /**
  * REFACTORED: updateRewardsUI
  * Includes heavy debugging trace steps for production auditing.
  */
 function updateRewardsUI(positions: any[]) {
     const TRACE_ID = `REWARDS_${Date.now().toString().slice(-4)}`;
     console.group(`[${TRACE_ID}] Rewards UI Refresh`);

     try {
         // ─── 1. DATA VALIDATION & AGGREGATION ────────────────────────────────
         if (!Array.isArray(positions)) {
             console.error(`[${TRACE_ID}] Error: Positions is not an array`, positions);
             return;
         }

         const totalShares = positions.reduce((sum, p, idx) => {
             const rawAmt = p.shares_owned ?? p.account?.sharesOwned ?? 0;
             const numericAmt = (typeof rawAmt === 'object' && rawAmt !== null && 'toNumber' in rawAmt)
                 ? rawAmt.toNumber()
                 : Number(rawAmt);

             console.debug(`[${TRACE_ID}] Position[${idx}] -> Raw:`, rawAmt, "Parsed:", numericAmt);
             return sum + numericAmt;
         }, 0);

         console.log(`[${TRACE_ID}] Aggregated Total Shares: ${totalShares}`);

         // ─── 2. CONFIGURATION & CONSTANTS ────────────────────────────────────
         const REWARDS_RATE_SOL  = 0.0008;
         const EPOCHS_ELAPSED    = 3;
         const CLAIMED_FRACTION  = 0.60;
         const OIL_PER_SHARE_L   = 0.020;
         const CO2_PER_SHARE_KG  = 0.25;
         const BOTTLES_PER_LITRE = 2;
         const SOL_PRICE         = (window as any).priceCache?.solPrice || 140;

         console.debug(`[${TRACE_ID}] Math Inputs: Rate=${REWARDS_RATE_SOL}, Epochs=${EPOCHS_ELAPSED}, SOL=$${SOL_PRICE}`);

         // ─── 3. CORE MATH ───────────────────────────────────────────────────
         const totalRewardsSol   = totalShares * REWARDS_RATE_SOL * EPOCHS_ELAPSED;
         const claimedRewardsSol = totalRewardsSol * CLAIMED_FRACTION;
         const pendingRewardsSol = totalRewardsSol - claimedRewardsSol;
         const totalRewardsUsd   = totalRewardsSol * SOL_PRICE;

         const annualLitres      = totalShares * OIL_PER_SHARE_L;
         const annualBottles     = Math.floor(annualLitres * BOTTLES_PER_LITRE);
         const carbonKg          = totalShares * CO2_PER_SHARE_KG;

         console.log(`[${TRACE_ID}] Rewards Calculated: Total=${totalRewardsSol.toFixed(4)} SOL ($${totalRewardsUsd.toFixed(2)})`);

         // ─── 4. CAPACITY & OWNERSHIP ─────────────────────────────────────────
         const cachedTrees = (window as any)._cachedTrees || [];
         const groveCapacity = cachedTrees.reduce((sum: number, t: any) => {
             const cap = t.account?.totalShares?.toNumber?.() ?? t.account?.totalShares ?? 1000;
             return sum + Number(cap);
         }, 0) || 240000;

         const ownershipPct = groveCapacity > 0 ? (totalShares / groveCapacity) * 100 : 0;
         console.log(`[${TRACE_ID}] Ownership: ${ownershipPct.toFixed(6)}% of ${groveCapacity.toLocaleString()} total capacity`);

         // ─── 5. PORTFOLIO VALUE ─────────────────────────────────────────────
         const protocol = (window as any)._protocol;
         const sharePriceSol = protocol?.sharePriceLamports
             ? (Number(protocol.sharePriceLamports.toString()) / 1e9)
             : 0.01;

         const portfolioValueSol = totalShares * sharePriceSol;
         const portfolioValueUsd = portfolioValueSol * SOL_PRICE;

         // ─── 6. UI UPDATE ENGINE (WITH SELECTOR LOGGING) ──────────────────────
         const set = (id: string, val: string) => {
             const el = document.getElementById(id);
             if (el) {
                 el.textContent = val;
             } else {
                 console.warn(`[${TRACE_ID}] DOM Target Missing: #${id}`);
             }
         };

         console.groupCollapsed(`[${TRACE_ID}] DOM Injection Trace`);
         set('rewards-total-sol',      totalRewardsSol.toFixed(4) + ' SOL');
         set('rewards-total-usd',      '≈ $' + totalRewardsUsd.toFixed(2));
         set('rewards-pending-sol',    pendingRewardsSol.toFixed(4) + ' SOL');
         set('rewards-claimed-sol',    claimedRewardsSol.toFixed(4) + ' SOL');
         set('rewards-rate',           (totalShares * REWARDS_RATE_SOL).toFixed(4) + ' SOL / epoch');
         set('farm-ownership-percent', ownershipPct.toFixed(4) + '%');
         set('farm-ownership-pct',     ownershipPct.toFixed(4) + '%');
         set('farmSharePct',           ownershipPct.toFixed(4) + '%');
         set('total-grove-shares',     totalShares.toLocaleString());
         set('farm-shares-stat',       totalShares.toLocaleString());
         set('dash-shares',            totalShares.toLocaleString());
         set('benefit-oil',            annualLitres.toFixed(1) + ' L');
         set('dash-oil',               annualLitres.toFixed(1) + 'L');
         set('stat-oil',               annualLitres.toFixed(1) + 'L');
         set('benefit-carbon',         carbonKg.toFixed(1) + ' kg/yr');
         set('stat-carbon',            carbonKg.toFixed(1) + 'kg');
         set('bottles',                annualBottles.toString());
         set('oilLiters',              annualLitres.toFixed(1) + 'L');
         set('carbonEst',              carbonKg.toFixed(1) + ' kg/yr');
         set('portfolioValue',         '$' + portfolioValueUsd.toLocaleString(undefined, { maximumFractionDigits: 0 }));
         set('stat-value-sol',         portfolioValueSol.toFixed(3) + ' SOL');

         // Tree ID Uniqueness Trace
         const uniqueTreeCount = new Set(positions.map((p: any) => p.account?.treeId ?? p.tree_id)).size;
         set('farm-trees-stat', uniqueTreeCount.toString());
         console.groupEnd();

         // ─── 7. PROGRESS BARS ────────────────────────────────────────────────
         const claimFill = document.getElementById('rewards-claim-progress-fill');
         if (claimFill) claimFill.style.width = `${(CLAIMED_FRACTION * 100).toFixed(0)}%`;

         // ─── 8. TIERS & PERKS LOGIC ──────────────────────────────────────────
         const tiers = [
             { min: 0,    name: "Olive Enthusiast", icon: "🫒" },
             { min: 100,  name: "Olive Lover",       icon: "🫒" },
             { min: 500,  name: "Eco Guardian",      icon: "🌿" },
             { min: 1000, name: "Grove Patron",       icon: "👑" },
             { min: 5000, name: "Legacy Holder",      icon: "🏛️" }
         ];

         let currentTier = tiers[0];
         for (const t of tiers) { if (totalShares >= t.min) currentTier = t; }
         const nextTier = tiers.find(t => t.min > totalShares);

         console.log(`[${TRACE_ID}] Tier Evaluated: ${currentTier.name}`);

         set('tier-icon', currentTier.icon);
         set('tier-name', currentTier.name);

         const progressBarEl  = document.getElementById('tier-progress-bar');
         const progressTextEl = document.getElementById('tier-progress-text');

         if (nextTier && progressBarEl) {
             const range = nextTier.min - currentTier.min;
             const within = totalShares - currentTier.min;
             const pct = Math.min(100, (within / range) * 100);
             progressBarEl.style.width = `${pct}%`;
             if (progressTextEl) progressTextEl.textContent = `${totalShares.toLocaleString()} / ${nextTier.min.toLocaleString()} to ${nextTier.name}`;
         }

         // ─── 9. PERKS GRID RENDERER ─────────────────────────────────────────
         const perksGrid = document.getElementById('active-perks-grid');
         if (perksGrid) {
             const allPerks = [
                 { threshold: 100,  icon: "📦", title: "Quarterly Oil",       desc: "250ml Premium EVOO ready to ship." },
                 { threshold: 100,  icon: "📜", title: "Member Certificate",  desc: "Digital Proof of Membership." },
                 { threshold: 500,  icon: "🌱", title: "Carbon Credits",      desc: "Verified sequestration data available." },
                 { threshold: 500,  icon: "🌙", title: "1 Night Eco-Stay",    desc: "Complimentary villa night unlocked." },
                 { threshold: 1000, icon: "🍾", title: "24 Bottles/Year",     desc: "Full tree harvest share active." },
                 { threshold: 1000, icon: "🏷️", title: "Custom Plaque",       desc: "Physical nameplate on your tree." },
                 { threshold: 5000, icon: "🗳️", title: "Governance Rights",   desc: "Vote on farm decisions." }
             ];

             perksGrid.innerHTML = allPerks.map(p => {
                 const active = totalShares >= p.threshold;
                 return `
                     <div class="flex items-center gap-4 p-4 rounded-2xl border-2 transition-all
                                 ${active ? 'border-amber-200 bg-amber-50' : 'border-stone-100 opacity-50'}">
                         <div class="w-12 h-12 rounded-xl bg-white flex items-center justify-center text-xl shadow-sm">
                             ${active ? p.icon : '🔒'}
                         </div>
                         <div>
                             <h5 class="font-bold text-sm ${active ? 'text-amber-900' : 'text-stone-400'}">${p.title}</h5>
                             <p class="text-xs ${active ? 'text-amber-700' : 'text-stone-400'}">
                                 ${active ? p.desc : 'Unlock at ' + p.threshold.toLocaleString() + ' shares'}
                             </p>
                         </div>
                     </div>`;
             }).join('');
             console.log(`[${TRACE_ID}] Perks Grid Rendered.`);
         }

         console.log(`[${TRACE_ID}] ✅ UI Refresh Complete.`);
     } catch (fatal) {
         console.error(`[${TRACE_ID}] ❌ CRITICAL UI FAILURE:`, fatal);
     } finally {
         console.groupEnd();
     }
 }

 function createPerkHTML(emoji: string, title: string, desc: string) {
     return `
         <div class="flex items-center gap-4 p-4 bg-stone-50 rounded-2xl border border-stone-100">
             <div class="w-12 h-12 rounded-xl bg-white flex items-center justify-center text-xl shadow-sm">${emoji}</div>
             <div>
                 <h5 class="font-bold text-stone-900 text-sm">${title}</h5>
                 <p class="text-xs text-stone-500">${desc}</p>
             </div>
         </div>
     `;
 }
 (window as any).refreshAdminTreeStatus = async () => {
     const tbody = document.getElementById('admin-tree-table');
     const activeProgram = (window as any)._program || (window as any).program;

     try {
         console.log("[ADMIN] 🔄 Syncing UI with On-Chain Truth...");

         // 1. Fetch ALL on-chain tree accounts
         const onChainAccounts = await activeProgram.account.tree.all();

         // 2. Create Map using the EXACT string from the account
         // Anchor decodes tree_id as treeId. We ensure it's a string.
         const onChainMap = new Map(onChainAccounts.map(t => {
             const idOnChain = String(t.account.treeId || t.account.tree_id).trim();
             return [idOnChain, t.account];
         }));

         console.log("[ADMIN] On-Chain IDs Found:", Array.from(onChainMap.keys()));

         // 3. Get Supabase Metadata
         const { data: sbTrees, error: sbError } = await sb
             .from('tree_metadata')
             .select('*')
             .order('tree_id');

         if (sbError) throw sbError;

         let mintedCount = 0;

         // 4. Build Table Rows
         const rows = sbTrees.map(tree => {
             // FIX: Match by the full ID string (e.g., "F1-FR-001")
             const fullId = String(tree.tree_id).trim();
             const onChainData = onChainMap.get(fullId);

             const isLive = !!onChainData;
             if (isLive) mintedCount++;

             const statusClass = isLive ? 'text-emerald-500' : 'text-red-500 font-bold animate-pulse';
             const statusText = isLive ? '🟢 Active' : '🔴 Missing';
             const shortMint = tree.mint ? `${tree.mint.slice(0, 4)}...${tree.mint.slice(-4)}` : '—';

             return `
                 <tr class="hover:bg-stone-50 border-b border-stone-100 transition-colors">
                     <td class="px-4 py-3 font-mono font-bold text-stone-900">${fullId}</td>
                     <td class="px-4 py-3 text-stone-700">${tree.common_name || tree.name || 'Unnamed'}</td>
                     <td class="px-4 py-3 text-stone-400 font-medium">${tree.variety || 'Ogliarola'}</td>
                     <td class="px-4 py-3 font-mono text-[10px] text-stone-400">${shortMint}</td>
                     <td class="px-4 py-3 ${statusClass}">${statusText}</td>
                     <td class="px-4 py-3 text-right">
                         ${!isLive ?
                             `<button onclick="window.bootstrapTree('${fullId}')"
                                 class="bg-stone-900 hover:bg-black text-white px-3 py-1 rounded-lg text-[10px] font-bold shadow-sm transition-transform active:scale-95">
                                 BOOTSTRAP
                             </button>` :
                             `<span class="text-stone-300 italic text-[10px]">On-Chain</span>`
                         }
                     </td>
                 </tr>
             `;
         });

         // 5. Update UI
         if (tbody) tbody.innerHTML = rows.join('') || '<tr><td colspan="6" class="p-4 text-center">No trees in database.</td></tr>';

         // Update Stats
         const setStat = (id: string, val: number) => {
             const el = document.getElementById(id);
             if (el) el.innerText = val.toString();
         };

         setStat('admin-sb-minted', mintedCount);
         setStat('admin-sb-pending', sbTrees.length - mintedCount);
         setStat('admin-sb-total', sbTrees.length);

     } catch (e: any) {
         console.error("[ADMIN] Sync Table Error:", e);
         if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-red-500">Sync Failed: ${e.message}</td></tr>`;
     }
 };
async function renderAdminLedger() {
    const container = document.getElementById('admin-ledger');
    if (!container) return;

    // 1. Fetch from the View we just created

    const { data: logs, error } = await sb
        .from('admin_transaction_ledger')
        .select('*')
        .limit(50);

    if (error) {
        container.innerHTML = `<div class="text-red-500 p-2">Error loading ledger: ${error.message}</div>`;
        return;
    }

    if (!logs || logs.length === 0) {
        container.innerHTML = `<div class="text-stone-600 p-2 italic">No transactions recorded yet.</div>`;
        return;
    }

    // 2. Map logs to HTML rows
    container.innerHTML = logs.map(log => {
        const date = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const isBuy = log.type.toUpperCase() === 'BUY';
        const typeColor = isBuy ? 'text-emerald-400' : 'text-amber-400';
        const shortWallet = `${log.wallet_address.slice(0, 4)}...${log.wallet_address.slice(-4)}`;
        const shortSig = `${log.signature.slice(0, 8)}`;

        return `
            <div class="flex items-center justify-between py-1 border-b border-stone-800 hover:bg-stone-800/50 transition-colors px-2 group">
                <div class="flex items-center gap-3">
                    <span class="text-stone-600 w-12">${date}</span>
                    <span class="font-bold ${typeColor} w-10">${log.type.toUpperCase()}</span>
                    <span class="text-stone-300 w-12 text-right">${log.amount}</span>
                    <span class="text-stone-500">shares of</span>
                    <span class="text-white font-bold">${log.tree_display_name}</span>
                </div>
                <div class="flex items-center gap-4">
                    <span class="text-stone-600 uppercase">By: ${shortWallet}</span>
                    <a href="https://solscan.io/tx/${log.signature}" target="_blank"
                       class="text-blue-400 hover:text-blue-300 underline decoration-blue-900 underline-offset-2">
                       TX: ${shortSig} ↗
                    </a>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Renders the active perks based on the total shares across all positions
 */
 function renderActivePerks(totalShares) {
    const grid = document.getElementById('active-perks-grid');
    const tierNameEl = document.getElementById('tier-name');
    const tierIconEl = document.getElementById('tier-icon');
    if (!grid) return;

    // 1. Determine Tier Details
    let currentTier = "Olive Enthusiast";
    let icon = "🫒";
    let tierColor = "#78716c"; // Stone

    if (totalShares >= 5000) { currentTier = "Legacy Holder"; icon = "🏛️"; tierColor = "#d97706"; }
    else if (totalShares >= 1000) { currentTier = "Grove Patron"; icon = "👑"; tierColor = "#f59e0b"; }
    else if (totalShares >= 500) { currentTier = "Eco Guardian"; icon = "🌿"; tierColor = "#10b981"; }
    else if (totalShares >= 100) { currentTier = "Olive Lover"; icon = "🫒"; tierColor = "#84cc16"; }

    // 2. Update the Top UX Badge
    if (tierNameEl) tierNameEl.innerText = currentTier;
    if (tierIconEl) tierIconEl.innerText = icon;

    // 3. Clear and Render Perks with "Active" Styling
    grid.innerHTML = '';
    const perks = [
        { threshold: 100, icon: '🫒', title: 'Quarterly Shipments', desc: '250ml premium EVOO' },
        { threshold: 100, icon: '📄', title: 'Member Certificate', desc: 'Digital proof' },
        { threshold: 500, icon: '🌿', title: 'Carbon Credits', desc: 'Verified data' },
        { threshold: 500, icon: '🌙', title: 'Complimentary Night', desc: 'Toscagialla Stay' },
        { threshold: 1000, icon: '🍾', title: 'Annual Harvest', desc: '24 bottles per year' },
        { threshold: 1000, icon: '🏷️', title: 'Custom Plaque', desc: 'Physical nameplate' }
    ];

    grid.innerHTML = perks.map(p => {
        const isActive = totalShares >= p.threshold;
        return `
            <div class="flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${isActive ? 'border-amber-200 bg-amber-50 shadow-sm' : 'border-stone-100 bg-stone-50 opacity-50'}">
                <div class="w-12 h-12 rounded-lg bg-white flex items-center justify-center text-xl shadow-sm">
                    ${isActive ? p.icon : '🔒'}
                </div>
                <div>
                    <h4 class="font-bold ${isActive ? 'text-amber-900' : 'text-stone-400'} text-sm">${p.title}</h4>
                    <p class="text-xs ${isActive ? 'text-amber-700' : 'text-stone-400'}">${isActive ? p.desc : 'Unlock at ' + p.threshold + ' shares'}</p>
                </div>
            </div>
        `;
    }).join('');

    // Update Progress Bar
    updateTierBadge(totalShares);
}

function updateTierBadge(totalShares) {
    const bar = document.getElementById('tier-progress-bar');
    const text = document.getElementById('tier-progress-text');

    let nextThreshold = 100;
    let nextTierName = "Olive Lover";

    if (totalShares >= 5000) { nextThreshold = 10000; nextTierName = "Max Level"; }
    else if (totalShares >= 1000) { nextThreshold = 5000; nextTierName = "Legacy Holder"; }
    else if (totalShares >= 500) { nextThreshold = 1000; nextTierName = "Grove Patron"; }
    else if (totalShares >= 100) { nextThreshold = 500; nextTierName = "Eco Guardian"; }

    const percent = Math.min(100, (totalShares / nextThreshold) * 100);

    if (bar) bar.style.width = `${percent}%`;
    if (text) {
        text.innerHTML = `<strong>${totalShares}</strong> / ${nextThreshold} shares to reach <strong>${nextTierName}</strong>`;
    }
}

async function syncSupabaseToChain() {
    console.log("[ADMIN] 🔄 Starting Blockchain -> Database Sync...");

    try {
        // 1. Fetch all tree accounts directly from Solana
        const onChainTrees = await program.account.tree.all();

        if (onChainTrees.length === 0) {
            console.log("ℹ️ No trees found on-chain. Nothing to sync.");
            return;
        }

        console.log(`📡 Found ${onChainTrees.length} trees on-chain. Updating Supabase...`);

        for (const tree of onChainTrees) {
            const treeId = tree.account.treeId; // The String ID (e.g., "F1-FR-001")
            const pdaAddress = tree.publicKey.toBase58();

            // 2. Update Supabase record for this specific tree
            const { error } = await sb
                .from('tree_metadata')
                .update({
                    on_chain: true,
                    on_chain_address: pdaAddress
                })
                .eq('tree_id', treeId);

            if (error) {
                console.error(`❌ Failed to sync Tree ${treeId}:`, error.message);
            } else {
                console.log(`✅ Synced Tree ${treeId} -> ${pdaAddress}`);
            }
        }

        alert(`Successfully synced ${onChainTrees.length} trees to the database.`);
        location.reload(); // Refresh UI to show the trees in the Grove

    } catch (err: any) {
        console.error("❌ Sync Error:", err.message);
        alert("Sync failed. See console for details.");
    }
}

async function loadPositions() {
  console.log("🌿 [LOAD_POS] Starting loadPositions...");

  if (!window.activeProgram || !window.walletPubKey) {
    console.warn("❌ [LOAD_POS] Missing program or wallet");
    return;
  }

  try {
    // 🔎 Fetch ALL user positions
    const positions = await window.activeProgram.account.sharePosition.all([
      {
        memcmp: {
          offset: 8,
          bytes: window.walletPubKey.toBase58(),
        },
      },
    ]);

    console.log(`📦 [LOAD_POS] Found ${positions.length} positions on-chain`, positions);

    // 🔎 Fetch ALL trees (needed for mapping)
    const trees = await window.activeProgram.account.tree.all();
    console.log(`🌳 [LOAD_POS] Found ${trees.length} trees on-chain`, trees);

    // 🔎 Fetch protocol (pricing)
    let protocol = null;
    try {
      protocol = await window.getProtocolAccount?.();
      console.log("💰 [LOAD_POS] Protocol loaded", protocol);
    } catch (e) {
      console.warn("⚠️ [LOAD_POS] Protocol not available");
    }

    // 🚀 Render
    renderPositions(positions, trees, protocol);

    // 📊 Debug summary
    debugOnchainSummary(positions, trees);

  } catch (err) {
    console.error("💥 [LOAD_POS] Failed:", err);
  }
}
function subscribeToProgram() {
  if (!window.connection || !window.activeProgram) return;

  console.log("🔄 Subscribing to on-chain changes...");

  window.connection.onProgramAccountChange(
    window.activeProgram.programId,
    (info) => {
      console.log("⚡ On-chain update detected", info);

      scheduleRefresh();
    }
  );
}

let refreshTimeout;

function scheduleRefresh() {
  clearTimeout(refreshTimeout);

  refreshTimeout = setTimeout(() => {
    console.log("🔁 Refreshing UI after chain update...");
    loadPositions();
  }, 500);
}


function debugOnchainSummary(positions, trees) {
  console.group("🧠 ON-CHAIN DEBUG SUMMARY");

  const ownedTreeIds = positions.map(p => {
    const raw = p.account.treeId;
    return typeof raw === "object" ? raw.toNumber() : Number(raw);
  });

  console.log("👤 User owns tree IDs:", ownedTreeIds);

  console.log("🌳 All tree IDs:", trees.map(t => {
    const raw = t.account.treeId;
    return typeof raw === "object" ? raw.toNumber() : Number(raw);
  }));

  console.log("📊 Expected SB table updates:");
  console.table([
    { table: "positions", action: "UPDATE (user shares)" },
    { table: "tree_ownership", action: "UPDATE (ownership %)" },
    { table: "transactions", action: "INSERT (buy/sell)" },
    { table: "transaction_logs", action: "INSERT (events)" },
    { table: "tree_metadata", action: "READ (name, yield, etc)" },
  ]);

  console.groupEnd();
}

// Inside test.ts or weatherEngine.ts
function updateWeatherUI(data: any) {
    const mapping: Record<string, string> = {
        'weather-temp': `${data.temp.toFixed(1)}°C`,
        'weather-wind': `${data.wind.toFixed(1)} m/s`,
        'weather-humidity': `${data.humidity.toFixed(0)}%`,
        'weather-pressure': `${data.pressure} hPa`,
        'weather-rain': `${data.rainProb}%`,
        'weather-uv': data.uvIndex,
        'weather-solar': `${data.solarRadiation} W/m²`
    };

    Object.entries(mapping).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) {
            el.innerText = value;
            el.classList.remove('shimmer'); // Remove loading effect if present
        }
    });
    // Update Forecast if data exists
    const forecastContainer = document.getElementById('weather-forecast');
    if (forecastContainer && data.forecast) {
        forecastContainer.innerHTML = data.forecast.map((f: any) => `
            <div class="bg-stone-50 p-2 rounded-lg text-center border border-stone-100">
                <p class="text-[10px] text-stone-400 uppercase">${f.day}</p>
                <p class="text-sm font-bold text-stone-700">${f.temp.toFixed(0)}°</p>
                <p class="text-[10px] text-blue-500">${f.prob}% ☔</p>
            </div>
        `).join('');
    }
}

// EXPOSE TO GLOBAL so weatherEngine can call it
(window as any).updateWeatherUI = updateWeatherUI;


// Example usage after your fetch finishes:
// updateWeatherUI({ temp: 24.5, wind: 3.2, humidity: 65, pressure: 1012, rainProb: 10, uvIndex: 4, solarRadiation: 650 });
// Expose to window for the HTML button
(window as any).resetGroveDatabase = resetGroveDatabase;
// Expose it to the window for the UI and Re-initialization
(window as any)._findTreasuryPDA = findTreasuryPDA;
(window as any).loadDashboard = loadDashboard;
(window as any).sellShares = sellShares;
(window as any).buyShares = buyShares;
// Add these to the very bottom of your script file
(window as any).syncSupabaseToChain = syncSupabaseToChain;
(window as any).resetGroveDatabase = resetGroveDatabase;
(window as any).updateRewardsUI = updateRewardsUI;
(window as any).updateFarmOwnership = updateFarmOwnership;
// Add to the bottom of the file containing renderActivePerks
(window as any).renderActivePerks = renderActivePerks;
(window as any).updateTierBadge = updateTierBadge;
