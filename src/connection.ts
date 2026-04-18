import { Buffer } from 'buffer';
window.Buffer = Buffer;
import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, setProvider } from "@coral-xyz/anchor";
import idl from "./SIMPLE/idl/idl.json";
import { createClient } from "@supabase/supabase-js";

// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE CLIENT
// ═══════════════════════════════════════════════════════════════════════════
export const sb = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ═══════════════════════════════════════════════════════════════════════════
// BLOCKCHAIN CONNECTION
// ═══════════════════════════════════════════════════════════════════════════
const RPC_URL = import.meta.env.VITE_RPC_URL || "http://localhost:8899";
console.log(`[CONNECTION] Using RPC: ${RPC_URL}`);

export const connection = new Connection(RPC_URL, "confirmed");
export const PROGRAM_ID = new PublicKey(idl.address);

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL STATE TRACKING
// ═══════════════════════════════════════════════════════════════════════════
let _program: Program | null = null;
let _provider: AnchorProvider | null = null;
let _isInitialized = false;

// ═══════════════════════════════════════════════════════════════════════════
// SAFE GETTERS (Throw if not initialized)
// ═══════════════════════════════════════════════════════════════════════════
export function getProgram(): Program {
  if (!_program) {
    throw new Error("❌ Program not initialized. Connect wallet first.");
  }
  return _program;
}

export function getProvider(): AnchorProvider {
  if (!_provider) {
    throw new Error("❌ Provider not initialized. Connect wallet first.");
  }
  return _provider;
}

// Legacy exports for backwards compatibility
export let program: Program;
export let provider: AnchorProvider;

// ═══════════════════════════════════════════════════════════════════════════
// MAIN WALLET CONNECTION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════
export async function connectWallet(auto = false) {
  console.log(`[CONNECT] Starting wallet connection (auto=${auto})...`);

  // 1. Get wallet reference
  const wallet = (window as any).phantom?.solana || (window as any).solana;

  if (!wallet) {
    const errorMsg = "Please install Phantom wallet";
    console.error(`❌ ${errorMsg}`);
    throw new Error(errorMsg);
  }

  try {
    // 2. Connect wallet
    if (auto) {
      // Silent auto-connect (only if previously authorized)
      await wallet.connect({ onlyIfTrusted: true });
    } else if (!wallet.publicKey) {
      // User-initiated connection
      await wallet.connect();
    }

    // 3. Verify connection succeeded
    if (!wallet.publicKey) {
      throw new Error("Wallet connection failed - no public key");
    }

    const pubkey = wallet.publicKey.toBase58();
    console.log(`✅ Wallet connected: ${pubkey.slice(0, 8)}...`);

    // 4. Store connection state
    localStorage.setItem("walletConnected", "true");

    // 5. Create Anchor provider
    _provider = new AnchorProvider(connection, wallet, {
      preflightCommitment: "confirmed",
      commitment: "confirmed",
    });
    setProvider(_provider);

    // 6. Initialize program
    _program = new Program(idl as any, _provider);

    // 7. Set legacy exports (backwards compatibility)
    provider = _provider;
    program = _program;

    // 8. ✅ FIX: Set ALL global variables for cross-file access
    (window as any)._program = _program;
    (window as any).program = _program; // Legacy
    (window as any)._provider = _provider;
    (window as any).provider = _provider; // Legacy
    (window as any)._sb = sb;
    (window as any).sb = sb; // Legacy
    (window as any)._connection = connection;
    (window as any).connection = connection; // Legacy
    (window as any).walletPubKey = wallet.publicKey;
    (window as any).wallet = wallet;

    console.log("✅ All globals set:", {
      _program: !!_program,
      _provider: !!_provider,
      _sb: !!sb,
      walletPubKey: !!wallet.publicKey,
    });

    // 9. ✅ FIX: Initialize protocol data IMMEDIATELY
    console.log("[CONNECT] Initializing protocol...");
    await ensureProtocolInitialized();

    // 10. ✅ FIX: Update wallet UI if function exists
    if (typeof (window as any).updateWalletUI === "function") {
      (window as any).updateWalletUI(pubkey);
    }

    // 11. ✅ FIX: Dispatch connection event for listeners
    const isAdmin = pubkey === "8xkNHk2VpWBM6Nk3enitFCs7vwh2inCveTNintcXHc54";
    window.dispatchEvent(
      new CustomEvent("olivium:connected", {
        detail: { pubkey, isAdmin },
      })
    );

    console.log("✅ Connection complete. Event dispatched.");

    _isInitialized = true;

    return { provider: _provider, program: _program, pubkey, isAdmin };

  } catch (err: any) {
    console.error("❌ Connection failed:", err);

    // Clear failed state
    _program = null;
    _provider = null;
    _isInitialized = false;

    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ✅ FIX: PROTOCOL INITIALIZATION WITH ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════════════
export async function ensureProtocolInitialized(): Promise<any> {
  console.log("[PROTOCOL] Checking initialization...");

  const prog = getProgram();
  const [protocolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("protocol")],
    prog.programId
  );

  try {
    const protocol = await prog.account.protocolConfig.fetch(protocolPda);

    // ✅ FIX: Set protocol globals IMMEDIATELY
    (window as any)._protocol = protocol;
    (window as any).protocol = protocol; // Legacy
    (window as any).protocolPda = protocolPda;

    console.log("✅ Protocol initialized:", {
      authority: protocol.authority.toBase58().slice(0, 8),
      totalTrees: protocol.totalTrees,
      sharePriceLamports: protocol.sharePriceLamports.toString(),
    });

    return protocol;

  } catch (err) {
    console.warn("⚠️ Protocol not found on-chain. Run initialization first.");
    console.error(err);

    // Set to null so other code can detect uninitialized state
    (window as any)._protocol = null;
    (window as any).protocol = null;
    (window as any).protocolPda = protocolPda; // PDA still valid for init

    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ✅ NEW: CHECK IF CONNECTED
// ═══════════════════════════════════════════════════════════════════════════
export function isConnected(): boolean {
  return _isInitialized && _program !== null && _provider !== null;
}

// ═══════════════════════════════════════════════════════════════════════════
// ✅ NEW: DISCONNECT WALLET
// ═══════════════════════════════════════════════════════════════════════════
export async function disconnectWallet() {
  const wallet = (window as any).wallet;

  if (wallet?.disconnect) {
    await wallet.disconnect();
  }

  // Clear all state
  _program = null;
  _provider = null;
  _isInitialized = false;

  localStorage.removeItem("walletConnected");

  // Clear globals
  (window as any)._program = null;
  (window as any)._provider = null;
  (window as any)._protocol = null;
  (window as any).walletPubKey = null;

  console.log("✅ Disconnected successfully");

  window.dispatchEvent(new CustomEvent("olivium:disconnected"));
}

console.log("[connection.ts] ✅ Module loaded");
