/**
 * dashboard-data.ts — Olivium DAO
 * Real replacements for the mock fetch* functions in the dashboard.
 * Depends on: getProgram(), getActiveWallet(), connection, sb  (from connection.ts)
 */

import { PublicKey } from "@solana/web3.js";
import { getProgram, getActiveWallet, connection, sb } from "./src/connection";

// Same mint pro.js already checks — membership tier is based on this,
// separate from on-chain tree share positions.
const OLV_TOKEN_MINT = new PublicKey(
  "6C3xwo24Tvkw6fxSK1PNLCcQsWJt7Y9seH95xMtTP8V9"
);

/* ── SOL + OLV token balance ─────────────────────────────────────────── */

export async function fetchWalletBalances() {
  const wallet = getActiveWallet();

  if (!wallet) {
    return {
      sol: 0,
      olv: 0,
    };
  }

  const pubkey = new PublicKey(wallet);

  const [solLamports, tokenAccounts] = await Promise.all([
    connection.getBalance(pubkey),
    connection.getParsedTokenAccountsByOwner(pubkey, {
      mint: OLV_TOKEN_MINT,
    }),
  ]);

  const olv =
    tokenAccounts.value[0]?.account.data.parsed.info.tokenAmount.uiAmount ??
    0;

  return {
    sol: solLamports / 1e9,
    olv,
  };
}

/* ── Share positions ───────────────────────────────────────────────────
   Uses a memcmp filter on `owner` so we only pull this wallet's accounts,
   not every SharePosition on the program.
*/

export async function fetchPositions() {
  const wallet = getActiveWallet();

  if (!wallet) return [];

  const program = getProgram();

  return program.account.sharePosition.all([
    {
      memcmp: {
        offset: 8,
        bytes: wallet,
      },
    },
  ]);
}

/* ── Trees ───────────────────────────────────────────────────────────── */

export async function fetchTrees() {
  const program = getProgram();

  return program.account.tree.all();
}

/* ── Portfolio card ──────────────────────────────────────────────────── */

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
    olvTokens: olv,
    solBalance: sol,
  };
}

/* ── On-chain entitlement: oil + carbon ─────────────────────────────── */

export async function fetchEntitlement() {
  const [positions, trees] = await Promise.all([
    fetchPositions(),
    fetchTrees(),
  ]);

  const treeById = new Map(
    trees.map((t) => [t.account.treeId, t.account])
  );

  let oilMl = 0;
  let co2Kg = 0;

  for (const pos of positions) {
    const tree = treeById.get(pos.account.treeId);

    if (!tree || Number(tree.totalShares) === 0) {
      continue;
    }

    const shareFraction =
      Number(pos.account.sharesOwned) /
      Number(tree.totalShares);

    oilMl +=
      shareFraction *
      Number(tree.lastHarvestYieldMl);

    co2Kg +=
      shareFraction *
      Number(tree.totalCo2Kg);
  }

  return {
    oilLitresEntitled: oilMl / 1000,
    carbonTonnes: co2Kg / 1000,
  };
}

/* ── Oil allocation card ────────────────────────────────────────────── */

export async function fetchOilAllocation() {
  const wallet = getActiveWallet();

  const {
    oilLitresEntitled,
    carbonTonnes,
  } = await fetchEntitlement();

  if (!wallet) {
    return {
      available: 0,
      entitled: oilLitresEntitled,
      carbonTonnes,
      pending: 0,
    };
  }

  const { data, error } = await sb
    .from("oil_transactions")
    .select("litres, status")
    .eq("wallet", wallet);

  if (error) {
    throw error;
  }

  const completed = (data ?? [])
    .filter((t) => t.status === "completed")
    .reduce(
      (sum, t) => sum + Number(t.litres),
      0
    );

  const pending = (data ?? [])
    .filter(
      (t) =>
        t.status === "pending" ||
        t.status === "processing"
    )
    .reduce(
      (sum, t) => sum + Number(t.litres),
      0
    );

  return {
    available: Math.max(
      0,
      oilLitresEntitled -
        completed -
        pending
    ),
    entitled: oilLitresEntitled,
    carbonTonnes,
    pending,
  };
}

/* ── Claim Delivery ─────────────────────────────────────────────────── */

export async function requestOilClaim(
  litres: number,
  shippingName: string,
  shippingAddress: object
) {
  const wallet = getActiveWallet();

  if (!wallet) {
    throw new Error("Connect wallet first");
  }

  const { available } =
    await fetchOilAllocation();

  if (litres > available) {
    throw new Error(
      `Only ${available.toFixed(2)}L available to claim`
    );
  }

  const { error } = await sb
    .from("oil_transactions")
    .insert({
      wallet,
      type: "claim_delivery",
      litres,
      shipping_name: shippingName,
      shipping_address: shippingAddress,
      status: "pending",
    });

  if (error) {
    throw error;
  }
}

/* ── Sell to DAO ────────────────────────────────────────────────────── */

export async function requestSellToDao(
  litres: number,
  payoutCurrency: "OLVM" | "SOL"
) {
  const wallet = getActiveWallet();

  if (!wallet) {
    throw new Error("Connect wallet first");
  }

  const { available } =
    await fetchOilAllocation();

  if (litres > available) {
    throw new Error(
      `Only ${available.toFixed(2)}L available to sell`
    );
  }

  const { error } = await sb
    .from("oil_transactions")
    .insert({
      wallet,
      type: "sell_to_dao",
      litres,
      payout_currency: payoutCurrency,
      payout_amount: null,
      status: "pending",
    });

  if (error) {
    throw error;
  }
}

/* ── Villa booking calendar ─────────────────────────────────────────── */

export async function fetchVillaAvailability(
  fromDate: string,
  toDate: string
) {
  const { data, error } = await sb
    .from("villa_nights")
    .select("night_date, status")
    .gte("night_date", fromDate)
    .lte("night_date", toDate)
    .order("night_date", {
      ascending: true,
    });

  if (error) {
    throw error;
  }

  const availableNights =
    (data ?? []).filter(
      (n) => n.status === "available"
    );

  return {
    availableNights:
      availableNights.length,

    days: availableNights.map(
      (n) => n.night_date
    ),
  };
}

/* ── Book Stay ──────────────────────────────────────────────────────── */

export async function requestVillaBooking(
  nightDates: string[],
  guestEmail: string
) {
  const wallet = getActiveWallet();

  if (!wallet) {
    throw new Error("Connect wallet first");
  }

  const {
    data: existing,
    error: checkError,
  } = await sb
    .from("villa_nights")
    .select("night_date, status")
    .in("night_date", nightDates);

  if (checkError) {
    throw checkError;
  }

  const unavailable =
    (existing ?? []).filter(
      (n) => n.status !== "available"
    );

  if (unavailable.length > 0) {
    throw new Error(
      `Nights no longer available: ${unavailable
        .map((n) => n.night_date)
        .join(", ")}`
    );
  }

  const { error } = await sb
    .from("villa_nights")
    .update({
      status: "booked",
      wallet,
      guest_email: guestEmail,
    })
    .in("night_date", nightDates);

  if (error) {
    throw error;
  }
}

/* ===================================================================== */
/* LIVE MARKET DATA                                                       */
/* ===================================================================== */

/* ── OLVM / DexScreener ─────────────────────────────────────────────── */

const OLVM_MARKET_MINT =
  "5AkvDeeV5CFaeUcLSxEcKTwBuNvWPkDe6YXhPwH9pump";

export async function fetchOlvmMarketData() {
  const url =
    `https://api.dexscreener.com/token-pairs/v1/solana/${OLVM_MARKET_MINT}`;

  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `OLVM market data request failed: ${response.status}`
    );
  }

  const pairs = await response.json();

  if (!Array.isArray(pairs) || pairs.length === 0) {
    return null;
  }

  const pair = pairs
    .filter(
      (p: any) =>
        p.chainId === "solana" &&
        p.baseToken?.address === OLVM_MARKET_MINT
    )
    .sort(
      (a: any, b: any) =>
        Number(b.liquidity?.usd ?? 0) -
        Number(a.liquidity?.usd ?? 0)
    )[0];

  if (!pair) {
    return null;
  }

  return {
    mint: OLVM_MARKET_MINT,
    symbol:
      pair.baseToken?.symbol ?? "OLVM",
    name:
      pair.baseToken?.name ?? "Olivium",
    priceUsd:
      Number(pair.priceUsd ?? 0),
    change24h:
      Number(pair.priceChange?.h24 ?? 0),
    volume24h:
      Number(pair.volume?.h24 ?? 0),
    liquidityUsd:
      Number(pair.liquidity?.usd ?? 0),
    marketCapUsd:
      Number(
        pair.marketCap ??
          pair.fdv ??
          0
      ),
    pairUrl:
      pair.url ?? null,
    pairAddress:
      pair.pairAddress ?? null,
    updatedAt:
      new Date().toISOString(),
  };
}

/* ── Carbonmark / AgroEcology Italy ─────────────────────────────────── */

const CARBONMARK_PRICES_URL =
  "https://v20.api.carbonmark.com/prices";

const CARBON_PROJECT_ID = "ICR-48";

function carbonNumber(value: any): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function fetchCarbonMarketData() {
  const response = await fetch(
    CARBONMARK_PRICES_URL,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      `Carbonmark price request failed: ${response.status}`
    );
  }

  const prices = await response.json();

  if (!Array.isArray(prices)) {
    throw new Error(
      "Carbonmark returned an unexpected response"
    );
  }

  /*
   * Carbonmark returns listings. We specifically want
   * AgroEcology Italy / ICR-48 rather than simply taking
   * the first carbon listing.
   */
  const matches = prices.filter((item: any) => {
    const projectId =
      item.listing?.creditId?.projectId ??
      item.klimaprotocol?.creditId?.projectId ??
      item.creditId?.projectId ??
      "";

    const tokenName =
      item.listing?.token?.name ??
      item.klimaprotocol?.token?.name ??
      "";

    const tokenSymbol =
      item.listing?.token?.symbol ??
      item.klimaprotocol?.token?.symbol ??
      "";

    return (
      String(projectId).toUpperCase() ===
        CARBON_PROJECT_ID ||
      /agro.?ecology/i.test(
        String(tokenName)
      ) ||
      /agro.?ecology/i.test(
        String(tokenSymbol)
      )
    );
  });

  if (matches.length === 0) {
    return null;
  }

  /*
   * Prefer a non-zero purchase price, otherwise
   * use baseUnitPrice.
   */
  const priced = matches
    .map((item: any) => {
      const purchasePrice =
        carbonNumber(
          item.purchasePrice
        );

      const baseUnitPrice =
        carbonNumber(
          item.baseUnitPrice
        );

      const price =
        purchasePrice > 0
          ? purchasePrice
          : baseUnitPrice;

      return {
        item,
        price,
      };
    })
    .filter(
      (entry: any) =>
        entry.price > 0
    )
    .sort(
      (a: any, b: any) =>
        a.price - b.price
    );

  if (priced.length === 0) {
    return null;
  }

  const selected =
    priced[0].item;

  const price =
    priced[0].price;

  const listing =
    selected.listing ?? {};

  const creditId =
    listing.creditId ??
    selected.klimaprotocol?.creditId ??
    {};

  const token =
    listing.token ??
    selected.klimaprotocol?.token ??
    {};

  return {
    projectId:
      creditId.projectId ??
      CARBON_PROJECT_ID,

    projectName:
      "AgroEcology Italy",

    symbol:
      token.symbol ??
      "ICR-48",

    vintage:
      creditId.vintage ??
      null,

    priceUsd: price,

    purchasePrice:
      carbonNumber(
        selected.purchasePrice
      ),

    baseUnitPrice:
      carbonNumber(
        selected.baseUnitPrice
      ),

    supply:
      carbonNumber(
        selected.supply
      ),

    liquidSupply:
      carbonNumber(
        selected.liquidSupply
      ),

    settlementToken:
      selected.settlementToken ??
      "usdc",

    updatedAt:
      new Date().toISOString(),
  };
}

/* ── EU Agri-Food olive oil feed ────────────────────────────────────── */

/*
 * The EU Agri-Food API does not allow browser CORS.
 *
 * Therefore dashboard.ts calls our own same-origin endpoint:
 *
 *     /api/olive-oil
 *
 * That endpoint should proxy the EU request server-side.
 *
 * Expected response can be either:
 *
 *   { price: 18.60, unit: "EUR/L", ... }
 *
 * or a raw EU API response. The parser below handles both
 * common object/array forms.
 */

const OLIVE_OIL_PROXY_URL =
  "/api/olive-oil";

function findNumericField(
  value: any,
  keys: string[]
): number | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  for (const key of keys) {
    const raw = value[key];

    if (
      raw !== undefined &&
      raw !== null &&
      raw !== ""
    ) {
      const n = Number(
        String(raw)
          .replace(",", ".")
          .replace(/[^\d.-]/g, "")
      );

      if (Number.isFinite(n)) {
        return n;
      }
    }
  }

  return null;
}

function extractOliveOilRecord(
  payload: any
): any | null {
  if (!payload) {
    return null;
  }

  if (Array.isArray(payload)) {
    if (payload.length === 0) {
      return null;
    }

    /*
     * Prefer the most recent record when the API
     * returns records in arbitrary order.
     */
    const sorted = [...payload].sort(
      (a: any, b: any) => {
        const da = new Date(
          a?.date ??
            a?.beginDate ??
            a?.endDate ??
            0
        ).getTime();

        const db = new Date(
          b?.date ??
            b?.beginDate ??
            b?.endDate ??
            0
        ).getTime();

        return db - da;
      }
    );

    return sorted[0];
  }

  if (
    Array.isArray(payload.data)
  ) {
    return extractOliveOilRecord(
      payload.data
    );
  }

  if (
    Array.isArray(payload.results)
  ) {
    return extractOliveOilRecord(
      payload.results
    );
  }

  return payload;
}

export async function fetchOliveOilMarketData() {
  const response = await fetch(
    OLIVE_OIL_PROXY_URL,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      `Olive oil price request failed: ${response.status}`
    );
  }

  const payload =
    await response.json();

  const record =
    extractOliveOilRecord(payload);

  if (!record) {
    return null;
  }

  /*
   * The proxy can already normalize the EU
   * response to { price, unit, date }.
   */
  let price =
    findNumericField(
      record,
      [
        "price",
        "priceValue",
        "value",
        "averagePrice",
        "avgPrice",
        "unitPrice",
      ]
    );

  /*
   * If the proxy returns the raw EU record,
   * look through nested values.
   */
  if (
    price === null &&
    record.data
  ) {
    price =
      findNumericField(
        record.data,
        [
          "price",
          "priceValue",
          "value",
          "averagePrice",
          "avgPrice",
          "unitPrice",
        ]
      );
  }

  if (
    price === null ||
    !Number.isFinite(price)
  ) {
    return null;
  }

  return {
    product:
      "Extra Virgin Olive Oil",

    priceEurPerLitre:
      price,

    unit:
      record.unit ??
      record.priceUnit ??
      "EUR/L",

    market:
      record.market ??
      "Alentejo Norte",

    memberState:
      record.memberState ??
      record.memberStateCode ??
      "PT",

    date:
      record.date ??
      record.beginDate ??
      record.endDate ??
      null,

    updatedAt:
      new Date().toISOString(),
  };
}

/* ── All three market feeds ─────────────────────────────────────────── */

export async function fetchLiveMarketFeeds() {
  const [
    olvmResult,
    carbonResult,
    oliveOilResult,
  ] = await Promise.allSettled([
    fetchOlvmMarketData(),
    fetchCarbonMarketData(),
    fetchOliveOilMarketData(),
  ]);

  return {
    olvm:
      olvmResult.status === "fulfilled"
        ? olvmResult.value
        : null,

    carbon:
      carbonResult.status === "fulfilled"
        ? carbonResult.value
        : null,

    oliveOil:
      oliveOilResult.status === "fulfilled"
        ? oliveOilResult.value
        : null,

    errors: {
      olvm:
        olvmResult.status === "rejected"
          ? String(
              olvmResult.reason?.message ??
                olvmResult.reason
            )
          : null,

      carbon:
        carbonResult.status === "rejected"
          ? String(
              carbonResult.reason?.message ??
                carbonResult.reason
            )
          : null,

      oliveOil:
        oliveOilResult.status === "rejected"
          ? String(
              oliveOilResult.reason?.message ??
                oliveOilResult.reason
            )
          : null,
    },

    updatedAt:
      new Date().toISOString(),
  };
}
