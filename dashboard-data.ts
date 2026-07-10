/**
 * dashboard-data.ts — Olivium DAO
 * Real replacements for the mock fetch* functions in the dashboard.
 * Depends on: getProgram(), getActiveWallet(), connection, sb  (from connection.ts)
 */

import { PublicKey } from "@solana/web3.js";
import { getProgram, getActiveWallet, connection, sb } from "./src/connection";

// Same mint pro.js already checks — membership tier is based on this,
// separate from on-chain tree share positions.
const OLV_TOKEN_MINT = new PublicKey("6C3xwo24Tvkw6fxSK1PNLCcQsWJt7Y9seH95xMtTP8V9");

/* ── SOL + OLV token balance ─────────────────────────────────────────── */

export async function fetchWalletBalances() {
  const wallet = getActiveWallet();
  if (!wallet) return { sol: 0, olv: 0 };

  const pubkey = new PublicKey(wallet);

  const [solLamports, tokenAccounts] = await Promise.all([
    connection.getBalance(pubkey),
    connection.getParsedTokenAccountsByOwner(pubkey, { mint: OLV_TOKEN_MINT }),
  ]);

  const olv = tokenAccounts.value[0]?.account.data.parsed.info.tokenAmount.uiAmount ?? 0;

  return { sol: solLamports / 1e9, olv };
}

/* ── Share positions (the "Mignole" / portfolio card) ───────────────────
   Uses a memcmp filter on `owner` so we only pull this wallet's accounts,
   not every SharePosition on the program (offset 8 = past the 8-byte
   Anchor discriminator, matching the pattern already used in loadPositions()). */

export async function fetchPositions() {
  const wallet = getActiveWallet();
  if (!wallet) return [];

  const program = getProgram();
  return program.account.sharePosition.all([
    { memcmp: { offset: 8, bytes: wallet } },
  ]);
}

/* ── Trees — needed to turn shares_owned into oil/carbon amounts.
   Fetches all trees once; for a large collection this should move to a
   getMultipleAccounts call keyed off the distinct tree_ids in the user's
   positions instead of program.account.tree.all(). Fine for now. ────── */

export async function fetchTrees() {
  const program = getProgram();
  return program.account.tree.all();
}

/* ── Portfolio card ──────────────────────────────────────────────────── 
   "Mignole" is the fractional share unit itself, so the portfolio number
   is the SUM of shares_owned across every position (all tree varieties),
   not a count of SharePosition accounts and not filtered by variety. */

export async function fetchPortfolio() {
  const [{ sol, olv }, positions] = await Promise.all([
    fetchWalletBalances(),
    fetchPositions(),
  ]);

  const mignoleUnits = positions.reduce(
    (sum, pos) => sum + Number(pos.account.sharesOwned),
    0
  );

  return {
    mignoleUnits,
    olvTokens: olv, // balance only — staking not live on-chain yet
    solBalance: sol,
  };
}

/* ── On-chain entitlement: oil + carbon, before any claim/sell ──────────
   Derived, not stored: each position's share of a tree's last harvest
   and lifetime CO2, scaled by shares_owned / total_shares. This is the
   *entitlement*; fetchOilAllocation() below nets out what's already been
   claimed or sold via the Supabase ledger. */

export async function fetchEntitlement() {
  const [positions, trees] = await Promise.all([fetchPositions(), fetchTrees()]);

  const treeById = new Map(trees.map(t => [t.account.treeId, t.account]));

  let oilMl = 0;
  let co2Kg = 0;

  for (const pos of positions) {
    const tree = treeById.get(pos.account.treeId);
    if (!tree || Number(tree.totalShares) === 0) continue;

    const shareFraction = Number(pos.account.sharesOwned) / Number(tree.totalShares);
    oilMl += shareFraction * Number(tree.lastHarvestYieldMl);
    co2Kg += shareFraction * Number(tree.totalCo2Kg);
  }

  return {
    oilLitresEntitled: oilMl / 1000,
    carbonTonnes: co2Kg / 1000, // nothing nets this out yet — carbon isn't claimable/sellable
  };
}

/* ── Oil allocation card: entitlement minus what's already fulfilled ──── */

export async function fetchOilAllocation() {
  const wallet = getActiveWallet();
  const { oilLitresEntitled, carbonTonnes } = await fetchEntitlement();

  if (!wallet) {
    return { available: 0, entitled: oilLitresEntitled, carbonTonnes, pending: 0 };
  }

  const { data, error } = await sb
    .from("oil_transactions")
    .select("litres, status")
    .eq("wallet", wallet);

  if (error) throw error;

  const completed = (data ?? [])
    .filter(t => t.status === "completed")
    .reduce((sum, t) => sum + Number(t.litres), 0);

  const pending = (data ?? [])
    .filter(t => t.status === "pending" || t.status === "processing")
    .reduce((sum, t) => sum + Number(t.litres), 0);

  return {
    available: Math.max(0, oilLitresEntitled - completed - pending),
    entitled: oilLitresEntitled,
    carbonTonnes,
    pending,
  };
}

/* ── "Claim Delivery" button → writes a pending oil_transactions row.
   Actual fulfillment (shipping) happens off this — ops flips status to
   'processing'/'completed' once the oil ships. */

export async function requestOilClaim(litres: number, shippingName: string, shippingAddress: object) {
  const wallet = getActiveWallet();
  if (!wallet) throw new Error("Connect wallet first");

  const { available } = await fetchOilAllocation();
  if (litres > available) throw new Error(`Only ${available.toFixed(2)}L available to claim`);

  const { error } = await sb.from("oil_transactions").insert({
    wallet,
    type: "claim_delivery",
    litres,
    shipping_name: shippingName,
    shipping_address: shippingAddress,
    status: "pending",
  });

  if (error) throw error;
}

/* ── "Sell to DAO" button → writes a pending oil_transactions row.
   NOTE: payout_amount needs an oil price to convert litres → OLVM/SOL.
   No price oracle/config for that exists yet in ProtocolConfig or
   Supabase — flag this back, I'm leaving payout_amount null/pending
   until there's a rate to compute it from. */

export async function requestSellToDao(litres: number, payoutCurrency: "OLVM" | "SOL") {
  const wallet = getActiveWallet();
  if (!wallet) throw new Error("Connect wallet first");

  const { available } = await fetchOilAllocation();
  if (litres > available) throw new Error(`Only ${available.toFixed(2)}L available to sell`);

  const { error } = await sb.from("oil_transactions").insert({
    wallet,
    type: "sell_to_dao",
    litres,
    payout_currency: payoutCurrency,
    payout_amount: null, // TODO: compute once a litres→currency rate exists
    status: "pending",
  });

  if (error) throw error;
}

/* ── Villa booking calendar ──────────────────────────────────────────── */

export async function fetchVillaAvailability(fromDate: string, toDate: string) {
  const { data, error } = await sb
    .from("villa_nights")
    .select("night_date, status")
    .gte("night_date", fromDate)
    .lte("night_date", toDate)
    .order("night_date", { ascending: true });

  if (error) throw error;

  const availableNights = (data ?? []).filter(n => n.status === "available");
  return {
    availableNights: availableNights.length,
    days: availableNights.map(n => n.night_date),
  };
}

/* ── "Book Stay" → marks nights as booked for this wallet.
   Runs as a single request so partial-night races are visible immediately
   rather than silently overbooking; a stricter version would do this in a
   Postgres function with a row lock instead of a plain client update. */

export async function requestVillaBooking(nightDates: string[], guestEmail: string) {
  const wallet = getActiveWallet();
  if (!wallet) throw new Error("Connect wallet first");

  const { data: existing, error: checkError } = await sb
    .from("villa_nights")
    .select("night_date, status")
    .in("night_date", nightDates);

  if (checkError) throw checkError;

  const unavailable = (existing ?? []).filter(n => n.status !== "available");
  if (unavailable.length > 0) {
    throw new Error(`Nights no longer available: ${unavailable.map(n => n.night_date).join(", ")}`);
  }

  const { error } = await sb
    .from("villa_nights")
    .update({ status: "booked", wallet, guest_email: guestEmail })
    .in("night_date", nightDates);

  if (error) throw error;
}
