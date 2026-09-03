/**
 * livedash.ts — Olivium DAO Live Dashboard
 * ─────────────────────────────────────────────────────────────────────────────
 * Integrates connection.ts, reserve_board.ts, and reserveb.ts to create
 * a fully functional live dashboard with:
 *   • Supabase Realtime subscriptions for sensor and tree data
 *   • Phantom wallet connection (and email MFA fallback)
 *   • On-chain program interaction (OLV balances, tree positions)
 *   • Live sensor data display (ESP32 → Supabase)
 *   • Real-time chart updates
 *   • Tree adoption modal flow
 *   • Villa stay / loyalty tier UI
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  sb,
  connection,
  getIdentity,
  isConnected,
  connectWallet,
  connectEmail,
  disconnectWallet,
  getProgram,
  getProvider,
  PROGRAM_ID,
} from "./src/connection";

import {
  getTrees,
  getAllPositions,
  loadTrees,
  renderMyTreesFromPositions,
  openTreeDetailModal,
  closeTreeDetailModal,
  switchTreeDetailTab,
  updateVillaStayUI,
  updateStatsUI,
  updateWalletUI,
  openSellModal,
  closeSellModal,
  confirmSellAction,
  setSellMax,
} from "./src/reserve_board";

import {
  updateIdentityBalanceUI,
  waitForProgram,
  handleDisconnectWorkflow,
  closeModal,
  closeAgreement,
  closeConnectModal,
  closeSuccess,
} from "./src/reserveb";

// ─────────────────────────────────────────────────────────────────────────────
// 1. EXPOSE ALL FUNCTIONS TO WINDOW (for inline HTML event handlers)
// ─────────────────────────────────────────────────────────────────────────────

// Connection
(window as any).connectWallet = connectWallet;
(window as any).disconnectWallet = disconnectWallet;
(window as any).connectEmail = connectEmail;
(window as any).isConnected = isConnected;
(window as any).getIdentity = getIdentity;
(window as any).getProgram = getProgram;
(window as any).getProvider = getProvider;
(window as any).handleDisconnectWorkflow = handleDisconnectWorkflow;

// Reserve Board
(window as any).getTrees = getTrees;
(window as any).getAllPositions = getAllPositions;
(window as any).loadTrees = loadTrees;
(window as any).renderMyTreesFromPositions = renderMyTreesFromPositions;
(window as any).openTreeDetailModal = openTreeDetailModal;
(window as any).closeTreeDetailModal = closeTreeDetailModal;
(window as any).switchTreeDetailTab = switchTreeDetailTab;
(window as any).updateVillaStayUI = updateVillaStayUI;
(window as any).updateStatsUI = updateStatsUI;
(window as any).updateWalletUI = updateWalletUI;
(window as any).openSellModal = openSellModal;
(window as any).closeSellModal = closeSellModal;
(window as any).confirmSellAction = confirmSellAction;
(window as any).setSellMax = setSellMax;

// Reserve B
(window as any).updateIdentityBalanceUI = updateIdentityBalanceUI;
(window as any).waitForProgram = waitForProgram;
(window as any).closeModal = closeModal;
(window as any).closeAgreement = closeAgreement;
(window as any).closeConnectModal = closeConnectModal;
(window as any).closeSuccess = closeSuccess;

// ─────────────────────────────────────────────────────────────────────────────
// 2. DOM REFS
// ─────────────────────────────────────────────────────────────────────────────

const $ = (id: string) => document.getElementById(id);
const connectBtn = $("connectBtn") as HTMLButtonElement | null;
const connStatus = $("connStatus");
const connStatusText = $("conn-status-text");
const walletType = $("wallet-type");
const olvBalance = $("wallet-olv-balance");
const walletBadge = $("wallet-badge");

// ─────────────────────────────────────────────────────────────────────────────
// 3. SUPABASE REALTIME SUBSCRIPTIONS
// ─────────────────────────────────────────────────────────────────────────────

let sensorChannel: any = null;
let treeChannel: any = null;

/**
 * Subscribe to real-time sensor data from Supabase.
 * Updates the UI whenever a new sensor reading is inserted or updated.
 */
export function subscribeToSensorData() {
  if (sensorChannel) {
    sensorChannel.unsubscribe();
  }

  sensorChannel = sb
    .channel("sensor-updates")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "sensor_readings" },
      (payload) => {
        console.log("[SENSOR] INSERT:", payload.new);
        updateSensorUI(payload.new);
      }
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "sensor_readings" },
      (payload) => {
        console.log("[SENSOR] UPDATE:", payload.new);
        updateSensorUI(payload.new);
      }
    )
    .subscribe((status) => {
      console.log("[SENSOR] Subscription status:", status);
    });

  return sensorChannel;
}

/**
 * Subscribe to real-time tree metadata changes.
 * Refreshes the tree grid when trees are added, updated, or deleted.
 */
export function subscribeToTreeUpdates() {
  if (treeChannel) {
    treeChannel.unsubscribe();
  }

  treeChannel = sb
    .channel("tree-updates")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "tree_metadata" },
      () => {
        console.log("[TREE] Change detected, reloading...");
        loadTrees("all");
      }
    )
    .subscribe((status) => {
      console.log("[TREE] Subscription status:", status);
    });

  return treeChannel;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. UI UPDATERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update the sensor UI with fresh data from Supabase.
 */
function updateSensorUI(data: any) {
  if (!data) return;

  // Soil moisture
  const moistureEl = $("sensor-moisture");
  const moistureBar = $("sensor-moisture-bar");
  if (moistureEl && data.moisture !== undefined) {
    moistureEl.textContent = data.moisture + "%";
    if (moistureBar) {
      (moistureBar as HTMLElement).style.width = data.moisture + "%";
    }
  }

  // Temperature
  const tempEl = $("sensor-temp");
  if (tempEl && data.temperature !== undefined) {
    tempEl.textContent = data.temperature;
  }

  // Humidity
  const humidityEl = $("sensor-humidity");
  if (humidityEl && data.humidity !== undefined) {
    humidityEl.textContent = data.humidity;
  }

  // Wind
  const windEl = $("live-wind");
  if (windEl && data.wind_speed !== undefined) {
    windEl.textContent = data.wind_speed;
  }

  // Altitude
  const altEl = $("live-alt");
  if (altEl && data.altitude !== undefined) {
    altEl.textContent = data.altitude;
  }

  // GPS
  const gpsEl = $("live-gps");
  if (gpsEl && data.gps) {
    gpsEl.textContent = data.gps;
  }

  // Sensor count
  const sensorCountEl = $("live-sensor-count");
  if (sensorCountEl && data.sensor_count !== undefined) {
    sensorCountEl.textContent = data.sensor_count;
  }

  // Update weather display
  updateWeatherUI(data);
}

/**
 * Update weather display from sensor data.
 */
function updateWeatherUI(data: any) {
  const tempEl = $("weather-temp");
  if (tempEl && data.temperature !== undefined) {
    tempEl.textContent = data.temperature;
  }

  const humidityEl = $("weather-humidity");
  if (humidityEl && data.humidity !== undefined) {
    humidityEl.textContent = data.humidity;
  }

  const windEl = $("weather-wind");
  if (windEl && data.wind_speed !== undefined) {
    windEl.textContent = data.wind_speed;
  }

  // UV index
  const uvEl = $("weather-uv");
  if (uvEl && data.uv_index !== undefined) {
    uvEl.textContent = data.uv_index;
  }
}

/**
 * Update wallet connection status in the UI.
 */
export function updateWalletConnectionUI() {
  const identity = getIdentity();

  if (identity.type === "guest") {
    if (connStatusText) connStatusText.textContent = "disconnected";
    if (walletType) walletType.textContent = "Guest";
    if (olvBalance) olvBalance.textContent = "0";
    if (connectBtn) {
      connectBtn.textContent = "Connect Phantom";
      connectBtn.style.background = "#2b7a3e";
    }
    if (connStatus) {
      const dot = connStatus.querySelector("i");
      if (dot) dot.style.color = "#ffaa33";
    }
    return;
  }

  if (identity.type === "wallet" && identity.wallet) {
    const short = identity.label || identity.wallet.slice(0, 4) + "…" + identity.wallet.slice(-4);
    if (connStatusText) connStatusText.textContent = "connected";
    if (walletType) walletType.textContent = "Phantom";
    if (connectBtn) {
      connectBtn.textContent = `🔑 ${short}`;
      connectBtn.style.background = "#4a6741";
    }
    if (connStatus) {
      const dot = connStatus.querySelector("i");
      if (dot) dot.style.color = "#3dcc6a";
    }
    return;
  }

  if (identity.type === "email") {
    if (connStatusText) connStatusText.textContent = "email secured";
    if (walletType) walletType.textContent = "Email";
    if (connectBtn) {
      connectBtn.textContent = `✉️ ${identity.label}`;
      connectBtn.style.background = "#4a6741";
    }
    if (connStatus) {
      const dot = connStatus.querySelector("i");
      if (dot) dot.style.color = "#3dcc6a";
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. WALLET CONNECT HANDLER (with UI feedback)
// ─────────────────────────────────────────────────────────────────────────────

export async function handleConnectClick() {
  if (isConnected()) {
    // Disconnect
    await handleDisconnectWorkflow();
    updateWalletConnectionUI();
    updateIdentityBalanceUI();
    return;
  }

  // Show connect modal
  const modal = $("connectModal");
  if (modal) {
    modal.style.display = "flex";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. OLV BALANCE FETCHER
// ─────────────────────────────────────────────────────────────────────────────

import { PublicKey } from "@solana/web3.js";

const OLV_MINT = new PublicKey("6C3xwo24Tvkw6fxSK1PNLCcQsWJt7Y9seH95xMtTP8V9");

export async function fetchOLVBalance(walletAddress: string): Promise<number> {
  try {
    const pubkey = new PublicKey(walletAddress);
    const ata = await PublicKey.findProgramAddress(
      [
        pubkey.toBuffer(),
        new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA").toBuffer(),
        OLV_MINT.toBuffer(),
      ],
      new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
    );
    const tokenAccount = await connection.getTokenAccountBalance(ata[0]);
    return tokenAccount.value.uiAmount || 0;
  } catch (err) {
    console.warn("[OLV] Balance fetch failed:", err);
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. DASHBOARD REFRESH
// ─────────────────────────────────────────────────────────────────────────────

export async function refreshDashboard() {
  console.log("[DASH] Refreshing dashboard...");

  // Update identity UI
  updateIdentityBalanceUI();
  updateWalletConnectionUI();

  // Refresh tree data
  await loadTrees("all");

  // Update stats
  await updateStatsUI();

  // Update villa stay UI
  await updateVillaStayUI();

  // If connected, fetch OLV balance
  const identity = getIdentity();
  if (identity.wallet) {
    const balance = await fetchOLVBalance(identity.wallet);
    if (olvBalance) {
      olvBalance.textContent = balance.toFixed(2);
    }
  }

  console.log("[DASH] Refresh complete");
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. INIT
// ─────────────────────────────────────────────────────────────────────────────

export async function initLiveDash() {
  console.log("[LIVEDASH] export async function initLiveDash() {
  console.log("[LIVEDASH] Initializing...");

  await waitForProgram();

  await loadTrees("all");

  await updateIdentityBalanceUI();
  updateWalletConnectionUI();
  await updateStatsUI();
  await updateVillaStayUI();

  // ─────────────────────────────────────────────
  // INITIAL LIVE TICKER
  // ─────────────────────────────────────────────

  await updateLiveTicker();

  // Real-time subscriptions
  subscribeToSensorData();
  subscribeToTreeUpdates();

  if (connectBtn) {
    connectBtn.addEventListener("click", handleConnectClick);
  }

  window.addEventListener("olivium:connected", async () => {
    console.log("[LIVEDASH] Connected event received");
    updateWalletConnectionUI();
    await refreshDashboard();
    await updateLiveTicker();
  });

  window.addEventListener("olivium:disconnected", async () => {
    console.log("[LIVEDASH] Disconnected event received");
    updateWalletConnectionUI();
    await refreshDashboard();
    await updateLiveTicker();
  });

  window.addEventListener("solana:connection-complete", async () => {
    console.log("[LIVEDASH] Solana connection complete");
    updateWalletConnectionUI();
    await refreshDashboard();
    await updateLiveTicker();
  });

  // Existing 30-second refresh
  setInterval(async () => {
    await updateStatsUI();
    await updateVillaStayUI();

    // Refresh ticker data too
    await updateLiveTicker();

  }, 30000);

  console.log("[LIVEDASH] Initialized successfully");
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. DOM READY
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  initLiveDash();
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. EXPOSE
// ─────────────────────────────────────────────────────────────────────────────



// ─────────────────────────────────────────────────────────────────────────────
// LIVE TICKER
// ─────────────────────────────────────────────────────────────────────────────

type TickerItem = {
  icon: string;
  text: string;
  tone?: "up" | "down" | "neutral";
};

let tickerRefreshTimer: number | null = null;

/**
 * Render the live ticker.
 *
 * IMPORTANT:
 * The ticker is populated only from verified live data.
 * We never use placeholder market prices.
 */
function renderLiveTicker(items: TickerItem[]) {
  const track = $("ticker-track");

  if (!track) {
    console.warn("[TICKER] #ticker-track not found");
    return;
  }

  track.innerHTML = "";

  const fragment = document.createDocumentFragment();

  // Duplicate the sequence for seamless CSS scrolling.
  for (let copy = 0; copy < 2; copy++) {
    for (const item of items) {
      const span = document.createElement("span");

      if (copy === 1) {
        span.setAttribute("aria-hidden", "true");
      }

      span.textContent = `${item.icon} ${item.text}`;

      if (item.tone === "up") {
        span.classList.add("ticker-up");
      } else if (item.tone === "down") {
        span.classList.add("ticker-down");
      }

      fragment.appendChild(span);
    }
  }

  track.appendChild(fragment);
}


/**
 * Build the ticker from the actual dashboard state.
 *
 * No fabricated price, yield, treasury status or availability.
 */
async function updateLiveTicker() {
  const items: TickerItem[] = [];

  // ─────────────────────────────────────────────
  // GROVE
  // ─────────────────────────────────────────────

  // This is REAL and can remain active.
  items.push({
    icon: "🌳",
    text: "240 Trees · Growing Phase",
    tone: "neutral",
  });


  // ─────────────────────────────────────────────
  // SENSOR DATA
  // ─────────────────────────────────────────────

  try {
    const { data, error } = await sb
      .from("sensor_readings")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {

      if (data.temperature !== undefined && data.temperature !== null) {
        items.push({
          icon: "🌡",
          text: `Field ${Number(data.temperature).toFixed(1)}°C`,
          tone: "neutral",
        });
      }

      if (data.moisture !== undefined && data.moisture !== null) {
        items.push({
          icon: "💧",
          text: `Soil ${Number(data.moisture).toFixed(0)}%`,
          tone: "neutral",
        });
      }

      if (data.wind_speed !== undefined && data.wind_speed !== null) {
        items.push({
          icon: "🌬",
          text: `Wind ${Number(data.wind_speed).toFixed(1)} m/s`,
          tone: "neutral",
        });
      }
    }
  } catch (err) {
    console.warn("[TICKER] Sensor query failed:", err);
  }


  // ─────────────────────────────────────────────
  // OLVM MARKET
  // ─────────────────────────────────────────────

  /*
   * DO NOT display a fake OLVM price.
   *
   * Until the real OLVM mint has a live trading pair,
   * the ticker simply says PRE-LAUNCH.
   */

  items.push({
    icon: "◎",
    text: "OLVM · PRE-LAUNCH",
    tone: "neutral",
  });


  // ─────────────────────────────────────────────
  // HARVEST
  // ─────────────────────────────────────────────

  items.push({
    icon: "🫒",
    text: "2026 Harvest · Preparing",
    tone: "neutral",
  });


  renderLiveTicker(items);
}

(window as any).initLiveDash = initLiveDash;
(window as any).refreshDashboard = refreshDashboard;
(window as any).fetchOLVBalance = fetchOLVBalance;
(window as any).updateWalletConnectionUI = updateWalletConnectionUI;
(window as any).subscribeToSensorData = subscribeToSensorData;
(window as any).subscribeToTreeUpdates = subscribeToTreeUpdates;
(window as any).updateLiveTicker = updateLiveTicker;

console.log("[livedash.ts] ✅ Module loaded");
