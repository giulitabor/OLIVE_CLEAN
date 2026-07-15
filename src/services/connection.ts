// src/services/connection.ts — Solana + Supabase connections

import { Connection, PublicKey } from "@solana/web3.js";
import { createClient } from "@supabase/supabase-js";

// ─── Solana ──────────────────────────────────────────────────────────

const RPC_ENDPOINT = import.meta.env.VITE_SOLANA_RPC || "https://api.devnet.solana.com";
export const connection = new Connection(RPC_ENDPOINT, "confirmed");

// ─── Supabase ────────────────────────────────────────────────────────

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const sb = createClient(supabaseUrl, supabaseKey);

// ─── Wallet State ──────────────────────────────────────────────────

let activeWallet: string | null = null;

export function getActiveWallet(): string | null {
  return activeWallet;
}

export function setActiveWallet(wallet: string | null): void {
  activeWallet = wallet;
  // Dispatch event for components to react
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('walletChanged', { detail: { wallet } }));
  }
}

// ─── Program (placeholder — replace with your actual program) ────

// This is a placeholder. Replace with your actual Anchor program.
export function getProgram() {
  // In a real implementation, you would:
  // 1. Import your IDL
  // 2. Create a Program instance with your program ID
  // 3. Return it
  throw new Error("Implement getProgram() with your actual Anchor program");
}

// ─── Wallet Connection Helpers ─────────────────────────────────────

// Connect wallet (Phantom or other)
export async function connectWallet(): Promise<string> {
  if (!window.solana) {
    throw new Error("Please install Phantom wallet");
  }

  try {
    const response = await window.solana.connect();
    const wallet = response.publicKey.toBase58();
    setActiveWallet(wallet);
    return wallet;
  } catch (error) {
    throw new Error("Failed to connect wallet");
  }
}

// Disconnect wallet
export async function disconnectWallet(): Promise<void> {
  if (window.solana?.disconnect) {
    await window.solana.disconnect();
  }
  setActiveWallet(null);
}

// Get wallet identity
export function getIdentity() {
  const wallet = getActiveWallet();
  return {
    type: wallet ? 'member' : 'guest',
    label: wallet ? wallet.slice(0, 4) + '...' + wallet.slice(-4) : 'Guest',
    wallet: wallet,
  };
}
