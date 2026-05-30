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
const RPC_URL = import.meta.env.VITE_RPC_URL || "https://api.devnet.solana.com"
console.log(`[CONNECTION] Using RPC: ${RPC_URL}`);

export const connection = new Connection(RPC_URL, "confirmed");
export const PROGRAM_ID = new PublicKey(idl.address);

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL STATE TRACKING
// ═══════════════════════════════════════════════════════════════════════════
let _program: Program | null = null;
let _provider: AnchorProvider | null = null;
let _isInitialized = false;
let _emailMode = false;
let _emailWallet: string | null = null;

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
// EMAIL AUTHENTICATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export async function connectEmail(email: string, custodialWallet: string) {
  console.log(`[EMAIL] Connecting email: ${email} with wallet: ${custodialWallet.slice(0, 8)}...`);
  
  try {
    // Create a simulated wallet for email users
    const emailWallet = {
      publicKey: new PublicKey(custodialWallet),
      signTransaction: async (tx: any) => {
        console.log("[EMAIL] Simulated transaction signing for custodial wallet");
        // In production, this would call your backend to sign
        return tx;
      },
      signAllTransactions: async (txs: any[]) => {
        console.log("[EMAIL] Simulated batch signing for custodial wallet");
        return txs;
      }
    };
    
    // Create provider with email wallet
    _provider = new AnchorProvider(connection, emailWallet as any, {
      preflightCommitment: "confirmed",
      commitment: "confirmed",
    });
    setProvider(_provider);
    
    // Initialize program
    _program = new Program(idl as any, _provider);
    
    // Set legacy exports
    provider = _provider;
    program = _program;
    
    // Set global variables
    (window as any)._program = _program;
    (window as any).program = _program;
    (window as any)._provider = _provider;
    (window as any).provider = _provider;
    (window as any).walletPubKey = custodialWallet;
    (window as any).wallet = emailWallet;
    (window as any).emailMode = true;
    
    // Store email identity
    localStorage.setItem('olivium_identity', JSON.stringify({
      type: 'email',
      address: email,
      custodialWallet: custodialWallet
    }));
    
    _emailMode = true;
    _emailWallet = custodialWallet;
    _isInitialized = true;
    
    // Initialize protocol
    await ensureProtocolInitialized();
    
    // Dispatch connection event
    window.dispatchEvent(new CustomEvent("olivium:connected", {
      detail: { email, custodialWallet, type: 'email' }
    }));
    
    console.log("✅ Email connection complete");
    return { provider: _provider, program: _program, wallet: custodialWallet, email };
    
  } catch (err) {
    console.error("❌ Email connection failed:", err);
    throw err;
  }
}

export async function disconnectEmail() {
  console.log("[EMAIL] Disconnecting email account...");
  _emailMode = false;
  _emailWallet = null;
  await disconnectWallet();
}

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
      await wallet.connect({ onlyIfTrusted: true });
    } else if (!wallet.publicKey) {
      await wallet.connect();
    }

    if (!wallet.publicKey) {
      throw new Error("Wallet connection failed - no public key");
    }

    const pubkey = wallet.publicKey.toBase58();
    console.log(`✅ Wallet connected: ${pubkey.slice(0, 8)}...`);

    localStorage.setItem("walletConnected", "true");
    localStorage.setItem('olivium_identity', JSON.stringify({
      type: 'wallet',
      wallet: pubkey,
      source: 'solana'
    }));

    _provider = new AnchorProvider(connection, wallet, {
      preflightCommitment: "confirmed",
      commitment: "confirmed",
    });
    setProvider(_provider);

    _program = new Program(idl as any, _provider);

    provider = _program.provider as AnchorProvider;
    program = _program;

    (window as any)._program = _program;
    (window as any).program = _program;
    (window as any)._provider = _provider;
    (window as any).provider = _provider;
    (window as any)._sb = sb;
    (window as any).sb = sb;
    (window as any)._connection = connection;
    (window as any).connection = connection;
    (window as any).walletPubKey = wallet.publicKey;
    (window as any).wallet = wallet;
    (window as any).emailMode = false;

    console.log("✅ All globals set");

    await ensureProtocolInitialized();

    if (typeof (window as any).updateWalletUI === "function") {
      (window as any).updateWalletUI(pubkey);
    }

    const isAdmin = pubkey === "8xkNHk2VpWBM6Nk3enitFCs7vwh2inCveTNintcXHc54";
    window.dispatchEvent(
      new CustomEvent("olivium:connected", {
        detail: { pubkey, isAdmin, type: 'wallet' },
      })
    );

    console.log("✅ Connection complete. Event dispatched.");

    _isInitialized = true;
    _emailMode = false;

    return { provider: _provider, program: _program, pubkey, isAdmin };

  } catch (err: any) {
    console.error("❌ Connection failed:", err);

    _program = null;
    _provider = null;
    _isInitialized = false;
    _emailMode = false;

    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PROTOCOL INITIALIZATION
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

    (window as any)._protocol = protocol;
    (window as any).protocol = protocol;
    (window as any).protocolPda = protocolPda;

    console.log("✅ Protocol initialized");
    return protocol;

  } catch (err) {
    console.warn("⚠️ Protocol not found on-chain");
    (window as any)._protocol = null;
    (window as any).protocol = null;
    (window as any).protocolPda = protocolPda;
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CHECK CONNECTION STATUS
// ═══════════════════════════════════════════════════════════════════════════
export function isConnected(): boolean {
  return _isInitialized && _program !== null && _provider !== null;
}

export function isEmailMode(): boolean {
  return _emailMode;
}

export function getActiveWallet(): string | null {
  if (_emailMode && _emailWallet) return _emailWallet;
  if ((window as any).walletPubKey) return (window as any).walletPubKey;
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// DISCONNECT WALLET
// ═══════════════════════════════════════════════════════════════════════════
export async function disconnectWallet() {
  console.log("🔄 Disconnecting...");

  const wallet = (window as any).phantom?.solana || (window as any).solana;
  if (wallet && typeof wallet.disconnect === "function") {
    try {
      await wallet.disconnect();
    } catch (e) {
      console.warn("Extension disconnect skipped:", e);
    }
  }

  _program = null;
  _provider = null;
  _isInitialized = false;
  _emailMode = false;
  _emailWallet = null;

  localStorage.removeItem("walletConnected");
  localStorage.removeItem("olivium_identity");
  localStorage.removeItem("olivium_user");

  (window as any)._program = null;
  (window as any)._provider = null;
  (window as any)._protocol = null;
  (window as any).walletPubKey = null;
  (window as any).emailMode = false;
  window.OliviumIdentity = { type: "guest" };

  console.log("✅ Disconnected successfully");

  window.dispatchEvent(new CustomEvent("olivium:disconnected"));

  if (typeof (window as any).resetProfileAndUI === "function") {
    await (window as any).resetProfileAndUI();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// READ-ONLY MODE INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════
async function initReadOnly() {
  if (!(window as any)._program) {
    console.log("[CONNECTION] Initializing Read-Only Program...");

    const readOnlyProvider = new AnchorProvider(connection, {} as any, {
      commitment: "confirmed",
    });

    const readOnlyProgram = new Program(idl as any, readOnlyProvider);

    (window as any)._program = readOnlyProgram;
    (window as any)._connection = connection;
    (window as any).sb = sb;
    (window as any).connectWallet = connectWallet;
    (window as any).disconnectWallet = disconnectWallet;
    (window as any).connectEmail = connectEmail;
    (window as any).disconnectEmail = disconnectEmail;
    (window as any).getActiveWallet = getActiveWallet;
    (window as any).isEmailMode = isEmailMode;
    (window as any).formatAddress = (pubkey: string) => {
      if (!pubkey) return "—";
      return pubkey.slice(0, 4) + "..." + pubkey.slice(-4);
    };
    
    console.log("✅ Read-only mode active");
  }
}

// Execute immediately on load
initReadOnly();

console.log("[connection.ts] ✅ Module loaded");
