/**
 * connection.ts — Olivium DAO
 * ─────────────────────────────────────────────────────────────────────────────
 * SINGLE SOURCE OF TRUTH for connection state.
 *
 * Design principles applied in this rewrite:
 *  1. ONE canonical state object (`AppState`) — no scattered window globals
 *     for state; they are set FROM the state object, not the other way round.
 *  2. LOCK-based async guard — prevents two concurrent connect() calls from
 *     both "winning" and leaving the app in an inconsistent state.
 *  3. TYPED events — `olivium:connected` / `olivium:disconnected` are the only
 *     canonical events. Legacy aliases are forwarded once, not re-dispatched in
 *     a loop.
 *  4. Getters throw loudly instead of returning undefined silently, so callers
 *     fail fast at the point of misuse.
 *  5. `initReadOnly()` sets a minimal _program for guest reads without spoofing
 *     a connected state.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Connection, PublicKey }           from "@solana/web3.js";
import { AnchorProvider, Program, setProvider } from "@coral-xyz/anchor";
import idl                                 from "./SIMPLE/idl/idl.json";
import { createClient }                    from "@supabase/supabase-js";

// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE CLIENT  (stateless — never changes after init)
// ═══════════════════════════════════════════════════════════════════════════
export const sb = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ═══════════════════════════════════════════════════════════════════════════
// RPC CONNECTION  (stateless — reused for all calls)
// ═══════════════════════════════════════════════════════════════════════════
const RPC_URL = import.meta.env.VITE_RPC_URL || "https://api.devnet.solana.com";
console.log(`[CONNECTION] RPC: ${RPC_URL}`);

export const connection = new Connection(RPC_URL, "confirmed");
export const PROGRAM_ID = new PublicKey(idl.address);


// Legacy exports for backwards compatibility
export let program: Program | null = null;
export let provider: AnchorProvider | null = null;

// ═══════════════════════════════════════════════════════════════════════════
// CANONICAL APP STATE  — only mutated by the functions in this file
// ═══════════════════════════════════════════════════════════════════════════
export type IdentityType = "guest" | "wallet" | "email";

export interface AppIdentity {
  type: IdentityType;
  /** On-chain public key string (present for wallet + email modes) */
  wallet: string | null;
  /** Human-readable label: the email address for email mode, the short wallet
   *  address for wallet mode, "Guest" for guest mode. */
  label: string;
  /** Raw email address — only set in email mode */
  email: string | null;
}

interface _State {
  identity: AppIdentity;
  program: Program | null;
  provider: AnchorProvider | null;
  /** Prevent two simultaneous connect/disconnect calls */
  _connecting: boolean;
}

const _state: _State = {
  identity:   { type: "guest", wallet: null, label: "Guest", email: null },
  program:    null,
  provider:   null,
  _connecting: false,
};

// ─── internal helpers ──────────────────────────────────────────────────────

function _setIdentity(id: AppIdentity) {
  _state.identity = id;
  // Keep localStorage in sync so pages can read it on reload
  if (id.type === "guest") {
    localStorage.removeItem("olivium_identity");
  } else {
    localStorage.setItem("olivium_identity", JSON.stringify(id));
  }
  // Expose as a plain, read-only snapshot on window for legacy consumers
  (window as any).OliviumIdentity = { ...id };
}

function _exposeGlobals() {
  // Canonical globals
  (window as any)._program      = _state.program;
  (window as any).program       = _state.program;
  (window as any)._provider     = _state.provider;
  (window as any).provider      = _state.provider;
  (window as any)._sb           = sb;
  (window as any).sb            = sb;
  (window as any)._connection   = connection;
  (window as any).connection    = connection;

  // Legacy module exports
  program  = _state.program;
  provider = _state.provider;

  // Legacy wallet globals
  const rawWallet =
    (window as any).phantom?.solana ||
    (window as any).solana ||
    null;

  (window as any).wallet = rawWallet;

  (window as any).walletPubKey =
    _state.identity.wallet
      ? new PublicKey(_state.identity.wallet)
      : null;

  (window as any).emailMode =
    _state.identity.type === "email";

  (window as any).OliviumIdentity = {
    ..._state.identity
  };
}
function _dispatchConnected(detail: Record<string, unknown>) {
  window.dispatchEvent(new CustomEvent("olivium:connected", { detail }));
}

function _dispatchDisconnected() {
  window.dispatchEvent(new CustomEvent("olivium:disconnected"));
}

// ═══════════════════════════════════════════════════════════════════════════
// SAFE GETTERS
// ═══════════════════════════════════════════════════════════════════════════

export function getProgram(): Program {
  if (!_state.program) {
    throw new Error("❌ Program not initialised. Connect wallet first.");
  }
  return _state.program;
}

export function getProvider(): AnchorProvider {
  if (!_state.provider) {
    throw new Error("❌ Provider not initialised. Connect wallet first.");
  }
  return _state.provider;
}

/** Returns the canonical identity snapshot — never null */
export function getIdentity(): AppIdentity {
  return { ..._state.identity };
}

/** Returns the active on-chain wallet address string, or null if guest */
export function getActiveWallet(): string | null {
  return _state.identity.wallet;
}

export function isConnected(): boolean {
  return _state.identity.type !== "guest" && _state.program !== null;
}

export function isEmailMode(): boolean {
  return _state.identity.type === "email";
}

// ═══════════════════════════════════════════════════════════════════════════
// READ-ONLY BOOT  (safe for guests; does NOT set connected state)
// ═══════════════════════════════════════════════════════════════════════════

async function initReadOnly() {
  if ((window as any)._readOnlyInit) return;
  (window as any)._readOnlyInit = true;

  console.log("[CONNECTION] Booting read-only program...");

  // Minimal provider — wallet object intentionally empty (read-only)
  const roProvider = new AnchorProvider(connection, {} as any, {
    commitment: "confirmed",
  });
  const roProgram = new Program(idl as any, roProvider);

  // Only set the program for reading, NOT the identity or provider
  _state.program  = roProgram;
  _state.provider = roProvider;

  // Expose functions that other modules need regardless of auth state
  (window as any)._program          = roProgram;
  (window as any)._connection       = connection;
  (window as any).sb                = sb;
  (window as any)._sb               = sb;
  (window as any).connectWallet     = connectWallet;
  (window as any).disconnectWallet  = disconnectWallet;
  (window as any).connectEmail      = connectEmail;
  (window as any).disconnectEmail   = disconnectEmail;
  (window as any).getActiveWallet   = getActiveWallet;
  (window as any).getIdentity       = getIdentity;
  (window as any).isConnected       = isConnected;
  (window as any).isEmailMode       = isEmailMode;
  (window as any).formatAddress     = (pk: string) =>
    pk ? `${pk.slice(0, 4)}...${pk.slice(-4)}` : "—";

  console.log("✅ [CONNECTION] Read-only ready");
}

// ═══════════════════════════════════════════════════════════════════════════
// PROTOCOL INITIALISATION  (called after any successful connect)
// ═══════════════════════════════════════════════════════════════════════════

export async function ensureProtocolInitialized(): Promise<any> {
  const prog = getProgram();
  const [protocolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("protocol")],
    prog.programId
  );

  try {
    const protocol = await prog.account.protocolConfig.fetch(protocolPda);
    (window as any)._protocol  = protocol;
    (window as any).protocol   = protocol;
    (window as any).protocolPda = protocolPda;
    console.log("✅ Protocol loaded");
    return protocol;
  } catch {
    console.warn("⚠️ Protocol account not found on-chain");
    (window as any)._protocol   = null;
    (window as any).protocol    = null;
    (window as any).protocolPda = protocolPda;
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// WALLET CONNECT
// ═══════════════════════════════════════════════════════════════════════════

export async function connectWallet(auto = false) {
  // ── Lock guard ────────────────────────────────────────────────────────────
  if (_state._connecting) {
    console.warn("[CONNECT] Already connecting — ignoring duplicate call");
    return null;
  }
  _state._connecting = true;

  try {
    const wallet =
      (window as any).phantom?.solana || (window as any).solana;

    if (!wallet) {
      throw new Error("Phantom wallet extension not found");
    }

    // Connect / reconnect
    if (auto) {
      await wallet.connect({ onlyIfTrusted: true });
    } else if (!wallet.publicKey) {
      await wallet.connect();
    }

    if (!wallet.publicKey) {
      throw new Error("No public key returned after connect");
    }

    const pubkey = wallet.publicKey.toBase58();
    console.log(`✅ Wallet: ${pubkey.slice(0, 8)}…`);

    // Build provider + program
    const provider = new AnchorProvider(connection, wallet, {
      preflightCommitment: "confirmed",
      commitment: "confirmed",
    });
    setProvider(provider);
    const program = new Program(idl as any, provider);

    // ── Commit state atomically ───────────────────────────────────────────
    _state.provider = provider;
    _state.program  = program;
    _setIdentity({
      type:   "wallet",
      wallet: pubkey,
      label:  `${pubkey.slice(0, 4)}...${pubkey.slice(-4)}`,
      email:  null,
    });
    _exposeGlobals();

    // Protocol fetch (non-blocking for the return value)
    const isAdmin = pubkey === "8xkNHk2VpWBM6Nk3enitFCs7vwh2inCveTNintcXHc54";
    await ensureProtocolInitialized();

    if (typeof (window as any).updateWalletUI === "function") {
  try {
    (window as any).updateWalletUI(pubkey);
  } catch (err) {
    console.warn("updateWalletUI failed:", err);
  }
}
    _dispatchConnected({ pubkey, isAdmin, type: "wallet" });

    return { provider, program, pubkey, isAdmin };

  } catch (err) {
    console.error("❌ connectWallet failed:", err);
    // Do NOT call disconnect here — leave prior identity intact so a failed
    // auto-connect doesn't blow away an email-connected user.
    throw err;
  } finally {
    _state._connecting = false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EMAIL CONNECT
// ═══════════════════════════════════════════════════════════════════════════

export async function connectEmail(email: string, custodialWallet: string) {
  if (_state._connecting) {
    console.warn("[EMAIL] Already connecting — ignoring duplicate call");
    return null;
  }
  _state._connecting = true;

  try {
    console.log(`[EMAIL] Connecting ${email} → ${custodialWallet.slice(0, 8)}…`);

    const emailWalletAdapter = {
      publicKey: new PublicKey(custodialWallet),
      signTransaction:    async (tx: any) => tx,   // read-only custodial
      signAllTransactions: async (txs: any[]) => txs,
    };

    const provider = new AnchorProvider(
      connection,
      emailWalletAdapter as any,
      { preflightCommitment: "confirmed", commitment: "confirmed" }
    );
    setProvider(provider);
    const program = new Program(idl as any, provider);

    // ── Commit state atomically ───────────────────────────────────────────
    _state.provider = provider;
    _state.program  = program;
    _setIdentity({
      type:   "email",
      wallet: custodialWallet,
      label:  email,
      email,
    });
    _exposeGlobals();

    await ensureProtocolInitialized();

    _dispatchConnected({ email, custodialWallet, type: "email" });

    console.log("✅ Email connected");
    return { provider, program, wallet: custodialWallet, email };

  } catch (err) {
    console.error("❌ connectEmail failed:", err);
    throw err;
  } finally {
    _state._connecting = false;
  }
}

export async function disconnectEmail() {
  return disconnectWallet();
}

// ═══════════════════════════════════════════════════════════════════════════
// DISCONNECT
// ═══════════════════════════════════════════════════════════════════════════

export async function disconnectWallet() {
  console.log("🔄 Disconnecting…");

  // Disconnect injected wallet if present
  const rawWallet = (window as any).phantom?.solana || (window as any).solana;
  if (rawWallet?.disconnect) {
    try { await rawWallet.disconnect(); } catch { /* ignore */ }
  }

  // ── Reset state atomically ─────────────────────────────────────────────
  // Restore the shared read-only program so guest users can still read data
  const roProvider = new AnchorProvider(connection, {} as any, {
    commitment: "confirmed",
  });
  const roProgram = new Program(idl as any, roProvider);

  _state.program  = roProgram;
  _state.provider = roProvider;
  _setIdentity({ type: "guest", wallet: null, label: "Guest", email: null });

  // Clear all auth-related localStorage keys
  localStorage.removeItem("walletConnected");
  localStorage.removeItem("olivium_identity");
  localStorage.removeItem("olivium_user");

  // Update window globals
  _exposeGlobals();
  (window as any)._protocol   = null;
  (window as any).protocol    = null;
  (window as any).OliviumAuth = (window as any).OliviumAuth || {};
  if ((window as any).OliviumAuth) {
    (window as any).OliviumAuth.user = null;
  }

  console.log("✅ Disconnected");
  _dispatchDisconnected();
}

// ═══════════════════════════════════════════════════════════════════════════
// RESTORE SESSION ON PAGE LOAD
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Called once on page load. Reads localStorage to decide whether to attempt
 * an auto-reconnect (wallet trusted) or just render the cached identity for
 * email mode without re-running any connection logic.
 *
 * This is the ONLY place that reads localStorage to restore state — all other
 * modules should call getIdentity() instead.
 */
export async function restoreSession() {
  const raw = localStorage.getItem("olivium_identity");
  if (!raw) return;

  let saved: any;
  try { saved = JSON.parse(raw); } catch { return; }

  if (saved?.type === "wallet") {
    // Try silent reconnect; if the user has revoked trust this throws and we
    // leave them in guest mode (the catch in connectWallet does nothing here).
    try {
      await connectWallet(/* auto */ true);
    } catch {
      // Silent failure — wallet not trusted or extension not available.
      // Clear stale identity so the UI doesn't show a connected state.
      _setIdentity({ type: "guest", wallet: null, label: "Guest", email: null });
      localStorage.removeItem("olivium_identity");
    }
    return;
  }

  const custodialWallet =
  saved?.custodialWallet ||
  saved?.wallet;

if (saved?.type === "email" && custodialWallet) {
    // For email users the custodial wallet never changes — just restore the
    // identity without re-creating the provider (initReadOnly already set one).
    _setIdentity({
      type:   "email",
      wallet: saved.custodialWallet,
      label:  saved.address || saved.email || saved.custodialWallet,
      email:  saved.address || saved.email || null,
    });
    // Re-wire the provider to the email wallet so on-chain reads are scoped
    const emailAdapter = {
      publicKey: new PublicKey(saved.custodialWallet),
      signTransaction:    async (tx: any) => tx,
      signAllTransactions: async (txs: any[]) => txs,
    };
    const provider = new AnchorProvider(connection, emailAdapter as any, {
      commitment: "confirmed",
    });
    setProvider(provider);
    _state.provider = provider;
    _state.program  = new Program(idl as any, provider);
    _exposeGlobals();
    // Do NOT fire olivium:connected here — we are in a silent restore; the UI
    // will call updateIdentityUI() from its own DOMContentLoaded handler.
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════════════════════
(async () => {
  await initReadOnly();
  await restoreSession();
})();

console.log("[connection.ts] ✅ Module loaded");
