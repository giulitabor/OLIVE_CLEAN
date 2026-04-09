/**
 * price-feeds.ts (OPTIONAL ENHANCEMENT)
 *
 * Fetches live SOL price from CoinGecko API
 * Add this to get real-time pricing instead of hardcoded values
 */

interface PriceData {
  solPrice: number;
  olvPrice: number;
  lastUpdated: Date;
}

const PRICE_CACHE: PriceData = {
  solPrice: 140.0,
  olvPrice: 0.01,
  lastUpdated: new Date(0)
};

const CACHE_DURATION_MS = 60_000; // 1 minute

/**
 * Fetch current SOL price from CoinGecko (free tier, no API key needed)
 */
async function fetchSolPrice(): Promise<number> {
  try {
    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd"
    );

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = await response.json();
    const price = data.solana?.usd;

    if (typeof price === "number") {
      console.log(`[PRICE] ✅ SOL: $${price.toFixed(2)}`);
      return price;
    }

    throw new Error("Invalid price data from API");
  } catch (err) {
    console.warn("[PRICE] ⚠️  Failed to fetch SOL price, using cached:", err);
    return PRICE_CACHE.solPrice;
  }
}

/**
 * Get OLV price (you can add Jupiter/Raydium API integration here)
 * For now, returns a hardcoded value or cached price
 */
async function fetchOlvPrice(): Promise<number> {
  // TODO: Integrate with Jupiter API or your liquidity pool
  // Example: https://price.jup.ag/v4/price?ids=YOUR_OLV_MINT

  console.log(`[PRICE] OLV: $${PRICE_CACHE.olvPrice} (hardcoded)`);
  return PRICE_CACHE.olvPrice;
}

/**
 * Fetch and cache both prices
 */
export async function refreshPrices(): Promise<PriceData> {
  const now = new Date();
  const cacheAge = now.getTime() - PRICE_CACHE.lastUpdated.getTime();

  // Return cache if still fresh
  if (cacheAge < CACHE_DURATION_MS) {
    console.log("[PRICE] Using cached prices");
    return PRICE_CACHE;
  }

  console.log("[PRICE] Fetching fresh prices...");

  const [solPrice, olvPrice] = await Promise.all([
    fetchSolPrice(),
    fetchOlvPrice()
  ]);

  PRICE_CACHE.solPrice = solPrice;
  PRICE_CACHE.olvPrice = olvPrice;
  PRICE_CACHE.lastUpdated = now;

  return PRICE_CACHE;
}

/**
 * Get cached prices (or fetch if expired)
 */
export async function getPrices(): Promise<PriceData> {
  return refreshPrices();
}

/**
 * INTEGRATION WITH refreshWalletBalances:
 *
 * Replace the hardcoded prices in your balance function:
 *
 * async function refreshWalletBalances(walletPubkey: PublicKey) {
 *   // Get live prices
 *   const { solPrice, olvPrice } = await getPrices();
 *
 *   // ... rest of your balance fetching code
 *   const solUsd = solBalance * solPrice;
 *   const olvUsd = olvBalance * olvPrice;
 * }
 */

// Expose globally
if (typeof window !== "undefined") {
  (window as any).getPrices = getPrices;
  (window as any).refreshPrices = refreshPrices;
}
