import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { AnchorProvider, Program, setProvider } from "@coral-xyz/anchor";
import idl from "./SIMPLE/idl/idl.json";
import { createClient } from "@supabase/supabase-js";

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION (Use environment variables!)
// ═══════════════════════════════════════════════════════════════════════════

const RPC_URL = import.meta.env.VITE_RPC_URL || "https://api.devnet.solana.com";
const ADMIN_WALLET = import.meta.env.VITE_ADMIN_WALLET || "";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("[CONNECTION] Missing Supabase credentials!");
}

console.log(`[CONNECTION] Using RPC: ${RPC_URL}`);

// ═══════════════════════════════════════════════════════════════════════════
// CLIENTS
// ═══════════════════════════════════════════════════════════════════════════

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export const connection = new Connection(RPC_URL, "confirmed");
export const PROGRAM_ID = new PublicKey(idl.address);

// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED IDENTITY STATE MANAGER
// ═══════════════════════════════════════════════════════════════════════════

export type IdentityType = 'guest' | 'wallet' | 'email';

export interface IdentityState {
  type: IdentityType;
  walletAddress: string | null;
  email: string | null;
  isAdmin: boolean;
  lastUpdated: number;
}

let _identityState: IdentityState = {
  type: 'guest',
  walletAddress: null,
  email: null,
  isAdmin: false,
  lastUpdated: Date.now()
};

type IdentitySubscriber = (state: IdentityState) => void;
const _subscribers: Set<IdentitySubscriber> = new Set();

export function getIdentityState(): IdentityState {
  return { ..._identityState };
}

export function subscribeToIdentity(callback: IdentitySubscriber): () => void {
  _subscribers.add(callback);
  callback(getIdentityState());
  return () => _subscribers.delete(callback);
}

export function setIdentityState(newState: Partial<IdentityState>) {
  _identityState = {
    ..._identityState,
    ...newState,
    lastUpdated: Date.now()
  };
  
  localStorage.setItem('olivium_identity_v2', JSON.stringify(_identityState));
  
  _subscribers.forEach(cb => cb(getIdentityState()));
  
  window.dispatchEvent(new CustomEvent('olivium:identity:changed', {
    detail: { identity: _identityState }
  }));
}

export function resetIdentityState() {
  setIdentityState({
    type: 'guest',
    walletAddress: null,
    email: null,
    isAdmin: false
  });
}

// Load persisted state
function loadPersistedIdentity() {
  try {
    const saved = localStorage.getItem('olivium_identity_v2');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.type && parsed.lastUpdated && Date.now() - parsed.lastUpdated < 24 * 60 * 60 * 1000) {
        _identityState = parsed;
        return;
      }
    }
  } catch (e) { /* ignore */ }
  
  // Legacy migration
  try {
    const legacy = localStorage.getItem('olivium_identity');
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (parsed.type === 'wallet' && parsed.wallet) {
        _identityState = {
          type: 'wallet',
          walletAddress: parsed.wallet,
          email: null,
          isAdmin: parsed.wallet === ADMIN_WALLET,
          lastUpdated: Date.now()
        };
      } else if (parsed.type === 'email' && parsed.custodialWallet) {
        _identityState = {
          type: 'email',
          walletAddress: parsed.custodialWallet,
          email: parsed.address,
          isAdmin: false,
          lastUpdated: Date.now()
        };
      }
    }
  } catch (e) { /* ignore */ }
}

loadPersistedIdentity();

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL STATE
// ═══════════════════════════════════════════════════════════════════════════

let _program: Program | null = null;
let _provider: AnchorProvider | null = null;
let _connectionPromise: Promise<any> | null = null;

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

// ═══════════════════════════════════════════════════════════════════════════
// WALLET CONNECTION (Race-condition safe)
// ═══════════════════════════════════════════════════════════════════════════

export async function connectWallet(auto = false): Promise<{ provider: AnchorProvider; program: Program; pubkey: string; isAdmin: boolean }> {
  if (_connectionPromise) {
    console.log('[CONNECT] Waiting for existing connection...');
    return _connectionPromise;
  }

  _connectionPromise = (async () => {
    console.log(`[CONNECT] Starting wallet connection...`);

    const wallet = (window as any).phantom?.solana || (window as any).solana;

    if (!wallet) {
      throw new Error("Please install Phantom wallet");
    }

    try {
      if (auto) {
        await wallet.connect({ onlyIfTrusted: true });
      } else if (!wallet.publicKey) {
        await wallet.connect();
      }

      if (!wallet.publicKey) {
        throw new Error("Wallet connection failed");
      }

      const pubkey = wallet.publicKey.toBase58();
      console.log(`✅ Wallet connected: ${pubkey.slice(0, 8)}...`);

      const provider = new AnchorProvider(connection, wallet, {
        preflightCommitment: "confirmed",
        commitment: "confirmed",
      });
      
      const program = new Program(idl as any, provider);
      
      setProvider(provider);
      _program = program;
      _provider = provider;
      
      const isAdmin = ADMIN_WALLET ? pubkey === ADMIN_WALLET : false;
      
      setIdentityState({
        type: 'wallet',
        walletAddress: pubkey,
        email: null,
        isAdmin
      });
      
      localStorage.setItem('olivium_identity', JSON.stringify({
        type: 'wallet',
        wallet: pubkey,
        source: 'solana'
      }));
      
      // Non-blocking protocol init
      ensureProtocolInitialized().catch(console.warn);
      
      window.dispatchEvent(new CustomEvent("olivium:connected", {
        detail: { pubkey, isAdmin, type: 'wallet' }
      }));
      
      return { provider, program, pubkey, isAdmin };
      
    } catch (err: any) {
      console.error("❌ Connection failed:", err);
      resetIdentityState();
      throw err;
    } finally {
      _connectionPromise = null;
    }
  })();

  return _connectionPromise;
}

export async function disconnectWallet() {
  console.log("🔄 Disconnecting...");

  _connectionPromise = null;

  const wallet = (window as any).phantom?.solana || (window as any).solana;
  if (wallet?.disconnect) {
    try {
      await wallet.disconnect();
    } catch (e) {
      console.warn("Disconnect skipped:", e);
    }
  }

  _program = null;
  _provider = null;
  resetIdentityState();

  localStorage.removeItem("walletConnected");
  localStorage.removeItem("olivium_identity");
  localStorage.removeItem("olivium_identity_v2");

  // Clear window globals
  (window as any)._program = null;
  (window as any)._provider = null;
  (window as any).walletPubKey = null;
  (window as any).OliviumIdentity = null;

  console.log("✅ Disconnected");

  window.dispatchEvent(new CustomEvent("olivium:disconnected"));
}

// ═══════════════════════════════════════════════════════════════════════════
// PROTOCOL INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

export async function ensureProtocolInitialized(): Promise<any> {
  const prog = getProgram();
  const [protocolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("protocol")],
    prog.programId
  );

  try {
    const protocol = await prog.account.protocolConfig.fetch(protocolPda);
    (window as any)._protocol = protocol;
    return protocol;
  } catch (err) {
    console.warn("⚠️ Protocol not found on-chain");
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// READ-ONLY MODE
// ═══════════════════════════════════════════════════════════════════════════

function initReadOnly() {
  if ((window as any)._program) return;
  
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
}

initReadOnly();

console.log("[connection.ts] ✅ Module loaded");
