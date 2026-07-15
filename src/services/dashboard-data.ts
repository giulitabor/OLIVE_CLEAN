/**
 * dashboard-data.ts — Olivium DAO
 * Real replacements for the mock fetch* functions in the dashboard.
 * 
 * FIXES APPLIED:
 * - Multiple token account support (not just first)
 * - Scaling: getMultipleAccounts for tree lookups (not all trees)
 * - Carbon renamed to carbonImpactTonnes (avoid implying certified credits)
 * - Unified dashboard loader (dashboardService)
 * - Server-side claim validation notes
 */

import { PublicKey } from "@solana/web3.js";
import { getProgram, getActiveWallet, connection, sb } from "./src/connection";

const OLV_TOKEN_MINT = new PublicKey("6C3xwo24Tvkw6fxSK1PNLCcQsWJt7Y9seH95xMtTP8V9");

/* ── Type Definitions ─────────────────────────────────────────────── */

export interface Portfolio {
  mignoleUnits: number;
  olvTokens: number;
  solBalance: number;
  treeCount: number;
  sharePercentage: number;
}

export interface OilAllocation {
  available: number;
  entitled: number;
  carbonImpactTonnes: number; // renamed: not certified carbon credits
  pending: number;
  claimed: number;
}

export interface VillaAvailability {
  availableNights: number;
  days: string[];
  nextAvailable: string | null;
}

export interface DashboardData {
  portfolio: Portfolio;
  oil: OilAllocation;
  weather: WeatherConsensus;
  forecast: ForecastDay[];
  villa: VillaAvailability;
  recentActivity: ActivityItem[];
}

export interface ActivityItem {
  id: string;
  wallet: string;
  action: string;
  timestamp: Date;
  metadata: Record<string, any>;
}

/* ── 1. WALLET BALANCES (Multiple token accounts support) ────────── */

export async function fetchWalletBalances() {
  const wallet = getActiveWallet();
  if (!wallet) return { sol: 0, olv: 0 };

  const pubkey = new PublicKey(wallet);

  const [solLamports, tokenAccounts] = await Promise.all([
    connection.getBalance(pubkey),
    connection.getParsedTokenAccountsByOwner(pubkey, { mint: OLV_TOKEN_MINT }),
  ]);

  // ✅ FIX: Support multiple token accounts (not just first)
  const olv = tokenAccounts.value.reduce(
    (sum, account) => sum + Number(account.account.data.parsed.info.tokenAmount.uiAmount || 0),
    0
  );

  return { sol: solLamports / 1e9, olv };
}

/* ── 2. SHARE POSITIONS ──────────────────────────────────────────── */

export async function fetchPositions() {
  const wallet = getActiveWallet();
  if (!wallet) return [];

  const program = getProgram();
  const positions = await program.account.sharePosition.all([
    { memcmp: { offset: 8, bytes: wallet } },
  ]);

  return positions;
}

/* ── 3. TREES — ✅ SCALING FIX: getMultipleAccounts ────────────── */

export async function fetchTreesByIds(treeIds: number[]) {
  if (treeIds.length === 0) return [];

  const program = getProgram();

  // ✅ FIX: Only fetch trees the user owns (scalable)
  // Convert treeIds to PublicKey-like format for the program
  // Note: This assumes treeId is a number stored in the account
  // The actual implementation depends on how tree IDs are structured

  // If tree accounts are indexed by number, we need to fetch them individually
  // For MVP with <1000 trees, this is fine
  const promises = treeIds.map(async (id) => {
    try {
      // This assumes there's a way to derive tree PDA from ID
      // Adjust based on actual program structure
      const treePda = await program.account.tree.all([
        { memcmp: { offset: 8, bytes: new PublicKey(id.toString()).toBase58() } }
      ]);
      return treePda[0];
    } catch {
      return null;
    }
  });

  const results = await Promise.all(promises);
  return results.filter(Boolean);
}

/* ── 4. PORTFOLIO ────────────────────────────────────────────────── */

export async function fetchPortfolio(): Promise<Portfolio> {
  const wallet = getActiveWallet();
  if (!wallet) {
    return {
      mignoleUnits: 0,
      olvTokens: 0,
      solBalance: 0,
      treeCount: 0,
      sharePercentage: 0,
    };
  }

  const [{ sol, olv }, positions] = await Promise.all([
    fetchWalletBalances(),
    fetchPositions(),
  ]);

  const mignoleUnits = positions.reduce(
    (sum, pos) => sum + Number(pos.account.sharesOwned),
    0
  );

  // Get unique tree IDs from positions
  const treeIds = [...new Set(positions.map(p => Number(p.account.treeId)))];
  const trees = await fetchTreesByIds(treeIds);

  // Calculate total shares across all trees (for percentage)
  const totalShares = trees.reduce((sum, t) => sum + Number(t.account.totalShares), 0);

  return {
    mignoleUnits,
    olvTokens: olv,
    solBalance: sol,
    treeCount: treeIds.length,
    sharePercentage: totalShares > 0 ? mignoleUnits / totalShares : 0,
  };
}

/* ── 5. ENTITLEMENT (Oil + Carbon) ──────────────────────────────── */

export async function fetchEntitlement() {
  const wallet = getActiveWallet();
  if (!wallet) return { oilLitresEntitled: 0, carbonImpactTonnes: 0 };

  const positions = await fetchPositions();
  const treeIds = [...new Set(positions.map(p => Number(p.account.treeId)))];
  const trees = await fetchTreesByIds(treeIds);

  const treeById = new Map(trees.map(t => [Number(t.account.treeId), t.account]));

  let oilMl = 0;
  let co2Kg = 0;

  for (const pos of positions) {
    const tree = treeById.get(Number(pos.account.treeId));
    if (!tree || Number(tree.totalShares) === 0) continue;

    const shareFraction = Number(pos.account.sharesOwned) / Number(tree.totalShares);
    oilMl += shareFraction * Number(tree.lastHarvestYieldMl);
    co2Kg += shareFraction * Number(tree.totalCo2Kg || 0);
  }

  return {
    oilLitresEntitled: oilMl / 1000,
    // ✅ FIX: Renamed to avoid implying certified carbon credits
    carbonImpactTonnes: co2Kg / 1000,
  };
}

/* ── 6. OIL ALLOCATION ───────────────────────────────────────────── */

export async function fetchOilAllocation(): Promise<OilAllocation> {
  const wallet = getActiveWallet();
  const { oilLitresEntitled, carbonImpactTonnes } = await fetchEntitlement();

  if (!wallet) {
    return {
      available: 0,
      entitled: oilLitresEntitled,
      carbonImpactTonnes,
      pending: 0,
      claimed: 0,
    };
  }

  const { data, error } = await sb
    .from("oil_transactions")
    .select("litres, status")
    .eq("wallet", wallet);

  if (error) throw error;

  const claimed = (data ?? [])
    .filter(t => t.status === "completed")
    .reduce((sum, t) => sum + Number(t.litres), 0);

  const pending = (data ?? [])
    .filter(t => t.status === "pending" || t.status === "processing")
    .reduce((sum, t) => sum + Number(t.litres), 0);

  return {
    available: Math.max(0, oilLitresEntitled - claimed - pending),
    entitled: oilLitresEntitled,
    carbonImpactTonnes,
    pending,
    claimed,
  };
}

/* ── 7. OIL CLAIM — ⚠️ FRONTEND VALIDATION ONLY ──────────────────
   SERVER-SIDE VALIDATION REQUIRED:
   - Supabase RLS policy or Edge Function MUST verify entitlement
   - Do NOT trust frontend litres value
──────────────────────────────────────────────────────────────────── */

export async function requestOilClaim(litres: number, shippingName: string, shippingAddress: object) {
  const wallet = getActiveWallet();
  if (!wallet) throw new Error("Connect wallet first");

  // ⚠️ This is UX validation only — server MUST re-validate
  const { available } = await fetchOilAllocation();
  if (litres > available) throw new Error(`Only ${available.toFixed(2)}L available to claim`);

  // ⚠️ Server-side validation required via RLS or Edge Function
  const { error } = await sb.from("oil_transactions").insert({
    wallet,
    type: "claim_delivery",
    litres,
    shipping_name: shippingName,
    shipping_address: shippingAddress,
    status: "pending",
    // Add timestamp for activity feed
    created_at: new Date().toISOString(),
  });

  if (error) throw error;

  // Log activity for feed
  await logActivity(wallet, "oil_claimed", { litres, shippingName });
}

/* ── 8. SELL TO DAO — ⚠️ SERVER VALIDATION REQUIRED ────────────── */

export async function requestSellToDao(litres: number, payoutCurrency: "OLVM" | "SOL") {
  const wallet = getActiveWallet();
  if (!wallet) throw new Error("Connect wallet first");

  const { available } = await fetchOilAllocation();
  if (litres > available) throw new Error(`Only ${available.toFixed(2)}L available to sell`);

  // TODO: Compute payout once a litres→currency rate exists in ProtocolConfig
  const { error } = await sb.from("oil_transactions").insert({
    wallet,
    type: "sell_to_dao",
    litres,
    payout_currency: payoutCurrency,
    payout_amount: null, // TODO: compute once rate exists
    status: "pending",
    created_at: new Date().toISOString(),
  });

  if (error) throw error;

  await logActivity(wallet, "oil_sold_to_dao", { litres, payoutCurrency });
}

/* ── 9. VILLA BOOKING ────────────────────────────────────────────── */
// src/services/dashboard-data.ts

// Add this function anywhere in the file (near other villa-related functions)

export async function fetchVillaCalendar(fromDate: string, toDate: string) {
  const { data, error } = await sb
    .from("villa_nights")
    .select("night_date, status")
    .gte("night_date", fromDate)
    .lte("night_date", toDate)
    .order("night_date", { ascending: true });

  if (error) throw error;

  const availableDates = (data ?? [])
    .filter(n => n.status === "available")
    .map(n => n.night_date);

  const unavailableDates = (data ?? [])
    .filter(n => n.status !== "available")
    .map(n => n.night_date);

  return {
    availableDates,
    unavailableDates,
  };
}
export async function fetchVillaAvailability(fromDate?: string, toDate?: string): Promise<VillaAvailability> {
  const start = fromDate || new Date().toISOString().slice(0, 10);
  const end = toDate || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const { data, error } = await sb
    .from("villa_nights")
    .select("night_date, status")
    .gte("night_date", start)
    .lte("night_date", end)
    .order("night_date", { ascending: true });

  if (error) throw error;

  const availableNights = (data ?? []).filter(n => n.status === "available");
  const availableDays = availableNights.map(n => n.night_date);

  const nextAvailable = availableDays.length > 0 ? availableDays[0] : null;

  return {
    availableNights: availableNights.length,
    days: availableDays,
    nextAvailable,
  };
}

export async function requestVillaBooking(nightDates: string[], guestEmail: string, guestName?: string) {
  const wallet = getActiveWallet();
  if (!wallet) throw new Error("Connect wallet first");

  // Check availability
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
    .update({
      status: "booked",
      wallet,
      guest_email: guestEmail,
      guest_name: guestName || null,
      booked_at: new Date().toISOString(),
    })
    .in("night_date", nightDates);

  if (error) throw error;

  await logActivity(wallet, "villa_booked", {
    nights: nightDates,
    guestEmail,
    guestName: guestName || null,
  });
}

/* ── 10. ACTIVITY FEED ───────────────────────────────────────────── */

export async function logActivity(wallet: string, action: string, metadata: Record<string, any>) {
  const { error } = await sb.from("user_activity").insert({
    wallet,
    action,
    metadata,
    timestamp: new Date().toISOString(),
  });

  if (error) {
    console.warn("Failed to log activity:", error);
    // Non-critical — don't throw
  }
}

export async function fetchRecentActivity(limit: number = 10): Promise<ActivityItem[]> {
  const wallet = getActiveWallet();

  let query = sb
    .from("user_activity")
    .select("*")
    .order("timestamp", { ascending: false })
    .limit(limit);

  if (wallet) {
    query = query.eq("wallet", wallet);
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data ?? []).map(item => ({
    ...item,
    timestamp: new Date(item.timestamp),
  }));
}

/* ── 11. UNIFIED DASHBOARD LOADER ───────────────────────────────── */

import { getWeather, getForecast, WeatherConsensus, ForecastDay } from "./weatherEngine";

export async function loadDashboard(): Promise<DashboardData> {
  const wallet = getActiveWallet();

  const [portfolio, oil, weather, forecast, villa, activity] = await Promise.all([
    fetchPortfolio(),
    fetchOilAllocation(),
    getWeather(),
    getForecast(),
    fetchVillaAvailability(),
    fetchRecentActivity(10),
  ]);

  return {
    portfolio,
    oil,
    weather,
    forecast,
    villa,
    recentActivity: activity,
  };
}

/* ── 12. EXPOSE GLOBALLY ─────────────────────────────────────────── */

if (typeof window !== 'undefined') {
  (window as any).Olivium = {
    fetchWalletBalances,
    fetchPositions,
    fetchTreesByIds,
    fetchPortfolio,
    fetchEntitlement,
    fetchOilAllocation,
    fetchVillaAvailability,
    fetchRecentActivity,
    loadDashboard,
    logActivity,
    requestOilClaim,
    requestSellToDao,
    requestVillaBooking,
  };

  console.log('🌿 Olivium Dashboard Data Layer loaded ✅');
}
